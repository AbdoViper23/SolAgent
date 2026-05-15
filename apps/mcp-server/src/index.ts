#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import anchorPkg from "@coral-xyz/anchor";
import type { Program as AnchorProgramType, AnchorProvider as AnchorProviderType } from "@coral-xyz/anchor";
const { AnchorProvider, Program, BN, Wallet } = anchorPkg;
import { base58 } from "@scure/base";
import { createX402Client } from "@workspace/x402-client";
import { tradingVaultIdl } from "@workspace/idl";
import {
  resolveCryptoInput,
  getEquityTicker,
  CRYPTO_TOKENS,
  EQUITY_TICKERS,
  CRYPTO_SYMBOLS,
  EQUITY_SYMBOLS,
} from "@workspace/sdk/tokens";
import { prepareSwapAccounts, executeSwapTx } from "@workspace/sdk";
import WebSocket from "ws";

// Accepts either a registered symbol ("SOL", "SAMO", "PYUSD") or a base58 mint
// address. Throws with a helpful message for unknown inputs.
function resolveMint(input: string): string {
  return resolveCryptoInput(input).mint;
}

// ── Env ───────────────────────────────────────────────────────────────────────
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PRIVATE_KEY_B58 = process.env.SOLANA_PRIVATE_KEY ?? "";
const VAULT_PROGRAM_ID = process.env.VAULT_PROGRAM_ID ?? "DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb";
const X402_BASE_URL = process.env.X402_BASE_URL ?? "";
const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://facilitator.payai.network";

// Wipe private key from env immediately after reading
process.env.SOLANA_PRIVATE_KEY = "";

// ── Constants ─────────────────────────────────────────────────────────────────
const DEV_USDC_SWAP = new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const WHIRLPOOLS_PROGRAM = new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");

// Devnet SOL/devUSDC whirlpool pool addresses
const POOLS = [
  { address: "3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt", tickSpacing: 64, label: "ts64" },
  { address: "2WUgXbAmBDePCNBpCkjMj7H8SqGXDvSijQbBMuXLnDgn", tickSpacing: 8, label: "ts8" },
  { address: "26WuWhkPzEoGMJLbcRqBhepCUB5yAFb3ZHnzYJkWbCHX", tickSpacing: 0, label: "splash" },
];

// ── Placeholder IDL ───────────────────────────────────────────────────────────
// Use the real IDL from @workspace/idl. After `anchor build` you can replace
// packages/idl/src/trading_vault.json with target/idl/trading_vault.json.
// We override the address dynamically so users can re-deploy without re-publishing.
const PLACEHOLDER_IDL = { ...tradingVaultIdl, address: VAULT_PROGRAM_ID };

// ── Solana setup ──────────────────────────────────────────────────────────────
let wallet: Keypair;
let connection: Connection;
let provider: AnchorProviderType;
let program: AnchorProgramType;
let programId: PublicKey;
let http: Awaited<ReturnType<typeof createX402Client>> | null = null;

function init() {
  if (!PRIVATE_KEY_B58) {
    throw new Error("SOLANA_PRIVATE_KEY env var is required");
  }
  const keyBytes = base58.decode(PRIVATE_KEY_B58);
  wallet = Keypair.fromSecretKey(keyBytes);
  connection = new Connection(RPC_URL, "confirmed");
  programId = new PublicKey(VAULT_PROGRAM_ID);

  const anchorWallet = new Wallet(wallet);

  provider = new AnchorProvider(connection, anchorWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program = new Program(PLACEHOLDER_IDL as any, provider);
}

async function initX402() {
  if (!X402_BASE_URL || !PRIVATE_KEY_B58) return;
  try {
    http = await createX402Client({
      baseURL: X402_BASE_URL,
      privateKeyBase58: PRIVATE_KEY_B58,
    });
  } catch {
    // x402 client is optional — price/analyze tools will fail gracefully
  }
}

// ── Vault PDA helper ──────────────────────────────────────────────────────────
function deriveVaultPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer()],
    programId
  );
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "solana-trading-agent",
  version: "0.1.0",
});

// get_vault_info
server.registerTool(
  "get_vault_info",
  {
    title: "Get Vault Info",
    description: "Get vault PDA address and current SOL + devUSDC token balances",
    inputSchema: {},
  },
  async () => {
    const [vaultPda] = deriveVaultPda(wallet.publicKey);

    const solLamports = await connection.getBalance(vaultPda);
    const solBalance = solLamports / LAMPORTS_PER_SOL;

    let devUsdcBalance = "0";
    try {
      const ata = await getAssociatedTokenAddress(DEV_USDC_SWAP, vaultPda, true);
      const acct = await connection.getTokenAccountBalance(ata);
      devUsdcBalance = acct.value.uiAmountString ?? "0";
    } catch {
      // ATA may not exist yet
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              owner: wallet.publicKey.toBase58(),
              vaultPda: vaultPda.toBase58(),
              solBalance: `${solBalance} SOL`,
              devUsdcBalance: `${devUsdcBalance} devUSDC`,
              network: "devnet",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// deposit_to_vault
server.registerTool(
  "deposit_to_vault",
  {
    title: "Deposit to Vault",
    description: "Deposit a supported crypto token into your trading vault. Accepts a symbol (SOL, USDC, USDT, SAMO, TMAC, PYUSD, BERN) or a raw mint address.",
    inputSchema: {
      mint: z.string().describe("Token symbol (SOL, USDC, ...) or base58 mint address"),
      amount: z.string().describe("Amount in smallest unit (lamports for SOL, micro-USDC for stables, etc.)"),
    },
  },
  async ({ mint, amount }) => {
    const [vaultPda] = deriveVaultPda(wallet.publicKey);
    const mintPubkey = new PublicKey(resolveMint(mint));
    const userAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);
    const vaultAta = await getAssociatedTokenAddress(mintPubkey, vaultPda, true);
    const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
    const { SystemProgram } = await import("@solana/web3.js");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (program as any).methods
      .deposit(new BN(amount))
      .accounts({
        user: wallet.publicKey,
        vault: vaultPda,
        mint: mintPubkey,
        userAta,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ success: true, txSignature: tx, mint, amount }, null, 2),
        },
      ],
    };
  }
);

// withdraw_from_vault
server.registerTool(
  "withdraw_from_vault",
  {
    title: "Withdraw from Vault",
    description: "Withdraw tokens from vault back to your wallet. Accepts a symbol (SOL, USDC, USDT, SAMO, TMAC, PYUSD, BERN) or a raw mint address.",
    inputSchema: {
      mint: z.string().describe("Token symbol or base58 mint address"),
      amount: z.string().describe("Amount in smallest unit"),
    },
  },
  async ({ mint, amount }) => {
    const [vaultPda] = deriveVaultPda(wallet.publicKey);
    const mintPubkey = new PublicKey(resolveMint(mint));
    const userAta = await getAssociatedTokenAddress(mintPubkey, wallet.publicKey);
    const vaultAta = await getAssociatedTokenAddress(mintPubkey, vaultPda, true);
    const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = await import("@solana/spl-token");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (program as any).methods
      .withdraw(new BN(amount))
      .accounts({
        user: wallet.publicKey,
        vault: vaultPda,
        authority: vaultPda,
        mint: mintPubkey,
        userAta,
        vaultAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ success: true, txSignature: tx, mint, amount }, null, 2),
        },
      ],
    };
  }
);

// get_best_quote
server.registerTool(
  "get_best_quote",
  {
    title: "Get Best Quote",
    description: "Get best swap quote across registered Orca Whirlpool pools for any supported pair. Accepts symbols (SOL/USDC/USDT/SAMO/TMAC/PYUSD/BERN) or raw mint addresses.",
    inputSchema: {
      inputMint: z.string().describe("Input token symbol or base58 mint address"),
      outputMint: z.string().describe("Output token symbol or base58 mint address"),
      amountIn: z.string().describe("Input amount in smallest unit"),
    },
  },
  async ({ inputMint, outputMint, amountIn }) => {
    if (!http) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "X402 client not initialized — set X402_BASE_URL env var to your swap-analyzer-service URL" },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
    try {
      const { data } = await http.post("/analyze", {
        inputMint: resolveMint(inputMint),
        outputMint: resolveMint(outputMint),
        amountIn,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "Failed to get quote", detail: String(err) }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
);

// execute_swap
server.registerTool(
  "execute_swap",
  {
    title: "Execute Swap",
    description: "Execute a token swap via your vault (respects daily limits)",
    inputSchema: {
      whirlpoolAddress: z.string().describe("Whirlpool pool address to swap through"),
      amountIn: z.string().describe("Input amount in smallest unit"),
      inputMint: z
        .string()
        .optional()
        .describe("Input mint (symbol or address). Defaults to WSOL."),
      outputMint: z
        .string()
        .optional()
        .describe("Output mint (symbol or address). Defaults to devnet USDC."),
      slippageBps: z
        .number()
        .int()
        .optional()
        .describe("Slippage tolerance in bps (default 100 = 1%)"),
      minAmountOut: z
        .string()
        .optional()
        .describe("Override min_amount_out (smallest unit). Defaults to quote-derived value."),
    },
  },
  async ({ whirlpoolAddress, amountIn, inputMint, outputMint, slippageBps, minAmountOut }) => {
    const [vaultPda] = deriveVaultPda(wallet.publicKey);
    const inputMintPk = new PublicKey(inputMint ? resolveMint(inputMint) : WSOL_MINT);
    const outputMintPk = new PublicKey(outputMint ? resolveMint(outputMint) : DEV_USDC_SWAP);

    const params = await prepareSwapAccounts({
      connection,
      vault: vaultPda,
      inputMint: inputMintPk,
      outputMint: outputMintPk,
      amountIn: BigInt(amountIn),
      slippageBps: slippageBps ?? 100,
      poolAddress: new PublicKey(whirlpoolAddress),
    });

    if (minAmountOut) {
      params.minAmountOut = BigInt(minAmountOut);
    }

    const tx = await executeSwapTx(program, params);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              txSignature: tx,
              whirlpoolAddress,
              amountIn,
              minAmountOut: params.minAmountOut.toString(),
              aToB: params.aToB,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// get_sol_price
server.registerTool(
  "get_sol_price",
  {
    title: "Get SOL Price",
    description: "Get current SOL/USD price from Pyth oracle via x402 (costs $0.001)",
    inputSchema: {},
  },
  async () => {
    if (!http) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "x402 client not configured. Set X402_BASE_URL and SOLANA_PRIVATE_KEY env vars." },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const response = await http.get("/price/sol-usd");
    const data = response.data as {
      price: number;
      conf: number;
      publishTime: number;
      stale: boolean;
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              price: data.price,
              confidence: data.conf,
              publishTime: data.publishTime,
              publishTimeHuman: new Date(data.publishTime * 1000).toISOString(),
              stale: data.stale,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// get_stock_price — pull a real-time equity quote from the oracle service via x402.
server.registerTool(
  "get_stock_price",
  {
    title: "Get Stock Price (x402-paid)",
    description:
      "Get a real-time price for a US equity (AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META) via Pyth Network. Costs $0.001 via x402. Stocks are watch-only — they cannot be traded on Solana devnet.",
    inputSchema: {
      ticker: z.string().describe("Equity ticker (AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META)"),
    },
  },
  async ({ ticker }) => {
    if (!http) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "x402 client not configured. Set X402_BASE_URL and SOLANA_PRIVATE_KEY env vars." },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
    const upper = ticker.toUpperCase();
    if (!getEquityTicker(upper)) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "unknown_ticker", supported: EQUITY_SYMBOLS, ticker: upper },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
    try {
      const { data } = await http.get(`/price/equity/${upper}`);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ticker: data.symbol,
                label: data.label,
                price: data.price,
                confidence: data.conf,
                publishTime: data.publishTime,
                publishTimeHuman: new Date(data.publishTime * 1000).toISOString(),
                stale: data.stale,
                note: "Equity prices are watch-only on Solana devnet. xStocks-style tokenized trading is mainnet-only.",
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "Failed to fetch equity price", detail: String(err) }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// list_supported_assets — discoverability for callers that want the full registry.
server.registerTool(
  "list_supported_assets",
  {
    title: "List Supported Assets",
    description:
      "List every crypto token (tradeable on Solana devnet via Orca) and equity ticker (price-only via Pyth) this trading agent supports.",
    inputSchema: {},
  },
  async () => {
    const crypto = Object.values(CRYPTO_TOKENS).map((t) => ({
      symbol: t.symbol,
      label: t.label,
      mint: t.mint,
      decimals: t.decimals,
      isStable: t.isStable ?? false,
      hasPythFeed: !!t.pythFeedId,
    }));
    const equity = Object.values(EQUITY_TICKERS).map((t) => ({
      symbol: t.symbol,
      label: t.label,
      type: "watch-only",
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              cryptoTradeable: crypto,
              equityWatchOnly: equity,
              cryptoSymbols: CRYPTO_SYMBOLS,
              equitySymbols: EQUITY_SYMBOLS,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// analyze_routes
server.registerTool(
  "analyze_routes",
  {
    title: "Analyze Routes",
    description: "Get detailed multi-pool route analysis for any supported pair. Accepts symbols or raw mint addresses. Costs $0.005 via x402.",
    inputSchema: {
      inputMint: z.string().describe("Input token symbol or base58 mint address"),
      outputMint: z.string().describe("Output token symbol or base58 mint address"),
      amountIn: z.string().describe("Input amount in smallest unit"),
    },
  },
  async ({ inputMint, outputMint, amountIn }) => {
    if (!http) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "x402 client not configured. Set X402_BASE_URL and SOLANA_PRIVATE_KEY env vars." },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    const response = await http.post("/analyze", {
      inputMint: resolveMint(inputMint),
      outputMint: resolveMint(outputMint),
      amountIn,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }
);

// stream_best_quote
type StreamTick = {
  ts: number;
  tickCount: number;
  bestRoute: { pool: string; estimatedOut: string };
  routes: Array<{
    pool: string;
    tickSpacing: number;
    label: string;
    estimatedOut: string;
    fee: string;
  }>;
};

server.registerTool(
  "stream_best_quote",
  {
    title: "Stream Best Quote (60s WSS, x402-paid)",
    description:
      "Pay once via x402 to open a 60-second WebSocket stream that pushes the freshest Orca multi-pool best quote whenever it changes. Returns the timeline + best observed price after the window closes. Accepts symbols (SOL, USDC, SAMO, ...) or raw mints.",
    inputSchema: {
      inputMint: z.string().describe("Input token symbol or base58 mint address"),
      outputMint: z.string().describe("Output token symbol or base58 mint address"),
      amountIn: z.string().describe("Input amount in smallest unit"),
    },
  },
  async ({ inputMint, outputMint, amountIn }, extra) => {
    if (!http) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "X402 client not initialized — set X402_BASE_URL and SOLANA_PRIVATE_KEY" },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    let init: { sessionId: string; expiresAt: number; durationMs: number; wsUrl: string };
    try {
      const { data } = await http.post("/stream/quote/init", {
        inputMint: resolveMint(inputMint),
        outputMint: resolveMint(outputMint),
        amountIn,
      });
      init = data;
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "Failed to init stream (payment or server)", detail: String(err) },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const ticks: StreamTick[] = [];
    const startedAt = Date.now();
    const progressToken = extra._meta?.progressToken;

    const result = await new Promise<{ reason: string }>((resolve) => {
      const ws = new WebSocket(init.wsUrl);
      const safetyTimer = setTimeout(
        () => {
          try {
            ws.close();
          } catch {
            /* already closed */
          }
          resolve({ reason: "client_timeout" });
        },
        init.durationMs + 5_000,
      );

      ws.on("message", async (raw) => {
        let msg: { type: string } & Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (msg.type === "tick") {
          const tick = msg as unknown as StreamTick;
          ticks.push(tick);
          if (progressToken !== undefined) {
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: tick.tickCount,
                message: JSON.stringify({
                  ts: tick.ts,
                  best: tick.bestRoute,
                }),
              },
            });
          }
        } else if (msg.type === "closed") {
          clearTimeout(safetyTimer);
          resolve({ reason: String(msg.reason ?? "expired") });
        }
      });

      ws.on("error", (err) => {
        clearTimeout(safetyTimer);
        resolve({ reason: `error:${String(err)}` });
      });

      ws.on("close", () => {
        clearTimeout(safetyTimer);
        resolve({ reason: "ws_closed" });
      });
    });

    let bestObserved: StreamTick | null = null;
    for (const t of ticks) {
      if (
        !bestObserved ||
        BigInt(t.bestRoute.estimatedOut) > BigInt(bestObserved.bestRoute.estimatedOut)
      ) {
        bestObserved = t;
      }
    }
    const lastTick = ticks[ticks.length - 1] ?? null;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              sessionId: init.sessionId,
              durationMs: init.durationMs,
              elapsedMs: Date.now() - startedAt,
              closeReason: result.reason,
              tickCount: ticks.length,
              bestObserved,
              lastTick,
              timeline: ticks.map((t) => ({
                ts: t.ts,
                tickCount: t.tickCount,
                bestRoute: t.bestRoute,
              })),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// update_vault_config
server.registerTool(
  "update_vault_config",
  {
    title: "Update Vault Config",
    description: "Update daily spend limit and slippage cap for your vault",
    inputSchema: {
      dailyLimitLamports: z.string().describe("Daily spend limit in lamports"),
      slippageBps: z.number().describe("Maximum slippage in basis points (e.g. 50 = 0.5%)"),
      paused: z.boolean().describe("Pause or unpause vault trading"),
    },
  },
  async ({ dailyLimitLamports, slippageBps, paused }) => {
    const [vaultPda] = deriveVaultPda(wallet.publicKey);

    const tx = await program.methods
      .updateConfig(new BN(dailyLimitLamports), slippageBps, paused)
      .accounts({
        vault: vaultPda,
        user: wallet.publicKey,
      })
      .rpc();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { success: true, txSignature: tx, dailyLimitLamports, slippageBps, paused },
            null,
            2
          ),
        },
      ],
    };
  }
);

// init_vault
server.registerTool(
  "init_vault",
  {
    title: "Initialize Vault",
    description: "Create the trading vault PDA for the connected wallet (one-time setup)",
    inputSchema: {
      dailyLimitLamports: z.string().describe("Daily spend limit in lamports as string"),
      slippageBps: z.number().describe("Slippage cap in basis points (e.g. 50 = 0.5%)"),
    },
  },
  async ({ dailyLimitLamports, slippageBps }) => {
    const [vaultPda] = deriveVaultPda(wallet.publicKey);
    const { SystemProgram } = await import("@solana/web3.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (program as any).methods
      .initVault(new BN(dailyLimitLamports), slippageBps)
      .accounts({
        user: wallet.publicKey,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { success: true, txSignature: tx, vaultPda: vaultPda.toBase58() },
            null,
            2
          ),
        },
      ],
    };
  }
);

// send_token — SPL transfer from your hot wallet to any address (for "send 0.05 SOL to X" requests)
server.registerTool(
  "send_token",
  {
    title: "Send Token",
    description:
      "Transfer SOL or any SPL token from your hot wallet directly to a recipient address (does NOT touch the vault)",
    inputSchema: {
      recipient: z.string().describe("Recipient Solana address"),
      mint: z.string().describe("Token mint address — pass 'SOL' for native SOL transfer"),
      amount: z.string().describe("Amount in atomic units (lamports for SOL, micro-units for SPL)"),
    },
  },
  async ({ recipient, mint, amount }) => {
    const recipientPk = new PublicKey(recipient);
    const amountBig = BigInt(amount);

    if (mint === "SOL" || mint === "So11111111111111111111111111111111111111112") {
      const { SystemProgram, Transaction } = await import("@solana/web3.js");
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: recipientPk,
          lamports: Number(amountBig),
        })
      );
      const sig = await provider.sendAndConfirm(tx);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, txSignature: sig, transfer: "SOL", amount, recipient },
              null,
              2
            ),
          },
        ],
      };
    }

    // SPL token transfer
    const mintPk = new PublicKey(mint);
    const { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } =
      await import("@solana/spl-token");
    const { Transaction } = await import("@solana/web3.js");
    const fromAta = await getAssociatedTokenAddress(mintPk, wallet.publicKey);
    const toAta = await getAssociatedTokenAddress(mintPk, recipientPk);

    const tx = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          toAta,
          recipientPk,
          mintPk
        )
      )
      .add(createTransferInstruction(fromAta, toAta, wallet.publicKey, amountBig));

    const sig = await provider.sendAndConfirm(tx);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { success: true, txSignature: sig, transfer: "SPL", mint, amount, recipient },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
init();
await initX402();
await server.connect(new StdioServerTransport());
