import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { AppError, asyncRoute, validate } from './http/errors.js';
import { idParams } from './http/schemas.js';
import type { Store, StoredRecord } from './types.js';

export function createAbuseRouter(store: Store): Router {
  const router = Router();
  router.post(
    '/',
    validate({
      body: z.strictObject({
        category: z.enum(['stalking', 'coercion', 'spam', 'other']),
        details: z.string().trim().min(10).max(2000)
      })
    }),
    asyncRoute(async (request, response) => {
      const id = randomUUID();
      const body = request.validated?.body as { category: string; details: string };
      const report: StoredRecord = {
        id,
        userId: request.auth!.id,
        category: body.category,
        details: body.details,
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await store.create('abuseReports', id, report);
      response.status(201).json({ data: { id, status: 'open', createdAt: report.createdAt } });
    })
  );
  return router;
}

export function createAdminRouter(store: Store): Router {
  const router = Router();
  router.use(requireAdmin);
  router.get(
    '/abuse-reports',
    asyncRoute(async (_request, response) => {
      const reports = await store.list(
        'abuseReports',
        {},
        { limit: 100, orderBy: 'createdAt', direction: 'desc' }
      );
      response.json({ data: reports });
    })
  );
  router.patch(
    '/abuse-reports/:id',
    validate({
      params: idParams,
      body: z.strictObject({ status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']) })
    }),
    asyncRoute(async (request, response) => {
      const { id } = request.validated?.params as { id: string };
      if (!(await store.get('abuseReports', id))) throw new AppError(404, 'NOT_FOUND', 'Report not found');
      const { status } = request.validated?.body as { status: string };
      const updated = await store.update('abuseReports', id, { status, updatedAt: new Date().toISOString() });
      response.json({ data: updated });
    })
  );
  return router;
}
