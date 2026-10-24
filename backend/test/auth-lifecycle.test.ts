import request from 'supertest';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { FakeIdentity, cookiePair, testConfig } from './helpers.js';

describe('session lifecycle', () => {
  it('lists and revokes devices, logs out, and logs out all sessions', async () => {
    const store = new MemoryStore();
    const app = createApp({ config: testConfig(), store, identity: new FakeIdentity() });
    const firstLogin = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-user-1-that-is-long-enough', deviceName: 'Phone' })
      .expect(201);
    const secondLogin = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-user-1-that-is-long-enough', deviceName: 'Laptop' })
      .expect(201);
    const firstAccess = cookiePair(firstLogin.headers['set-cookie'], '__Host-guardify_access');
    const secondAccess = cookiePair(secondLogin.headers['set-cookie'], '__Host-guardify_access');
    const sessions = await request(app).get('/api/v1/auth/sessions').set('Cookie', firstAccess).expect(200);
    expect(sessions.body.data).toHaveLength(2);
    const second = sessions.body.data.find(
      (session: { deviceName: string }) => session.deviceName === 'Laptop'
    );
    const otherUser = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-user-2-that-is-long-enough', deviceName: 'Other user' })
      .expect(201);
    const otherAccess = cookiePair(otherUser.headers['set-cookie'], '__Host-guardify_access');
    await request(app).delete(`/api/v1/auth/sessions/${second.id}`).set('Cookie', otherAccess).expect(404);
    await request(app).delete(`/api/v1/auth/sessions/${second.id}`).set('Cookie', firstAccess).expect(204);
    await request(app).get('/api/v1/me').set('Cookie', secondAccess).expect(401);
    await request(app).post('/api/v1/auth/logout').set('Cookie', firstAccess).expect(204);
    await request(app).get('/api/v1/me').set('Cookie', firstAccess).expect(401);

    const third = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-user-1-that-is-long-enough', deviceName: 'Tablet' })
      .expect(201);
    const fourth = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-user-1-that-is-long-enough', deviceName: 'Browser' })
      .expect(201);
    const thirdAccess = cookiePair(third.headers['set-cookie'], '__Host-guardify_access');
    const fourthAccess = cookiePair(fourth.headers['set-cookie'], '__Host-guardify_access');
    await request(app).post('/api/v1/auth/logout-all').set('Cookie', thirdAccess).expect(204);
    await request(app).get('/api/v1/me').set('Cookie', fourthAccess).expect(401);
  });

  it('rejects validly signed tokens with invalid claims and expired refresh sessions', async () => {
    const config = testConfig();
    const store = new MemoryStore();
    const app = createApp({ config, store, identity: new FakeIdentity() });
    const badClaims = await new SignJWT({ type: 'wrong' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('guardify-api')
      .setAudience('guardify-pwa')
      .setSubject('user-1')
      .setExpirationTime('15m')
      .sign(config.sessionSecret);
    await request(app).get('/api/v1/me').set('Cookie', `__Host-guardify_access=${badClaims}`).expect(401);

    const login = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-user-1-that-is-long-enough', deviceName: 'Expired' })
      .expect(201);
    const refresh = cookiePair(login.headers['set-cookie'], '__Secure-guardify_refresh');
    const sessions = await store.list('sessions', { userId: 'user-1' });
    await store.update('sessions', sessions[0]!.id, { expiresAt: '2000-01-01T00:00:00.000Z' });
    await request(app).post('/api/v1/auth/refresh').set('Cookie', refresh).expect(401);
    expect((await store.get('sessions', sessions[0]!.id))?.revokeReason).toBe('expired');
  });
});
