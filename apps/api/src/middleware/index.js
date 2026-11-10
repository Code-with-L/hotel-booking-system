// Middleware: zod validation, session auth, RBAC, error handling, rate limiting.
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ApiError, unauthorized, forbidden, badRequest } from '../lib/errors.js';
import { API_ERROR } from '@stillhouse/shared';
import { env } from '../config/env.js';

// ---------- validation ----------
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return next(badRequest('Invalid request.', details));
  }
  req[source === 'query' ? 'validatedQuery' : source === 'params' ? 'validatedParams' : 'validatedBody'] = result.data;
  next();
};

// ---------- sessions ----------
export const SESSION_COOKIE = 'stillhouse_session';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hashToken = sha256;

export async function loadSession(req, _res, next) {
  req.auth = null;
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    const tokenHash = sha256(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: { include: { role: true } }, guest: true } } },
    });
    const now = new Date();
    const idleMs = env.sessionIdleMinutes * 60 * 1000;
    if (!session || session.user.status !== 'active'
      || session.absoluteExpiryAt <= now
      || session.lastSeenAt.getTime() + idleMs <= now.getTime()) {
      if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return next();
    }
    // Throttled touch (at most once per minute)
    if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
      prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => {});
    }
    req.auth = {
      user: session.user,
      guest: session.user.guest || null,
      roles: session.user.roles.map((ur) => ur.role.key),
      sessionId: session.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export const requireAuth = (req, _res, next) => (req.auth ? next() : next(unauthorized()));

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!roles.some((r) => req.auth.roles.includes(r))) return next(forbidden('You do not have permission to perform this action.'));
  next();
};

export const isStaff = (req) => Boolean(req.auth && req.auth.roles.some((r) => ['receptionist', 'manager', 'admin'].includes(r)));

// ---------- rate limiting ----------
const json429 = (code, message) => (_req, res) => res.status(429).json({ error: { code, message } });

export const apiLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json429(API_ERROR.RATE_LIMITED, 'Too many requests. Please slow down.'),
});

export const authLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.authRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: json429(API_ERROR.RATE_LIMITED, 'Too many attempts. Please wait before trying again.'),
});

// ---------- error handling ----------
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: { code: API_ERROR.VALIDATION, message: 'Malformed request body.' } });
  }
  const sqlState = err?.meta?.code || err?.code;
  if (sqlState === '23P01') {
    return res.status(409).json({ error: { code: API_ERROR.ROOM_UNAVAILABLE, message: 'The requested room is no longer available for these dates.' } });
  }
  // Never leak internals to the client
  console.error('[unhandled-error]', err);
  res.status(500).json({ error: { code: API_ERROR.INTERNAL, message: 'Something went wrong. Please try again.' } });
};

export const notFoundHandler = (req, res) =>
  res.status(404).json({ error: { code: API_ERROR.NOT_FOUND, message: `No such route: ${req.method} ${req.path}` } });
