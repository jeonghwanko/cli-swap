import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount } from './amount.js';

describe('parseAmount', () => {
  it('converts whole number correctly', () => {
    expect(parseAmount('100', 6)).toBe('100000000');
  });

  it('converts decimal number correctly', () => {
    expect(parseAmount('1.5', 18)).toBe('1500000000000000000');
  });

  it('converts small decimal correctly', () => {
    expect(parseAmount('0.001', 18)).toBe('1000000000000000');
  });

  it('converts zero correctly', () => {
    expect(parseAmount('0', 18)).toBe('0');
  });

  it('handles exact decimal places', () => {
    expect(parseAmount('1.123456', 6)).toBe('1123456');
  });

  it('throws on too many decimal places', () => {
    expect(() => parseAmount('1.1234567', 6)).toThrow('has 7 decimal places');
  });

  it('throws on invalid input', () => {
    expect(() => parseAmount('abc', 18)).toThrow('Invalid amount');
  });

  it('throws on negative number', () => {
    expect(() => parseAmount('-1', 18)).toThrow('Invalid amount');
  });

  it('handles large amounts without precision loss', () => {
    expect(parseAmount('999999999999.999999', 6)).toBe('999999999999999999');
  });
});

describe('formatAmount', () => {
  it('formats large unit correctly', () => {
    expect(formatAmount('1500000000000000000', 18)).toBe('1.5');
  });

  it('formats whole token correctly', () => {
    expect(formatAmount('100000000', 6)).toBe('100');
  });

  it('formats tiny amount correctly', () => {
    expect(formatAmount('1000', 18)).toBe('0.000000000000001');
  });

  it('formats zero correctly', () => {
    expect(formatAmount('0', 18)).toBe('0.0');
  });

  it('strips trailing zeros from fractional part', () => {
    expect(formatAmount('1500000', 6)).toBe('1.5');
  });

  it('handles amount shorter than decimals', () => {
    expect(formatAmount('1', 6)).toBe('0.000001');
  });

  it('round-trips with parseAmount', () => {
    const original = '123.456789';
    const raw = parseAmount(original, 6);
    expect(formatAmount(raw, 6)).toBe(original);
  });

  it('round-trips large numbers', () => {
    const original = '999999999999.999999';
    const raw = parseAmount(original, 6);
    expect(formatAmount(raw, 6)).toBe(original);
  });
});
