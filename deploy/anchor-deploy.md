# Anchor program deploy (devnet)

This must run **before** any Cloud Run deploy. The web app, MCP server, and (eventually) re-enabled vault tools all need the **real** on-chain program ID baked in. The current placeholder `YourVaultProgramId1111111111111111111111111` will not work against a live cluster.

Cannot be automated from inside Claude Code: it downloads tools, generates a keypair, and signs transactions on devnet. Run on your local machine.

---

## 1. Install toolchain (~20 min, one-time)

```bash
# Rust 1.84.1
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.84.1 --profile minimal
source "$HOME/.cargo/env"

# Solana CLI 2.1.0 (Anza fork)
sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Anchor CLI 0.31.1 via avm (slow — cargo install ~10–15 min)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1

# Verify
solana --version    # → solana-cli 2.1.0
anchor --version    # → anchor-cli 0.31.1
rustc --version     # → rustc 1.84.1
```

Add the Solana PATH line to `~/.bashrc` / `~/.zshrc` so future shells pick it up.

## 2. Configure devnet wallet

```bash
solana config set --url https://api.devnet.solana.com

# New keypair, no passphrase
solana-keygen new --outfile ~/.config/solana/id.json --no-bip39-passphrase

# Top up
solana airdrop 2
solana balance
```

If `airdrop 2` fails (rate-limited on devnet), use the GitHub-login faucet at https://faucet.solana.com/ — far better limits.

## 3. First build + deploy (placeholder ID)

```bash
cd ~/Projects/solana/dev3pack_hack

anchor build
anchor deploy --provider.cluster devnet
```

The output looks like:
```
Deploying program "trading_vault"...
Program path: /home/.../target/deploy/trading_vault.so
Program Id: 7xKvW...QzA3   ← copy this
Deploy success
```

**Copy the printed `Program Id` somewhere safe.** This is your real on-chain ID.

## 4. Sync the ID across all sources

```bash
PROGRAM_ID="<paste from anchor deploy output>"

# In source code (everything that currently has the placeholder)
grep -rl "YourVaultProgramId1111111111111111111111111" \
    --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.toml" --include="*.json" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=target . \
  | xargs sed -i "s/YourVaultProgramId1111111111111111111111111/$PROGRAM_ID/g"
```

Verify nothing was missed:
```bash
grep -rln "YourVaultProgramId" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=target .
# → no output expected
```

## 5. Re-build with the embedded ID, redeploy

`declare_id!()` in [programs/trading_vault/src/lib.rs](../programs/trading_vault/src/lib.rs) was just patched, so the on-chain bytecode itself needs the new ID:

```bash
anchor build
anchor deploy --provider.cluster devnet
# → Program Id: 7xKvW...QzA3   (must match what we sed'd in)
```

If the second deploy emits a *different* program ID, something is off. Re-check `Anchor.toml` `[programs.devnet] trading_vault = "<id>"` — this is what `anchor deploy` uses to derive the upgrade authority key.

## 6. Copy generated IDL into the workspace package

```bash
cp target/idl/trading_vault.json     packages/idl/src/trading_vault.json
cp target/types/trading_vault.ts     packages/idl/src/trading_vault_types.ts
```

This is the IDL the web hook + MCP server consume via `@workspace/idl`.

## 7. Sanity check

```bash
solana program show "$PROGRAM_ID" --url devnet
# → Program Id, ProgramData Address, Authority, Last Deployed In Slot, etc.
```

## 8. Save for later

Stash these for the Cloud Run deploy step:

| Key | Value |
|---|---|
| `VAULT_PROGRAM_ID` | `<the program id>` |
| `MERCHANT_ADDRESS` | `solana address` (your devnet pubkey) |
| `SOLANA_PRIVATE_KEY` (b58) | `node -e 'const fs=require("fs"),bs58=require("bs58");console.log(bs58.encode(Uint8Array.from(JSON.parse(fs.readFileSync(require("os").homedir()+"/.config/solana/id.json")))))'` |

The b58 form is what the MCP server's `claude_desktop_config.json` expects in `env.SOLANA_PRIVATE_KEY`. Keep it secret — anyone with that key can sign trades from the hot wallet.

---

## When to redeploy

- Source change in `programs/trading_vault/src/*.rs` → `anchor build && anchor deploy --provider.cluster devnet` (same program ID, just new bytecode).
- Want to roll a fresh program ID → delete `target/deploy/trading_vault-keypair.json` and start over from step 3.

After any redeploy that changes the IDL (account/instruction shape), repeat step 6 and rebuild the web + MCP packages so the workspace IDL matches on-chain.
