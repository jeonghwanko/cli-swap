import { Command } from 'commander';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { findChain, findToken, initSdk } from '../core/swapper.js';
import { executeTransfer } from '../core/sender.js';
import { getWallet } from '../core/wallet.js';
import { loadConfig } from '../core/config.js';
import { decrypt, DecryptionError } from '../utils/crypto.js';
import { parseAmount, formatAmount } from '../utils/amount.js';
import * as display from '../utils/display.js';
import { askPassword, askConfirm } from '../utils/prompt.js';

export function registerSendCommand(program: Command): void {
  program
    .command('send <chain> <token> <toAddress> <amount>')
    .description('Send tokens to an address (native + ERC-20 / SPL)')
    .option('--wallet <name>', 'Wallet to use')
    .option('--password <pw>', 'Wallet password (or use SWAP_WALLET_PASSWORD env)')
    .option('--yes', 'Skip confirmation (for AI agents)')
    .option('--json', 'Output as JSON')
    .action(async (chainArg: string, tokenArg: string, toAddress: string, amountArg: string, opts) => {
      const config = loadConfig();
      const walletName = opts.wallet ?? config.defaultWallet;

      if (!walletName) {
        display.exitWithError('No wallet specified. Import a wallet first with `cli-swap wallet import`.', opts.json);
      }

      const walletInfo = getWallet(walletName);
      if (!walletInfo) {
        display.exitWithError(`Wallet "${walletName}" not found. Run \`cli-swap wallet list\` to see available wallets.`, opts.json);
      }

      // Validate address format
      if (walletInfo.type === 'evm') {
        if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
          display.exitWithError(`Invalid EVM address: "${toAddress}". Must be 0x followed by 40 hex characters.`, opts.json);
        }
      }

      // Get password
      const password =
        opts.password ??
        process.env['SWAP_WALLET_PASSWORD'] ??
        (await askPassword('Enter wallet password:'));

      // Unlock wallet
      const spin = display.spinner('Unlocking wallet...');
      let privateKey: string;
      let keypair: Keypair | undefined;
      try {
        privateKey = decrypt(
          walletInfo.encryptedKey,
          password,
          walletInfo.iv,
          walletInfo.salt,
          walletInfo.authTag,
        );

        if (walletInfo.type === 'solana') {
          keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
        }

        spin.succeed('Wallet unlocked');
      } catch (err) {
        if (err instanceof DecryptionError) {
          spin.fail('Failed to unlock wallet. Wrong password?');
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          spin.fail(`Failed to unlock wallet: ${msg}`);
        }
        display.exitWithError(
          err instanceof DecryptionError ? 'Wrong password.' : (err instanceof Error ? err.message : String(err)),
          opts.json,
        );
      }

      // Resolve chain and token
      initSdk(); // Initialize SDK for chain/token queries (no wallet needed)
      const spin2 = display.spinner('Resolving chain and token...');
      try {
        const chain = await findChain(chainArg);
        if (!chain) {
          spin2.stop();
          display.exitWithError(`Chain "${chainArg}" not found. Run \`cli-swap chains\` to see available chains.`, opts.json);
        }

        const token = await findToken(chain.id, tokenArg);
        if (!token) {
          spin2.stop();
          display.exitWithError(`Token "${tokenArg}" not found on ${chain.name}. Run \`cli-swap tokens ${chain.key}\` to search.`, opts.json);
        }

        const amount = parseAmount(amountArg, token.decimals);
        const amountHuman = formatAmount(amount, token.decimals);

        spin2.stop();

        // Show preview and confirm
        if (!opts.json) {
          display.heading('Transfer Preview');
          display.keyValue('From', `${walletInfo.address} (${walletName})`);
          display.keyValue('To', toAddress);
          display.keyValue('Amount', `${amountHuman} ${token.symbol}`);
          display.keyValue('Chain', chain.name);
          console.log();
        }

        if (!opts.yes) {
          const confirmed = await askConfirm('Execute this transfer?');
          if (!confirmed) {
            display.info('Transfer cancelled.');
            process.exit(0);
          }
        }

        // Execute transfer
        const spin3 = display.spinner('Sending tokens...');
        const result = await executeTransfer({
          chain,
          token,
          toAddress,
          amount,
          privateKey,
          keypair,
        });

        if (result.status === 'success') {
          spin3.succeed('Transfer completed!');

          if (opts.json) {
            display.jsonOutput({
              status: 'success',
              txHash: result.txHash,
              from: walletInfo.address,
              to: toAddress,
              amount: amountHuman,
              token: token.symbol,
              chain: chain.name,
              explorerUrl: result.explorerUrl,
            });
          } else {
            display.heading('Transfer Result');
            display.keyValue('Status', 'Success');
            display.keyValue('Amount', `${amountHuman} ${token.symbol}`);
            display.keyValue('To', toAddress);
            if (result.txHash) display.keyValue('Tx Hash', result.txHash);
            if (result.explorerUrl) display.keyValue('Explorer', result.explorerUrl);
          }
        } else {
          spin3.fail('Transfer failed');
          if (opts.json) {
            display.jsonOutput({ status: 'failed', error: result.error });
          } else {
            display.error(result.error ?? 'Unknown error');
          }
          process.exit(1);
        }
      } catch (err) {
        spin2.fail('Transfer failed');
        const msg = err instanceof Error ? err.message : String(err);
        display.exitWithError(msg, opts.json);
      }
    });
}
