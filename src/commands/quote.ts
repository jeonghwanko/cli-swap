import { Command } from 'commander';
import { findChain, findToken, getSwapQuote } from '../core/swapper.js';
import { getWallet } from '../core/wallet.js';
import { loadConfig } from '../core/config.js';
import { parseAmount, formatAmount } from '../utils/amount.js';
import * as display from '../utils/display.js';

export function registerQuoteCommand(program: Command): void {
  program
    .command('quote <fromChain> <fromToken> <toChain> <toToken> <amount>')
    .description('Get a swap quote without executing')
    .option('--slippage <pct>', 'Slippage tolerance in %')
    .option('--wallet <name>', 'Wallet to use for quote address')
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

        const spin = display.spinner('Fetching quote...');

        try {
          // Resolve chains
          const fromChain = await findChain(fromChainArg);
          const toChain = await findChain(toChainArg);
          if (!fromChain) { spin.fail(`Chain "${fromChainArg}" not found.`); process.exit(1); }
          if (!toChain) { spin.fail(`Chain "${toChainArg}" not found.`); process.exit(1); }

          // Resolve tokens
          const fromToken = await findToken(fromChain.id, fromTokenArg);
          const toToken = await findToken(toChain.id, toTokenArg);
          if (!fromToken) { spin.fail(`Token "${fromTokenArg}" not found on ${fromChain.name}.`); process.exit(1); }
          if (!toToken) { spin.fail(`Token "${toTokenArg}" not found on ${toChain.name}.`); process.exit(1); }

          // Calculate amount in smallest unit (string arithmetic, no precision loss)
          const amount = parseAmount(amountArg, fromToken.decimals);

          const slippage = opts.slippage
            ? parseFloat(opts.slippage) / 100
            : config.defaultSlippage / 100;

          const { quote } = await getSwapQuote({
            fromChainId: fromChain.id,
            toChainId: toChain.id,
            fromTokenAddress: fromToken.address,
            toTokenAddress: toToken.address,
            fromAmount: amount,
            fromAddress: walletInfo.address,
            slippage,
          });

          spin.stop();

          // Format amounts back to human-readable (string arithmetic, no precision loss)
          const fromAmountHuman = formatAmount(quote.fromAmount, fromToken.decimals);
          const toAmountHuman = formatAmount(quote.toAmount, toToken.decimals);
          const toAmountMinHuman = formatAmount(quote.toAmountMin, toToken.decimals);

          if (opts.json) {
            display.jsonOutput({
              from: { chain: fromChain.name, token: fromToken.symbol, amount: fromAmountHuman },
              to: { chain: toChain.name, token: toToken.symbol, amount: toAmountHuman, minAmount: toAmountMinHuman },
              estimatedDuration: `${quote.executionDuration}s`,
              tools: quote.toolsUsed,
              slippage: `${slippage * 100}%`,
            });
          } else {
            display.heading('Swap Quote');
            display.keyValue('From', `${fromAmountHuman} ${fromToken.symbol} (${fromChain.name})`);
            display.keyValue('To', `${toAmountHuman} ${toToken.symbol} (${toChain.name})`);
            display.keyValue('Min received', `${toAmountMinHuman} ${toToken.symbol}`);
            display.keyValue('Estimated time', `${quote.executionDuration}s`);
            display.keyValue('Route', quote.toolsUsed.join(' → '));
            display.keyValue('Slippage', `${slippage * 100}%`);
          }
        } catch (err) {
          spin.fail('Quote failed');
          const msg = err instanceof Error ? err.message : String(err);
          display.exitWithError(msg, opts.json);
        }
      },
    );
}
