# cli-swap

Multi-chain token swap CLI for humans and AI agents. Powered by [Li.Fi SDK](https://li.fi/) (60+ chains).

## Features

- **60+ chains**: Ethereum, Solana, Polygon, Arbitrum, Base, BSC, Optimism, Avalanche, and more
- **Same-chain & cross-chain**: Swap tokens within or across any supported chain
- **AI Agent friendly**: `--json` output + `--yes` auto-confirm + env var password
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
| Swap aggregator | Li.Fi SDK (60+ chains) |
| EVM | ethers.js v6 |
| Solana | @solana/web3.js |
| Encryption | Node.js crypto (AES-256-GCM + scrypt) |
| Testing | Vitest 4 |
| Language | TypeScript (strict, ESM) |

## License

MIT
