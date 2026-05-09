"use client";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { tradingVaultIdl as idl } from "@workspace/idl";

const PROGRAM_ID_STR =
  process.env.NEXT_PUBLIC_VAULT_PROGRAM_ID ?? "DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb";

export function useTradingVault() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();

  return useMemo(() => {
    if (!wallet) return null;

    let programId: PublicKey;
    try {
      programId = new PublicKey(PROGRAM_ID_STR);
    } catch {
      // Program ID not yet deployed — return provider only
      const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
      return { provider, connection, wallet, program: null, programId: null };
    }

    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    // Inject the deployed program ID into the IDL clone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idlWithAddress = { ...(idl as any), address: PROGRAM_ID_STR };

    let program: Program | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      program = new Program(idlWithAddress as any, provider);
    } catch {
      program = null;
    }

    return { provider, connection, wallet, program, programId };
  }, [wallet, connection]);
}

export function getVaultPda(programId: PublicKey, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    programId
  );
}
