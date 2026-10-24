import { afterEach, describe, expect, it, vi } from 'vitest';
import { processNotificationJobs, runMaintenance } from '../src/jobs.js';
import {
  NotificationDispatcher,
  ResendEmailAdapter,
  TwilioSmsAdapter,
  type NotificationAdapter,
  type NotificationMessage
} from '../src/notifications.js';
import { MemoryStore } from '../src/store/memory.js';
import { encryptJson } from '../src/security/crypto.js';
import type { StoredValue } from '../src/types.js';
import { testConfig } from './helpers.js';

const message: NotificationMessage = {
  eventId: 'event',
  channel: 'sms',
  destination: '+8801700000000',
  template: 'sos',
  locale: 'en',
  variables: { trackingUrl: 'https://example.test/t' }
};

afterEach(() => vi.unstubAllGlobals());

describe('notification fallback behavior', () => {
  it('isolates provider failure so other channels still send', async () => {
    const failing: NotificationAdapter = {
      channel: 'sms',
      send: async () => {
        throw new Error('down');
      }
    };
    const email: NotificationAdapter = {
      channel: 'email',
      send: async () => ({ channel: 'email', status: 'sent', providerMessageId: 'm1' })
    };
    const dispatcher = new NotificationDispatcher([failing, email]);
    const results = await dispatcher.deliver([
      message,
      { ...message, channel: 'email', destination: 'safe@example.test' }
    ]);
    expect(results).toEqual([
      { channel: 'sms', status: 'failed', errorCode: 'PROVIDER_FAILURE' },
      { channel: 'email', status: 'sent', providerMessageId: 'm1' }
    ]);
  });

  it('sends provider requests with localized templates and provider IDs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ sid: 'sms-1', id: 'email-1' }) });
    vi.stubGlobal('fetch', fetchMock);
    const sms = new TwilioSmsAdapter('account', 'secret', '+15550000000');
    const email = new ResendEmailAdapter('resend-key', 'alerts@example.test');
    const templates: NotificationMessage['template'][] = [
      'contact_opt_in',
      'journey_overdue',
      'checkin_missed',
      'sharing_reminder',
      'sos'
    ];
    for (const template of templates) {
      await sms.send({
        ...message,
        template,
        variables:
          template === 'contact_opt_in'
            ? { optInUrl: 'https://example.test/in', optOutUrl: 'https://example.test/out' }
            : template === 'sos'
              ? {}
              : { trackingUrl: 'https://example.test/t' }
      });
    }
    const emailResult = await email.send({
      ...message,
      channel: 'email',
      destination: 'trusted@example.test'
    });
    expect(emailResult).toEqual({ channel: 'email', status: 'sent', providerMessageId: 'email-1' });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api.twilio.com');
    expect(String(fetchMock.mock.calls[5]?.[0])).toBe('https://api.resend.com/emails');
  });

  it('converts provider HTTP rejection into an isolated failed channel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const dispatcher = new NotificationDispatcher([
      new TwilioSmsAdapter('account', 'secret', '+15550000000'),
      new ResendEmailAdapter('resend-key', 'alerts@example.test')
    ]);
    const results = await dispatcher.deliver([
      message,
      { ...message, channel: 'email', destination: 'trusted@example.test' }
    ]);
    expect(results).toEqual([
      { channel: 'sms', status: 'failed', errorCode: 'PROVIDER_FAILURE' },
      { channel: 'email', status: 'failed', errorCode: 'PROVIDER_FAILURE' }
    ]);
  });

  it('accepts provider success responses that omit an external message ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(new TwilioSmsAdapter('account', 'secret', '+15550000000').send(message)).resolves.toEqual({
      channel: 'sms',
      status: 'sent'
    });
    await expect(
      new ResendEmailAdapter('resend-key', 'alerts@example.test').send({ ...message, channel: 'email' })
    ).resolves.toEqual({ channel: 'email', status: 'sent' });
  });
});

describe('maintenance job', () => {
  it('expires shares, purges retained incidents, and marks missed safety events', async () => {
    const store = new MemoryStore();
    const config = testConfig();
    const past = '2026-01-01T00:00:00.000Z';
    await store.create('contacts', 'contact-1', {
      id: 'contact-1',
      userId: 'u1',
      confirmedAt: past,
      channels: ['sms'],
      destination: encryptJson(
        { phone: '+8801700000000', email: null },
        config.encryptionKeys,
        config.activeKeyId
      ) as unknown as StoredValue
    });
    await store.create('shares', 's1', {
      id: 's1',
      status: 'active',
      expiresAt: past,
      location: 'encrypted'
    });
    await store.create('incidents', 'i1', { id: 'i1', deletionAfter: past });
    await store.create('journeys', 'j1', {
      id: 'j1',
      userId: 'u1',
      contactIds: ['contact-1'],
      status: 'active',
      expectedArrivalAt: past,
      graceMinutes: 5
    });
    await store.create('checkins', 'c1', {
      id: 'c1',
      userId: 'u1',
      contactIds: ['contact-1'],
      status: 'scheduled',
      promptAt: past,
      graceMinutes: 5
    });
    const result = await runMaintenance(config, store, new Date('2026-01-02T00:00:00.000Z'));
    expect(result).toEqual({
      expiredShares: 1,
      deletedIncidents: 1,
      overdueJourneys: 1,
      missedCheckins: 1,
      escalatedSos: 0
    });
    expect((await store.get('shares', 's1'))?.location).toBeNull();
    expect(await store.get('incidents', 'i1')).toBeNull();
    expect((await store.get('journeys', 'j1'))?.status).toBe('overdue');
    expect((await store.get('checkins', 'c1'))?.status).toBe('missed');
    expect((await store.get('notificationJobs', 'journey-overdue-j1'))?.status).toBe('pending');
    expect((await store.get('notificationJobs', 'checkin-missed-c1'))?.status).toBe('pending');

    const success: NotificationAdapter = {
      channel: 'sms',
      send: async () => ({ channel: 'sms', status: 'sent', providerMessageId: 'sent-1' })
    };
    const processed = await processNotificationJobs(
      config,
      store,
      new NotificationDispatcher([success]),
      new Date('2026-01-02T00:00:00.000Z')
    );
    expect(processed).toEqual({ processed: 2, sent: 2, deadLettered: 0 });
    expect((await store.get('notificationJobs', 'journey-overdue-j1'))?.status).toBe('sent');
  });

  it('moves repeatedly failing notification jobs to dead letter without exposing destinations', async () => {
    const store = new MemoryStore();
    const config = testConfig();
    await store.create('notificationJobs', 'job-1', {
      id: 'job-1',
      userId: 'u1',
      status: 'retrying',
      attempts: 4,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
      payload: encryptJson([message], config.encryptionKeys, config.activeKeyId) as unknown as StoredValue
    });
    const failing: NotificationAdapter = {
      channel: 'sms',
      send: async () => {
        throw new Error('down');
      }
    };
    const result = await processNotificationJobs(
      config,
      store,
      new NotificationDispatcher([failing]),
      new Date('2026-01-02T00:00:00.000Z')
    );
    expect(result).toEqual({ processed: 1, sent: 0, deadLettered: 1 });
    const job = await store.get('notificationJobs', 'job-1');
    expect(job?.status).toBe('dead_letter');
    expect(job?.payload).toBeNull();
    expect(JSON.stringify(job)).not.toContain('+8801700000000');
  });
});
