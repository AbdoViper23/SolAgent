import {
  Connection,
  PublicKey,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { decodeVaultIxData, type DecodedIx } from "./instruction-decoder";
import type { TxKind } from "./db";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface HistoryRow {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  feeLamports: number;
  type: TxKind;
  // Type-specific fields populated when known
  recipient?: string;
  amountLamports?: bigint;
  splMint?: string;
  splAmount?: string;
  vaultIx?: DecodedIx;
}

function isParsed(ix: ParsedInstruction | PartiallyDecodedInstruction): ix is ParsedInstruction {
  return (ix as ParsedInstruction).parsed !== undefined;
}

function classifyTx(
  walletAddress: string,
  programId: string,
  tx: ParsedTransactionWithMeta | null
): Omit<HistoryRow, "signature" | "slot" | "blockTime" | "err"> {
  const fee = tx?.meta?.fee ?? 0;
  const fallback = { feeLamports: fee, type: "other" as TxKind };
  if (!tx) return fallback;

  const message = tx.transaction.message;
  const instructions = message.instructions;

  // Look for a vault-program instruction first — most distinctive
  for (const ix of instructions) {
    const pid = ix.programId.toBase58();
    if (pid === programId && !isParsed(ix)) {
      const decoded = decodeVaultIxData(ix.data);
      if (decoded) {
        let kind: TxKind = "other";
        switch (decoded.name) {
          case "deposit":
            kind = "deposit";
            break;
          case "withdraw":
            kind = "withdraw";
            break;
          case "execute_swap":
          case "executeSwap":
            kind = "swap";
            break;
          case "init_vault":
          case "initVault":
            kind = "init";
            break;
          case "update_config":
          case "updateConfig":
          case "add_whitelist_pool":
          case "remove_whitelist_pool":
          case "add_whitelist_token":
          case "remove_whitelist_token":
            kind = "config";
            break;
          default:
            kind = "other";
        }
        return { feeLamports: fee, type: kind, vaultIx: decoded };
      }
    }
  }

  // System transfer (SOL send)
  for (const ix of instructions) {
    if (!isParsed(ix)) continue;
    const pid = ix.programId.toBase58();
    if (pid === SYSTEM_PROGRAM && ix.parsed?.type === "transfer") {
      const info = ix.parsed.info as { source: string; destination: string; lamports: number };
      if (info.source === walletAddress) {
        return {
          feeLamports: fee,
          type: "send",
          recipient: info.destination,
          amountLamports: BigInt(info.lamports),
        };
      }
    }
  }

  // SPL token transfer (send)
  for (const ix of instructions) {
    if (!isParsed(ix)) continue;
    const pid = ix.programId.toBase58();
    if (pid !== TOKEN_PROGRAM && pid !== TOKEN_2022_PROGRAM) continue;
    const ptype = ix.parsed?.type;
    if (ptype !== "transfer" && ptype !== "transferChecked") continue;
    const info = ix.parsed.info as {
      authority?: string;
      source?: string;
      destination?: string;
      mint?: string;
      amount?: string;
      tokenAmount?: { amount: string };
    };
    if (info.authority && info.authority !== walletAddress) continue;
    return {
      feeLamports: fee,
      type: "send",
      recipient: info.destination ?? "",
      splMint: info.mint,
      splAmount: info.amount ?? info.tokenAmount?.amount,
    };
  }

  return fallback;
}

export async function fetchHistory(
  connection: Connection,
  walletPk: PublicKey,
  programId: PublicKey | null,
  opts?: { limit?: number; before?: string }
): Promise<HistoryRow[]> {
  const sigInfos: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(walletPk, {
    limit: opts?.limit ?? 50,
    before: opts?.before,
  });

  if (sigInfos.length === 0) return [];

  const wallet = walletPk.toBase58();
  const program = programId?.toBase58() ?? "";

  // Fetch parsed txs in small batches (RPC rate-limit friendly)
  const rows: HistoryRow[] = [];
  const BATCH = 10;
  for (let i = 0; i < sigInfos.length; i += BATCH) {
    const batch = sigInfos.slice(i, i + BATCH);
    const parsed = await Promise.all(
      batch.map((s) =>
        connection
          .getParsedTransaction(s.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          })
          .catch(() => null)
      )
    );
    batch.forEach((sigInfo, j) => {
      const classified = classifyTx(wallet, program, parsed[j]);
      rows.push({
        signature: sigInfo.signature,
        slot: sigInfo.slot,
        blockTime: sigInfo.blockTime ?? null,
        err: sigInfo.err,
        ...classified,
      });
    });
  }

  return rows;
}
