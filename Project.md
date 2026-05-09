# Solana AI Trading Agent — Technical Research Dossier (May 2026)

## TL;DR
- **Use Anchor 0.31.1 with Solana CLI 2.1.x and Rust 1.84+ (do NOT use Anchor 1.0.x for hackathon-tier dependency stability when integrating Orca)**, build the Trading Vault as PDA-per-user with a token-2022-aware `InterfaceAccount<Mint>` design, and CPI into Orca Whirlpools (`whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc`, identical on devnet) using the SOL/devUSDC pool `3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt` and devUSDC mint `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` — both addresses are CONFIRMED correct from Orca's official docs.
- **Skip Jupiter for the on‑chain "aggregator" claim on devnet** (Jupiter has no real devnet routing; their Swap API only supports mainnet). Build a pseudo‑aggregator that quotes against **Orca Whirlpools devnet pools only** (multiple SOL/devUSDC tick-spacing variants exist: `3KBZiL2g…` ts=64, `2WUgXbAm…` ts=8, `26WuWhkP…` Splash) and presents them as "routes". For x402 micropayments use **`@x402/svm` v2.6.0+** (older versions have a CRITICAL signature‑bypass CVE) with the **PayAI facilitator** (`https://facilitator.payai.network`) which is the only no‑API‑key, free, devnet‑working Solana facilitator today.
- **MCP server**: build with **`@modelcontextprotocol/sdk` v1.29.0** (stay on the v1 line — v2 is pre‑alpha targeting Q1 2026), distribute via npm with a `bin` entry so users add it via `npx` in `claude_desktop_config.json`, store the trading wallet's base58 private key in the `env` block of that config, and use `@x402/axios` + `registerExactSvmScheme` to auto‑pay 402 challenges from the MCP tool handlers. Frontend uses `@solana/wallet-adapter-react@0.15.39` + `@coral-xyz/anchor@0.31.1`.

---

## Key Findings

### Section 1 — Anchor Framework (May 2026)

**Released versions that exist:** 0.30.0, 0.30.1, 0.31.0, 0.31.1, 0.32.0, 0.32.1, 1.0.0, 1.0.1, 1.0.2.

**Recommended for this project: Anchor 0.31.1.**

Reasoning, with concrete evidence:
- **Anchor 1.0.x** is the new major track and the official quickstart now uses it, but 1.0.x changed many internals (declare_program! refinements, Migration<From,To> account type, removal of solana-program crate from many places, switch to solana-invoke). The Orca Whirlpools CPI examples repo currently lists tested matrices ONLY for **0.29.0, 0.30.1, and 0.31.1** — Orca has not yet published a 1.0 CPI Cargo.toml template. For a hackathon that has to CPI into Whirlpools, picking the version Orca itself ships templates for is the lowest‑risk path.
- **0.30.x** requires patching `cargo update solana-program@X --precise 1.18.17` because Whirlpools pulls solana-program v2 and 0.30.x relies on v1. Annoying. Skip it.
- **0.31.1** is compatible with solana-program v2, **no patching required**, and works with newer Rust (Rust 1.78–1.84+ have all been used successfully in the wild). Orca explicitly says: *"Anchor v0.31.1: Compatible with newer Rust versions."*
- **0.32.x** is presented in release notes as "the last major release before v1" with optimizations; functional but Orca CPI templates haven't been updated for it.

**Toolchain combo to lock in `Anchor.toml` + `rust-toolchain.toml`:**
| Component | Version |
|---|---|
| Anchor CLI / `anchor-lang` / `anchor-spl` | **0.31.1** |
| Solana / Agave CLI | **2.1.0** (matches Orca's documented setup for 0.31.1: `sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"`) |
| Rust (rustc) | **1.84.1** (works; 1.85.0 also reported working in Solana Foundation quickstart) |
| `@coral-xyz/anchor` (TS client) | **0.31.x** matching the Rust crate (mismatch warning was added in 0.30.0) |
| Node.js | **>=20**, ideally 22 |

**Known pitfalls (from official changelogs):**
- `idl-build` feature is **mandatory** — add `[features] idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]` to `programs/<name>/Cargo.toml`.
- `overflow-checks` is no longer implicit; declare it in workspace `Cargo.toml`.
- Avoid adding `solana-program` directly — use `anchor_lang::solana_program` (Anchor warns at build time).
- The IDL format changed in 0.30.0 (`metadata.address` required). 0.31.1 generates the new format natively.
- The `accounts` method on the TS transaction builder is now type-safe based on resolution metadata — partial accounts are fine for resolvable PDAs.

---

### Section 2 — Solana DEX Aggregation on Devnet (CRITICAL)

**This is the section where reality differs most from intuition; build accordingly.**

**Jupiter on devnet — verdict: NOT a real option.**
- The official Jupiter Swap API is mainnet-only. The Helius and QuickNode integration guides explicitly state "We only support mainnet" in their `Connection` setup for `quote-api.jup.ag`.
- `devnet.jup.ag` exists as a UI but does not back a routing engine that you can program against on devnet.
- Jupiter Ultra V3 (released Oct 2025) is the current mainnet product (Iris router, Beam landing engine, JIT market revival). None of this works on devnet.
- **Conclusion**: do not promise users "Jupiter routes" on devnet. Either use the **mainnet** quote API to *display indicative prices* while still executing on devnet against Orca, or remove Jupiter entirely and call your service an "Orca multi‑pool aggregator."

**Orca Whirlpools on devnet — verdict: PRIMARY DEX.**
- Whirlpools program ID is the SAME on mainnet and devnet: `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` (confirmed via Orca's `whirlpool/src/lib.rs` `declare_id!` and the dev.orca.so parameters page).
- Devnet `WhirlpoolsConfig` address: `FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR` (from `dev.orca.so/Architecture Overview/Whirlpool Parameters/`).
- SDK: **`@orca-so/whirlpools` (latest, uses `@solana/kit` / web3.js v2)** — call `setWhirlpoolsConfig("solanaDevnet")` and `swapInstructions(...)`. If you must use legacy web3.js v1, use **`@orca-so/whirlpools-sdk`**. For low-level decoding/PDA derivation use `@orca-so/whirlpools-client`.

**Confirmed working devnet pool table (verified directly from Orca tutorials and tests):**

| Pair | Tick Spacing | Pool address |
|---|---|---|
| SOL / devUSDC | **64** (CL) | `3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt` ← **the one the user listed; CORRECT** |
| SOL / devUSDC | 8 | `2WUgXbAmhquXMLhqqUthztDaVYnG8Mmp57CkXNb5ym9G` |
| SOL / devUSDC | 32896 (Splash) | `26WuWhkPBhG5d6kZwHBTruLxLvbSe7C62qH21zpisP9c` |
| devUSDC / devUSDT | 1 | `63cMwvN8eoaD39os9bKP8brmA7Xtov9VxahnPufWCSdg` |
| devSAMO / devUSDC | 64 | `EgxU92G34jw6QDG9RuTX9StFg1PmHuDqkRKAE5kVEiZ4` |
| devTMAC / devUSDC | 64 | `H3xhLrSEyDFm6jjG42QezbvhSxF5YHW75VdGUnqeEg5y` |
| SOL / devPYUSD | 32 | `8WLHU9LsezCo3DWdFk33rRPdybJabfZ7cBn9ZroWu11t` |
| devUSDC / devPYUSD | 1 | `J3J1hfwBCXgqp5vVPyfwkzUmcWRpsh3FdAvDiLEMzzYZ` |

**Confirmed working devnet token mint addresses:**
- **SOL (wSOL)**: `So11111111111111111111111111111111111111112` (same on all clusters; 9 decimals)
- **devUSDC**: `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` (6 decimals) — **CONFIRMED CORRECT**, this is Orca's canonical devUSDC and it's used in every Orca Rust/TS example. It is mintable from the Orca devToken Nebula faucet at https://everlastingsong.github.io/nebula/.
- **Other devTokens** (devSAMO, devTMAC, devPYUSD, devUSDT, devBERN, devSUSD) — also at the Nebula faucet.
- **Note**: there is a SECOND devUSDC mint on Solana: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` — this is **Circle's official devnet USDC** (same as Solana Faucet's USDC). It is what x402 facilitators expect for x402 payments. The Orca devUSDC and Circle devUSDC are NOT the same token. Use Orca's `BRjpCHtyQLNC…` for SWAPS, and Circle's `4zMMC9srt5…` for x402 PAYMENTS.

**Recommended "aggregator" strategy on devnet:**
1. Quote across all three SOL/devUSDC tick-spacing pools (64, 8, Splash) using `@orca-so/whirlpools` `swapQuoteByInputToken`. Pick the best output. Surface this as "3 routes evaluated."
2. Optionally add a *cosmetic* cross-feed that fetches a Jupiter mainnet quote for "indicative reference price" (clearly labeled — never executable).
3. Treat the Orca Splash pool as a constant-product fallback when concentrated pools have insufficient depth.
4. The Whirlpools program supports a true `two_hop_swap` instruction in case you want devSAMO→devUSDC→SOL routing. Account list is doubled (two whirlpools, two tick-array sets, two oracles).

**Raydium on devnet — verdict: do not rely on.**
- Raydium maintains a devnet (program addresses listed in `docs.raydium.io/raydium/protocol/developers/addresses` under "Devnet"), but the SDK was effectively archived in June 2025 (`raydium-sdk-v1` repo set read-only) and devnet pools are not actively maintained for testing. Devnet liquidity is essentially zero. Skip for hackathon.

**No other DEX has reliable devnet liquidity.** Meteora, Phoenix, Lifinity, etc. either don't deploy to devnet or have nothing in their devnet pools.

---

### Section 3 — x402 Protocol on Solana

**Spec version:** **x402 v2** is the current spec. v1 still exists (Coinbase docs note "registerSchemeV1" for older `solana-devnet` style network strings); v2 uses CAIP-2 (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for mainnet, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` for devnet). Foundation: x402 governance moved to the Linux-Foundation-hosted x402 Foundation in April 2026 (22 launch members including Solana Foundation, Visa, Mastercard, Stripe, Cloudflare).

**Coinbase reference SDK packages (npm, current):**
| Package | Version | Notes |
|---|---|---|
| `@x402/core` | latest | transport-agnostic types & client |
| `@x402/svm` | **2.6.0+ (REQUIRED — older has GHSA-qr2g-p6q7-w82m signature-bypass CVE)** | exact-scheme Solana implementation |
| `@x402/evm` | latest | EVM exact scheme |
| `@x402/express` | latest | drop-in Express middleware |
| `@x402/next` | latest | Next.js middleware (used as `x402-next` too) |
| `@x402/hono`, `@x402/fastify` | latest | other framework adapters |
| `@x402/axios` | latest | client wrapper that auto-handles 402 retries |
| `@x402/fetch` | latest | minimal fetch client wrapper |
| `@x402/paywall`, `@x402/extensions` | latest | UI / extras |

**Alternative SDK (also production-grade, Solana-first):**
- `x402-solana` (PayAI Network) — `npm i x402-solana`, exposes `X402PaymentHandler` class with `extractPayment`, `createPaymentRequirements`, `verifyPayment`, `settlePayment`, `create402Response`. Implements v2. Defaults its facilitator to `https://facilitator.payai.network`.
- `@faremeter/middleware` + `@faremeter/info` — Corbits/Faremeter's stack, points to `https://facilitator.corbits.dev`.

**Facilitators — picking one for devnet, free, no API key:**

| Facilitator | URL | Devnet free? | Notes |
|---|---|---|---|
| **PayAI** | `https://facilitator.payai.network` | **YES — recommended** | "PayAI is currently taking over all transaction fees." No API keys, supports `solana-devnet`, gasless. Used in `x402-solana`'s default config. |
| **Corbits** (Faremeter) | `https://facilitator.corbits.dev` | YES | Solana-focused; works with `@faremeter/middleware`. |
| **x402.org/facilitator** | `https://x402.org/facilitator` | Limited | Solana Foundation's official Next.js x402 template hardcodes this for `solana-devnet`, but it is best-effort; PayAI is more reliable. |
| **CDP (Coinbase)** | via SDK | Mainnet primary | 1,000 free txs/month then $0.001/tx. Supports Solana but the free tier maps to mainnet usage; for pure devnet testing use PayAI. |
| **Thirdweb** | `/v1/payments/x402/...` | Self-hosted facilitator wallet | You provide the SOL; not free. |
| **Self-host** | run `@x402/svm` ExactSvmFacilitator | Possible but extra infra | Skip for hackathon. |

**Recommendation: PayAI for the hackathon.**

**Wire format on Solana (v2, exact scheme — VERBATIM from spec at `coinbase/x402/specs/schemes/exact/scheme_exact_svm.md`):**

402 response body (PaymentRequirements):
```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://yourservice.example.com/api/oracle-price",
    "description": "SOL/USD spot price with confidence interval",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    "amount": "1000",
    "asset": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    "payTo": "<your-merchant-solana-address>",
    "maxTimeoutSeconds": 60,
    "extra": {
      "feePayer": "<facilitator-public-key-from-/supported-endpoint>"
    }
  }
}
```
- `amount` is in atomic units of the SPL token. For USDC (6 decimals) `"1000"` = $0.001.
- `asset` is the SPL mint. **For x402 on devnet use Circle's `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`** (Solana faucet's USDC).

Subsequent client request: header `X-PAYMENT: <base64(JSON of PaymentPayload)>`. PaymentPayload contains `payload.transaction = base64(partially-signed-Solana-tx)` where the client signed a `TransferChecked` to `payTo` and left `feePayer`'s signature blank for the facilitator to fill.

Facilitator MUST verify: signed by client, correct amount, correct mint, correct destination, recent blockhash, instruction layout `[ComputeUnitLimit, ComputeUnitPrice, optional ATA-create, TransferChecked]`, and a clean payment intent. The CVE was failure to enforce strict signature binding; **always be on `@x402/svm` >= 2.6.0**.

SettlementResponse:
```json
{
  "success": true,
  "transaction": "<base58 tx signature>",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "payer": "<base58 client public key>"
}
```

**Express server example (production-ready pattern):**
```ts
import express from "express";
import { paymentMiddleware } from "@x402/express";
const app = express();
app.use(paymentMiddleware(
  "<merchantSolanaAddress>",
  {
    "GET /price/sol-usd": {
      price: "$0.001",
      network: "solana-devnet",
      config: { description: "Pyth-backed SOL/USD price feed" }
    },
    "GET /swap-analyzer": {
      price: "$0.005",
      network: "solana-devnet",
      config: { description: "Multi-pool best-route analysis" }
    }
  },
  { url: "https://facilitator.payai.network" }
));
app.get("/price/sol-usd", async (_, res) => res.json(await fetchPythSolUsd()));
app.get("/swap-analyzer", async (req, res) => res.json(await analyzeRoutes(req.query)));
app.listen(4021);
```

**Client wrapper (the pattern the MCP server will use):**
```ts
import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

const svmKey = base58.decode(process.env.SVM_PRIVATE_KEY!);
const svmSigner = await createKeyPairSignerFromBytes(svmKey);

const client = new x402Client();
registerExactSvmScheme(client, { signer: svmSigner });

const http = wrapAxiosWithPayment(
  axios.create({ baseURL: process.env.X402_BASE_URL }),
  client,
  // optional max-spend guardrails
);
const { data } = await http.get("/price/sol-usd"); // auto-handles 402
```

**Auto-paying from inside an MCP tool handler:** the tool function just calls `await http.get(...)`. The `wrapAxiosWithPayment` interceptor: (1) sees 402, (2) parses PaymentRequirements, (3) signs a transfer, (4) re-issues the request with `X-PAYMENT`, (5) returns the resource. No human-in-the-loop signing required.

---

### Section 4 — MCP Server Development for Solana

**SDK version:** Use **`@modelcontextprotocol/sdk@1.29.0`** (latest stable v1; `1.24.3` was pinned as of December 2025, `1.29.0` is the May 2026 stable). Repository is `modelcontextprotocol/typescript-sdk` and the v2 branch is **pre-alpha targeting a Q1 2026 stable release** — do not adopt v2 yet for hackathon, the API surface is still moving (replaces deprecated `.tool/.prompt/.resource`, removes Zod from core, makes Hono/Express middleware separate adapter packages).

**Package layout for an npm-publishable Solana MCP server:**
```json
{
  "name": "solana-trading-agent-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "solana-trading-agent-mcp": "dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc && shx chmod +x dist/index.js",
    "prepare": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@coral-xyz/anchor": "^0.31.1",
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "^0.4.9",
    "@orca-so/whirlpools": "latest",
    "@solana/kit": "^2.1.1",
    "@x402/axios": "latest",
    "@x402/svm": ">=2.6.0",
    "@scure/base": "^1.2.6",
    "axios": "^1.13.0",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  }
}
```
First line of `src/index.ts` MUST be the shebang: `#!/usr/bin/env node`

**Stdio server skeleton (works in Claude Desktop):**
```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "solana-trading-agent",
  version: "0.1.0"
});

server.registerTool(
  "deposit_to_vault",
  {
    title: "Deposit funds into trading vault",
    description: "Deposits SOL or devUSDC into the user's PDA-derived trading vault.",
    inputSchema: {
      mint: z.string().describe("SPL mint address"),
      amount: z.string().describe("Amount in atomic units (string to avoid bigint loss)")
    },
    outputSchema: { signature: z.string(), vault: z.string() }
  },
  async ({ mint, amount }) => {
    const sig = await depositTx(mint, BigInt(amount));
    return {
      content: [{ type: "text", text: `Deposited. Tx: ${sig}` }],
      structuredContent: { signature: sig, vault: getVaultPda().toBase58() }
    };
  }
);

server.registerTool("execute_swap", { /* ... */ }, async (args) => { /* ... */ });
server.registerTool("get_best_quote", { /* ... */ }, async (args) => { /* ... */ });
server.registerTool("get_vault_balance", { /* ... */ }, async (args) => { /* ... */ });
server.registerTool("get_pyth_price", { /* ... */ }, async (args) => { /* calls x402 oracle service */ });

await server.connect(new StdioServerTransport());
```

**Claude Desktop config.** File location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Recommended end-user config (after publishing your package as `solana-trading-agent-mcp`):
```json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "npx",
      "args": ["-y", "solana-trading-agent-mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 trading wallet key>",
        "VAULT_PROGRAM_ID": "<deployed Anchor program id>",
        "X402_BASE_URL": "https://your-x402-services.fly.dev",
        "X402_FACILITATOR_URL": "https://facilitator.payai.network"
      }
    }
  }
}
```
**Common Claude Desktop gotcha**: when Node is installed via nvm/Homebrew, `npx` may not be on Claude Desktop's PATH. Tell users to use the full path: `"command": "/usr/local/bin/npx"` (find via `which npx`). Also `Cmd+Q` (not just close window) is required to fully restart on macOS.

**Wallet key handling — best practices:**
- Never log the key. Read once into memory at startup; immediately wipe `process.env.SOLANA_PRIVATE_KEY` if paranoid.
- Recommend a **dedicated low-balance hot wallet** in your README — not the user's main key. This is the standard pattern adopted by `coinopai-mcp`, `chainanalyzer-mcp`, etc.
- For production, consider Anthropic's Desktop Extensions (.mcpb) format which marks fields as `"sensitive": true` so Claude Desktop encrypts them via macOS Keychain / Windows Credential Manager. Not required for the hackathon but a polish item.
- Optional: add a `set_payment_limit` tool so the agent can't spend more than X SOL/USDC without re-approval (pattern from `ai42-mcp`).

**Existing reference repos to fork from (in priority order for this project):**
1. **`sendaifun/solana-mcp`** — full Solana MCP server using Solana Agent Kit. Best starting point. Has install scripts and Claude Desktop integration baked in.
2. **`sendaifun/solana-agent-kit`** package `@solana-agent-kit/adapter-mcp` (path `packages/adapter-mcp`) — exposes `createSolanaAgentKitMcpServer` factory.
3. **`coinbase/x402` `examples/typescript/clients/mcp`** — official x402+MCP demo showing exactly how to register Solana scheme and auto-pay 402 challenges. **Mirror this structure for the x402 integration.**
4. **`paulfruitful/WalletMCP`** and **`@phantom/mcp-server`** — wallet-management MCP patterns (good for tool-naming conventions and user UX).
5. **`PayAINetwork/x402-solana`** — server-side patterns for offering paid endpoints.

**Calling Anchor programs from the MCP server tool handlers:**
```ts
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl/trading_vault.json"; // generated by anchor build
import type { TradingVault } from "./types/trading_vault";

const connection = new anchor.web3.Connection(process.env.SOLANA_RPC_URL!, "confirmed");
const wallet = new anchor.Wallet(
  anchor.web3.Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY!))
);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new anchor.Program<TradingVault>(idl as any, provider);

const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), wallet.publicKey.toBuffer()],
  program.programId
);
const tx = await program.methods.deposit(new anchor.BN(amount))
  .accounts({ user: wallet.publicKey, vault: vaultPda, /* resolvable accounts auto-filled */ })
  .rpc();
```

If using Anchor 0.31.1's `anchor idl type` command, you get a TypeScript type file in `target/types/trading_vault.ts` that is the canonical source of truth for `Program<TradingVault>`.

---

### Section 5 — Wallet Standard Frontend Integration

**Latest packages (May 2026):**
| Package | Version |
|---|---|
| `@solana/wallet-adapter-react` | **0.15.39** (latest published; stable since mid-2025) |
| `@solana/wallet-adapter-react-ui` | 0.9.39 |
| `@solana/wallet-adapter-base` | latest |
| `@solana/wallet-adapter-wallets` | latest |
| `@solana/web3.js` | use **v1** (1.95+) for compatibility with `@coral-xyz/anchor`. v2 (`@solana/kit`) does NOT work with `@coral-xyz/anchor` yet. |
| `@coral-xyz/anchor` | 0.31.1 |
| Next.js | 14.x or 15.x |

`@solana/wallet-adapter-react` 0.15+ supports the **Wallet Standard** automatically — any wallet that publishes a Wallet Standard interface (Phantom, Solflare, Backpack, Glow, Brave, Coinbase, etc.) is picked up without you listing them in the wallets array. The legacy `[new PhantomWalletAdapter(), ...]` array is still supported for older wallets but is increasingly unnecessary.

**Next.js App Router pattern (recommended):**
```tsx
// app/providers.tsx ("use client")
"use client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_RPC ?? clusterApiUrl("devnet"), []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```
Mount `<Providers>` in `app/layout.tsx`. Wallet Standard discovery happens automatically — `wallets={[]}` is correct.

**`useWallet` + Anchor program pattern:**
```tsx
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import idl from "@/lib/trading_vault.json";

export function useTradingVault() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    return new Program(idl as any, provider);
  }, [wallet, connection]);
}
```

**Deposit/withdraw UX recommendations (battle-tested patterns from Solana DeFi UIs):**
- Show vault PDA address + on-chain balance up front. Don't make the user think.
- Two amount inputs: SOL and devUSDC, each with MAX button (subtract 0.01 SOL for fees on the SOL one).
- One-click "request airdrop" button on devnet. Use `https://faucet.solana.com` for SOL, `https://everlastingsong.github.io/nebula/` for devUSDC.
- For deposits, simulate via `program.methods.deposit().simulate()` first; show expected post-balance.
- Transaction status with explorer link on success.
- Keep daily-spending-limit and slippage-cap fields editable in a "Settings" pane that calls a `update_config` instruction.

---

### Section 6 — Anchor Program Architecture for the Trading Vault

**State accounts.** Two PDA types per user:
1. **Vault config** (small): `seeds=[b"vault", user.key().as_ref()]`. Stores `bump`, `authority`, `daily_spend_limit`, `daily_spent`, `last_reset_ts`, `slippage_bps_cap`, `whitelisted_tokens: [Pubkey; N]`, `whitelisted_pools: [Pubkey; M]`, `paused: bool`.
2. **Vault token ATAs**: ATAs of the *Vault PDA*, derived with the Associated Token Program. NOT separate PDAs you create — use Anchor's `associated_token::AssociatedToken` with `init_if_needed`.

**Cargo.toml (programs/trading_vault/):**
```toml
[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-idl = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build", "whirlpool/no-entrypoint"]

[dependencies]
anchor-lang = { version = "0.31.1", features = ["init-if-needed"] }
anchor-spl  = { version = "0.31.1", features = ["token", "token_2022", "associated_token"] }
# Orca CPI — pull the published whirlpool crate (anchor-gen generated CPI helpers)
whirlpool = { version = "0.30.0", features = ["cpi"] } # name and version per orca-so/whirlpools-cpi-examples Cargo.anchor-v0_31_1.toml
```

**Key Rust patterns:**

```rust
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked},
};

declare_id!("YourVaultProgramId1111111111111111111111111");

#[program]
pub mod trading_vault {
    use super::*;

    pub fn init_vault(ctx: Context<InitVault>, daily_limit: u64, slippage_bps: u16) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.bump = ctx.bumps.vault;
        v.authority = ctx.accounts.user.key();
        v.daily_spend_limit = daily_limit;
        v.daily_spent = 0;
        v.last_reset_ts = Clock::get()?.unix_timestamp;
        v.slippage_bps_cap = slippage_bps;
        v.paused = false;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to:   ctx.accounts.vault_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        transfer_checked(cpi, amount, ctx.accounts.mint.decimals)
    }

    pub fn execute_swap(
        ctx: Context<ExecuteSwap>,
        amount_in: u64,
        min_amount_out: u64,
        a_to_b: bool,
        sqrt_price_limit: u128,
    ) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        require!(!v.paused, VaultError::Paused);

        // daily reset (24h rolling)
        let now = Clock::get()?.unix_timestamp;
        if now - v.last_reset_ts >= 86_400 { v.daily_spent = 0; v.last_reset_ts = now; }
        v.daily_spent = v.daily_spent.checked_add(amount_in).ok_or(VaultError::Overflow)?;
        require!(v.daily_spent <= v.daily_spend_limit, VaultError::DailyLimitExceeded);

        // Whitelist pool
        require!(
            v.whitelisted_pools.contains(&ctx.accounts.whirlpool.key()),
            VaultError::PoolNotWhitelisted
        );

        // Slippage check (compare to a Pyth-derived expected, OR enforce min_out is >= 99%-slippage_cap)
        // ... (off-chain Pyth oracle quote also recommended)

        // CPI to Orca Whirlpools swap, signed by vault PDA
        let user_key = v.authority;
        let bump = [v.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", user_key.as_ref(), &bump]];

        whirlpool::cpi::swap(
            CpiContext::new_with_signer(
                ctx.accounts.whirlpool_program.to_account_info(),
                whirlpool::cpi::accounts::Swap {
                    token_program: ctx.accounts.token_program.to_account_info(),
                    token_authority: ctx.accounts.vault.to_account_info(), // PDA signs
                    whirlpool: ctx.accounts.whirlpool.to_account_info(),
                    token_owner_account_a: ctx.accounts.vault_ata_a.to_account_info(),
                    token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
                    token_owner_account_b: ctx.accounts.vault_ata_b.to_account_info(),
                    token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
                    tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
                    tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
                    tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
                    oracle: ctx.accounts.oracle.to_account_info(),
                },
                signer_seeds,
            ),
            amount_in,
            min_amount_out,
            sqrt_price_limit,
            true, // amount_specified_is_input
            a_to_b,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)] pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)] pub user: Signer<'info>,
    #[account(seeds=[b"vault", user.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = user)]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed, payer = user,
        associated_token::mint = mint, associated_token::authority = vault
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account] #[derive(InitSpace)]
pub struct Vault {
    pub bump: u8,
    pub authority: Pubkey,
    pub daily_spend_limit: u64,
    pub daily_spent: u64,
    pub last_reset_ts: i64,
    pub slippage_bps_cap: u16,
    #[max_len(8)] pub whitelisted_tokens: Vec<Pubkey>,
    #[max_len(8)] pub whitelisted_pools: Vec<Pubkey>,
    pub paused: bool,
}

#[error_code] pub enum VaultError {
    #[msg("Vault paused")]              Paused,
    #[msg("Daily limit exceeded")]      DailyLimitExceeded,
    #[msg("Pool not whitelisted")]      PoolNotWhitelisted,
    #[msg("Slippage too tight")]        SlippageTooTight,
    #[msg("Arithmetic overflow")]       Overflow,
}
```

**Token program choice:** Use `InterfaceAccount<Mint>` / `InterfaceAccount<TokenAccount>` and `Interface<TokenInterface>`. This auto-handles both classic SPL Token AND Token-2022. devUSDC and SOL are classic SPL today, but writing the interface variant means you don't have to refactor when Token-2022 mints appear in your whitelist. Reference: Anchor's official tokens docs explicitly recommend `anchor-spl/token_interface` for new programs.

**Compute Unit budget for the swap CPI:**
- Vanilla SPL `transfer` CPI: ~5,000 CU.
- Orca Whirlpools `swap` CPI (single hop): typically **120,000–180,000 CU** depending on tick crossings (more crossings = more CU).
- Two-hop swap: **260,000–400,000 CU**.
- Default tx limit is 200,000 CU. **Always prepend `ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })` for single-hop and 800,000 for two-hop.**
- Dynamic option: Orca SDK has `setComputeUnitMarginMultiplier(1.1)` to add 10% headroom automatically.

**Whirlpools CPI account list (for your IDL):**
- `token_program` (classic Token program for the vaults; if Token-2022 pool, use Token-2022 interface)
- `token_authority` (your vault PDA)
- `whirlpool` (the pool, mut)
- `token_owner_account_a` (vault ATA for token A, mut)
- `token_vault_a` (pool's vault for token A, mut)
- `token_owner_account_b` (vault ATA for token B, mut)
- `token_vault_b` (pool's vault for token B, mut)
- `tick_array_0`, `tick_array_1`, `tick_array_2` (mut) — for the direction of the swap, derived from current tick + spacing. The Orca SDK has helpers for this; you'll typically pass them in via the client.
- `oracle` PDA (sometimes mut for AdaptiveFee pools — pass as remaining_accounts if needed)

**Account validation patterns (whitelist enforcement):**
```rust
require!(v.whitelisted_pools.contains(&ctx.accounts.whirlpool.key()), VaultError::PoolNotWhitelisted);
require!(v.whitelisted_tokens.contains(&ctx.accounts.mint.key()), VaultError::TokenNotWhitelisted);
```
Add a separate `add_whitelist_token / remove_whitelist_token` instruction guarded by `has_one = authority`.

**Slippage cap enforcement:** Compute expected_out off-chain from Pyth + Whirlpool quote, send min_amount_out = expected * (1 - slippage_bps_cap/10000). The on-chain program verifies `min_amount_out >= expected * (1 - cap)` by re-deriving expected via Pyth (optional, more secure) OR just by trusting the client's min_out (cheaper, since Whirlpool itself enforces the floor). For hackathon, trust client min_out + enforce slippage_bps_cap as a sanity check.

**Daily reset:** Use `Clock::get()?.unix_timestamp` and a 86_400-second rolling window. Reset `daily_spent = 0` whenever `now - last_reset_ts >= 86_400`. (Done above.)

---

### Section 7 — Pyth Price Oracle on Devnet

**Architecture: use the pull oracle (`pyth-solana-receiver`).** Pythnet is the legacy push model; for current Solana devnet integrations, use the receiver pattern.

**SOL/USD feed identifier** (same on mainnet and devnet, since price update accounts are per-shard):
- Hex feed ID: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`
- Use `pyth_solana_receiver_sdk::price_update::get_feed_id_from_hex(...)` in Rust.

**Sponsored Price Feed Accounts (continuously updated by Pyth Data Association on shard 0 — read directly off-chain or from your program):**
- Look up via `pythSolanaReceiver.getPriceFeedAccountAddress(0, SOL_PRICE_FEED_ID)` in TS. This deterministically derives the address (a different shard ID such as 1 will give a different account, useful if you want to insulate from another app's congestion).
- Common feeds available on devnet (sponsored): SOL/USD, BTC/USD, ETH/USD, USDC/USD, USDT/USD, plus most major majors. The full sponsored list is at `docs.pyth.network/price-feeds/core/push-feeds/solana`.

**On-chain Anchor pattern (Rust):**
```rust
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

pub const FEED_ID: &str = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
pub const MAX_AGE_SEC: u64 = 60;

#[derive(Accounts)]
pub struct UseSolPrice<'info> {
    pub price_update: Account<'info, PriceUpdateV2>,
}

pub fn read_sol_usd(ctx: Context<UseSolPrice>) -> Result<i64> {
    let p = ctx.accounts.price_update.get_price_no_older_than(
        &Clock::get()?,
        MAX_AGE_SEC,
        &get_feed_id_from_hex(FEED_ID)?,
    )?;
    // p.price * 10^p.exponent (exponent is negative)
    Ok(p.price)
}
```
Anchor's `Account<'info, PriceUpdateV2>` automatically validates the account is owned by the Pyth receiver program — that's your protection against a fake account.

**TypeScript SDK to read prices off-chain** (`@pythnetwork/pyth-solana-receiver` v0.13.0):
```ts
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
const receiver = new PythSolanaReceiver({ connection, wallet });
const SOL_FEED = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const acct = receiver.getPriceFeedAccountAddress(0, SOL_FEED).toBase58();
const info = await connection.getAccountInfo(new PublicKey(acct));
// decode using the receiver's IDL or use Hermes (https://hermes.pyth.network/v2/updates/price/latest?ids[]=...)
```

For your x402 oracle service, the simplest path: **call Hermes** (`https://hermes.pyth.network/v2/updates/price/latest?ids[]=ef0d8b...`) for fresh price + confidence + publish_time, then return:
```json
{ "feed": "SOL/USD", "price": "175.42", "conf": "0.0153", "publishTime": 1715000000, "stale": false }
```
Mark `stale: true` if `now - publishTime > 30s`.

---

### Section 8 — Custom x402 Service Architecture

**Two services to deploy:**
1. **`oracle-service`** — `GET /price/sol-usd` — gated at $0.001/call, returns Pyth-fresh SOL/USD price + confidence interval.
2. **`swap-analyzer-service`** — `POST /analyze` with `{ inputMint, outputMint, amount }` — gated at $0.005/call, queries Whirlpools devnet pools and returns best route + expected slippage.

**Hosting (free tier, Node 20):**
| Provider | Free Tier | Verdict |
|---|---|---|
| **Railway** | $5 trial credit + $5/mo Hobby plan with sleep on inactivity | **Best** — easy GitHub deploy, env vars, instant HTTPS. |
| **Render** | Free tier (sleeps after 15min idle, ~50s cold start) | Fine; cold start is ugly during a hackathon demo. |
| **Fly.io** | $5/mo free credit, persistent | Best if you want low cold-start. |
| **Vercel** | Free; serverless functions | Fine for stateless x402 endpoints. Use Edge Runtime carefully — `@x402/svm` may need Node runtime due to `@solana/web3.js` polyfills. |
| **Cloudflare Workers** | Generous free | Use only with `@cloudflare/x402` (Cloudflare Workers x402 SDK exists since 2025) — they have first-class x402 support. |

For hackathon: **Railway** is the right answer. Push GitHub repo, set env vars (`MERCHANT_ADDRESS`, `RPC`, `FACILITATOR_URL=https://facilitator.payai.network`), done.

**Verifying the payment (server side, using `@x402/express`):** the middleware does it. You don't write verification code; you set the price. After settle, request continues to your handler.

If you want manual verification (e.g. to refund on internal failure):
```ts
import { ExactSvmFacilitator } from "@x402/svm";
const fac = new ExactSvmFacilitator({ connection: new Connection(RPC) });
const verified = await fac.verify(paymentPayload, paymentRequirements);
if (!verified.isValid) return res.status(402).json({error:"invalid payment"});
try {
  const result = await doYourWork();   // e.g. fetch Pyth, run analysis
  await fac.settle(paymentPayload, paymentRequirements);   // settle ONLY on success
  return res.json(result);
} catch (e) {
  return res.status(500).json({error:"service failed; payment not settled"});
}
```
This pattern (verify → work → settle) gives you free refund semantics — if your handler throws, you simply don't call `settle` and the client's signed tx is never broadcast.

If you've already settled and need to manually refund (rare), do a normal SPL `TransferChecked` from your merchant ATA back to `payer` with a memo `x402-refund:<original-sig>`.

**Rate limiting & security:**
- Use `express-rate-limit` per IP (e.g. 60 req/min) to prevent free pre-402 probing.
- Always validate `req.body` with `zod` before doing any compute.
- Set short read timeout (5s) on Pyth Hermes calls.
- Consider replay protection: cache `payer + recent blockhash + amount` for ~120s; reject duplicates.
- Set CORS narrowly (`origin: [yourFrontendUrl]`); MCP servers don't need CORS (they call from Node).
- Run on HTTPS in production (Railway/Render/Fly do this automatically).

---

### Section 9 — Orca Whirlpools CPI Details

**Program IDs (CONFIRMED from `whirlpool/src/lib.rs` and dev.orca.so):**
| Network | Program ID | WhirlpoolsConfig |
|---|---|---|
| Solana mainnet | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | `2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ` |
| **Solana devnet** | **`whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` (SAME)** | **`FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR`** |
| Eclipse mainnet | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | `FVG4oDbGv16hqTUbovjyGmtYikn6UBEnazz6RVDMEFwv` |
| Eclipse testnet | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` | `FPydDjRdZu9sT7HVd6ANhfjh85KLq21Pefr5YWWMRPFp` |

**Anchor CPI integration steps (from `orca-so/whirlpools-cpi-examples` — official):**
1. Choose `whirlpool` (the published `whirlpool` crate generated from Orca's IDL with `anchor-gen`) as a dependency.
2. For Anchor 0.31.1, the example provides `Cargo.anchor-v0_31_1.toml` — copy it. **No `cargo update solana-program` patch needed for 0.31.1.**
3. Install Solana CLI 2.1.0 (the one Orca tested 0.31.1 against).
4. Use `whirlpool::cpi::swap(...)`, `whirlpool::cpi::two_hop_swap(...)`, `whirlpool::cpi::open_position(...)`, `whirlpool::cpi::collect_fees(...)`, `whirlpool::cpi::update_fees_and_rewards(...)` as needed. Each takes a `CpiContext` with the appropriate `whirlpool::cpi::accounts::*` struct.

**Tick array considerations:**
- The pool's current tick determines the active tick array. A swap can cross **up to 3 tick arrays** in the swap direction (this is why the Swap account list has `tick_array_0/1/2`).
- Off-chain, derive these via Orca SDK helpers: `getTickArrayPdasFromCurrentTick(whirlpool, aToB)` returns the three needed PDAs.
- `tick_array_0` is the array containing the current tick. `tick_array_1` and `tick_array_2` are the next two in the direction of the swap.
- For SOL/devUSDC ts=64, tick spacing is 64 → each tick array covers 88 ticks * 64 = 5632 tick range.
- Mark all three as mut. They only get written if the swap actually crosses them, but Solana account locking requires declaring them upfront.

**Important: AdaptiveFee pools** — modern Whirlpools introduced adaptive fees. If a pool uses AdaptiveFee, the `oracle` account must be passed as **mut** (in remaining_accounts or directly). For the SOL/devUSDC ts=64 devnet pool, this is currently NOT an adaptive-fee pool, so `oracle` can be passed read-only. But check: read `whirlpool.feeTierIndexSeed` and `whirlpool.adaptiveFeeInfo` in the account data and branch.

**Reference implementations to study:**
- `orca-so/whirlpools-cpi-examples` — the canonical CPI reference. Look at `programs/whirlpool-cpi/src/instructions/swap.rs` specifically.
- `tomtomdu73`'s dev.to article (Nov 27, 2025) — collecting fees/rewards via CPI; same patterns apply to swap.
- `whirlpools/programs/whirlpool/src/instructions/swap.rs` — the on-chain implementation source if you need to understand validation rules.

---

### Section 10 — Project Structure Best Practices

**Verdict for a hackathon: monorepo with pnpm workspaces. Skip Turborepo — overkill for hackathon timelines.**

**Recommended folder layout:**
```
solana-ai-trading-agent/
├── pnpm-workspace.yaml
├── package.json              # root, devDependencies only
├── tsconfig.base.json        # shared TS config
├── .nvmrc                    # node 22
├── rust-toolchain.toml       # rustc 1.84.1
├── Anchor.toml               # at root (Anchor monorepo style)
├── programs/
│   └── trading_vault/        # Anchor program
│       ├── Cargo.toml
│       └── src/lib.rs
├── target/                   # Anchor build output (gitignored)
├── apps/
│   ├── web/                  # Next.js frontend
│   │   ├── package.json      # depends on @workspace/idl, @workspace/sdk
│   │   ├── app/
│   │   └── components/
│   ├── mcp-server/           # Claude Desktop MCP server
│   │   ├── package.json      # bin entry: solana-trading-agent-mcp
│   │   └── src/index.ts
│   ├── oracle-service/       # x402 oracle endpoint
│   │   ├── package.json
│   │   └── src/server.ts
│   └── swap-analyzer-service/  # x402 routing endpoint
│       ├── package.json
│       └── src/server.ts
├── packages/
│   ├── idl/                  # generated IDL + TypeScript types from anchor build
│   │   ├── package.json      # exports: trading_vault.json + trading_vault.ts
│   │   └── src/
│   ├── sdk/                  # thin TS SDK wrapping Anchor calls (used by web + mcp)
│   │   └── src/index.ts      # depositTx(), executeSwapTx(), getBestRoute() etc.
│   └── x402-client/          # shared x402 wrapper used by mcp-server
│       └── src/index.ts
├── tests/                    # Anchor tests (TypeScript, mocha)
│   └── trading_vault.spec.ts
└── README.md
```

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Sharing TypeScript config** — `tsconfig.base.json` at root:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  }
}
```
Each package extends it: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "./dist", "rootDir": "./src" }, "include": ["src"] }`.

**Workspace package linking:** `"@workspace/sdk": "workspace:*"` in dependent `package.json` files.

**Why pnpm (vs npm/yarn):**
- Strict node_modules → catches phantom deps which Anchor + web3.js conflicts can introduce.
- Faster CI installs.
- The Solana ecosystem (Orca's repo, sendaifun's repo, Coinbase's x402 repo) all use pnpm — copy/pasting their patterns is friction-free.

**CI/CD recommendation: SKIP for hackathon.** Build artifacts manually, deploy from local. If you really want CI, GitHub Actions with `pnpm install --frozen-lockfile && pnpm build` is the minimum.

**Deployment summary:**
| Component | Destination |
|---|---|
| Anchor program | `anchor deploy --provider.cluster devnet` |
| `apps/web` | Vercel (`vercel --prod`) |
| `apps/mcp-server` | npm registry (`pnpm publish`) — users install via Claude Desktop |
| `apps/oracle-service` | Railway |
| `apps/swap-analyzer-service` | Railway |

---

## Caveats

1. **x402 SDK security**: `@x402/svm` versions `< 2.6.0` had a critical Ed25519 verification bypass (GHSA-qr2g-p6q7-w82m) that lets attackers bypass payments entirely. Pin `>=2.6.0` everywhere, and re-check NPM advisory before publishing — there could be more patches by the time Claude Code builds this.
2. **Jupiter on devnet is NOT real**. Saying "the agent uses Jupiter aggregation" on devnet would be misleading. The system can route between **multiple Orca Whirlpool pools (different tick spacings)** and present this as aggregation. For accurate marketing, either (a) call it an "Orca multi-pool aggregator" or (b) use mainnet for Jupiter while still running the program on devnet (impossible since pools are on different clusters). I recommend (a).
3. **Two devUSDC mints exist** and they are NOT the same SPL token: Orca's `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` is what the pools trade against; Circle's `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` is what x402 facilitators expect. Your trading vault should hold Orca's devUSDC (for swaps), and your trading wallet's *gas/payment* wallet should hold Circle's devUSDC (for x402). Document this clearly to avoid user confusion.
4. **Anchor 1.0.x exists and is stable** but Orca's CPI examples haven't shipped a Cargo.toml template for it as of May 2026. Sticking with **0.31.1** is the conservative choice; if Orca publishes 1.0 templates before you build, switch up. Re-check `github.com/orca-so/whirlpools-cpi-examples` at build time.
5. **MCP SDK v2 is pre-alpha**. Targeted Q1 2026 stable, but development can slip. For a hackathon, do NOT adopt the v2 branch — its API will change. Stay on v1.x.
6. **`@solana/web3.js` v2 (`@solana/kit`) does NOT work with `@coral-xyz/anchor`**. Orca's new `@orca-so/whirlpools` uses kit, but Anchor's TS client uses web3.js v1. You will end up with both in your dependency tree. This works but is mildly annoying. Avoid mixing keypair types — convert at the boundary using `Keypair.fromSecretKey(...)` ↔ `createKeyPairSignerFromBytes(...)`.
7. **Pyth feed staleness on devnet**: sponsored feeds on shard 0 are continuously updated, but devnet sometimes has slower update cadence than mainnet. Always pass `MAX_AGE_SEC = 60` (more lenient than mainnet's typical 30s) and gracefully error.
8. **Whirlpools swap CPI compute units depend on tick crossings**. A swap that crosses many ticks (volatile market) can exceed 200K CU even for a single hop. Always set `setComputeUnitLimit(400_000)` for safety; can drop later after benchmarking.
9. **Devnet faucets are rate-limited.** SOL airdrop limit is ~2 SOL per request and frequently fails. Use `https://faucet.solana.com` (better limits with GitHub login) and the Orca Nebula faucet for devTokens. Have backup funded wallets prepared for the demo.
10. **Claude Desktop ENV variables on Windows** sometimes don't expand `${APPDATA}`. If your published MCP server reads `%APPDATA%`, document the workaround of setting `APPDATA` explicitly in the `env` block of `claude_desktop_config.json`. Also remind users to fully `Cmd+Q` (macOS) or "End task" (Windows) Claude Desktop after editing the config — not just close the window.
11. **`@x402/svm` API surface evolved**. Older docs reference `registerExactSvmScheme(client, { signer })`, while newer (v2.6+) docs use `new ExactSvmClient(svmSigner)` registered to the client via `.register("solana:*", new ExactSvmClient(signer))`. Both forms appear in Coinbase's own example code in May 2026; check the package's README at install time and adjust.
12. **Raydium devnet is effectively dead** for testing as of mid-2025. The `raydium-sdk-v1` repo is archived. If Claude Code is told to "include Raydium," redirect to Orca-only.
13. **The WhirlpoolsConfig devnet address `FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR` is also used as a "Standard Config"** — it is correctly the address you want for devnet pools listed in this report. Don't be confused by Orca docs that show multiple configs (token-2022 config, etc.); for this project, use this one.