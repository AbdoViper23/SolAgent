import type { DepositRow, SwapRow, PoolQuoteSnapshot } from "./db";
import type { HistoryRow } from "./history";

const LAMPORTS_PER_SOL = 1_000_000_000;
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEV_USDC_MINT = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k";

export interface CurrentBalances {
  solLamports: bigint;
  devUsdcAtomic: bigint;
}

export interface PnL {
  totalDepositedUsd: number;
  currentValueUsd: number;
  pnlUsd: number;
  pnlPct: number | null;
}

export interface FeesSummary {
  totalSol: number;
  totalUsd: number;
}

export interface SavingsSummary {
  totalUsd: number;
  bestExample: { txSig: string; savedUsd: number; bestPool: string } | null;
  swapCount: number;
}

export interface RecipientSummary {
  address: string;
  totalLamports: bigint;
  count: number;
  lastSentMs: number;
}

function decimalsForMint(mint: string): number {
  if (mint === WSOL_MINT) return SOL_DECIMALS;
  if (mint === DEV_USDC_MINT) return USDC_DECIMALS;
  return 6;
}

function atomicToFloat(amount: string | bigint, decimals: number): number {
  const n = typeof amount === "bigint" ? amount : BigInt(amount);
  return Number(n) / 10 ** decimals;
}

export function computePnL(
  deposits: DepositRow[],
  current: CurrentBalances,
  currentSolUsd: number
): PnL {
  let totalDepositedUsd = 0;
  for (const d of deposits) {
    const decimals = decimalsForMint(d.mint);
    const tokenAmount = atomicToFloat(d.amount, decimals);
    const priceAtDeposit =
      d.pythPriceUsd ??
      (d.mint === DEV_USDC_MINT ? 1 : currentSolUsd);
    totalDepositedUsd += tokenAmount * priceAtDeposit;
  }

  const solValue = atomicToFloat(current.solLamports, SOL_DECIMALS) * currentSolUsd;
  const usdcValue = atomicToFloat(current.devUsdcAtomic, USDC_DECIMALS); // assume devUSDC ≈ $1
  const currentValueUsd = solValue + usdcValue;

  const pnlUsd = currentValueUsd - totalDepositedUsd;
  const pnlPct =
    totalDepositedUsd > 0.0001 ? (pnlUsd / totalDepositedUsd) * 100 : null;

  return { totalDepositedUsd, currentValueUsd, pnlUsd, pnlPct };
}

export function computeFees(rows: HistoryRow[], currentSolUsd: number): FeesSummary {
  const totalLamports = rows.reduce((sum, r) => sum + r.feeLamports, 0);
  const totalSol = totalLamports / LAMPORTS_PER_SOL;
  return { totalSol, totalUsd: totalSol * currentSolUsd };
}

interface SavingsContext {
  currentSolUsd: number;
}

function quoteUsd(mintOut: string, amountAtomic: string, ctx: SavingsContext): number {
  const decimals = decimalsForMint(mintOut);
  const tokens = atomicToFloat(amountAtomic, decimals);
  if (mintOut === DEV_USDC_MINT) return tokens; // ≈ $1
  if (mintOut === WSOL_MINT) return tokens * ctx.currentSolUsd;
  return tokens; // unknown — best effort
}

export function computeSavings(swaps: SwapRow[], ctx: SavingsContext): SavingsSummary {
  let totalUsd = 0;
  let bestExample: SavingsSummary["bestExample"] = null;

  for (const s of swaps) {
    const sortedAlts = [...s.alternatives].sort((a, b) => {
      const av = BigInt(a.estimatedOut || "0");
      const bv = BigInt(b.estimatedOut || "0");
      return bv > av ? 1 : bv < av ? -1 : 0;
    });
    if (sortedAlts.length < 2) continue;
    const bestRaw = BigInt(sortedAlts[0].estimatedOut || "0");
    const secondRaw = BigInt(sortedAlts[1].estimatedOut || "0");
    if (bestRaw <= secondRaw) continue;
    const savedAtomic = (bestRaw - secondRaw).toString();
    const savedUsd = quoteUsd(s.outputMint, savedAtomic, ctx);
    totalUsd += savedUsd;
    if (!bestExample || savedUsd > bestExample.savedUsd) {
      bestExample = { txSig: s.txSig, savedUsd, bestPool: s.bestPool };
    }
  }

  return { totalUsd, bestExample, swapCount: swaps.length };
}

export function groupRecipients(rows: HistoryRow[], topN = 5): RecipientSummary[] {
  const map = new Map<string, RecipientSummary>();
  for (const r of rows) {
    if (r.type !== "send" || !r.recipient) continue;
    const lamports = r.amountLamports ?? 0n;
    const existing = map.get(r.recipient);
    const blockMs = r.blockTime ? r.blockTime * 1000 : 0;
    if (existing) {
      existing.totalLamports += lamports;
      existing.count += 1;
      if (blockMs > existing.lastSentMs) existing.lastSentMs = blockMs;
    } else {
      map.set(r.recipient, {
        address: r.recipient,
        totalLamports: lamports,
        count: 1,
        lastSentMs: blockMs,
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => (b.totalLamports > a.totalLamports ? 1 : -1))
    .slice(0, topN);
}

export type { PoolQuoteSnapshot };
