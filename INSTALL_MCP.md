# Install the Solana Trading Agent MCP

Connect Claude Desktop (or any MCP-compatible client) to a deployed Solana trading vault on **devnet** so you can ask Claude to fetch live oracle prices, run paid x402 swap analyses, stream 60-second quote subscriptions, and execute on-chain swaps via your vault PDA.

## 1. Download the release tarball

```bash
curl -L -o /tmp/mcp.tar.gz \
  https://github.com/AbdoViper23/SolAgent/releases/download/mcp-v0.1.4/solana-trading-agent-mcp-v0.1.4.tar.gz
mkdir -p ~/.local/share/solana-trading-agent-mcp
tar -xzf /tmp/mcp.tar.gz -C ~/.local/share/solana-trading-agent-mcp --strip-components=1
```

The bundle is fully self-contained — `dist/index.js`, prebuilt workspace deps, and a `node_modules/` from `npm install --omit=dev`. No extra build step needed.

## 2. Add it to Claude Desktop

Open the config file and add the `solana-trading-agent` entry under `mcpServers`:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "node",
      "args": ["/ABS/PATH/TO/HOME/.local/share/solana-trading-agent-mcp/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 trading wallet private key — use a DEDICATED low-balance wallet>",
        "VAULT_PROGRAM_ID": "DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb",
        "X402_BASE_URL": "https://swap-analyzer-production.up.railway.app",
        "X402_FACILITATOR_URL": "https://facilitator.payai.network"
      }
    }
  }
}
```

Replace `/ABS/PATH/TO/HOME` with your real home path (`echo $HOME` on macOS/Linux, `echo %USERPROFILE%` on Windows). The `args` value must be an **absolute path** — `~` won't be expanded by the MCP loader.

## 3. Wallet setup

Create a fresh devnet keypair and fund it (you need a small amount of SOL for tx fees and devUSDC for swap input):

```bash
solana-keygen new --outfile ~/solana-trading-agent.json
solana airdrop 2 --url devnet $(solana-keygen pubkey ~/solana-trading-agent.json)
```

Export the base58 private key for the env var:
```bash
node -e 'const b58=require("bs58").default;console.log(b58.encode(Buffer.from(JSON.parse(require("fs").readFileSync("/Users/you/solana-trading-agent.json"))).slice(0)))'
```

> ⚠️ Use a wallet with **only the funds you intend to trade**. The MCP server signs transactions with this key.

## 4. Restart Claude Desktop

Fully quit (`Cmd+Q` on macOS, End-task on Windows, kill the process on Linux) and reopen. The new MCP tools should appear in the side panel.

## 5. Try it

In any Claude Desktop chat:

- **"What's the latest SOL/USD price?"** → calls the oracle service.
- **"Get me a streaming best-quote for 0.1 SOL → devUSDC for 60 seconds."** → triggers x402 payment, opens WSS, streams ticks.
- **"Initialize my trading vault"** → calls `init_vault` on the on-chain Anchor program.
- **"Deposit 0.1 SOL into my vault, then swap 0.05 SOL for devUSDC."** → composed deposit + execute_swap CPI.
- **"Show me my recent vault history."** → reads on-chain trade events.

## Live services

| Service | URL |
|---|---|
| Oracle (Pyth feeds) | https://oracle-production-374d.up.railway.app |
| Swap analyzer + x402 stream | https://swap-analyzer-production.up.railway.app |
| Web dashboard | https://solagent-web-production.up.railway.app |

Vault program ID (devnet): [`DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb`](https://explorer.solana.com/address/DdteTWoeg1ed6USme9cyTKwSiThSb1VaoabjZMUTaMzb?cluster=devnet)

## Troubleshooting

- **MCP doesn't appear in Claude Desktop** — check the config file is valid JSON (`jq . ~/Library/Application\ Support/Claude/claude_desktop_config.json`) and that `args[0]` is an absolute path.
- **`Error: SOLANA_PRIVATE_KEY required`** — env var missing or empty in the config.
- **`Error: insufficient funds`** — fund the wallet with `solana airdrop 2 --url devnet <pubkey>`.
- **x402 tools fail with HTTP 402** — the wallet has no devUSDC. Mint some on devnet from the [USDC faucet](https://spl-token-faucet.com/?token-name=USDC-Dev).
- **Logs** — Claude Desktop writes MCP stderr to `~/Library/Logs/Claude/mcp-server-solana-trading-agent.log` (macOS) or the equivalent on your platform.
