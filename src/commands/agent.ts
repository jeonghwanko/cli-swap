import { Command } from 'commander';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  findChain,
  findToken,
  getSwapQuote,
  executeSwapRoute,
  initSdk,
  initSdkWithEvmWallet,
  initSdkWithSolanaWallet,
} from '../core/swapper.js';
import { executeTransfer } from '../core/sender.js';
import { getWallet, unlockEvmWallet, unlockSolanaWallet } from '../core/wallet.js';
import { loadConfig } from '../core/config.js';
import { decrypt, DecryptionError } from '../utils/crypto.js';
import { parseAmount, formatAmount } from '../utils/amount.js';
import * as display from '../utils/display.js';
import { askPassword, askConfirm, askInput } from '../utils/prompt.js';

/**
 * Parse a natural language swap intent into structured parameters.
 *
 * Supports patterns like:
 * - "swap 1 ETH to USDC on ethereum"
 * - "이더리움 ETH 0.5개를 USDC로"
 * - "convert 100 USDC from ethereum to polygon"
 * - "0.1 ETH -> arbitrum USDC"
 * - "bridge 50 USDC from polygon to base"
 */
type IntentAction = 'swap' | 'send';

interface ParsedIntent {
  action: IntentAction;
  fromChain?: string;
  fromToken?: string;
  toChain?: string;
  toToken?: string;
  amount?: string;
  toAddress?: string; // for send
}

function parseNaturalLanguage(input: string): ParsedIntent {
  const result: ParsedIntent = { action: 'swap' };
  const lower = input.toLowerCase().trim();

  // Detect send/transfer intent
  const sendPatterns = /^(send|transfer|보내|송금|전송)/i;
  if (sendPatterns.test(lower)) {
    result.action = 'send';
  }

  // Extract wallet address (0x... for EVM, base58 for Solana)
  const evmAddrMatch = input.match(/(0x[0-9a-fA-F]{40})/);
  const solAddrMatch = input.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  if (evmAddrMatch) {
    result.toAddress = evmAddrMatch[1];
    result.action = 'send'; // if address detected, it's a send
  } else if (result.action === 'send' && solAddrMatch) {
    result.toAddress = solAddrMatch[1];
  }

  // Remove common prefixes
  const cleaned = lower
    .replace(/^(swap|convert|exchange|bridge|send|transfer|buy|sell|바꿔|교환|스왑|전환|보내|송금|전송)\s*/i, '')
    .replace(/해\s*줘\s*$/, '')
    .replace(/으?로\s*$/, '')
    .trim();

  // Pattern 1: "1 ETH to USDC on ethereum"
  // Pattern 2: "1 ETH from ethereum to USDC on polygon"
  // Pattern 3: "1 ETH -> USDC" (same chain implied)
  // Pattern 4: "ethereum ETH 0.5 to polygon USDC"

  // Extract amount (first number found)
  const amountMatch = cleaned.match(/([\d.]+)\s*개?/);
  if (amountMatch) {
    result.amount = amountMatch[1];
  }

  // Extract chains
  const chainNames = [
    'ethereum', 'eth', 'polygon', 'pol', 'arbitrum', 'arb', 'optimism', 'opt',
    'base', 'bsc', 'bnb', 'avalanche', 'avax', 'solana', 'sol', 'gnosis',
    'fantom', 'ftm', 'linea', 'scroll', 'zksync', 'blast', 'mantle', 'mode', 'celo',
    '이더리움', '폴리곤', '아비트럼', '옵티미즘', '베이스', '솔라나',
  ];

  // Korean to English chain mapping
  const koreanChainMap: Record<string, string> = {
    '이더리움': 'ethereum', '폴리곤': 'polygon', '아비트럼': 'arbitrum',
    '옵티미즘': 'optimism', '베이스': 'base', '솔라나': 'solana',
  };

  // Find chains in the text
  const foundChains: string[] = [];
  for (const name of chainNames) {
    if (cleaned.includes(name)) {
      const mapped = koreanChainMap[name] ?? name;
      if (!foundChains.includes(mapped)) foundChains.push(mapped);
    }
  }

  // Extract tokens (uppercase symbols or known tokens)
  const knownTokens = ['eth', 'usdc', 'usdt', 'dai', 'weth', 'wbtc', 'sol', 'matic', 'pol', 'bnb', 'avax', 'link', 'uni', 'aave', 'arb', 'op'];
  const words = cleaned.split(/[\s,→\->]+/);
  const foundTokens: string[] = [];

  for (const word of words) {
    const w = word.replace(/[^a-z0-9]/g, '');
    if (knownTokens.includes(w) && !chainNames.includes(w)) {
      foundTokens.push(w.toUpperCase());
    } else if (/^[A-Z]{2,10}$/.test(word.replace(/[^a-zA-Z]/g, '')) && word.length <= 10) {
      const clean = word.replace(/[^a-zA-Z]/g, '').toUpperCase();
      if (clean.length >= 2 && !['TO', 'ON', 'FROM', 'THE', 'AND', 'FOR'].includes(clean)) {
        foundTokens.push(clean);
      }
    }
  }

  // Assign tokens
  if (foundTokens.length >= 2) {
    result.fromToken = foundTokens[0];
    result.toToken = foundTokens[1];
  } else if (foundTokens.length === 1) {
    result.fromToken = foundTokens[0];
  }

  // Assign chains
  if (foundChains.length >= 2) {
    result.fromChain = foundChains[0];
    result.toChain = foundChains[1];
  } else if (foundChains.length === 1) {
    result.fromChain = foundChains[0];
    result.toChain = foundChains[0]; // same-chain swap
  }

  return result;
}

export function registerAgentCommand(program: Command): void {
  program
    .command('agent [intent...]')
    .description('Natural language swap/send: cli-swap agent "swap 1 ETH to USDC" or "send 0.5 ETH to 0x..."')
    .option('--wallet <name>', 'Wallet to use')
    .option('--password <pw>', 'Wallet password')
    .option('--yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (intentWords: string[], opts) => {
      let intentText = intentWords.join(' ');

      // Interactive mode if no intent provided
      if (!intentText.trim()) {
        intentText = await askInput('What do you want to do? (e.g., "swap 1 ETH to USDC on ethereum")');
      }

      if (!opts.json) {
        display.heading('Agent Mode');
        display.keyValue('Input', intentText);
        console.log();
      }

      // Parse intent
      const parsed = parseNaturalLanguage(intentText);

      // Resolve wallet (shared for both send and swap)
      const config = loadConfig();
      const walletName = opts.wallet ?? config.defaultWallet;
      if (!walletName) {
        display.exitWithError('No wallet configured. Run `cli-swap wallet import` first.', opts.json);
      }
      const walletInfo = getWallet(walletName);
      if (!walletInfo) {
        display.exitWithError(`Wallet "${walletName}" not found. Run \`cli-swap wallet list\`.`, opts.json);
      }

      // Unlock wallet
      const password = opts.password ?? process.env['SWAP_WALLET_PASSWORD'] ?? await askPassword('Enter wallet password:');

      let privateKey: string;
      let keypair: Keypair | undefined;
      const spin = display.spinner('Unlocking wallet...');
      try {
        privateKey = decrypt(
          walletInfo.encryptedKey, password,
          walletInfo.iv, walletInfo.salt, walletInfo.authTag,
        );
        if (walletInfo.type === 'solana') {
          keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
          initSdkWithSolanaWallet(privateKey);
        } else {
          initSdkWithEvmWallet(privateKey);
        }
        spin.succeed('Wallet unlocked');
      } catch (err) {
        spin.fail(err instanceof DecryptionError ? 'Wrong password' : 'Unlock failed');
        display.exitWithError(err instanceof DecryptionError ? 'Wrong password.' : (err instanceof Error ? err.message : String(err)), opts.json);
      }

      // ── SEND MODE ──
      if (parsed.action === 'send') {
        if (!parsed.fromChain) parsed.fromChain = await askInput('Chain (e.g., ethereum):');
        if (!parsed.fromToken) parsed.fromToken = await askInput('Token to send (e.g., ETH):');
        if (!parsed.amount) parsed.amount = await askInput('Amount (e.g., 0.5):');
        if (!parsed.toAddress) parsed.toAddress = await askInput('Recipient address:');

        if (!opts.json) {
          display.heading('Parsed Intent: Send');
          display.keyValue('Send', `${parsed.amount} ${parsed.fromToken} (${parsed.fromChain})`);
          display.keyValue('To', parsed.toAddress);
          console.log();
        }

        initSdk();
        const spin2 = display.spinner('Resolving...');
        try {
          const chain = await findChain(parsed.fromChain!);
          if (!chain) { spin2.stop(); display.exitWithError(`Chain "${parsed.fromChain}" not found.`, opts.json); }

          const token = await findToken(chain.id, parsed.fromToken!);
          if (!token) { spin2.stop(); display.exitWithError(`Token "${parsed.fromToken}" not found on ${chain.name}.`, opts.json); }

          const rawAmount = parseAmount(parsed.amount!, token.decimals);
          const amountHuman = formatAmount(rawAmount, token.decimals);
          spin2.stop();

          if (!opts.json) {
            display.heading('Transfer Preview');
            display.keyValue('From', `${walletInfo.address} (${walletName})`);
            display.keyValue('To', parsed.toAddress!);
            display.keyValue('Amount', `${amountHuman} ${token.symbol}`);
            display.keyValue('Chain', chain.name);
            console.log();
          }

          if (!opts.yes) {
            const confirmed = await askConfirm('Execute this transfer?');
            if (!confirmed) { display.info('Cancelled.'); process.exit(0); }
          }

          const spin3 = display.spinner('Sending tokens...');
          const result = await executeTransfer({
            chain, token,
            toAddress: parsed.toAddress!,
            amount: rawAmount,
            privateKey, keypair,
          });

          if (result.status === 'success') {
            spin3.succeed('Transfer completed!');
            if (opts.json) {
              display.jsonOutput({
                status: 'success', intent: intentText, action: 'send',
                txHash: result.txHash, from: walletInfo.address,
                to: parsed.toAddress, amount: amountHuman, token: token.symbol,
                chain: chain.name, explorerUrl: result.explorerUrl,
              });
            } else {
              if (result.txHash) display.keyValue('Tx Hash', result.txHash);
              if (result.explorerUrl) display.keyValue('Explorer', result.explorerUrl);
            }
          } else {
            spin3.fail('Transfer failed');
            if (opts.json) {
              display.jsonOutput({ status: 'failed', intent: intentText, action: 'send', error: result.error });
            } else {
              display.error(result.error ?? 'Unknown error');
            }
            process.exit(1);
          }
        } catch (err) {
          spin2.fail('Failed');
          display.exitWithError(err instanceof Error ? err.message : String(err), opts.json);
        }
        return;
      }

      // ── SWAP MODE ──
      if (!parsed.fromChain) parsed.fromChain = await askInput('Source chain (e.g., ethereum):');
      if (!parsed.fromToken) parsed.fromToken = await askInput('Source token (e.g., ETH):');
      if (!parsed.toChain) parsed.toChain = await askInput('Destination chain (e.g., polygon):');
      if (!parsed.toToken) parsed.toToken = await askInput('Destination token (e.g., USDC):');
      if (!parsed.amount) parsed.amount = await askInput('Amount (e.g., 1.0):');

      if (!opts.json) {
        display.heading('Parsed Intent: Swap');
        display.keyValue('From', `${parsed.amount} ${parsed.fromToken} (${parsed.fromChain})`);
        display.keyValue('To', `${parsed.toToken} (${parsed.toChain})`);
        console.log();
      }

      // Resolve chains and tokens
      const spin2 = display.spinner('Resolving...');
      try {
        const fromChain = await findChain(parsed.fromChain!);
        const toChain = await findChain(parsed.toChain!);
        if (!fromChain) { spin2.stop(); display.exitWithError(`Chain "${parsed.fromChain}" not found.`, opts.json); }
        if (!toChain) { spin2.stop(); display.exitWithError(`Chain "${parsed.toChain}" not found.`, opts.json); }

        const fromToken = await findToken(fromChain.id, parsed.fromToken!);
        const toToken = await findToken(toChain.id, parsed.toToken!);
        if (!fromToken) { spin2.stop(); display.exitWithError(`Token "${parsed.fromToken}" not found on ${fromChain.name}.`, opts.json); }
        if (!toToken) { spin2.stop(); display.exitWithError(`Token "${parsed.toToken}" not found on ${toChain.name}.`, opts.json); }

        const rawAmount = parseAmount(parsed.amount!, fromToken.decimals);
        const slippage = config.defaultSlippage / 100;

        const { quote, route } = await getSwapQuote({
          fromChainId: fromChain.id, toChainId: toChain.id,
          fromTokenAddress: fromToken.address, toTokenAddress: toToken.address,
          fromAmount: rawAmount, fromAddress: walletInfo.address, slippage,
        });

        spin2.stop();

        const fromAmountHuman = formatAmount(quote.fromAmount, fromToken.decimals);
        const toAmountHuman = formatAmount(quote.toAmount, toToken.decimals);
        const toAmountMinHuman = formatAmount(quote.toAmountMin, toToken.decimals);

        if (!opts.json) {
          display.heading('Swap Preview');
          display.keyValue('Send', `${fromAmountHuman} ${fromToken.symbol} (${fromChain.name})`);
          display.keyValue('Receive', `~${toAmountHuman} ${toToken.symbol} (${toChain.name})`);
          display.keyValue('Min', `${toAmountMinHuman} ${toToken.symbol}`);
          display.keyValue('Time', `~${quote.executionDuration}s`);
          display.keyValue('Route', quote.toolsUsed.join(' → '));
          console.log();
        }

        if (!opts.yes) {
          const confirmed = await askConfirm('Execute this swap?');
          if (!confirmed) { display.info('Cancelled.'); process.exit(0); }
        }

        const spin3 = display.spinner('Executing swap...');
        const result = await executeSwapRoute(route, (status) => { spin3.text = status; });

        if (result.status === 'success') {
          spin3.succeed('Swap completed!');
          if (opts.json) {
            display.jsonOutput({
              status: 'success', intent: intentText, action: 'swap', txHash: result.txHash,
              from: { chain: fromChain.name, token: fromToken.symbol, amount: fromAmountHuman },
              to: { chain: toChain.name, token: toToken.symbol, amount: toAmountHuman },
              explorerUrl: result.explorerUrl,
            });
          } else {
            if (result.txHash) display.keyValue('Tx Hash', result.txHash);
            if (result.explorerUrl) display.keyValue('Explorer', result.explorerUrl);
          }
        } else {
          spin3.fail('Swap failed');
          if (opts.json) {
            display.jsonOutput({ status: 'failed', intent: intentText, action: 'swap', error: result.error });
          } else {
            display.error(result.error ?? 'Unknown error');
          }
          process.exit(1);
        }
      } catch (err) {
        spin2.fail('Failed');
        display.exitWithError(err instanceof Error ? err.message : String(err), opts.json);
      }
    });
}
