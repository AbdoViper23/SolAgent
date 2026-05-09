# Multi-stage build for the Next.js 15 web app in a pnpm monorepo
# Uses Next.js "standalone" output (set in next.config.ts) for slim runtime.
# Build context must be the monorepo root.
# Build:  docker build -t web -f apps/web/Dockerfile .

FROM node:22-slim AS builder
WORKDIR /repo
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/swap-analyzer-service/package.json ./apps/swap-analyzer-service/
COPY apps/oracle-service/package.json ./apps/oracle-service/
COPY apps/web/package.json ./apps/web/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/idl/package.json ./packages/idl/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/x402-client/package.json ./packages/x402-client/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/web ./apps/web
COPY packages ./packages

# NEXT_PUBLIC_* values are baked at build time. Pass via --build-arg.
ARG NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
ARG NEXT_PUBLIC_VAULT_PROGRAM_ID=YourVaultProgramId1111111111111111111111111
ARG NEXT_PUBLIC_ORACLE_SERVICE_URL=
ARG NEXT_PUBLIC_SWAP_ANALYZER_URL=
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_VAULT_PROGRAM_ID=$NEXT_PUBLIC_VAULT_PROGRAM_ID
ENV NEXT_PUBLIC_ORACLE_SERVICE_URL=$NEXT_PUBLIC_ORACLE_SERVICE_URL
ENV NEXT_PUBLIC_SWAP_ANALYZER_URL=$NEXT_PUBLIC_SWAP_ANALYZER_URL

RUN pnpm --filter web build

FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Standalone output bundles the minimal node_modules subset and a server.js
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 8080
CMD ["node", "apps/web/server.js"]
