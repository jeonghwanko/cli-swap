/**
 * Convert human-readable amount to smallest unit (wei, lamports, etc.)
 * Uses string arithmetic to avoid floating-point precision loss.
 *
 * Examples:
 *   parseAmount("1.5", 18)   → "1500000000000000000"
 *   parseAmount("100", 6)    → "100000000"
 *   parseAmount("0.001", 18) → "1000000000000000"
 */
export function parseAmount(amount: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid amount: "${amount}". Must be a positive number.`);
  }

  const [intPart, fracPart = ''] = amount.split('.');

  if (fracPart.length > decimals) {
    throw new Error(
      `Amount "${amount}" has ${fracPart.length} decimal places, but token only supports ${decimals}.`,
    );
  }

  // Pad fractional part to `decimals` length, then concatenate
  const padded = fracPart.padEnd(decimals, '0');
  const raw = intPart + padded;

  // Remove leading zeros but keep at least "0"
  return raw.replace(/^0+/, '') || '0';
}

/**
 * Convert smallest unit back to human-readable string.
 * Uses string arithmetic to avoid floating-point precision loss.
 *
 * Examples:
 *   formatAmount("1500000000000000000", 18) → "1.5"
 *   formatAmount("100000000", 6)            → "100.0"
 *   formatAmount("1000", 18)                → "0.000000000000001"
 */
export function formatAmount(raw: string, decimals: number): string {
  // Remove leading zeros
  raw = raw.replace(/^0+/, '') || '0';

  if (raw.length <= decimals) {
    // Pad left with zeros: "1000" with 18 decimals → "0.000000000000001000"
    const padded = raw.padStart(decimals, '0');
    const trimmed = padded.replace(/0+$/, '') || '0';
    return '0.' + trimmed.padStart(1, '0');
  }

  const intPart = raw.slice(0, raw.length - decimals);
  const fracPart = raw.slice(raw.length - decimals).replace(/0+$/, '');

  if (!fracPart) return intPart;
  return `${intPart}.${fracPart}`;
}
