import { randomUUID } from 'node:crypto';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { createAbuseRouter, createAdminRouter } from './admin-routes.js';
import { createAuthRouter, requireAuth } from './auth.js';
import type { AppConfig } from './config.js';
import { AppError, errorHandler, notFound } from './http/errors.js';
import { createDefaultDispatcher, type NotificationDispatcher } from './notifications.js';
import { createPublicSafetyRouter, createSafetyRouter } from './safety-routes.js';
import type { IdentityVerifier, Store } from './types.js';

export interface AppDependencies {
  config: AppConfig;
  store: Store;
  identity: IdentityVerifier;
  notifications?: NotificationDispatcher;
}

function limiter(windowMs: number, limit: number, prefix: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) => `${prefix}:${ipKeyGenerator(request.ip ?? 'unknown')}`,
    handler: (_request, response) =>
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' }
      })
  });
}

export function createApp({
  config,
  store,
  identity,
  notifications = createDefaultDispatcher(config)
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  const logger = pino({
    level: config.nodeEnv === 'test' ? 'silent' : 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
        '*.password',
        '*.token',
        '*.idToken',
        '*.latitude',
        '*.longitude',
        '*.phone',
        '*.email'
      ],
      censor: '[REDACTED]'
    }
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: (request, response) => {
        const incoming = request.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        response.setHeader('X-Request-Id', id);
        return id;
      },
      customProps: () => ({ service: 'guardify-api' })
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
          connectSrc: [
            "'self'",
            'https://*.googleapis.com',
            'https://*.firebaseio.com',
            'wss://*.firebaseio.com'
          ],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          workerSrc: ["'self'", 'blob:'],
          manifestSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"]
        }
      },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        config.nodeEnv === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false
    })
  );
  app.use((_request, response, next) => {
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    next();
  });
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) callback(null, true);
        else callback(new AppError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id']
    })
  );
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(cookieParser());
  app.use((request, _response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.get('Origin');
      if (origin && !config.allowedOrigins.includes(origin)) {
        next(new AppError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed'));
        return;
      }
    }
    next();
  });
  app.use(limiter(60_000, 120, 'global'));

  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
  app.get('/readyz', async (request, response) => {
    try {
      await store.ping();
      response.json({ status: 'ready' });
    } catch (error) {
      request.log.warn({ err: error }, 'readiness check failed');
      response.status(503).json({ status: 'not_ready' });
    }
  });

  app.use('/api/v1/auth', limiter(15 * 60_000, 20, 'auth'), createAuthRouter(config, store, identity));
  app.use('/api/v1/public', limiter(60_000, 60, 'public'), createPublicSafetyRouter(config, store));

  const authenticated = requireAuth(config, store);
  app.use('/api/v1', authenticated);
  app.use('/api/v1/sos', limiter(60_000, 12, 'sos'));
  app.use('/api/v1', createSafetyRouter(config, store, notifications, identity));
  app.use('/api/v1/abuse-reports', createAbuseRouter(store));
  app.use('/api/v1/admin', createAdminRouter(store));

  if (config.staticDir) {
    app.use(
      express.static(config.staticDir, {
        dotfiles: 'deny',
        etag: true,
        fallthrough: true,
        index: false,
        maxAge: config.nodeEnv === 'production' ? '1h' : 0
      })
    );
    app.get('/{*splat}', (request, response) => {
      if (
        request.path.startsWith('/track/') ||
        request.path.startsWith('/contact/confirm/') ||
        request.path.startsWith('/contact/opt-out/')
      ) {
        response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        response.setHeader('Cache-Control', 'no-store');
      }
      response.sendFile(path.join(config.staticDir!, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
