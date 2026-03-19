import { describe, it, expect } from 'vitest';
import { normalizeEvmKey, ensureHexKey } from './validate.js';

describe('normalizeEvmKey', () => {
  const validKey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const validKeyWith0x = '0x' + validKey;

  it('accepts key without 0x prefix and adds it', () => {
    expect(normalizeEvmKey(validKey)).toBe(validKeyWith0x);
  });

  it('accepts key with 0x prefix as-is', () => {
    expect(normalizeEvmKey(validKeyWith0x)).toBe(validKeyWith0x);
  });

  it('throws on too short key', () => {
    expect(() => normalizeEvmKey('0xabc')).toThrow('Invalid EVM private key');
  });

  it('throws on too long key', () => {
    expect(() => normalizeEvmKey(validKey + 'ff')).toThrow('Invalid EVM private key');
  });

  it('throws on non-hex characters', () => {
    const badKey = 'zzzzzz1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(() => normalizeEvmKey(badKey)).toThrow('Invalid EVM private key');
  });

  it('accepts uppercase hex', () => {
    const upper = validKey.toUpperCase();
    expect(normalizeEvmKey(upper)).toBe('0x' + upper);
  });
});

describe('ensureHexKey', () => {
  const validKey = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('returns 0x-prefixed string', () => {
    const result = ensureHexKey(validKey);
    expect(result.startsWith('0x')).toBe(true);
  });

  it('throws for invalid keys (same as normalizeEvmKey)', () => {
    expect(() => ensureHexKey('invalid')).toThrow('Invalid EVM private key');
  });
});
