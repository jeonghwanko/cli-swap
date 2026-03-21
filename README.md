# cli-swap

Multi-chain token swap CLI for humans and AI agents. Powered by [Li.Fi SDK](https://li.fi/) (60+ chains).

**The open-source DeFi toolkit for AI agents.** Swap any token on 60+ chains via CLI, MCP, or HTTP API.

## Features

- **60+ chains**: Ethereum, Solana, Polygon, Arbitrum, Base, BSC, Optimism, Avalanche, and more
- **Same-chain & cross-chain**: Swap tokens within or across any supported chain
- **3 integration modes**: CLI, MCP Server (Claude native), HTTP REST API
- **Agent mode**: Natural language swaps — `cli-swap agent "swap 1 ETH to USDC"`
- **Batch swaps**: Execute multiple swaps from a JSON file
- **AI SDK examples**: Claude Agent SDK, LangChain, Vercel AI SDK
- **OpenClaw integration**: Swap tokens from Telegram, WhatsApp, Slack via OpenClaw AI agent
- **Secure wallet storage**: AES-256-GCM encrypted private keys stored locally
- **Best route**: Li.Fi aggregates 20+ DEXs and 20+ bridges for optimal pricing

## Install

```bash
npm install -g cli-swap

# or run directly
npx cli-swap --help
```

## Quick Start

```bash
# 1. Import your wallet
cli-swap wallet import --name my-wallet --type evm

# 2. Check supported chains
cli-swap chains

# 3. Search tokens
cli-swap tokens ethereum USDC

# 4. Get a quote
cli-swap quote ethereum USDC polygon USDC 100

# 5. Execute swap
cli-swap swap ethereum USDC polygon USDC 100 --slippage 1
```

## Commands

### Wallet Management

```bash
cli-swap wallet import          # Import wallet (interactive)
cli-swap wallet import --name w1 --type evm --key 0x... --password mypass
cli-swap wallet list            # List saved wallets
cli-swap wallet remove <name>   # Remove a wallet
cli-swap wallet default <name>  # Set default wallet
```

### Information

```bash
cli-swap chains                           # List all 60+ supported chains
cli-swap chains --type EVM                # Filter by chain type (EVM/SVM)
cli-swap tokens <chain> [query]           # Search tokens on a chain
cli-swap balance <chain>                  # Check native token balance
```

### Configuration

```bash
cli-swap config show                      # Show current config
cli-swap config set-rpc <chainId> <url>   # Set custom RPC URL
cli-swap config remove-rpc <chainId>      # Remove custom RPC URL
cli-swap config set-slippage <pct>        # Set default slippage (e.g. 0.5)
```

### Swap

```bash
# Get quote only (no execution)
cli-swap quote <fromChain> <fromToken> <toChain> <toToken> <amount>

# Execute swap
cli-swap swap <fromChain> <fromToken> <toChain> <toToken> <amount> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--slippage <pct>` | Slippage tolerance in % (default: 0.5) |
| `--wallet <name>` | Wallet to use (default: default wallet) |
| `--password <pw>` | Wallet password (or use `SWAP_WALLET_PASSWORD` env) |
| `--yes` | Skip confirmation prompt |
| `--json` | Output as JSON |

### Examples

```bash
# Same-chain swap: ETH → USDC on Ethereum
cli-swap swap ethereum ETH ethereum USDC 0.5

# Cross-chain swap: USDC from Ethereum to Polygon
cli-swap swap ethereum USDC polygon USDC 100 --slippage 1

# Solana: SOL → USDC
cli-swap swap solana SOL solana USDC 5

# Cross-ecosystem: Solana SOL → Ethereum USDC
cli-swap swap solana SOL ethereum USDC 5
```

### Agent Mode (Natural Language)

```bash
# Natural language swap
cli-swap agent "swap 1 ETH to USDC on ethereum"
cli-swap agent "이더리움 ETH 0.5개를 USDC로 바꿔줘"
cli-swap agent "bridge 100 USDC from ethereum to polygon"

# Non-interactive (for automation)
cli-swap agent "swap 1 ETH to USDC on ethereum" --wallet main --password mypass --yes --json
```

### Batch Swaps

Execute multiple swaps from a JSON file:

```bash
# Preview (dry run)
cli-swap batch swaps.json --dry-run

# Execute all
cli-swap batch swaps.json --wallet main --password mypass

# Continue even if one fails
cli-swap batch swaps.json --continue-on-error --json
```

**swaps.json:**
```json
[
  { "fromChain": "ethereum", "fromToken": "ETH", "toChain": "ethereum", "toToken": "USDC", "amount": "0.1" },
  { "fromChain": "ethereum", "fromToken": "USDC", "toChain": "polygon", "toToken": "USDC", "amount": "50" }
]
```

## AI Agent Integration

The CLI is designed to be called programmatically by AI agents:

```bash
# Non-interactive mode: JSON output + auto-confirm + password via env
export SWAP_WALLET_PASSWORD=mypassword
cli-swap swap ethereum USDC polygon USDC 100 --yes --json

# Output:
# {
#   "status": "success",
#   "txHash": "0x...",
#   "from": { "chain": "Ethereum", "token": "USDC", "amount": "100.000000" },
#   "to": { "chain": "Polygon", "token": "USDC", "amount": "99.950000" },
#   "explorerUrl": "https://etherscan.io/tx/0x..."
# }
```

**Key flags for automation:**
- `--json`: All output as parseable JSON (both success and errors)
- `--yes`: Skip confirmation prompts
- `--password <pw>` or `SWAP_WALLET_PASSWORD` env: Non-interactive password
- Exit codes: `0` = success, `1` = failure

**Error response (JSON):**
```json
{
  "status": "failed",
  "error": "Wallet \"main\" not found. Run `cli-swap wallet list` to see available wallets."
}
```

## MCP Server (AI Agent Native Integration)

cli-swap includes a built-in [MCP](https://modelcontextprotocol.io/) server that exposes swap functionality as native tools for AI agents like Claude.

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_chains` | List all 60+ supported chains |
| `search_tokens` | Search tokens on a chain by symbol/name |
| `get_balance` | Check native token balance |
| `get_quote` | Get swap quote (no execution) |
| `execute_swap` | Execute a token swap |
| `list_wallets` | List saved wallets |
| `import_wallet` | Import a new wallet |

### Setup for Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cli-swap": {
      "command": "npx",
      "args": ["-y", "cli-swap-mcp"]
    }
  }
}
```

Or if installed from source:

```json
{
  "mcpServers": {
    "cli-swap": {
      "command": "node",
      "args": ["C:/path/to/cli-swap/dist/mcp-server.js"]
    }
  }
}
```

### Setup for Claude Code

```bash
claude mcp add cli-swap -- npx -y cli-swap-mcp
```

Or from source:

```bash
claude mcp add cli-swap -- npx tsx C:/path/to/cli-swap/src/mcp-server.ts
```

### Usage with AI Agent

Once connected, the AI agent can directly call tools:

> "이더리움에서 USDC 토큰 검색해줘" → `search_tokens(chain: "ethereum", query: "USDC")`
>
> "내 지갑 잔액 확인해줘" → `get_balance(chain: "ethereum", wallet: "main")`
>
> "이더리움 ETH를 아비트럼 USDC로 0.1개 스왑해줘" → `execute_swap(...)`

### SDK Integration Examples

Ready-to-run examples in the [`examples/`](./examples) directory:

| File | SDK | Description |
|------|-----|-------------|
| [`claude-agent-sdk.ts`](./examples/claude-agent-sdk.ts) | Claude Agent SDK | Claude as a DeFi trading agent |
| [`langchain.ts`](./examples/langchain.ts) | LangChain | OpenAI Functions Agent + cli-swap HTTP API |
| [`vercel-ai-sdk.ts`](./examples/vercel-ai-sdk.ts) | Vercel AI SDK | Multi-step tool calling with any LLM |
| [`batch-swap.json`](./examples/batch-swap.json) | — | Example batch swap file |

```bash
# Claude Agent SDK
ANTHROPIC_API_KEY=sk-... npx tsx examples/claude-agent-sdk.ts

# LangChain (start HTTP API first)
npx cli-swap-api &
OPENAI_API_KEY=sk-... npx tsx examples/langchain.ts

# Vercel AI SDK
npx cli-swap-api &
OPENAI_API_KEY=sk-... npx tsx examples/vercel-ai-sdk.ts
```

## HTTP API Server

For AI agents and services that don't support MCP, cli-swap also provides a REST API:

```bash
# Start HTTP API server
npx cli-swap-api                          # port 3100 (default)
npx cli-swap-api --port 8080              # custom port
npx cli-swap-api --api-key mysecretkey    # with API key auth
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/chains?type=EVM` | List chains |
| `GET` | `/tokens/:chain?query=USDC` | Search tokens |
| `GET` | `/balance/:chain?wallet=name` | Check balance |
| `POST` | `/quote` | Get swap quote |
| `POST` | `/swap` | Execute swap |
| `GET` | `/wallets` | List wallets |
| `POST` | `/wallets` | Import wallet |

### Example

```bash
# Get a swap quote
curl -X POST http://localhost:3100/quote \
  -H "Content-Type: application/json" \
  -d '{"fromChain":"ethereum","fromToken":"ETH","toChain":"ethereum","toToken":"USDC","amount":"1","wallet":"main"}'
```

## OpenClaw Integration (Telegram / WhatsApp / Slack)

Use cli-swap from any messaging app via [OpenClaw](https://openclaw.ai/) — the open-source AI agent.

### Quick Setup

```bash
# 1. Install cli-swap & import wallet
npm install -g cli-swap
cli-swap wallet import --name main --type evm

# 2. Install the OpenClaw skill
cp -r node_modules/cli-swap/openclaw-skill/ ~/.openclaw/workspace/skills/cli-swap/

# 3. Or use MCP Server (recommended)
# Add to ~/.openclaw/config.yaml:
```

```yaml
mcp:
  servers:
    cli-swap:
      command: npx
      args: ["-y", "cli-swap-mcp"]
```

```bash
# 4. Set wallet password for non-interactive use
echo 'SWAP_WALLET_PASSWORD=your-password' >> ~/.openclaw/.env
```

### Usage via Telegram

```
You: swap 1 ETH to USDC on ethereum
Bot: 📊 Quote: 1 ETH → 2,487.32 USDC (via Uniswap V3)
     Fee: ~$2.50 | Slippage: 0.5%
     Proceed? (yes/no)
You: yes
Bot: ✅ Swap executed! TX: 0xabc...123
     🔗 https://etherscan.io/tx/0xabc...123
```

```
You: 이더리움 ETH 0.5개를 USDC로 바꿔줘
Bot: 📊 견적: 0.5 ETH → 1,243.66 USDC
     진행할까요?
You: 응
Bot: ✅ 스왑 완료! TX: 0xdef...456
```

> **Security**: Private keys are stored AES-256-GCM encrypted on your local machine. Only the wallet **password** is needed at swap time. **Never send private keys via Telegram** — always import via CLI.

See [`openclaw-skill/README.md`](./openclaw-skill/README.md) for the full setup guide.

## Security

- Private keys are encrypted with **AES-256-GCM** using scrypt-derived keys
- Encrypted wallets stored at `~/.cli-swap/wallets/`
- Keys are never logged or printed
- Password required to unlock for every swap

## Configuration

Config file: `~/.cli-swap/config.json`

```json
{
  "defaultWallet": "main",
  "defaultSlippage": 0.5,
  "rpcOverrides": {
    "1": "https://my-custom-rpc.com"
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `defaultWallet` | — | Wallet used when `--wallet` is omitted |
| `defaultSlippage` | `0.5` | Slippage tolerance in % |
| `rpcOverrides` | `{}` | Custom RPC URLs keyed by chain ID |

## Supported Chains

60+ chains including: Ethereum, Solana, Polygon, Arbitrum, Optimism, Base, BSC, Avalanche, Gnosis, Fantom, zkSync, Linea, Scroll, Blast, Mantle, Mode, Celo, and many more.

Run `cli-swap chains` for the full list.

## Development

```bash
git clone https://github.com/jeonghwanko/cli-swap.git
cd cli-swap
npm install

# Dev mode (auto-reload)
npm run dev -- wallet list

# Build
npm run build

# Run tests (41 tests across 5 suites)
npm test

# Type check
npx tsc --noEmit
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| CLI framework | Commander.js |
| MCP Server | @modelcontextprotocol/sdk |
| Swap aggregator | Li.Fi SDK (60+ chains) |
| EVM | ethers.js v6 |
| Solana | @solana/web3.js |
| Encryption | Node.js crypto (AES-256-GCM + scrypt) |
| Testing | Vitest 4 |
| Language | TypeScript (strict, ESM) |

## License

MIT
