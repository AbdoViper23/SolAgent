"use client";
import * as React from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerTxUrl, formatAmount } from "@/lib/utils";
import type { SavingsSummary } from "@/lib/analytics";

export interface SavingsCardProps {
  savings: SavingsSummary | null;
  loading?: boolean;
}

export function SavingsCard({ savings, loading }: SavingsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Aggregator saved
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading || !savings ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : savings.swapCount === 0 ? (
          <div className="space-y-1">
            <p className="font-mono text-3xl font-semibold tabular-nums text-muted-foreground">
              $0.00
            </p>
            <p className="text-xs text-muted-foreground">
              Swap to see route savings
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-mono text-3xl font-semibold tabular-nums text-success">
              +${formatAmount(savings.totalUsd, 4)}
            </p>
            {savings.bestExample ? (
              <a
                href={explorerTxUrl(savings.bestExample.txSig)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                Best swap: +${formatAmount(savings.bestExample.savedUsd, 4)}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">
                across {savings.swapCount} swap{savings.swapCount === 1 ? "" : "s"} vs 2nd-best route
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
