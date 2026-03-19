/**
 * Shared validation utilities (SSOT for key validation)
 */

/**
 * Normalize and validate an EVM private key.
 * Ensures 0x prefix and 64 hex characters.
 */
export function normalizeEvmKey(key: string): string {
  const normalized = key.startsWith('0x') ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('Invalid EVM private key. Must be 64 hex characters (with or without 0x prefix).');
  }
  return normalized;
}

/** Type-safe version for viem (returns branded 0x string) */
export function ensureHexKey(key: string): `0x${string}` {
  return normalizeEvmKey(key) as `0x${string}`;
}
