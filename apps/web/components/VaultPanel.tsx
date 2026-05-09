"use client";
import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Coins,
  Droplets,
  ExternalLink,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import axios from "axios";
import { useTradingVault } from "@/lib/useTradingVault";
import { recordDeposit } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddressBadge } from "@/components/AddressBadge";
import { useToast } from "@/lib/use-toast";
import { explorerTxUrl, formatAmount } from "@/lib/utils";

const DEV_USDC_MINT = new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

type MintOption = "SOL" | "devUSDC";

interface VaultBalances {
  pda: PublicKey;
  solBalance: number;
  devUsdcBalance: string;
}

export function VaultPanel() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const tv = useTradingVault();
  const { toast } = useToast();

  const [vault, setVault] = useState<VaultBalances | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [depositMint, setDepositMint] = useState<MintOption>("SOL");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  const [withdrawMint, setWithdrawMint] = useState<MintOption>("SOL");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const [airdropLoading, setAirdropLoading] = useState(false);

  // Pre-deploy state: program ID is the placeholder, can't construct PublicKey safely
  if (tv && !tv.programId) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Trading Vault
            </CardTitle>
            <Badge variant="warning">Not deployed</Badge>
          </div>
          <CardDescription>
            The Anchor program isn't deployed yet — vault interactions are disabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription className="space-y-2 text-sm">
              <p>
                Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">anchor deploy --provider.cluster devnet</code>{" "}
                and set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">NEXT_PUBLIC_VAULT_PROGRAM_ID</code> in{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code>.
              </p>
              <p className="text-muted-foreground">See STATUS.md in the repo root for the full setup.</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const deriveVaultPda = useCallback(
    (owner: PublicKey): PublicKey => {
      if (!tv?.programId) throw new Error("Program ID not set");
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), owner.toBuffer()],
        tv.programId
      );
      return pda;
    },
    [tv?.programId]
  );

  const fetchVaultInfo = useCallback(async () => {
    if (!wallet || !tv?.programId) return;
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const pda = deriveVaultPda(wallet.publicKey);
      const solLamports = await connection.getBalance(pda);
      const solBalance = solLamports / LAMPORTS_PER_SOL;

      let devUsdcBalance = "0";
      try {
        const ata = await getAssociatedTokenAddress(DEV_USDC_MINT, pda, true);
        const acct = await connection.getTokenAccountBalance(ata);
        devUsdcBalance = acct.value.uiAmountString ?? "0";
      } catch {
        // ATA may not exist yet
      }

      setVault({ pda, solBalance, devUsdcBalance });
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : "Failed to fetch vault info");
    } finally {
      setLoadingInfo(false);
    }
  }, [wallet, connection, deriveVaultPda, tv?.programId]);

  useEffect(() => {
    void fetchVaultInfo();
  }, [fetchVaultInfo]);

  const handleDeposit = async () => {
    if (!wallet || !tv?.program) return;
    if (!depositAmount || Number(depositAmount) <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setDepositLoading(true);
    try {
      const mint = depositMint === "SOL" ? WSOL_MINT : DEV_USDC_MINT;
      const decimals = depositMint === "SOL" ? 9 : 6;
      const amountAtomic = BigInt(Math.floor(Number(depositAmount) * 10 ** decimals));
      const pda = deriveVaultPda(wallet.publicKey);
      const userAta = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const vaultAta = await getAssociatedTokenAddress(mint, pda, true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (tv.program as any).methods
        .deposit(new BN(amountAtomic.toString()))
        .accounts({
          user: wallet.publicKey,
          vault: pda,
          mint,
          userAta,
          vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Snapshot Pyth price + record to IndexedDB for cost-basis tracking
      const oracleUrl = process.env.NEXT_PUBLIC_ORACLE_SERVICE_URL;
      let pythPriceUsd: number | null = null;
      if (oracleUrl) {
        try {
          const res = await axios.get<{ price: string }>(`${oracleUrl}/price/sol-usd`, {
            timeout: 4000,
          });
          pythPriceUsd = Number(res.data.price);
        } catch {
          // best effort
        }
      }
      await recordDeposit({
        txSig: sig,
        walletAddress: wallet.publicKey.toBase58(),
        mint: mint.toBase58(),
        amount: amountAtomic.toString(),
        pythPriceUsd,
        timestamp: Date.now(),
      }).catch(() => {
        // IDB unavailable — non-fatal
      });

      toast({
        title: "Deposit confirmed",
        description: (
          <a
            href={explorerTxUrl(sig)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            View on Explorer <ExternalLink className="h-3 w-3" />
          </a>
        ),
        variant: "success",
      });
      setDepositAmount("");
      await fetchVaultInfo();
    } catch (e) {
      toast({
        title: "Deposit failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!wallet || !tv?.program) return;
    if (!withdrawAmount || Number(withdrawAmount) <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setWithdrawLoading(true);
    try {
      const mint = withdrawMint === "SOL" ? WSOL_MINT : DEV_USDC_MINT;
      const decimals = withdrawMint === "SOL" ? 9 : 6;
      const amountAtomic = BigInt(Math.floor(Number(withdrawAmount) * 10 ** decimals));
      const pda = deriveVaultPda(wallet.publicKey);
      const userAta = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const vaultAta = await getAssociatedTokenAddress(mint, pda, true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (tv.program as any).methods
        .withdraw(new BN(amountAtomic.toString()))
        .accounts({
          user: wallet.publicKey,
          vault: pda,
          authority: pda,
          mint,
          userAta,
          vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      toast({
        title: "Withdraw confirmed",
        description: (
          <a
            href={explorerTxUrl(sig)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            View on Explorer <ExternalLink className="h-3 w-3" />
          </a>
        ),
        variant: "success",
      });
      setWithdrawAmount("");
      await fetchVaultInfo();
    } catch (e) {
      toast({
        title: "Withdraw failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleAirdrop = async () => {
    if (!wallet) return;
    setAirdropLoading(true);
    try {
      const sig = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      toast({
        title: "Airdrop confirmed",
        description: "+2 SOL added to your wallet.",
        variant: "success",
      });
      await fetchVaultInfo();
    } catch (e) {
      toast({
        title: "Airdrop failed",
        description:
          e instanceof Error
            ? `${e.message} — try the public faucet at faucet.solana.com`
            : "Try the public faucet at faucet.solana.com",
        variant: "destructive",
      });
    } finally {
      setAirdropLoading(false);
    }
  };

  const setMaxDeposit = async () => {
    if (!wallet) return;
    if (depositMint === "SOL") {
      const lamports = await connection.getBalance(wallet.publicKey);
      const sol = lamports / LAMPORTS_PER_SOL;
      const usable = Math.max(0, sol - 0.01); // reserve fees
      setDepositAmount(usable.toFixed(4));
    } else {
      try {
        const ata = await getAssociatedTokenAddress(DEV_USDC_MINT, wallet.publicKey);
        const bal = await connection.getTokenAccountBalance(ata);
        setDepositAmount(bal.value.uiAmountString ?? "0");
      } catch {
        setDepositAmount("0");
      }
    }
  };

  const setMaxWithdraw = () => {
    if (!vault) return;
    if (withdrawMint === "SOL") {
      setWithdrawAmount(vault.solBalance.toFixed(4));
    } else {
      setWithdrawAmount(vault.devUsdcBalance);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Trading Vault
          </CardTitle>
          <Badge variant="outline" className="font-mono">devnet</Badge>
        </div>
        <CardDescription>
          Your PDA-derived vault on Solana devnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vault info */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Vault address
            </Label>
            {loadingInfo && !vault ? (
              <Skeleton className="h-6 w-32" />
            ) : vault ? (
              <AddressBadge address={vault.pda.toBase58()} />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">SOL</p>
              {loadingInfo && !vault ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="font-mono text-2xl tabular-nums">
                  {vault ? formatAmount(vault.solBalance, 4) : "—"}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">devUSDC</p>
              {loadingInfo && !vault ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="font-mono text-2xl tabular-nums">
                  {vault ? formatAmount(vault.devUsdcBalance, 2) : "—"}
                </p>
              )}
            </div>
          </div>

          {infoError && (
            <Alert variant="destructive">
              <AlertDescription>{infoError}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Deposit / Withdraw */}
        <Tabs defaultValue="deposit" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposit">
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Deposit
            </TabsTrigger>
            <TabsTrigger value="withdraw">
              <ArrowUpFromLine className="mr-2 h-4 w-4" />
              Withdraw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="deposit-amount">Amount</Label>
                <div className="relative">
                  <Input
                    id="deposit-amount"
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="pr-14 font-mono tabular-nums"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={setMaxDeposit}
                    className="absolute right-1 top-1 h-7 px-2 text-xs"
                  >
                    MAX
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deposit-mint">Token</Label>
                <Select value={depositMint} onValueChange={(v: MintOption) => setDepositMint(v)}>
                  <SelectTrigger id="deposit-mint" className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="devUSDC">devUSDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleDeposit} disabled={depositLoading} className="w-full">
              {depositLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Depositing…
                </>
              ) : (
                <>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Deposit {depositMint}
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="withdraw-amount">Amount</Label>
                <div className="relative">
                  <Input
                    id="withdraw-amount"
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="pr-14 font-mono tabular-nums"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={setMaxWithdraw}
                    className="absolute right-1 top-1 h-7 px-2 text-xs"
                  >
                    MAX
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="withdraw-mint">Token</Label>
                <Select value={withdrawMint} onValueChange={(v: MintOption) => setWithdrawMint(v)}>
                  <SelectTrigger id="withdraw-mint" className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="devUSDC">devUSDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleWithdraw} disabled={withdrawLoading} variant="outline" className="w-full">
              {withdrawLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Withdrawing…
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  Withdraw {withdrawMint}
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Faucets */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Devnet faucets</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAirdrop}
              disabled={airdropLoading}
            >
              {airdropLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {airdropLoading ? "Airdropping…" : "+2 SOL"}
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a
                href="https://everlastingsong.github.io/nebula/"
                target="_blank"
                rel="noreferrer"
              >
                <Droplets className="h-3 w-3" />
                devUSDC
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <Coins className="mr-1 inline h-3 w-3" />
            Public faucet:{" "}
            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              faucet.solana.com
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
