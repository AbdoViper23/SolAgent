"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import axios from "axios";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { ArrowLeft, RefreshCw, Loader2, Wallet } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTradingVault } from "@/lib/useTradingVault";
import { fetchHistory, type HistoryRow } from "@/lib/history";
import {
  computePnL,
  computeFees,
  computeSavings,
  groupRecipients,
  type PnL,
  type FeesSummary,
  type SavingsSummary,
  type RecipientSummary,
} from "@/lib/analytics";
import { getDeposits, getSwaps, type DepositRow, type SwapRow } from "@/lib/db";

const PnLCard = dynamic(() => import("@/components/dashboard/PnLCard").then((m) => m.PnLCard), {
  ssr: false,
});
const FeesCard = dynamic(
  () => import("@/components/dashboard/FeesCard").then((m) => m.FeesCard),
  { ssr: false }
);
const SavingsCard = dynamic(
  () => import("@/components/dashboard/SavingsCard").then((m) => m.SavingsCard),
  { ssr: false }
);
const RecipientsCard = dynamic(
  () => import("@/components/dashboard/RecipientsCard").then((m) => m.RecipientsCard),
  { ssr: false }
);
const ActivityTable = dynamic(
  () => import("@/components/dashboard/ActivityTable").then((m) => m.ActivityTable),
  { ssr: false }
);

const DEV_USDC_MINT = new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_SERVICE_URL ?? "";

export default function HistoryPage() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const tv = useTradingVault();

  const [rows, setRows] = React.useState<HistoryRow[]>([]);
  const [deposits, setDeposits] = React.useState<DepositRow[]>([]);
  const [swaps, setSwaps] = React.useState<SwapRow[]>([]);
  const [solUsd, setSolUsd] = React.useState<number>(0);
  const [solBalance, setSolBalance] = React.useState<bigint>(0n);
  const [usdcBalance, setUsdcBalance] = React.useState<bigint>(0n);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);

  const loadAll = React.useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      // Fire all reads in parallel — they're independent
      const programId = tv?.programId ?? null;

      const [history, deps, sws, priceRes] = await Promise.all([
        fetchHistory(connection, wallet.publicKey, programId, { limit: 50 }),
        getDeposits(wallet.publicKey.toBase58()).catch(() => []),
        getSwaps(wallet.publicKey.toBase58()).catch(() => []),
        ORACLE_URL
          ? axios
              .get<{ price: string }>(`${ORACLE_URL}/price/sol-usd`, { timeout: 5000 })
              .then((r) => Number(r.data.price))
              .catch(() => 0)
          : Promise.resolve(0),
      ]);

      setRows(history);
      setDeposits(deps);
      setSwaps(sws);
      setSolUsd(priceRes);
      setHasMore(history.length === 50);

      // Vault balances if program is deployed
      if (programId) {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), wallet.publicKey.toBuffer()],
          programId
        );
        const [solLamports, usdcAta] = await Promise.all([
          connection.getBalance(pda).catch(() => 0),
          getAssociatedTokenAddress(DEV_USDC_MINT, pda, true).catch(() => null),
        ]);
        setSolBalance(BigInt(solLamports));
        if (usdcAta) {
          const usdcAcct = await connection
            .getTokenAccountBalance(usdcAta)
            .catch(() => null);
          if (usdcAcct?.value?.amount) {
            setUsdcBalance(BigInt(usdcAcct.value.amount));
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [wallet, connection, tv?.programId]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadMore = React.useCallback(async () => {
    if (!wallet || rows.length === 0) return;
    setLoadingMore(true);
    try {
      const last = rows[rows.length - 1];
      const more = await fetchHistory(connection, wallet.publicKey, tv?.programId ?? null, {
        limit: 50,
        before: last.signature,
      });
      setRows((r) => [...r, ...more]);
      setHasMore(more.length === 50);
    } finally {
      setLoadingMore(false);
    }
  }, [wallet, connection, tv?.programId, rows]);

  const pnl: PnL | null = React.useMemo(() => {
    if (loading && deposits.length === 0) return null;
    return computePnL(
      deposits,
      { solLamports: solBalance, devUsdcAtomic: usdcBalance },
      solUsd
    );
  }, [deposits, solBalance, usdcBalance, solUsd, loading]);

  const fees: FeesSummary | null = React.useMemo(() => {
    if (loading && rows.length === 0) return null;
    return computeFees(rows, solUsd);
  }, [rows, solUsd, loading]);

  const savings: SavingsSummary | null = React.useMemo(() => {
    if (loading && swaps.length === 0) return null;
    return computeSavings(swaps, { currentSolUsd: solUsd });
  }, [swaps, solUsd, loading]);

  const recipients: RecipientSummary[] | null = React.useMemo(() => {
    if (loading && rows.length === 0) return null;
    return groupRecipients(rows);
  }, [rows, loading]);

  if (!wallet) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <div className="aurora-bg" />
        <Navbar />
        <main className="container mx-auto flex max-w-6xl flex-1 items-center justify-center px-4 py-12">
          <Card className="w-full max-w-md">
            <CardContent className="space-y-4 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                <Wallet className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Connect to view history</h2>
              <p className="text-sm text-muted-foreground">
                Connect your wallet on the dashboard to see your activity.
              </p>
              <Button asChild>
                <Link href="/app">
                  <ArrowLeft className="h-4 w-4" />
                  Back to dashboard
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="aurora-bg" />
      <div className="bg-grid bg-grid-fade pointer-events-none fixed inset-0 -z-10 opacity-30" />

      <Navbar />

      <main className="container mx-auto max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
            <p className="text-sm text-muted-foreground">
              Your trading history, P&amp;L, and aggregator savings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <Button onClick={loadAll} disabled={loading} size="sm" variant="outline">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PnLCard pnl={pnl} loading={loading && !pnl} />
          <SavingsCard savings={savings} loading={loading && !savings} />
          <FeesCard
            fees={fees}
            loading={loading && !fees}
            txCount={rows.length || undefined}
          />
          <Card>
            <CardContent className="flex h-full flex-col justify-center space-y-1 p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total deposited
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                ${pnl ? pnl.totalDepositedUsd.toFixed(2) : "—"}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {deposits.length} deposit{deposits.length === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityTable
              rows={rows}
              loading={loading}
              onLoadMore={loadMore}
              hasMore={hasMore}
              loadingMore={loadingMore}
            />
          </div>
          <div>
            <RecipientsCard recipients={recipients} loading={loading && !recipients} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
