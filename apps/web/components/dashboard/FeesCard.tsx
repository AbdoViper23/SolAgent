"use client";
import * as React from "react";
import { Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount } from "@/lib/utils";
import type { FeesSummary } from "@/lib/analytics";

export interface FeesCardProps {
  fees: FeesSummary | null;
  loading?: boolean;
  txCount?: number;
}

export function FeesCard({ fees, loading, txCount }: FeesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          Fees paid
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !fees ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : fees.totalSol === 0 ? (
          <div className="space-y-1">
            <p className="font-mono text-3xl font-semibold tabular-nums text-muted-foreground">
              ◎ 0
            </p>
            <p className="text-xs text-muted-foreground">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-mono text-3xl font-semibold tabular-nums">
              ◎ {formatAmount(fees.totalSol, 6)}
            </p>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="cursor-help text-xs text-muted-foreground tabular-nums">
                    ≈ ${formatAmount(fees.totalUsd, 4)}
                    {txCount !== undefined && ` · ${txCount} txs`}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Network fees only. x402 micropayments tracked separately.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
