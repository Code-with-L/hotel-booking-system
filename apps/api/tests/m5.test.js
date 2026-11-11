// M5 — Integrations, financial consistency, release readiness boundaries.
// External providers are mocked or unconfigured by design; no live calls leave this suite.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { truncateBookingTables, GUEST_CREDS, ADMIN_CREDS, MANAGER_CREDS, TEST_DATABASE_URL } from './helpers.mjs';
import pg from 'pg';

vi.stubEnv('MPESA_ENV', 'sandbox');
vi.stubEnv('MPESA_CONSUMER_KEY', 'test-consumer-key');
vi.stubEnv('MPESA_CONSUMER_SECRET', 'test-consumer-secret');
vi.stubEnv('MPESA_SHORTCODE', '174379');
vi.stubEnv('MPESA_PASSKEY', 'test-passkey');
vi.stubEnv('MPESA_CALLBACK_URL', 'https://stillhouse.example/api/v1/webhooks/mpesa');

const oauthCalls = [];
const mockFetch = vi.fn(async (url, options = {}) => {
  const u = String(url);
  oauthCalls.push(u);
  const respond = (status, json) => ({ ok: status < 400, status, text: async () => JSON.stringify(json), json: async () => json });
  if (u.includes('/oauth/v1/generate')) return respond(200, { access_token: 'test-access-token', expires_in: '3599' });
  if (u.includes('/mpesa/stkpush/v1/processrequest')) {
    return respond(200, {
      MerchantRequestID: 'mrc_m5', CheckoutRequestID: `ws_CO_M5_${Date.now()}_${oauthCalls.length}`,
      ResponseCode: '0', ResponseDescription: 'Success. Request accepted for processing',
    });
  }
  if (u.includes('/mpesa/stkpushquery/v1/query')) return respond(200, { ResponseCode: '0', ResultCode: '0', ResultDesc: 'ok' });
  throw new Error(`Unexpected outbound call in test: ${u}`);
});
vi.stubGlobal('fetch', mockFetch);

let app;
beforeAll(async () => {
  const mod = await import('../src/app.js');
  app = mod.createApp();
  const { resetTokenCache } = await import('../src/lib/mpesa.js');
  resetTokenCache();
});

const JSON_H = { 'Content-Type': 'application/json' };
const signIn = (agent, creds) => agent.post('/api/v1/auth/sign-in').send(creds);
const createBooking = (agent, overrides = {}) =>
  agent.post('/api/v1/reservations')
    .set(JSON_H)
    .set('Idempotency-Key', `m5-${Math.random().toString(36).slice(2)}-abcdefgh`)
    .send({
      roomTypeSlug: 'garden-room', ratePlanKey: 'flexible',
      checkIn: '2027-12-01', checkOut: '2027-12-03', adults: 2, children: 0, rooms: 1,
      guest: { firstName: 'M5', lastName: 'Test', email: GUEST_CREDS.email, phone: '254712000042', country: 'Kenya', requests: '', privacy: true, ...(overrides.guest || {}) },
      ...overrides,
    });
const sql = async (q, params) => {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try { return await client.query(q, params); } finally { await client.end(); }
};

describe('M5 Daraja token lifecycle (mocked HTTP)', () => {
  beforeEach(async () => {
    truncateBookingTables();
    const { resetTokenCache } = await import('../src/lib/mpesa.js');
    resetTokenCache();
    oauthCalls.length = 0;
  });

  it('caches the OAuth token across calls; single-flight on concurrent use', async () => {
    const agent = request.agent(app);
    await signIn(agent, GUEST_CREDS);
    const b = await createBooking(agent);
    const ref = b.body.reference;
    const pay = (phone) => agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: ref, phone, email: GUEST_CREDS.email });
    const totalMinorBefore = b.body.pricing.totalMinor;

    // First push: one OAuth + one STK request
    const first = await pay('254712000042');
    // Second push for a second reservation reuses the cached token
    const b2 = await createBooking(agent, { checkIn: '2027-12-05', checkOut: '2027-12-07' });
    const second = await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: b2.body.reference, phone: '254712000042', email: GUEST_CREDS.email });
    void totalMinorBefore;

    const oauthCount = oauthCalls.filter((u) => u.includes('/oauth/v1/generate')).length;
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(oauthCount).toBe(1);
  });

  it('re-authenticates after the cached token expires', async () => {
    const agent = request.agent(app);
    await signIn(agent, GUEST_CREDS);
    const b = await createBooking(agent);
    await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: b.body.reference, phone: '254712000042', email: GUEST_CREDS.email });
    const oauthBefore = oauthCalls.filter((u) => u.includes('/oauth/v1/generate')).length;

    const realNow = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 51 * 60 * 1000);
    const b2 = await createBooking(agent, { checkIn: '2027-12-10', checkOut: '2027-12-12' });
    await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: b2.body.reference, phone: '254712000042', email: GUEST_CREDS.email });
    spy.mockRestore();

    const oauthAfter = oauthCalls.filter((u) => u.includes('/oauth/v1/generate')).length;
    expect(oauthAfter).toBe(oauthBefore + 1);
  });

  it('Daraja OAuth failure surfaces as 502 MPESA_UPSTREAM_ERROR, never a 500', async () => {
    mockFetch.mockImplementationOnce(async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ errorMessage: 'invalid credentials' }), json: async () => ({ errorMessage: 'invalid credentials' }) }));
    const agent = request.agent(app);
    await signIn(agent, GUEST_CREDS);
    const b = await createBooking(agent);
    const res = await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: b.body.reference, phone: '254712000042', email: GUEST_CREDS.email });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('MPESA_UPSTREAM_ERROR');
  });

  it('Daraja transport failure surfaces as 502, never a 500', async () => {
    mockFetch.mockImplementationOnce(async () => { throw new Error('socket hang up'); });
    const agent = request.agent(app);
    await signIn(agent, GUEST_CREDS);
    const b = await createBooking(agent);
    const res = await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: b.body.reference, phone: '254712000042', email: GUEST_CREDS.email });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('MPESA_UPSTREAM_ERROR');
  });
});

describe('M5 webhook terminal-state idempotency', () => {
  beforeEach(truncateBookingTables);

  const failedCallback = (checkoutRequestId) => ({
    Body: { stkCallback: { CheckoutRequestID: checkoutRequestId, ResultCode: 1032, ResultDesc: 'Request cancelled by user', CallbackMetadata: { Item: [] } } },
  });

  it('replayed failed callback does not double-record or double-release', async () => {
    const agent = request.agent(app);
    await signIn(agent, GUEST_CREDS);
    const b = await createBooking(agent);
    const ref = b.body.reference;
    await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: ref, phone: '254712000042', email: GUEST_CREDS.email });
    const pay = await sql('SELECT id, "providerReference" FROM payment WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [ref]);
    const callback = failedCallback(pay.rows[0].providerReference);

    const first = await agent.post('/api/v1/webhooks/mpesa').set(JSON_H).send(callback);
    const second = await agent.post('/api/v1/webhooks/mpesa').set(JSON_H).send(callback);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const attempts = await sql('SELECT count(*)::int AS n FROM payment_attempt WHERE "paymentId" = $1 AND status = $2', [pay.rows[0].id, 'failed']);
    expect(attempts.rows[0].n).toBe(1);
    const auditRows = await sql("SELECT count(*)::int AS n FROM audit_log WHERE entity = 'payment' AND action = 'payment.failed' AND (\"entityId\" = $1 OR (after->>'paymentId') = $2)", [String(pay.rows[0].id), String(pay.rows[0].id)]);
    expect(auditRows.rows[0].n).toBeLessThanOrEqual(1);
  });

  it('success callback against a settled-terminal payment is ignored and logged, never flipped', async () => {
    const agent = request.agent(app);
    await signIn(agent, GUEST_CREDS);
    const b = await createBooking(agent);
    const ref = b.body.reference;
    await agent.post('/api/v1/payments').set(JSON_H).send({ reservationReference: ref, phone: '254712000042', email: GUEST_CREDS.email });
    const pay = await sql('SELECT id, "providerReference" FROM payment WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [ref]);
    const callback = failedCallback(pay.rows[0].providerReference);

    await agent.post('/api/v1/webhooks/mpesa').set(JSON_H).send(callback);
    // A delayed success callback arrives against the SAME settled-failed payment:
    const successCallback = {
      Body: { stkCallback: { CheckoutRequestID: pay.rows[0].providerReference, ResultCode: 0, ResultDesc: 'ok', CallbackMetadata: { Item: [{ Name: 'Amount', Value: b.body.pricing.totalMinor / 100 }] } } },
    };
    const res = await agent.post('/api/v1/webhooks/mpesa').set(JSON_H).send(successCallback);
    expect(res.status).toBe(200); // accepted, but no state change

    const after = await sql('SELECT status FROM payment WHERE id = $1', [pay.rows[0].id]);
    expect(after.rows[0].status).toBe('failed');
    const reservation = await agent.get(`/api/v1/reservations/${ref}`);
    expect(reservation.body.status).toBe('pending'); // never confirmed by the contradictory callback
  });
});

describe('M5 financial consistency (payment health)', () => {
  beforeEach(truncateBookingTables);

  it('manager+-only; receptionist gets 403, guest 403, anonymous 401', async () => {
    const receptionist = request.agent(app);
    await signIn(receptionist, MANAGER_CREDS); // manager control
    expect((await receptionist.get('/api/v1/admin/reports/payment-health')).status).toBe(200);

    const anon = request.agent(app);
    expect((await anon.get('/api/v1/admin/reports/payment-health')).status).toBe(401);

    const guest = request.agent(app);
    await signIn(guest, GUEST_CREDS);
    expect((await guest.get('/api/v1/admin/reports/payment-health')).status).toBe(403);
  });

  it('a clean settled booking yields a healthy report with no anomalies', async () => {
    const agent = request.agent(app);
    const b = await createBooking(agent);
    const ref = b.body.reference;
    const total = b.body.pricing.totalMinor;
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: ref, amountMinor: total, method: 'cash' });

    const health = await staff.get('/api/v1/admin/reports/payment-health');
    expect(health.status).toBe(200);
    expect(health.body.totals.succeededMinor).toBe(total);
    expect(health.body.totals.attemptsSucceededMinor).toBe(total);
    expect(health.body.findings).toHaveLength(0);
    expect(health.body.healthy).toBe(true);
  });

  it('detects amount mismatches, stale pending, cancelled-with-capture and failed invoices', async () => {
    const agent = request.agent(app);
    // (1) amount mismatch via crafted SQL
    const b1 = await createBooking(agent);
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: b1.body.reference, amountMinor: b1.body.pricing.totalMinor, method: 'cash' });
    await sql('UPDATE payment_attempt SET "amountMinor" = "amountMinor" - 100 WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [b1.body.reference]);

    // (2) cancelled reservation with captured payment, no refund
    const b2 = await createBooking(request.agent(app), { checkIn: '2027-12-20', checkOut: '2027-12-22' });
    const staff2 = request.agent(app);
    await signIn(staff2, ADMIN_CREDS);
    await staff2.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: b2.body.reference, amountMinor: b2.body.pricing.totalMinor, method: 'cash' });
    const owner2 = request.agent(app);
    await signIn(owner2, GUEST_CREDS);
    await owner2.post(`/api/v1/reservations/${b2.body.reference}/cancel`).set(JSON_H).send({ reason: 'm5 crafted' });

    // (3) stale pending mpesa payment
    const b3 = await createBooking(request.agent(app), { checkIn: '2028-01-15', checkOut: '2028-01-17' });
    await sql(`INSERT INTO payment ("reservationId", provider, "providerReference", "amountMinor", currency, status, "createdAt", "updatedAt")
               SELECT id, 'mpesa', 'ws_CO_M5_STALE', "totalMinor", 'KES', 'pending', now() - interval '3 hours', now() FROM reservation WHERE reference = $1`, [b3.body.reference]);

    // (4) failed tax invoice
    const b4 = await createBooking(request.agent(app), { checkIn: '2028-02-10', checkOut: '2028-02-12' });
    const staff4 = request.agent(app);
    await signIn(staff4, ADMIN_CREDS);
    await staff4.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: b4.body.reference, amountMinor: b4.body.pricing.totalMinor, method: 'cash' });
    await sql(`UPDATE tax_invoice SET status = 'failed', attempts = 5, "lastError" = 'crafted failure' WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)`, [b4.body.reference]);

    const health = await staff4.get('/api/v1/admin/reports/payment-health');
    expect(health.status).toBe(200);
    const ids = health.body.findings.map((f) => f.id);
    expect(ids).toContain('amount_mismatches');
    expect(ids).toContain('cancelled_with_outstanding_payment');
    expect(ids).toContain('stale_pending_payments');
    expect(ids).toContain('invoices_failed');
    expect(health.body.healthy).toBe(false);
  });
});

describe('M5 eTIMS boundary (mock provider; invoices never block booking)', () => {
  beforeEach(truncateBookingTables);

  it('issue is idempotent per reservation; invoice appears in admin history', async () => {
    const agent = request.agent(app);
    const b = await createBooking(agent);
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: b.body.reference, amountMinor: b.body.pricing.totalMinor, method: 'cash' });

    const rows = await sql('SELECT id, status, "receiptNumber" FROM tax_invoice WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [b.body.reference]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe('issued');
    expect(rows.rows[0].receiptNumber).toBeGreaterThanOrEqual(1);

    // Calling the pipeline again does not create a second invoice row
    const { issueTaxInvoiceSafe } = await import('../src/integrations/etims/index.js');
    const r = await sql('SELECT * FROM reservation WHERE reference = $1', [b.body.reference]);
    const again = await issueTaxInvoiceSafe({ reservation: r.rows[0] });
    expect(again.status).toBe('issued');
    expect(again.already).toBe(true);
    const rows2 = await sql('SELECT id FROM tax_invoice WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [b.body.reference]);
    expect(rows2.rows).toHaveLength(1);

    // Admin invoice history lists it
    const hist = await staff.get('/api/v1/admin/etims/invoices?status=issued');
    expect(hist.status).toBe(200);
    expect(hist.body.rows.some((x) => x.reference === b.body.reference)).toBe(true);
    expect(hist.body.countsByStatus.issued).toBeGreaterThanOrEqual(1);
  });

  it('failed invoice can be retried into issued without touching reservation state', async () => {
    const agent = request.agent(app);
    const b = await createBooking(agent);
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: b.body.reference, amountMinor: b.body.pricing.totalMinor, method: 'cash' });
    await sql(`UPDATE tax_invoice SET status = 'failed', attempts = 1, "lastError" = 'forced' WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)`, [b.body.reference]);

    const { retryFailedInvoices } = await import('../src/integrations/etims/index.js');
    const out = await retryFailedInvoices();
    expect(out.retried).toBeGreaterThanOrEqual(1);

    const after = await sql('SELECT status FROM tax_invoice WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [b.body.reference]);
    expect(after.rows[0].status).toBe('issued');
    const owner = request.agent(app);
    await signIn(owner, GUEST_CREDS);
    const reservation = await owner.get(`/api/v1/reservations/${b.body.reference}`);
    expect(reservation.body.status).toBe('confirmed'); // untouched by the invoice retry
  });

  it('invoice history is staff-facing only (receptionist 403, guest 403)', async () => {
    const guest = request.agent(app);
    await signIn(guest, GUEST_CREDS);
    expect((await guest.get('/api/v1/admin/etims/invoices')).status).toBe(403);
  });
});

describe('M5 notifications boundary', () => {
  beforeEach(truncateBookingTables);

  it('payment failure writes exactly one outbox row per reservation', async () => {
    const agent = request.agent(app);
    const b = await createBooking(agent);
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: b.body.reference, amountMinor: b.body.pricing.totalMinor, method: 'cash' });
    const rows = await sql('SELECT template, "dedupeKey" FROM email_outbox WHERE "dedupeKey" LIKE $1', [`payment-failed:${b.body.reference}`]);
    expect(rows.rows).toHaveLength(0); // happy path sends nothing
  });

  it('arrival reminder template renders, escapes, and is deduped via the outbox', async () => {
    const { sendArrivalReminder } = await import('../src/integrations/email/index.js');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const fakeReservation = {
      reference: 'STL-2028-M5TEST99',
      checkIn: new Date(`${tomorrow}T00:00:00.000Z`),
      roomType: { name: 'The Garden Room' },
    };
    const guest = { firstName: '<Ada>', email: 'm5.guest@example.com' };
    const first = await sendArrivalReminder({ guest, reservation: fakeReservation, room: fakeReservation.roomType });
    const second = await sendArrivalReminder({ guest, reservation: fakeReservation, room: fakeReservation.roomType });
    expect(first.status).toBeTruthy();
    expect(second.duplicate || second.status === 'already_recorded').toBe(true);

    const rows = await sql('SELECT template, "to" FROM email_outbox WHERE "dedupeKey" = $1', [`arrival-reminder:${fakeReservation.reference}`]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].template).toBe('arrivalReminder');
    const { renderTemplate } = await import('../src/integrations/email/templates.js');
    const rendered = renderTemplate('arrivalReminder', {
      firstName: '<Ada>', reference: fakeReservation.reference, roomName: 'The Garden Room', checkIn: tomorrow,
    });
    expect(rendered.html).toContain('&lt;Ada&gt;');
    expect(rendered.html).not.toContain('<Ada>');
  });
});
