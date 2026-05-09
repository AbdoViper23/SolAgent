# Deploy guide

Three Railway services + a GitHub Releases tarball for the MCP server. The on-chain Anchor program deploys to Solana devnet.

```
1. anchor deploy ──→ PROGRAM_ID                       (must be first)
        │
        ↓
2. Railway: oracle-service       (no PROGRAM_ID dep)
3. Railway: swap-analyzer        (no PROGRAM_ID dep)
        │
        ↓
4. Railway: web                  (NEXT_PUBLIC_VAULT_PROGRAM_ID baked at build time)
5. GitHub Releases: mcp-server   (PROGRAM_ID + service URLs read from env at runtime)
```

## Step-by-step

| Step | Guide | What it produces |
|------|-------|------------------|
| 1. On-chain program | [anchor-deploy.md](./anchor-deploy.md) | `VAULT_PROGRAM_ID`, generated IDL, devnet wallet keypair |
| 2-4. Hosted services + web | [railway.md](./railway.md) | Three public Railway URLs + smoke-tested 402 challenge + WSS upgrade |
| 5. MCP tarball | `./release-mcp.sh v0.1.0` | A GitHub Release at `mcp-v0.1.0` with a standalone tarball |

## Files in this directory

| File | Purpose |
|------|---------|
| [anchor-deploy.md](./anchor-deploy.md) | Toolchain install + Anchor build/deploy + program ID sync across all source files |
| [railway.md](./railway.md) | Railway project setup, env vars per service, smoke tests, troubleshooting |
| [release-mcp.sh](./release-mcp.sh) | Bundles `apps/mcp-server/dist` + workspace deps into a self-contained tarball, uploads as GitHub Release |

The Dockerfiles + Railway config-as-code live next to the code they build:

- [apps/swap-analyzer-service/Dockerfile](../apps/swap-analyzer-service/Dockerfile) + [railway/swap-analyzer.json](../railway/swap-analyzer.json)
- [apps/oracle-service/Dockerfile](../apps/oracle-service/Dockerfile) + [railway/oracle.json](../railway/oracle.json)
- [apps/web/Dockerfile](../apps/web/Dockerfile) + [railway/web.json](../railway/web.json)
- Repo-level [.dockerignore](../.dockerignore) + Next.js standalone output in [apps/web/next.config.ts](../apps/web/next.config.ts)

## Env-var matrix at a glance

| Service | Var | Where it comes from |
|---|---|---|
| **oracle-service** | `MERCHANT_ADDRESS` | `solana address` |
|  | `RPC_URL` | `https://api.devnet.solana.com` |
|  | `FACILITATOR_URL` | `https://facilitator.payai.network` |
|  | `CORS_ORIGIN` | `*` first, narrow to web URL after step 4 |
| **swap-analyzer** | (same 4 above) | |
|  | `STREAM_*` | defaults are fine; see [railway.md](./railway.md) §3 |
| **web** (build-time) | `NEXT_PUBLIC_RPC_URL` | as above |
|  | `NEXT_PUBLIC_VAULT_PROGRAM_ID` | from step 1 |
|  | `NEXT_PUBLIC_ORACLE_SERVICE_URL` | `https://${{oracle-service.RAILWAY_PUBLIC_DOMAIN}}` |
|  | `NEXT_PUBLIC_SWAP_ANALYZER_URL` | `https://${{swap-analyzer.RAILWAY_PUBLIC_DOMAIN}}` |
| **mcp-server** (Claude Desktop env block) | `SOLANA_RPC_URL` | as above |
|  | `SOLANA_PRIVATE_KEY` | b58 of `~/.config/solana/id.json` (see anchor-deploy.md §8) |
|  | `VAULT_PROGRAM_ID` | from step 1 |
|  | `X402_BASE_URL` | swap-analyzer public Railway URL |
|  | `X402_FACILITATOR_URL` | `https://facilitator.payai.network` |
