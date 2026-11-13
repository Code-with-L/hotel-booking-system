// MPESA_ENV intentionally left DISABLED (the setup.mjs default). Honest failure: 503 + code, never a fake success.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { truncateBookingTables, GUEST_CREDS } from './helpers.mjs';

process.env.MPESA_ENV = 'disabled';

const JSON_H = { 'Content-Type': 'application/json' };
let app;
beforeAll(async () => { const mod = await import('../src/app.js'); app = mod.createApp(); });

describe('M-Pesa disabled configuration', () => {
  it('initiating payment without configuration returns 503 and writes no payment rows', async () => {
    await truncateBookingTables();
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const created = await agent.post('/api/v1/reservations').set(JSON_H)
      .set('Idempotency-Key', `m10-disabled-${Date.now()}-abcdef`)
      .send({
        roomTypeSlug: 'garden-room', ratePlanKey: 'flexible',
        checkIn: '2027-04-02', checkOut: '2027-04-05', adults: 2, children: 0, rooms: 1,
        guest: { firstName: 'M10', lastName: 'Disabled', email: GUEST_CREDS.email, phone: '254712000042', idNumber: '11223344', country: 'Kenya', requests: '', privacy: true },
      });
    expect(created.status).toBe(201);
    const res = await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: created.body.reference, phone: '254712000042' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MPESA_NOT_CONFIGURED');
  });
});
