"use client";
import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatAmount } from "@/lib/utils";
import type { PnL } from "@/lib/analytics";

export interface PnLCardProps {
  pnl: PnL | null;
  loading?: boolean;
}

export function PnLCard({ pnl, loading }: PnLCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          P&amp;L
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !pnl ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : pnl.totalDepositedUsd <= 0 ? (
          <div className="space-y-1">
            <p className="font-mono text-3xl font-semibold tabular-nums text-muted-foreground">
              $0.00
            </p>
            <p className="text-xs text-muted-foreground">
              Deposit to start tracking
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <PnLIcon value={pnl.pnlUsd} />
              <p
                className={cn(
                  "font-mono text-3xl font-semibold tabular-nums",
                  pnl.pnlUsd > 0
                    ? "text-success"
                    : pnl.pnlUsd < 0
                    ? "text-destructive"
                    : "text-foreground"
                )}
              >
                {pnl.pnlUsd >= 0 ? "+" : ""}
                ${formatAmount(pnl.pnlUsd, 2)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              vs ${formatAmount(pnl.totalDepositedUsd, 2)} deposited
              {pnl.pnlPct !== null && (
                <span
                  className={cn(
                    "ml-2 font-semibold",
                    pnl.pnlPct > 0
                      ? "text-success"
                      : pnl.pnlPct < 0
                      ? "text-destructive"
                      : ""
                  )}
                >
                  ({pnl.pnlPct >= 0 ? "+" : ""}
                  {pnl.pnlPct.toFixed(2)}%)
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PnLIcon({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-5 w-5 text-success" />;
  if (value < 0) return <TrendingDown className="h-5 w-5 text-destructive" />;
  return <Minus className="h-5 w-5 text-muted-foreground" />;
}
