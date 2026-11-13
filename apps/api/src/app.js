// Express app wiring. Same-origin in production (web served separately or behind proxy);
// in dev, Vite proxies /api -> this server, also same-origin from the browser's perspective.
import express from 'express';
import { readFileSync } from 'node:fs';
// Vercel's Node File Trace inspects import/require/fs usage, not require.resolve.
// A literal fs read of the Prisma Wasm query compiler makes the tracer include the file in the function bundle;
// without this, every query against the database crashes with ENOENT on serverless.
try {
  readFileSync(new URL('../generated/prisma/query_compiler_bg.wasm', import.meta.url));
} catch {
  // engine generated at build time in some environments; absence here is non-fatal at import time
}
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { loadSession, apiLimiter, errorHandler, notFoundHandler } from './middleware/index.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRouter } from './modules/auth/routes.js';
import { googleRouter } from './modules/auth/google.js';
import { roomsRouter, availabilityRouter, quotesRouter } from './modules/rooms/routes.js';
import { reservationsRouter, accountRouter } from './modules/reservations/routes.js';
import { paymentsRouter, webhooksRouter, adminPaymentsRouter } from './modules/payments/routes.js';
import { enquiriesRouter } from './modules/enquiries/routes.js';
import { adminRouter } from './modules/admin/routes.js';

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // one hop (vite dev proxy / reverse proxy) - required for correct req.ip + rate limiting
  app.use(helmet({
    contentSecurityPolicy: env.isProduction ? undefined : false, // SPA served by Vite in dev; CSP set by host in prod
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  // Webhooks (provider retries) and liveness probes must not be rate-limited
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/webhooks') || req.path === '/api/v1/health' || req.path === '/api/v1/ready') return next();
    return apiLimiter(req, res, next);
  });
  app.use(requestLogger);
  // Liveness/readiness probes intentionally bypass session loading (an orchestrator must get an honest answer even when the database or session store is down).
  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, service: 'stillhouse-api', time: new Date().toISOString() }));
  app.get('/api/v1/ready', async (_req, res) => {
    try {
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      let jobs = 'unknown';
      try {
        const hb = await prisma.setting.findUnique({ where: { key: 'jobs.heartbeat' } });
        const ageMs = hb ? Date.now() - new Date(hb.updatedAt).getTime() : Infinity;
        jobs = ageMs <= 5 * 60 * 1000 ? 'ok' : 'stale';
      } catch { /* heartbeat is advisory; never fail readiness on it */ }
      res.json({ ok: true, service: 'stillhouse-api', db: 'up', jobs, time: new Date().toISOString() });
    } catch (err) {
      const { logger } = await import('./lib/logger.js');
      logger.warn({ err: String(err?.message || err) }, 'readiness probe: database down');
      res.status(503).json({ ok: false, service: 'stillhouse-api', db: 'down' });
    }
  });
  // Protected probe for the external staleness monitor (M10 §5.3). 503 when worker missing/stale; never public.
  app.get('/api/v1/jobs/health', async (req, res) => {
    if (!env.jobToken || String(req.headers.authorization || '') !== `Bearer ${env.jobToken}`) {
      return res.status(404).end();
    }
    try {
      const { prisma } = await import('./lib/prisma.js');
      const hb = await prisma.setting.findUnique({ where: { key: 'jobs.heartbeat' } });
      if (!hb) return res.status(503).json({ ok: false, reason: 'no_heartbeat' });
      const ageMs = Date.now() - new Date(hb.updatedAt).getTime();
      if (ageMs > 5 * 60 * 1000) return res.status(503).json({ ok: false, reason: 'stale', ageMs, at: hb.value?.at ?? null });
      return res.json({ ok: true, worker: hb.value?.worker ?? 'unknown', at: hb.value?.at ?? null, ageMs });
    } catch {
      return res.status(503).json({ ok: false, reason: 'probe_failed' });
    }
  });
  app.use(loadSession);

  app.use('/api/v1/auth', googleRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', roomsRouter);
  app.use('/api/v1', availabilityRouter);
  app.use('/api/v1', quotesRouter);
  app.use('/api/v1', reservationsRouter);
  app.use('/api/v1', accountRouter);
  app.use('/api/v1', paymentsRouter);
  app.use('/api/v1', enquiriesRouter);
  app.use('/api/v1', webhooksRouter);
  app.use('/api/v1', adminPaymentsRouter);
  app.use('/api/v1', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

// Vercel entrypoint: Express on Vercel expects a default export of the app.
export default createApp();

