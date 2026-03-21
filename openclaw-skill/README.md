# cli-swap OpenClaw Skill

Swap any token on 60+ blockchains directly from Telegram, WhatsApp, Slack, or Discord via [OpenClaw](https://openclaw.ai/).

## Quick Setup (5 minutes)

### 1. Install cli-swap

```bash
npm install -g cli-swap
```

### 2. Import your wallet

```bash
cli-swap wallet import --name main --type evm
# Enter your private key and set a password
```

### 3. Install the OpenClaw skill

**Option A: Copy skill folder**
```bash
cp -r openclaw-skill/ ~/.openclaw/workspace/skills/cli-swap/
```

**Option B: MCP Server (recommended)**

Add to your `~/.openclaw/config.yaml`:
```yaml
mcp:
  servers:
    cli-swap:
      command: npx
      args: ["-y", "cli-swap-mcp"]
```

### 4. Set wallet password

Add to your OpenClaw environment (e.g., `~/.openclaw/.env`):
```bash
SWAP_WALLET_PASSWORD=your-secure-password
```

### 5. Connect Telegram

Follow the [OpenClaw Telegram setup guide](https://docs.openclaw.ai/channels/telegram) to connect your Telegram account.

## Usage via Telegram

Once connected, just message your OpenClaw bot:

```
You: swap 1 ETH to USDC on ethereum
Bot: 📊 Quote: 1 ETH → 2,487.32 USDC (via Uniswap V3)
     Fee: ~$2.50 | Slippage: 0.5%
     Proceed? (yes/no)

You: yes
Bot: ✅ Swap executed!
     TX: 0xabc...123
     🔗 https://etherscan.io/tx/0xabc...123
```

```
You: 이더리움에서 USDC 잔액 확인해줘
Bot: 💰 Balance on Ethereum:
     Wallet: main (0x1234...abcd)
     ETH: 2.458 ETH
```

```
You: bridge 100 USDC from ethereum to polygon
Bot: 📊 Quote: 100 USDC (Ethereum) → 99.85 USDC (Polygon)
     Route: Stargate Bridge | Fee: ~$0.15
     Proceed?
```

## Security Considerations

⚠️ **IMPORTANT**: Read this before using.

| Risk | Mitigation |
|------|------------|
| Private key exposure | Keys are AES-256-GCM encrypted locally. Never sent over network. |
| Password in env var | Set `SWAP_WALLET_PASSWORD` on your local machine only. Never commit to git. |
| Telegram message history | Don't type private keys in Telegram. Import wallets via CLI only. |
| OpenClaw skill supply chain | Use this official skill only. Verify checksums. Don't install random swap skills. |

### Best Practices

1. **Use a dedicated hot wallet** with small amounts for automated swaps
2. **Never send private keys via Telegram** — always import via CLI
3. **Set spending limits** in your wallet or use hardware wallet for large holdings
4. **Review quotes before confirming** — the skill always asks before executing
5. **Monitor transactions** — check explorer links after each swap

## Integration Modes

| Mode | Pros | Cons |
|------|------|------|
| **Skill (SKILL.md)** | Simple, no server needed | Requires `npx cli-swap` on host |
| **MCP Server** | Native tool integration, structured I/O | Needs MCP config |
| **HTTP API** | Works from any network device | Needs port exposure, API key |

### HTTP API Mode (Advanced)

For accessing cli-swap from a remote server:

```bash
# Start HTTP API with authentication
npx cli-swap-api --port 3100 --api-key YOUR_SECRET_KEY
```

Then configure OpenClaw to use HTTP:
```yaml
# In SKILL.md or custom script
API_BASE=http://localhost:3100
API_KEY=YOUR_SECRET_KEY
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| "command not found: cli-swap" | Run `npm install -g cli-swap` |
| "Wallet not found" | Run `cli-swap wallet import --name main --type evm` |
| "Wrong password" | Check `SWAP_WALLET_PASSWORD` env var |
| Slow responses | Li.Fi API latency varies; cross-chain quotes take 3-5s |
| "Token not found" | Try full name: `cli-swap tokens ethereum usdc --json` |
