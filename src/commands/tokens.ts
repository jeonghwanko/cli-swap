import { Command } from 'commander';
import { findChain, getChainTokens } from '../core/swapper.js';
import * as display from '../utils/display.js';

export function registerTokensCommand(program: Command): void {
  program
    .command('tokens <chain> [query]')
    .description('Search tokens on a chain')
    .option('--json', 'Output as JSON')
    .option('--limit <n>', 'Max results', '20')
    .action(async (chainArg: string, query: string | undefined, opts) => {
      const spin = display.spinner(`Searching tokens on ${chainArg}...`);
      try {
        const chain = await findChain(chainArg);
        if (!chain) {
          spin.fail(`Chain "${chainArg}" not found. Run \`cli-swap chains\` to see available chains.`);
          process.exit(1);
        }

        let tokens = await getChainTokens(chain.id);
        const limit = parseInt(opts.limit, 10) || 20;

        if (query) {
          const lower = query.toLowerCase();
          tokens = tokens.filter(
            (t) =>
              t.symbol.toLowerCase().includes(lower) ||
              t.name.toLowerCase().includes(lower) ||
              t.address.toLowerCase() === lower,
          );
        }

        tokens = tokens.slice(0, limit);
        spin.stop();

        if (opts.json) {
          display.jsonOutput(
            tokens.map((t) => ({
              symbol: t.symbol,
              name: t.name,
              address: t.address,
              decimals: t.decimals,
            })),
          );
        } else {
          display.heading(`Tokens on ${chain.name} (${tokens.length} results)`);
          for (const t of tokens) {
            console.log(
              `  ${t.symbol.padEnd(10)} ${t.name.padEnd(30)} ${t.address}`,
            );
          }
          if (tokens.length === 0) {
            display.info('No tokens found matching your query.');
          }
        }
      } catch (err) {
        spin.fail('Failed to fetch tokens');
        const msg = err instanceof Error ? err.message : String(err);
        display.exitWithError(msg, opts.json);
      }
    });
}
