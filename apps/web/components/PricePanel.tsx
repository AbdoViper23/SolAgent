"use client";
import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Activity,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function PricePanel() {
  const [price, setPrice] = useState<PythPrice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  const fetchPrice = useCallback(async () => {
    if (!ORACLE_URL) {
      setError("NEXT_PUBLIC_ORACLE_SERVICE_URL not set");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<PythPrice>(`${ORACLE_URL}/price/sol-usd`, {
        timeout: 5000,
      });
      setPrice(res.data);
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch price");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrice();
    const id = setInterval(fetchPrice, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchPrice]);

  const ageSec = price ? Math.floor(Date.now() / 1000 - price.publishTime) : null;
  const isStale = price?.stale || (ageSec !== null && ageSec > 60);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            SOL / USD
          </CardTitle>
          {price && !error ? (
            isStale ? (
              <Badge variant="warning" className="gap-1">
                <Clock className="h-3 w-3" />
                Stale
              </Badge>
            ) : (
              <Badge variant="success" className="gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                Live
              </Badge>
            )
          ) : null}
        </div>
        <CardDescription>Pyth-backed feed via x402 oracle service.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          {loading && !price ? (
            <Skeleton className="h-12 w-44" />
          ) : price ? (
            <p
              className={`font-mono text-4xl font-semibold tabular-nums transition-colors ${
                pulse ? "text-primary" : "text-foreground"
              }`}
            >
              ${formatAmount(price.price, 4)}
            </p>
          ) : !error ? (
            <Skeleton className="h-12 w-44" />
          ) : (
            <p className="font-mono text-4xl font-semibold text-muted-foreground">$—</p>
          )}

          {price && (
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              ± ${formatAmount(price.conf, 4)} confidence
            </p>
          )}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        ) : price ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {ageSec !== null
                ? ageSec < 60
                  ? `${ageSec}s ago`
                  : `${Math.floor(ageSec / 60)}m ago`
                : "—"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchPrice}
              disabled={loading}
              className="h-7 px-2 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Refresh
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
