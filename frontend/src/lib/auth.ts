import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile
} from '@firebase/auth';
import { reactive } from 'vue';
import { api } from './api';
import { firebaseAuth } from './firebase';

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  role: 'user' | 'admin';
}

export const authState = reactive<{ user: Profile | null; ready: boolean }>({ user: null, ready: false });

export async function restoreSession(): Promise<void> {
  try {
    authState.user = await api<Profile>('/me');
  } catch {
    authState.user = null;
  } finally {
    authState.ready = true;
  }
}

export async function login(email: string, password: string): Promise<void> {
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const idToken = await credential.user.getIdToken(true);
  const result = await api<{ user: Profile }>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({ idToken, deviceName: navigator.userAgent.slice(0, 80) })
  });
  authState.user = result.user;
  await firebaseSignOut(firebaseAuth);
}

export async function signup(name: string, email: string, password: string): Promise<void> {
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await sendEmailVerification(credential.user);
  await firebaseSignOut(firebaseAuth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth, email);
}

export async function logout(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    authState.user = null;
    await firebaseSignOut(firebaseAuth);
  }
}
