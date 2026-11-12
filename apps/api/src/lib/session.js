/** Session creation shared by password and OAuth sign-in paths. */
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { hashToken, SESSION_COOKIE } from '../middleware/index.js';
import { env } from '../config/env.js';

export const COOKIE_OPTIONS = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.cookieSecure,
  path: '/',
  maxAge: env.sessionAbsoluteDays * 24 * 60 * 60 * 1000,
});

export async function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = new Date();
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(now.getTime() + env.sessionIdleMinutes * 60 * 1000),
      absoluteExpiryAt: new Date(now.getTime() + env.sessionAbsoluteDays * 24 * 60 * 60 * 1000),
      ip: req.ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    },
  });
  return token;
}

export { SESSION_COOKIE };
