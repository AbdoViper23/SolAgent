import { tradingVaultIdl } from "@workspace/idl";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

type IxArgType = "u8" | "u16" | "u32" | "u64" | "u128" | "i64" | "bool" | "pubkey" | "string";

interface IxArg {
  name: string;
  type: IxArgType | { vec?: unknown; option?: unknown };
}

interface IdlInstruction {
  name: string;
  discriminator: number[];
  args: IxArg[];
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function readU8(buf: Buffer, off: number): [number, number] {
  return [buf.readUInt8(off), off + 1];
}
function readU16(buf: Buffer, off: number): [number, number] {
  return [buf.readUInt16LE(off), off + 2];
}
function readU32(buf: Buffer, off: number): [number, number] {
  return [buf.readUInt32LE(off), off + 4];
}
function readU64(buf: Buffer, off: number): [bigint, number] {
  return [buf.readBigUInt64LE(off), off + 8];
}
function readI64(buf: Buffer, off: number): [bigint, number] {
  return [buf.readBigInt64LE(off), off + 8];
}
function readBool(buf: Buffer, off: number): [boolean, number] {
  return [buf.readUInt8(off) !== 0, off + 1];
}
function readPubkey(buf: Buffer, off: number): [string, number] {
  const slice = buf.subarray(off, off + 32);
  return [new PublicKey(slice).toBase58(), off + 32];
}

function readArg(
  buf: Buffer,
  off: number,
  type: IxArgType | { vec?: unknown; option?: unknown }
): [unknown, number] {
  if (typeof type !== "string") {
    // unsupported complex type — skip
    return [null, buf.length];
  }
  switch (type) {
    case "u8":
      return readU8(buf, off);
    case "u16":
      return readU16(buf, off);
    case "u32":
      return readU32(buf, off);
    case "u64":
    case "u128":
      return readU64(buf, off);
    case "i64":
      return readI64(buf, off);
    case "bool":
      return readBool(buf, off);
    case "pubkey":
      return readPubkey(buf, off);
    default:
      return [null, buf.length];
  }
}

export interface DecodedIx {
  name: string;
  args: Record<string, unknown>;
}

export function decodeVaultIxData(rawData: string | Uint8Array | Buffer): DecodedIx | null {
  let buf: Buffer;
  if (typeof rawData === "string") {
    try {
      buf = Buffer.from(bs58.decode(rawData));
    } catch {
      return null;
    }
  } else if (rawData instanceof Buffer) {
    buf = rawData;
  } else {
    buf = Buffer.from(rawData);
  }
  if (buf.length < 8) return null;

  const disc = buf.subarray(0, 8);
  const ixs = (tradingVaultIdl as { instructions: IdlInstruction[] }).instructions;
  const match = ixs.find((i) => bytesEqual(new Uint8Array(i.discriminator), new Uint8Array(disc)));
  if (!match) return null;

  let off = 8;
  const args: Record<string, unknown> = {};
  for (const arg of match.args) {
    if (off >= buf.length) break;
    const [val, nextOff] = readArg(buf, off, arg.type);
    args[arg.name] = val;
    off = nextOff;
  }
  return { name: match.name, args };
}
