/**
 * Token transfer (send) module.
 *
 * Handles native token + ERC-20 / SPL token transfers
 * on EVM and Solana chains without routing through Li.Fi.
 */

import { ethers } from 'ethers';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { ExtendedChain, Token } from '@lifi/sdk';
import { loadConfig } from './config.js';
import type { SendResult } from '../types.js';

// Minimal ERC-20 ABI for transfer
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

/** Resolve an RPC URL for a chain */
function getRpcUrl(chain: ExtendedChain): string {
  const config = loadConfig();
  return (
    config.rpcOverrides[String(chain.id)] ??
    chain.metamask?.rpcUrls?.[0] ??
    `https://rpc.ankr.com/${chain.key}`
  );
}

/** Get a block explorer base URL from the chain metadata */
function getExplorerUrl(chain: ExtendedChain, txHash: string): string | undefined {
  const urls = chain.metamask?.blockExplorerUrls;
  if (urls && urls.length > 0) {
    const base = urls[0].replace(/\/$/, '');
    return `${base}/tx/${txHash}`;
  }
  return undefined;
}

/**
 * Check if a token is the chain's native token.
 * Li.Fi marks native tokens with the zero address or a special 0xeee... address.
 */
function isNativeToken(token: Token): boolean {
  const addr = token.address.toLowerCase();
  return (
    addr === '0x0000000000000000000000000000000000000000' ||
    addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
    addr === '11111111111111111111111111111111' // Solana native SOL mint
  );
}

// ── EVM Transfers ──────────────────────────────────────────────

export async function sendEvmNative(params: {
  chain: ExtendedChain;
  privateKey: string;
  toAddress: string;
  amount: string; // wei
}): Promise<SendResult> {
  const rpcUrl = getRpcUrl(params.chain);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(params.privateKey, provider);

  const tx = await wallet.sendTransaction({
    to: params.toAddress,
    value: BigInt(params.amount),
  });

  const receipt = await tx.wait();

  return {
    status: 'success',
    txHash: receipt?.hash ?? tx.hash,
    explorerUrl: getExplorerUrl(params.chain, receipt?.hash ?? tx.hash),
  };
}

export async function sendEvmToken(params: {
  chain: ExtendedChain;
  privateKey: string;
  tokenAddress: string;
  toAddress: string;
  amount: string; // smallest unit
}): Promise<SendResult> {
  const rpcUrl = getRpcUrl(params.chain);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(params.privateKey, provider);

  const contract = new ethers.Contract(params.tokenAddress, ERC20_ABI, wallet);
  const tx = await contract.transfer(params.toAddress, BigInt(params.amount));
  const receipt = await tx.wait();

  return {
    status: 'success',
    txHash: receipt?.hash ?? tx.hash,
    explorerUrl: getExplorerUrl(params.chain, receipt?.hash ?? tx.hash),
  };
}

// ── Solana Transfers ───────────────────────────────────────────

export async function sendSolanaNative(params: {
  chain: ExtendedChain;
  keypair: Keypair;
  toAddress: string;
  amount: string; // lamports
}): Promise<SendResult> {
  const config = loadConfig();
  const rpcUrl = config.rpcOverrides[String(params.chain.id)] ?? 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const toPubkey = new PublicKey(params.toAddress);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: params.keypair.publicKey,
      toPubkey,
      lamports: BigInt(params.amount),
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [params.keypair]);

  return {
    status: 'success',
    txHash: signature,
    explorerUrl: `https://solscan.io/tx/${signature}`,
  };
}

// ── Unified send function ──────────────────────────────────────

export interface SendParams {
  chain: ExtendedChain;
  token: Token;
  toAddress: string;
  amount: string; // smallest unit (wei / lamports)
  privateKey: string; // hex for EVM, base58 for Solana
  keypair?: Keypair; // Solana only
}

export async function executeTransfer(params: SendParams): Promise<SendResult> {
  const { chain, token, toAddress, amount, privateKey, keypair } = params;

  try {
    if (chain.chainType === 'SVM') {
      // Solana
      if (!keypair) {
        return { status: 'failed', error: 'Solana keypair required for transfer.' };
      }

      if (isNativeToken(token)) {
        return sendSolanaNative({ chain, keypair, toAddress, amount });
      } else {
        // SPL token transfer — requires @solana/spl-token (not included in MVP)
        return {
          status: 'failed',
          error: 'SPL token transfers are not yet supported. Only native SOL transfers are available.',
        };
      }
    } else {
      // EVM
      if (isNativeToken(token)) {
        return sendEvmNative({ chain, privateKey, toAddress, amount });
      } else {
        return sendEvmToken({ chain, privateKey, tokenAddress: token.address, toAddress, amount });
      }
    }
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
