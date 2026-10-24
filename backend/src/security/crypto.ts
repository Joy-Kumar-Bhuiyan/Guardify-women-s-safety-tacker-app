import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface EncryptedValue {
  version: 1;
  keyId: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

export function safeTokenEqual(expectedHash: string, candidate: string): boolean {
  const expected = Buffer.from(expectedHash, 'utf8');
  const actual = Buffer.from(hashToken(candidate), 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function encryptJson(value: unknown, keys: Map<string, Buffer>, activeKeyId: string): EncryptedValue {
  const key = keys.get(activeKeyId);
  if (!key) throw new Error('Active encryption key is unavailable');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`guardify:${activeKeyId}:v1`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    version: 1,
    keyId: activeKeyId,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

export function decryptJson<T>(value: EncryptedValue, keys: Map<string, Buffer>): T {
  const key = keys.get(value.keyId);
  if (!key) throw new Error('Encryption key is unavailable');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));
  decipher.setAAD(Buffer.from(`guardify:${value.keyId}:v1`, 'utf8'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}
