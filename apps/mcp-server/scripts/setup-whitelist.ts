#!/usr/bin/env tsx
// One-time vault configuration:
//   - whitelist every supported crypto token mint
//   - whitelist every Orca devnet pool the swap-analyzer can quote against
//
// Run after `init_vault` for a given user. Idempotent — already-whitelisted
// entries are skipped silently.
//
// Usage:
//   SOLANA_PRIVATE_KEY=<b58> VAULT_PROGRAM_ID=<id> SOLANA_RPC_URL=https://api.devnet.solana.com \
//     pnpm --filter solana-trading-agent-mcp setup:whitelist

import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { base58 } from "@scure/base";
import { tradingVaultIdl } from "@workspace/idl";
import { CRYPTO_TOKENS } from "@workspace/sdk/tokens";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PRIVATE_KEY_B58 = process.env.SOLANA_PRIVATE_KEY ?? "";
const VAULT_PROGRAM_ID = process.env.VAULT_PROGRAM_ID;

if (!PRIVATE_KEY_B58) {
  console.error("SOLANA_PRIVATE_KEY env var is required (base58 of devnet hot wallet)");
  process.exit(1);
}
if (!VAULT_PROGRAM_ID) {
  console.error("VAULT_PROGRAM_ID env var is required");
  process.exit(1);
}

// Pool addresses to register on the vault — must match what the swap-analyzer
// service has in its POOL_INDEX. Kept inline here (not imported from the
// service) because this script lives in the MCP package which doesn't take a
// dep on the analyzer.
const POOL_ADDRESSES = [
  "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt", // SOL/devUSDC ts=64
  "2WUgXbAmhquXMLhqqUthztDaVYnG8Mmp57CkXNb5ym9G", // SOL/devUSDC ts=8
  "26WuWhkPBhG5d6kZwHBTruLxLvbSe7C62qH21zpisP9c", // SOL/devUSDC Splash
  "8WLHU9LsezCo3DWdFk33rRPdybJabfZ7cBn9ZroWu11t", // SOL/devPYUSD ts=32
  "63cMwvN8eoaD39os9bKP8brmA7Xtov9VxahnPufWCSdg", // devUSDC/devUSDT ts=1
  "J3J1hfwBCXgqp5vVPyfwkzUmcWRpsh3FdAvDiLEMzzYZ", // devUSDC/devPYUSD ts=1
  "EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4", // devSAMO/devUSDC ts=64
  "H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y", // devTMAC/devUSDC ts=64
];

async function main() {
  const wallet = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY_B58));
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(wallet), {
    commitment: "confirmed",
  });
  const programId = new PublicKey(VAULT_PROGRAM_ID!);
  const idl = { ...tradingVaultIdl, address: programId.toBase58() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl as any, provider);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), wallet.publicKey.toBuffer()],
    programId,
  );

  console.log(`Owner:    ${wallet.publicKey.toBase58()}`);
  console.log(`Vault:    ${vaultPda.toBase58()}`);
  console.log(`Program:  ${programId.toBase58()}`);
  console.log(`RPC:      ${RPC_URL}`);
  console.log("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vault: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vault = await (program.account as any).vault.fetch(vaultPda);
  } catch (err) {
    console.error(`Could not load vault state — has init_vault been called for ${wallet.publicKey.toBase58()}?`);
    console.error(String(err));
    process.exit(1);
  }

  const existingMints = new Set<string>(
    (vault.whitelistedTokens ?? []).map((p: PublicKey) => p.toBase58()),
  );
  const existingPools = new Set<string>(
    (vault.whitelistedPools ?? []).map((p: PublicKey) => p.toBase58()),
  );

  const desiredMints = Object.values(CRYPTO_TOKENS).map((t) => t.mint);
  const missingMints = desiredMints.filter((m) => !existingMints.has(m));
  const missingPools = POOL_ADDRESSES.filter((p) => !existingPools.has(p));

  console.log(`Whitelisted tokens already on chain: ${existingMints.size}`);
  console.log(`Whitelisted pools already on chain:  ${existingPools.size}`);
  console.log(`Tokens to add: ${missingMints.length}`);
  console.log(`Pools to add:  ${missingPools.length}`);
  console.log("");

  for (const mint of missingMints) {
    process.stdout.write(`  → whitelist token ${mint} ... `);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (program.methods as any)
        .addWhitelistToken(new PublicKey(mint))
        .accounts({
          user: wallet.publicKey,
          vault: vaultPda,
          authority: wallet.publicKey,
        })
        .rpc();
      console.log(`ok (${sig.slice(0, 8)}...)`);
    } catch (err) {
      console.log(`FAILED: ${String(err)}`);
    }
  }

  for (const pool of missingPools) {
    process.stdout.write(`  → whitelist pool  ${pool} ... `);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sig = await (program.methods as any)
        .addWhitelistPool(new PublicKey(pool))
        .accounts({
          user: wallet.publicKey,
          vault: vaultPda,
          authority: wallet.publicKey,
        })
        .rpc();
      console.log(`ok (${sig.slice(0, 8)}...)`);
    } catch (err) {
      console.log(`FAILED: ${String(err)}`);
    }
  }

  console.log("");
  console.log("Done. Re-run any time — already-whitelisted entries are skipped.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
