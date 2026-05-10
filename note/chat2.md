# Chat 2 — Railway Deploy + MCP Release

## Final state (when handoff happens)

### ✅ Done & verified

**Railway deployment.** All 3 services live on devnet:

| Service | URL | Status |
|---|---|---|
| oracle | https://oracle-production-374d.up.railway.app | `/health` returns 7 crypto + 7 equity feeds |
| swap-analyzer | https://swap-analyzer-production.up.railway.app | `/health` ok, `/analyze` returns 3 Orca routes, `/stream/quote/init` returns HTTP 402 with valid x402 PAYMENT-REQUIRED challenge |
| solagent-web | https://solagent-web-production.up.railway.app | HTTP 200, Next.js running |

How they got there: original 4 services on the project were all stuck with a legacy `sfo` region in `multiRegionConfig` that the Railway API refused to clear via PATCH. The user deleted them manually in the dashboard, then we used the **Railway CLI** (`railway add --service NAME --variables ...`) to create 3 fresh empty services with env vars + `RAILWAY_DOCKERFILE_PATH`, generated public domains via `railway domain --service X --port N`, and uploaded the local code with `railway up --service NAME --detach`. The web build needed `apps/web/public/` to exist (Dockerfile copies it) — I created `apps/web/public/.gitkeep` to fix that.

Service IDs (production env `7f37e607-ea87-47cb-ad7e-f05923c57cdb`, project `1b343565-95e6-4505-86cf-aa9d1739c644`):
- oracle: `5e847d09-57f0-4142-a578-9761e4c96499`
- swap-analyzer: `277602b8-0103-4584-842a-6986350a6e60`
- solagent-web: `17db7a38-fd2a-41e0-82c5-dc211f94c8ee`

**Web "Solana Mainnet" investigation.** Confirmed the `WalletProvider` from `@solana/wallet-adapter-react@^0.15.39` does NOT accept a `network` prop (TS error `Property 'network' does not exist on type 'WalletProviderProps'`). My attempted fix was reverted. The "Solana Mainnet" label in the wallet UI is controlled by Phantom/Solflare based on the wallet's own configured cluster, not the dApp. Users need to switch the wallet to devnet manually — there's no clean dApp-side override with this lib version. **Not blocking.**

**DEVNET badge.** `apps/web/components/Navbar.tsx` lines 61–66 — replaced the previous `hidden ... sm:inline-flex` green badge with an always-visible amber-styled "Devnet" badge. Web redeployed successfully (`aabdf481-a76a-4e64-9433-a109c5848348`).

**`deploy/release-mcp.sh` patched** with three fixes:
1. `--legacy-peer-deps` on `npm install` (kit 2 vs kit 5 peer conflict).
2. `--ignore-scripts` (otherwise the `prepare` script tries to `tsc` but devDeps are excluded).
3. Recursive workspace-protocol rewrite — the inner `packages/sdk/package.json` had `"@workspace/idl": "workspace:*"` which `npm` rejected; the script now rewrites all nested `package.json` files inside `workspace_packages/` too.

**Dependency pinning** (to keep everything kit-2 compatible):
- `apps/mcp-server/package.json`: `@x402/svm` `>=2.6.0` → `~2.1.0`, `@x402/axios` `latest` → `~2.1.0`
- `packages/x402-client/package.json`: `@x402/svm` `>=2.6.0` → `~2.1.0`, `@x402/axios` `latest` → `~2.1.0`, `@x402/core` `latest` → `~2.1.0`

**`apps/mcp-server/src/index.ts` line 13** — changed `import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor"` to default-import + destructure pattern (anchor is CJS so named imports fail at ESM runtime). Currently lines 13–14 read:
```ts
import anchorPkg from "@coral-xyz/anchor";
const { AnchorProvider, Program, BN, Wallet } = anchorPkg;
```

**`INSTALL_MCP.md`** at repo root — full user install instructions. Currently references `mcp-v0.1.3` (which is broken — see below). Once a working release is up, this is the doc to point judges/users at.

### ❌ Broken / not done

**MCP v0.1.3 release failed at TypeScript build.** After fixing the `BN` import, `tsc` now errors:
```
src/index.ts(66,14): error TS2749: 'Program' refers to a value, but is being used as a type here. Did you mean 'typeof Program'?
```
Line 66 (or thereabouts) of `apps/mcp-server/src/index.ts` uses `Program` as a TS type annotation, but after the destructure refactor `Program` is only a runtime value, not a type. Two fix options:

A. Add a separate type-only import (cleanest):
```ts
import anchorPkg from "@coral-xyz/anchor";
import type { Program as AnchorProgram } from "@coral-xyz/anchor";
const { AnchorProvider, Program, BN, Wallet } = anchorPkg;
// then in type positions use AnchorProgram<TradingVault> instead of Program<TradingVault>
```

B. Replace the type annotation with `InstanceType<typeof Program>` everywhere it's used as a type.

Whoever picks this up: grep `Program<` in `apps/mcp-server/src/index.ts`, those are the type-position usages. Do option A.

**No mcp-v0.1.3 GitHub release exists.** `gh release delete mcp-v0.1.2 --cleanup-tag` already ran, so there's also no v0.1.2. Current state: no MCP release on GitHub at all. After fixing the TS error, run `./deploy/release-mcp.sh v0.1.3` (or bump to v0.1.4 if you prefer a fresh tag).

**Local files modified but not committed.** Run `git diff --stat` to see them all. Notably:
- `apps/web/app/providers.tsx` (no real change vs main — was edited then reverted)
- `apps/web/components/Navbar.tsx` (DEVNET badge)
- `apps/web/public/.gitkeep` (new file — required for web Dockerfile)
- `deploy/release-mcp.sh` (3 patches)
- `apps/mcp-server/package.json` (x402 pinned)
- `apps/mcp-server/src/index.ts` (BN import refactor — incomplete, fails tsc)
- `packages/x402-client/package.json` (x402 pinned)
- `pnpm-lock.yaml` (updated by `pnpm install`)
- `INSTALL_MCP.md` (new file at repo root)
- `note/chat2.md` (this file)

The user has previously committed work in this session via Claude opus. They have NOT asked for a commit yet this turn — wait for explicit instruction.

## What to do next (in order)

1. **Fix the TS error in `apps/mcp-server/src/index.ts`.** Grep for `Program<` (type usage). Add `import type { Program as AnchorProgram } from "@coral-xyz/anchor"` and rename the type usage to `AnchorProgram<…>`. Don't touch the runtime destructure.

2. **Run `./deploy/release-mcp.sh v0.1.3`** from repo root. ~3 min for pnpm + tsc + npm install + tar + gh release.

3. **Smoke-test the published tarball:**
   ```bash
   cd /tmp && rm -rf mcp-test && mkdir mcp-test && cd mcp-test
   curl -sL -o mcp.tar.gz https://github.com/AbdoViper23/SolAgent/releases/download/mcp-v0.1.3/solana-trading-agent-mcp-v0.1.3.tar.gz
   tar -xzf mcp.tar.gz
   SOLANA_PRIVATE_KEY="" SOLANA_RPC_URL="https://api.devnet.solana.com" timeout 5 node solana-trading-agent-mcp/dist/index.js
   ```
   Expect the MCP server to start, print a stdio banner, and just sit there waiting for protocol input. If it errors with a missing module or another ESM/CJS issue, that's the next bug to chase. If it errors with `SOLANA_PRIVATE_KEY required`, that's expected — pass a real key to confirm full startup.

4. **(Optional) Re-deploy `solagent-web` once more** — the latest revision already has the Devnet badge live, but if any further tweaks land the redeploy command is `railway up --service solagent-web --detach` from repo root.

5. **(Optional) CORS tightening.** Currently oracle + swap-analyzer have `CORS_ORIGIN=*`. Once the demo is settled, set `CORS_ORIGIN=https://solagent-web-production.up.railway.app` via `railway variables --service oracle --set CORS_ORIGIN=...` and same for swap-analyzer.

6. **(Optional) Commit when user asks.** Do not auto-commit. Co-Authored-By line is `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Rabbit holes / things to NOT redo

- **Don't try to delete the Railway services and recreate again.** They're working. The `sfo` region nightmare was a one-time data corruption issue with the OLD services — the new ones we created via `railway add` are clean (us-west2 single region).
- **Don't try to add a `network` prop to `WalletProvider`** — it's not in this version's TS types. Was tried, web build failed, reverted.
- **Don't use `gh release create` directly with a stale local tarball** — `./deploy/release-mcp.sh` handles the staging + workspace rewrites + npm install. Re-running the script is the canonical path.
- **Don't bump `@solana/kit` to 5.x.** The whole project (anchor 0.31, swap-analyzer, oracle, web) is pinned to kit 2. Migrating to kit 5 is a multi-day refactor not appropriate for hackathon polish.
- **Don't `npm publish` the MCP.** User explicitly chose the GitHub Release tarball path over npm publish.

## Live reference URLs

- Project dashboard: https://railway.com/project/1b343565-95e6-4505-86cf-aa9d1739c644
- GitHub repo: https://github.com/AbdoViper23/SolAgent (synced with `mayBeAbdo/SolAgent` per user)
- Vault program (devnet): https://explorer.solana.com/address/DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb?cluster=devnet
- Plan file (approved earlier this session): `~/.claude/plans/x402-happy-widget.md`

## Quick smoke tests (paste-ready)

```bash
# Oracle health + a price feed
curl -sS https://oracle-production-374d.up.railway.app/health
curl -sS https://oracle-production-374d.up.railway.app/price/sol-usd

# Swap-analyzer health + a paid x402 endpoint (expect HTTP 402)
curl -sS https://swap-analyzer-production.up.railway.app/health
curl -sS -i -X POST https://swap-analyzer-production.up.railway.app/stream/quote/init \
  -H 'content-type: application/json' \
  -d '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k","amountIn":"100000000"}' | head

# Web (expect HTTP 200, HTML with "Devnet" badge)
curl -sS https://solagent-web-production.up.railway.app/ | grep -oE 'Devnet|amber-500'

# MCP release (after step 2 above)
gh release view mcp-v0.1.3 --repo AbdoViper23/SolAgent
```
