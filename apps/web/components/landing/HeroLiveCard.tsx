"use client";
import * as React from "react";
import axios from "axios";
import { motion, useReducedMotion } from "framer-motion";
import { Activity, AlertCircle, Clock, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAmount } from "@/lib/utils";

const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_SERVICE_URL ?? "";
const REFRESH_MS = 30_000;

interface PythPrice {
  feed: string;
  price: string;
  conf: string;
  publishTime: number;
  stale: boolean;
}

export function HeroLiveCard() {
  const reduce = useReducedMotion();
  const [price, setPrice] = React.useState<PythPrice | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pulse, setPulse] = React.useState(false);

  const fetchPrice = React.useCallback(async () => {
    if (!ORACLE_URL) {
      setError("Oracle service URL not configured");
      return;
    }
    try {
      const res = await axios.get<PythPrice>(`${ORACLE_URL}/price/sol-usd`, {
        timeout: 5000,
      });
      setPrice(res.data);
      setError(null);
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch price");
    }
  }, []);

  React.useEffect(() => {
    void fetchPrice();
    const id = setInterval(fetchPrice, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchPrice]);

  const ageSec = price
    ? Math.floor(Date.now() / 1000 - price.publishTime)
    : null;
  const isStale = price?.stale || (ageSec !== null && ageSec > 60);

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 110,
        damping: 16,
        delay: 0.45,
      }}
      className="relative w-full max-w-md"
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <div className="absolute -inset-4 bg-aurora opacity-50 blur-2xl -z-10" />

        <Card className="relative overflow-hidden border-border/60 bg-card/80 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-solana-purple to-transparent" />

          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-solana-purple/15 ring-1 ring-solana-purple/30">
                  <Activity className="h-3.5 w-3.5 text-solana-purple" />
                </div>
                <span className="text-sm font-medium">SOL / USD</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  pyth
                </span>
              </div>
              {price && !error ? (
                isStale ? (
                  <Badge variant="warning" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Stale
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 border-solana-green/30 bg-solana-green/10 font-mono text-[10px] text-solana-green"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-solana-green opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-solana-green" />
                    </span>
                    LIVE
                  </Badge>
                )
              ) : null}
            </div>

            <div className="space-y-1">
              {price ? (
                <p
                  className={`font-mono text-4xl font-semibold tabular-nums tracking-tight transition-colors ${
                    pulse ? "text-gradient" : "text-foreground"
                  }`}
                >
                  ${formatAmount(price.price, 4)}
                </p>
              ) : !error ? (
                <Skeleton className="h-11 w-44" />
              ) : (
                <p className="font-mono text-4xl font-semibold text-muted-foreground/40">
                  $—
                </p>
              )}
              {price && (
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  ± ${formatAmount(price.conf, 4)} confidence ·{" "}
                  {ageSec !== null
                    ? ageSec < 60
                      ? `${ageSec}s ago`
                      : `${Math.floor(ageSec / 60)}m ago`
                    : "—"}
                </p>
              )}
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {error}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-solana-gradient">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[11px] font-medium text-foreground/90">
                      AI agent ready
                    </p>
                    <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                      <span className="text-solana-green">$</span> claude
                      execute_swap --in SOL --out USDC --within-limits
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
