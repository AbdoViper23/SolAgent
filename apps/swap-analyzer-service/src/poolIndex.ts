// Multi-pair Orca Whirlpools devnet pool registry.
// Lookup keyed by an unordered "BASE:QUOTE" pair using the symbol pair from
// @workspace/sdk's CRYPTO_TOKENS. Reverse pairs resolve automatically.
//
// Pool addresses come from Orca's documented devnet deployment:
//   https://dev.orca.so → Architecture Overview → Whirlpool Parameters

import { getCryptoByMint, type CryptoToken } from "@workspace/sdk/tokens";

export type PoolEntry = {
  address: string;
  tickSpacing: number;
  label: string;
  // The two mints anchoring the pool (order matches Orca's token A/B convention).
  tokenA: string;
  tokenB: string;
};

const RAW_POOLS: ReadonlyArray<Omit<PoolEntry, "tokenA" | "tokenB"> & { pair: [string, string] }> = [
  // SOL / USDC — three concentrated-liquidity tick spacings
  {
    pair: ["SOL", "USDC"],
    address: "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt",
    tickSpacing: 64,
    label: "SOL/devUSDC ts=64",
  },
  {
    pair: ["SOL", "USDC"],
    address: "2WUgXbAmhquXMLhqqUthztDaVYnG8Mmp57CkXNb5ym9G",
    tickSpacing: 8,
    label: "SOL/devUSDC ts=8",
  },
  {
    pair: ["SOL", "USDC"],
    address: "26WuWhkPBhG5d6kZwHBTruLxLvbSe7C62qH21zpisP9c",
    tickSpacing: 32896,
    label: "SOL/devUSDC Splash",
  },
  // SOL / PYUSD
  {
    pair: ["SOL", "PYUSD"],
    address: "8WLHU9LsezCo3DWdFk33rRPdybJabfZ7cBn9ZroWu11t",
    tickSpacing: 32,
    label: "SOL/devPYUSD ts=32",
  },
  // USDC / USDT
  {
    pair: ["USDC", "USDT"],
    address: "63cMwvN8eoaD39os9bKP8brmA7Xtov9VxahnPufWCSdg",
    tickSpacing: 1,
    label: "devUSDC/devUSDT ts=1",
  },
  // USDC / PYUSD
  {
    pair: ["USDC", "PYUSD"],
    address: "J3J1hfwBCXgqp5vVPyfwkzUmcWRpsh3FdAvDiLEMzzYZ",
    tickSpacing: 1,
    label: "devUSDC/devPYUSD ts=1",
  },
  // SAMO / USDC
  {
    pair: ["SAMO", "USDC"],
    address: "EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4",
    tickSpacing: 64,
    label: "devSAMO/devUSDC ts=64",
  },
  // TMAC / USDC
  {
    pair: ["TMAC", "USDC"],
    address: "H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y",
    tickSpacing: 64,
    label: "devTMAC/devUSDC ts=64",
  },
];

import { CRYPTO_TOKENS } from "@workspace/sdk/tokens";

function pairKey(a: string, b: string): string {
  return [a.toUpperCase(), b.toUpperCase()].sort().join(":");
}

function buildIndex(): Map<string, PoolEntry[]> {
  const index = new Map<string, PoolEntry[]>();
  for (const raw of RAW_POOLS) {
    const [aSym, bSym] = raw.pair;
    const a = CRYPTO_TOKENS[aSym];
    const b = CRYPTO_TOKENS[bSym];
    if (!a || !b) continue;
    const key = pairKey(aSym, bSym);
    const entry: PoolEntry = {
      address: raw.address,
      tickSpacing: raw.tickSpacing,
      label: raw.label,
      tokenA: a.mint,
      tokenB: b.mint,
    };
    const list = index.get(key) ?? [];
    list.push(entry);
    index.set(key, list);
  }
  return index;
}

export const POOL_INDEX = buildIndex();

export function getSupportedPairs(): string[] {
  return Array.from(POOL_INDEX.keys());
}

export function getPoolsForMintPair(inputMint: string, outputMint: string): PoolEntry[] {
  const a = getCryptoByMint(inputMint);
  const b = getCryptoByMint(outputMint);
  if (!a || !b) return [];
  return POOL_INDEX.get(pairKey(a.symbol, b.symbol)) ?? [];
}

export function getPoolsForSymbolPair(inputSymbol: string, outputSymbol: string): PoolEntry[] {
  return POOL_INDEX.get(pairKey(inputSymbol, outputSymbol)) ?? [];
}

// Helper for refactor: resolve a (mint, mint) -> { aSym, bSym } so callers can
// surface human-readable pool labels without re-doing the lookup.
export function describeCryptoPair(
  inputMint: string,
  outputMint: string,
): { input: CryptoToken; output: CryptoToken } | null {
  const input = getCryptoByMint(inputMint);
  const output = getCryptoByMint(outputMint);
  if (!input || !output) return null;
  return { input, output };
}
