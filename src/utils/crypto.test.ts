import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, DecryptionError } from './crypto.js';

describe('encrypt / decrypt', () => {
  const plaintext = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const password = 'testpassword123';

  it('encrypts and decrypts successfully', () => {
    const { encrypted, iv, salt, authTag } = encrypt(plaintext, password);
    const result = decrypt(encrypted, password, iv, salt, authTag);
    expect(result).toBe(plaintext);
  });

  it('produces different ciphertext each time (random salt/iv)', () => {
    const a = encrypt(plaintext, password);
    const b = encrypt(plaintext, password);
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });

  it('throws DecryptionError on wrong password', () => {
    const { encrypted, iv, salt, authTag } = encrypt(plaintext, password);
    expect(() => decrypt(encrypted, 'wrongpassword', iv, salt, authTag)).toThrow(DecryptionError);
  });

  it('throws DecryptionError on corrupted data', () => {
    const { encrypted, iv, salt, authTag } = encrypt(plaintext, password);
    const corrupted = encrypted.slice(0, -4) + 'ffff';
    expect(() => decrypt(corrupted, password, iv, salt, authTag)).toThrow(DecryptionError);
  });

  it('throws DecryptionError on tampered authTag', () => {
    const { encrypted, iv, salt, authTag } = encrypt(plaintext, password);
    const tamperedTag = authTag.slice(0, -4) + '0000';
    expect(() => decrypt(encrypted, password, iv, salt, tamperedTag)).toThrow(DecryptionError);
  });

  it('DecryptionError has correct name and message', () => {
    const err = new DecryptionError();
    expect(err.name).toBe('DecryptionError');
    expect(err.message).toContain('Wrong password or corrupted data');
    expect(err).toBeInstanceOf(Error);
  });
});
