import { Command } from 'commander';
import { getSupportedChains } from '../core/swapper.js';
import * as display from '../utils/display.js';

export function registerChainsCommand(program: Command): void {
  program
    .command('chains')
    .description('List all supported chains')
    .option('--json', 'Output as JSON')
    .option('--type <type>', 'Filter by chain type: EVM, SVM, UTXO')
    .action(async (opts) => {
      const spin = display.spinner('Fetching supported chains...');
      try {
        let chains = await getSupportedChains();

        if (opts.type) {
          const filterType = opts.type.toUpperCase();
          chains = chains.filter((c) => c.chainType?.toUpperCase() === filterType);
        }

        spin.stop();

        if (opts.json) {
          display.jsonOutput(
            chains.map((c) => ({
              id: c.id,
              key: c.key,
              name: c.name,
              type: c.chainType,
              nativeToken: c.nativeToken?.symbol,
            })),
          );
        } else {
          display.heading(`Supported Chains (${chains.length})`);
          for (const c of chains) {
            console.log(
              `  ${String(c.id).padEnd(8)} ${(c.key ?? '').padEnd(16)} ${c.name.padEnd(24)} ${c.chainType ?? ''}`,
            );
          }
        }
      } catch (err) {
        spin.fail('Failed to fetch chains');
        const msg = err instanceof Error ? err.message : String(err);
        display.exitWithError(msg, opts.json);
      }
    });
}
