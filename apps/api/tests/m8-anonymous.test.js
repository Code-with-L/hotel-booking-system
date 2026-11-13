// M8 acceptance: anonymous guest journey (read-only, no staff overrides).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { truncateBookingTables, GUEST_CREDS } from './helpers.mjs';

const app = createApp();
const Q = { 'Content-Type': 'application/json' };

const book = (agent, overrides = {}) =>
  agent.post('/api/v1/reservations')
    .set(Q)
    .set('Idempotency-Key', `m8-${Math.random().toString(36).slice(2)}`)
    .send({
      roomTypeSlug: 'garden-room', ratePlanKey: 'flexible',
      checkIn: '2027-05-01', checkOut: '2027-05-04', adults: 2, children: 0, rooms: 1,
      source: 'web',
      guest: { firstName: 'Naomi', lastName: 'Achieng', email: GUEST_CREDS.email, phone: '+254 712 000 042', idNumber: '99887766', country: 'Kenya', requests: '', privacy: true },
      ...overrides,
    });

describe('M8 anonymous guest journey', () => {
  beforeEach(truncateBookingTables);

  it('holds are created with a server-derived expiry (not client-invented)', async () => {
    const r = await book(request(app));
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('pending');
    expect(r.body.holdExpiresAt).toBeTruthy();
    const hold = new Date(r.body.holdExpiresAt);
    expect(hold.getTime()).toBeGreaterThan(Date.now());
    expect(hold.getTime()).toBeLessThan(Date.now() + 16 * 60 * 1000);
  });

  it('possession of reference+email reads status but not private fields', async () => {
    const r = await book(request(app));
    const ref = r.body.reference;
    const wrongEmail = await request(app)
      .get(`/api/v1/reservations/${ref}`).query({ email: 'you@example.com' });
    expect(wrongEmail.status).toBe(403);
    const rightEmail = await request(app)
      .get(`/api/v1/reservations/${ref}`).query({ email: GUEST_CREDS.email });
    expect(rightEmail.status).toBe(200);
    expect(rightEmail.body.reference).toBe(ref);
    expect(rightEmail.body.guest.phone).toBeUndefined();
    expect(rightEmail.body.guest.country).toBeUndefined();
    expect(rightEmail.body.guest.idNumber).toBeUndefined();
  });

  it('availability returns 503/4xx, never opaque 500, and books still sell when rooms exist', async () => {
    const res = await request(app).get('/api/v1/availability')
      .query({ checkIn: '2027-05-01', checkOut: '2027-05-04', adults: 2, children: 0, rooms: 1 });
    expect(res.status).toBe(200);
    const garden = res.body.results.find((r) => r.roomTypeSlug === 'garden-room');
    expect(garden).toBeTruthy();
    expect(garden.available).toBeTypeOf('boolean');
    expect(garden.plans.length).toBeGreaterThanOrEqual(1);
  });
});
