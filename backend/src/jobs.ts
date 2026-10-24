import type { AppConfig } from './config.js';
import type { NotificationChannel, NotificationDispatcher, NotificationMessage } from './notifications.js';
import { decryptJson, encryptJson, type EncryptedValue } from './security/crypto.js';
import type { Store, StoredRecord, StoredValue } from './types.js';

async function escalationMessages(
  config: AppConfig,
  store: Store,
  record: StoredRecord,
  template: 'journey_overdue' | 'checkin_missed' | 'sos'
): Promise<NotificationMessage[]> {
  const messages: NotificationMessage[] = [];
  for (const id of (record.contactIds ?? []) as string[]) {
    const contact = await store.get('contacts', id);
    if (!contact?.confirmedAt || !contact.destination) continue;
    const destination = decryptJson<{ phone: string | null; email: string | null }>(
      contact.destination as unknown as EncryptedValue,
      config.encryptionKeys
    );
    for (const channel of contact.channels as NotificationChannel[]) {
      const target = channel === 'sms' ? destination.phone : channel === 'email' ? destination.email : null;
      if (target)
        messages.push({
          eventId: record.id,
          channel,
          destination: target,
          template,
          locale: 'en',
          variables: {}
        });
    }
  }
  return messages;
}

function queuedJob(
  config: AppConfig,
  record: StoredRecord,
  type: 'journey_overdue' | 'checkin_missed' | 'sos_escalation',
  messages: NotificationMessage[],
  now: Date
): StoredRecord {
  return {
    id: `${type.replace('_', '-')}-${record.id}`,
    userId: record.userId,
    type,
    sourceId: record.id,
    status: messages.length ? 'pending' : 'no_recipients',
    attempts: 0,
    payload: messages.length
      ? (encryptJson(messages, config.encryptionKeys, config.activeKeyId) as unknown as StoredValue)
      : null,
    nextAttemptAt: messages.length ? now.toISOString() : null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export async function runMaintenance(
  config: AppConfig,
  store: Store,
  now = new Date()
): Promise<{
  expiredShares: number;
  deletedIncidents: number;
  overdueJourneys: number;
  missedCheckins: number;
  escalatedSos: number;
}> {
  const activeShares = await store.list('shares', { status: 'active' }, { limit: 500 });
  const expired = activeShares.filter(
    (share) => new Date(String(share.expiresAt)).getTime() <= now.getTime()
  );
  await Promise.all(
    expired.map((share) =>
      store.update('shares', share.id, {
        status: 'expired',
        stoppedAt: now.toISOString(),
        location: null
      })
    )
  );

  const incidents = await store.list('incidents', {}, { limit: 500 });
  const oldIncidents = incidents.filter(
    (incident) =>
      incident.deletionAfter && new Date(String(incident.deletionAfter)).getTime() <= now.getTime()
  );
  await Promise.all(oldIncidents.map((incident) => store.delete('incidents', incident.id)));

  const journeys = await store.list('journeys', { status: 'active' }, { limit: 500 });
  const overdue = journeys.filter((journey) => {
    const deadline =
      new Date(String(journey.expectedArrivalAt)).getTime() + Number(journey.graceMinutes) * 60_000;
    return deadline <= now.getTime();
  });
  await Promise.all(
    overdue.map((journey) =>
      store.update('journeys', journey.id, {
        status: 'overdue',
        escalatedAt: now.toISOString()
      })
    )
  );
  await Promise.all(
    overdue.map(async (journey) => {
      const messages = await escalationMessages(config, store, journey, 'journey_overdue');
      const job = queuedJob(config, journey, 'journey_overdue', messages, now);
      await store.set('notificationJobs', job.id, job);
    })
  );

  const checkins = await store.list('checkins', { status: 'scheduled' }, { limit: 500 });
  const missed = checkins.filter((checkin) => {
    const deadline = new Date(String(checkin.promptAt)).getTime() + Number(checkin.graceMinutes) * 60_000;
    return deadline <= now.getTime();
  });
  await Promise.all(
    missed.map((checkin) =>
      store.update('checkins', checkin.id, {
        status: 'missed',
        escalatedAt: now.toISOString()
      })
    )
  );
  await Promise.all(
    missed.map(async (checkin) => {
      const messages = await escalationMessages(config, store, checkin, 'checkin_missed');
      const job = queuedJob(config, checkin, 'checkin_missed', messages, now);
      await store.set('notificationJobs', job.id, job);
    })
  );

  const activeIncidents = await store.list('incidents', { status: 'active' }, { limit: 500 });
  const unacknowledged = [] as Array<{ incident: StoredRecord; share: StoredRecord }>;
  for (const incident of activeIncidents) {
    if (incident.escalatedAt || new Date(String(incident.createdAt)).getTime() + 5 * 60_000 > now.getTime())
      continue;
    const share = incident.shareId ? await store.get('shares', String(incident.shareId)) : null;
    if (share && share.status === 'active' && !share.acknowledgedAt) unacknowledged.push({ incident, share });
  }
  await Promise.all(
    unacknowledged.map(async ({ incident, share }) => {
      const messages = await escalationMessages(config, store, share, 'sos');
      const job = queuedJob(config, incident, 'sos_escalation', messages, now);
      await store.set('notificationJobs', job.id, job);
      await store.update('incidents', incident.id, { escalatedAt: now.toISOString() });
    })
  );

  return {
    expiredShares: expired.length,
    deletedIncidents: oldIncidents.length,
    overdueJourneys: overdue.length,
    missedCheckins: missed.length,
    escalatedSos: unacknowledged.length
  };
}

export async function processNotificationJobs(
  config: AppConfig,
  store: Store,
  notifications: NotificationDispatcher,
  now = new Date()
): Promise<{ processed: number; sent: number; deadLettered: number }> {
  const jobs = await store.list(
    'notificationJobs',
    {},
    { limit: 500, orderBy: 'nextAttemptAt', direction: 'asc' }
  );
  const due = jobs.filter(
    (job) =>
      job.payload &&
      ['pending', 'retrying', 'pending_provider_configuration'].includes(String(job.status)) &&
      new Date(String(job.nextAttemptAt)).getTime() <= now.getTime()
  );
  let sent = 0;
  let deadLettered = 0;
  for (const job of due) {
    const messages = decryptJson<NotificationMessage[]>(
      job.payload as unknown as EncryptedValue,
      config.encryptionKeys
    );
    const delivery = await notifications.deliver(messages);
    const remaining = messages.filter((_message, index) => delivery[index]?.status !== 'sent');
    const hasFailure = delivery.some((result) => result.status === 'failed');
    const hasDisabled = delivery.some((result) => result.status === 'disabled');
    const attempts = Number(job.attempts ?? 0) + (hasFailure ? 1 : 0);
    const deadLetter = hasFailure && attempts >= 5;
    if (remaining.length === 0) sent += 1;
    if (deadLetter) deadLettered += 1;
    await store.update('notificationJobs', job.id, {
      status:
        remaining.length === 0
          ? 'sent'
          : deadLetter
            ? 'dead_letter'
            : hasDisabled && !hasFailure
              ? 'pending_provider_configuration'
              : 'retrying',
      attempts,
      delivery: delivery as unknown as StoredValue,
      payload:
        remaining.length && !deadLetter
          ? (encryptJson(remaining, config.encryptionKeys, config.activeKeyId) as unknown as StoredValue)
          : null,
      nextAttemptAt:
        remaining.length && !deadLetter
          ? new Date(
              now.getTime() +
                (hasDisabled && !hasFailure
                  ? 3_600_000
                  : Math.min(3_600_000, 60_000 * 2 ** Math.max(0, attempts - 1)))
            ).toISOString()
          : null,
      updatedAt: now.toISOString()
    });
  }
  return { processed: due.length, sent, deadLettered };
}
