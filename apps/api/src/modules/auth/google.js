// Google OAuth 2.0 (OpenID Connect) sign-in for guest accounts.
// Owner-gated: dormant until GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
// Google sign-in doubles as registration - guests without accounts get one created.
import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { SESSION_COOKIE } from '../../middleware/index.js';
import { badRequest, unauthorized, ApiError } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { accountPayload } from '../../lib/account.js';
import { createSession, COOKIE_OPTIONS } from '../../lib/session.js';

export const googleRouter = Router();

const STATE_COOKIE = 'stillhouse_oauth_state';
const STATE_MAX_AGE = 10 * 60 * 1000;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

const GOOGLE = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || null,
});

const configured = () => Boolean(GOOGLE().clientId && GOOGLE().clientSecret);

const redirectUriFor = (req) =>
  GOOGLE().redirectUri || `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;

const stateCookie = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.cookieSecure,
  path: '/',
  maxAge: STATE_MAX_AGE,
});

const safeRedirect = (res, to) => res.redirect(302, to);

googleRouter.get('/google', (req, res) => {
  if (!configured()) {
    return safeRedirect(res, '/account?error=google-not-configured');
  }
  const state = crypto.randomBytes(24).toString('base64url');
  res.cookie(STATE_COOKIE, state, stateCookie());
  const params = new URLSearchParams({
    client_id: GOOGLE().clientId,
    redirect_uri: redirectUriFor(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(302, `${GOOGLE_AUTH}?${params.toString()}`);
});

// Account find-or-create by Google identity. Never throws on duplicates - idempotent by email.
async function findOrCreateGoogleUser(profile) {
  const email = String(profile.email).toLowerCase().trim();
  const givenName = String(profile.given_name || '').trim() || (String(profile.name || '').trim().split(/\s+/)[0] || 'Guest');
  const familyName = String(profile.family_name || '').trim() || (String(profile.name || '').trim().split(/\s+/).slice(1).join(' ') || givenName);
  const fullName = `${givenName} ${familyName}`.trim();

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } }, guest: true },
  });
  if (existing) return { user: existing, guest: existing.guest, created: false };

  // Booking-flow guests have a guest row but no user - link the user to the existing guest.
  const existingGuest = await prisma.guest.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
  const guestRole = await prisma.role.findUnique({ where: { key: 'guest' } });

  const user = await prisma.user.create({
    data: {
      guestId: existingGuest?.id ?? undefined,
      email,
      passwordHash,
      name: fullName,
      roles: guestRole ? { create: [{ roleId: guestRole.id }] } : undefined,
      ...(existingGuest
        ? {}
        : {
            guest: {
              create: {
                firstName: givenName,
                lastName: familyName,
                email,
                phone: '',
                country: 'Kenya',
                marketingConsent: false,
              },
            },
          }),
    },
    include: { roles: { include: { role: true } }, guest: true },
  });
  return { user, guest: user.guest, created: true };
}

googleRouter.get('/google/callback', async (req, res, next) => {
  try {
    if (!configured()) {
      return safeRedirect(res, '/account?error=google-not-configured');
    }
    if (req.query.error === 'access_denied') {
      return safeRedirect(res, '/account?error=google-cancelled');
    }
    if (!req.query.code) return safeRedirect(res, '/account?error=google-failed');

    // State must match the cookie set at /google - CSRF guard.
    const stateCookieValue = req.cookies?.[STATE_COOKIE];
    if (!stateCookieValue || req.query.state !== stateCookieValue) {
      return next(badRequest('Invalid OAuth state. Please try again.'));
    }
    res.clearCookie(STATE_COOKIE, { path: '/' });

    // Exchange the authorization code for tokens.
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: GOOGLE().clientId,
        client_secret: GOOGLE().clientSecret,
        redirect_uri: redirectUriFor(req),
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      await audit(null, { actorUserId: null, action: 'auth.google_token_failed', entity: 'user', entityId: null, ip: req.ip });
      return safeRedirect(res, '/account?error=google-failed');
    }
    const tokens = await tokenRes.json();

    // Fetch the verified profile.
    const profileRes = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      return safeRedirect(res, '/account?error=google-failed');
    }
    const profile = await profileRes.json();
    if (!profile?.email || profile.email_verified !== true || !profile?.sub) {
      return safeRedirect(res, '/account?error=google-failed');
    }

    const { user, guest, created } = await findOrCreateGoogleUser(profile);
    if (user.status !== 'active') {
      return safeRedirect(res, '/account?error=google-failed');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(null, { actorUserId: user.id, action: created ? 'auth.registered_google' : 'auth.signed_in_google', entity: 'user', entityId: user.id, ip: req.ip });

    const token = await createSession(user.id, req);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS());
    return safeRedirect(res, '/account/reservations');
  } catch (err) {
    console.error('[google-oauth]', err);
    return safeRedirect(res, '/account?error=google-failed');
  }
});
