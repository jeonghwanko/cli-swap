import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../types.js';

const APP_DIR = join(homedir(), '.cli-swap');
const CONFIG_FILE = join(APP_DIR, 'config.json');
const WALLETS_DIR = join(APP_DIR, 'wallets');

export function getAppDir(): string {
  return APP_DIR;
}

export function getWalletsDir(): string {
  return WALLETS_DIR;
}

export function ensureDirs(): void {
  if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
  if (!existsSync(WALLETS_DIR)) mkdirSync(WALLETS_DIR, { recursive: true });
}

export function loadConfig(): AppConfig {
  ensureDirs();
  if (!existsSync(CONFIG_FILE)) {
    const defaults: AppConfig = {
      defaultSlippage: 0.5,
      rpcOverrides: {},
    };
    writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as AppConfig;
}

export function saveConfig(config: AppConfig): void {
  ensureDirs();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
