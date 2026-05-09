// Single source of truth for the multi-asset registry.
// Consumed by web, MCP server, oracle service, and swap analyzer.

export type CryptoToken = {
  symbol: string;
  type: "crypto";
  mint: string;
  decimals: number;
  pythFeedId: string | null; // null for stables (assume $1) or test tokens with no Pyth feed
  label: string;
  logo?: string;
  isStable?: boolean;
};

export type EquityTicker = {
  symbol: string;
  type: "equity";
  pythFeedId: string;
  label: string;
  logo?: string;
};

export type TokenEntry = CryptoToken | EquityTicker;

// ─── Crypto (tradeable on Solana devnet via Orca Whirlpools) ─────────────────
// Mint addresses sourced from Orca's Nebula faucet:
// https://everlastingsong.github.io/nebula/

export const CRYPTO_TOKENS: Record<string, CryptoToken> = {
  SOL: {
    symbol: "SOL",
    type: "crypto",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    pythFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    label: "Solana",
  },
  USDC: {
    symbol: "USDC",
    type: "crypto",
    mint: "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k",
    decimals: 6,
    pythFeedId: null,
    label: "USD Coin (devUSDC)",
    isStable: true,
  },
  USDT: {
    symbol: "USDT",
    type: "crypto",
    mint: "H8UekPGwePSmQ3ttuYGPU1szyFfjZR4N53rymSFwpLPm",
    decimals: 6,
    pythFeedId: null,
    label: "Tether (devUSDT)",
    isStable: true,
  },
  SAMO: {
    symbol: "SAMO",
    type: "crypto",
    mint: "Jd4M8bfJG3sAkd82RsGWyEXoaBXQP7njFzBwEaCTuDa",
    decimals: 9,
    pythFeedId: null,
    label: "Samoyedcoin (devSAMO)",
  },
  TMAC: {
    symbol: "TMAC",
    type: "crypto",
    mint: "Afn8YB1p4NsoZeS5XJBZ18LTfEy5NFPwN46wapZcBQr6",
    decimals: 6,
    pythFeedId: null,
    label: "TMAC (devTMAC)",
  },
  PYUSD: {
    symbol: "PYUSD",
    type: "crypto",
    mint: "Hy5ZLF26P3bjfVtrt4qDQCn6HGhS5izb5SNv7P9qmgcG",
    decimals: 6,
    pythFeedId: null,
    label: "PayPal USD (devPYUSD)",
    isStable: true,
  },
  BERN: {
    symbol: "BERN",
    type: "crypto",
    mint: "9fcwFnknB7cZrpVYQxoFgt9haYe59G7bZyTYJ4PkYjbS",
    decimals: 5,
    pythFeedId: null,
    label: "BERN (devBERN)",
  },
};

// ─── Equity (price-only via Pyth Hermes) ─────────────────────────────────────
// Feed IDs verified against https://hermes.pyth.network/v2/price_feeds?asset_type=equity
// Pyth equity feeds publish during US market hours (09:30–16:00 ET); off-hours
// reads return the last close with a stale timestamp.

export const EQUITY_TICKERS: Record<string, EquityTicker> = {
  AAPL: {
    symbol: "AAPL",
    type: "equity",
    pythFeedId: "241b9a5ce1c3e4bfc68e377158328628f1b478afaa796c4b1760bd3713c2d2d2",
    label: "Apple Inc.",
  },
  TSLA: {
    symbol: "TSLA",
    type: "equity",
    pythFeedId: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
    label: "Tesla Inc.",
  },
  NVDA: {
    symbol: "NVDA",
    type: "equity",
    pythFeedId: "61c4ca5b9731a79e285a01e24432d57d89f0ecdd4cd7828196ca8992d5eafef6",
    label: "Nvidia Corp.",
  },
  MSFT: {
    symbol: "MSFT",
    type: "equity",
    pythFeedId: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
    label: "Microsoft Corp.",
  },
  GOOGL: {
    symbol: "GOOGL",
    type: "equity",
    pythFeedId: "88d0800b1649d98e21b8bf9c3f42ab548034d62874ad5d80e1c1b730566d7f61",
    label: "Alphabet Inc.",
  },
  AMZN: {
    symbol: "AMZN",
    type: "equity",
    pythFeedId: "62731dfcc8b8542e52753f208248c3e73fab2ec15422d6f65c2decda71ccea0d",
    label: "Amazon.com Inc.",
  },
  META: {
    symbol: "META",
    type: "equity",
    pythFeedId: "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
    label: "Meta Platforms Inc.",
  },
};

export const TOKENS: Record<string, TokenEntry> = {
  ...CRYPTO_TOKENS,
  ...EQUITY_TICKERS,
};

export const CRYPTO_SYMBOLS = Object.keys(CRYPTO_TOKENS);
export const EQUITY_SYMBOLS = Object.keys(EQUITY_TICKERS);
export const ALL_SYMBOLS = [...CRYPTO_SYMBOLS, ...EQUITY_SYMBOLS];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getToken(symbol: string): TokenEntry | undefined {
  return TOKENS[symbol.toUpperCase()];
}

export function requireToken(symbol: string): TokenEntry {
  const t = getToken(symbol);
  if (!t) throw new Error(`Unknown token symbol: ${symbol}`);
  return t;
}

export function getCryptoToken(symbol: string): CryptoToken | undefined {
  const t = getToken(symbol);
  return t && t.type === "crypto" ? t : undefined;
}

export function getEquityTicker(symbol: string): EquityTicker | undefined {
  const t = getToken(symbol);
  return t && t.type === "equity" ? t : undefined;
}

export function getCryptoByMint(mint: string): CryptoToken | undefined {
  return Object.values(CRYPTO_TOKENS).find((t) => t.mint === mint);
}

export function isCrypto(t: TokenEntry): t is CryptoToken {
  return t.type === "crypto";
}

export function isEquity(t: TokenEntry): t is EquityTicker {
  return t.type === "equity";
}

// Resolve either a 32–44 char base58 mint OR a registry symbol. Used by the
// MCP server to accept human-friendly inputs ("SAMO") alongside raw mints.
export function resolveCryptoInput(input: string): CryptoToken {
  const trimmed = input.trim();
  const bySymbol = getCryptoToken(trimmed);
  if (bySymbol) return bySymbol;
  const byMint = getCryptoByMint(trimmed);
  if (byMint) return byMint;
  throw new Error(
    `Unknown token: "${trimmed}". Expected a registered symbol (${CRYPTO_SYMBOLS.join(", ")}) or a known mint address.`,
  );
}
