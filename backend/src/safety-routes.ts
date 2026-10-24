import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { AppError, asyncRoute, validate } from './http/errors.js';
import {
  checkinCreateSchema,
  contactCreateSchema,
  contactUpdateSchema,
  idParams,
  journeyCreateSchema,
  locationSchema,
  nearbyHelpSchema,
  paginationQuery,
  shareStartSchema,
  sosSchema,
  tokenParams
} from './http/schemas.js';
import type {
  DeliveryResult,
  NotificationChannel,
  NotificationDispatcher,
  NotificationMessage
} from './notifications.js';
import { decryptJson, encryptJson, hashToken, randomToken, type EncryptedValue } from './security/crypto.js';
import { hashPin, verifyPin } from './security/pin.js';
import type { IdentityVerifier, Store, StoredRecord, StoredValue } from './types.js';

type Location = z.infer<typeof locationSchema>;
type ContactPayload = z.infer<typeof contactCreateSchema>;

function ownerId(request: { auth?: { id: string } }): string {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
  return request.auth.id;
}

async function owned(store: Store, collection: string, id: string, userId: string): Promise<StoredRecord> {
  const record = await store.get(collection, id);
  if (!record || record.userId !== userId)
    throw new AppError(404, 'NOT_FOUND', 'The requested resource was not found');
  return record;
}

function normalizeContact(payload: ContactPayload): { phone: string | null; email: string | null } {
  let phone: string | null = null;
  if (payload.phone) {
    const parsed = parsePhoneNumberFromString(payload.phone, 'BD');
    if (!parsed?.isValid())
      throw new AppError(400, 'PHONE_INVALID', 'Use a valid international phone number');
    phone = parsed.number;
  }
  return { phone, email: payload.email?.toLowerCase() ?? null };
}

function contactView(record: StoredRecord, config: AppConfig) {
  const destination = decryptJson<{ phone: string | null; email: string | null }>(
    record.destination as unknown as EncryptedValue,
    config.encryptionKeys
  );
  return {
    id: record.id,
    name: record.name,
    phone: destination.phone,
    email: destination.email,
    channels: record.channels,
    confirmedAt: record.confirmedAt,
    createdAt: record.createdAt
  };
}

function shareView(record: StoredRecord) {
  return {
    id: record.id,
    purpose: record.purpose,
    status: record.status,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    stoppedAt: record.stoppedAt,
    contactIds: record.contactIds,
    lastLocationAt: record.lastLocationAt
  };
}

function publicShareView(record: StoredRecord, config: AppConfig) {
  const location = record.location
    ? decryptJson<Location>(record.location as unknown as EncryptedValue, config.encryptionKeys)
    : null;
  return {
    purpose: record.purpose,
    expiresAt: record.expiresAt,
    lastLocationAt: record.lastLocationAt,
    location
  };
}

async function activePublicShare(store: Store, token: string): Promise<StoredRecord> {
  const shares = await store.list('shares', { tokenHash: hashToken(token) }, { limit: 2 });
  const share = shares[0];
  if (!share || share.status !== 'active' || new Date(String(share.expiresAt)).getTime() <= Date.now()) {
    throw new AppError(410, 'SHARE_INACTIVE', 'This sharing link is inactive or expired');
  }
  return share;
}

function notificationJobPatch(
  config: AppConfig,
  messages: NotificationMessage[],
  delivery: DeliveryResult[],
  attempts: number,
  now = new Date()
): Partial<StoredRecord> {
  const remaining = messages.filter((_message, index) => delivery[index]?.status !== 'sent');
  const hasFailure = delivery.some((result) => result.status === 'failed');
  const allSent = messages.length > 0 && remaining.length === 0;
  return {
    status:
      messages.length === 0
        ? 'no_recipients'
        : allSent
          ? 'sent'
          : hasFailure
            ? 'retrying'
            : 'pending_provider_configuration',
    attempts,
    delivery: delivery as unknown as StoredValue,
    payload: remaining.length
      ? (encryptJson(remaining, config.encryptionKeys, config.activeKeyId) as unknown as StoredValue)
      : null,
    nextAttemptAt: remaining.length
      ? new Date(now.getTime() + (hasFailure ? 60_000 : 3_600_000)).toISOString()
      : null,
    updatedAt: now.toISOString()
  };
}

export function createPublicSafetyRouter(config: AppConfig, store: Store): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  router.post(
    '/contacts/confirm/:token',
    validate({ params: tokenParams }),
    asyncRoute(async (request, response) => {
      const { token } = request.validated?.params as { token: string };
      const records = await store.list('contacts', { optInTokenHash: hashToken(token) }, { limit: 2 });
      const contact = records[0];
      if (
        !contact ||
        contact.confirmedAt ||
        new Date(String(contact.optInExpiresAt)).getTime() <= Date.now()
      ) {
        throw new AppError(410, 'LINK_INVALID', 'This confirmation link is invalid or expired');
      }
      await store.update('contacts', contact.id, {
        confirmedAt: new Date().toISOString(),
        optInTokenHash: null,
        optInExpiresAt: null
      });
      response.json({
        data: { confirmed: true, message: 'You will now receive Guardify safety alerts for this person.' }
      });
    })
  );

  router.post(
    '/contacts/opt-out/:token',
    validate({ params: tokenParams }),
    asyncRoute(async (request, response) => {
      const { token } = request.validated?.params as { token: string };
      const records = await store.list('contacts', { optOutTokenHash: hashToken(token) }, { limit: 2 });
      const contact = records[0];
      if (!contact) throw new AppError(410, 'LINK_INVALID', 'This opt-out link is invalid');
      await store.update('contacts', contact.id, { confirmedAt: null, optedOutAt: new Date().toISOString() });
      response.json({ data: { optedOut: true } });
    })
  );

  router.get(
    '/track/:token',
    validate({ params: tokenParams }),
    asyncRoute(async (request, response) => {
      const { token } = request.validated?.params as { token: string };
      const share = await activePublicShare(store, token);
      response.json({ data: publicShareView(share, config) });
    })
  );

  router.get(
    '/track/:token/events',
    validate({ params: tokenParams }),
    asyncRoute(async (request, response) => {
      const { token } = request.validated?.params as { token: string };
      await activePublicShare(store, token);
      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders();
      let writable = true;
      let closed = false;

      const send = async (): Promise<void> => {
        if (closed || !writable) return;
        try {
          const share = await activePublicShare(store, token);
          writable = response.write(
            `event: location\ndata: ${JSON.stringify(publicShareView(share, config))}\n\n`
          );
        } catch {
          response.write('event: revoked\ndata: {}\n\n');
          response.end();
        }
      };
      response.on('drain', () => {
        writable = true;
      });
      await send();
      const updates = setInterval(() => void send(), 5_000);
      const heartbeat = setInterval(() => {
        if (writable && !closed) writable = response.write(': heartbeat\n\n');
      }, 15_000);
      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(updates);
        clearInterval(heartbeat);
      };
      request.on('close', cleanup);
      response.on('close', cleanup);
    })
  );

  router.post(
    '/track/:token/acknowledge',
    validate({ params: tokenParams }),
    asyncRoute(async (request, response) => {
      const { token } = request.validated?.params as { token: string };
      const shares = await store.list('shares', { tokenHash: hashToken(token) }, { limit: 2 });
      const share = shares[0];
      if (!share || share.status !== 'active' || new Date(String(share.expiresAt)).getTime() <= Date.now()) {
        throw new AppError(410, 'SHARE_INACTIVE', 'This sharing link is inactive or expired');
      }
      await store.update('shares', share.id, { acknowledgedAt: new Date().toISOString() });
      response.json({ data: { acknowledged: true } });
    })
  );
  return router;
}

export function createSafetyRouter(
  config: AppConfig,
  store: Store,
  notifications: NotificationDispatcher,
  identity: IdentityVerifier
): Router {
  const router = Router();

  router.get(
    '/me',
    asyncRoute(async (request, response) => {
      const user = await store.get('users', ownerId(request));
      if (!user) throw new AppError(404, 'NOT_FOUND', 'User profile not found');
      response.json({ data: { id: user.id, email: user.email, name: user.name, role: user.role } });
    })
  );

  router.put(
    '/settings/safety-pin',
    validate({
      body: z
        .strictObject({
          safePin: z.string().regex(/^\d{4,8}$/),
          duressPin: z.string().regex(/^\d{4,8}$/)
        })
        .refine((value) => value.safePin !== value.duressPin, { message: 'Pins must be different' })
    }),
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const { safePin, duressPin } = request.validated?.body as { safePin: string; duressPin: string };
      const safe = await hashPin(safePin);
      const duress = await hashPin(duressPin);
      await store.set('safetySettings', userId, {
        id: userId,
        userId,
        safePinSalt: safe.salt,
        safePinHash: safe.hash,
        duressPinSalt: duress.salt,
        duressPinHash: duress.hash,
        updatedAt: new Date().toISOString()
      });
      response.status(204).end();
    })
  );

  router.get(
    '/contacts',
    asyncRoute(async (request, response) => {
      const contacts = await store.list(
        'contacts',
        { userId: ownerId(request) },
        { limit: 10, orderBy: 'createdAt', direction: 'desc' }
      );
      response.json({ data: contacts.map((contact) => contactView(contact, config)) });
    })
  );

  router.post(
    '/contacts',
    validate({ body: contactCreateSchema }),
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const current = await store.list('contacts', { userId }, { limit: 11 });
      if (current.length >= 10)
        throw new AppError(409, 'CONTACT_LIMIT', 'A maximum of 10 emergency contacts is allowed');
      const payload = request.validated?.body as ContactPayload;
      const destination = normalizeContact(payload);
      const id = randomUUID();
      const optInToken = randomToken();
      const optOutToken = randomToken();
      const record: StoredRecord = {
        id,
        userId,
        name: payload.name,
        destination: encryptJson(
          destination,
          config.encryptionKeys,
          config.activeKeyId
        ) as unknown as StoredValue,
        channels: payload.channels as StoredValue,
        confirmedAt: null,
        optedOutAt: null,
        optInTokenHash: hashToken(optInToken),
        optInExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        optOutTokenHash: hashToken(optOutToken),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await store.create('contacts', id, record);
      const optInUrl = `${config.publicAppUrl}/contact/confirm/${optInToken}`;
      const optOutUrl = `${config.publicAppUrl}/contact/opt-out/${optOutToken}`;
      const messages: NotificationMessage[] = payload.channels
        .filter((channel): channel is NotificationChannel => channel !== 'push')
        .flatMap((channel) => {
          const target = channel === 'sms' ? destination.phone : destination.email;
          return target
            ? [
                {
                  eventId: id,
                  channel,
                  destination: target,
                  template: 'contact_opt_in' as const,
                  locale: 'en' as const,
                  variables: { optInUrl, optOutUrl }
                }
              ]
            : [];
        });
      const delivery = await notifications.deliver(messages);
      await store.set('notificationJobs', id, {
        id,
        userId,
        type: 'contact_opt_in',
        createdAt: new Date().toISOString(),
        ...notificationJobPatch(config, messages, delivery, 1)
      });
      response.status(201).json({
        data: {
          contact: contactView(record, config),
          optInLink: config.nodeEnv === 'production' ? undefined : optInUrl,
          optOutLink: config.nodeEnv === 'production' ? undefined : optOutUrl,
          delivery
        }
      });
    })
  );

  router.patch(
    '/contacts/:id',
    validate({ params: idParams, body: contactUpdateSchema }),
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const { id } = request.validated?.params as { id: string };
      const current = await owned(store, 'contacts', id, userId);
      const patch = request.validated?.body as Partial<ContactPayload>;
      const existingDestination = decryptJson<{ phone: string | null; email: string | null }>(
        current.destination as unknown as EncryptedValue,
        config.encryptionKeys
      );
      const combined = {
        name: patch.name ?? String(current.name),
        phone: patch.phone ?? existingDestination.phone ?? undefined,
        email: patch.email ?? existingDestination.email ?? undefined,
        channels: patch.channels ?? (current.channels as NotificationChannel[])
      };
      const destination = normalizeContact(combined);
      const changed =
        destination.phone !== existingDestination.phone || destination.email !== existingDestination.email;
      const optInToken = changed ? randomToken() : null;
      const optOutToken = changed ? randomToken() : null;
      const updated = await store.update('contacts', id, {
        name: combined.name,
        channels: combined.channels as StoredValue,
        destination: encryptJson(
          destination,
          config.encryptionKeys,
          config.activeKeyId
        ) as unknown as StoredValue,
        updatedAt: new Date().toISOString(),
        ...(changed && optInToken && optOutToken
          ? {
              confirmedAt: null,
              optedOutAt: null,
              optInTokenHash: hashToken(optInToken),
              optInExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
              optOutTokenHash: hashToken(optOutToken)
            }
          : {})
      });
      const optInUrl = optInToken ? `${config.publicAppUrl}/contact/confirm/${optInToken}` : null;
      if (changed && optInUrl && optOutToken) {
        const optOutUrl = `${config.publicAppUrl}/contact/opt-out/${optOutToken}`;
        const messages: NotificationMessage[] = combined.channels
          .filter((channel): channel is NotificationChannel => channel !== 'push')
          .flatMap((channel) => {
            const target = channel === 'sms' ? destination.phone : destination.email;
            return target
              ? [
                  {
                    eventId: id,
                    channel,
                    destination: target,
                    template: 'contact_opt_in' as const,
                    locale: 'en' as const,
                    variables: { optInUrl, optOutUrl }
                  }
                ]
              : [];
          });
        const delivery = await notifications.deliver(messages);
        const jobId = `contact-update-${id}-${Date.now()}`;
        await store.set('notificationJobs', jobId, {
          id: jobId,
          userId,
          type: 'contact_opt_in',
          createdAt: new Date().toISOString(),
          ...notificationJobPatch(config, messages, delivery, 1)
        });
      }
      response.json({
        data: {
          ...contactView(updated, config),
          optInLink: config.nodeEnv === 'production' ? undefined : optInUrl
        }
      });
    })
  );

  router.delete(
    '/contacts/:id',
    validate({ params: idParams }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      await owned(store, 'contacts', id, ownerId(request));
      await store.delete('contacts', id);
      response.status(204).end();
    })
  );

  router.post(
    '/shares',
    validate({ body: shareStartSchema }),
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const payload = request.validated?.body as z.infer<typeof shareStartSchema>;
      const contacts = await Promise.all(
        payload.contactIds.map((id) => owned(store, 'contacts', id, userId))
      );
      if (contacts.some((contact) => !contact.confirmedAt)) {
        throw new AppError(409, 'CONTACT_UNCONFIRMED', 'All selected contacts must opt in first');
      }
      const token = randomToken();
      const id = randomUUID();
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + (payload.expiresInMinutes ?? config.shareDefaultTtlMinutes) * 60_000
      ).toISOString();
      const record: StoredRecord = {
        id,
        userId,
        tokenHash: hashToken(token),
        contactIds: payload.contactIds as StoredValue,
        purpose: payload.purpose,
        status: 'active',
        location: null,
        lastLocationAt: null,
        acknowledgedAt: null,
        createdAt: now.toISOString(),
        expiresAt,
        stoppedAt: null
      };
      await store.create('shares', id, record);
      await store.create('consentLogs', randomUUID(), {
        id: randomUUID(),
        userId,
        action: 'share_started',
        shareId: id,
        audienceCount: payload.contactIds.length,
        recordedAt: now.toISOString()
      });
      response
        .status(201)
        .json({ data: { share: shareView(record), trackingUrl: `${config.publicAppUrl}/track/${token}` } });
    })
  );

  router.get(
    '/shares',
    asyncRoute(async (request, response) => {
      const shares = await store.list(
        'shares',
        { userId: ownerId(request) },
        { limit: 100, orderBy: 'createdAt', direction: 'desc' }
      );
      response.json({ data: shares.map(shareView) });
    })
  );

  router.put(
    '/shares/:id/location',
    validate({ params: idParams, body: locationSchema }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      const share = await owned(store, 'shares', id, ownerId(request));
      if (share.status !== 'active' || new Date(String(share.expiresAt)).getTime() <= Date.now()) {
        throw new AppError(409, 'SHARE_INACTIVE', 'This share is not active');
      }
      const now = new Date().toISOString();
      await store.update('shares', id, {
        location: encryptJson(
          request.validated?.body,
          config.encryptionKeys,
          config.activeKeyId
        ) as unknown as StoredValue,
        lastLocationAt: now
      });
      response.json({ data: { accepted: true, recordedAt: now } });
    })
  );

  router.post(
    '/shares/:id/stop',
    validate({ params: idParams }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      await owned(store, 'shares', id, ownerId(request));
      await store.update('shares', id, {
        status: 'stopped',
        stoppedAt: new Date().toISOString(),
        location: null
      });
      response.json({ data: { stopped: true } });
    })
  );

  router.post(
    '/shares/kill-switch',
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const shares = await store.list('shares', { userId, status: 'active' }, { limit: 100 });
      await Promise.all(
        shares.map((share) =>
          store.update('shares', share.id, {
            status: 'stopped',
            stoppedAt: new Date().toISOString(),
            location: null
          })
        )
      );
      response.json({ data: { stoppedCount: shares.length } });
    })
  );

  router.post(
    '/sos',
    validate({ body: sosSchema }),
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const idempotencyKey = request.get('Idempotency-Key');
      if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
        throw new AppError(400, 'IDEMPOTENCY_REQUIRED', 'A valid Idempotency-Key header is required');
      }
      const replayId = hashToken(`${userId}:${idempotencyKey}`);
      const replay = await store.get('idempotency', replayId);
      if (replay) {
        response.status(200).json({ data: { incidentId: replay.incidentId, replayed: true } });
        return;
      }
      const payload = request.validated?.body as z.infer<typeof sosSchema>;
      const allContacts = await store.list('contacts', { userId }, { limit: 10 });
      const selected = payload.contactIds?.length
        ? allContacts.filter((contact) => payload.contactIds!.includes(contact.id))
        : allContacts;
      const confirmed = selected.filter((contact) => Boolean(contact.confirmedAt));
      const incidentId = randomUUID();
      const shareToken = randomToken();
      const shareId = randomUUID();
      const now = new Date();
      await store.create('shares', shareId, {
        id: shareId,
        userId,
        tokenHash: hashToken(shareToken),
        contactIds: confirmed.map((contact) => contact.id) as StoredValue,
        purpose: 'Emergency SOS',
        status: 'active',
        location: encryptJson(
          payload.location,
          config.encryptionKeys,
          config.activeKeyId
        ) as unknown as StoredValue,
        lastLocationAt: now.toISOString(),
        acknowledgedAt: null,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        stoppedAt: null
      });
      await store.create('incidents', incidentId, {
        id: incidentId,
        userId,
        type: 'sos',
        status: 'active',
        message: payload.message ?? null,
        location: encryptJson(
          payload.location,
          config.encryptionKeys,
          config.activeKeyId
        ) as unknown as StoredValue,
        shareId,
        contactedCount: confirmed.length,
        createdAt: now.toISOString(),
        resolvedAt: null,
        deletionAfter: new Date(now.getTime() + config.locationRetentionDays * 86_400_000).toISOString()
      });
      await store.create('idempotency', replayId, {
        id: replayId,
        userId,
        incidentId,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      });
      const trackingUrl = `${config.publicAppUrl}/track/${shareToken}`;
      const messages: NotificationMessage[] = [];
      for (const contact of confirmed) {
        const destination = decryptJson<{ phone: string | null; email: string | null }>(
          contact.destination as unknown as EncryptedValue,
          config.encryptionKeys
        );
        for (const channel of contact.channels as NotificationChannel[]) {
          const target =
            channel === 'sms' ? destination.phone : channel === 'email' ? destination.email : null;
          if (target)
            messages.push({
              eventId: incidentId,
              channel,
              destination: target,
              template: 'sos',
              locale: 'en',
              variables: { trackingUrl }
            });
        }
      }
      const delivery = await notifications.deliver(messages);
      await store.create('notificationJobs', incidentId, {
        id: incidentId,
        userId,
        type: 'sos',
        createdAt: now.toISOString(),
        ...notificationJobPatch(config, messages, delivery, 1, now)
      });
      response.status(202).json({
        data: { incidentId, replayed: false, confirmedContactCount: confirmed.length, trackingUrl, delivery }
      });
    })
  );

  router.post(
    '/sos/:id/resolve',
    validate({ params: idParams, body: z.strictObject({ pin: z.string().regex(/^\d{4,8}$/) }) }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      const { pin } = request.validated?.body as { pin: string };
      const userId = ownerId(request);
      const incident = await owned(store, 'incidents', id, userId);
      const settings = await store.get('safetySettings', userId);
      if (!settings) throw new AppError(409, 'PIN_NOT_CONFIGURED', 'Configure safety and duress PINs first');
      const isSafe = await verifyPin(pin, String(settings.safePinSalt), String(settings.safePinHash));
      const isDuress =
        !isSafe && (await verifyPin(pin, String(settings.duressPinSalt), String(settings.duressPinHash)));
      if (!isSafe && !isDuress) throw new AppError(401, 'PIN_INVALID', 'The PIN is invalid');
      if (isSafe) {
        await store.update('incidents', id, { status: 'resolved', resolvedAt: new Date().toISOString() });
        if (incident.shareId)
          await store.update('shares', String(incident.shareId), {
            status: 'stopped',
            stoppedAt: new Date().toISOString(),
            location: null
          });
      } else {
        await store.update('incidents', id, { duressActivatedAt: new Date().toISOString() });
      }
      response.json({ data: { displayedAsResolved: true } });
    })
  );

  router.get(
    '/incidents',
    validate({ query: paginationQuery }),
    asyncRoute(async (request, response) => {
      const { limit } = request.validated?.query as { limit: number };
      const incidents = await store.list(
        'incidents',
        { userId: ownerId(request) },
        { limit, orderBy: 'createdAt', direction: 'desc' }
      );
      response.json({
        data: incidents.map((incident) => ({
          id: incident.id,
          type: incident.type,
          status: incident.status,
          message: incident.message,
          createdAt: incident.createdAt,
          resolvedAt: incident.resolvedAt,
          contactedCount: incident.contactedCount
        }))
      });
    })
  );

  router.delete(
    '/incidents/:id',
    validate({ params: idParams }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      await owned(store, 'incidents', id, ownerId(request));
      await store.delete('incidents', id);
      response.status(204).end();
    })
  );

  router.post(
    '/journeys',
    validate({ body: journeyCreateSchema }),
    asyncRoute(async (request, response) => {
      const payload = request.validated?.body as z.infer<typeof journeyCreateSchema>;
      if (new Date(payload.expectedArrivalAt).getTime() <= Date.now())
        throw new AppError(400, 'ETA_INVALID', 'Expected arrival must be in the future');
      const userId = ownerId(request);
      await Promise.all(payload.contactIds.map((id) => owned(store, 'contacts', id, userId)));
      const id = randomUUID();
      const record: StoredRecord = {
        id,
        userId,
        destination: payload.destination,
        expectedArrivalAt: payload.expectedArrivalAt,
        graceMinutes: payload.graceMinutes,
        contactIds: payload.contactIds as StoredValue,
        startLocation: payload.startLocation
          ? (encryptJson(
              payload.startLocation,
              config.encryptionKeys,
              config.activeKeyId
            ) as unknown as StoredValue)
          : null,
        status: 'active',
        createdAt: new Date().toISOString(),
        arrivedAt: null
      };
      await store.create('journeys', id, record);
      response.status(201).json({ data: { ...record, startLocation: undefined } });
    })
  );

  router.get(
    '/journeys',
    asyncRoute(async (request, response) => {
      const records = await store.list(
        'journeys',
        { userId: ownerId(request) },
        { limit: 100, orderBy: 'createdAt', direction: 'desc' }
      );
      response.json({
        data: records.map((record) => {
          const output = { ...record };
          delete output.startLocation;
          return output;
        })
      });
    })
  );

  router.post(
    '/journeys/:id/arrive',
    validate({ params: idParams }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      await owned(store, 'journeys', id, ownerId(request));
      const updated = await store.update('journeys', id, {
        status: 'arrived',
        arrivedAt: new Date().toISOString()
      });
      response.json({ data: updated });
    })
  );

  router.post(
    '/checkins',
    validate({ body: checkinCreateSchema }),
    asyncRoute(async (request, response) => {
      const payload = request.validated?.body as z.infer<typeof checkinCreateSchema>;
      if (new Date(payload.promptAt).getTime() <= Date.now())
        throw new AppError(400, 'TIME_INVALID', 'Check-in time must be in the future');
      const userId = ownerId(request);
      await Promise.all(payload.contactIds.map((id) => owned(store, 'contacts', id, userId)));
      const id = randomUUID();
      const record: StoredRecord = {
        id,
        userId,
        promptAt: payload.promptAt,
        graceMinutes: payload.graceMinutes,
        contactIds: payload.contactIds as StoredValue,
        note: payload.note ?? null,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        completedAt: null
      };
      await store.create('checkins', id, record);
      response.status(201).json({ data: record });
    })
  );

  router.get(
    '/checkins',
    asyncRoute(async (request, response) => {
      const records = await store.list(
        'checkins',
        { userId: ownerId(request) },
        { limit: 100, orderBy: 'promptAt', direction: 'desc' }
      );
      response.json({ data: records });
    })
  );

  router.post(
    '/checkins/:id/complete',
    validate({ params: idParams }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      await owned(store, 'checkins', id, ownerId(request));
      const updated = await store.update('checkins', id, {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      response.json({ data: updated });
    })
  );

  router.get(
    '/privacy/export',
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const collections = ['users', 'contacts', 'shares', 'incidents', 'journeys', 'checkins', 'consentLogs'];
      const output: Record<string, unknown> = {};
      for (const collection of collections) {
        const records =
          collection === 'users'
            ? [await store.get('users', userId)].filter(Boolean)
            : await store.list(collection, { userId }, { limit: 1000 });
        output[collection] = records.map((record) => {
          if (!record) return null;
          const cleaned = { ...record };
          delete cleaned.tokenHash;
          delete cleaned.optInTokenHash;
          delete cleaned.optOutTokenHash;
          if (cleaned.destination)
            cleaned.destination = decryptJson(
              cleaned.destination as unknown as EncryptedValue,
              config.encryptionKeys
            ) as unknown as StoredValue;
          if (cleaned.location)
            cleaned.location = decryptJson(
              cleaned.location as unknown as EncryptedValue,
              config.encryptionKeys
            ) as unknown as StoredValue;
          return cleaned;
        });
      }
      response.setHeader('Content-Disposition', 'attachment; filename="guardify-export.json"');
      response.json({ exportedAt: new Date().toISOString(), data: output });
    })
  );

  router.delete(
    '/privacy/account',
    asyncRoute(async (request, response) => {
      const userId = ownerId(request);
      const collections = [
        'contacts',
        'shares',
        'incidents',
        'journeys',
        'checkins',
        'consentLogs',
        'sessions',
        'notificationJobs',
        'idempotency',
        'safetySettings'
      ];
      for (const collection of collections) await store.deleteMany(collection, { userId });
      await store.delete('users', userId);
      await identity.deleteUser(userId);
      response.status(204).end();
    })
  );

  router.get('/safety/emergency-numbers', (_request, response) => {
    response.json({
      data: [{ countryCode: 'BD', policeFireAmbulance: '999', womenChildrenHelpline: '109' }]
    });
  });

  router.post(
    '/safety/nearby-help',
    validate({ body: nearbyHelpSchema }),
    asyncRoute(async (request, response) => {
      const { latitude, longitude } = request.validated?.body as z.infer<typeof nearbyHelpSchema>;
      const mapUrl = `https://www.openstreetmap.org/#map=14/${latitude}/${longitude}`;
      const query = `[out:json][timeout:5];(node(around:4000,${latitude},${longitude})[amenity~"^(police|hospital)$"];way(around:4000,${latitude},${longitude})[amenity~"^(police|hospital)$"];);out center 12;`;
      try {
        const provider = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(6_000)
        });
        if (!provider.ok) throw new Error('Map provider unavailable');
        const result = (await provider.json()) as {
          elements?: Array<{
            id: number;
            lat?: number;
            lon?: number;
            center?: { lat?: number; lon?: number };
            tags?: Record<string, string>;
          }>;
        };
        const points = (result.elements ?? []).flatMap((element) => {
          const lat = element.lat ?? element.center?.lat;
          const lon = element.lon ?? element.center?.lon;
          if (lat === undefined || lon === undefined) return [];
          return [
            {
              id: String(element.id),
              name:
                element.tags?.name ?? (element.tags?.amenity === 'police' ? 'Police station' : 'Hospital'),
              category: element.tags?.amenity ?? 'help',
              latitude: lat,
              longitude: lon
            }
          ];
        });
        response.json({ data: { points, degraded: false, mapUrl } });
      } catch {
        response.json({ data: { points: [], degraded: true, mapUrl } });
      }
    })
  );

  return router;
}
