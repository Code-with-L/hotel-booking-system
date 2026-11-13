// M4 — Administrative operations: permissions, guards, finance, audit integrity.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { truncateBookingTables, GUEST_CREDS, ADMIN_CREDS, MANAGER_CREDS, TEST_DATABASE_URL } from './helpers.mjs';
import pg from 'pg';

const app = createApp();
const JSON_H = { 'Content-Type': 'application/json' };

const signIn = (agent, creds) => agent.post('/api/v1/auth/sign-in').send(creds);

const createBooking = (agent, overrides = {}) =>
  agent.post('/api/v1/reservations')
    .set(JSON_H)
    .set('Idempotency-Key', `m4-${Math.random().toString(36).slice(2)}-abcdefgh`)
    .send({
      roomTypeSlug: 'garden-room', ratePlanKey: 'flexible',
      checkIn: '2027-09-01', checkOut: '2027-09-03', adults: 2, children: 0, rooms: 1,
      guest: { firstName: 'M4', lastName: 'Test', email: GUEST_CREDS.email, phone: '+254 712 000 042', idNumber: '22334455', country: 'Kenya', requests: '', privacy: true, ...(overrides.guest || {}) },
      ...overrides,
    });

const allocatedRoomNumber = async (reference) => {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT r.number FROM room_allocation a
       JOIN room r ON r.id = a.room_id
       WHERE a.source_type = 'reservation' AND a.state = 'occupying'
         AND a.source_id = (SELECT id FROM reservation WHERE reference = $1)`,
      [reference]
    );
    return rows[0]?.number || null;
  } finally { await client.end(); }
};

describe('M4 permissions matrix (RBAC on new surfaces)', () => {
  beforeEach(truncateBookingTables);

  it('financial summary is manager/admin only', async () => {
    const guest = request.agent(app);
    await signIn(guest, GUEST_CREDS);
    expect((await guest.get('/api/v1/admin/reports/financial-summary')).status).toBe(403);

    const anon = request.agent(app);
    expect((await anon.get('/api/v1/admin/reports/financial-summary')).status).toBe(401);

    const manager = request.agent(app);
    await signIn(manager, MANAGER_CREDS);
    expect((await manager.get('/api/v1/admin/reports/financial-summary')).status).toBe(200);

    const admin = request.agent(app);
    await signIn(admin, ADMIN_CREDS);
    expect((await admin.get('/api/v1/admin/reports/financial-summary')).status).toBe(200);
  });

  it('room history requires staff role', async () => {
    const guest = request.agent(app);
    await signIn(guest, GUEST_CREDS);
    expect((await guest.get('/api/v1/admin/rooms/G01/history')).status).toBe(403);

    const manager = request.agent(app);
    await signIn(manager, MANAGER_CREDS);
    const hist = await manager.get('/api/v1/admin/rooms/G01/history');
    expect(hist.status).toBe(200);
    expect(hist.body.room.number).toBe('G01');
    expect(Array.isArray(hist.body.history)).toBe(true);
  });

  it('guest notes can only be written by staff', async () => {
    const guestAgent = request.agent(app);
    await signIn(guestAgent, GUEST_CREDS);
    const me = await guestAgent.get('/api/v1/auth/me');
    const guestId = me.body.account.guestId;
    expect((await guestAgent.patch(`/api/v1/admin/guests/${guestId}`).set(JSON_H).send({ notes: 'hijack' })).status).toBe(403);

    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    const ok = await staff.patch(`/api/v1/admin/guests/${guestId}`).set(JSON_H).send({ notes: 'Prefers a high floor. Quiet room.' });
    expect(ok.status).toBe(200);
    expect(ok.body.notes).toBe('Prefers a high floor. Quiet room.');
  });
});

describe('M4 room maintenance guard (no override)', () => {
  beforeEach(truncateBookingTables);

  it('rejects taking a room out of service while it holds an active reservation, then allows after cancellation', async () => {
    const created = await createBooking(request.agent(app), { roomTypeSlug: 'signature-retreat', checkIn: '2027-09-15', checkOut: '2027-09-17' });
    const ref = created.body.reference;
    const roomNumber = await allocatedRoomNumber(ref);
    expect(roomNumber).toBeTruthy();

    // A pending reservation occupies inventory — the room cannot go out of service
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    const blocked = await staff.patch(`/api/v1/admin/rooms/${roomNumber}`).set(JSON_H).send({ status: 'out_of_service', notes: 'Test maintenance' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain(ref);

    // Cancel the reservation; the room becomes eligible again
    const owner = request.agent(app);
    await signIn(owner, GUEST_CREDS);
    await owner.post(`/api/v1/reservations/${ref}/cancel`).set(JSON_H).send({ reason: 'maintenance test' });
    try {
      const allowed = await staff.patch(`/api/v1/admin/rooms/${roomNumber}`).set(JSON_H).send({ status: 'out_of_service', notes: 'HVAC service' });
      expect(allowed.status).toBe(200);
      expect(allowed.body.status).toBe('Out of service');
    } finally {
      // Restore the seeded inventory: out_of_service would leak into other test files
      // (file order varies) and shrink signature-retreat capacity for the M1 suite.
      const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await client.connect();
      try {
        await client.query("UPDATE room SET status = 'active', notes = NULL WHERE number = $1", [roomNumber]);
      } finally { await client.end(); }
    }
  });

  it('referenced active reservations cannot be displaced by maintenance (409 lists the reference)', async () => {
    const agent = request.agent(app);
    const created = await createBooking(agent, { roomTypeSlug: 'signature-retreat', checkIn: '2027-09-20', checkOut: '2027-09-22' });
    const ref = created.body.reference;
    const roomNumber = await allocatedRoomNumber(ref);
    const staff = request.agent(app);
    await signIn(staff, MANAGER_CREDS);
    const blocked = await staff.patch(`/api/v1/admin/rooms/${roomNumber}`).set(JSON_H).send({ status: 'out_of_service' });
    expect(blocked.status).toBe(409);
  });
});

describe('M4 check-in / check-out lifecycle', () => {
  beforeEach(truncateBookingTables);

  it('follows the state machine and rejects invalid transitions', async () => {
    const agent = request.agent(app);
    const created = await createBooking(agent, { roomTypeSlug: 'garden-room', checkIn: '2027-09-25', checkOut: '2027-09-27' });
    const ref = created.body.reference;

    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);

    // pending → checked_in directly: not allowed
    const skip = await staff.patch(`/api/v1/admin/reservations/${ref}`).set(JSON_H).send({ status: 'checked_in' });
    expect(skip.status).toBe(409);

    // pending → confirmed is no longer a bare status flip; it goes through desk settlement
    const confirm = await staff.post(`/api/v1/admin/reservations/${ref}/settle`).set(JSON_H).send({ reason: 'desk_payment', method: 'cash', amountMinor: created.body.pricing.totalMinor, note: 'settled at desk' });
    expect(confirm.status).toBe(201);
    expect(confirm.body.outcome).toBe('confirmed');

    // double settle: rejected
    const twice = await staff.post(`/api/v1/admin/reservations/${ref}/settle`).set(JSON_H).send({ reason: 'desk_payment', method: 'cash', amountMinor: created.body.pricing.totalMinor });
    expect(twice.status).toBe(409);

    // confirmed → checked_in
    const inHouse = await staff.patch(`/api/v1/admin/reservations/${ref}`).set(JSON_H).send({ status: 'checked_in' });
    expect(inHouse.status).toBe(200);

    // checked_in → checked_out
    const out = await staff.patch(`/api/v1/admin/reservations/${ref}`).set(JSON_H).send({ status: 'checked_out' });
    expect(out.status).toBe(200);
    expect(out.body.status).toBe('Checked-out');
  });

  it('concurrent desk settlements: exactly one wins, the rest get 409', async () => {
    const agent = request.agent(app);
    const created = await createBooking(agent, { roomTypeSlug: 'garden-room', checkIn: '2027-10-02', checkOut: '2027-10-04' });
    const ref = created.body.reference;
    const total = created.body.pricing.totalMinor;
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => staff.post(`/api/v1/admin/reservations/${ref}/settle`).set(JSON_H).send({ reason: 'desk_payment', method: 'cash', amountMinor: total }))
    );
    const oks = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(oks).toHaveLength(1);
    expect(conflicts.length).toBe(results.length - 1);
  });
});

describe('M4 financial authorization and audit integrity', () => {
  beforeEach(truncateBookingTables);

  it('desk payment moves money truthfully; financials reflect it', async () => {
    const agent = request.agent(app);
    const created = await createBooking(agent, { checkIn: '2027-10-05', checkOut: '2027-10-07' });
    const ref = created.body.reference;
    const total = created.body.pricing.totalMinor;

    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: ref, amountMinor: total, method: 'cash' });

    const fin = await staff.get('/api/v1/admin/reports/financial-summary');
    expect(fin.status).toBe(200);
    expect(fin.body.collectedMinor).toBe(total);
    expect(fin.body.outstandingReservations.find((r) => r.reference === ref)).toBeUndefined(); // settled
  });

  it('audit failure blocks the protected operation (reservation is NOT cancelled when audit cannot be written)', async () => {
    const agent = request.agent(app);
    const created = await createBooking(agent, { roomTypeSlug: 'garden-room', checkIn: '2027-10-10', checkOut: '2027-10-12' });
    const ref = created.body.reference;

    // Break the audit table deliberately, then restore immediately
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await client.query('ALTER TABLE audit_log RENAME TO audit_log_bak');
    try {
      const signedIn = await agent.post('/api/v1/auth/sign-in').send(GUEST_CREDS);
      expect(signedIn.status).toBe(200);

      const cancel = await agent.post(`/api/v1/reservations/${ref}/cancel`).set(JSON_H).send({ reason: 'audit integrity test' });
      expect(cancel.status).toBeGreaterThanOrEqual(400);
      expect(cancel.status).toBeLessThan(600);

      const check = await agent.get(`/api/v1/reservations/${ref}`);
      expect(check.body.status).toBe('pending'); // untouched — the whole transaction aborted
    } finally {
      await client.query('ALTER TABLE audit_log_bak RENAME TO audit_log');
      await client.end();
    }

    // Sanity: it cancels cleanly once audit works again
    const ok = await agent.post(`/api/v1/reservations/${ref}/cancel`).set(JSON_H).send({ reason: 'audit restored' });
    expect(ok.status).toBe(200);
    expect(ok.body.statusRaw).toBe('cancelled');
  });

  it('audit rows are written for notes edits', async () => {
    const meRes = await request.agent(app).post('/api/v1/auth/sign-in').send(GUEST_CREDS);
    const guestId = meRes.body.account.guestId;
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);
    await staff.patch(`/api/v1/admin/guests/${guestId}`).set(JSON_H).send({ notes: 'Allergic to shellfish.' });
    const audit = await staff.get('/api/v1/admin/audit-log?entity=guest&page=1&pageSize=5');
    const found = audit.body.rows.find((a) => a.entityId === String(guestId) && a.action === 'guest.notes_updated');
    expect(found).toBeTruthy();
  });
});

describe('M4 reservation search', () => {
  beforeEach(truncateBookingTables);

  it('q filters by reference and guest name', async () => {
    const agent = request.agent(app);
    const created = await createBooking(agent, { checkIn: '2027-11-01', checkOut: '2027-11-03', guest: { firstName: 'Zebra', lastName: 'Unique', email: 'zebra.unique@example.com', phone: '+254 712 000 111', idNumber: '66778899', country: 'Kenya', requests: '', privacy: true } });
    const ref = created.body.reference;
    const staff = request.agent(app);
    await signIn(staff, ADMIN_CREDS);

    const byRef = await staff.get(`/api/v1/admin/reservations?q=${ref}`);
    expect(byRef.body.rows.map((r) => r.reference)).toContain(ref);

    const byName = await staff.get('/api/v1/admin/reservations?q=zebra');
    expect(byName.body.rows.map((r) => r.reference)).toContain(ref);

    const noHit = await staff.get('/api/v1/admin/reservations?q=zzz-no-such-guest');
    expect(noHit.body.rows).toHaveLength(0);
  });
});
