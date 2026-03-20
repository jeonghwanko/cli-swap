/**
 * Vercel AI SDK + cli-swap HTTP API Integration Example
 *
 * Uses Vercel AI SDK's tool calling with cli-swap as the DeFi backend.
 *
 * Prerequisites:
 *   npm install ai @ai-sdk/openai zod
 *   npx cli-swap-api --port 3100  (start HTTP API in another terminal)
 *   cli-swap wallet import --name main --type evm
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/vercel-ai-sdk.ts
 */

import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const API_BASE = process.env['CLI_SWAP_API'] ?? 'http://localhost:3100';

async function apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  const result = await generateText({
    model: openai('gpt-4o'),
    system: 'You are a DeFi trading assistant. Use tools to help users swap tokens. Always quote before executing.',
    prompt: 'Search for USDC token on Ethereum and get a swap quote for 0.5 ETH to USDC using wallet "main"',
    maxSteps: 5, // Allow multi-step tool use
    tools: {
      searchTokens: tool({
        description: 'Search for tokens on a blockchain chain',
        parameters: z.object({
          chain: z.string().describe('Chain name (e.g., "ethereum")'),
          query: z.string().optional().describe('Token symbol or name'),
        }),
        execute: async ({ chain, query }) => {
          const q = query ? `?query=${encodeURIComponent(query)}` : '';
          return apiCall('GET', `/tokens/${chain}${q}`);
        },
      }),

      getQuote: tool({
        description: 'Get a swap quote with expected output and route',
        parameters: z.object({
          fromChain: z.string(),
          fromToken: z.string(),
          toChain: z.string(),
          toToken: z.string(),
          amount: z.string().describe('Human-readable amount (e.g., "0.5")'),
          wallet: z.string().describe('Wallet name'),
        }),
        execute: async (input) => apiCall('POST', '/quote', input),
      }),

      executeSwap: tool({
        description: 'Execute a token swap (requires password)',
        parameters: z.object({
          fromChain: z.string(),
          fromToken: z.string(),
          toChain: z.string(),
          toToken: z.string(),
          amount: z.string(),
          wallet: z.string(),
          password: z.string(),
        }),
        execute: async (input) => apiCall('POST', '/swap', input),
      }),

      listChains: tool({
        description: 'List all supported chains',
        parameters: z.object({
          type: z.enum(['EVM', 'SVM']).optional(),
        }),
        execute: async ({ type }) => {
          const q = type ? `?type=${type}` : '';
          return apiCall('GET', `/chains${q}`);
        },
      }),

      getBalance: tool({
        description: 'Check native token balance on a chain',
        parameters: z.object({
          chain: z.string(),
          wallet: z.string(),
        }),
        execute: async ({ chain, wallet }) =>
          apiCall('GET', `/balance/${chain}?wallet=${wallet}`),
      }),
    },
  });

  console.log('\n📊 Result:', result.text);
  console.log('\n🔧 Tool calls:', result.steps.map(s => s.toolCalls.map(tc => tc.toolName)));
}

main().catch(console.error);
