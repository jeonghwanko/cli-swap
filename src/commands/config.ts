import { Command } from 'commander';
import { loadConfig, saveConfig } from '../core/config.js';
import * as display from '../utils/display.js';

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage cli-swap configuration');

  config
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const cfg = loadConfig();
      if (opts.json) {
        display.jsonOutput(cfg);
      } else {
        display.heading('Configuration');
        display.keyValue('Default wallet', cfg.defaultWallet ?? '(none)');
        display.keyValue('Default slippage', `${cfg.defaultSlippage}%`);

        const rpcEntries = Object.entries(cfg.rpcOverrides);
        if (rpcEntries.length > 0) {
          console.log();
          display.heading('RPC Overrides');
          for (const [chainId, url] of rpcEntries) {
            display.keyValue(`  Chain ${chainId}`, url);
          }
        } else {
          display.keyValue('RPC overrides', '(none)');
        }
      }
    });

  config
    .command('set-rpc <chainId> <rpcUrl>')
    .description('Set a custom RPC URL for a chain (by chain ID)')
    .action((chainId: string, rpcUrl: string) => {
      const cfg = loadConfig();
      cfg.rpcOverrides[chainId] = rpcUrl;
      saveConfig(cfg);
      display.success(`RPC for chain ${chainId} set to ${rpcUrl}`);
    });

  config
    .command('remove-rpc <chainId>')
    .description('Remove a custom RPC URL for a chain')
    .action((chainId: string) => {
      const cfg = loadConfig();
      if (!(chainId in cfg.rpcOverrides)) {
        display.error(`No RPC override for chain ${chainId}.`);
        process.exit(1);
      }
      delete cfg.rpcOverrides[chainId];
      saveConfig(cfg);
      display.success(`RPC override for chain ${chainId} removed.`);
    });

  config
    .command('set-slippage <pct>')
    .description('Set default slippage tolerance in %')
    .action((pct: string) => {
      const value = parseFloat(pct);
      if (isNaN(value) || value < 0 || value > 50) {
        display.error('Slippage must be a number between 0 and 50.');
        process.exit(1);
      }
      const cfg = loadConfig();
      cfg.defaultSlippage = value;
      saveConfig(cfg);
      display.success(`Default slippage set to ${value}%`);
    });
}
