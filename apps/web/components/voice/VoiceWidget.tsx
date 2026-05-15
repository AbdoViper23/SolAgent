"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { useWallet, useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import axios from "axios";
import { useTradingVault, getVaultPda } from "@/lib/useTradingVault";
import { recordDeposit } from "@/lib/db";
import { useToast } from "@/lib/use-toast";
import { ConfirmTxModal, type Proposal } from "./ConfirmTxModal";

const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_SERVICE_URL ?? "";
const SWAP_ANALYZER_URL = process.env.NEXT_PUBLIC_SWAP_ANALYZER_URL ?? "";

const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const DEV_USDC_MINT = new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");

const TOKENS: Record<string, { mint: PublicKey; decimals: number }> = {
  SOL: { mint: WSOL_MINT, decimals: 9 },
  WSOL: { mint: WSOL_MINT, decimals: 9 },
  USDC: { mint: DEV_USDC_MINT, decimals: 6 },
};

function lookupToken(symbol: string) {
  const t = TOKENS[symbol.toUpperCase()];
  if (!t) throw new Error(`unsupported_token:${symbol}`);
  return t;
}

interface PendingProposal {
  proposal: Proposal;
  resolve: (result: Record<string, unknown>) => void;
}

export function VoiceWidget() {
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const tv = useTradingVault();
  const { toast } = useToast();

  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const propose = useCallback((proposal: Proposal) => {
    return new Promise<Record<string, unknown>>((resolve) => {
      setPending({ proposal, resolve });
    });
  }, []);

  const clientTools = useMemo(() => {
    return {
      get_price: async ({ symbol }: { symbol: string }) => {
        if (!ORACLE_URL) {
          return JSON.stringify({ error: "oracle_unavailable" });
        }
        try {
          // Oracle service currently exposes /price/sol-usd; treat any other symbol as not-yet-indexed.
          const sym = (symbol ?? "SOL").toUpperCase();
          if (sym !== "SOL" && sym !== "WSOL") {
            return JSON.stringify({
              error: "symbol_not_indexed",
              detail: "Live price feed currently exposes SOL only. More feeds coming soon.",
            });
          }
          const res = await axios.get<{
            price: string;
            confidence: string;
            publishTime: number;
            stale: boolean;
          }>(`${ORACLE_URL}/price/sol-usd`, { timeout: 4_000 });
          return JSON.stringify({
            symbol: "SOL",
            priceUsd: Number(res.data.price).toFixed(2),
            confidence: res.data.confidence,
            stale: res.data.stale,
            publishTime: res.data.publishTime,
          });
        } catch (e) {
          return JSON.stringify({ error: "fetch_failed", detail: String(e) });
        }
      },

      get_quote: async ({
        inputSymbol,
        outputSymbol,
        amountIn,
      }: {
        inputSymbol: string;
        outputSymbol: string;
        amountIn: string;
      }) => {
        if (!SWAP_ANALYZER_URL) {
          return JSON.stringify({ error: "swap_analyzer_unavailable" });
        }
        try {
          const inT = lookupToken(inputSymbol);
          const outT = lookupToken(outputSymbol);
          const raw = Math.floor(Number(amountIn) * 10 ** inT.decimals).toString();
          const res = await axios.post(`${SWAP_ANALYZER_URL}/analyze`, {
            inputMint: inT.mint.toBase58(),
            outputMint: outT.mint.toBase58(),
            amountIn: raw,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = res.data as any;
          if (!data.bestRoute) {
            return JSON.stringify({ error: "no_route" });
          }
          const estOut =
            Number(data.bestRoute.estimatedOut) / 10 ** outT.decimals;
          return JSON.stringify({
            inputSymbol: inputSymbol.toUpperCase(),
            outputSymbol: outputSymbol.toUpperCase(),
            amountIn,
            estimatedOut: estOut.toFixed(outT.decimals <= 6 ? 4 : 6),
            bestPool: data.bestRoute.pool,
            routesEvaluated: data.routesEvaluated,
          });
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detail = (e as any)?.response?.data;
          return JSON.stringify({ error: "quote_failed", detail });
        }
      },

      get_vault_info: async () => {
        if (!publicKey || !tv?.programId) {
          return JSON.stringify({ error: "wallet_not_connected" });
        }
        try {
          const [pda] = getVaultPda(tv.programId, publicKey);
          const lamports = await connection.getBalance(pda);
          const solBalance = lamports / LAMPORTS_PER_SOL;
          let usdcBalance = 0;
          try {
            const ata = await getAssociatedTokenAddress(DEV_USDC_MINT, pda, true);
            const acc = await connection.getTokenAccountBalance(ata);
            usdcBalance = Number(acc.value.uiAmountString ?? "0");
          } catch {
            // ATA may not exist yet
          }
          return JSON.stringify({
            vaultPda: pda.toBase58(),
            owner: publicKey.toBase58(),
            sol: solBalance.toFixed(4),
            usdc: usdcBalance.toFixed(2),
            network: "devnet",
          });
        } catch (e) {
          return JSON.stringify({ error: "vault_info_failed", detail: String(e) });
        }
      },

      propose_deposit: async ({ symbol, amount }: { symbol: string; amount: string }) => {
        if (!publicKey) return JSON.stringify({ success: false, reason: "wallet_not_connected" });
        const result = await propose({ kind: "deposit", symbol: symbol.toUpperCase(), amount });
        return JSON.stringify(result);
      },

      propose_withdraw: async ({ symbol, amount }: { symbol: string; amount: string }) => {
        if (!publicKey) return JSON.stringify({ success: false, reason: "wallet_not_connected" });
        const result = await propose({ kind: "withdraw", symbol: symbol.toUpperCase(), amount });
        return JSON.stringify(result);
      },

      propose_swap: async ({
        inputSymbol,
        outputSymbol,
        amountIn,
      }: {
        inputSymbol: string;
        outputSymbol: string;
        amountIn: string;
      }) => {
        if (!publicKey) return JSON.stringify({ success: false, reason: "wallet_not_connected" });
        // Pre-fetch a quote so the modal has real numbers.
        let estimatedOut: string | undefined;
        let bestPool: string | undefined;
        try {
          if (SWAP_ANALYZER_URL) {
            const inT = lookupToken(inputSymbol);
            const outT = lookupToken(outputSymbol);
            const raw = Math.floor(Number(amountIn) * 10 ** inT.decimals).toString();
            const r = await axios.post(`${SWAP_ANALYZER_URL}/analyze`, {
              inputMint: inT.mint.toBase58(),
              outputMint: outT.mint.toBase58(),
              amountIn: raw,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d = r.data as any;
            if (d.bestRoute) {
              estimatedOut = (
                Number(d.bestRoute.estimatedOut) / 10 ** outT.decimals
              ).toFixed(outT.decimals <= 6 ? 4 : 6);
              bestPool = d.bestRoute.pool;
            }
          }
        } catch {
          // continue with modal even without quote
        }
        const result = await propose({
          kind: "swap",
          inputSymbol: inputSymbol.toUpperCase(),
          outputSymbol: outputSymbol.toUpperCase(),
          amountIn,
          estimatedOut,
          bestPool,
        });
        return JSON.stringify(result);
      },
    };
  }, [publicKey, connection, tv, propose]);

  const conversation = useConversation({
    clientTools,
    onConnect: () => {
      toast({ title: "Voice agent connected", variant: "success" });
    },
    onDisconnect: () => {
      toast({ title: "Voice agent disconnected" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Voice error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  const startVoice = useCallback(async () => {
    try {
      const r = await fetch("/api/elevenlabs/signed-url");
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.detail ?? data?.error ?? `HTTP ${r.status}`);
      }
      const { signedUrl } = (await r.json()) as { signedUrl: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (conversation as any).startSession({ signedUrl, connectionType: "websocket" });
    } catch (e) {
      toast({
        title: "Could not start voice",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, [conversation, toast]);

  const stopVoice = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (conversation as any).endSession?.();
  }, [conversation]);

  // Mute mic + speaker while modal is open so the agent doesn't pick up audio mid-confirmation.
  useEffect(() => {
    if (!isConnected) return;
    if (pending) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (conversation as any).setVolume?.({ volume: 0 });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (conversation as any).setVolume?.({ volume: 1 });
    }
  }, [pending, isConnected, conversation]);

  const executeProposal = useCallback(async () => {
    if (!pending) return;
    if (!wallet || !tv?.program || !tv?.programId || !publicKey) {
      pending.resolve({ success: false, reason: "wallet_not_ready" });
      setPending(null);
      return;
    }
    setBusy(true);
    try {
      const p = pending.proposal;
      if (p.kind === "deposit" || p.kind === "withdraw") {
        const t = lookupToken(p.symbol);
        const amountAtomic = BigInt(Math.floor(Number(p.amount) * 10 ** t.decimals));
        const [pda] = getVaultPda(tv.programId, publicKey);
        const userAta = await getAssociatedTokenAddress(t.mint, publicKey);
        const vaultAta = await getAssociatedTokenAddress(t.mint, pda, true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder = (tv.program as any).methods[p.kind](new BN(amountAtomic.toString()));
        const sig = await builder
          .accounts({
            user: publicKey,
            vault: pda,
            mint: t.mint,
            userAta,
            vaultAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        if (p.kind === "deposit") {
          await recordDeposit({
            txSig: sig,
            walletAddress: publicKey.toBase58(),
            mint: t.mint.toBase58(),
            amount: amountAtomic.toString(),
            pythPriceUsd: null,
            timestamp: Date.now(),
          }).catch(() => undefined);
        }

        toast({
          title: `${p.kind === "deposit" ? "Deposited" : "Withdrew"} ${p.amount} ${p.symbol}`,
          variant: "success",
        });
        pending.resolve({ success: true, txSignature: sig });
      } else {
        // swap: on-chain CPI not yet wired; surface that honestly to the agent.
        pending.resolve({
          success: false,
          reason: "swap_not_executable",
          detail:
            "On-chain swap CPI is not yet wired up in this build. The quote was fetched but the trade was not signed. Try deposit or withdraw flows.",
        });
      }
    } catch (e) {
      toast({
        title: "Transaction failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      pending.resolve({
        success: false,
        reason: "tx_failed",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [pending, wallet, tv, publicKey, toast]);

  const cancelProposal = useCallback(() => {
    if (!pending || busy) return;
    pending.resolve({ success: false, reason: "user_cancelled" });
    setPending(null);
  }, [pending, busy]);

  if (!mounted) return null;

  // Hide widget completely if wallet not connected — voice trading needs a wallet.
  if (!publicKey) return null;

  const buttonClass = (() => {
    if (isConnecting) return "bg-muted text-muted-foreground";
    if (!isConnected) return "bg-primary text-primary-foreground hover:scale-105";
    if (isSpeaking) return "bg-purple-500 text-white animate-pulse";
    return "bg-rose-500 text-white";
  })();

  return (
    <>
      <div data-tour="voice-widget" className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {isConnected && (
          <div className="rounded-full bg-card/90 backdrop-blur border border-border px-3 py-1.5 text-xs font-medium flex items-center gap-2 shadow-lg">
            {isSpeaking ? (
              <>
                <Volume2 className="h-3.5 w-3.5 text-purple-500" />
                <span>Agent speaking</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span>Listening</span>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={isConnected ? stopVoice : startVoice}
          disabled={isConnecting}
          className={`h-14 w-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 ${buttonClass}`}
          aria-label={isConnected ? "End voice conversation" : "Start voice conversation"}
        >
          {isConnecting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : isConnected ? (
            <MicOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </button>
      </div>

      <ConfirmTxModal
        proposal={pending?.proposal ?? null}
        busy={busy}
        onConfirm={executeProposal}
        onCancel={cancelProposal}
      />
    </>
  );
}
