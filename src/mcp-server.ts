#!/usr/bin/env node
/**
 * cli-swap MCP Server
 *
 * Exposes cli-swap functionality as MCP tools for AI agents.
 * Run: npx tsx src/mcp-server.ts (or node dist/mcp-server.js after build)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';

import {
  getSupportedChains,
  findChain,
  findToken,
  getChainTokens,
  getSwapQuote,
  executeSwapRoute,
  initSdkWithEvmWallet,
  initSdkWithSolanaWallet,
} from './core/swapper.js';
import {
  listWallets,
  getWallet,
  importEvmWallet,
  importSolanaWallet,
  unlockEvmWallet,
  unlockSolanaWallet,
} from './core/wallet.js';
import { loadConfig } from './core/config.js';
import { parseAmount, formatAmount } from './utils/amount.js';
import { DecryptionError } from './utils/crypto.js';

// ── Server setup ──────────────────────────────────────────────

const server = new McpServer({
  name: 'cli-swap',
  version: '0.1.0',
});

// ── Tool: list_chains ─────────────────────────────────────────

server.tool(
  'list_chains',
  'List all supported blockchain chains (60+). Optionally filter by type (EVM, SVM).',
  { type: z.string().optional().describe('Filter by chain type: EVM or SVM') },
  async ({ type }) => {
    const chains = await getSupportedChains();
    let filtered = chains;
    if (type) {
      const t = type.toUpperCase();
      filtered = chains.filter((c) => c.chainType?.toUpperCase() === t);
    }

    const result = filtered.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      chainType: c.chainType,
      nativeToken: c.nativeToken?.symbol,
    }));

    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Tool: search_tokens ───────────────────────────────────────

server.tool(
  'search_tokens',
  'Search tokens on a specific chain by symbol, name, or address.',
  {
    chain: z.string().describe('Chain name or ID (e.g., "ethereum", "arbitrum", "solana")'),
    query: z.string().optional().describe('Search query: token symbol, name, or address'),
    limit: z.number().optional().default(20).describe('Max results (default: 20)'),
  },
  async ({ chain, query, limit }) => {
    const chainInfo = await findChain(chain);
    if (!chainInfo) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Chain "${chain}" not found.` }) }], isError: true };
    }

    let tokens = await getChainTokens(chainInfo.id);

    if (query) {
      const q = query.toLowerCase();
      tokens = tokens.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.address.toLowerCase() === q,
      );
    }

    const result = tokens.slice(0, limit ?? 20).map((t) => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
    }));

    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Tool: get_balance ─────────────────────────────────────────

server.tool(
  'get_balance',
  'Check the native token balance of a wallet on a specific chain.',
  {
    chain: z.string().describe('Chain name or ID'),
    wallet: z.string().describe('Wallet name'),
  },
  async ({ chain, wallet }) => {
    const walletInfo = getWallet(wallet);
    if (!walletInfo) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Wallet "${wallet}" not found.` }) }], isError: true };
    }

    const chainInfo = await findChain(chain);
    if (!chainInfo) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Chain "${chain}" not found.` }) }], isError: true };
    }

    const config = loadConfig();

    let balance: string;
    let symbol: string;

    if (chainInfo.chainType === 'SVM') {
      const rpcUrl = config.rpcOverrides[String(chainInfo.id)] ?? 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      const pubkey = new PublicKey(walletInfo.address);
      const lamports = await connection.getBalance(pubkey);
      balance = formatAmount(lamports.toString(), 9);
      symbol = 'SOL';
    } else {
      const rpcUrl =
        config.rpcOverrides[String(chainInfo.id)] ??
        chainInfo.metamask?.rpcUrls?.[0] ??
        `https://rpc.ankr.com/${chainInfo.key}`;
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wei = await provider.getBalance(walletInfo.address);
      balance = formatAmount(wei.toString(), 18);
      symbol = chainInfo.nativeToken?.symbol ?? 'ETH';
    }

    const result = {
      wallet: wallet,
      chain: chainInfo.name,
      chainId: chainInfo.id,
      address: walletInfo.address,
      balance,
      symbol,
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Tool: get_quote ───────────────────────────────────────────

server.tool(
  'get_quote',
  'Get a swap quote without executing. Returns estimated output amount, route, and fees.',
  {
    fromChain: z.string().describe('Source chain (e.g., "ethereum")'),
    fromToken: z.string().describe('Source token symbol or address (e.g., "USDC")'),
    toChain: z.string().describe('Destination chain (e.g., "arbitrum")'),
    toToken: z.string().describe('Destination token symbol or address (e.g., "ETH")'),
    amount: z.string().describe('Amount in human-readable format (e.g., "100")'),
    wallet: z.string().describe('Wallet name (for from address)'),
    slippage: z.number().optional().describe('Slippage tolerance in % (default: 0.5)'),
  },
  async ({ fromChain, fromToken, toChain, toToken, amount, wallet, slippage }) => {
    const walletInfo = getWallet(wallet);
    if (!walletInfo) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Wallet "${wallet}" not found.` }) }], isError: true };
    }

    const config = loadConfig();
    const fromChainInfo = await findChain(fromChain);
    const toChainInfo = await findChain(toChain);
    if (!fromChainInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Chain "${fromChain}" not found.` }) }], isError: true };
    if (!toChainInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Chain "${toChain}" not found.` }) }], isError: true };

    const fromTokenInfo = await findToken(fromChainInfo.id, fromToken);
    const toTokenInfo = await findToken(toChainInfo.id, toToken);
    if (!fromTokenInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Token "${fromToken}" not found on ${fromChainInfo.name}.` }) }], isError: true };
    if (!toTokenInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Token "${toToken}" not found on ${toChainInfo.name}.` }) }], isError: true };

    const rawAmount = parseAmount(amount, fromTokenInfo.decimals);
    const slippageValue = slippage ? slippage / 100 : config.defaultSlippage / 100;

    const { quote } = await getSwapQuote({
      fromChainId: fromChainInfo.id,
      toChainId: toChainInfo.id,
      fromTokenAddress: fromTokenInfo.address,
      toTokenAddress: toTokenInfo.address,
      fromAmount: rawAmount,
      fromAddress: walletInfo.address,
      slippage: slippageValue,
    });

    const result = {
      from: { chain: fromChainInfo.name, token: fromTokenInfo.symbol, amount: formatAmount(quote.fromAmount, fromTokenInfo.decimals) },
      to: { chain: toChainInfo.name, token: toTokenInfo.symbol, amount: formatAmount(quote.toAmount, toTokenInfo.decimals), minAmount: formatAmount(quote.toAmountMin, toTokenInfo.decimals) },
      estimatedDuration: `${quote.executionDuration}s`,
      route: quote.toolsUsed,
      slippage: `${slippageValue * 100}%`,
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Tool: execute_swap ────────────────────────────────────────

server.tool(
  'execute_swap',
  'Execute a token swap. Requires wallet password to unlock the encrypted private key.',
  {
    fromChain: z.string().describe('Source chain'),
    fromToken: z.string().describe('Source token symbol or address'),
    toChain: z.string().describe('Destination chain'),
    toToken: z.string().describe('Destination token symbol or address'),
    amount: z.string().describe('Amount in human-readable format'),
    wallet: z.string().describe('Wallet name'),
    password: z.string().describe('Wallet encryption password'),
    slippage: z.number().optional().describe('Slippage tolerance in % (default: 0.5)'),
  },
  async ({ fromChain, fromToken, toChain, toToken, amount, wallet, password, slippage }) => {
    // Resolve wallet
    const walletInfo = getWallet(wallet);
    if (!walletInfo) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: `Wallet "${wallet}" not found.` }) }], isError: true };
    }

    // Unlock wallet and init SDK
    try {
      if (walletInfo.type === 'solana') {
        const keypair = unlockSolanaWallet(walletInfo, password);
        initSdkWithSolanaWallet(keypair.secretKey.toString());
      } else {
        const ethWallet = unlockEvmWallet(walletInfo, password);
        initSdkWithEvmWallet(ethWallet.privateKey);
      }
    } catch (err) {
      const msg = err instanceof DecryptionError ? 'Wrong password.' : (err instanceof Error ? err.message : String(err));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: msg }) }], isError: true };
    }

    // Resolve chains and tokens
    const config = loadConfig();
    const fromChainInfo = await findChain(fromChain);
    const toChainInfo = await findChain(toChain);
    if (!fromChainInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: `Chain "${fromChain}" not found.` }) }], isError: true };
    if (!toChainInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: `Chain "${toChain}" not found.` }) }], isError: true };

    const fromTokenInfo = await findToken(fromChainInfo.id, fromToken);
    const toTokenInfo = await findToken(toChainInfo.id, toToken);
    if (!fromTokenInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: `Token "${fromToken}" not found on ${fromChainInfo.name}.` }) }], isError: true };
    if (!toTokenInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: `Token "${toToken}" not found on ${toChainInfo.name}.` }) }], isError: true };

    const rawAmount = parseAmount(amount, fromTokenInfo.decimals);
    const slippageValue = slippage ? slippage / 100 : config.defaultSlippage / 100;

    // Get quote
    const { route } = await getSwapQuote({
      fromChainId: fromChainInfo.id,
      toChainId: toChainInfo.id,
      fromTokenAddress: fromTokenInfo.address,
      toTokenAddress: toTokenInfo.address,
      fromAmount: rawAmount,
      fromAddress: walletInfo.address,
      slippage: slippageValue,
    });

    // Execute swap
    const swapResult = await executeSwapRoute(route);

    if (swapResult.status === 'success') {
      const result = {
        status: 'success',
        txHash: swapResult.txHash,
        from: { chain: fromChainInfo.name, token: fromTokenInfo.symbol, amount: formatAmount(swapResult.fromAmount, fromTokenInfo.decimals) },
        to: { chain: toChainInfo.name, token: toTokenInfo.symbol, amount: formatAmount(swapResult.toAmount, toTokenInfo.decimals) },
        explorerUrl: swapResult.explorerUrl,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } else {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed', error: swapResult.error ?? 'Unknown error' }) }],
        isError: true,
      };
    }
  },
);

// ── Tool: list_wallets ────────────────────────────────────────

server.tool(
  'list_wallets',
  'List all saved wallets with their names, types, and addresses.',
  {},
  async () => {
    const wallets = listWallets();
    const config = loadConfig();

    const result = wallets.map((w) => ({
      name: w.name,
      type: w.type,
      address: w.address,
      default: w.name === config.defaultWallet,
      createdAt: w.createdAt,
    }));

    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// ── Tool: import_wallet ───────────────────────────────────────

server.tool(
  'import_wallet',
  'Import a new wallet from a private key. The key is encrypted with AES-256-GCM before storage.',
  {
    name: z.string().describe('Wallet name (unique identifier)'),
    type: z.enum(['evm', 'solana']).describe('Wallet type: evm or solana'),
    privateKey: z.string().describe('Private key (hex for EVM, base58 for Solana)'),
    password: z.string().min(8).describe('Encryption password (minimum 8 characters)'),
  },
  async ({ name, type, privateKey, password }) => {
    // Check if already exists
    if (getWallet(name)) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Wallet "${name}" already exists.` }) }], isError: true };
    }

    try {
      const info = type === 'solana'
        ? importSolanaWallet(name, privateKey, password)
        : importEvmWallet(name, privateKey, password);

      const result = { name: info.name, type: info.type, address: info.address };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }], isError: true };
    }
  },
);

// ── Start server ──────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP Server failed to start:', err);
  process.exit(1);
});
