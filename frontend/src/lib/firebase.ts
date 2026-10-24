import { initializeApp } from '@firebase/app';
import { getAuth, inMemoryPersistence, setPersistence } from '@firebase/auth';

const required = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) throw new Error(`Missing public Firebase configuration: ${missing.join(', ')}`);

export const firebaseAuth = getAuth(
  initializeApp({
    apiKey: required.apiKey!,
    authDomain: required.authDomain!,
    projectId: required.projectId!,
    appId: required.appId!,
    messagingSenderId: required.messagingSenderId!
  })
);
await setPersistence(firebaseAuth, inMemoryPersistence);
