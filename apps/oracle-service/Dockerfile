# Multi-stage build for the oracle-service in a pnpm monorepo
# Build context must be the monorepo root.
# Build:  docker build -t oracle-service -f apps/oracle-service/Dockerfile .

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

COPY apps/oracle-service ./apps/oracle-service
COPY packages ./packages

RUN pnpm --filter oracle-service build

FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/oracle-service/dist ./apps/oracle-service/dist
COPY --from=builder /repo/apps/oracle-service/package.json ./apps/oracle-service/
COPY --from=builder /repo/apps/oracle-service/node_modules ./apps/oracle-service/node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json ./

WORKDIR /app/apps/oracle-service
EXPOSE 8080
CMD ["node", "dist/server.js"]
