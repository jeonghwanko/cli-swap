import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import {
  findChain,
  findToken,
  getSwapQuote,
  executeSwapRoute,
  initSdkWithEvmWallet,
  initSdkWithSolanaWallet,
} from '../core/swapper.js';
import { getWallet, unlockEvmWallet, unlockSolanaWallet } from '../core/wallet.js';
import { loadConfig } from '../core/config.js';
import { parseAmount, formatAmount } from '../utils/amount.js';
import { DecryptionError } from '../utils/crypto.js';
import * as display from '../utils/display.js';
import { askPassword } from '../utils/prompt.js';

interface BatchSwapEntry {
  fromChain: string;
  fromToken: string;
  toChain: string;
  toToken: string;
  amount: string;
  wallet?: string;
  slippage?: number;
}

interface BatchResult {
  index: number;
  status: 'success' | 'failed' | 'skipped';
  from?: { chain: string; token: string; amount: string };
  to?: { chain: string; token: string; amount: string };
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

export function registerBatchCommand(program: Command): void {
  program
    .command('batch <file>')
    .description('Execute multiple swaps from a JSON file')
    .option('--wallet <name>', 'Default wallet for all swaps')
    .option('--password <pw>', 'Wallet password (or SWAP_WALLET_PASSWORD env)')
    .option('--dry-run', 'Only show quotes, do not execute')
    .option('--continue-on-error', 'Continue executing remaining swaps if one fails')
    .option('--json', 'Output results as JSON')
    .action(async (file: string, opts) => {
      // Read batch file
      let swaps: BatchSwapEntry[];
      try {
        const raw = readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        swaps = Array.isArray(parsed) ? parsed : parsed.swaps;
        if (!Array.isArray(swaps)) throw new Error('Expected array or { swaps: [...] }');
      } catch (err) {
        display.exitWithError(`Failed to read batch file: ${err instanceof Error ? err.message : String(err)}`, opts.json);
        return; // unreachable but satisfies TS
      }

      if (swaps.length === 0) {
        display.exitWithError('Batch file contains no swaps.', opts.json);
        return;
      }

      if (!opts.json) {
        display.heading(`Batch Swap: ${swaps.length} operations`);
        if (opts.dryRun) display.info('DRY RUN — no transactions will be executed');
        console.log();
      }

      // Resolve wallet and password
      const config = loadConfig();
      const defaultWalletName = opts.wallet ?? config.defaultWallet;
      const password = opts.dryRun
        ? undefined
        : (opts.password ?? process.env['SWAP_WALLET_PASSWORD'] ?? await askPassword('Enter wallet password:'));

      const results: BatchResult[] = [];
      const unlockedWallets = new Set<string>();

      for (let i = 0; i < swaps.length; i++) {
        const swap = swaps[i];
        const walletName = swap.wallet ?? defaultWalletName;
        const label = `[${i + 1}/${swaps.length}] ${swap.amount} ${swap.fromToken} → ${swap.toToken}`;

        if (!opts.json) {
          console.log();
          display.heading(label);
        }

        if (!walletName) {
          const result: BatchResult = { index: i, status: 'failed', error: 'No wallet specified.' };
          results.push(result);
          if (!opts.continueOnError) break;
          continue;
        }

        const walletInfo = getWallet(walletName);
        if (!walletInfo) {
          const result: BatchResult = { index: i, status: 'failed', error: `Wallet "${walletName}" not found.` };
          results.push(result);
          if (!opts.continueOnError) break;
          continue;
        }

        // Unlock wallet once per wallet name
        if (!opts.dryRun && !unlockedWallets.has(walletName) && password) {
          try {
            if (walletInfo.type === 'solana') {
              const kp = unlockSolanaWallet(walletInfo, password);
              initSdkWithSolanaWallet(kp.secretKey.toString());
            } else {
              const w = unlockEvmWallet(walletInfo, password);
              initSdkWithEvmWallet(w.privateKey);
            }
            unlockedWallets.add(walletName);
          } catch (err) {
            const msg = err instanceof DecryptionError ? 'Wrong password.' : (err instanceof Error ? err.message : String(err));
            results.push({ index: i, status: 'failed', error: msg });
            if (!opts.continueOnError) break;
            continue;
          }
        }

        // Resolve chains and tokens
        try {
          const fromChain = await findChain(swap.fromChain);
          const toChain = await findChain(swap.toChain);
          if (!fromChain) { results.push({ index: i, status: 'failed', error: `Chain "${swap.fromChain}" not found.` }); if (!opts.continueOnError) break; continue; }
          if (!toChain) { results.push({ index: i, status: 'failed', error: `Chain "${swap.toChain}" not found.` }); if (!opts.continueOnError) break; continue; }

          const fromToken = await findToken(fromChain.id, swap.fromToken);
          const toToken = await findToken(toChain.id, swap.toToken);
          if (!fromToken) { results.push({ index: i, status: 'failed', error: `Token "${swap.fromToken}" not found.` }); if (!opts.continueOnError) break; continue; }
          if (!toToken) { results.push({ index: i, status: 'failed', error: `Token "${swap.toToken}" not found.` }); if (!opts.continueOnError) break; continue; }

          const rawAmount = parseAmount(swap.amount, fromToken.decimals);
          const slippage = swap.slippage ? swap.slippage / 100 : config.defaultSlippage / 100;

          const { quote, route } = await getSwapQuote({
            fromChainId: fromChain.id, toChainId: toChain.id,
            fromTokenAddress: fromToken.address, toTokenAddress: toToken.address,
            fromAmount: rawAmount, fromAddress: walletInfo.address, slippage,
          });

          const fromAmountHuman = formatAmount(quote.fromAmount, fromToken.decimals);
          const toAmountHuman = formatAmount(quote.toAmount, toToken.decimals);

          if (!opts.json) {
            display.keyValue('  Send', `${fromAmountHuman} ${fromToken.symbol} (${fromChain.name})`);
            display.keyValue('  Receive', `~${toAmountHuman} ${toToken.symbol} (${toChain.name})`);
            display.keyValue('  Route', quote.toolsUsed.join(' → '));
          }

          if (opts.dryRun) {
            results.push({
              index: i, status: 'skipped',
              from: { chain: fromChain.name, token: fromToken.symbol, amount: fromAmountHuman },
              to: { chain: toChain.name, token: toToken.symbol, amount: toAmountHuman },
            });
            if (!opts.json) display.info('  Dry run — skipped execution');
            continue;
          }

          // Execute
          const spin = display.spinner(`  Executing...`);
          const swapResult = await executeSwapRoute(route, (status) => { spin.text = `  ${status}`; });

          if (swapResult.status === 'success') {
            spin.succeed('  Swap completed');
            results.push({
              index: i, status: 'success', txHash: swapResult.txHash,
              from: { chain: fromChain.name, token: fromToken.symbol, amount: fromAmountHuman },
              to: { chain: toChain.name, token: toToken.symbol, amount: formatAmount(swapResult.toAmount, toToken.decimals) },
              explorerUrl: swapResult.explorerUrl,
            });
          } else {
            spin.fail('  Swap failed');
            results.push({ index: i, status: 'failed', error: swapResult.error });
            if (!opts.continueOnError) break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ index: i, status: 'failed', error: msg });
          if (!opts.json) display.error(`  ${msg}`);
          if (!opts.continueOnError) break;
        }
      }

      // Summary
      const succeeded = results.filter(r => r.status === 'success').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const skipped = results.filter(r => r.status === 'skipped').length;

      if (opts.json) {
        display.jsonOutput({ total: swaps.length, succeeded, failed, skipped, results });
      } else {
        console.log();
        display.heading('Batch Summary');
        display.keyValue('Total', `${swaps.length}`);
        display.keyValue('Succeeded', `${succeeded}`);
        display.keyValue('Failed', `${failed}`);
        if (skipped > 0) display.keyValue('Skipped (dry-run)', `${skipped}`);
      }

      if (failed > 0) process.exit(1);
    });
}
