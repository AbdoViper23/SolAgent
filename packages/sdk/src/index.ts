import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  Program,
  AnchorProvider,
  Wallet,
  BN,
} from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  setWhirlpoolsConfig,
  setRpc,
  fetchWhirlpoolsByTokenPair,
  swapInstructions,
} from "@orca-so/whirlpools";
import {
  fetchWhirlpool,
  getOracleAddress,
  getTickArrayAddress,
} from "@orca-so/whirlpools-client";
import { address, createSolanaRpc } from "@solana/kit";
import { tradingVaultIdl } from "@workspace/idl";
import type { TradingVault } from "@workspace/idl";

export * from "./tokens.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
export const DEVNET_SOL_USDC_POOL_64  = "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt";
export const DEVNET_SOL_USDC_POOL_8   = "2WUgXbAmhquXMLhqqUthztDaVYnG8Mmp57CkXNb5ym9G";
export const DEVNET_SOL_USDC_SPLASH   = "26WuWhkPBhG5d6kZwHBTruLxLvbSe7C62qH21zpisP9c";
export const DEV_USDC_MINT   = "BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"; // Orca devUSDC (swaps)
export const X402_USDC_MINT  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"; // Circle devUSDC (x402)
export const WSOL_MINT       = "So11111111111111111111111111111111111111112";
export const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const VAULT_SEED = Buffer.from("vault");

// ─── PDA ─────────────────────────────────────────────────────────────────────

export function getVaultPda(
  programId: PublicKey,
  userPublicKey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, userPublicKey.toBuffer()],
    programId
  );
}

// ─── Program factory ─────────────────────────────────────────────────────────

export function getTradingVaultProgram(
  connection: Connection,
  wallet: Wallet,
  programId: PublicKey
): Program<TradingVault> {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  return new Program<TradingVault>(
    tradingVaultIdl as TradingVault,
    provider
  );
}

// ─── initVault ───────────────────────────────────────────────────────────────

export async function initVaultTx(
  program: Program<TradingVault>,
  dailyLimitLamports: bigint,
  slippageBps: number
): Promise<string> {
  const user = (program.provider as AnchorProvider).wallet.publicKey;
  const [vaultPda] = getVaultPda(program.programId, user);

  const tx = await program.methods
    .initVault(new BN(dailyLimitLamports.toString()), slippageBps)
    .accounts({
      user,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

// ─── deposit ─────────────────────────────────────────────────────────────────

export async function depositTx(
  program: Program<TradingVault>,
  mint: PublicKey,
  amount: bigint
): Promise<string> {
  const user = (program.provider as AnchorProvider).wallet.publicKey;
  const [vaultPda] = getVaultPda(program.programId, user);

  const userAta = getAssociatedTokenAddressSync(mint, user, false, TOKEN_PROGRAM_ID);
  const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true, TOKEN_PROGRAM_ID);

  const tx = await program.methods
    .deposit(new BN(amount.toString()))
    .accounts({
      user,
      vault: vaultPda,
      mint,
      userAta,
      vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

// ─── withdraw ────────────────────────────────────────────────────────────────

export async function withdrawTx(
  program: Program<TradingVault>,
  mint: PublicKey,
  amount: bigint
): Promise<string> {
  const user = (program.provider as AnchorProvider).wallet.publicKey;
  const [vaultPda] = getVaultPda(program.programId, user);

  const userAta = getAssociatedTokenAddressSync(mint, user, false, TOKEN_PROGRAM_ID);
  const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true, TOKEN_PROGRAM_ID);

  const tx = await program.methods
    .withdraw(new BN(amount.toString()))
    .accounts({
      user,
      vault: vaultPda,
      authority: user,
      mint,
      userAta,
      vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

// ─── executeSwap ─────────────────────────────────────────────────────────────

export type ExecuteSwapParams = {
  whirlpool: PublicKey;
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  tokenOwnerAccountA: PublicKey;
  tokenVaultA: PublicKey;
  tokenOwnerAccountB: PublicKey;
  tokenVaultB: PublicKey;
  tickArray0: PublicKey;
  tickArray1: PublicKey;
  tickArray2: PublicKey;
  oracle: PublicKey;
  amountIn: bigint;
  minAmountOut: bigint;
  aToB: boolean;
  sqrtPriceLimit: bigint;
};

export async function executeSwapTx(
  program: Program<TradingVault>,
  params: ExecuteSwapParams
): Promise<string> {
  const user = (program.provider as AnchorProvider).wallet.publicKey;
  const [vaultPda] = getVaultPda(program.programId, user);
  const whirlpoolProgramId = new PublicKey(WHIRLPOOL_PROGRAM_ID);

  const preIxs = [
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      params.tokenOwnerAccountA,
      vaultPda,
      params.tokenMintA,
      TOKEN_PROGRAM_ID
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      params.tokenOwnerAccountB,
      vaultPda,
      params.tokenMintB,
      TOKEN_PROGRAM_ID
    ),
  ];

  const tx = await program.methods
    .executeSwap(
      new BN(params.amountIn.toString()),
      new BN(params.minAmountOut.toString()),
      params.aToB,
      new BN(params.sqrtPriceLimit.toString())
    )
    .accounts({
      user,
      vault: vaultPda,
      authority: user,
      whirlpool: params.whirlpool,
      tokenOwnerAccountA: params.tokenOwnerAccountA,
      tokenVaultA: params.tokenVaultA,
      tokenOwnerAccountB: params.tokenOwnerAccountB,
      tokenVaultB: params.tokenVaultB,
      tickArray0: params.tickArray0,
      tickArray1: params.tickArray1,
      tickArray2: params.tickArray2,
      oracle: params.oracle,
      tokenProgram: TOKEN_PROGRAM_ID,
      whirlpoolProgram: whirlpoolProgramId,
    })
    .preInstructions(preIxs)
    .rpc();

  return tx;
}

// ─── getBestSwapQuote ─────────────────────────────────────────────────────────

export type BestQuote = {
  poolAddress: string;
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  priceImpactPct: number;
};

export async function getBestSwapQuote(
  connection: Connection,
  inputMint: string,
  outputMint: string,
  amountIn: bigint
): Promise<BestQuote> {
  await setWhirlpoolsConfig("solanaDevnet");
  await setRpc(connection.rpcEndpoint);

  const pools = [
    DEVNET_SOL_USDC_POOL_64,
    DEVNET_SOL_USDC_POOL_8,
    DEVNET_SOL_USDC_SPLASH,
  ];

  const inputMintAddr = address(inputMint);

  let best: BestQuote | null = null;

  for (const poolAddr of pools) {
    try {
      const { quote } = await swapInstructions(
        // @ts-ignore — swapInstructions accepts the kit RPC type; we pass a dummy signer
        connection,
        { inputAmount: amountIn, mint: inputMintAddr },
        address(poolAddr),
        100 // 1% slippage for quoting
      );

      const estimated = BigInt(quote.tokenEstOut.toString());
      const minOut = BigInt(quote.tokenMinOut.toString());

      if (best === null || estimated > best.estimatedAmountOut) {
        best = {
          poolAddress: poolAddr,
          estimatedAmountOut: estimated,
          minAmountOut: minOut,
          priceImpactPct: 0,
        };
      }
    } catch {
      // pool may not have liquidity on devnet — skip
    }
  }

  if (!best) {
    throw new Error("No usable pool found for quote");
  }

  return best;
}

// ─── prepareSwapAccounts ─────────────────────────────────────────────────────

const TICK_ARRAY_SIZE = 88;

function getStartTickIndex(tickIndex: number, tickSpacing: number): number {
  const stride = tickSpacing * TICK_ARRAY_SIZE;
  return Math.floor(tickIndex / stride) * stride;
}

export type PrepareSwapInput = {
  connection: Connection;
  vault: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amountIn: bigint;
  slippageBps: number;
  poolAddress: PublicKey;
};

export async function prepareSwapAccounts(
  input: PrepareSwapInput
): Promise<ExecuteSwapParams> {
  const { connection, vault, inputMint, amountIn, slippageBps, poolAddress } = input;

  await setWhirlpoolsConfig("solanaDevnet");
  await setRpc(connection.rpcEndpoint);

  const kitRpc = createSolanaRpc(connection.rpcEndpoint);
  const poolAddr = address(poolAddress.toBase58());
  const inputMintAddr = address(inputMint.toBase58());

  const whirlpoolAccount = await fetchWhirlpool(kitRpc, poolAddr);
  const data = whirlpoolAccount.data;
  const tokenMintA = new PublicKey(data.tokenMintA);
  const tokenMintB = new PublicKey(data.tokenMintB);
  const tokenVaultA = new PublicKey(data.tokenVaultA);
  const tokenVaultB = new PublicKey(data.tokenVaultB);

  const aToB = inputMint.equals(tokenMintA);

  const start0 = getStartTickIndex(data.tickCurrentIndex, data.tickSpacing);
  const stride = data.tickSpacing * TICK_ARRAY_SIZE;
  const offsets = aToB ? [0, -stride, -2 * stride] : [0, stride, 2 * stride];
  const tickArrayPdas = await Promise.all(
    offsets.map((off) => getTickArrayAddress(poolAddr, start0 + off))
  );
  const [tickArray0, tickArray1, tickArray2] = tickArrayPdas.map(
    ([addr]) => new PublicKey(addr)
  );

  const [oracleAddrTuple] = [await getOracleAddress(poolAddr)];
  const oracle = new PublicKey(oracleAddrTuple[0]);

  const tokenOwnerAccountA = getAssociatedTokenAddressSync(
    tokenMintA,
    vault,
    true,
    TOKEN_PROGRAM_ID
  );
  const tokenOwnerAccountB = getAssociatedTokenAddressSync(
    tokenMintB,
    vault,
    true,
    TOKEN_PROGRAM_ID
  );

  // Quote via SDK; the SDK already applies slippage to tokenMinOut.
  const { quote } = await swapInstructions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kitRpc as any,
    { inputAmount: amountIn, mint: inputMintAddr },
    poolAddr,
    slippageBps
  );
  const minAmountOut = BigInt(
    (quote as { tokenMinOut: { toString: () => string } }).tokenMinOut.toString()
  );

  return {
    whirlpool: poolAddress,
    tokenMintA,
    tokenMintB,
    tokenOwnerAccountA,
    tokenVaultA,
    tokenOwnerAccountB,
    tokenVaultB,
    tickArray0,
    tickArray1,
    tickArray2,
    oracle,
    amountIn,
    minAmountOut,
    aToB,
    sqrtPriceLimit: 0n,
  };
}

// ─── getVaultBalance ─────────────────────────────────────────────────────────

export async function getVaultBalance(
  connection: Connection,
  program: Program<TradingVault>,
  mint: PublicKey
): Promise<bigint> {
  const user = (program.provider as AnchorProvider).wallet.publicKey;
  const [vaultPda] = getVaultPda(program.programId, user);
  const vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true, TOKEN_PROGRAM_ID);

  try {
    const accountInfo = await connection.getTokenAccountBalance(vaultAta);
    return BigInt(accountInfo.value.amount);
  } catch {
    return 0n;
  }
}
