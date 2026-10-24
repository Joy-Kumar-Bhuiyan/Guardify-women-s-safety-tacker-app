import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { MemoryStore } from '../src/store/memory.js';
import { FakeIdentity, cookiePair, testConfig } from './helpers.js';

describe('Guardify safety workflows', () => {
  let store: MemoryStore;
  let identity: FakeIdentity;
  let app: ReturnType<typeof createApp>;
  let access: string;
  let contactId: string;
  let optOutToken: string;

  afterEach(() => vi.unstubAllGlobals());

  beforeEach(async () => {
    store = new MemoryStore();
    identity = new FakeIdentity();
    app = createApp({ config: testConfig(), store, identity });
    const login = await request(app).post('/api/v1/auth/session').send({
      idToken: 'token-user-1-that-is-long-enough',
      deviceName: 'Safety test'
    });
    access = cookiePair(login.headers['set-cookie'], '__Host-guardify_access');
    const contact = await request(app)
      .post('/api/v1/contacts')
      .set('Cookie', access)
      .send({
        name: 'Trusted',
        phone: '+8801700000000',
        email: 'trusted@example.test',
        channels: ['sms', 'email']
      });
    contactId = contact.body.data.contact.id as string;
    optOutToken = String(contact.body.data.optOutLink).split('/').pop()!;
    const token = String(contact.body.data.optInLink).split('/').pop();
    await request(app).post(`/api/v1/public/contacts/confirm/${token}`).expect(200);
  });

  it('honors contact opt-out without exposing account information', async () => {
    const result = await request(app).post(`/api/v1/public/contacts/opt-out/${optOutToken}`).expect(200);
    expect(result.body).toEqual({ data: { optedOut: true } });
    expect((await store.get('contacts', contactId))?.confirmedAt).toBeNull();
  });

  it('returns nearby help and degrades safely when the map provider is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            { id: 1, lat: 23.81, lon: 90.41, tags: { amenity: 'police', name: 'Local police' } },
            { id: 2, center: { lat: 23.82, lon: 90.42 }, tags: { amenity: 'hospital' } },
            { id: 3, tags: { amenity: 'hospital' } }
          ]
        })
      })
    );
    const found = await request(app)
      .post('/api/v1/safety/nearby-help')
      .set('Cookie', access)
      .send({ latitude: 23.81, longitude: 90.41 })
      .expect(200);
    expect(found.body.data.points[0]).toMatchObject({ name: 'Local police', category: 'police' });
    expect(found.body.data.points[1]).toMatchObject({ name: 'Hospital', category: 'hospital' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const degraded = await request(app)
      .post('/api/v1/safety/nearby-help')
      .set('Cookie', access)
      .send({ latitude: 23.81, longitude: 90.41 })
      .expect(200);
    expect(degraded.body.data).toMatchObject({ points: [], degraded: true });
  });

  it('manages owner contacts and rejects missing resources', async () => {
    const listed = await request(app).get('/api/v1/contacts').set('Cookie', access).expect(200);
    expect(listed.body.data).toHaveLength(1);
    const updated = await request(app)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Cookie', access)
      .send({ name: 'Trusted person' })
      .expect(200);
    expect(updated.body.data.name).toBe('Trusted person');
    const destinationChanged = await request(app)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Cookie', access)
      .send({ phone: '+8801800000000' })
      .expect(200);
    expect(destinationChanged.body.data.confirmedAt).toBeNull();
    expect(destinationChanged.body.data.optInLink).toContain('/contact/confirm/');
    expect((await store.get('contacts', contactId))?.optInTokenHash).toBeTruthy();
    await request(app)
      .delete('/api/v1/contacts/00000000-0000-4000-8000-000000000000')
      .set('Cookie', access)
      .expect(404);
    await request(app).delete(`/api/v1/contacts/${contactId}`).set('Cookie', access).expect(204);
    await request(app).get('/api/v1/contacts').set('Cookie', access).expect(200, { data: [] });
  });

  it('starts, updates, exposes, acknowledges, and stops a consent-bound share', async () => {
    const started = await request(app)
      .post('/api/v1/shares')
      .set('Cookie', access)
      .send({ contactIds: [contactId], consentAccepted: true, purpose: 'Walk home', expiresInMinutes: 30 })
      .expect(201);
    const shareId = started.body.data.share.id as string;
    const token = String(started.body.data.trackingUrl).split('/').pop();
    await request(app)
      .put(`/api/v1/shares/${shareId}/location`)
      .set('Cookie', access)
      .send({ latitude: 23.7, longitude: 90.4, accuracy: 12, batteryLevel: 0.7 })
      .expect(200);
    const publicView = await request(app).get(`/api/v1/public/track/${token}`).expect(200);
    expect(publicView.body.data.location).toMatchObject({ latitude: 23.7, longitude: 90.4 });
    expect(publicView.headers['x-robots-tag']).toContain('noindex');
    expect(publicView.headers['cache-control']).toContain('no-store');
    await request(app).post(`/api/v1/public/track/${token}/acknowledge`).expect(200);
    const shares = await request(app).get('/api/v1/shares').set('Cookie', access).expect(200);
    expect(shares.body.data[0].lastLocationAt).toBeTruthy();
    await request(app).post(`/api/v1/shares/${shareId}/stop`).set('Cookie', access).expect(200);
    await request(app).get(`/api/v1/public/track/${token}`).expect(410);
  });

  it('runs kill switch and incident resolution/deletion', async () => {
    await request(app)
      .put('/api/v1/settings/safety-pin')
      .set('Cookie', access)
      .send({ safePin: '1234', duressPin: '9876' })
      .expect(204);
    await Promise.all(
      [1, 2].map(() =>
        request(app)
          .post('/api/v1/shares')
          .set('Cookie', access)
          .send({ contactIds: [contactId], consentAccepted: true, purpose: 'Safety share' })
          .expect(201)
      )
    );
    const killed = await request(app).post('/api/v1/shares/kill-switch').set('Cookie', access).expect(200);
    expect(killed.body.data.stoppedCount).toBe(2);
    const sos = await request(app)
      .post('/api/v1/sos')
      .set('Cookie', access)
      .set('Idempotency-Key', 'resolve-test-00001')
      .send({ location: { latitude: 23.7, longitude: 90.4 } })
      .expect(202);
    const incidentId = sos.body.data.incidentId as string;
    await request(app)
      .post(`/api/v1/sos/${incidentId}/resolve`)
      .set('Cookie', access)
      .send({ pin: '9876' })
      .expect(200);
    expect((await store.get('incidents', incidentId))?.status).toBe('active');
    await request(app)
      .post(`/api/v1/sos/${incidentId}/resolve`)
      .set('Cookie', access)
      .send({ pin: '1234' })
      .expect(200);
    const incidents = await request(app).get('/api/v1/incidents?limit=10').set('Cookie', access).expect(200);
    expect(incidents.body.data[0].status).toBe('resolved');
    await request(app).delete(`/api/v1/incidents/${incidentId}`).set('Cookie', access).expect(204);
  });

  it('creates and completes journeys and check-ins', async () => {
    const journey = await request(app)
      .post('/api/v1/journeys')
      .set('Cookie', access)
      .send({
        destination: 'Home',
        expectedArrivalAt: '2030-01-01T00:00:00.000Z',
        graceMinutes: 15,
        contactIds: [contactId],
        startLocation: { latitude: 23.7, longitude: 90.4 }
      })
      .expect(201);
    const journeyId = journey.body.data.id as string;
    expect(journey.body.data.startLocation).toBeUndefined();
    await request(app).get('/api/v1/journeys').set('Cookie', access).expect(200);
    const arrived = await request(app)
      .post(`/api/v1/journeys/${journeyId}/arrive`)
      .set('Cookie', access)
      .expect(200);
    expect(arrived.body.data.status).toBe('arrived');

    const checkin = await request(app)
      .post('/api/v1/checkins')
      .set('Cookie', access)
      .send({
        promptAt: '2030-01-01T00:00:00.000Z',
        graceMinutes: 10,
        contactIds: [contactId],
        note: 'After arrival'
      })
      .expect(201);
    const checkinId = checkin.body.data.id as string;
    await request(app).get('/api/v1/checkins').set('Cookie', access).expect(200);
    const completed = await request(app)
      .post(`/api/v1/checkins/${checkinId}/complete`)
      .set('Cookie', access)
      .expect(200);
    expect(completed.body.data.status).toBe('completed');
  });

  it('exports and erases the account and exposes emergency numbers', async () => {
    const profile = await request(app).get('/api/v1/me').set('Cookie', access).expect(200);
    expect(profile.body.data.id).toBe('user-1');
    const numbers = await request(app)
      .get('/api/v1/safety/emergency-numbers')
      .set('Cookie', access)
      .expect(200);
    expect(numbers.body.data[0].policeFireAmbulance).toBe('999');
    const exported = await request(app).get('/api/v1/privacy/export').set('Cookie', access).expect(200);
    expect(exported.headers['content-disposition']).toContain('guardify-export.json');
    expect(JSON.stringify(exported.body)).not.toContain('optInTokenHash');
    await request(app).delete('/api/v1/privacy/account').set('Cookie', access).expect(204);
    expect(identity.deleted).toEqual(['user-1']);
    expect(await store.get('users', 'user-1')).toBeNull();
  });
});
