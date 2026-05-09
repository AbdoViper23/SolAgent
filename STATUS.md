# Project Status — Solana AI Trading Agent

Snapshot of what works today, what's stubbed, and the exact remaining steps to reach end-to-end.

## ✅ Builds (all pass `pnpm -r build`)

- `programs/trading_vault` — Anchor 0.31.1 source compiles when you run `anchor build` (needs Solana toolchain installed)
- `packages/idl` — wraps `trading_vault.json` + TS types, exported as `@workspace/idl`
- `packages/sdk` — devnet constants + helpers (`getVaultPda`, `getBestSwapQuote`, etc.)
- `packages/x402-client` — wraps `@x402/axios` + `registerExactSvmScheme`
- `apps/oracle-service` — Express server, Pyth Hermes feed at `/price/sol-usd`
- `apps/swap-analyzer-service` — Express server, Orca v7 `swapInstructions` quote across 3 pools at `/analyze`
- `apps/mcp-server` — stdio MCP server with **9 tools** (see below)
- `apps/web` — Next.js 15 app, wallet adapter, real `Program` instance via `useTradingVault`

## 🛠 MCP tools (apps/mcp-server)

| Tool | Status | Notes |
|---|---|---|
| `init_vault` | wired | Calls `program.methods.initVault(dailyLimitLamports, slippageBps)` |
| `get_vault_info` | wired | Reads PDA + SOL/devUSDC balances |
| `deposit_to_vault` | wired | Calls `program.methods.deposit(amount)` with full account list |
| `withdraw_from_vault` | wired | Calls `program.methods.withdraw(amount)` with `authority = vault` PDA |
| `update_vault_config` | wired | Updates daily limit, slippage cap, paused flag |
| `get_best_quote` | wired (via x402) | HTTP POST to `swap-analyzer-service` |
| `analyze_routes` | wired (via x402) | Same endpoint, raw response |
| `get_sol_price` | wired (via x402) | HTTP GET to `oracle-service` |
| `send_token` | wired | SOL or SPL transfer from hot wallet → recipient |
| `execute_swap` | **partial** — see below | The vault `executeSwap` instruction needs tick_array PDAs from Orca SDK; the current call passes `whirlpool` + `whirlpoolProgram` only |

### `execute_swap` — what's missing

The Anchor instruction expects: `whirlpool, vaultAtaA, vaultAtaB, tokenVaultA, tokenVaultB, tickArray0, tickArray1, tickArray2, oracle, whirlpoolProgram, tokenProgram`. Right now the MCP only passes 4 of those.

To finish it: in the tool handler, fetch the `Whirlpool` account, derive the three tick-array PDAs for the swap direction, and pass everything in `.accounts({...})`. The Orca v7 SDK has these helpers — see `swapInstructions` in `@orca-so/whirlpools`. For a hackathon-grade fix you can also do the full swap from the hot wallet directly via Orca SDK and skip the vault path.

## ⚠️ x402 payment middleware

**Currently disabled.** The `@x402/express` API changed in v2.11 and the workers wrote against the older `paymentMiddleware(merchantAddress, routes, facilitator)` signature. New API is `paymentMiddleware(routes, server, paywallConfig?)` where `server` is a configured `x402ResourceServer` with an `ExactSvmScheme` registered.

The endpoints are open right now so you can validate the data flow. To re-enable, see the TODO comment in `apps/oracle-service/src/server.ts` and `apps/swap-analyzer-service/src/server.ts`.

## 🚧 What you still need to do (with toolchain)

These cannot be done from inside Claude Code without your explicit approval — they download tools or sign transactions on devnet.

### 1. Install the Solana toolchain (one-time, ~20 min)

```bash
# Rust 1.84.1
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.84.1 --profile minimal
source ~/.cargo/env

# Solana CLI 2.1.0
sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Anchor CLI 0.31.1 (slow — cargo install takes 10–15 min)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1

# Verify
solana --version && anchor --version && rustc --version
```

### 2. Configure devnet wallet + airdrop

```bash
solana config set --url https://api.devnet.solana.com
solana-keygen new --outfile ~/.config/solana/id.json --no-bip39-passphrase
solana airdrop 2
```

### 3. Build + deploy the Anchor program

```bash
cd ~/Projects/solana/dev3pack_hack
anchor build
anchor deploy --provider.cluster devnet
# Note the deployed program ID from the output
```

### 4. Sync the deployed program ID

Replace `YourVaultProgramId1111111111111111111111111` with the real ID in three places:

```bash
PROGRAM_ID=<paste from anchor deploy output>

# In source code
sed -i "s/YourVaultProgramId1111111111111111111111111/$PROGRAM_ID/" \
  programs/trading_vault/src/lib.rs \
  Anchor.toml \
  apps/web/.env.local \
  apps/oracle-service/.env \
  apps/swap-analyzer-service/.env

# Rebuild Rust + redeploy with the embedded ID
anchor build && anchor deploy --provider.cluster devnet

# Copy the freshly generated IDL into the workspace package
cp target/idl/trading_vault.json     packages/idl/src/trading_vault.json
cp target/types/trading_vault.ts     packages/idl/src/trading_vault_types.ts
```

### 5. Run everything

```bash
# Terminal 1
pnpm --filter oracle-service dev

# Terminal 2
pnpm --filter swap-analyzer-service dev

# Terminal 3
pnpm --filter web dev
# open http://localhost:3000
```

### 6. Connect Claude Desktop to the MCP

```bash
pnpm --filter solana-trading-agent-mcp build
```

Get the private key (base58) for the merchant wallet — example using a JS one-liner:

```bash
node -e 'const fs=require("fs");const bs58=require("bs58");const k=JSON.parse(fs.readFileSync(require("os").homedir()+"/.config/solana/id.json"));console.log(bs58.encode(Uint8Array.from(k)));'
```

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "node",
      "args": ["/home/AbdoViper/Projects/solana/dev3pack_hack/apps/mcp-server/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 of your devnet hot wallet>",
        "VAULT_PROGRAM_ID": "<your deployed program id>",
        "X402_BASE_URL": "http://localhost:4022"
      }
    }
  }
}
```

Then **fully restart** Claude Desktop (End Task on Windows / Cmd+Q on macOS — closing the window isn't enough).

## 🧪 End-to-end test plan (after toolchain install + deploy)

1. **Web → init_vault**: open http://localhost:3000, connect Phantom (devnet), click any vault action — first transaction creates the PDA.
2. **Web → deposit**: deposit 0.5 SOL. Verify the vault SOL balance increases on-chain.
3. **Claude → quote**: ask "get me the best quote for 0.1 SOL to devUSDC". MCP calls `swap-analyzer-service` and returns the best of 3 pools.
4. **Claude → send**: ask "send 0.01 SOL to <address>". MCP calls `send_token`.
5. **Claude → price**: ask "what's the SOL/USD price". MCP calls `oracle-service`.
6. **Web → withdraw**: pull 0.1 SOL out of the vault.

Steps 3–5 run today (against the hot wallet directly). Step 2 and 6 require the program to be deployed and the IDL synced (steps 3 and 4 above in the install section).

## 🐛 Known limitations to fix later

1. `execute_swap` MCP tool needs Orca tick-array helpers wired in (see top of doc).
2. x402 payment gate is off — endpoints are free until middleware is rebuilt against v2.11.
3. The IDL in `packages/idl/src/trading_vault.json` is hand-written. Anchor's `target/idl/...` will differ slightly (account name casing, discriminator bytes) — overwrite with the real IDL after `anchor build`.
4. Windows-side `claude_desktop_config.json` is at `%APPDATA%\Claude\` — paths in `args` must be absolute Windows paths if you run Claude Desktop on Windows while the project lives in WSL.
