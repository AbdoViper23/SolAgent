# Chat 1 Summary — Solana AI Trading Agent

This file records what happened in this session: what was built, what broke, how we fixed it, and what to do next.

---

## What we started with

A Solana hackathon project with three parts already in place:
- **Anchor program** (`programs/trading_vault`) — vault PDA per user with daily limits, whitelisted tokens/pools, and an `execute_swap` CPI to Orca whirlpools.
- **MCP server** (`apps/mcp-server`) — 10 tools so Claude Desktop can talk to the vault and to two paid x402 services.
- **Two services** — `oracle-service` (Pyth price feeds) and `swap-analyzer-service` (multi-pool Orca quotes).
- **Next.js web app** (`apps/web`) — landing page + dashboard at `/app` and `/app/history`.

The whole stack was wired but **not deployed on-chain**: every file used the placeholder ID `YourVaultProgramId1111…1`.

---

## What we built in this chat

### 1. 60-second streaming quote subscription (paid via x402)

Problem: the swap-analyzer's old `/analyze` endpoint returned **one** quote. By the time the response reached the client, the price could have moved.

Solution: a paid WebSocket subscription. Client pays once via x402 → server streams every fresh quote for 60 seconds → closes.

Files added/changed:
- `apps/swap-analyzer-service/src/x402.ts` — wires x402 v2.1 `paymentMiddlewareFromConfig` with `HTTPFacilitatorClient` and a server-side `ExactSvmScheme`.
- `apps/swap-analyzer-service/src/streaming.ts` — `QuoteStreamHub` manages in-memory sessions, polls Orca every 500ms, pushes JSON ticks (`open` / `tick` / `heartbeat` / `closed`) over WSS.
- `apps/swap-analyzer-service/src/server.ts` — adds `POST /stream/quote/init` (x402-gated) and a WS upgrade handler at `/stream/quote/:sessionId`.
- `apps/mcp-server/src/index.ts` — new `stream_best_quote` MCP tool. Pays via x402, opens the WS, forwards every tick to Claude as an MCP `notifications/progress` message, returns final summary.
- New env vars in `.env.example`: `STREAM_DURATION_MS`, `STREAM_POLL_INTERVAL_MS`, `STREAM_HEARTBEAT_MS`, `STREAM_PRICE_USDC`, `STREAM_MAX_CONCURRENT`.

We hit a peer-dependency war (`@orca-so/whirlpools@7` and `@x402/svm@2.11` both required `@solana/kit ^5`, but the project is on `kit@2.3.0`). Fixed by pinning to versions that still support kit-2:
- `@orca-so/whirlpools` → `^4.0.0`
- `@orca-so/whirlpools-client` → `^5.0.0`
- `@x402/express`, `@x402/svm`, `@x402/core` → `~2.1.0`

Smoke-tested end-to-end:
- `POST /stream/quote/init` without payment → returns proper HTTP 402 with the correct PAYMENT-REQUIRED challenge.
- WS upgrade with bogus session id → closes cleanly with code 4404.
- `/analyze` still returns real quotes from three Orca pools.

### 2. Multi-asset trading vault (done by another agent in parallel)

A second agent expanded the project from "SOL/USDC only" to **7 crypto tokens** (SOL, USDC, USDT, SAMO, TMAC, PYUSD, BERN) and **7 equity feeds** (AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, price-only via Pyth Hermes). Added a token registry in `packages/sdk/src/tokens.ts`, a pool index in the swap-analyzer, NL token resolution in the MCP server, and dashboard cards on the web app.

We confirmed it ships cleanly (web build passes, `/app/history` route renders) and doesn't conflict with the streaming work.

### 3. Cloud Run / Railway deploy artifacts

Created `Dockerfile`s for all three deployable services, a root `.dockerignore`, three `railway/*.json` config-as-code files, and step-by-step guides:
- `deploy/anchor-deploy.md` — install Solana 2.1 + Anchor 0.31.1, deploy program, sync program ID.
- `deploy/railway.md` — three Railway services with env-var matrix.
- `deploy/release-mcp.sh` — bundles MCP server as a GitHub Releases tarball.

(Originally drafted Cloud Run scripts; replaced with Railway after the user picked Railway.)

### 4. Pushed everything to GitHub

Repo is at `git@github.com:AbdoViper23/SolAgent.git`. `.gitignore` extended for `.next/`, `.DS_Store`, `.vscode/`, `.idea/`. Two commits so far (initial + multi-asset deploy).

---

## What broke during the on-chain deploy

We had a long sequence of failures before `anchor deploy` succeeded. Recorded so we don't repeat them.

1. **Toolchain missing.** `anchor` CLI complained `Anchor version not set`. `avm install 0.31.1` timed out fetching the GitHub Release tarball. Worked around by `cargo install --git ... --tag v0.31.1 anchor-cli --locked --force` — built from source (~30 min).

2. **Placeholder program ID.** `YourVaultProgramId1111…1` contains a capital `I`, which is **not a valid base58 character**. `anchor build` rejected it. Generated a real keypair: `solana-keygen new --outfile target/deploy/trading_vault-keypair.json`.

3. **Anchor / Whirlpool version conflict.** `whirlpool` from Orca's `main` branch is on Anchor 0.32.1; the project was on 0.31.1. There's no commit on Orca that uses 0.31, so we bumped our program to Anchor 0.32.1 first. Build then failed on:

4. **Global allocator collision.** `whirlpool/src/entrypoint.rs` calls `custom_heap_default!()` and `custom_panic_default!()` **unconditionally** — they aren't gated by any feature flag. Setting `default-features = false, features = ["cpi"]` did not help. This is a bug in Orca's main branch; can't be fixed via Cargo features.

   **Real fix:** dropped the `whirlpool` crate dependency entirely. Built the swap CPI manually using `solana_program::program::invoke_signed` with a hard-coded discriminator (`sha256("global:swap")[..8]` = `f8 c6 9e 91 e1 75 87 c8`) and the same account list. Reverted Anchor back to 0.31.1 in the process. See `programs/trading_vault/src/lib.rs` `execute_swap`.

5. **`anchor build` produced no IDL.** `target/idl/` and `target/types/` came out empty. We worked around it by patching the existing `packages/idl/src/trading_vault.json` instead of regenerating.

6. **IDL discriminators were wrong.** When we tried to call `init_vault` from the setup script, the program returned `InstructionFallbackNotFound` (error code 101). We checked: the discriminators in the IDL didn't match `sha256("global:<snake_case_name>")[..8]`. Wrote a one-shot script that recomputes every instruction's discriminator and rewrites the IDL. Six instructions were patched (`init_vault`, `execute_swap`, `add_whitelist_pool`, `remove_whitelist_pool`, `add_whitelist_token`, `remove_whitelist_token`); `deposit`, `withdraw`, `update_config` were already correct.

7. **`pnpm setup:whitelist` failed at `init_vault`.** The vault PDA didn't exist on-chain yet. Modified the script (`apps/mcp-server/scripts/setup-whitelist.ts`) to:
   - Detect the missing vault and call `init_vault` automatically (defaults: 100 SOL/day limit, 1% slippage).
   - Use `import anchorPkg from "@coral-xyz/anchor"` then destructure `BN` (because tsx-ESM couldn't resolve `import { BN }` directly).

After all the above, `pnpm setup:whitelist` ran clean: vault initialized, **7 tokens + 8 pools** whitelisted on-chain.

---

## Current on-chain state

| Item | Value |
|---|---|
| Network | Solana **devnet** |
| Program ID | `DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb` |
| Owner / authority | `3RBDMa4REHXMU1o9Svytfgc1JqVmqVR7vJ8BGeCZdCdW` |
| Vault PDA | `7suafrVZ1dbfS95662VHgtk18HDMA62PVbBrR8g5eKU7` |
| Owner balance | ~3.87 SOL after deploy |
| Whitelisted tokens | 7 (SOL, USDC, USDT, SAMO, TMAC, PYUSD, BERN) |
| Whitelisted pools | 8 (the SOL/USDC + cross-stable + dev tokens pools) |
| Program ID synced in | `Anchor.toml`, `lib.rs`, `apps/web/.env.local`, `apps/web/.env.example`, `apps/web/Dockerfile`, `apps/web/lib/useTradingVault.ts`, `apps/mcp-server/src/index.ts`, `packages/idl/src/trading_vault.json`, `packages/idl/src/trading_vault_types.ts` |
| GitHub repo | `git@github.com:AbdoViper23/SolAgent.git` |
| Latest commit | `c41b1ba` (deploy + init + whitelist) |

The program is live. The vault is initialized. The web app is correctly configured for local dev (`.env.local` has the real program ID).

---

## Next steps

### Step 1 — Deploy to Railway (~10 min once project exists)

The user is going to add the Railway MCP (`claude mcp add railway --transport http https://mcp.railway.com`) and restart Claude Code. After restart, ask the assistant to deploy. The plan:

1. Create a Railway project (or use an existing one).
2. Add three services pointing to the SolAgent GitHub repo:
   - `oracle-service` — config path `railway/oracle.json`, root `/`.
   - `swap-analyzer` — config path `railway/swap-analyzer.json`, root `/`.
   - `web` — config path `railway/web.json`, root `/`.
3. Set env vars per service (full matrix in `deploy/railway.md`):
   - `oracle-service` and `swap-analyzer`: `MERCHANT_ADDRESS`, `RPC_URL`, `FACILITATOR_URL`, `CORS_ORIGIN=*`, `PORT=8080`, plus `STREAM_*` for the analyzer.
   - `web`: build-time `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_VAULT_PROGRAM_ID=DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb`, `NEXT_PUBLIC_ORACLE_SERVICE_URL=https://${{oracle-service.RAILWAY_PUBLIC_DOMAIN}}`, `NEXT_PUBLIC_SWAP_ANALYZER_URL=https://${{swap-analyzer.RAILWAY_PUBLIC_DOMAIN}}`.
4. Generate public domains for all three.
5. Trigger deploys: `oracle` → `swap-analyzer` → `web` (web is last because it bakes the others' URLs at build time).

### Step 2 — Smoke test on Railway

```
curl https://<oracle URL>/price/sol-usd
curl https://<swap URL>/health
curl -i -X POST https://<swap URL>/stream/quote/init \
  -H 'content-type: application/json' \
  -d '{"inputMint":"So11111111111111111111111111111111111111112",
       "outputMint":"BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k",
       "amountIn":"100000000"}'
# → expect HTTP 402
```

Open the web URL, connect a Solana devnet wallet, visit `/app` and `/app/history`, do a deposit, do a swap.

### Step 3 — Tighten CORS

After the web URL is known, redeploy `oracle-service` and `swap-analyzer` with `CORS_ORIGIN=<that web URL>` so other origins can't hit them from a browser.

### Step 4 — Publish MCP server

```
./deploy/release-mcp.sh v0.1.0
```

This bundles `apps/mcp-server/dist` plus its workspace deps into a self-contained tarball and uploads it as a GitHub Release. Users install it locally and point Claude Desktop's `claude_desktop_config.json` at the tarball, with `X402_BASE_URL` set to the swap-analyzer's Railway URL.

### Step 5 — Demo + submission

- Record a demo video that walks through:
  - Landing page hero with the live SOL/USD price ticker.
  - `/app` dashboard (vault PDA, balances, swap panel).
  - Claude Desktop side-panel: ask for a stream quote → progress notifications stream in for 60s → execute_swap fires → tx confirmed.
  - `/app/history` showing the trade in the on-chain backfill.
- Submit to the hackathon.

---

## Things to NOT do (would cost ~3 SOL each)

- **Don't** `rm -rf target/` before redeploying the program. That wipes `target/deploy/trading_vault-keypair.json`, which forces a fresh deploy with a new program ID, costs another ~3 SOL of rent, and means re-syncing the ID across all files again. If you must clean, move the keypair out first:
  ```bash
  mv target/deploy/trading_vault-keypair.json /tmp/ && rm -rf target/
  mkdir -p target/deploy && mv /tmp/trading_vault-keypair.json target/deploy/
  anchor build
  ```
- **Don't** commit `.env` files, the keypair JSON, or `~/.config/solana/id.json`. They're in `.gitignore` already, but keep the SOLANA_PRIVATE_KEY env var out of any committed config.

---

## Things to remember about this stack

- **`numReplicas=1` is mandatory for `swap-analyzer`** until we move stream sessions out of process memory. The `init` request stores a session ID in RAM; the WS upgrade has to land on the same instance.
- **`NEXT_PUBLIC_*` env vars are baked into the Next.js build**, not read at runtime. Changing them needs a redeploy of the web service.
- **MERCHANT_ADDRESS** is the same Solana pubkey we used to deploy the program (`3RBDMa4REHXMU1o9Svytfgc1JqVmqVR7vJ8BGeCZdCdW`). All x402 fees from the streaming endpoint settle to it.
