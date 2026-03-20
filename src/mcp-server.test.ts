/**
 * MCP Server unit tests.
 *
 * Uses InMemoryTransport to test server tools without stdio.
 * Core functions (swapper, wallet) are mocked to avoid network calls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// Isolated home dir for wallet/config tests
const testId = randomBytes(4).toString('hex');
const testHome = join(tmpdir(), `cli-swap-mcp-test-${testId}`);

// Must use hoisted variable for vi.mock factory
const { hoistedHome } = vi.hoisted(() => {
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { randomBytes } = require('node:crypto');
  return { hoistedHome: join(tmpdir(), `cli-swap-mcp-mock-${randomBytes(4).toString('hex')}`) };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => hoistedHome };
});

// Mock swapper to avoid network calls
vi.mock('./core/swapper.js', () => ({
  getSupportedChains: vi.fn().mockResolvedValue([
    { id: 1, key: 'eth', name: 'Ethereum', chainType: 'EVM', nativeToken: { symbol: 'ETH' } },
    { id: 137, key: 'pol', name: 'Polygon', chainType: 'EVM', nativeToken: { symbol: 'POL' } },
    { id: 1151111081099710, key: 'sol', name: 'Solana', chainType: 'SVM', nativeToken: { symbol: 'SOL' } },
  ]),
  findChain: vi.fn().mockImplementation(async (nameOrId: string) => {
    const chains: Record<string, { id: number; key: string; name: string; chainType: string }> = {
      ethereum: { id: 1, key: 'eth', name: 'Ethereum', chainType: 'EVM' },
      eth: { id: 1, key: 'eth', name: 'Ethereum', chainType: 'EVM' },
      polygon: { id: 137, key: 'pol', name: 'Polygon', chainType: 'EVM' },
    };
    return chains[nameOrId.toLowerCase()];
  }),
  getChainTokens: vi.fn().mockResolvedValue([
    { symbol: 'USDC', name: 'USD Coin', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    { symbol: 'USDT', name: 'Tether', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    { symbol: 'WETH', name: 'Wrapped Ether', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
  ]),
  findToken: vi.fn().mockImplementation(async (_chainId: number, symbol: string) => {
    if (symbol.toUpperCase() === 'USDC') return { symbol: 'USDC', name: 'USD Coin', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 };
    if (symbol.toUpperCase() === 'ETH') return { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18 };
    return undefined;
  }),
  getSwapQuote: vi.fn().mockResolvedValue({
    quote: {
      fromAmount: '1000000000000000000', toAmount: '2500000000', toAmountMin: '2487500000',
      estimatedGas: '0.5', executionDuration: 30, toolsUsed: ['Uniswap'],
      fromChain: 'Ethereum', fromToken: 'ETH', toChain: 'Ethereum', toToken: 'USDC',
    },
    route: { id: 'mock-route' },
  }),
  executeSwapRoute: vi.fn().mockResolvedValue({
    status: 'success', txHash: '0xmockhash', fromAmount: '1000000000000000000',
    toAmount: '2500000000', explorerUrl: 'https://etherscan.io/tx/0xmockhash',
  }),
  initSdkWithEvmWallet: vi.fn(),
  initSdkWithSolanaWallet: vi.fn(),
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Dynamically import the server AFTER mocks are set up
// We need to re-create the server for each test suite since mcp-server.ts
// calls connect() at module level. Instead, we'll extract the server creation logic.
// For testing, we import the McpServer and tools registration separately.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getSupportedChains,
  findChain,
  getChainTokens,
  findToken,
  getSwapQuote,
} from './core/swapper.js';
import { listWallets, getWallet, importEvmWallet } from './core/wallet.js';
import { loadConfig } from './core/config.js';
import { parseAmount, formatAmount } from './utils/amount.js';

// Build a test server with the same tools as mcp-server.ts
function createTestServer(): McpServer {
  const server = new McpServer({ name: 'cli-swap-test', version: '0.1.0' });

  server.tool('list_chains', 'List supported chains',
    { type: z.string().optional() },
    async ({ type }) => {
      const chains = await getSupportedChains();
      let filtered = chains;
      if (type) filtered = chains.filter((c: { chainType?: string }) => c.chainType?.toUpperCase() === type.toUpperCase());
      const result = filtered.map((c: { id: number; key: string; name: string; chainType?: string; nativeToken?: { symbol: string } }) => ({
        id: c.id, key: c.key, name: c.name, chainType: c.chainType, nativeToken: c.nativeToken?.symbol,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool('search_tokens', 'Search tokens',
    { chain: z.string(), query: z.string().optional(), limit: z.number().optional().default(20) },
    async ({ chain, query, limit }) => {
      const chainInfo = await findChain(chain);
      if (!chainInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Chain "${chain}" not found.` }) }], isError: true };
      let tokens = await getChainTokens(chainInfo.id);
      if (query) {
        const q = query.toLowerCase();
        tokens = tokens.filter((t: { symbol: string; name?: string; address: string }) =>
          t.symbol.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q) || t.address.toLowerCase() === q);
      }
      const result = tokens.slice(0, limit ?? 20).map((t: { symbol: string; name?: string; address: string; decimals: number }) => ({
        symbol: t.symbol, name: t.name, address: t.address, decimals: t.decimals,
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool('list_wallets', 'List wallets', {},
    async () => {
      const wallets = listWallets();
      const config = loadConfig();
      const result = wallets.map((w) => ({ name: w.name, type: w.type, address: w.address, default: w.name === config.defaultWallet }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool('import_wallet', 'Import wallet', {
    name: z.string(), type: z.enum(['evm', 'solana']), privateKey: z.string(), password: z.string().min(8),
  }, async ({ name, type, privateKey, password }) => {
    if (getWallet(name)) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Wallet "${name}" already exists.` }) }], isError: true };
    try {
      const info = importEvmWallet(name, privateKey, password);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ name: info.name, type: info.type, address: info.address }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }], isError: true };
    }
  });

  server.tool('get_quote', 'Get swap quote', {
    fromChain: z.string(), fromToken: z.string(), toChain: z.string(), toToken: z.string(),
    amount: z.string(), wallet: z.string(), slippage: z.number().optional(),
  }, async ({ fromChain, fromToken, toChain, toToken, amount, wallet, slippage }) => {
    const walletInfo = getWallet(wallet);
    if (!walletInfo) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Wallet "${wallet}" not found.` }) }], isError: true };
    const config = loadConfig();
    const fc = await findChain(fromChain);
    const tc = await findChain(toChain);
    if (!fc || !tc) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Chain not found.' }) }], isError: true };
    const ft = await findToken(fc.id, fromToken);
    const tt = await findToken(tc.id, toToken);
    if (!ft || !tt) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Token not found.' }) }], isError: true };
    const rawAmount = parseAmount(amount, ft.decimals);
    const slippageVal = slippage ? slippage / 100 : config.defaultSlippage / 100;
    const { quote } = await getSwapQuote({
      fromChainId: fc.id, toChainId: tc.id, fromTokenAddress: ft.address, toTokenAddress: tt.address,
      fromAmount: rawAmount, fromAddress: walletInfo.address, slippage: slippageVal,
    });
    const result = {
      from: { chain: fc.name, token: ft.symbol, amount: formatAmount(quote.fromAmount, ft.decimals) },
      to: { chain: tc.name, token: tt.symbol, amount: formatAmount(quote.toAmount, tt.decimals), minAmount: formatAmount(quote.toAmountMin, tt.decimals) },
      estimatedDuration: `${quote.executionDuration}s`,
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

describe('MCP Server Tools', () => {
  let client: Client;
  let mcpServer: McpServer;

  beforeAll(async () => {
    mkdirSync(hoistedHome, { recursive: true });
    mcpServer = createTestServer();
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), mcpServer.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
    await mcpServer.close();
    rmSync(hoistedHome, { recursive: true, force: true });
  });

  it('lists available tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_chains');
    expect(names).toContain('search_tokens');
    expect(names).toContain('list_wallets');
    expect(names).toContain('import_wallet');
    expect(names).toContain('get_quote');
  });

  it('list_chains returns all chains', async () => {
    const result = await client.callTool({ name: 'list_chains', arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const chains = JSON.parse(text);
    expect(chains).toHaveLength(3);
    expect(chains[0].name).toBe('Ethereum');
  });

  it('list_chains filters by type', async () => {
    const result = await client.callTool({ name: 'list_chains', arguments: { type: 'SVM' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const chains = JSON.parse(text);
    expect(chains).toHaveLength(1);
    expect(chains[0].name).toBe('Solana');
  });

  it('search_tokens finds USDC', async () => {
    const result = await client.callTool({ name: 'search_tokens', arguments: { chain: 'ethereum', query: 'USDC' } });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const tokens = JSON.parse(text);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].symbol).toBe('USDC');
  });

  it('search_tokens returns error for unknown chain', async () => {
    const result = await client.callTool({ name: 'search_tokens', arguments: { chain: 'fakenet' } });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('not found');
  });

  it('list_wallets returns empty initially', async () => {
    const result = await client.callTool({ name: 'list_wallets', arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const wallets = JSON.parse(text);
    expect(wallets).toEqual([]);
  });

  it('import_wallet creates a wallet', async () => {
    const result = await client.callTool({
      name: 'import_wallet',
      arguments: {
        name: 'mcp-test',
        type: 'evm',
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        password: 'testpass123',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const wallet = JSON.parse(text);
    expect(wallet.name).toBe('mcp-test');
    expect(wallet.type).toBe('evm');
    expect(wallet.address).toMatch(/^0x/);
  });

  it('import_wallet rejects duplicate', async () => {
    const result = await client.callTool({
      name: 'import_wallet',
      arguments: {
        name: 'mcp-test',
        type: 'evm',
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        password: 'testpass123',
      },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('already exists');
  });

  it('list_wallets shows imported wallet', async () => {
    const result = await client.callTool({ name: 'list_wallets', arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const wallets = JSON.parse(text);
    expect(wallets).toHaveLength(1);
    expect(wallets[0].name).toBe('mcp-test');
  });

  it('get_quote returns quote', async () => {
    const result = await client.callTool({
      name: 'get_quote',
      arguments: {
        fromChain: 'ethereum', fromToken: 'ETH',
        toChain: 'ethereum', toToken: 'USDC',
        amount: '1', wallet: 'mcp-test',
      },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    const quote = JSON.parse(text);
    expect(quote.from.token).toBe('ETH');
    expect(quote.to.token).toBe('USDC');
    expect(quote.estimatedDuration).toBe('30s');
  });

  it('get_quote returns error for missing wallet', async () => {
    const result = await client.callTool({
      name: 'get_quote',
      arguments: {
        fromChain: 'ethereum', fromToken: 'ETH',
        toChain: 'ethereum', toToken: 'USDC',
        amount: '1', wallet: 'nonexistent',
      },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('not found');
  });
});
