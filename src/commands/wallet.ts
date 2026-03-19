import { Command } from 'commander';
import {
  listWallets,
  importEvmWallet,
  importSolanaWallet,
  removeWallet,
  getWallet,
} from '../core/wallet.js';
import { loadConfig, saveConfig } from '../core/config.js';
import * as display from '../utils/display.js';
import { askPassword, askInput, askSelect, askConfirm } from '../utils/prompt.js';

export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage wallets (import, list, remove)');

  wallet
    .command('import')
    .description('Import a wallet from private key')
    .option('--name <name>', 'Wallet name')
    .option('--type <type>', 'Wallet type: evm or solana', 'evm')
    .option('--key <key>', 'Private key (or prompted securely)')
    .option('--password <password>', 'Encryption password (or prompted securely)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const name = opts.name ?? await askInput('Wallet name:');
        const type = opts.type ?? await askSelect('Wallet type:', ['evm', 'solana']);

        // Check if wallet already exists
        if (getWallet(name)) {
          display.error(`Wallet "${name}" already exists. Remove it first or use a different name.`);
          process.exit(1);
        }

        const key = opts.key ?? await askPassword('Enter private key:');
        const password = opts.password ?? await askPassword('Set encryption password:');

        if (password.length < 8) {
          display.error('Password must be at least 8 characters.');
          process.exit(1);
        }

        const info = type === 'solana'
          ? importSolanaWallet(name, key, password)
          : importEvmWallet(name, key, password);

        // Set as default if first wallet
        const config = loadConfig();
        if (!config.defaultWallet) {
          config.defaultWallet = name;
          saveConfig(config);
        }

        if (opts.json) {
          display.jsonOutput({ name: info.name, type: info.type, address: info.address });
        } else {
          display.success(`Wallet "${info.name}" imported successfully!`);
          display.keyValue('Type', info.type.toUpperCase());
          display.keyValue('Address', info.address);
        }
      } catch (err) {
        display.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  wallet
    .command('list')
    .description('List all saved wallets')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const wallets = listWallets();
      const config = loadConfig();

      if (wallets.length === 0) {
        if (opts.json) {
          display.jsonOutput([]);
        } else {
          display.info('No wallets found. Use `cli-swap wallet import` to add one.');
        }
        return;
      }

      if (opts.json) {
        display.jsonOutput(
          wallets.map((w) => ({
            name: w.name,
            type: w.type,
            address: w.address,
            default: w.name === config.defaultWallet,
            createdAt: w.createdAt,
          })),
        );
      } else {
        display.heading('Saved Wallets');
        for (const w of wallets) {
          const tag = w.name === config.defaultWallet ? ' (default)' : '';
          console.log(`  ${w.name}${tag}`);
          display.keyValue('  Type', w.type.toUpperCase());
          display.keyValue('  Address', w.address);
          console.log();
        }
      }
    });

  wallet
    .command('remove <name>')
    .description('Remove a saved wallet')
    .option('--yes', 'Skip confirmation')
    .action(async (name: string, opts) => {
      if (!getWallet(name)) {
        display.error(`Wallet "${name}" not found.`);
        process.exit(1);
      }

      if (!opts.yes) {
        const confirmed = await askConfirm(`Remove wallet "${name}"? This cannot be undone.`);
        if (!confirmed) {
          display.info('Cancelled.');
          return;
        }
      }

      removeWallet(name);

      // Clear default if removed
      const config = loadConfig();
      if (config.defaultWallet === name) {
        config.defaultWallet = undefined;
        saveConfig(config);
      }

      display.success(`Wallet "${name}" removed.`);
    });

  wallet
    .command('default <name>')
    .description('Set default wallet')
    .action((name: string) => {
      if (!getWallet(name)) {
        display.error(`Wallet "${name}" not found.`);
        process.exit(1);
      }
      const config = loadConfig();
      config.defaultWallet = name;
      saveConfig(config);
      display.success(`Default wallet set to "${name}".`);
    });
}
