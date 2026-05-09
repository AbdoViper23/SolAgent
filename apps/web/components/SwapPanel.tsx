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

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEV_USDC_MINT = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";
const SWAP_ANALYZER_URL = process.env.NEXT_PUBLIC_SWAP_ANALYZER_URL ?? "";

const POOLS = [
  { address: "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt", label: "ts=64", tickSpacing: 64 },
  { address: "2WUgXbAmBDePCNBpCkjMj7H8SqGXDvSijQbBMuXLnDgn", label: "ts=8", tickSpacing: 8 },
  { address: "26WuWhkPzEoGMJLbcRqBhepCUB5yAFb3ZHnzYJkWbCHX", label: "Splash", tickSpacing: 0 },
];

type Direction = "SOL→USDC" | "USDC→SOL";

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

  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [direction, setDirection] = useState<Direction>("SOL→USDC");

  const [quotes, setQuotes] = useState<PoolQuote[]>([]);
  const [bestPool, setBestPool] = useState<string | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  const inputMint = direction === "SOL→USDC" ? WSOL_MINT : DEV_USDC_MINT;
  const outputMint = direction === "SOL→USDC" ? DEV_USDC_MINT : WSOL_MINT;
  const inputSymbol = direction === "SOL→USDC" ? "SOL" : "devUSDC";
  const outputSymbol = direction === "SOL→USDC" ? "devUSDC" : "SOL";

  const flipDirection = () => {
    setDirection((d) => (d === "SOL→USDC" ? "USDC→SOL" : "SOL→USDC"));
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

    try {
      const decimals = direction === "SOL→USDC" ? 9 : 6;
      const rawAmount = Math.floor(Number(amountIn) * 10 ** decimals).toString();

      if (!SWAP_ANALYZER_URL) {
        const placeholders: PoolQuote[] = POOLS.map((p) => ({
          pool: p.address,
          label: p.label,
          tickSpacing: p.tickSpacing,
          estimatedOut: "—",
        }));
        setQuotes(placeholders);
        setQuotesError(
          "NEXT_PUBLIC_SWAP_ANALYZER_URL not set — start swap-analyzer-service or set the env var."
        );
        return;
      }

      const res = await axios.post<{
        routes: PoolQuote[];
        bestRoute?: { pool: string };
      }>(`${SWAP_ANALYZER_URL}/analyze`, {
        inputMint,
        outputMint,
        amountIn: rawAmount,
      });

      setQuotes(res.data.routes ?? []);
      setBestPool(res.data.bestRoute?.pool ?? null);
    } catch (e) {
      setQuotesError(e instanceof Error ? e.message : "Failed to fetch quotes");
    } finally {
      setQuotesLoading(false);
    }
  }, [amountIn, direction, inputMint, outputMint, toast]);

  const handleSwap = () => {
    toast({
      title: "On-chain swap pending",
      description:
        "execute_swap CPI needs Orca tick-array PDAs wired in. Use the MCP for now or wait for the next iteration.",
    });
  };

  const formatOut = (raw?: string) => {
    if (!raw || raw === "—" || raw === "0") return raw ?? "—";
    const decimals = direction === "SOL→USDC" ? 6 : 9;
    return formatAmount(Number(raw) / 10 ** decimals, decimals === 6 ? 2 : 4);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Swap
          </CardTitle>
          <Badge variant="outline">3 routes</Badge>
        </div>
        <CardDescription>
          Aggregated across Orca Whirlpool pools on devnet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Direction + amount */}
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="swap-amount">You pay</Label>
              <div className="relative">
                <Input
                  id="swap-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  className="pr-20 font-mono tabular-nums"
                  autoComplete="off"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                  {inputSymbol}
                </div>
              </div>
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
            <div className="flex h-10 items-center justify-between rounded-md border border-input bg-muted/30 px-3 font-mono text-sm tabular-nums text-muted-foreground">
              <span>
                {bestPool && quotes.length > 0
                  ? formatOut(quotes.find((q) => q.pool === bestPool)?.estimatedOut ?? quotes[0]?.estimatedOut)
                  : "—"}
              </span>
              <span className="font-sans font-medium text-foreground">{outputSymbol}</span>
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
          disabled={quotesLoading || !wallet}
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
                  {POOLS.map((p) => (
                    <Skeleton key={p.address} className="h-14 w-full" />
                  ))}
                </div>
              )}

              {quotes.map((q) => {
                const isBest = q.pool === bestPool;
                return (
                  <div
                    key={q.pool}
                    className={cn(
                      "flex items-center justify-between rounded-md border bg-card/50 px-3 py-2.5 transition-colors",
                      isBest && "border-success/50 ring-1 ring-success/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={isBest ? "success" : "secondary"} className="font-mono">
                        {q.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Whirlpool</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums">
                        {formatOut(q.estimatedOut ?? q.estimatedAmountOut)}{" "}
                        <span className="text-muted-foreground">{outputSymbol}</span>
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

        <Button onClick={handleSwap} disabled={!bestPool || !wallet} className="w-full">
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
