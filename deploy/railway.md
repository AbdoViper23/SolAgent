# Deploy to Railway

Three Railway services (`oracle-service`, `swap-analyzer`, `web`) running from the same repo, plus a GitHub Releases tarball for the MCP server.

> **Order matters.** Deploy the Anchor program first (see [anchor-deploy.md](./anchor-deploy.md)) — the web app and MCP server need the real on-chain program ID.

---

## 0. Prereqs (one-time)

- A Railway account (https://railway.com)
- `railway` CLI: `npm i -g @railway/cli` then `railway login`
- The repo pushed to GitHub (Railway can't deploy from a local-only repo)
- A funded **devnet** Solana wallet — see [anchor-deploy.md §2](./anchor-deploy.md)

You should already have these from the Anchor deploy:
```bash
export VAULT_PROGRAM_ID="<your deployed program id>"
export MERCHANT_ADDRESS="$(solana address)"
```

---

## 1. Create the Railway project

In the Railway dashboard:

1. Click **New Project** → **Deploy from GitHub repo** → pick this repo.
2. Railway will offer to create one service — **cancel** that detection screen and instead click **+ Create** three times to add three empty services.
3. Rename them to `oracle-service`, `swap-analyzer`, `web` (matches our config paths).

Or via CLI:
```bash
cd <repo>
railway init                 # creates a project, links current dir
railway service               # opens picker — create 3 services
```

---

## 2. Configure each service to use our Dockerfile + Railway config

For **each** of the 3 services, in **Settings → Source**:

| Service | Config-as-Code Path | Root Directory |
|---|---|---|
| `oracle-service`  | `railway/oracle.json`         | `/` (repo root) |
| `swap-analyzer`   | `railway/swap-analyzer.json`  | `/` (repo root) |
| `web`             | `railway/web.json`            | `/` (repo root) |

Leave **Build Command** and **Start Command** empty — they're driven by the Dockerfile + the JSON config.

The JSON files already declare:
- `builder = DOCKERFILE`
- `dockerfilePath = apps/<svc>/Dockerfile`
- `watchPatterns` so only relevant changes trigger redeploys
- `healthcheckPath = /health` (the swap-analyzer and oracle services expose this)
- `numReplicas = 1` (required for swap-analyzer because stream sessions live in process memory; safe default for the others)

---

## 3. Set environment variables (per service)

In each service's **Variables** tab, paste these. Replace placeholders.

### `oracle-service`

```
MERCHANT_ADDRESS=<your devnet pubkey>
RPC_URL=https://api.devnet.solana.com
FACILITATOR_URL=https://facilitator.payai.network
CORS_ORIGIN=*
PORT=8080
```

### `swap-analyzer`

```
MERCHANT_ADDRESS=<your devnet pubkey>
RPC_URL=https://api.devnet.solana.com
FACILITATOR_URL=https://facilitator.payai.network
CORS_ORIGIN=*
PORT=8080
STREAM_DURATION_MS=60000
STREAM_POLL_INTERVAL_MS=500
STREAM_HEARTBEAT_MS=5000
STREAM_PRICE_USDC=0.005
STREAM_MAX_CONCURRENT=64
```

### `web` — **build-time variables** (Next.js bakes `NEXT_PUBLIC_*` at build)

```
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_VAULT_PROGRAM_ID=<your deployed program id>
NEXT_PUBLIC_ORACLE_SERVICE_URL=https://${{oracle-service.RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_SWAP_ANALYZER_URL=https://${{swap-analyzer.RAILWAY_PUBLIC_DOMAIN}}
PORT=8080
```

The `${{service.RAILWAY_PUBLIC_DOMAIN}}` syntax is Railway's cross-service reference — it resolves at build time to the public URL of the named service.

> Railway passes service env vars as Docker `--build-arg` automatically when the Dockerfile declares matching `ARG`s. Our [apps/web/Dockerfile](../apps/web/Dockerfile) already declares the four `NEXT_PUBLIC_*` ARGs, so no extra config is needed.

---

## 4. Generate public domains

For **each** service, in **Settings → Networking → Public Networking**:

- Click **Generate Domain** (gives a `*.up.railway.app` subdomain).
- Optional: add a custom domain after the demo.

Copy the three generated URLs — you'll need them for cross-service references and the MCP config.

---

## 5. Deploy

Trigger a deploy on each service in the order **oracle → swap-analyzer → web**:

- In the Railway dashboard: **Deployments → Deploy** (top right) for each service in turn.
- Or via CLI: `railway up --service oracle-service`, then for the other two.

The web service deploys last because its build-time vars reference the other two services' public domains.

Watch the build logs:
- Each service's Dockerfile triggers a multi-stage `pnpm install --frozen-lockfile` + `pnpm --filter <svc> build`.
- First build is slow (~3–5 min); subsequent builds reuse layer cache and finish in ~1 min.

---

## 6. Smoke-test the deployed stack

```bash
ORACLE_URL="https://<oracle-service public domain>"
SWAP_URL="https://<swap-analyzer public domain>"
WEB_URL="https://<web public domain>"

curl "$ORACLE_URL/health"
curl "$ORACLE_URL/price/sol-usd"

curl "$SWAP_URL/health"
curl -i -X POST "$SWAP_URL/stream/quote/init" \
  -H 'content-type: application/json' \
  -d '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k","amountIn":"100000000"}'
# → expect HTTP/1.1 402 Payment Required + PAYMENT-REQUIRED header

open "$WEB_URL"
# Connect a Solana devnet wallet → /app and /app/history should render with live oracle data.
```

WebSocket smoke test (`wss://`):
```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('wss://<swap-analyzer domain>/stream/quote/abcdef123456');
ws.on('open', () => console.log('OPEN'));
ws.on('close', (c, r) => { console.log('CLOSE', c, r.toString()); process.exit(0); });
"
# → expect CLOSE 4404 session_not_found (because the sessionId is bogus). Confirms WSS upgrade routing works.
```

---

## 7. Tighten CORS (after step 6 confirms everything works)

Update `oracle-service` and `swap-analyzer` env:
```
CORS_ORIGIN=<web public URL — e.g. https://web-production-1234.up.railway.app>
```

Trigger redeploys.

---

## 8. Publish the MCP server

```bash
./deploy/release-mcp.sh v0.1.0
```

Users install the tarball locally and point Claude Desktop at it. Set their `X402_BASE_URL` env to the **swap-analyzer public URL** from step 4.

---

## Anatomy of a redeploy

When you push to GitHub:
- Railway looks at each service's `watchPatterns` in its `railway/*.json`.
- Only services whose paths matched changed files redeploy.
- `packages/**` matches all 3 services (shared workspace deps), so changes there redeploy everything.

Manually trigger via dashboard **Deploy** button or `railway redeploy --service <name>`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails: `ERR_PNPM_PEER_DEP_ISSUES` | Lockfile out of date | `pnpm install` locally, commit `pnpm-lock.yaml`, push |
| Build succeeds, container exits immediately | `MERCHANT_ADDRESS` env missing | Add it in Variables tab; redeploy |
| `/stream/quote/init` returns 500 instead of 402 | x402 facilitator unreachable | Check `FACILITATOR_URL` env, default `https://facilitator.payai.network` should be fine |
| WSS upgrades 404 | Domain not generated yet, or wrong path | Verify the public URL works for `/health` first; WS path is `/stream/quote/<id>` |
| Web route `/app/history` blank | `NEXT_PUBLIC_RPC_URL` build-time var missing | Set it in Variables, redeploy (NEXT_PUBLIC_* are baked at build, env-time edits don't help) |
| Swap-analyzer keeps restarting | Health check failing — hub init crash | Check Deploy logs; usually `MERCHANT_ADDRESS` missing or wrong format |

---

## Cost estimate

Railway's free tier: **$5/month credit** + a hobby plan at $5/mo. Three small Node services consuming ~50 MB each idle, plus a Next.js standalone runtime.

| Service | Resources | Monthly cost (rough) |
|---|---|---|
| oracle-service     | 256 MB / 1 vCPU, low traffic | ~$1 |
| swap-analyzer      | 512 MB / 1 vCPU, always-on (numReplicas=1) | ~$3–4 |
| web                | 512 MB / 1 vCPU, scales to 0 if idle | ~$1 |
| **Total** | | **~$5–6/mo** |

Well inside the hobby plan. The `numReplicas=1` on swap-analyzer is a hard constraint for the in-memory stream sessions — to scale higher, move sessions to Memorystore/Redis or upgrade Railway's memory tier.
