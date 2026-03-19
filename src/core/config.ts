import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../types.js';

const APP_DIR = join(homedir(), '.cli-swap');
const CONFIG_FILE = join(APP_DIR, 'config.json');
const WALLETS_DIR = join(APP_DIR, 'wallets');

const DEFAULT_CONFIG: AppConfig = {
  defaultSlippage: 0.5,
  rpcOverrides: {},
};

export function getAppDir(): string {
  return APP_DIR;
}

export function getWalletsDir(): string {
  return WALLETS_DIR;
}

export function ensureDirs(): void {
  // recursive:true is idempotent — no TOCTOU with existsSync
  mkdirSync(APP_DIR, { recursive: true });
  mkdirSync(WALLETS_DIR, { recursive: true });
}

export function loadConfig(): AppConfig {
  ensureDirs();
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as AppConfig;
  } catch {
    // File missing or corrupted — write defaults
    atomicWriteJson(CONFIG_FILE, DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AppConfig): void {
  ensureDirs();
  atomicWriteJson(CONFIG_FILE, config);
}

/** Atomic write: write to temp file then rename (prevents partial writes) */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = join(dirname(filePath), `.tmp-${randomBytes(4).toString('hex')}.json`);
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, filePath);
}
