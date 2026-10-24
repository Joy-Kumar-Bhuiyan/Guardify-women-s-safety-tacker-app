import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { AppConfig } from './config.js';
import { FirestoreStore } from './store/firestore.js';
import type { IdentityVerifier, Store } from './types.js';

function initialize(config: AppConfig): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const credential = config.firebaseServiceAccountKey
    ? cert(JSON.parse(config.firebaseServiceAccountKey.replace(/\\n/g, '\n')))
    : applicationDefault();
  return initializeApp({
    credential,
    projectId: config.firebaseProjectId,
    ...(config.firebaseDatabaseUrl ? { databaseURL: config.firebaseDatabaseUrl } : {})
  });
}

export function createFirebaseServices(config: AppConfig): { store: Store; identity: IdentityVerifier } {
  const app = initialize(config);
  const auth = getAuth(app);
  return {
    store: new FirestoreStore(getFirestore(app)),
    identity: {
      async verify(idToken) {
        const token = await auth.verifyIdToken(idToken, true);
        return {
          uid: token.uid,
          ...(token.email ? { email: token.email } : {}),
          emailVerified: token.email_verified === true || Boolean(token.phone_number),
          ...(token.name ? { name: token.name } : {}),
          role: token.role === 'admin' ? 'admin' : 'user'
        };
      },
      async deleteUser(uid) {
        await auth.deleteUser(uid);
      }
    }
  };
}
