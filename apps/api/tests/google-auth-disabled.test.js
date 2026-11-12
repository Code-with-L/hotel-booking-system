// Google OAuth dormant path - no credentials configured, the button fails safely and honestly.
import { describe, it, expect } from 'vitest';
import request from 'supertest';

// No GOOGLE_* stubs: the flow must be dormant and report honestly.
const { createApp } = await import('../src/app.js');
const app = createApp();

describe('Google OAuth - disabled', () => {
  it('GET /auth/google redirects to sign-in with a not-configured notice instead of a Google error', async () => {
    const res = await request(app).get('/api/v1/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account?error=google-not-configured');
  });

  it('callback without a state cookie still renders sign-in rather than exposing an upstream error', async () => {
    const res = await request(app).get('/api/v1/auth/google/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account?error=google-not-configured');
  });
});
