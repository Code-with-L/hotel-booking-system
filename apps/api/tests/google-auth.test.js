// Google OAuth sign-in + registration against a mocked Google. No network, no real client credentials.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/v1/auth/google/callback');

const calls = [];
const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const mockFetch = vi.fn(async (url, options = {}) => {
  calls.push({ url, options });
  if (url.includes('oauth2.googleapis.com/token')) {
    return respond(200, { access_token: 'ya29.test_access_token', token_type: 'Bearer' });
  }
  if (url.includes('openidconnect.googleapis.com/v1/userinfo')) {
    return respond(200, {
      email: 'gtest.oauth@example.com',
      email_verified: true,
      given_name: 'Grace',
      family_name: 'Otieno',
      sub: 'google-sub-0001',
    });
  }
  throw new Error(`Unexpected fetch to ${url}`);
});
vi.stubGlobal('fetch', mockFetch);

const { createApp } = await import('../src/app.js');
const app = createApp();

const googleStart = () => request(app).get('/api/v1/auth/google');
const stateFromSetCookie = (res) => {
  const set = res.headers['set-cookie'];
  const cookies = Array.isArray(set) ? set : set ? [set] : [];
  const raw = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('stillhouse_oauth_state='));
  return raw || null;
};

beforeEach(() => {
  calls.length = 0;
  mockFetch.mockClear();
});

describe('Google OAuth - redirect URI validation', () => {
  it('GET /google redirects to accounts.google.com with the state cookie set', async () => {
    const res = await googleStart();
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.location).toContain('client_id=test-client-id');
    expect(res.headers.location).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback');
    expect(res.headers.location).toContain('scope=openid');
    expect(stateFromSetCookie(res)).toBeTruthy();
  });

  it('rejects a callback with a mismatched state (CSRF guard)', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?code=x&state=forged').set('Cookie', 'stillhouse_oauth_state=not-the-same');
    expect(res.status).toBe(400);
  });

  it('redirects to sign-in with cancelled message when Google reports access_denied', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account?error=google-cancelled');
  });

  it('redirects to sign-in with failed message when Google returns an error', async () => {
    mockFetch.mockImplementationOnce(async () => respond(400, { error: 'invalid_grant' }));
    const start = await googleStart();
    const stateCookie = stateFromSetCookie(start);
    const state = decodeURIComponent(stateCookie.split('=')[1]);
    const res = await request(app)
      .get(`/api/v1/auth/google/callback?code=bad&state=${encodeURIComponent(state)}`)
      .set('Cookie', stateCookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account?error=google-failed');
  });
});

describe('Google OAuth - happy path', () => {
  const runCallback = async () => {
    const start = await googleStart();
    const stateCookie = stateFromSetCookie(start);
    const state = decodeURIComponent(stateCookie.split('=')[1]);
    return request(app)
      .get(`/api/v1/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`)
      .set('Cookie', stateCookie);
  };

  it('creates a guest account and signs the user in (registration via OAuth)', async () => {
    const res = await runCallback();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account/reservations');

    // Session cookie works for the new account.
    const session = await request(app).get('/api/v1/auth/session').set('Cookie', res.headers['set-cookie']);
    expect(session.status).toBe(200);
    expect(session.body.authenticated).toBe(true);
    expect(session.body.account.email).toBe('gtest.oauth@example.com');
    expect(session.body.account.firstName).toBe('Grace');
    expect(session.body.account.roles).toContain('guest');

    // Token exchange + userinfo were called, in order.
    expect(calls[0].url).toContain('oauth2.googleapis.com/token');
    expect(calls[1].url).toContain('openidconnect.googleapis.com/v1/userinfo');
    expect(calls[1].options.headers.Authorization).toBe('Bearer ya29.test_access_token');
  });

  it('is idempotent - a second callback with the same Google identity links the same account', async () => {
    const first = await runCallback();
    expect(first.status).toBe(302);
    const second = await runCallback();
    expect(second.status).toBe(302);
    const s1 = await request(app).get('/api/v1/auth/session').set('Cookie', first.headers['set-cookie']);
    const s2 = await request(app).get('/api/v1/auth/session').set('Cookie', second.headers['set-cookie']);
    expect(s1.body.account.id).toBe(s2.body.account.id);
  });
});
