import { Command } from 'commander';
import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import { findChain } from '../core/swapper.js';
import { getWallet } from '../core/wallet.js';
import { loadConfig } from '../core/config.js';
import { formatAmount } from '../utils/amount.js';
import * as display from '../utils/display.js';

export function registerBalanceCommand(program: Command): void {
  program
    .command('balance <chain>')
    .description('Check wallet balance on a chain')
    .option('--wallet <name>', 'Wallet name (uses default if omitted)')
    .option('--json', 'Output as JSON')
    .action(async (chainArg: string, opts) => {
      const config = loadConfig();
      const walletName = opts.wallet ?? config.defaultWallet;

      if (!walletName) {
        display.exitWithError('No wallet specified. Use --wallet <name> or set a default wallet.', opts.json);
      }

      const walletInfo = getWallet(walletName);
      if (!walletInfo) {
        display.exitWithError(`Wallet "${walletName}" not found. Run \`cli-swap wallet list\` to see available wallets.`, opts.json);
      }

      const chain = await findChain(chainArg);
      if (!chain) {
        display.exitWithError(`Chain "${chainArg}" not found. Run \`cli-swap chains\` to see available chains.`, opts.json);
      }

      const spin = display.spinner(`Fetching balance on ${chain.name}...`);

      try {
        let balance: string;
        let symbol: string;

        if (chain.chainType === 'SVM') {
          // Solana
          const rpcUrl = config.rpcOverrides[String(chain.id)] ?? 'https://api.mainnet-beta.solana.com';
          const connection = new Connection(rpcUrl);
          const pubkey = new PublicKey(walletInfo.address);
          const lamports = await connection.getBalance(pubkey);
          balance = formatAmount(lamports.toString(), 9); // SOL has 9 decimals
          symbol = 'SOL';
        } else {
          // EVM
          const rpcUrl = config.rpcOverrides[String(chain.id)]
            ?? chain.metamask?.rpcUrls?.[0]
            ?? `https://rpc.ankr.com/${chain.key}`;
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const wei = await provider.getBalance(walletInfo.address);
          balance = formatAmount(wei.toString(), 18);
          symbol = chain.nativeToken?.symbol ?? 'ETH';
        }

        spin.stop();

        if (opts.json) {
          display.jsonOutput({
            wallet: walletName,
            chain: chain.name,
            chainId: chain.id,
            address: walletInfo.address,
            balance,
            symbol,
          });
        } else {
          display.heading(`Balance on ${chain.name}`);
          display.keyValue('Wallet', walletName);
          display.keyValue('Address', walletInfo.address);
          display.keyValue('Balance', `${balance} ${symbol}`);
        }
      } catch (err) {
        spin.fail('Failed to fetch balance');
        const msg = err instanceof Error ? err.message : String(err);
        display.exitWithError(msg, opts.json);
      }
    });
}
