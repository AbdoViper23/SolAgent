import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { tradingVaultIdl } from "../packages/idl/src/index.js";
import type { TradingVault } from "../packages/idl/src/trading_vault_types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const VAULT_SEED = Buffer.from("vault");

function getVaultPda(programId: PublicKey, user: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, user.toBuffer()],
    programId
  );
}

async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  sol: number = 10
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, ...latestBlockhash },
    "confirmed"
  );
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe("trading_vault", () => {
  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899",
    "confirmed"
  );

  let authority: Keypair;
  let program: Program<TradingVault>;
  let mint: PublicKey;
  let userAta: PublicKey;
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultAta: PublicKey;

  const DAILY_LIMIT = new BN(1_000_000_000); // 1000 tokens (6 dec)
  const SLIPPAGE_BPS = 100; // 1%
  const MINT_DECIMALS = 6;
  const INITIAL_MINT_AMOUNT = 10_000_000_000; // 10,000 tokens

  before(async () => {
    authority = Keypair.generate();
    await airdrop(connection, authority.publicKey);

    const wallet = new Wallet(authority);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    program = new Program<TradingVault>(
      tradingVaultIdl as unknown as TradingVault,
      provider
    );

    // Create a test SPL mint
    mint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      MINT_DECIMALS,
      undefined,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );

    // Create user ATA and mint tokens
    userAta = await createAssociatedTokenAccount(
      connection,
      authority,
      mint,
      authority.publicKey,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    await mintTo(
      connection,
      authority,
      mint,
      userAta,
      authority,
      INITIAL_MINT_AMOUNT,
      [],
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );

    [vaultPda, vaultBump] = getVaultPda(program.programId, authority.publicKey);
    vaultAta = getAssociatedTokenAddressSync(mint, vaultPda, true, TOKEN_PROGRAM_ID);
  });

  // ── init_vault ─────────────────────────────────────────────────────────────

  describe("init_vault", () => {
    it("creates the vault PDA with correct initial state", async () => {
      await program.methods
        .initVault(DAILY_LIMIT, SLIPPAGE_BPS)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);

      expect(vault.bump).to.equal(vaultBump);
      expect(vault.authority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(vault.dailySpendLimit.toString()).to.equal(DAILY_LIMIT.toString());
      expect(vault.dailySpent.toString()).to.equal("0");
      expect(vault.slippageBpsCap).to.equal(SLIPPAGE_BPS);
      expect(vault.paused).to.equal(false);
      expect(vault.whitelistedTokens).to.be.an("array").that.is.empty;
      expect(vault.whitelistedPools).to.be.an("array").that.is.empty;
    });
  });

  // ── deposit ────────────────────────────────────────────────────────────────

  describe("deposit", () => {
    it("transfers tokens from user ATA to vault ATA", async () => {
      const depositAmount = 1_000_000; // 1 token

      const userBalBefore = await connection.getTokenAccountBalance(userAta);

      await program.methods
        .deposit(new BN(depositAmount))
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          mint,
          userAta,
          vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const userBalAfter = await connection.getTokenAccountBalance(userAta);
      const vaultBal = await connection.getTokenAccountBalance(vaultAta);

      const userDiff =
        BigInt(userBalBefore.value.amount) - BigInt(userBalAfter.value.amount);
      expect(userDiff.toString()).to.equal(depositAmount.toString());
      expect(vaultBal.value.amount).to.equal(depositAmount.toString());
    });

    it("vault ATA is re-used on second deposit (init_if_needed)", async () => {
      const depositAmount = 2_000_000;

      await program.methods
        .deposit(new BN(depositAmount))
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          mint,
          userAta,
          vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const vaultBal = await connection.getTokenAccountBalance(vaultAta);
      expect(Number(vaultBal.value.amount)).to.be.greaterThan(depositAmount);
    });
  });

  // ── withdraw ───────────────────────────────────────────────────────────────

  describe("withdraw", () => {
    it("returns tokens from vault ATA to user ATA", async () => {
      const withdrawAmount = 500_000; // 0.5 token

      const vaultBalBefore = await connection.getTokenAccountBalance(vaultAta);
      const userBalBefore = await connection.getTokenAccountBalance(userAta);

      await program.methods
        .withdraw(new BN(withdrawAmount))
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
          mint,
          userAta,
          vaultAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      const vaultBalAfter = await connection.getTokenAccountBalance(vaultAta);
      const userBalAfter = await connection.getTokenAccountBalance(userAta);

      const vaultDiff =
        BigInt(vaultBalBefore.value.amount) - BigInt(vaultBalAfter.value.amount);
      const userDiff =
        BigInt(userBalAfter.value.amount) - BigInt(userBalBefore.value.amount);

      expect(vaultDiff.toString()).to.equal(withdrawAmount.toString());
      expect(userDiff.toString()).to.equal(withdrawAmount.toString());
    });
  });

  // ── update_config ──────────────────────────────────────────────────────────

  describe("update_config", () => {
    it("updates daily limit, slippage, and paused flag", async () => {
      const newLimit = new BN(500_000_000);
      const newSlippage = 200;

      await program.methods
        .updateConfig(newLimit, newSlippage, true)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.dailySpendLimit.toString()).to.equal(newLimit.toString());
      expect(vault.slippageBpsCap).to.equal(newSlippage);
      expect(vault.paused).to.equal(true);
    });

    it("un-pauses the vault", async () => {
      await program.methods
        .updateConfig(DAILY_LIMIT, SLIPPAGE_BPS, false)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.paused).to.equal(false);
    });
  });

  // ── whitelist management ───────────────────────────────────────────────────

  describe("whitelist management", () => {
    const fakePool = Keypair.generate().publicKey;
    const fakeToken = Keypair.generate().publicKey;

    it("adds a pool to the whitelist", async () => {
      await program.methods
        .addWhitelistPool(fakePool)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.whitelistedPools.some((p) => p.equals(fakePool))).to.be.true;
    });

    it("removes a pool from the whitelist", async () => {
      await program.methods
        .removeWhitelistPool(fakePool)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.whitelistedPools.some((p) => p.equals(fakePool))).to.be.false;
    });

    it("adds a token to the whitelist", async () => {
      await program.methods
        .addWhitelistToken(fakeToken)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.whitelistedTokens.some((t) => t.equals(fakeToken))).to.be.true;
    });

    it("removes a token from the whitelist", async () => {
      await program.methods
        .removeWhitelistToken(fakeToken)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const vault = await program.account.vault.fetch(vaultPda);
      expect(vault.whitelistedTokens.some((t) => t.equals(fakeToken))).to.be.false;
    });
  });

  // ── execute_swap ───────────────────────────────────────────────────────────

  describe("execute_swap", () => {
    it("rejects swap when vault is paused", async () => {
      // Pause vault
      await program.methods
        .updateConfig(DAILY_LIMIT, SLIPPAGE_BPS, true)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      const fakeWhirlpool = Keypair.generate().publicKey;
      const fakeTickArray = Keypair.generate().publicKey;
      const fakeOracle = Keypair.generate().publicKey;
      const whirlpoolProgramId = new PublicKey(
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
      );

      try {
        await program.methods
          .executeSwap(new BN(1000), new BN(900), true, new BN(0))
          .accounts({
            user: authority.publicKey,
            vault: vaultPda,
            authority: authority.publicKey,
            whirlpool: fakeWhirlpool,
            tokenOwnerAccountA: userAta,
            tokenVaultA: fakeWhirlpool,
            tokenOwnerAccountB: userAta,
            tokenVaultB: fakeWhirlpool,
            tickArray0: fakeTickArray,
            tickArray1: fakeTickArray,
            tickArray2: fakeTickArray,
            oracle: fakeOracle,
            tokenProgram: TOKEN_PROGRAM_ID,
            whirlpoolProgram: whirlpoolProgramId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown Paused error");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }

      // Unpause for further tests
      await program.methods
        .updateConfig(DAILY_LIMIT, SLIPPAGE_BPS, false)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
    });

    it("rejects swap when pool is not whitelisted", async () => {
      const fakeWhirlpool = Keypair.generate().publicKey;
      const fakeTickArray = Keypair.generate().publicKey;
      const fakeOracle = Keypair.generate().publicKey;
      const whirlpoolProgramId = new PublicKey(
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
      );

      try {
        await program.methods
          .executeSwap(new BN(1000), new BN(900), true, new BN(0))
          .accounts({
            user: authority.publicKey,
            vault: vaultPda,
            authority: authority.publicKey,
            whirlpool: fakeWhirlpool,
            tokenOwnerAccountA: userAta,
            tokenVaultA: fakeWhirlpool,
            tokenOwnerAccountB: userAta,
            tokenVaultB: fakeWhirlpool,
            tickArray0: fakeTickArray,
            tickArray1: fakeTickArray,
            tickArray2: fakeTickArray,
            oracle: fakeOracle,
            tokenProgram: TOKEN_PROGRAM_ID,
            whirlpoolProgram: whirlpoolProgramId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown PoolNotWhitelisted error");
      } catch (err: any) {
        expect(err.toString()).to.include("PoolNotWhitelisted");
      }
    });

    it("rejects swap when daily limit would be exceeded", async () => {
      const fakePool = Keypair.generate().publicKey;
      const fakeTickArray = Keypair.generate().publicKey;
      const fakeOracle = Keypair.generate().publicKey;
      const whirlpoolProgramId = new PublicKey(
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
      );

      // Whitelist the pool
      await program.methods
        .addWhitelistPool(fakePool)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      // Set a very low daily limit
      await program.methods
        .updateConfig(new BN(1), SLIPPAGE_BPS, false)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      try {
        await program.methods
          .executeSwap(new BN(1_000_000), new BN(900_000), true, new BN(0))
          .accounts({
            user: authority.publicKey,
            vault: vaultPda,
            authority: authority.publicKey,
            whirlpool: fakePool,
            tokenOwnerAccountA: userAta,
            tokenVaultA: fakePool,
            tokenOwnerAccountB: userAta,
            tokenVaultB: fakePool,
            tickArray0: fakeTickArray,
            tickArray1: fakeTickArray,
            tickArray2: fakeTickArray,
            oracle: fakeOracle,
            tokenProgram: TOKEN_PROGRAM_ID,
            whirlpoolProgram: whirlpoolProgramId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown DailyLimitExceeded error");
      } catch (err: any) {
        expect(err.toString()).to.include("DailyLimitExceeded");
      }

      // Restore original limit
      await program.methods
        .updateConfig(DAILY_LIMIT, SLIPPAGE_BPS, false)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
    });

    it("rejects swap when min_amount_out implies tighter slippage than cap", async () => {
      const fakePool = Keypair.generate().publicKey;
      const fakeTickArray = Keypair.generate().publicKey;
      const fakeOracle = Keypair.generate().publicKey;
      const whirlpoolProgramId = new PublicKey(
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
      );

      await program.methods
        .addWhitelistPool(fakePool)
        .accounts({
          user: authority.publicKey,
          vault: vaultPda,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();

      // SLIPPAGE_BPS = 100 (1%), so floor = amount_in * 99 / 100 = 990_000.
      // min_amount_out = 900_000 is below floor → SlippageTooTight.
      try {
        await program.methods
          .executeSwap(new BN(1_000_000), new BN(900_000), true, new BN(0))
          .accounts({
            user: authority.publicKey,
            vault: vaultPda,
            authority: authority.publicKey,
            whirlpool: fakePool,
            tokenOwnerAccountA: userAta,
            tokenVaultA: fakePool,
            tokenOwnerAccountB: userAta,
            tokenVaultB: fakePool,
            tickArray0: fakeTickArray,
            tickArray1: fakeTickArray,
            tickArray2: fakeTickArray,
            oracle: fakeOracle,
            tokenProgram: TOKEN_PROGRAM_ID,
            whirlpoolProgram: whirlpoolProgramId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown SlippageTooTight error");
      } catch (err: any) {
        expect(err.toString()).to.include("SlippageTooTight");
      }
    });
  });
});
