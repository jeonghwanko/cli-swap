/**
 * Claude Agent SDK + cli-swap MCP Integration Example
 *
 * This example shows how to build an AI agent that can execute
 * token swaps using Claude Agent SDK with cli-swap as an MCP tool.
 *
 * Prerequisites:
 *   npm install @anthropic-ai/claude-agent-sdk
 *   cli-swap wallet import --name main --type evm
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-... npx tsx examples/claude-agent-sdk.ts
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Define cli-swap tools for Claude
const tools: Anthropic.Tool[] = [
  {
    name: 'list_chains',
    description: 'List all supported blockchain chains for token swaps',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Filter: EVM or SVM', enum: ['EVM', 'SVM'] },
      },
    },
  },
  {
    name: 'search_tokens',
    description: 'Search for tokens on a specific blockchain chain',
    input_schema: {
      type: 'object' as const,
      properties: {
        chain: { type: 'string', description: 'Chain name (e.g., "ethereum", "polygon")' },
        query: { type: 'string', description: 'Token symbol or name to search' },
      },
      required: ['chain'],
    },
  },
  {
    name: 'get_quote',
    description: 'Get a swap quote showing expected output amount and route',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromChain: { type: 'string' },
        fromToken: { type: 'string' },
        toChain: { type: 'string' },
        toToken: { type: 'string' },
        amount: { type: 'string', description: 'Human-readable amount (e.g., "1.5")' },
        wallet: { type: 'string', description: 'Wallet name' },
      },
      required: ['fromChain', 'fromToken', 'toChain', 'toToken', 'amount', 'wallet'],
    },
  },
  {
    name: 'execute_swap',
    description: 'Execute a token swap. Requires wallet password.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromChain: { type: 'string' },
        fromToken: { type: 'string' },
        toChain: { type: 'string' },
        toToken: { type: 'string' },
        amount: { type: 'string' },
        wallet: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['fromChain', 'fromToken', 'toChain', 'toToken', 'amount', 'wallet', 'password'],
    },
  },
];

// Execute a cli-swap tool via CLI (alternatively, use the HTTP API)
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const { execSync } = await import('node:child_process');

  switch (name) {
    case 'list_chains': {
      const typeArg = input.type ? `--type ${input.type}` : '';
      return execSync(`npx cli-swap chains ${typeArg} --json`, { encoding: 'utf-8' });
    }
    case 'search_tokens': {
      const query = input.query ? `"${input.query}"` : '';
      return execSync(`npx cli-swap tokens "${input.chain}" ${query} --json`, { encoding: 'utf-8' });
    }
    case 'get_quote': {
      return execSync(
        `npx cli-swap quote "${input.fromChain}" "${input.fromToken}" "${input.toChain}" "${input.toToken}" "${input.amount}" --wallet "${input.wallet}" --json`,
        { encoding: 'utf-8' },
      );
    }
    case 'execute_swap': {
      return execSync(
        `npx cli-swap swap "${input.fromChain}" "${input.fromToken}" "${input.toChain}" "${input.toToken}" "${input.amount}" --wallet "${input.wallet}" --password "${input.password}" --yes --json`,
        { encoding: 'utf-8' },
      );
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// Agent loop
async function runAgent(userMessage: string) {
  console.log(`\n🤖 User: ${userMessage}\n`);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  // Agentic loop — keep going until Claude stops calling tools
  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are a DeFi trading assistant. Use the provided tools to help users swap tokens across blockchains. Always get a quote first before executing a swap. Be concise.',
      tools,
      messages,
    });

    // Collect text and tool_use blocks
    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolBlocks = response.content.filter(b => b.type === 'tool_use');

    if (textBlocks.length > 0) {
      console.log(`🤖 Claude: ${textBlocks.map(b => b.text).join('\n')}`);
    }

    // If no tool calls, we're done
    if (response.stop_reason === 'end_turn' || toolBlocks.length === 0) {
      break;
    }

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolBlocks) {
      if (block.type !== 'tool_use') continue;
      console.log(`  🔧 Calling ${block.name}(${JSON.stringify(block.input)})`);
      try {
        const result = await executeTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } catch (err) {
        toolResults.push({
          type: 'tool_result', tool_use_id: block.id,
          content: JSON.stringify({ error: (err as Error).message }), is_error: true,
        });
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }
}

// Run
runAgent('이더리움에서 ETH 0.1개를 USDC로 스왑하고 싶어. 먼저 견적 보여줘.');
