// AuthN/Z: registration, sign-in, sessions, RBAC enforcement.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { truncateBookingTables, GUEST_CREDS, ADMIN_CREDS } from './helpers.mjs';

const app = createApp();

describe('authentication', () => {
  beforeEach(truncateBookingTables);

  it('registers a guest, signs in and returns the account on /me', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/v1/auth/register').send({
      email: 'new.guest@example.com', password: 'Sup3rSecret!', firstName: 'New', lastName: 'Guest', country: 'Kenya',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.account.email).toBe('new.guest@example.com');
    expect(reg.body.account.roles).toContain('guest');

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.account.firstName).toBe('New');

    const out = await agent.post('/api/v1/auth/sign-out');
    expect(out.status).toBe(200);
    const meAfter = await agent.get('/api/v1/auth/me');
    expect(meAfter.status).toBe(401);
  });

  it('rejects duplicate registration with 400', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({
      email: 'dupe@example.com', password: 'Sup3rSecret!', firstName: 'Dup', lastName: 'One', country: 'Kenya',
    });
    const again = await agent.post('/api/v1/auth/register').send({
      email: 'dupe@example.com', password: 'OtherPass!1', firstName: 'Dup', lastName: 'Two', country: 'Kenya',
    });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bad credentials with 401 and never enumerates users', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/sign-in').send({ email: 'nobody@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('rate limiting is disabled in tests; seeded guest can sign in', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    expect(res.status).toBe(200);
    expect(res.body.account.email).toBe(GUEST_CREDS.email);
  });
});

describe('authorization (RBAC)', () => {
  beforeEach(truncateBookingTables);

  it('guest cannot reach staff endpoints (403), anonymous cannot either (401), staff can (200)', async () => {
    const anon = request.agent(app);
    expect((await anon.get('/api/v1/admin/dashboard')).status).toBe(401);

    const guest = request.agent(app);
    await guest.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    expect((await guest.get('/api/v1/admin/dashboard')).status).toBe(403);

    const admin = request.agent(app);
    await admin.post('/api/v1/auth/sign-in').send(ADMIN_CREDS);
    const dash = await admin.get('/api/v1/admin/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body).toHaveProperty('totalReservations');
    expect(dash.body).toHaveProperty('occupancy');
  });

  it('staff can list rooms, rates and audit log access is admin-only', async () => {
    const admin = request.agent(app);
    await admin.post('/api/v1/auth/sign-in').send(ADMIN_CREDS);

    const rooms = await admin.get('/api/v1/admin/rooms');
    expect(rooms.status).toBe(200);
    expect(rooms.body).toHaveLength(28);

    const rates = await admin.get('/api/v1/admin/rates');
    expect(rates.status).toBe(200);
    expect(rates.body.length).toBeGreaterThanOrEqual(12);

    const audit = await admin.get('/api/v1/admin/audit-log');
    expect(audit.status).toBe(200);
  });
});
