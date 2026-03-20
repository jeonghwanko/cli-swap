/**
 * LangChain + cli-swap HTTP API Integration Example
 *
 * Uses cli-swap's HTTP API as a custom LangChain tool,
 * allowing any LLM to execute token swaps.
 *
 * Prerequisites:
 *   npm install langchain @langchain/openai
 *   npx cli-swap-api --port 3100  (start HTTP API in another terminal)
 *   cli-swap wallet import --name main --type evm
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/langchain.ts
 */

import { ChatOpenAI } from '@langchain/openai';
import { DynamicStructuredTool } from 'langchain/tools';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { z } from 'zod';

const API_BASE = process.env['CLI_SWAP_API'] ?? 'http://localhost:3100';

// Helper: call cli-swap HTTP API
async function apiCall(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Define LangChain tools that wrap cli-swap HTTP API
const swapTools = [
  new DynamicStructuredTool({
    name: 'list_chains',
    description: 'List all supported blockchain chains for token swaps',
    schema: z.object({
      type: z.string().optional().describe('Filter by chain type: EVM or SVM'),
    }),
    func: async ({ type }) => {
      const query = type ? `?type=${type}` : '';
      const result = await apiCall('GET', `/chains${query}`);
      return JSON.stringify(result);
    },
  }),

  new DynamicStructuredTool({
    name: 'search_tokens',
    description: 'Search for tokens on a specific blockchain by symbol or name',
    schema: z.object({
      chain: z.string().describe('Chain name (e.g., "ethereum")'),
      query: z.string().optional().describe('Search query (token symbol or name)'),
    }),
    func: async ({ chain, query }) => {
      const q = query ? `?query=${encodeURIComponent(query)}` : '';
      const result = await apiCall('GET', `/tokens/${chain}${q}`);
      return JSON.stringify(result);
    },
  }),

  new DynamicStructuredTool({
    name: 'get_balance',
    description: 'Check the native token balance of a wallet on a chain',
    schema: z.object({
      chain: z.string().describe('Chain name'),
      wallet: z.string().describe('Wallet name'),
    }),
    func: async ({ chain, wallet }) => {
      const result = await apiCall('GET', `/balance/${chain}?wallet=${wallet}`);
      return JSON.stringify(result);
    },
  }),

  new DynamicStructuredTool({
    name: 'get_swap_quote',
    description: 'Get a swap quote with expected output amount and route',
    schema: z.object({
      fromChain: z.string(),
      fromToken: z.string(),
      toChain: z.string(),
      toToken: z.string(),
      amount: z.string().describe('Human-readable amount'),
      wallet: z.string(),
    }),
    func: async (input) => {
      const result = await apiCall('POST', '/quote', input);
      return JSON.stringify(result);
    },
  }),

  new DynamicStructuredTool({
    name: 'execute_swap',
    description: 'Execute a token swap. Requires wallet password.',
    schema: z.object({
      fromChain: z.string(),
      fromToken: z.string(),
      toChain: z.string(),
      toToken: z.string(),
      amount: z.string(),
      wallet: z.string(),
      password: z.string().describe('Wallet encryption password'),
    }),
    func: async (input) => {
      const result = await apiCall('POST', '/swap', input);
      return JSON.stringify(result);
    },
  }),
];

async function main() {
  const model = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a DeFi trading assistant. Help users swap tokens across blockchains. Always get a quote before executing. Be concise.'],
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  const agent = await createOpenAIFunctionsAgent({ llm: model, tools: swapTools, prompt });
  const executor = new AgentExecutor({ agent, tools: swapTools, verbose: true });

  const result = await executor.invoke({
    input: 'Get me a quote for swapping 0.1 ETH to USDC on Ethereum using wallet "main"',
  });

  console.log('\n📊 Result:', result.output);
}

main().catch(console.error);
