import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { decryptJson, encryptJson, hashToken, randomToken, safeTokenEqual } from '../src/security/crypto.js';
import { testConfig } from './helpers.js';

describe('validated configuration', () => {
  it('rejects weak session secrets', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        APP_ORIGINS: 'https://guardify.example',
        PUBLIC_APP_URL: 'https://guardify.example',
        SESSION_SECRET: 'weak',
        DATA_ENCRYPTION_KEYS: `v1:${Buffer.alloc(32).toString('base64')}`,
        DATA_ACTIVE_KEY_ID: 'v1',
        FIREBASE_PROJECT_ID: 'test'
      })
    ).toThrow();
  });

  it('rejects wildcard production origins and invalid encryption keys', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        APP_ORIGINS: '*',
        PUBLIC_APP_URL: 'https://guardify.example',
        SESSION_SECRET: 'a'.repeat(40),
        DATA_ENCRYPTION_KEYS: 'v1:bad',
        DATA_ACTIVE_KEY_ID: 'v1',
        FIREBASE_PROJECT_ID: 'test'
      })
    ).toThrow();
  });
});

describe('sensitive field crypto', () => {
  it('round-trips authenticated ciphertext and detects tampering', () => {
    const config = testConfig();
    const encrypted = encryptJson(
      { latitude: 23.81, longitude: 90.41 },
      config.encryptionKeys,
      config.activeKeyId
    );
    expect(JSON.stringify(encrypted)).not.toContain('23.81');
    expect(decryptJson(encrypted, config.encryptionKeys)).toEqual({ latitude: 23.81, longitude: 90.41 });
    const tampered = `${encrypted.ciphertext[0] === 'A' ? 'B' : 'A'}${encrypted.ciphertext.slice(1)}`;
    expect(() => decryptJson({ ...encrypted, ciphertext: tampered }, config.encryptionKeys)).toThrow();
  });

  it('creates random tokens and uses timing-safe hash comparison', () => {
    const token = randomToken();
    const hash = hashToken(token);
    expect(token).toHaveLength(43);
    expect(safeTokenEqual(hash, token)).toBe(true);
    expect(safeTokenEqual(hash, `${token}x`)).toBe(false);
  });

  it('refuses encryption and decryption when the selected key is unavailable', () => {
    const config = testConfig();
    expect(() => encryptJson({ safe: true }, config.encryptionKeys, 'missing')).toThrow('unavailable');
    const encrypted = encryptJson({ safe: true }, config.encryptionKeys, config.activeKeyId);
    expect(() => decryptJson(encrypted, new Map())).toThrow('unavailable');
  });
});
