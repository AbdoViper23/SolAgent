"use client";
import * as React from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Send,
  Settings2,
  Sparkles,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { explorerTxUrl, formatAmount, shortAddress } from "@/lib/utils";
import type { HistoryRow } from "@/lib/history";
import type { TxKind } from "@/lib/db";

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface ActivityTableProps {
  rows: HistoryRow[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

type Filter = "all" | TxKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposits" },
  { value: "withdraw", label: "Withdraws" },
  { value: "swap", label: "Swaps" },
  { value: "send", label: "Sends" },
];

function timeAgo(blockTime: number | null): string {
  if (!blockTime) return "—";
  const diff = Date.now() / 1000 - blockTime;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function rowIcon(type: TxKind) {
  switch (type) {
    case "deposit":
      return <ArrowDownToLine className="h-4 w-4 text-success" />;
    case "withdraw":
      return <ArrowUpFromLine className="h-4 w-4 text-warning" />;
    case "swap":
      return <ArrowLeftRight className="h-4 w-4 text-primary" />;
    case "send":
      return <Send className="h-4 w-4 text-muted-foreground" />;
    case "init":
      return <Sparkles className="h-4 w-4 text-primary" />;
    case "config":
      return <Settings2 className="h-4 w-4 text-muted-foreground" />;
    default:
      return <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />;
  }
}

function describeRow(row: HistoryRow): { primary: string; secondary: string } {
  switch (row.type) {
    case "deposit": {
      const amount = (row.vaultIx?.args?.amount as bigint | undefined) ?? null;
      return {
        primary: amount !== null ? `Deposit ${formatAmount(Number(amount) / LAMPORTS_PER_SOL, 4)}` : "Deposit",
        secondary: "→ vault",
      };
    }
    case "withdraw": {
      const amount = (row.vaultIx?.args?.amount as bigint | undefined) ?? null;
      return {
        primary: amount !== null ? `Withdraw ${formatAmount(Number(amount) / LAMPORTS_PER_SOL, 4)}` : "Withdraw",
        secondary: "← vault",
      };
    }
    case "swap": {
      const amountIn = (row.vaultIx?.args?.amount_in as bigint | undefined) ?? null;
      return {
        primary: amountIn !== null ? `Swap ${formatAmount(Number(amountIn) / LAMPORTS_PER_SOL, 4)}` : "Swap",
        secondary: "Whirlpool CPI",
      };
    }
    case "send": {
      if (row.amountLamports !== undefined) {
        return {
          primary: `Send ◎ ${formatAmount(Number(row.amountLamports) / LAMPORTS_PER_SOL, 4)}`,
          secondary: row.recipient ? `→ ${shortAddress(row.recipient)}` : "",
        };
      }
      if (row.splAmount && row.splMint) {
        return {
          primary: `Send SPL ${row.splAmount}`,
          secondary: row.recipient ? `→ ${shortAddress(row.recipient)}` : "",
        };
      }
      return { primary: "Send", secondary: "" };
    }
    case "init":
      return { primary: "Initialize vault", secondary: "" };
    case "config":
      return { primary: "Update config", secondary: "" };
    default:
      return { primary: "Other", secondary: "" };
  }
}

export function ActivityTable({
  rows,
  loading,
  onLoadMore,
  hasMore,
  loadingMore,
}: ActivityTableProps) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const filtered = React.useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.type === filter);
  }, [rows, filter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Activity</CardTitle>
            <CardDescription>On-chain transactions for this wallet</CardDescription>
          </div>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mt-2">
          <TabsList className="grid w-full grid-cols-5">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="text-xs">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0">
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? "No activity yet" : "No matching transactions"}
            </p>
            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Make your first deposit on the Vault tab to see history here.
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((row) => {
              const { primary, secondary } = describeRow(row);
              return (
                <a
                  key={row.signature}
                  href={explorerTxUrl(row.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                    {rowIcon(row.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{primary}</p>
                      {row.err ? (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <AlertCircle className="h-2.5 w-2.5" />
                          failed
                        </Badge>
                      ) : null}
                    </div>
                    {secondary && (
                      <p className="truncate text-xs text-muted-foreground">{secondary}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {timeAgo(row.blockTime)}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                      {shortAddress(row.signature, 4, 4)}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                </a>
              );
            })}
          </div>
        )}

        {onLoadMore && hasMore && filtered.length > 0 && (
          <div className="flex justify-center border-t border-border px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-xs"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
