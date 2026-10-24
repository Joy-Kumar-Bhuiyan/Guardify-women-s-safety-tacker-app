import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { FakeIdentity, cookiePair, testConfig } from './helpers.js';

describe('Guardify API security boundaries', () => {
  let store: MemoryStore;
  let identity: FakeIdentity;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new MemoryStore();
    identity = new FakeIdentity();
    app = createApp({ config: testConfig(), store, identity });
  });

  async function login(idToken: string) {
    const response = await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken, deviceName: 'Test browser' })
      .expect(201);
    const cookies = response.headers['set-cookie'];
    return {
      access: cookiePair(cookies, '__Host-guardify_access'),
      refresh: cookiePair(cookies, '__Secure-guardify_refresh')
    };
  }

  it('has separate liveness/readiness and secure headers', async () => {
    const response = await request(app).get('/healthz').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    await request(app).get('/readyz').expect(200, { status: 'ready' });
  });

  it('rejects unverified and invalid identities with generic messages', async () => {
    await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'token-unverified-that-is-long', deviceName: 'Test' })
      .expect(403);
    await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'invalid-token-that-is-long-enough', deviceName: 'Test' })
      .expect(401);
  });

  it('enforces authentication rate limits and request body limits', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/session')
        .send({ idToken: 'invalid-token-that-is-long-enough', deviceName: 'Test' })
        .expect(401);
    }
    await request(app)
      .post('/api/v1/auth/session')
      .send({ idToken: 'invalid-token-that-is-long-enough', deviceName: 'Test' })
      .expect(429);

    const separateApp = createApp({
      config: testConfig(),
      store: new MemoryStore(),
      identity: new FakeIdentity()
    });
    const oversized = JSON.stringify({ idToken: 'x'.repeat(40_000), deviceName: 'Test' });
    const response = await request(separateApp)
      .post('/api/v1/auth/session')
      .set('Content-Type', 'application/json')
      .send(oversized)
      .expect(413);
    expect(response.body.error.code).toBe('BODY_TOO_LARGE');
  });

  it('rotates refresh tokens and revokes a family on reuse', async () => {
    const session = await login('token-user-1-that-is-long-enough');
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.refresh).expect(200);
    const rotatedRefresh = cookiePair(first.headers['set-cookie'], '__Secure-guardify_refresh');
    expect(rotatedRefresh).not.toBe(session.refresh);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', session.refresh).expect(401);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', rotatedRefresh).expect(401);
  });

  it('requires authentication and rejects untrusted browser origins', async () => {
    await request(app).get('/api/v1/contacts').expect(401);
    const session = await login('token-user-1-that-is-long-enough');
    await request(app)
      .post('/api/v1/contacts')
      .set('Cookie', session.access)
      .set('Origin', 'https://evil.example')
      .send({ name: 'Trusted', phone: '+8801700000000', channels: ['sms'] })
      .expect(403);
  });

  it('enforces strict validation, contact ownership, opt-in, and SOS idempotency', async () => {
    const userOne = await login('token-user-1-that-is-long-enough');
    const userTwo = await login('token-user-2-that-is-long-enough');
    await request(app)
      .post('/api/v1/contacts')
      .set('Cookie', userOne.access)
      .send({ name: 'Bad', phone: '+8801700000000', channels: ['sms'], isAdmin: true })
      .expect(400);
    const created = await request(app)
      .post('/api/v1/contacts')
      .set('Cookie', userOne.access)
      .send({
        name: 'Trusted person',
        phone: '+8801700000000',
        email: 'trusted@example.test',
        channels: ['sms', 'email']
      })
      .expect(201);
    const contactId = created.body.data.contact.id as string;
    expect(created.body.data.contact.phone).toBe('+8801700000000');
    await request(app).delete(`/api/v1/contacts/${contactId}`).set('Cookie', userTwo.access).expect(404);
    await request(app)
      .post('/api/v1/shares')
      .set('Cookie', userOne.access)
      .send({ contactIds: [contactId], consentAccepted: true, purpose: 'Journey' })
      .expect(409);
    const optInToken = String(created.body.data.optInLink).split('/').pop();
    await request(app).post(`/api/v1/public/contacts/confirm/${optInToken}`).expect(200);
    const share = await request(app)
      .post('/api/v1/shares')
      .set('Cookie', userOne.access)
      .send({ contactIds: [contactId], consentAccepted: true, purpose: 'Journey' })
      .expect(201);
    expect(share.body.data.trackingUrl).toContain('/track/');
    const sosBody = {
      location: { latitude: 23.8103, longitude: 90.4125, accuracy: 15 },
      contactIds: [contactId]
    };
    const first = await request(app)
      .post('/api/v1/sos')
      .set('Cookie', userOne.access)
      .set('Idempotency-Key', 'test-emergency-0001')
      .send(sosBody)
      .expect(202);
    const replay = await request(app)
      .post('/api/v1/sos')
      .set('Cookie', userOne.access)
      .set('Idempotency-Key', 'test-emergency-0001')
      .send(sosBody)
      .expect(200);
    expect(replay.body.data).toEqual({ incidentId: first.body.data.incidentId, replayed: true });
    const location = JSON.stringify((await store.get('incidents', first.body.data.incidentId))?.location);
    expect(location).not.toContain('23.8103');
  });

  it('prevents non-admin access to abuse reports while allowing report submission', async () => {
    const user = await login('token-user-1-that-is-long-enough');
    const report = await request(app)
      .post('/api/v1/abuse-reports')
      .set('Cookie', user.access)
      .send({ category: 'stalking', details: 'A person is coercing me to keep sharing.' })
      .expect(201);
    await request(app).get('/api/v1/admin/abuse-reports').set('Cookie', user.access).expect(403);
    const admin = await login('token-admin-that-is-long-enough');
    const reports = await request(app)
      .get('/api/v1/admin/abuse-reports')
      .set('Cookie', admin.access)
      .expect(200);
    expect(reports.body.data[0].id).toBe(report.body.data.id);
  });
});
