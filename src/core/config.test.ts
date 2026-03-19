import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// Mock homedir to use a temp directory
const testDir = join(tmpdir(), `cli-swap-test-${randomBytes(4).toString('hex')}`);
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => testDir };
});

// Import after mock
const { loadConfig, saveConfig, getAppDir, getWalletsDir, ensureDirs } = await import('./config.js');

describe('config', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.defaultSlippage).toBe(0.5);
    expect(config.rpcOverrides).toEqual({});
    expect(config.defaultWallet).toBeUndefined();
  });

  it('creates config file on first load', () => {
    loadConfig();
    const configPath = join(getAppDir(), 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });

  it('saves and loads config', () => {
    const config = loadConfig();
    config.defaultWallet = 'myWallet';
    config.defaultSlippage = 1.0;
    saveConfig(config);

    const loaded = loadConfig();
    expect(loaded.defaultWallet).toBe('myWallet');
    expect(loaded.defaultSlippage).toBe(1.0);
  });

  it('creates wallets directory', () => {
    ensureDirs();
    expect(existsSync(getWalletsDir())).toBe(true);
  });

  it('handles corrupted config file gracefully', () => {
    ensureDirs();
    const configPath = join(getAppDir(), 'config.json');
    writeFileSync(configPath, 'not json!!!');

    const config = loadConfig();
    expect(config.defaultSlippage).toBe(0.5); // defaults
  });

  it('atomic write produces valid JSON', () => {
    const config = loadConfig();
    config.rpcOverrides = { '1': 'https://rpc.example.com' };
    saveConfig(config);

    const configPath = join(getAppDir(), 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw).rpcOverrides['1']).toBe('https://rpc.example.com');
  });
});
