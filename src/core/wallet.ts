import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getWalletsDir, ensureDirs } from './config.js';
import type { WalletInfo } from '../types.js';

export function listWallets(): WalletInfo[] {
  ensureDirs();
  const dir = getWalletsDir();
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.flatMap(f => {
    try {
      return [JSON.parse(readFileSync(join(dir, f), 'utf-8')) as WalletInfo];
    } catch {
      return []; // Skip corrupted wallet files
    }
  });
}

export function getWallet(name: string): WalletInfo | null {
  const filePath = join(getWalletsDir(), `${name}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as WalletInfo;
  } catch {
    return null; // Corrupted wallet file
  }
}

export function saveWallet(wallet: WalletInfo): void {
  ensureDirs();
  const filePath = join(getWalletsDir(), `${wallet.name}.json`);
  writeFileSync(filePath, JSON.stringify(wallet, null, 2));
}

export function removeWallet(name: string): boolean {
  const filePath = join(getWalletsDir(), `${name}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}

export function importEvmWallet(
  name: string,
  privateKey: string,
  password: string,
): WalletInfo {
  // Normalize: add 0x prefix if missing
  if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('Invalid EVM private key. Must be 64 hex characters (with or without 0x prefix).');
  }

  let wallet: ethers.Wallet;
  try {
    wallet = new ethers.Wallet(privateKey);
  } catch {
    throw new Error('Invalid EVM private key. Could not derive wallet address.');
  }

  const { encrypted, iv, salt, authTag } = encrypt(privateKey, password);

  const info: WalletInfo = {
    name,
    type: 'evm',
    address: wallet.address,
    encryptedKey: encrypted,
    iv,
    salt,
    authTag,
    createdAt: new Date().toISOString(),
  };
  saveWallet(info);
  return info;
}

export function importSolanaWallet(
  name: string,
  privateKeyBase58: string,
  password: string,
): WalletInfo {
  let keypair: Keypair;
  try {
    const secretKey = bs58.decode(privateKeyBase58);
    keypair = Keypair.fromSecretKey(secretKey);
  } catch {
    throw new Error('Invalid Solana private key. Must be a valid base58-encoded secret key.');
  }

  const { encrypted, iv, salt, authTag } = encrypt(privateKeyBase58, password);

  const info: WalletInfo = {
    name,
    type: 'solana',
    address: keypair.publicKey.toBase58(),
    encryptedKey: encrypted,
    iv,
    salt,
    authTag,
    createdAt: new Date().toISOString(),
  };
  saveWallet(info);
  return info;
}

export function unlockEvmWallet(wallet: WalletInfo, password: string): ethers.Wallet {
  const privateKey = decrypt(
    wallet.encryptedKey,
    password,
    wallet.iv,
    wallet.salt,
    wallet.authTag,
  );
  return new ethers.Wallet(privateKey);
}

export function unlockSolanaWallet(wallet: WalletInfo, password: string): Keypair {
  const privateKeyBase58 = decrypt(
    wallet.encryptedKey,
    password,
    wallet.iv,
    wallet.salt,
    wallet.authTag,
  );
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
}
