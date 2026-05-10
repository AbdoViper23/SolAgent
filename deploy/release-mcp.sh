#!/usr/bin/env bash
# Build the MCP server and publish a tarball as a GitHub Release.
# Usage: ./deploy/release-mcp.sh v0.1.0
# Prereqs: gh CLI authenticated (`gh auth login`), repo has a `origin` remote pointing to GitHub.

set -euo pipefail

VERSION="${1:?Usage: $0 <version-tag>  (e.g. v0.1.0)}"
TAG="mcp-${VERSION}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Building MCP server"
pnpm install --frozen-lockfile
pnpm --filter solana-trading-agent-mcp build

STAGE="$(mktemp -d)"
PKG_DIR="$STAGE/solana-trading-agent-mcp"
mkdir -p "$PKG_DIR"

echo "==> Staging files in $PKG_DIR"
cp -R apps/mcp-server/dist "$PKG_DIR/dist"
cp apps/mcp-server/package.json "$PKG_DIR/package.json"
cp README.md "$PKG_DIR/README.md" 2>/dev/null || true

# Production-only install inside the staged dir (uses the workspace lockfile via --offline + a temp store)
pushd "$PKG_DIR" > /dev/null
# Strip workspace: protocol so npm i works standalone. Replace workspace:* with file paths copied next to the dir.
mkdir -p workspace_packages
cp -R "$REPO_ROOT/packages/idl"          workspace_packages/idl
cp -R "$REPO_ROOT/packages/sdk"          workspace_packages/sdk
cp -R "$REPO_ROOT/packages/x402-client"  workspace_packages/x402-client
node -e "
  const fs = require('fs');
  const path = require('path');
  function rewrite(pkgPath, refPrefix) {
    const p = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    for (const field of ['dependencies', 'peerDependencies']) {
      if (!p[field]) continue;
      for (const k of Object.keys(p[field])) {
        if (p[field][k] === 'workspace:*') {
          const name = k.replace('@workspace/', '');
          p[field][k] = 'file:' + refPrefix + name;
        }
      }
    }
    fs.writeFileSync(pkgPath, JSON.stringify(p, null, 2));
  }
  rewrite('package.json', './workspace_packages/');
  for (const dir of fs.readdirSync('workspace_packages')) {
    const inner = path.join('workspace_packages', dir, 'package.json');
    if (fs.existsSync(inner)) rewrite(inner, '../');
  }
"
npm install --omit=dev --no-audit --no-fund --no-package-lock --legacy-peer-deps --ignore-scripts
popd > /dev/null

TARBALL="$STAGE/solana-trading-agent-mcp-${VERSION}.tar.gz"
tar -C "$STAGE" -czf "$TARBALL" solana-trading-agent-mcp
echo "==> Tarball: $TARBALL ($(du -h "$TARBALL" | cut -f1))"

cat > "$STAGE/release-notes.md" <<EOF
# solana-trading-agent-mcp ${VERSION}

MCP server for the Solana AI Trading Agent. 11 tools including \`stream_best_quote\` (60s WSS x402-paid).

## Install

\`\`\`bash
curl -L -o /tmp/mcp.tar.gz \
  https://github.com/<your-user>/<repo>/releases/download/${TAG}/solana-trading-agent-mcp-${VERSION}.tar.gz
mkdir -p ~/.local/share/solana-trading-agent-mcp
tar -xzf /tmp/mcp.tar.gz -C ~/.local/share/solana-trading-agent-mcp --strip-components=1
\`\`\`

## Wire up Claude Desktop

Edit \`~/.config/Claude/claude_desktop_config.json\` (Linux) or \`~/Library/Application Support/Claude/claude_desktop_config.json\` (macOS):

\`\`\`json
{
  "mcpServers": {
    "solana-trading-agent": {
      "command": "node",
      "args": ["~/.local/share/solana-trading-agent-mcp/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://api.devnet.solana.com",
        "SOLANA_PRIVATE_KEY": "<base58 devnet hot-wallet key — DEDICATED, low balance>",
        "VAULT_PROGRAM_ID": "<your deployed program id>",
        "X402_BASE_URL": "<swap-analyzer Cloud Run URL>",
        "X402_FACILITATOR_URL": "https://facilitator.payai.network"
      }
    }
  }
}
\`\`\`

Quit Claude Desktop fully (Cmd+Q on macOS, "End task" on Windows) and reopen.
EOF

echo "==> Creating GitHub Release: $TAG"
gh release create "$TAG" \
  --title "MCP Server ${VERSION}" \
  --notes-file "$STAGE/release-notes.md" \
  "$TARBALL"

echo "==> Done. Tag: $TAG"
gh release view "$TAG" --web 2>/dev/null || true
