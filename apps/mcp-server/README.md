# Solana Trading Agent MCP Server

## Install
Add to `~/.config/Claude/claude_desktop_config.json` (Linux) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "npx",
      "args": ["-y", "solana-trading-agent-mcp"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 trading wallet private key — use a DEDICATED low-balance wallet>",
        "VAULT_PROGRAM_ID": "YourVaultProgramId1111111111111111111111111",
        "X402_BASE_URL": "https://your-services.railway.app",
        "X402_FACILITATOR_URL": "https://facilitator.payai.network"
      }
    }
  }
}
```

**IMPORTANT**: Use a dedicated hot wallet with minimal funds. Never use your main wallet.
If `npx` isn't found, use the full path: `"command": "/usr/local/bin/npx"`.
After editing config, fully restart Claude Desktop (Cmd+Q on macOS, End task on Windows).

## Tools

- **get_vault_info** — Get vault PDA address and token balances
- **deposit_to_vault** — Deposit SOL (wSOL) or devUSDC into your trading vault
- **withdraw_from_vault** — Withdraw tokens from vault back to your wallet
- **get_best_quote** — Get best swap quote across 3 Orca Whirlpool pools
- **execute_swap** — Execute a token swap via your vault (respects daily limits)
- **get_sol_price** — Get current SOL/USD price from Pyth oracle (costs $0.001 via x402)
- **analyze_routes** — Get detailed multi-pool route analysis (costs $0.005 via x402)
- **update_vault_config** — Update daily spend limit and slippage cap
