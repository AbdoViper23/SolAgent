// UI-side re-exports and helpers on top of the shared registry.
// Logos, formatters, and asset-grouping live here so components can stay simple.

export {
  CRYPTO_TOKENS,
  EQUITY_TICKERS,
  TOKENS,
  CRYPTO_SYMBOLS,
  EQUITY_SYMBOLS,
  ALL_SYMBOLS,
  getToken,
  requireToken,
  getCryptoToken,
  getEquityTicker,
  getCryptoByMint,
  isCrypto,
  isEquity,
} from "@workspace/sdk/tokens";

export type {
  CryptoToken,
  EquityTicker,
  TokenEntry,
} from "@workspace/sdk/tokens";

import {
  CRYPTO_TOKENS as _CRYPTO,
  EQUITY_TICKERS as _EQUITY,
  type TokenEntry,
} from "@workspace/sdk/tokens";

// Single-character icon per symbol. Used inline by AssetGrid + PriceTicker.
const CRYPTO_GLYPHS: Record<string, string> = {
  SOL: "◎",
  USDC: "$",
  USDT: "₮",
  SAMO: "🐕",
  TMAC: "🐺",
  PYUSD: "₱",
  BERN: "🍞",
};

const EQUITY_GLYPHS: Record<string, string> = {
  AAPL: "",
  TSLA: "T",
  NVDA: "N",
  MSFT: "M",
  GOOGL: "G",
  AMZN: "a",
  META: "M",
};

export function getGlyph(symbol: string): string {
  return CRYPTO_GLYPHS[symbol] ?? EQUITY_GLYPHS[symbol] ?? "•";
}

export function formatPriceUsd(price: number | string): string {
  const n = typeof price === "string" ? Number(price) : price;
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

export function formatStaleAge(publishTime: number): string {
  const ageSec = Math.floor(Date.now() / 1000 - publishTime);
  if (ageSec < 0) return "now";
  if (ageSec < 60) return `${ageSec}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}

export const TICKER_SYMBOLS: string[] = [
  ...Object.keys(_CRYPTO),
  ...Object.keys(_EQUITY),
];

export function listCryptoTokens(): TokenEntry[] {
  return Object.values(_CRYPTO);
}
export function listEquityTickers(): TokenEntry[] {
  return Object.values(_EQUITY);
}
