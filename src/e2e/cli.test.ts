/**
 * E2E Integration Tests for cli-swap commands.
 *
 * These tests exercise the CLI binary with real arguments.
 * - Tests marked LIVE_ONLY require network access and are skipped by default.
 * - Set E2E_LIVE=1 to run live network tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const CLI = join(import.meta.dirname, '..', 'index.ts').replace(/\\/g, '/');

// Isolated home directory so tests don't affect real wallets
const testHome = join(tmpdir(), `cli-swap-e2e-${randomBytes(4).toString('hex')}`);

const isLive = process.env['E2E_LIVE'] === '1';

function run(args: string[], env?: Record<string, string>): string {
  const cmd = `npx tsx "${CLI}" ${args.map(a => `"${a}"`).join(' ')}`;
  return execSync(cmd, {
    encoding: 'utf-8',
    timeout: 60_000,
    env: {
      ...process.env,
      HOME: testHome,
      USERPROFILE: testHome,
      ...env,
    },
  });
}

function runJson(args: string[], env?: Record<string, string>): unknown {
  const output = run([...args, '--json'], env);
  return JSON.parse(output);
}

function runExpectFail(args: string[], env?: Record<string, string>): { stdout: string; stderr: string } {
  const cmd = `npx tsx "${CLI}" ${args.map(a => `"${a}"`).join(' ')}`;
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 60_000,
      env: { ...process.env, HOME: testHome, USERPROFILE: testHome, ...env },
    });
    return { stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('CLI E2E', { timeout: 30_000 }, () => {
  beforeAll(() => {
    mkdirSync(testHome, { recursive: true });
  });

  afterAll(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  // ── Wallet commands ───────────────────────────────────────

  describe('wallet', () => {
    const testKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const password = 'testpass123';

    it('wallet list returns empty initially', () => {
      const result = runJson(['wallet', 'list']) as unknown[];
      expect(result).toEqual([]);
    });

    it('wallet import creates a wallet', () => {
      const result = runJson([
        'wallet', 'import',
        '--name', 'e2e-test',
        '--type', 'evm',
        '--key', testKey,
        '--password', password,
      ]) as Record<string, string>;

      expect(result.name).toBe('e2e-test');
      expect(result.type).toBe('evm');
      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('wallet list shows imported wallet', () => {
      const result = runJson(['wallet', 'list']) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('e2e-test');
      expect(result[0]?.default).toBe(true);
    });

    it('wallet import rejects duplicate name', () => {
      const { stdout, stderr } = runExpectFail([
        'wallet', 'import',
        '--name', 'e2e-test',
        '--type', 'evm',
        '--key', testKey,
        '--password', password,
      ]);
      const output = stdout + stderr;
      expect(output).toContain('already exists');
    });

    it('wallet remove deletes wallet', () => {
      const before = runJson(['wallet', 'list']) as unknown[];
      expect(before).toHaveLength(1);

      run(['wallet', 'remove', 'e2e-test', '--yes']);

      const after = runJson(['wallet', 'list']) as unknown[];
      expect(after).toHaveLength(0);
    });
  });

  // ── Chain commands ────────────────────────────────────────

  describe('chains (live)', () => {
    it.skipIf(!isLive)('lists supported chains', () => {
      const result = runJson(['chains']) as Array<Record<string, unknown>>;
      expect(result.length).toBeGreaterThan(10);

      const ethereum = result.find((c) => c.key === 'eth');
      expect(ethereum).toBeDefined();
      expect(ethereum?.name).toContain('Ethereum');
    });

    it.skipIf(!isLive)('filters chains by type', () => {
      const result = runJson(['chains', '--type', 'SVM']) as Array<Record<string, unknown>>;
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.every((c) => c.chainType === 'SVM')).toBe(true);
    });
  });

  // ── Token commands ────────────────────────────────────────

  describe('tokens (live)', () => {
    it.skipIf(!isLive)('searches tokens on ethereum', () => {
      const result = runJson(['tokens', 'ethereum', 'USDC']) as Array<Record<string, unknown>>;
      expect(result.length).toBeGreaterThan(0);

      const usdc = result.find((t) => t.symbol === 'USDC');
      expect(usdc).toBeDefined();
      expect(usdc?.decimals).toBe(6);
    });
  });

  // ── Balance commands ──────────────────────────────────────

  describe('balance (live)', () => {
    const testKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const password = 'testpass123';

    it.skipIf(!isLive)('gets balance on ethereum', () => {
      try { run(['wallet', 'import', '--name', 'balance-test', '--type', 'evm', '--key', testKey, '--password', password]); } catch { /* may exist */ }

      const result = runJson(['balance', 'ethereum', '--wallet', 'balance-test']) as Record<string, unknown>;
      expect(result.chain).toBeDefined();
      expect(result.balance).toBeDefined();
      expect(result.symbol).toBeDefined();
    });
  });

  // ── Quote commands ────────────────────────────────────────

  describe('quote (live)', () => {
    const testKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const password = 'testpass123';

    it.skipIf(!isLive)('gets a swap quote', () => {
      try { run(['wallet', 'import', '--name', 'quote-test', '--type', 'evm', '--key', testKey, '--password', password]); } catch { /* may exist */ }

      const result = runJson(['quote', 'ethereum', 'ETH', 'ethereum', 'USDC', '1', '--wallet', 'quote-test']) as Record<string, unknown>;
      expect(result.from).toBeDefined();
      expect(result.to).toBeDefined();
      expect(result.estimatedDuration).toBeDefined();
    });
  });

  // ── Error handling ────────────────────────────────────────

  describe('error handling', () => {
    it('returns JSON error for missing wallet', () => {
      const { stdout, stderr } = runExpectFail(['balance', 'ethereum', '--wallet', 'nonexistent', '--json']);
      const output = stdout + stderr;
      expect(output).toContain('not found');
    });

    it('returns error for invalid chain', () => {
      // Import a wallet first so we can test chain validation
      try { run(['wallet', 'import', '--name', 'err-test', '--type', 'evm', '--key', '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', '--password', 'testpass123']); } catch { /* may exist */ }

      const { stdout, stderr } = runExpectFail(['balance', 'invalidchain', '--wallet', 'err-test', '--json']);
      const output = stdout + stderr;
      expect(output).toContain('not found');
    });
  });
});
