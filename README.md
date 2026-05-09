# Solana AI Trading Agent

AI-powered DeFi trading vault on Solana devnet. Users deposit SOL/devUSDC into a per-user PDA vault, then a Claude Desktop MCP agent (or the web UI) executes swaps through Orca Whirlpools with daily-spend, slippage, and pool/token whitelist guards. Two x402-gated micropayment services (oracle + multi-pool route analyzer) round out the agent toolbox.

## Architecture

```
┌─────────────────┐      ┌──────────────────┐
│  Next.js Web    │      │  Claude Desktop  │
│  (wallet UI)    │      │   (MCP client)   │
└────────┬────────┘      └────────┬─────────┘
         │                         │
         │           ┌─────────────┴─────────────┐
         │           │  solana-trading-agent-mcp │
         │           │   (8 tools, x402 client)  │
         │           └─────┬───────────────┬─────┘
         │                 │               │
         ├─────────────────┤               │
         │                 │               │
         ▼                 ▼               ▼
┌──────────────────┐  ┌─────────────┐  ┌──────────────┐
│  trading_vault   │  │   oracle-   │  │swap-analyzer-│
│ (Anchor on-chain)│  │   service   │  │   service    │
│ Whirlpools CPI   │  │ Pyth $0.001 │  │ Orca $0.005  │
└──────────────────┘  └─────────────┘  └──────────────┘
        │                    │                  │
        ▼                    ▼                  ▼
   Orca Whirlpools     Pyth Hermes       3 Orca Pools
   (devnet)            (SOL/USD feed)    (ts=64, ts=8, Splash)
```

## Repository layout

```
dev3pack_hack/
├── programs/trading_vault/        # Anchor 0.31.1 vault program (Rust)
├── apps/
│   ├── web/                       # Next.js 15 frontend, wallet adapter
│   ├── mcp-server/                # Claude Desktop MCP server (8 tools)
│   ├── oracle-service/            # x402-gated Pyth SOL/USD endpoint
│   └── swap-analyzer-service/     # x402-gated Orca multi-pool analyzer
├── packages/
│   ├── idl/                       # Anchor IDL JSON + TS types
│   ├── sdk/                       # Shared SDK (used by web + mcp)
│   └── x402-client/               # x402/svm client wrapper
└── tests/                         # Anchor mocha/chai test suite
```

## Requirements

| Tool | Version |
|---|---|
| Node.js | >=22 |
| pnpm | >=9 |
| Rust | 1.84.1 |
| Solana CLI | 2.1.0 |
| Anchor CLI | 0.31.1 |

Install Solana 2.1.0 + Anchor:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.31.1 && avm use 0.31.1
```

## Setup steps

### 1. Install JS dependencies

```bash
pnpm install
```

### 2. Build the Anchor program

```bash
anchor build
```

This generates `target/idl/trading_vault.json` and `target/types/trading_vault.ts`. Copy them into `packages/idl/src/` so the SDK and MCP server pick up the real IDL (the placeholder there is for type-checking only).

```bash
cp target/idl/trading_vault.json packages/idl/src/trading_vault.json
cp target/types/trading_vault.ts  packages/idl/src/trading_vault_types.ts
```

### 3. Deploy to devnet

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy --provider.cluster devnet
```

Copy the deployed program ID from the output and update:
- `Anchor.toml` → `[programs.devnet] trading_vault = "<NEW_ID>"`
- `programs/trading_vault/src/lib.rs` → `declare_id!("<NEW_ID>");`
- Each app's `.env` (`VAULT_PROGRAM_ID`, `NEXT_PUBLIC_VAULT_PROGRAM_ID`)

Then run `anchor build` and `anchor deploy` again so the on-chain ID matches.

### 4. Run the test suite

```bash
anchor test
```

### 5. Run the x402 services

```bash
cp apps/oracle-service/.env.example      apps/oracle-service/.env
cp apps/swap-analyzer-service/.env.example apps/swap-analyzer-service/.env
# Edit each .env: set MERCHANT_ADDRESS to your Solana pubkey

pnpm --filter oracle-service        dev   # http://localhost:4021
pnpm --filter swap-analyzer-service dev   # http://localhost:4022
```

For production, deploy each to **Railway** (per the dossier — best free-tier option). Set `MERCHANT_ADDRESS`, `RPC_URL`, `FACILITATOR_URL=https://facilitator.payai.network`.

### 6. Run the frontend

```bash
cp apps/web/.env.example apps/web/.env.local
# Edit: NEXT_PUBLIC_VAULT_PROGRAM_ID, NEXT_PUBLIC_ORACLE_SERVICE_URL, NEXT_PUBLIC_SWAP_ANALYZER_URL

pnpm --filter web dev   # http://localhost:3000
```

Get devnet tokens:
- **SOL**: `solana airdrop 2` or https://faucet.solana.com (GitHub login = better limits)
- **devUSDC** (Orca's, for swaps): https://everlastingsong.github.io/nebula/
- **Circle USDC** (for x402 payments): Solana faucet or Circle's devnet faucet

### 7. Publish + use the MCP server in Claude Desktop

Build:

```bash
pnpm --filter solana-trading-agent-mcp build
```

Publish to npm:

```bash
cd apps/mcp-server && npm publish --access public
```

Then add to Claude Desktop config (`~/.config/Claude/claude_desktop_config.json` on Linux, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "npx",
      "args": ["-y", "solana-trading-agent-mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 trading wallet key — DEDICATED hot wallet, low balance>",
        "VAULT_PROGRAM_ID": "<your deployed program id>",
        "X402_BASE_URL": "https://your-services.railway.app",
        "X402_FACILITATOR_URL": "https://facilitator.payai.network"
      }
    }
  }
}
```

Fully restart Claude Desktop (Cmd+Q on macOS, End-task on Windows). The 8 tools should appear: `get_vault_info`, `deposit_to_vault`, `withdraw_from_vault`, `get_best_quote`, `execute_swap`, `get_sol_price`, `analyze_routes`, `update_vault_config`.

## Critical security notes

1. **Use a dedicated hot wallet** for `SOLANA_PRIVATE_KEY` in the MCP config — never your main key. The MCP can sign anything.
2. **`@x402/svm` must be `>=2.6.0`** — older versions have CVE GHSA-qr2g-p6q7-w82m (signature bypass). All package.json files in this repo are pinned correctly.
3. **Two devUSDC mints exist and they are NOT the same**:
   - **Orca devUSDC** `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k` → for SWAPS in the vault
   - **Circle devUSDC** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` → for x402 PAYMENTS
4. **Daily spend limit and pool/token whitelist** are enforced on-chain — set them in `init_vault` and tune via `update_config`/`add_whitelist_*` instructions.
5. **Compute units**: prepend `ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })` to any tx that calls `execute_swap` (single-hop). Two-hop = 800k.

## Tech reference

| Layer | Tech |
|---|---|
| On-chain | Anchor 0.31.1, Token-2022 via `InterfaceAccount`, Orca Whirlpools CPI |
| Backend | Express + `@x402/express` + `@x402/svm` v2 + Pyth Hermes + Orca SDK |
| MCP | `@modelcontextprotocol/sdk` 1.29.0 (stdio) + `@x402/axios` auto-pay |
| Frontend | Next.js 15, `@solana/wallet-adapter-react` 0.15.39, `@coral-xyz/anchor` 0.31.x |
| Facilitator | PayAI (`https://facilitator.payai.network`) — free, no API key, devnet-ready |

## Caveats (from Project.md dossier)

- Jupiter routing on devnet does NOT exist; the "aggregator" here = 3 Orca tick-spacing variants (ts=64, ts=8, Splash).
- Raydium devnet is effectively dead; do not add it.
- MCP SDK v2 is pre-alpha — stay on v1.x.
- `@solana/web3.js` v2 (`@solana/kit`) doesn't work with `@coral-xyz/anchor` yet; both libs coexist in this repo and you convert keypairs at the boundary.
- Devnet faucets are rate-limited; have backup funded wallets ready for the demo.
