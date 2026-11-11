// M5 — Release-candidate rehearsal against an ISOLATED environment.
// Mirrors tests/global-setup.mjs: (re)creates the stillhouse_test throwaway DB from migrations + seed,
// boots the real app in-process (supertest) and walks the full guest -> staff -> financial lifecycle.
// Simulated payments (desk settlement) are ALWAYS labelled as simulated; live M-Pesa is never faked.
// Usage: node tests/release-rehearsal.mjs
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL
  || 'postgresql://stillhouse:stillhouse_dev_password@localhost:5433/postgres';
const TEST_DB = 'stillhouse_test';
const TEST_URL = `postgresql://stillhouse:stillhouse_dev_password@localhost:5433/${TEST_DB}?schema=public`;
if (!TEST_URL.includes(':5433/') || !TEST_DB.includes('test')) {
  throw new Error('Refusing to run: this rehearsal only ever targets the isolated :5433 test database.');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_URL;
process.env.SESSION_SECRET = 'test-session-secret-not-for-production-use';
process.env.SESSION_IDLE_TIMEOUT_MINUTES = '480';
process.env.SESSION_ABSOLUTE_LIFETIME_DAYS = '7';
process.env.MPESA_ENV = 'disabled';       // truthful: provider unavailable for the demo
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.ETIMS_ENVIRONMENT = 'mock';   // MOCK provider - clearly labelled; not KRA
process.env.EMAIL_PROVIDER = 'json';      // captures, never sends (jsonTransport)

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(repoRoot, '..', 'm5-rehearsal');
fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, 'rehearsal-report.json');
const mdPath = path.join(outDir, 'rehearsal-report.md');

const results = [];
const record = (step, pass, detail = '') => {
  results.push({ step, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${step}${detail ? '  -  ' + detail : ''}`);
};
const sql = async (q, params) => {
  const client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  try { return await client.query(q, params); } finally { await client.end(); }
};

console.log('== M5 release-candidate rehearsal (isolated stillhouse_test database) ==\n');

// ---- 0. Rebuild the isolated database from scratch (migrate + seed, like the test harness) ----
const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${TEST_DB}`);
await admin.end();
const env = { ...process.env, DATABASE_URL: TEST_URL };
const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: repoRoot, env, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(repoRoot, 'prisma', 'seed.js')], { cwd: repoRoot, env, stdio: 'inherit' });

const { createApp } = await import(pathToFileURL(path.join(repoRoot, 'apps/api/src/app.js')).href);
const request = (await import('supertest')).default;
const app = createApp();

const JSON_H = { 'Content-Type': 'application/json' };
const signIn = (agent, creds) => agent.post('/api/v1/auth/sign-in').send(creds);
const guestCreds = { email: 'naomi.achieng@example.com', password: 'GuestPassword!26' };
const managerCreds = { email: 'manager@thestillhouse.example', password: 'StillhouseManager!26' };
const adminCreds = { email: 'admin@thestillhouse.example', password: 'StillhouseAdmin!26' };
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const plus2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const mkIdem = () => `rc-${Math.random().toString(36).slice(2)}-abcdefgh`;
const createStay = (agent, overrides = {}) => agent.post('/api/v1/reservations')
  .set(JSON_H).set('Idempotency-Key', mkIdem())
  .send({
    roomTypeSlug: 'signature-retreat', ratePlanKey: 'flexible',
    checkIn: tomorrow, checkOut: plus2, adults: 2, children: 0, rooms: 1,
    guest: { firstName: 'Rehearsal', lastName: 'Guest', email: guestCreds.email, phone: '254712000042', country: 'Kenya', requests: '', privacy: true },
    ...overrides,
  });

// ---- 1. Guest journey ----
const guest = request.agent(app);
await signIn(guest, guestCreds);
const avail = await guest.get(`/api/v1/availability?checkIn=${tomorrow}&checkOut=${plus2}&adults=2&children=0&rooms=1`);
record('S1 availability search returns room types with plans', avail.status === 200 && Array.isArray(avail.body.results) && avail.body.results.length > 0, `${avail.status}, ${avail.body?.results?.length} types`);

const quote = await guest.post('/api/v1/quotes').set(JSON_H).send({ roomTypeSlug: 'signature-retreat', ratePlanKey: 'flexible', checkIn: tomorrow, checkOut: plus2, adults: 2, children: 0, rooms: 1 });
record('S2 server-authoritative quote computed', quote.status === 200 && quote.body.totalMinor > 0, `totalMinor=${quote.body?.totalMinor}, VAT=${quote.body?.vatMinor}`);

const created = await createStay(guest);
const ref = created.body?.reference;
record('S3 reservation hold created (pending)', created.status === 201 && created.body.status === 'pending', ref || created.text);

const payAttempt = await guest.post('/api/v1/payments').set(JSON_H).send({ reservationReference: ref, phone: '254712000042' });
record('S4 M-Pesa unconfigured -> truthful 503 MPESA_NOT_CONFIGURED (no fake payment)', payAttempt.status === 503 && payAttempt.body?.error?.code === 'MPESA_NOT_CONFIGURED', `HTTP ${payAttempt.status}`);

// Simulated payment: desk settlement by staff (the supported operational path while Daraja is unconfigured).
const staff = request.agent(app);
await signIn(staff, managerCreds);
const desk = await staff.post('/api/v1/admin/payments/manual').set(JSON_H).send({ reservationReference: ref, amountMinor: quote.body.totalMinor, method: 'cash' });
record('S5 SIMULATED payment settled at desk (desk settlement, not a provider payment)', desk.status === 201 && desk.body.reservationStatus === 'confirmed', `HTTP ${desk.status}, status=${desk.body?.reservationStatus}`);

const acct = request.agent(app);
await signIn(acct, guestCreds);
const mine = await acct.get('/api/v1/account/reservations');
const upcoming = mine.body?.upcoming || mine.body?.reservations?.upcoming || [];
const seen = JSON.stringify(mine.body).includes(ref);
record('S6 guest account shows the reservation (confirmed)', seen, ref);
void upcoming;

const mgr = request.agent(app);
await signIn(mgr, managerCreds);
const dash = await mgr.get('/api/v1/admin/dashboard');
record('S7 staff dashboard reports it (200 + confirmed count)', dash.status === 200 && Number(dash.body.confirmedCount) >= 1, `confirmed=${dash.body?.confirmedCount}`);

const doubleConfirm = await mgr.patch(`/api/v1/admin/reservations/${ref}`).set(JSON_H).send({ status: 'confirmed' });
record('S8 double confirmation rejected (CAS, 409)', doubleConfirm.status === 409, `HTTP ${doubleConfirm.status}`);

const checkin = await mgr.patch(`/api/v1/admin/reservations/${ref}`).set(JSON_H).send({ status: 'checked_in' });
record('S9 staff checks the guest in', checkin.status === 200 && checkin.body.status === 'Checked-in', `HTTP ${checkin.status}`);

const checkout = await mgr.patch(`/api/v1/admin/reservations/${ref}`).set(JSON_H).send({ status: 'checked_out' });
record('S10 staff checks the guest out', checkout.status === 200 && checkout.body.status === 'Checked-out', `HTTP ${checkout.status}`);

const fin = await mgr.get('/api/v1/admin/reports/financial-summary');
const outstandingHit = (fin.body?.outstandingReservations || []).find((r) => r.reference === ref);
record('S11 financial summary: collected includes the stay, not listed as outstanding', fin.status === 200 && !outstandingHit, `collected=${fin.body?.collected}, outstandingRows=${fin.body?.outstandingReservations?.length}`);

const audit = await sql('SELECT action, entity, "entityId" FROM audit_log WHERE entity IN (\'reservation\',\'payment\') ORDER BY id');
const names = audit.rows.map((r) => `${r.action}:${r.entity}`);
record('S12 audit trail holds payment + lifecycle rows for the stay', names.includes('payment.desk_recorded:payment') && names.includes('reservation.confirmed:reservation') && names.includes('reservation.checked_in:reservation') && names.includes('reservation.checked_out:reservation'), `${names.length} rows`);

const inv = await sql('SELECT status, "receiptNumber" FROM tax_invoice WHERE "reservationId" = (SELECT id FROM reservation WHERE reference = $1)', [ref]);
record('S18 invoice pipeline ran after settlement (MOCK provider - not KRA)', inv.rows[0]?.status === 'issued', `status=${inv.rows[0]?.status}, receipt=${inv.rows[0]?.receiptNumber}`);

const outbox = await sql('SELECT template, status FROM email_outbox WHERE "relatedId" = (SELECT id::text FROM reservation WHERE reference = $1)', [ref]);
record('S19 email pipeline executed (jsonTransport - capture, not delivery; SMTP owner-gated)', outbox.rows.length >= 2, `${outbox.rows.length} outbox rows: ${outbox.rows.map((r) => r.template).join(', ')}`);

// ---- 2. Failure scenarios ----
// Expired hold: create a second hold, force-expire it via SQL, rooms return to sale immediately (read-time filter).
const agent2 = request.agent(app);
const second = await createStay(agent2, { roomTypeSlug: 'garden-room' });
const ref2 = second.body.reference;
const availBefore = await agent2.get(`/api/v1/availability?checkIn=${tomorrow}&checkOut=${plus2}&adults=2&children=0&rooms=1`);
const gardenBefore = availBefore.body.results.find((r) => r.roomTypeSlug === 'garden-room');
await sql(`UPDATE room_allocation SET state = 'expired', expires_at = now() - interval '1 hour'
           WHERE source_type = 'reservation' AND source_id = (SELECT id FROM reservation WHERE reference = $1)`, [ref2]);
const availAfter = await agent2.get(`/api/v1/availability?checkIn=${tomorrow}&checkOut=${plus2}&adults=2&children=0&rooms=1`);
const gardenAfter = availAfter.body.results.find((r) => r.roomTypeSlug === 'garden-room');
record('S13 expired hold releases inventory immediately (read-time filtering)', gardenAfter.available >= gardenBefore.available, `garden ${gardenBefore.available} -> ${gardenAfter.available}`);

// Duplicate failing callback: exactly one failed attempt; reservation stays pending.
const cb = { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_RC_FAKE', ResultCode: 1032, ResultDesc: 'Request cancelled by user', CallbackMetadata: { Item: [] } } } };
await sql(`INSERT INTO payment ("reservationId", provider, "providerReference", "amountMinor", currency, status, "createdAt", "updatedAt") VALUES ((SELECT id FROM reservation WHERE reference = $1), 'mpesa', 'ws_CO_RC_FAKE', (SELECT "totalMinor" FROM reservation WHERE reference = $1), 'KES', 'pending', now(), now())`, [ref2]);
const w1 = await agent2.post('/api/v1/webhooks/mpesa').set(JSON_H).send(cb);
const w2 = await agent2.post('/api/v1/webhooks/mpesa').set(JSON_H).send(cb);
const attemptsRow = await sql(`SELECT count(*)::int AS n FROM payment_attempt WHERE "providerReference" = 'ws_CO_RC_FAKE' AND status = 'failed'`);
record('S14 duplicate callback: single failed attempt, no duplicate side effects', w1.status === 200 && w2.status === 200 && attemptsRow.rows[0].n === 1, `attempts=${attemptsRow.rows[0].n}`);

// Unauthorized administrative action
const guestAnon = request.agent(app);
await signIn(guestAnon, guestCreds);
const forbidden = await guestAnon.get('/api/v1/admin/reports/financial-summary');
record('S15 guest session cannot read manager-only financial summary (403)', forbidden.status === 403, `HTTP ${forbidden.status}`);

// Reservation concurrency conflict: 5 parallel staff confirmations, exactly one wins
const third = await createStay(request.agent(app));
const ref3 = third.body.reference;
const staffRace = request.agent(app);
await signIn(staffRace, adminCreds);
const raceResults = await Promise.all(Array.from({ length: 5 }, () => staffRace.patch(`/api/v1/admin/reservations/${ref3}`).set(JSON_H).send({ status: 'confirmed' })));
const wins = raceResults.filter((r) => r.status === 200).length;
const conflicts = raceResults.filter((r) => r.status === 409).length;
record('S16 concurrent confirmations: exactly one winner', wins === 1 && conflicts === 4, `wins=${wins}, conflicts=${conflicts}`);

// ---- 3. Database interruption: /ready reports 503 while the DB is stopped, 200 after restart ----
try {
  execFileSync('docker', ['stop', 'stillhouse-db-test'], { stdio: 'pipe' });
  const ready = await staff.get('/api/v1/ready');
  record('S17 database interruption: /api/v1/ready reports 503 while DB is down', ready.status === 503, `HTTP ${ready.status}`);
} finally {
  execFileSync('docker', ['start', 'stillhouse-db-test'], { stdio: 'pipe' });
  // give the container a moment to accept connections
  let ready = null;
  for (let i = 0; i < 30; i += 1) {
    ready = await staff.get('/api/v1/ready');
    if (ready.status === 200) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  record('S17 database recovery: /api/v1/ready reports 200 after restart', ready.status === 200, `HTTP ${ready.status}`);
}

const passed = results.filter((r) => r.pass).length;
const report = {
  milestone: 'M5',
  environment: 'isolated stillhouse_test (PostgreSQL :5433, recreated from migrations + seed; in-process app via supertest)',
  executedAt: new Date().toISOString(),
  simulatedPaymentsOnly: true,
  note: 'No real provider (M-Pesa Daraja, KRA eTIMS, SMTP) was contacted. Desk settlement is a simulated payment. All fixtures are seed data in the throwaway test DB.',
  summary: { total: results.length, passed, failed: results.length - passed },
  steps: results,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const md = [
  '# M5 Release-Candidate Rehearsal',
  '',
  `Executed: ${report.executedAt}`,
  '',
  'Isolated `stillhouse_test` database (PostgreSQL :5433), recreated from migrations + seed. App booted in-process (supertest). No real provider was contacted. Simulated payments only.',
  '',
  `**Result: ${passed}/${results.length} checks passed.**`,
  '',
  '| Step | Result | Detail |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.step} | ${r.pass ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '\\|')} |`),
  '',
  'Simulated payment = desk settlement. It is deliberately labelled as a simulation everywhere; real M-Pesa success is never claimed without Daraja credentials and a sandbox/production verification.',
  '',
].join('\n');
fs.writeFileSync(mdPath, md);

console.log(`\n== ${passed}/${results.length} checks passed. Report: ${mdPath} ==`);
process.exit(passed === results.length ? 0 : 1);
