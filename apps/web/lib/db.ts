"use client";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface PoolQuoteSnapshot {
  pool: string;
  label: string;
  tickSpacing: number;
  estimatedOut: string;
  fee?: string;
}

export interface SwapRow {
  txSig: string;
  walletAddress: string;
  inputMint: string;
  outputMint: string;
  amountIn: string;
  bestPool: string;
  bestEstimatedOut: string;
  alternatives: PoolQuoteSnapshot[];
  timestamp: number;
}

export interface DepositRow {
  txSig: string;
  walletAddress: string;
  mint: string;
  amount: string;
  pythPriceUsd: number | null;
  timestamp: number;
}

export type TxKind = "deposit" | "withdraw" | "swap" | "send" | "init" | "config" | "other";

export interface TxMetaRow {
  txSig: string;
  walletAddress: string;
  type: TxKind;
  confirmedAt: number;
}

interface VaultDB extends DBSchema {
  swaps: {
    key: string;
    value: SwapRow;
    indexes: { byWallet: string };
  };
  deposits: {
    key: string;
    value: DepositRow;
    indexes: { byWallet: string };
  };
  txMeta: {
    key: string;
    value: TxMetaRow;
    indexes: { byWallet: string };
  };
}

const DB_NAME = "solana-trading-agent";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VaultDB>> | null = null;

function getDb(): Promise<IDBPDatabase<VaultDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB<VaultDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("swaps")) {
          db.createObjectStore("swaps", { keyPath: "txSig" }).createIndex("byWallet", "walletAddress");
        }
        if (!db.objectStoreNames.contains("deposits")) {
          db.createObjectStore("deposits", { keyPath: "txSig" }).createIndex("byWallet", "walletAddress");
        }
        if (!db.objectStoreNames.contains("txMeta")) {
          db.createObjectStore("txMeta", { keyPath: "txSig" }).createIndex("byWallet", "walletAddress");
        }
      },
    });
  }
  return dbPromise;
}

export async function recordSwap(row: SwapRow): Promise<void> {
  const db = await getDb();
  await db.put("swaps", row);
  await db.put("txMeta", {
    txSig: row.txSig,
    walletAddress: row.walletAddress,
    type: "swap",
    confirmedAt: row.timestamp,
  });
}

export async function recordDeposit(row: DepositRow): Promise<void> {
  const db = await getDb();
  await db.put("deposits", row);
  await db.put("txMeta", {
    txSig: row.txSig,
    walletAddress: row.walletAddress,
    type: "deposit",
    confirmedAt: row.timestamp,
  });
}

export async function recordTxMeta(row: TxMetaRow): Promise<void> {
  const db = await getDb();
  await db.put("txMeta", row);
}

export async function getSwaps(wallet: string): Promise<SwapRow[]> {
  const db = await getDb();
  return db.getAllFromIndex("swaps", "byWallet", wallet);
}

export async function getDeposits(wallet: string): Promise<DepositRow[]> {
  const db = await getDb();
  return db.getAllFromIndex("deposits", "byWallet", wallet);
}

export async function getMeta(wallet: string): Promise<TxMetaRow[]> {
  const db = await getDb();
  return db.getAllFromIndex("txMeta", "byWallet", wallet);
}

export async function getSwap(txSig: string): Promise<SwapRow | undefined> {
  const db = await getDb();
  return db.get("swaps", txSig);
}
