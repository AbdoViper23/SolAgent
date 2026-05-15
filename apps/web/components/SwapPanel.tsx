"use client";
import * as React from "react";
import { useState, useCallback } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import axios from "axios";
import {
  ArrowUpDown,
  ChevronRight,
  Loader2,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/lib/use-toast";
import { cn, formatAmount } from "@/lib/utils";
import { TokenPicker } from "@/components/TokenPicker";
import { CRYPTO_TOKENS } from "@/lib/tokens";
import { useDemoMode } from "@/lib/demo/DemoModeContext";
import { mockActions } from "@/lib/demo/mockVaultStore";

const SWAP_ANALYZER_URL = process.env.NEXT_PUBLIC_SWAP_ANALYZER_URL ?? "";

// Demo-only price approximations. Production uses real oracle quotes.
const DEMO_RATES: Record<string, number> = {
  "SOL>USDC": 165,
  "USDC>SOL": 1 / 165,
};
function demoRate(from: string, to: string): number {
  return DEMO_RATES[`${from}>${to}`] ?? 1;
}

interface PoolQuote {
  pool: string;
  label: string;
  tickSpacing: number;
  estimatedAmountOut?: string;
  estimatedOut?: string;
  fee?: string;
  priceImpactPct?: string;
}

export function SwapPanel() {
  const wallet = useAnchorWallet();
  const { toast } = useToast();
  const { isDemoMode } = useDemoMode();

  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [inputSymbol, setInputSymbol] = useState<string>("SOL");
  const [outputSymbol, setOutputSymbol] = useState<string>("USDC");

  const [quotes, setQuotes] = useState<PoolQuote[]>([]);
  const [bestPool, setBestPool] = useState<string | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  const inputToken = CRYPTO_TOKENS[inputSymbol];
  const outputToken = CRYPTO_TOKENS[outputSymbol];
  const inputMint = inputToken.mint;
  const outputMint = outputToken.mint;
  const inputDecimals = inputToken.decimals;
  const outputDecimals = outputToken.decimals;

  const flipDirection = () => {
    setInputSymbol(outputSymbol);
    setOutputSymbol(inputSymbol);
    setQuotes([]);
    setBestPool(null);
  };

  const handleInputSymbolChange = (sym: string) => {
    if (sym === outputSymbol) {
      // chosen the same as the other side — flip them so the pair stays unique.
      setOutputSymbol(inputSymbol);
    }
    setInputSymbol(sym);
    setQuotes([]);
    setBestPool(null);
  };

  const handleOutputSymbolChange = (sym: string) => {
    if (sym === inputSymbol) {
      setInputSymbol(outputSymbol);
    }
    setOutputSymbol(sym);
    setQuotes([]);
    setBestPool(null);
  };

  const fetchQuotes = useCallback(async () => {
    if (!amountIn || Number(amountIn) <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setQuotesLoading(true);
    setQuotesError(null);
    setQuotes([]);
    setBestPool(null);

    if (isDemoMode) {
      // Synthesize plausible-looking quotes across three tick spacings.
      const rate = demoRate(inputSymbol, outputSymbol);
      const baseOut = Number(amountIn) * rate;
      const rawOut = Math.floor(baseOut * 10 ** outputDecimals);
      const variations: PoolQuote[] = [
        { pool: "demo-ts64", label: "ts64", tickSpacing: 64, estimatedOut: String(Math.floor(rawOut * 1.000)) },
        { pool: "demo-ts128", label: "ts128", tickSpacing: 128, estimatedOut: String(Math.floor(rawOut * 0.998)) },
        { pool: "demo-ts32", label: "ts32", tickSpacing: 32, estimatedOut: String(Math.floor(rawOut * 0.994)) },
      ];
      // Pretend the network exists.
      await new Promise((r) => setTimeout(r, 300));
      setQuotes(variations);
      setBestPool("demo-ts64");
      setQuotesLoading(false);
      return;
    }

    try {
      const rawAmount = Math.floor(Number(amountIn) * 10 ** inputDecimals).toString();

      if (!SWAP_ANALYZER_URL) {
        setQuotesError(
          "NEXT_PUBLIC_SWAP_ANALYZER_URL not set — start swap-analyzer-service or set the env var."
        );
        return;
      }

      const res = await axios.post<{
        routes: PoolQuote[];
        bestRoute?: { pool: string };
        error?: string;
        supportedPairs?: string[];
      }>(`${SWAP_ANALYZER_URL}/analyze`, {
        inputMint,
        outputMint,
        amountIn: rawAmount,
      });

      setQuotes(res.data.routes ?? []);
      setBestPool(res.data.bestRoute?.pool ?? null);
    } catch (e) {
      // Surface 404 unsupported_pair with the supported list so the user knows what to pick.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data;
      if (detail?.error === "unsupported_pair" && detail.supportedPairs) {
        setQuotesError(
          `Pair ${inputSymbol}/${outputSymbol} not registered. Try one of: ${detail.supportedPairs.join(", ")}`,
        );
      } else {
        setQuotesError(e instanceof Error ? e.message : "Failed to fetch quotes");
      }
    } finally {
      setQuotesLoading(false);
    }
  }, [amountIn, inputDecimals, inputMint, outputMint, inputSymbol, outputSymbol, outputDecimals, toast, isDemoMode]);

  const handleSwap = async () => {
    if (isDemoMode) {
      // Only SOL/devUSDC pair is meaningful in demo (the vault tracks only these).
      const from = inputSymbol === "SOL" ? "SOL" : "devUSDC";
      const to = outputSymbol === "SOL" ? "SOL" : "devUSDC";
      if (from === to) {
        toast({ title: "Pick different tokens", variant: "destructive" });
        return;
      }
      try {
        const rate = demoRate(inputSymbol, outputSymbol);
        const out = await mockActions.swap(from, to, Number(amountIn), rate);
        toast({
          title: "Swap confirmed (demo)",
          description: `Received ${out.toFixed(to === "SOL" ? 4 : 2)} ${to}.`,
          variant: "success",
        });
        setAmountIn("");
        setQuotes([]);
        setBestPool(null);
      } catch (e) {
        toast({
          title: "Swap failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
      return;
    }
    toast({
      title: "On-chain swap pending",
      description:
        "execute_swap CPI needs Orca tick-array PDAs wired in. Use the MCP for now or wait for the next iteration.",
    });
  };



  const formatOut = (raw?: string) => {
    if (!raw || raw === "—" || raw === "0") return raw ?? "—";
    return formatAmount(Number(raw) / 10 ** outputDecimals, outputDecimals <= 6 ? 2 : 4);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#14F195]/12 ring-1 ring-[#14F195]/30">
              <Zap className="h-4 w-4 text-[#14F195]" />
            </div>
            Swap
          </CardTitle>
          <Badge variant="outline">3 routes</Badge>
        </div>
        <CardDescription>
          Aggregated across Orca Whirlpool pools on devnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pair + amount */}
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="swap-amount">You pay</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="swap-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  className="pr-3 font-mono tabular-nums"
                  autoComplete="off"
                />
              </div>
              <TokenPicker
                value={inputSymbol}
                onChange={handleInputSymbolChange}
                exclude={outputSymbol}
              />
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={flipDirection}
              aria-label="Flip swap direction"
              className="h-8 w-8 rounded-full"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label>You receive</Label>
            <div className="flex items-center gap-2">
              <div className="flex h-10 flex-1 items-center justify-between rounded-md border border-input bg-muted/30 px-3 font-mono text-sm tabular-nums text-muted-foreground">
                <span>
                  {bestPool && quotes.length > 0
                    ? formatOut(quotes.find((q) => q.pool === bestPool)?.estimatedOut ?? quotes[0]?.estimatedOut)
                    : "—"}
                </span>
              </div>
              <TokenPicker
                value={outputSymbol}
                onChange={handleOutputSymbolChange}
                exclude={inputSymbol}
              />
            </div>
          </div>
        </div>

        {/* Slippage */}
        <div className="space-y-1.5">
          <Label htmlFor="slippage">Max slippage</Label>
          <div className="relative">
            <Input
              id="slippage"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max="50"
              placeholder="0.5"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              className="pr-8 font-mono tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <Button
          onClick={fetchQuotes}
          disabled={quotesLoading || (!wallet && !isDemoMode)}
          variant="secondary"
          className="w-full"
        >
          {quotesLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching quotes…
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4" />
              Get quotes
            </>
          )}
        </Button>

        {/* Quote list */}
        {(quotesLoading || quotes.length > 0 || quotesError) && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Routes</p>
                {bestPool && (
                  <Badge variant="success" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Best route picked
                  </Badge>
                )}
              </div>

              {quotesLoading && quotes.length === 0 && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              )}

              {quotes.map((q) => {
                const isBest = q.pool === bestPool;
                return (
                  <div
                    key={q.pool}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all",
                      isBest
                        ? "border-[#14F195]/35 bg-[#14F195]/[0.06] shadow-[0_0_14px_rgba(20,241,149,0.08)]"
                        : "border-border/60 bg-card/30 hover:border-border"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isBest && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#14F195]/20 text-[9px] font-black text-[#14F195]">
                          1
                        </div>
                      )}
                      <Badge
                        variant={isBest ? "success" : "secondary"}
                        className="font-mono text-[11px]"
                      >
                        {q.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Whirlpool</span>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-mono text-sm tabular-nums",
                        isBest && "font-semibold text-[#14F195]"
                      )}>
                        {formatOut(q.estimatedOut ?? q.estimatedAmountOut)}{" "}
                        <span className={isBest ? "text-[#14F195]/60" : "text-muted-foreground"}>{outputSymbol}</span>
                      </p>
                      {q.fee && q.fee !== "0" && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          fee {q.fee}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {quotesError && (
                <Alert variant="warning">
                  <AlertDescription className="text-xs">{quotesError}</AlertDescription>
                </Alert>
              )}
            </div>
          </>
        )}

        <Button onClick={handleSwap} disabled={!bestPool || (!wallet && !isDemoMode)} className="w-full">
          <ChevronRight className="h-4 w-4" />
          Execute Swap
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          On-chain swap costs ~400k CU (single-hop). Set compute-unit limit before sending.
        </p>
      </CardContent>
    </Card>
  );
}
