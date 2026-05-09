"use client";
import * as React from "react";
import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressBadge } from "@/components/AddressBadge";
import { formatAmount } from "@/lib/utils";
import type { RecipientSummary } from "@/lib/analytics";

const LAMPORTS_PER_SOL = 1_000_000_000;

export interface RecipientsCardProps {
  recipients: RecipientSummary[] | null;
  loading?: boolean;
}

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function avatarSeed(address: string): string {
  return address.slice(0, 1).toUpperCase();
}

export function RecipientsCard({ recipients, loading }: RecipientsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Top recipients
        </CardTitle>
        <CardDescription>Wallets you've sent SOL to</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </>
        ) : !recipients || recipients.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No outgoing transfers yet
          </p>
        ) : (
          recipients.map((r) => (
            <div key={r.address} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-sm font-semibold">
                  {avatarSeed(r.address)}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <AddressBadge address={r.address} lead={4} tail={4} />
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {r.count} tx · {timeAgo(r.lastSentMs)}
                  </p>
                </div>
              </div>
              <p className="shrink-0 font-mono text-sm tabular-nums">
                ◎ {formatAmount(Number(r.totalLamports) / LAMPORTS_PER_SOL, 4)}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
