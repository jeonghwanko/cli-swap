import {
  createConfig,
  getChains,
  getTokens,
  getToken,
  getQuote,
  getRoutes,
  executeRoute,
  EVM,
  Solana,
  KeypairWalletAdapter,
  type Route,
  type ExtendedChain,
  type Token,
} from '@lifi/sdk';
import { createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, arbitrum, optimism, polygon, base, bsc, avalanche, gnosis, fantom, linea, scroll, zksync, blast, mantle, mode, celo } from 'viem/chains';
import type { QuoteResult, SwapResult } from '../types.js';

let initialized = false;

// Common EVM chains for switchChain support
const COMMON_CHAINS: Chain[] = [
  mainnet, arbitrum, optimism, polygon, base, bsc, avalanche, gnosis, fantom, linea, scroll, zksync, blast, mantle, mode, celo,
];

/** Initialize Li.Fi SDK without wallet (for queries only) */
export function initSdk(): void {
  if (initialized) return;
  createConfig({ integrator: 'cli-swap' });
  initialized = true;
}

/** Initialize Li.Fi SDK with EVM wallet for transaction signing */
export function initSdkWithEvmWallet(privateKey: string): void {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const allChains = COMMON_CHAINS;

  createConfig({
    integrator: 'cli-swap',
    providers: [
      EVM({
        getWalletClient: async () =>
          createWalletClient({
            account,
            chain: mainnet,
            transport: http(),
          }),
        switchChain: async (chainId) => {
          const chain = allChains.find((c) => c.id === chainId);
          return createWalletClient({
            account,
            chain: chain ?? mainnet,
            transport: http(),
          });
        },
      }),
    ],
  });
  initialized = true;
}

/** Initialize Li.Fi SDK with Solana wallet */
export function initSdkWithSolanaWallet(privateKeyBase58: string): void {
  const adapter = new KeypairWalletAdapter(privateKeyBase58);

  createConfig({
    integrator: 'cli-swap',
    providers: [
      Solana({
        getWalletAdapter: async () => adapter,
      }),
    ],
  });
  initialized = true;
}

/** Initialize with both EVM + Solana wallets (for cross-ecosystem swaps) */
export function initSdkWithBothWallets(
  evmPrivateKey: string,
  solanaPrivateKeyBase58: string,
): void {
  const account = privateKeyToAccount(evmPrivateKey as `0x${string}`);
  const allChains = COMMON_CHAINS;
  const solanaAdapter = new KeypairWalletAdapter(solanaPrivateKeyBase58);

  createConfig({
    integrator: 'cli-swap',
    providers: [
      EVM({
        getWalletClient: async () =>
          createWalletClient({
            account,
            chain: mainnet,
            transport: http(),
          }),
        switchChain: async (chainId) => {
          const chain = allChains.find((c) => c.id === chainId);
          return createWalletClient({
            account,
            chain: chain ?? mainnet,
            transport: http(),
          });
        },
      }),
      Solana({
        getWalletAdapter: async () => solanaAdapter,
      }),
    ],
  });
  initialized = true;
}

/** Get all supported chains */
export async function getSupportedChains(): Promise<ExtendedChain[]> {
  initSdk();
  return getChains();
}

/** Find chain by name or ID */
export async function findChain(
  nameOrId: string,
): Promise<ExtendedChain | undefined> {
  const chains = await getSupportedChains();
  const lower = nameOrId.toLowerCase();
  const asNumber = Number(nameOrId);

  return chains.find(
    (c) =>
      c.id === asNumber ||
      c.key?.toLowerCase() === lower ||
      c.name.toLowerCase() === lower,
  );
}

/** Get tokens for a chain */
export async function getChainTokens(
  chainId: number,
): Promise<Token[]> {
  initSdk();
  const result = await getTokens({ chains: [chainId] });
  return result.tokens[chainId] ?? [];
}

/** Find a token by symbol or address on a chain */
export async function findToken(
  chainId: number,
  symbolOrAddress: string,
): Promise<Token | undefined> {
  initSdk();

  if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) {
    try {
      return await getToken(chainId, symbolOrAddress);
    } catch {
      return undefined;
    }
  }

  const tokens = await getChainTokens(chainId);
  const lower = symbolOrAddress.toLowerCase();
  return tokens.find(
    (t) => t.symbol.toLowerCase() === lower,
  );
}

/** Get a quote for a swap - uses getRoutes to get a full Route object */
export async function getSwapQuote(params: {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  slippage?: number;
}): Promise<{ quote: QuoteResult; route: Route }> {
  initSdk();

  const result = await getRoutes({
    fromChainId: params.fromChainId,
    toChainId: params.toChainId,
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress: params.toTokenAddress,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    options: {
      slippage: params.slippage ?? 0.005,
    },
  });

  if (!result.routes.length) {
    throw new Error('No routes found for this swap. Try different tokens or amounts.');
  }

  const route = result.routes[0];

  const quote: QuoteResult = {
    fromChain: route.fromChainId.toString(),
    fromToken: route.steps[0]?.action.fromToken.symbol ?? '',
    fromAmount: route.fromAmount,
    toChain: route.toChainId.toString(),
    toToken: route.steps[route.steps.length - 1]?.action.toToken.symbol ?? '',
    toAmount: route.toAmount,
    toAmountMin: route.toAmountMin,
    estimatedGas: route.gasCostUSD ?? '0',
    executionDuration: route.steps.reduce((sum, s) => sum + (s.estimate.executionDuration ?? 0), 0),
    toolsUsed: route.steps.map(s => s.tool),
    route,
  };

  return { quote, route };
}

/** Execute a swap route */
export async function executeSwapRoute(
  route: Route,
  onUpdate?: (status: string) => void,
): Promise<SwapResult> {
  try {
    const executedRoute = await executeRoute(route, {
      updateRouteHook: (updatedRoute) => {
        const step = updatedRoute.steps[updatedRoute.steps.length - 1];
        if (step?.execution) {
          const status = step.execution.status;
          onUpdate?.(status);
        }
      },
    });

    const lastStep = executedRoute.steps[executedRoute.steps.length - 1];
    const execution = lastStep?.execution;
    const lastProcess = execution?.process?.[execution.process.length - 1];

    return {
      status: 'success',
      txHash: lastProcess?.txHash,
      fromAmount: executedRoute.fromAmountUSD ?? executedRoute.fromAmount ?? '',
      toAmount: executedRoute.toAmountUSD ?? executedRoute.toAmount ?? '',
      explorerUrl: lastProcess?.txLink,
    };
  } catch (err) {
    return {
      status: 'failed',
      fromAmount: '',
      toAmount: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
