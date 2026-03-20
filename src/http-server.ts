#!/usr/bin/env node
/**
 * cli-swap HTTP API Server
 *
 * REST API wrapper for cli-swap functionality.
 * For AI agents and services that don't support MCP.
 *
 * Usage: npx tsx src/http-server.ts [--port 3100] [--api-key mykey]
 */

import express, { type Request, type Response, type NextFunction } from 'express';
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

// ── Parse CLI args ────────────────────────────────────────────

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3100;
const keyIdx = args.indexOf('--api-key');
const API_KEY = keyIdx !== -1 ? args[keyIdx + 1] : process.env['CLI_SWAP_API_KEY'];

// ── Express app ───────────────────────────────────────────────

const app = express();
app.use(express.json());

// Optional API key auth
if (API_KEY) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['x-api-key'] ?? req.query['apiKey'];
    if (key !== API_KEY) {
      res.status(401).json({ error: 'Invalid or missing API key.' });
      return;
    }
    next();
  });
}

// ── Error wrapper ─────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// ── Routes ────────────────────────────────────────────────────

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// GET /chains?type=EVM
app.get('/chains', asyncHandler(async (req, res) => {
  const chains = await getSupportedChains();
  const typeFilter = req.query['type'] ? String(req.query['type']) : undefined;
  let filtered = chains;
  if (typeFilter) {
    const t = typeFilter.toUpperCase();
    filtered = chains.filter((c) => c.chainType?.toUpperCase() === t);
  }
  const result = filtered.map((c) => ({
    id: c.id, key: c.key, name: c.name, chainType: c.chainType, nativeToken: c.nativeToken?.symbol,
  }));
  res.json(result);
}));

// GET /tokens/:chain?query=USDC&limit=20
app.get('/tokens/:chain', asyncHandler(async (req, res) => {
  const chainInfo = await findChain(String(req.params.chain));
  if (!chainInfo) { res.status(404).json({ error: `Chain "${req.params.chain}" not found.` }); return; }

  let tokens = await getChainTokens(chainInfo.id);
  const query = String(req.query['query'] ?? '');
  if (query) {
    const q = query.toLowerCase();
    tokens = tokens.filter((t) =>
      t.symbol.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q) || t.address.toLowerCase() === q);
  }
  const limit = parseInt(String(req.query['limit'] ?? '20'), 10) || 20;
  const result = tokens.slice(0, limit).map((t) => ({
    symbol: t.symbol, name: t.name, address: t.address, decimals: t.decimals,
  }));
  res.json(result);
}));

// GET /balance/:chain?wallet=name
app.get('/balance/:chain', asyncHandler(async (req, res) => {
  const walletName = String(req.query['wallet'] ?? '');
  if (!walletName) { res.status(400).json({ error: 'Missing "wallet" query parameter.' }); return; }
  const walletInfo = getWallet(walletName);
  if (!walletInfo) { res.status(404).json({ error: `Wallet "${walletName}" not found.` }); return; }
  const chainInfo = await findChain(String(req.params.chain));
  if (!chainInfo) { res.status(404).json({ error: `Chain "${req.params.chain}" not found.` }); return; }

  const config = loadConfig();
  let balance: string;
  let symbol: string;

  if (chainInfo.chainType === 'SVM') {
    const rpcUrl = config.rpcOverrides[String(chainInfo.id)] ?? 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);
    const lamports = await connection.getBalance(new PublicKey(walletInfo.address));
    balance = formatAmount(lamports.toString(), 9);
    symbol = 'SOL';
  } else {
    const rpcUrl = config.rpcOverrides[String(chainInfo.id)] ?? chainInfo.metamask?.rpcUrls?.[0] ?? `https://rpc.ankr.com/${chainInfo.key}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wei = await provider.getBalance(walletInfo.address);
    balance = formatAmount(wei.toString(), 18);
    symbol = chainInfo.nativeToken?.symbol ?? 'ETH';
  }

  res.json({ wallet: walletName, chain: chainInfo.name, address: walletInfo.address, balance, symbol });
}));

// POST /quote { fromChain, fromToken, toChain, toToken, amount, wallet, slippage? }
app.post('/quote', asyncHandler(async (req, res) => {
  const { fromChain, fromToken, toChain, toToken, amount, wallet, slippage } = req.body;
  if (!fromChain || !fromToken || !toChain || !toToken || !amount || !wallet) {
    res.status(400).json({ error: 'Missing required fields: fromChain, fromToken, toChain, toToken, amount, wallet' });
    return;
  }

  const walletInfo = getWallet(wallet);
  if (!walletInfo) { res.status(404).json({ error: `Wallet "${wallet}" not found.` }); return; }

  const config = loadConfig();
  const fc = await findChain(fromChain);
  const tc = await findChain(toChain);
  if (!fc) { res.status(404).json({ error: `Chain "${fromChain}" not found.` }); return; }
  if (!tc) { res.status(404).json({ error: `Chain "${toChain}" not found.` }); return; }

  const ft = await findToken(fc.id, fromToken);
  const tt = await findToken(tc.id, toToken);
  if (!ft) { res.status(404).json({ error: `Token "${fromToken}" not found on ${fc.name}.` }); return; }
  if (!tt) { res.status(404).json({ error: `Token "${toToken}" not found on ${tc.name}.` }); return; }

  const rawAmount = parseAmount(amount, ft.decimals);
  const slippageVal = slippage ? slippage / 100 : config.defaultSlippage / 100;

  const { quote } = await getSwapQuote({
    fromChainId: fc.id, toChainId: tc.id,
    fromTokenAddress: ft.address, toTokenAddress: tt.address,
    fromAmount: rawAmount, fromAddress: walletInfo.address, slippage: slippageVal,
  });

  res.json({
    from: { chain: fc.name, token: ft.symbol, amount: formatAmount(quote.fromAmount, ft.decimals) },
    to: { chain: tc.name, token: tt.symbol, amount: formatAmount(quote.toAmount, tt.decimals), minAmount: formatAmount(quote.toAmountMin, tt.decimals) },
    estimatedDuration: `${quote.executionDuration}s`,
    route: quote.toolsUsed,
    slippage: `${slippageVal * 100}%`,
  });
}));

// POST /swap { fromChain, fromToken, toChain, toToken, amount, wallet, password, slippage? }
app.post('/swap', asyncHandler(async (req, res) => {
  const { fromChain, fromToken, toChain, toToken, amount, wallet, password, slippage } = req.body;
  if (!fromChain || !fromToken || !toChain || !toToken || !amount || !wallet || !password) {
    res.status(400).json({ error: 'Missing required fields: fromChain, fromToken, toChain, toToken, amount, wallet, password' });
    return;
  }

  const walletInfo = getWallet(wallet);
  if (!walletInfo) { res.status(404).json({ status: 'failed', error: `Wallet "${wallet}" not found.` }); return; }

  // Unlock wallet
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
    res.status(401).json({ status: 'failed', error: msg });
    return;
  }

  const config = loadConfig();
  const fc = await findChain(fromChain);
  const tc = await findChain(toChain);
  if (!fc) { res.status(404).json({ status: 'failed', error: `Chain "${fromChain}" not found.` }); return; }
  if (!tc) { res.status(404).json({ status: 'failed', error: `Chain "${toChain}" not found.` }); return; }

  const ft = await findToken(fc.id, fromToken);
  const tt = await findToken(tc.id, toToken);
  if (!ft) { res.status(404).json({ status: 'failed', error: `Token "${fromToken}" not found on ${fc.name}.` }); return; }
  if (!tt) { res.status(404).json({ status: 'failed', error: `Token "${toToken}" not found on ${tc.name}.` }); return; }

  const rawAmount = parseAmount(amount, ft.decimals);
  const slippageVal = slippage ? slippage / 100 : config.defaultSlippage / 100;

  const { route } = await getSwapQuote({
    fromChainId: fc.id, toChainId: tc.id,
    fromTokenAddress: ft.address, toTokenAddress: tt.address,
    fromAmount: rawAmount, fromAddress: walletInfo.address, slippage: slippageVal,
  });

  const result = await executeSwapRoute(route);

  if (result.status === 'success') {
    res.json({
      status: 'success', txHash: result.txHash,
      from: { chain: fc.name, token: ft.symbol, amount: formatAmount(result.fromAmount, ft.decimals) },
      to: { chain: tc.name, token: tt.symbol, amount: formatAmount(result.toAmount, tt.decimals) },
      explorerUrl: result.explorerUrl,
    });
  } else {
    res.status(500).json({ status: 'failed', error: result.error ?? 'Unknown error' });
  }
}));

// GET /wallets
app.get('/wallets', (_req, res) => {
  const wallets = listWallets();
  const config = loadConfig();
  res.json(wallets.map((w) => ({
    name: w.name, type: w.type, address: w.address,
    default: w.name === config.defaultWallet, createdAt: w.createdAt,
  })));
});

// POST /wallets { name, type, privateKey, password }
app.post('/wallets', asyncHandler(async (req, res) => {
  const { name, type, privateKey, password } = req.body;
  if (!name || !type || !privateKey || !password) {
    res.status(400).json({ error: 'Missing required fields: name, type, privateKey, password' });
    return;
  }
  if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
  if (getWallet(name)) { res.status(409).json({ error: `Wallet "${name}" already exists.` }); return; }

  try {
    const info = type === 'solana'
      ? importSolanaWallet(name, privateKey, password)
      : importEvmWallet(name, privateKey, password);
    res.status(201).json({ name: info.name, type: info.type, address: info.address });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
}));

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`cli-swap HTTP API listening on http://localhost:${PORT}`);
  if (API_KEY) console.log('API key authentication enabled');
  console.log('\nEndpoints:');
  console.log('  GET  /health');
  console.log('  GET  /chains?type=EVM');
  console.log('  GET  /tokens/:chain?query=USDC');
  console.log('  GET  /balance/:chain?wallet=name');
  console.log('  POST /quote   { fromChain, fromToken, toChain, toToken, amount, wallet }');
  console.log('  POST /swap    { fromChain, fromToken, toChain, toToken, amount, wallet, password }');
  console.log('  GET  /wallets');
  console.log('  POST /wallets { name, type, privateKey, password }');
});

export { app };
