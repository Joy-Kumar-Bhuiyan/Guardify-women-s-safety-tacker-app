import type { AppConfig } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import type { Identity, IdentityVerifier } from '../src/types.js';

export function testConfig(): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    PORT: '5001',
    TRUST_PROXY: '0',
    APP_ORIGINS: 'http://localhost:5173',
    PUBLIC_APP_URL: 'http://localhost:5173',
    SESSION_SECRET: 'test-session-secret-that-is-longer-than-32-characters',
    DATA_ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 7).toString('base64')}`,
    DATA_ACTIVE_KEY_ID: 'v1',
    FIREBASE_PROJECT_ID: 'guardify-test',
    COOKIE_SECURE: 'false'
  });
}

export class FakeIdentity implements IdentityVerifier {
  readonly deleted: string[] = [];
  private readonly identities = new Map<string, Identity>([
    [
      'token-user-1-that-is-long-enough',
      { uid: 'user-1', email: 'one@example.test', emailVerified: true, name: 'One', role: 'user' }
    ],
    [
      'token-user-2-that-is-long-enough',
      { uid: 'user-2', email: 'two@example.test', emailVerified: true, name: 'Two', role: 'user' }
    ],
    [
      'token-unverified-that-is-long',
      { uid: 'user-3', email: 'three@example.test', emailVerified: false, name: 'Three', role: 'user' }
    ],
    [
      'token-admin-that-is-long-enough',
      { uid: 'admin-1', email: 'admin@example.test', emailVerified: true, name: 'Admin', role: 'admin' }
    ]
  ]);

  async verify(idToken: string): Promise<Identity> {
    const identity = this.identities.get(idToken);
    if (!identity) throw new Error('invalid');
    return identity;
  }

  async deleteUser(uid: string): Promise<void> {
    this.deleted.push(uid);
  }
}

export function cookiePair(setCookie: string | string[] | undefined, name: string): string {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = values.find((value) => value.startsWith(`${name}=`));
  if (!match) throw new Error(`Missing cookie ${name}`);
  return match.split(';')[0]!;
}
