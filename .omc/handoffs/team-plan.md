## Handoff: team-plan → team-exec

- **Decided**: pnpm monorepo with 4 apps (web, mcp-server, oracle-service, swap-analyzer-service) + 3 packages (idl, sdk, x402-client). Anchor 0.31.1, Solana 2.1.0, Rust 1.84.1.
- **Rejected**: Turborepo (overkill for hackathon), Jupiter on devnet (no real routing), Anchor 1.0.x (Orca CPI templates not yet available).
- **Key addresses**: Whirlpools program `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` (same mainnet/devnet), SOL/devUSDC pool `3KBZiL2g8C7tiJ32hTv5v3KM7aK9htpqTw4cTXz1HvPt`, devUSDC mint `BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k`, x402 USDC `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- **Risks**: IDL package needs `anchor build` output — scaffold with placeholder types. x402/svm must be >=2.6.0 (CVE). Two devUSDC mints must not be confused.
- **Files created**: pnpm-workspace.yaml, Cargo.toml, Anchor.toml, tsconfig.base.json, rust-toolchain.toml, package.json, .nvmrc, .gitignore + all directories.
- **Remaining**: worker-1 → Anchor program + IDL package + TypeScript SDK; worker-2 → oracle-service + swap-analyzer-service + x402-client; worker-3 → mcp-server + Next.js frontend.
