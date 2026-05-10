# SolAgent — AI Trading Vault on Solana

An AI-powered DeFi trading agent built on Solana devnet. Users deposit SOL or devUSDC into a personal on-chain vault (PDA), then let a Claude Desktop MCP agent or the web UI execute Orca Whirlpool swaps on their behalf — protected by on-chain daily-spend limits, slippage caps, and token/pool whitelists.

Two x402-gated microservices (Pyth oracle + multi-pool Orca route analyzer) form the agent's pricing and routing layer. An ElevenLabs voice interface is embedded in the web app so users can deposit, swap, and send tokens entirely by speaking — no button clicks needed.

## x402 Streaming Quotes

Before executing any swap, the agent pays a small x402 micropayment to open a **60-second live WebSocket** to the swap analyzer. During those 60 seconds, the best Orca route price streams in real time. The window exists so the user can reconsider — markets move, and locking in a price at quote time often means executing at a stale rate. The user confirms (or cancels) once they are satisfied with what they see, and only then does the vault CPI fire. The x402 payment is non-refundable and intentionally tiny (~$0.005 in devUSDC) to discourage abuse while keeping the flow frictionless.

## ElevenLabs Voice Trading

The web app includes a voice widget powered by ElevenLabs that lets users interact with their vault by talking. Supported intents: **deposit**, **swap**, and **send**. The agent parses the spoken command, shows a confirmation modal with the transaction details, and only signs on explicit user approval. Voice integration uses a server-side signed-URL API route so the ElevenLabs API key is never exposed to the browser.

## Live Demo

| | URL |
|---|---|
| **Web app** | https://solagent-web-production.up.railway.app |
| **Oracle service** | https://oracle-production-374d.up.railway.app |
| **Swap analyzer** | https://swap-analyzer-production.up.railway.app |

## Deployed Program

| Network | Program ID |
|---|---|
| **Devnet** | [`DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb`](https://explorer.solana.com/address/DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb?cluster=devnet) |

## Architecture

```
┌─────────────────┐      ┌──────────────────────────┐
│  Next.js Web    │      │     Claude Desktop        │
│  + ElevenLabs   │      │     (MCP client)          │
└────────┬────────┘      └────────────┬─────────────┘
         │                            │
         │               ┌────────────┴────────────┐
         │               │  solana-trading-agent   │
         │               │  MCP server (9 tools)   │
         │               │  x402 auto-pay client   │
         │               └──────┬──────────┬───────┘
         │                      │          │
         ├──────────────────────┤          │
         ▼                      ▼          ▼
┌─────────────────┐   ┌──────────────┐  ┌──────────────────┐
│ trading_vault   │   │   oracle-    │  │  swap-analyzer-  │
│ Anchor program  │   │   service    │  │     service      │
│ Orca Whirlpools │   │ Pyth $0.001  │  │  Orca $0.005     │
│ CPI on devnet   │   │ (x402-gated) │  │  (x402-gated)    │
└─────────────────┘   └──────────────┘  └──────────────────┘
```

## Solana Libraries & SDKs Used

| Library | Usage |
|---|---|
| `@coral-xyz/anchor` 0.31.1 | On-chain program framework (Rust + TS client) |
| `@solana/web3.js` 1.95 | Transaction building, account queries, RPC |
| `@solana/spl-token` 0.4 | ATA creation, WSOL wrapping, token transfers |
| `@solana/wallet-adapter-react` 0.15 | Browser wallet connection (Phantom, Solflare) |
| `@solana/kit` 2.x | Keypair / address utilities in MCP server |
| `@orca-so/whirlpools` 4.x | Multi-pool quote + swap instruction builder |
| `@pythnetwork/hermes-client` | Real-time SOL/USD price feed via Pyth Hermes |
| `@x402/svm` + `@x402/axios` | x402 micropayment protocol for service access |
| `@modelcontextprotocol/sdk` 1.29 | Claude Desktop MCP stdio server |

## Repository Layout

```
├── programs/trading_vault/          # Anchor 0.31.1 vault (Rust)
├── apps/
│   ├── web/                         # Next.js 15 + wallet adapter + ElevenLabs voice
│   ├── mcp-server/                  # Claude Desktop MCP server (9 tools)
│   ├── oracle-service/              # x402-gated Pyth oracle (Express)
│   └── swap-analyzer-service/       # x402-gated Orca route analyzer (Express)
├── packages/
│   ├── idl/                         # Anchor IDL JSON + TS types
│   ├── sdk/                         # Shared helpers (getVaultPda, getBestSwapQuote)
│   └── x402-client/                 # x402/svm wrapper
├── deploy/                          # Deploy guides + release script
└── INSTALL_MCP.md                   # End-user MCP setup for Claude Desktop
```

## On-Chain Program: `trading_vault`

Written in Rust with Anchor 0.31.1. Key instructions:

| Instruction | Description |
|---|---|
| `init_vault` | Creates a PDA vault for the signer with daily-spend limit + slippage cap |
| `deposit` | Transfers SPL tokens (WSOL or devUSDC) from user ATA → vault ATA |
| `withdraw` | Transfers tokens back to the user |
| `execute_swap` | CPI into Orca Whirlpools — checks whitelist + daily-spend guard |
| `add_whitelisted_token` | Governance: add a token mint to the allowed list |
| `add_whitelisted_pool` | Governance: add an Orca pool to the allowed list |
| `update_config` | Adjust daily limit, slippage cap, or pause the vault |

## MCP Tools (Claude Desktop)

Install the MCP server → see [INSTALL_MCP.md](./INSTALL_MCP.md).

| Tool | What it does |
|---|---|
| `init_vault` | Initialize a vault PDA on-chain |
| `get_vault_info` | Read SOL + devUSDC balances in your vault |
| `deposit_to_vault` | Deposit SOL or devUSDC into the vault |
| `withdraw_from_vault` | Withdraw tokens back to your wallet |
| `get_best_quote` | x402-paid: fetch best Orca route for a swap |
| `analyze_routes` | x402-paid: detailed multi-pool route breakdown |
| `get_sol_price` | x402-paid: live SOL/USD price from Pyth |
| `execute_swap` | Execute the swap on-chain through the vault |
| `update_vault_config` | Change daily limit / slippage / pause |

## Local Setup

### Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 22 |
| pnpm | ≥ 9 |
| Rust | 1.84+ |
| Solana CLI | 2.1.0 |
| Anchor CLI | 0.31.1 |

```bash
# Install Solana
sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.31.1 && avm use 0.31.1
```

### Install dependencies

```bash
pnpm install
```

### Build & deploy the Anchor program

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor build
anchor deploy --provider.cluster devnet
```

Update the program ID in `Anchor.toml`, `programs/trading_vault/src/lib.rs`, and each app's `.env`.

### Run services locally

```bash
# Oracle (port 4021)
cp apps/oracle-service/.env.example apps/oracle-service/.env
pnpm --filter oracle-service dev

# Swap analyzer (port 4022)
cp apps/swap-analyzer-service/.env.example apps/swap-analyzer-service/.env
pnpm --filter swap-analyzer-service dev

# Web (port 3000)
cp apps/web/.env.example apps/web/.env.local
# Set NEXT_PUBLIC_VAULT_PROGRAM_ID, NEXT_PUBLIC_ORACLE_SERVICE_URL, NEXT_PUBLIC_SWAP_ANALYZER_URL
pnpm --filter web dev
```

### Devnet tokens

- **SOL**: `solana airdrop 2` or https://faucet.solana.com
- **devUSDC** (for swaps): https://everlastingsong.github.io/nebula/ — mint `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k`
- **Circle devUSDC** (for x402 payments): Solana faucet or Circle's devnet faucet

### Run tests

```bash
anchor test
```

## MCP Setup for Claude Desktop

See [INSTALL_MCP.md](./INSTALL_MCP.md) for the full guide. The short version:

```bash
curl -L -o /tmp/mcp.tar.gz \
  https://github.com/AbdoViper23/SolAgent/releases/download/mcp-v0.1.4/solana-trading-agent-mcp-v0.1.4.tar.gz
mkdir -p ~/.local/share/solana-trading-agent-mcp
tar -xzf /tmp/mcp.tar.gz -C ~/.local/share/solana-trading-agent-mcp --strip-components=1
```

Then add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "node",
      "args": ["/absolute/path/to/solana-trading-agent-mcp/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 private key — dedicated low-balance wallet>",
        "VAULT_PROGRAM_ID": "DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb",
        "X402_BASE_URL": "https://swap-analyzer-production.up.railway.app",
        "X402_FACILITATOR_URL": "https://facilitator.payai.network"
      }
    }
  }
}
```

Restart Claude Desktop — the 9 tools will appear and you can start trading by conversation.

## Security Notes

- Use a **dedicated hot wallet** with only the funds you intend to trade. The MCP server holds the private key and can sign transactions.
- Daily spend limits and pool/token whitelists are enforced **on-chain** — not just client-side.
- `@x402/svm` is pinned to `~2.1.0` (compatible with `@solana/kit` v2 used across this repo).
