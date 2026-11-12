// Daraja STK push + query against mocked HTTP. No network, no real credentials.
// Forks isolate modules per file, so we stub the environment before app modules import.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { truncateBookingTables, GUEST_CREDS, ADMIN_CREDS, TEST_DATABASE_URL } from './helpers.mjs';
import pg from 'pg';

vi.stubEnv('MPESA_ENV', 'sandbox');
vi.stubEnv('MPESA_CONSUMER_KEY', 'test-consumer-key');
vi.stubEnv('MPESA_CONSUMER_SECRET', 'test-consumer-secret');
vi.stubEnv('MPESA_SHORTCODE', '174379');
vi.stubEnv('MPESA_PASSKEY', 'test-passkey');
vi.stubEnv('MPESA_CALLBACK_URL', 'https://stillhouse.example/api/v1/webhooks/mpesa');

const calls = [];
const mockFetch = vi.fn(async (url, options = {}) => {
  calls.push({ url, options, body: options?.body ? JSON.parse(options.body) : null });
  const u = String(url);
  const respond = (status, json) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(json),
    json: async () => json,
  });
  if (u.includes('/oauth/v1/generate')) {
    return respond(200, { access_token: 'test-access-token', expires_in: '3599' });
  }
  if (u.includes('/mpesa/stkpush/v1/processrequest')) {
    return respond(200, {
      MerchantRequestID: 'mrc_test_mock',
      CheckoutRequestID: 'ws_CO_TEST_MOCK001',
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing',
    });
  }
  if (u.includes('/mpesa/stkpushquery/v1/query')) {
    const body = JSON.parse(options.body);
    if (body.CheckoutRequestID === 'ws_CO_TEST_MOCK001') {
      return respond(200, { ResponseCode: '0', ResultCode: '0', ResultDesc: 'The service request is processed successfully.' });
    }
    if (body.CheckoutRequestID === 'ws_CO_TEST_MOCK002') {
      return respond(200, { ResponseCode: '0', ResultCode: '1032', ResultDesc: 'Request cancelled by user' });
    }
    return respond(200, { ResponseCode: '0', ResultCode: '9999', ResultDesc: 'The transaction is being processed' });
  }
  throw new Error(`Unexpected outbound call in test: ${u}`);
});
vi.stubGlobal('fetch', mockFetch);

let app;
beforeAll(async () => {
  const mod = await import('../src/app.js');
  app = mod.createApp();
});

const createPendingBooking = async (agent) => {
  const idem = `mpesa-test-${Math.random().toString(36).slice(2)}-abcdef`;
  const res = await agent.post('/api/v1/reservations')
    .set('Content-Type', 'application/json')
    .set('Idempotency-Key', idem)
    .send({
      roomTypeSlug: 'garden-room',
      ratePlanKey: 'flexible',
      checkIn: '2027-07-05', checkOut: '2027-07-08',
      adults: 2, children: 0, rooms: 1,
      guest: { firstName: 'Mpesa', lastName: 'Test', email: GUEST_CREDS.email, phone: '+254 712 000 042', idNumber: '33445566', country: 'Kenya', requests: '', privacy: true },
    });
  expect(res.status).toBe(201);
  return res.body;
};

describe('daraja STK push (mocked HTTP)', () => {
  beforeEach(truncateBookingTables);

  it('initiates STK push with Daraja-correct payload and persists checkout request', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const booking = await createPendingBooking(agent);

    const res = await agent.post('/api/v1/payments').set('Content-Type', 'application/json').send({
      reservationReference: booking.reference, phone: '254712000042',
    });
    expect(res.status).toBe(201);
    expect(res.body.checkoutRequestId).toBe('ws_CO_TEST_MOCK001');
    expect(res.body.status).toBe('pending');

    const push = calls.find((c) => c.url.includes('/mpesa/stkpush/v1/processrequest'));
    expect(push).toBeTruthy();
    expect(push.body.BusinessShortCode).toBe('174379');
    expect(push.body.TransactionType).toBe('CustomerPayBillOnline');
    expect(push.body.Amount).toBe(String(Math.round(booking.pricing.totalMinor / 100)));
    expect(push.body.PhoneNumber).toBe('254712000042');
    expect(push.body.PartyB).toBe('174379');
    expect(push.body.AccountReference).toBe(booking.reference);
    expect(push.body.CallBackURL).toBe('https://stillhouse.example/api/v1/webhooks/mpesa');
    // Password must be base64(shortcode + passkey + timestamp of THAT request)
    expect(push.body.Password).toBe(Buffer.from(`174379test-passkey${push.body.Timestamp}`).toString('base64'));
    // Token was fetched first
    expect(calls.some((c) => c.url.includes('/oauth/v1/generate'))).toBe(true);

    // Payment recorded as pending with the Daraja checkout id
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const payment = await client.query('SELECT provider, "providerReference", status FROM payment WHERE "providerReference" = $1', ['ws_CO_TEST_MOCK001']);
    await client.end();
    expect(payment.rows).toEqual([{ provider: 'mpesa', providerReference: 'ws_CO_TEST_MOCK001', status: 'pending' }]);
  });

  it('staff requery confirms a paid reservation (STK query Path ResultCode 0)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const booking = await createPendingBooking(agent);
    await agent.post('/api/v1/payments').set('Content-Type', 'application/json').send({
      reservationReference: booking.reference, phone: '254712000042',
    });

    const staff = request.agent(app);
    await staff.post('/api/v1/auth/sign-in').send(ADMIN_CREDS);
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const payment = await client.query('SELECT id FROM payment WHERE "providerReference" = $1', ['ws_CO_TEST_MOCK001']);
    await client.end();

    const requery = await staff.post(`/api/v1/admin/payments/${payment.rows[0].id}/requery`);
    expect(requery.status).toBe(200);
    expect(requery.body.outcome).toBe('confirmed');

    const check = await agent.get(`/api/v1/reservations/${booking.reference}`);
    expect(check.body.status).toBe('confirmed');
  });

  it('staff requery with user-cancelled (1032) marks failed and releases the room', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const booking = await createPendingBooking(agent);
    // Hand-forge a pending payment row for the checkout id our mock answers with failure
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    const total = booking.pricing.totalMinor;
    const inserted = await client.query(
      `INSERT INTO payment ("reservationId", provider, "providerReference", "amountMinor", currency, status, "createdAt", "updatedAt")
       SELECT id, 'mpesa', 'ws_CO_TEST_MOCK002', $2, 'KES', 'pending', now(), now() FROM reservation WHERE reference = $1
       RETURNING id`,
      [booking.reference, total],
    );
    await client.end();

    const staff = request.agent(app);
    await staff.post('/api/v1/auth/sign-in').send(ADMIN_CREDS);
    const requery = await staff.post(`/api/v1/admin/payments/${inserted.rows[0].id}/requery`);
    expect(requery.status).toBe(200);
    expect(requery.body.outcome).toBe('failed');

    // Room returned to sale
    const check = await request(app).get('/api/v1/availability').query({
      checkIn: '2027-07-05', checkOut: '2027-07-08', adults: 2, children: 0, rooms: 1,
    });
    const garden = check.body.results.find((r) => r.roomTypeSlug === 'garden-room');
    expect(garden.available).toBe(true);
  });
});
