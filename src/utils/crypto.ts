import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

export class DecryptionError extends Error {
  constructor(message = 'Decryption failed. Wrong password or corrupted data.') {
    super(message);
    this.name = 'DecryptionError';
  }
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;

export function encrypt(plaintext: string, password: string): {
  encrypted: string;
  iv: string;
  salt: string;
  authTag: string;
} {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password, salt, KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decrypt(
  encrypted: string,
  password: string,
  ivHex: string,
  saltHex: string,
  authTagHex: string,
): string {
  const salt = Buffer.from(saltHex, 'hex');
  const key = scryptSync(password, salt, KEY_LENGTH);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new DecryptionError();
  }
}
