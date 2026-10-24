import { randomUUID } from 'node:crypto';
import { Router, type CookieOptions, type RequestHandler } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { AppError, asyncRoute, validate } from './http/errors.js';
import { hashToken, randomToken } from './security/crypto.js';
import type { IdentityVerifier, Store, StoredRecord } from './types.js';

const ACCESS_COOKIE = '__Host-guardify_access';
const REFRESH_COOKIE = '__Secure-guardify_refresh';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(config: AppConfig, maxAge: number, path = '/'): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path,
    maxAge
  };
}

async function signAccess(
  config: AppConfig,
  userId: string,
  sessionId: string,
  role: 'user' | 'admin'
): Promise<string> {
  return new SignJWT({ sid: sessionId, role, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('guardify-api')
    .setAudience('guardify-pwa')
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(config.sessionSecret);
}

async function createSession(
  store: Store,
  userId: string,
  role: 'user' | 'admin',
  deviceName: string,
  familyId: string = randomUUID()
): Promise<{ id: string; refreshToken: string; record: StoredRecord }> {
  const id = randomUUID();
  const refreshToken = randomToken();
  const now = new Date();
  const record: StoredRecord = {
    id,
    userId,
    role,
    familyId,
    deviceName,
    tokenHash: hashToken(refreshToken),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
    revokedAt: null,
    revokeReason: null
  };
  await store.create('sessions', id, record);
  return { id, refreshToken, record };
}

async function revokeFamily(store: Store, familyId: string, reason: string): Promise<void> {
  const sessions = await store.list('sessions', { familyId }, { limit: 100 });
  const now = new Date().toISOString();
  await Promise.all(
    sessions
      .filter((session) => !session.revokedAt)
      .map((session) => store.update('sessions', session.id, { revokedAt: now, revokeReason: reason }))
  );
}

export function requireAuth(config: AppConfig, store: Store): RequestHandler {
  return asyncRoute(async (request, _response, next) => {
    const token = request.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
    try {
      const result = await jwtVerify(token, config.sessionSecret, {
        issuer: 'guardify-api',
        audience: 'guardify-pwa'
      });
      if (
        result.payload.type !== 'access' ||
        typeof result.payload.sub !== 'string' ||
        typeof result.payload.sid !== 'string'
      ) {
        throw new Error('Invalid token claims');
      }
      const session = await store.get('sessions', result.payload.sid);
      if (!session || session.revokedAt || new Date(String(session.expiresAt)).getTime() <= Date.now()) {
        throw new Error('Session unavailable');
      }
      request.auth = {
        id: result.payload.sub,
        sessionId: result.payload.sid,
        role: result.payload.role === 'admin' ? 'admin' : 'user'
      };
      next();
    } catch {
      throw new AppError(401, 'SESSION_INVALID', 'The session is invalid or expired');
    }
  });
}

export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (request.auth?.role !== 'admin') {
    next(new AppError(403, 'ADMIN_REQUIRED', 'Administrator access is required'));
    return;
  }
  next();
};

export function createAuthRouter(config: AppConfig, store: Store, identity: IdentityVerifier): Router {
  const router = Router();
  const sessionSchema = z.strictObject({
    idToken: z.string().min(20).max(10_000),
    deviceName: z.string().trim().min(1).max(80).default('Unknown device')
  });

  router.post(
    '/session',
    validate({ body: sessionSchema }),
    asyncRoute(async (request, response) => {
      const { idToken, deviceName } = request.validated?.body as z.infer<typeof sessionSchema>;
      let verified;
      try {
        verified = await identity.verify(idToken);
      } catch {
        throw new AppError(401, 'IDENTITY_INVALID', 'Sign-in could not be verified');
      }
      if (!verified.emailVerified) {
        throw new AppError(403, 'VERIFICATION_REQUIRED', 'Verify your email or phone before continuing');
      }
      const existing = await store.get('users', verified.uid);
      const role = existing?.role === 'admin' || verified.role === 'admin' ? 'admin' : 'user';
      const now = new Date().toISOString();
      await store.set('users', verified.uid, {
        id: verified.uid,
        email: verified.email ?? null,
        name: verified.name ?? null,
        role,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null
      });
      const session = await createSession(store, verified.uid, role, deviceName);
      const access = await signAccess(config, verified.uid, session.id, role);
      response.cookie(ACCESS_COOKIE, access, cookieOptions(config, ACCESS_TTL_SECONDS * 1000));
      response.cookie(
        REFRESH_COOKIE,
        session.refreshToken,
        cookieOptions(config, REFRESH_TTL_MS, '/api/v1/auth')
      );
      response.status(201).json({
        data: {
          user: { id: verified.uid, email: verified.email ?? null, name: verified.name ?? null, role }
        }
      });
    })
  );

  router.post(
    '/refresh',
    asyncRoute(async (request, response) => {
      const refreshToken = request.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (!refreshToken) throw new AppError(401, 'REFRESH_REQUIRED', 'The session cannot be refreshed');
      const matches = await store.list('sessions', { tokenHash: hashToken(refreshToken) }, { limit: 2 });
      const current = matches[0];
      if (!current) throw new AppError(401, 'REFRESH_INVALID', 'The session cannot be refreshed');
      if (current.revokedAt) {
        await revokeFamily(store, String(current.familyId), 'refresh_reuse_detected');
        throw new AppError(401, 'REFRESH_REUSE', 'The session family has been revoked');
      }
      if (new Date(String(current.expiresAt)).getTime() <= Date.now()) {
        await store.update('sessions', current.id, {
          revokedAt: new Date().toISOString(),
          revokeReason: 'expired'
        });
        throw new AppError(401, 'REFRESH_EXPIRED', 'The session cannot be refreshed');
      }
      const rotated = await createSession(
        store,
        String(current.userId),
        current.role === 'admin' ? 'admin' : 'user',
        String(current.deviceName),
        String(current.familyId)
      );
      await store.update('sessions', current.id, {
        revokedAt: new Date().toISOString(),
        revokeReason: 'rotated',
        replacedBy: rotated.id
      });
      const access = await signAccess(
        config,
        String(current.userId),
        rotated.id,
        current.role === 'admin' ? 'admin' : 'user'
      );
      response.cookie(ACCESS_COOKIE, access, cookieOptions(config, ACCESS_TTL_SECONDS * 1000));
      response.cookie(
        REFRESH_COOKIE,
        rotated.refreshToken,
        cookieOptions(config, REFRESH_TTL_MS, '/api/v1/auth')
      );
      response.json({ data: { refreshed: true } });
    })
  );

  const protectedRoute = requireAuth(config, store);
  router.post(
    '/logout',
    protectedRoute,
    asyncRoute(async (request, response) => {
      await store.update('sessions', request.auth!.sessionId, {
        revokedAt: new Date().toISOString(),
        revokeReason: 'logout'
      });
      response.clearCookie(ACCESS_COOKIE, cookieOptions(config, 0));
      response.clearCookie(REFRESH_COOKIE, cookieOptions(config, 0, '/api/v1/auth'));
      response.status(204).end();
    })
  );

  router.post(
    '/logout-all',
    protectedRoute,
    asyncRoute(async (request, response) => {
      const sessions = await store.list('sessions', { userId: request.auth!.id }, { limit: 100 });
      await Promise.all(
        sessions
          .filter((session) => !session.revokedAt)
          .map((session) =>
            store.update('sessions', session.id, {
              revokedAt: new Date().toISOString(),
              revokeReason: 'logout_all'
            })
          )
      );
      response.clearCookie(ACCESS_COOKIE, cookieOptions(config, 0));
      response.clearCookie(REFRESH_COOKIE, cookieOptions(config, 0, '/api/v1/auth'));
      response.status(204).end();
    })
  );

  router.get(
    '/sessions',
    protectedRoute,
    asyncRoute(async (request, response) => {
      const sessions = await store.list(
        'sessions',
        { userId: request.auth!.id },
        { limit: 100, orderBy: 'createdAt', direction: 'desc' }
      );
      response.json({
        data: sessions.map((session) => ({
          id: session.id,
          deviceName: session.deviceName,
          createdAt: session.createdAt,
          lastUsedAt: session.lastUsedAt,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
          current: session.id === request.auth!.sessionId
        }))
      });
    })
  );

  router.delete(
    '/sessions/:id',
    protectedRoute,
    validate({ params: z.strictObject({ id: z.string().uuid() }) }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      const session = await store.get('sessions', id);
      if (!session || session.userId !== request.auth!.id)
        throw new AppError(404, 'NOT_FOUND', 'Session not found');
      await store.update('sessions', id, {
        revokedAt: new Date().toISOString(),
        revokeReason: 'device_revoked'
      });
      response.status(204).end();
    })
  );

  return router;
}
