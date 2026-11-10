// Authentication: register, sign-in, sign-out, me, profile, password reset.
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { hashToken, requireAuth, authLimiter, SESSION_COOKIE } from '../../middleware/index.js';
import { validate } from '../../middleware/index.js';
import { signInSchema, registerSchema, updateProfileSchema } from '@stillhouse/shared';
import { ApiError, badRequest, unauthorized, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const authRouter = Router();

const COOKIE_OPTIONS = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.cookieSecure,
  path: '/',
  maxAge: env.sessionAbsoluteDays * 24 * 60 * 60 * 1000,
});

async function createSession(userId, req) {
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

const accountPayload = (user, guest) => ({
  id: user.id,
  guestId: guest?.id ?? null,
  firstName: guest?.firstName ?? user.name.split(' ')[0] ?? user.name,
  lastName: guest?.lastName ?? user.name.split(' ').slice(1).join(' ') ?? '',
  name: user.name,
  email: user.email,
  phone: guest?.phone ?? '',
  country: guest?.country ?? 'Kenya',
  notes: guest?.notes ?? '',
  roles: user.roles.map((ur) => ur.role.key),
});

authRouter.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, phone, country } = req.validatedBody;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw badRequest('An account with this email already exists.');
    const passwordHash = await bcrypt.hash(password, 12);
    const guest = await prisma.guest.create({
      data: { firstName, lastName, email, phone: phone || '', country, marketingConsent: false },
    });
    const role = await prisma.role.findUnique({ where: { key: 'guest' } });
    const user = await prisma.user.create({
      data: {
        guestId: guest.id,
        email,
        passwordHash,
        name: `${firstName} ${lastName}`.trim(),
        roles: { create: [{ roleId: role.id }] },
      },
      include: { roles: { include: { role: true } }, guest: true },
    });
    await audit(null, { actorUserId: user.id, action: 'auth.registered', entity: 'user', entityId: user.id, ip: req.ip });
    const token = await createSession(user.id, req);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS());
    res.status(201).json({ account: accountPayload(user, guest) });
  } catch (err) { next(err); }
});

authRouter.post('/sign-in', authLimiter, validate(signInSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validatedBody;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, guest: true },
    });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw unauthorized('Invalid email or password.');
    if (user.status !== 'active') throw unauthorized('This account is disabled. Please contact the front desk.');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await createSession(user.id, req);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS());
    res.json({ account: accountPayload(user, user.guest) });
  } catch (err) { next(err); }
});

authRouter.post('/sign-out', async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ account: accountPayload(req.auth.user, req.auth.guest) });
});

authRouter.put('/account/profile', requireAuth, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const { firstName, lastName, phone, country, notes } = req.validatedBody;
    if (req.auth.guest) {
      const guest = await prisma.guest.update({
        where: { id: req.auth.guest.id },
        data: {
          ...(firstName != null ? { firstName } : {}),
          ...(lastName != null ? { lastName } : {}),
          ...(phone != null ? { phone } : {}),
          ...(country != null ? { country } : {}),
          ...(notes != null ? { notes } : {}),
        },
      });
      if (firstName != null || lastName != null) {
        const name = `${guest.firstName} ${guest.lastName}`.trim();
        await prisma.user.update({ where: { id: req.auth.user.id }, data: { name } });
      }
      return res.json({ account: accountPayload({ ...req.auth.user, name: `${guest.firstName} ${guest.lastName}`.trim() }, guest) });
    }
    throw notFound('No guest profile attached to this account.');
  } catch (err) { next(err); }
});

// Password reset: only available when an email provider is configured. Otherwise 503 - never fake an email being sent.
authRouter.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    if (!env.emailProvider) {
      throw new ApiError(503, 'EMAIL_PROVIDER_NOT_CONFIGURED', 'Password reset by email is not configured yet. Please contact the front desk.');
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return the same response to avoid account enumeration
    if (user) {
      const raw = crypto.randomBytes(32).toString('base64url');
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      // NOTE: email dispatch intentionally not implemented in M1 (no provider). Factory below is the integration point.
      const { sendPasswordReset } = await import('../notifications/email.js');
      await sendPasswordReset({ to: user.email, token: raw });
    }
    res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) { next(err); }
});

authRouter.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 8) {
      throw badRequest('A valid token and a password of at least 8 characters are required.');
    }
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(String(token)) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw badRequest('That reset link is invalid or has expired.');
    }
    const passwordHash = await bcrypt.hash(String(password), 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: reset.userId } }),
    ]);
    await audit(null, { actorUserId: reset.userId, action: 'auth.password_reset', entity: 'user', entityId: reset.userId, ip: req.ip });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
