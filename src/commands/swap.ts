import { Command } from 'commander';
import {
  findChain,
  findToken,
  getSwapQuote,
  executeSwapRoute,
  initSdkWithEvmWallet,
  initSdkWithSolanaWallet,
} from '../core/swapper.js';
import { getWallet } from '../core/wallet.js';
import { loadConfig } from '../core/config.js';
import { decrypt } from '../utils/crypto.js';
import { parseAmount, formatAmount } from '../utils/amount.js';
import * as display from '../utils/display.js';
import { askPassword, askConfirm } from '../utils/prompt.js';

export function registerSwapCommand(program: Command): void {
  program
    .command('swap <fromChain> <fromToken> <toChain> <toToken> <amount>')
    .description('Execute a token swap')
    .option('--slippage <pct>', 'Slippage tolerance in %')
    .option('--wallet <name>', 'Wallet to use')
    .option('--password <pw>', 'Wallet password (or use SWAP_WALLET_PASSWORD env)')
    .option('--yes', 'Skip confirmation (for AI agents)')
    .option('--json', 'Output as JSON')
    .action(
      async (
        fromChainArg: string,
        fromTokenArg: string,
        toChainArg: string,
        toTokenArg: string,
        amountArg: string,
        opts,
      ) => {
        const config = loadConfig();
        const walletName = opts.wallet ?? config.defaultWallet;

        if (!walletName) {
          display.error('No wallet specified. Import a wallet first.');
          process.exit(1);
        }

        const walletInfo = getWallet(walletName);
        if (!walletInfo) {
          display.error(`Wallet "${walletName}" not found.`);
          process.exit(1);
        }

        // Get password
        const password =
          opts.password ??
          process.env['SWAP_WALLET_PASSWORD'] ??
          (await askPassword('Enter wallet password:'));

        // Unlock and init SDK with wallet
        const spin = display.spinner('Unlocking wallet...');
        try {
          const privateKey = decrypt(
            walletInfo.encryptedKey,
            password,
            walletInfo.iv,
            walletInfo.salt,
            walletInfo.authTag,
          );

          if (walletInfo.type === 'solana') {
            initSdkWithSolanaWallet(privateKey);
          } else {
            initSdkWithEvmWallet(privateKey);
          }
          spin.succeed('Wallet unlocked');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Unsupported state') || msg.includes('bad decrypt') || msg.includes('auth')) {
            spin.fail('Failed to unlock wallet. Wrong password?');
          } else {
            spin.fail(`Failed to unlock wallet: ${msg}`);
          }
          process.exit(1);
        }

        // Resolve chains and tokens
        const spin2 = display.spinner('Fetching quote...');
        try {
          const fromChain = await findChain(fromChainArg);
          const toChain = await findChain(toChainArg);
          if (!fromChain) { spin2.fail(`Chain "${fromChainArg}" not found.`); process.exit(1); }
          if (!toChain) { spin2.fail(`Chain "${toChainArg}" not found.`); process.exit(1); }

          const fromToken = await findToken(fromChain.id, fromTokenArg);
          const toToken = await findToken(toChain.id, toTokenArg);
          if (!fromToken) { spin2.fail(`Token "${fromTokenArg}" not found on ${fromChain.name}.`); process.exit(1); }
          if (!toToken) { spin2.fail(`Token "${toTokenArg}" not found on ${toChain.name}.`); process.exit(1); }

          const amount = parseAmount(amountArg, fromToken.decimals);

          const slippage = opts.slippage
            ? parseFloat(opts.slippage) / 100
            : config.defaultSlippage / 100;

          const { quote, route } = await getSwapQuote({
            fromChainId: fromChain.id,
            toChainId: toChain.id,
            fromTokenAddress: fromToken.address,
            toTokenAddress: toToken.address,
            fromAmount: amount,
            fromAddress: walletInfo.address,
            slippage,
          });

          spin2.stop();

          const fromAmountHuman = formatAmount(quote.fromAmount, fromToken.decimals);
          const toAmountHuman = formatAmount(quote.toAmount, toToken.decimals);
          const toAmountMinHuman = formatAmount(quote.toAmountMin, toToken.decimals);

          // Show quote and confirm
          if (!opts.json) {
            display.heading('Swap Preview');
            display.keyValue('From', `${fromAmountHuman} ${fromToken.symbol} (${fromChain.name})`);
            display.keyValue('To', `~${toAmountHuman} ${toToken.symbol} (${toChain.name})`);
            display.keyValue('Min received', `${toAmountMinHuman} ${toToken.symbol}`);
            display.keyValue('Estimated time', `${quote.executionDuration}s`);
            display.keyValue('Route', quote.toolsUsed.join(' → '));
            console.log();
          }

          if (!opts.yes) {
            const confirmed = await askConfirm('Execute this swap?');
            if (!confirmed) {
              display.info('Swap cancelled.');
              process.exit(0);
            }
          }

          // Execute
          const spin3 = display.spinner('Executing swap...');
          const result = await executeSwapRoute(route, (status) => {
            spin3.text = `Swap status: ${status}`;
          });

          if (result.status === 'success') {
            spin3.succeed('Swap completed!');

            if (opts.json) {
              display.jsonOutput({
                status: 'success',
                txHash: result.txHash,
                from: { chain: fromChain.name, token: fromToken.symbol, amount: fromAmountHuman },
                to: { chain: toChain.name, token: toToken.symbol, amount: toAmountHuman },
                explorerUrl: result.explorerUrl,
              });
            } else {
              display.heading('Swap Result');
              display.keyValue('Status', 'Success');
              if (result.txHash) display.keyValue('Tx Hash', result.txHash);
              if (result.explorerUrl) display.keyValue('Explorer', result.explorerUrl);
            }
          } else {
            spin3.fail('Swap failed');
            if (opts.json) {
              display.jsonOutput({ status: 'failed', error: result.error });
            } else {
              display.error(result.error ?? 'Unknown error');
            }
            process.exit(1);
          }
        } catch (err) {
          spin2.fail('Swap failed');
          const msg = err instanceof Error ? err.message : String(err);
          display.exitWithError(msg, opts.json);
        }
      },
    );
}
