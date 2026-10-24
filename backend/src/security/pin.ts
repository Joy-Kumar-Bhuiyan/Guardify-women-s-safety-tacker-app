import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

function derivePin(pin: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(pin, salt, 32, { N: 16_384, r: 8, p: 1 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashPin(
  pin: string,
  salt = randomBytes(16).toString('base64url')
): Promise<{ salt: string; hash: string }> {
  const derived = await derivePin(pin, salt);
  return { salt, hash: derived.toString('base64url') };
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = await derivePin(pin, salt);
  const expected = Buffer.from(expectedHash, 'base64url');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
