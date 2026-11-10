// Reservation engine: quotes, creation, holds, idempotency, cancellation, race safety, payments.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { truncateBookingTables, GUEST_CREDS, ADMIN_CREDS, TEST_DATABASE_URL } from './helpers.mjs';
import pg from 'pg';

const app = createApp();
const QUERY_MARK = { 'Content-Type': 'application/json' };

const createBooking = (agent, overrides = {}) =>
  agent.post('/api/v1/reservations')
    .set(QUERY_MARK)
    .set('Idempotency-Key', `test-${Math.random().toString(36).slice(2)}-${Date.now()}`)
    .send({
      roomTypeSlug: 'garden-room',
      ratePlanKey: 'flexible',
      checkIn: '2026-12-21',
      checkOut: '2026-12-24',
      adults: 2,
      children: 0,
      rooms: 1,
      source: 'web',
      guest: {
        firstName: 'Test', lastName: 'Guest', email: GUEST_CREDS.email,
        phone: '+254 712 345 678', country: 'Kenya', requests: '', privacy: true,
        ...(overrides.guest || {}),
      },
      ...overrides,
    });

describe('pricing & availability', () => {
  beforeEach(truncateBookingTables);

  it('quotes are computed server-side with s.13(7)-compliant VAT (SC and levy excluded)', async () => {
    const res = await request(app).post('/api/v1/quotes').set(QUERY_MARK).send({
      roomTypeSlug: 'garden-room', ratePlanKey: 'flexible',
      checkIn: '2026-12-21', checkOut: '2026-12-24', adults: 2, children: 0, rooms: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.subtotalMinor).toBe(7560000);       // 25,200 × 3
    expect(res.body.serviceChargeMinor).toBe(756000);   // 10%
    expect(res.body.tourismLevyMinor).toBe(151200);     // 2%
    expect(res.body.vatMinor).toBe(1209600);            // 16% of net subtotal only
    expect(res.body.totalMinor).toBe(9676800);
    expect(res.body.currency).toBe('KES');
  });

  it('rejects invalid date ranges and unknown room types', async () => {
    const bad = await request(app).post('/api/v1/quotes').set(QUERY_MARK).send({
      roomTypeSlug: 'garden-room', ratePlanKey: 'flexible', checkIn: '2026-12-24', checkOut: '2026-12-21',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const unknown = await request(app).post('/api/v1/quotes').set(QUERY_MARK).send({
      roomTypeSlug: 'overwater-villa', ratePlanKey: 'flexible', checkIn: '2026-12-21', checkOut: '2026-12-24',
    });
    expect(unknown.status).toBe(400);
  });

  it('availability reports room types with per-plan pricing', async () => {
    const res = await request(app).get('/api/v1/availability').query({
      checkIn: '2026-12-21', checkOut: '2026-12-24', adults: 2, children: 0, rooms: 1,
    });
    expect(res.status).toBe(200);
    const garden = res.body.results.find((r) => r.roomTypeSlug === 'garden-room');
    expect(garden.available).toBe(true);
    expect(garden.plans.length).toBeGreaterThanOrEqual(2);
    expect(garden.plans[0].pricing.totalMinor).toBeGreaterThan(0);
  });
});

describe('reservation lifecycle', () => {
  beforeEach(truncateBookingTables);

  it('creates a pending reservation, replays idempotently, and is visible in the guest account', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);

    const idem = `idem-${Math.random().toString(36).slice(2)}-abcdefgh`;
    const first = await agent.post('/api/v1/reservations')
      .set(QUERY_MARK).set('Idempotency-Key', idem)
      .send({
        roomTypeSlug: 'valley-suite', ratePlanKey: 'flexible',
        checkIn: '2026-12-28', checkOut: '2026-12-30', adults: 2, children: 0, rooms: 1,
        guest: { firstName: 'Naomi', lastName: 'Achieng', email: GUEST_CREDS.email, phone: '+254 712 000 042', country: 'Kenya', requests: 'Late arrival', privacy: true },
      });
    expect(first.status).toBe(201);
    expect(first.body.reference).toMatch(/^STL-\d{4}-[A-Z2-9]{6}$/);
    expect(first.body.status).toBe('pending');

    const replay = await agent.post('/api/v1/reservations')
      .set(QUERY_MARK).set('Idempotency-Key', idem)
      .send({
        roomTypeSlug: 'valley-suite', ratePlanKey: 'flexible',
        checkIn: '2026-12-28', checkOut: '2026-12-30', adults: 2, children: 0, rooms: 1,
        guest: { firstName: 'Naomi', lastName: 'Achieng', email: GUEST_CREDS.email, phone: '+254 712 000 042', country: 'Kenya', requests: 'Late arrival', privacy: true },
      });
    expect(replay.status).toBe(200);
    expect(replay.body.reference).toBe(first.body.reference);

    const account = await agent.get('/api/v1/account/reservations');
    expect(account.status).toBe(200);
    const refs = [...account.body.upcoming, ...account.body.previous].map((r) => r.reference);
    expect(refs).toContain(first.body.reference);

    const mine = await agent.get(`/api/v1/reservations/${first.body.reference}`);
    expect(mine.status).toBe(200);
    expect(mine.body.pricing.totalMinor).toBe(first.body.pricing.totalMinor);
  });

  it('cancellation releases the allocated room', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const created = await createBooking(agent, { roomTypeSlug: 'signature-retreat', checkIn: '2026-12-26', checkOut: '2026-12-28' });
    expect(created.status).toBe(201);
    const ref = created.body.reference;

    const cancel = await agent.post(`/api/v1/reservations/${ref}/cancel`).set(QUERY_MARK).send({ reason: 'Plans changed' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.statusRaw).toBe('cancelled');

    // Unit must be sellable again (no occupying allocation left)
    const check = await request(app).get('/api/v1/availability').query({
      checkIn: '2026-12-26', checkOut: '2026-12-28', adults: 2, children: 0, rooms: 1,
    });
    const sig = check.body.results.find((r) => r.roomTypeSlug === 'signature-retreat');
    expect(sig.available).toBe(true);
  });

  it('guest cannot see or cancel another guest’s reservation', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const created = await createBooking(agent, { roomTypeSlug: 'garden-room' });
    const ref = created.body.reference;

    const other = request.agent(app);
    await other.post('/api/v1/auth/register').send({
      email: 'someone.else@example.com', password: 'Sup3rSecret!', firstName: 'Someone', lastName: 'Else', country: 'Kenya',
    });
    expect((await other.get(`/api/v1/reservations/${ref}`)).status).toBe(403);
    expect((await other.post(`/api/v1/reservations/${ref}/cancel`).set(QUERY_MARK).send({ reason: 'not mine' })).status).toBe(403);
  });
});

describe('concurrency & overbooking safety', () => {
  beforeEach(truncateBookingTables);

  it('8 parallel bookings for 5 rooms produce exactly 5 wins and 3 ROOM_UNAVAILABLEs', async () => {
    // Block 4 of 5 Signature Retreat rooms? No - use the fresh table: 5 rooms free.
    const agent = request.agent(app);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createBooking(agent, {
        roomTypeSlug: 'signature-retreat',
        checkIn: '2027-02-10', checkOut: '2027-02-12',
        guest: { firstName: `Race${i}`, lastName: 'Test', email: `race${i}.${Date.now()}@example.com`, phone: '+254 712 000 000', country: 'Kenya', requests: '', privacy: true },
      }))
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    const conflicts = results.filter((r) => r.status === 409).map((r) => r.body?.error?.code);
    expect(conflicts).toEqual(['ROOM_UNAVAILABLE', 'ROOM_UNAVAILABLE', 'ROOM_UNAVAILABLE']);
  }, 60_000);

  it('a fully-blocked room type yields 409, never a silent overbook', async () => {
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      // Block every signature-retreat room for the target dates via the allocation ledger
      await client.query(`
        INSERT INTO room_allocation (room_id, check_in, check_out, kind, state, source_type, source_id, updated_at)
        SELECT r.id, '2027-03-05'::date, '2027-03-08'::date, 'block', 'occupying', 'inventory_block', 900001 + r.id, now()
        FROM room r JOIN room_type t ON t.id = r."roomTypeId" WHERE t.slug = 'signature-retreat'`);
    } finally {
      await client.end();
    }
    const agent = request.agent(app);
    const attempt = await createBooking(agent, { roomTypeSlug: 'signature-retreat', checkIn: '2027-03-05', checkOut: '2027-03-08' });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe('ROOM_UNAVAILABLE');
  });
});

describe('payment flow (Daraja unavailable → desk settlement)', () => {
  beforeEach(truncateBookingTables);

  it('initiating M-Pesa without configuration returns 503, never a fake success', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const created = await createBooking(agent, { checkIn: '2027-04-02', checkOut: '2027-04-05' });
    const res = await agent.post('/api/v1/payments').set(QUERY_MARK).send({
      reservationReference: created.body.reference, phone: '254712000042',
    });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('MPESA_NOT_CONFIGURED');
  });

  it('desk settlement confirms the reservation and is manager/receptionist only', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const created = await createBooking(agent, { checkIn: '2027-04-02', checkOut: '2027-04-04' });
    const ref = created.body.reference;

    const guestAttempt = await agent.post('/api/v1/admin/payments/manual').set(QUERY_MARK).send({
      reservationReference: ref, amountMinor: created.body.pricing.totalMinor, method: 'cash',
    });
    expect(guestAttempt.status).toBe(403);

    const staff = request.agent(app);
    await staff.post('/api/v1/auth/sign-in').send(ADMIN_CREDS);
    const wrongAmount = await staff.post('/api/v1/admin/payments/manual').set(QUERY_MARK).send({
      reservationReference: ref, amountMinor: 100, method: 'cash',
    });
    expect(wrongAmount.status).toBe(400);

    const paid = await staff.post('/api/v1/admin/payments/manual').set(QUERY_MARK).send({
      reservationReference: ref, amountMinor: created.body.pricing.totalMinor, method: 'cash', note: 'Settled at desk',
    });
    expect(paid.status).toBe(201);
    expect(paid.body.reservationStatus).toBe('confirmed');
  });

  it('Daraja-shaped callback confirms the reservation and replays safely', async () => {
    // Set up a pending reservation + pending payment with the provider reference the callback carries
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const created = await createBooking(agent, { checkIn: '2027-05-01', checkOut: '2027-05-03' });
    const total = created.body.pricing.totalMinor;
    const ref = created.body.reference;

    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    let paymentId;
    try {
      const payment = await client.query(
        `INSERT INTO payment ("reservationId", provider, "providerReference", "amountMinor", currency, status, "createdAt", "updatedAt")
         VALUES ((SELECT id FROM reservation WHERE reference = $1), 'mpesa', 'ws_CO_TEST123', $2, 'KES', 'pending', now(), now()) RETURNING id`,
        [ref, total]
      );
      paymentId = payment.rows[0].id;
    } finally { await client.end(); }

    const darajaBody = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'ws_123',
          CheckoutRequestID: 'ws_CO_TEST123',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: total / 100 },
              { Name: 'MpesaReceiptNumber', Value: 'RFT8XYZ123' },
              { Name: 'TransactionDate', Value: 202612010000 },
              { Name: 'PhoneNumber', Value: 254712000042 },
            ],
          },
        },
      },
    };

    const hook = await request(app).post('/api/v1/webhooks/mpesa').set(QUERY_MARK).send(darajaBody);
    expect(hook.status).toBe(200);
    expect(hook.body.ResultCode).toBe(0);

    const check = await agent.get(`/api/v1/reservations/${ref}`);
    expect(check.body.status).toBe('confirmed');

    // Replay must be idempotent
    const replay = await request(app).post('/api/v1/webhooks/mpesa').set(QUERY_MARK).send(darajaBody);
    expect(replay.status).toBe(200);
    expect(replay.body.ResultCode).toBe(0);
    const still = await agent.get(`/api/v1/reservations/${ref}`);
    expect(still.body.status).toBe('confirmed');

    // Amount mismatch must NOT confirm
    const created2 = await createBooking(agent, { checkIn: '2027-06-01', checkOut: '2027-06-02' });
    const ref2 = created2.body.reference;
    const client2 = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client2.connect();
    try {
      await client2.query(
        `INSERT INTO payment ("reservationId", provider, "providerReference", "amountMinor", currency, status, "createdAt", "updatedAt")
         VALUES ((SELECT id FROM reservation WHERE reference = $1), 'mpesa', 'ws_CO_TEST999', $2, 'KES', 'pending', now(), now())`,
        [ref2, created2.body.pricing.totalMinor]
      );
    } finally { await client2.end(); }
    const badHook = { Body: { stkCallback: { ...darajaBody.Body.stkCallback, CheckoutRequestID: 'ws_CO_TEST999', CallbackMetadata: { Item: [{ Name: 'Amount', Value: 1 }, { Name: 'MpesaReceiptNumber', Value: 'RFT8XYZ124' }] } } } };
    await request(app).post('/api/v1/webhooks/mpesa').set(QUERY_MARK).send(badHook);
    const stillPending = await agent.get(`/api/v1/reservations/${ref2}`);
    expect(stillPending.body.status).toBe('pending');
  });
});
