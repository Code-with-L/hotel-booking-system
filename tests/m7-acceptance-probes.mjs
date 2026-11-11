// M7 — Independent release acceptance probes. Runs against the LOCAL staging stack over real HTTPS.
// Usage:
//   node tests/m7-acceptance-probes.mjs              # all probes except the rate-limit lockout probe
//   node tests/m7-acceptance-probes.mjs --rate-limit # additionally trips the auth rate limiter (locks this IP for 15 min)
// Never touches production; fixture data only.
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envLines = Object.fromEntries(
  fs.readFileSync(path.join(repoRoot, '.env.staging'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const guest = { email: 'guest@stillhouse.staging', password: envLines.STAGING_SEED_GUEST_PASSWORD };
const admin = { email: 'admin@thestillhouse.staging', password: envLines.STAGING_SEED_ADMIN_PASSWORD };
const CA = fs.readFileSync(path.join(repoRoot, 'deploy', 'certs', 'staging.crt'));
const results = [];
const record = (name, pass, detail = '') => { results.push({ check: name, pass: Boolean(pass), detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`); };
const req = (method, p, body, headers = {}, opts = {}) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = ((opts.port === 8080 || opts.scheme === 'http') ? http : https).request(
      opts.scheme === 'http' || opts.port === 8080
        ? { host: '127.0.0.1', port: 8080, method, path: p, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }
        : { ...{ ca: CA, servername: 'staging.stillhouse.local', host: '127.0.0.1', port: 8443, rejectUnauthorized: true }, method, path: p, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => { let json = null; try { json = buf ? JSON.parse(buf) : null; } catch { json = null; } resolve({ status: res.statusCode, json, headers: res.headers, text: buf }); });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
const send = (c) => (c ? { Cookie: c } : {});

console.log('== M7 acceptance probes (https://staging.stillhouse.local:8443) ==\n');

// P1. Security headers on HTTPS responses
const home = await req('GET', '/');
const h = home.headers;
record('P1 HTTPS security headers (HSTS, CSP, nosniff, frame, referrer)',
  home.status === 200 && /max-age/.test(h['strict-transport-security'] || '') && Boolean(h['content-security-policy']) && h['x-content-type-options'] === 'nosniff' && h['x-frame-options'] === 'DENY' && Boolean(h['referrer-policy']),
  `hsts=${h['strict-transport-security'] ? 'yes' : 'NO'}, csp=${h['content-security-policy'] ? 'yes' : 'NO'}, nosniff=${h['x-content-type-options'] || 'NO'}, frame=${h['x-frame-options'] || 'NO'}`);

// P2. Plain HTTP: /healthz answers 200; everything else 301 -> HTTPS
const hz = await req('GET', '/healthz', null, {}, { port: 8080 });
const rootHttp = await req('GET', '/', null, {}, { port: 8080 });
record('P2 HTTP :8080 — /healthz 200, / redirects to HTTPS', hz.status === 200 && rootHttp.status === 301, `healthz=${hz.status}, /=${rootHttp.status}`);

// P3. Anonymous admin API access -> 401
const anon = await req('GET', '/api/v1/admin/reports/financial-summary');
record('P3 Anonymous admin report -> 401', anon.status === 401, `status=${anon.status}`);

// P4. Guest token on staff endpoint -> 403
const gLogin = await req('POST', '/api/v1/auth/sign-in', guest);
const gCookie = cookieOf(gLogin);
const guestOnAdmin = await req('GET', '/api/v1/admin/reports/financial-summary', null, send(gCookie));
record('P4 Guest credential on staff endpoint -> 403', guestOnAdmin.status === 403, `status=${guestOnAdmin.status}`);

// P5. Admin cookie flags + admin access -> 200
const aLogin = await req('POST', '/api/v1/auth/sign-in', admin);
const aCookie = cookieOf(aLogin);
const setCookies = aLogin.headers['set-cookie'] || [];
const flagsOk = setCookies.every((c) => /Secure/i.test(c) && /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c));
const adminReport = await req('GET', '/api/v1/admin/reports/financial-summary', null, send(aCookie));
record('P5 Admin sign-in cookie Secure+HttpOnly+SameSite=Lax; staff report -> 200', flagsOk && adminReport.status === 200, `cookies=${flagsOk}, status=${adminReport.status}`);

// P6. CORS: hostile origin must not be reflected
const evil = await req('GET', '/api/v1/availability?checkIn=2027-11-10&checkOut=2027-11-11&adults=2&children=0&rooms=1', null, { Origin: 'https://evil.example.com' });
const acao = evil.headers['access-control-allow-origin'];
record('P6 Hostile Origin not reflected in CORS headers', !acao || acao !== 'https://evil.example.com', `acao=${acao || '(absent)'} (static allowlist origin, never the request origin)`);

// P7. Webhook: malformed callback -> ResultCode 1, HTTP 200 (Daraja contract), never 5xx
const malformed = await req('POST', '/api/v1/webhooks/mpesa', { garbage: true });
const unknown = await req('POST', '/api/v1/webhooks/mpesa', { Body: { stkCallback: { CheckoutRequestID: 'ws_CO_TEST_NEVER_EXISTS_0001', ResultCode: 1, ResultDesc: 'nope' } } });
record('P7 Webhook rejects malformed/unknown callbacks without 5xx', malformed.status === 200 && malformed.json?.ResultCode === 1 && unknown.status === 200 && unknown.json?.ResultCode === 1, `malformed=${malformed.status}/ResultCode=${malformed.json?.ResultCode}, unknown=${unknown.status}/ResultCode=${unknown.json?.ResultCode}`);

// P8. Idempotency: same key twice -> identical reservation reference
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const bodyIdem = { roomTypeSlug: 'garden-room', ratePlanKey: 'flexible', checkIn: day(420), checkOut: day(421), adults: 2, children: 0, rooms: 1, guest: { firstName: 'Idem', lastName: 'Probe', email: 'idem.probe@example.com', phone: '254712000777', country: 'Kenya', requests: '', privacy: true } };
const key = 'm7-idem-' + Date.now();
const first = await req('POST', '/api/v1/reservations', bodyIdem, { 'Idempotency-Key': key });
const second = await req('POST', '/api/v1/reservations', bodyIdem, { 'Idempotency-Key': key });
record('P8 Idempotency replay returns the same reservation (no duplicates)', [200, 201].includes(first.status) && [200, 201].includes(second.status) && first.json?.reference === second.json?.reference, `first=${first.status}/${first.json?.reference}, second=${second.status}/${second.json?.reference}`);
const ref = first.json?.reference;

// P9. Desk settlement + two parallel check-in attempts (concurrent staff operations)
const quote = await req('POST', '/api/v1/quotes', { roomTypeSlug: 'garden-room', ratePlanKey: 'flexible', checkIn: day(420), checkOut: day(421), adults: 2, children: 0, rooms: 1 });
const desk = await req('POST', '/api/v1/admin/payments/manual', { reservationReference: ref, amountMinor: quote.json?.totalMinor, method: 'cash' }, send(aCookie));
const ciA = req('PATCH', `/api/v1/admin/reservations/${ref}`, { status: 'checked_in' }, send(aCookie));
const ciB = req('PATCH', `/api/v1/admin/reservations/${ref}`, { status: 'checked_in' }, send(aCookie));
const [ciARes, ciBRes] = await Promise.all([ciA, ciB]);
const statuses = [ciARes.status, ciBRes.status].sort().join(',');
record('P9 Desk settlement -> settled; two parallel check-ins resolve consistently (one 200, one 200/409)', desk.status === 201 && desk.json?.reservationStatus === 'confirmed' && (statuses === '200,200' || statuses === '200,409'), `settle=${desk.status}, check-ins=${statuses}`);

// P10. State machine: cancel of a checked-in reservation is rejected (400 by the owner's rules)
const cancelCheckedIn = await req('POST', `/api/v1/reservations/${ref}/cancel`, { reason: 'm7-probe' }, send(aCookie));
record('P10 State machine enforces transitions (cancel of checked-in rejected)', cancelCheckedIn.status === 400, `status=${cancelCheckedIn.status} msg=${cancelCheckedIn.json?.error?.message || cancelCheckedIn.json?.message || ''}`);
const checkOut = await req('PATCH', `/api/v1/admin/reservations/${ref}`, { status: 'checked_out' }, send(aCookie));
record('P10b Check-out from checked-in -> 200', checkOut.status === 200, `status=${checkOut.status}`);

// P11. Concurrency probe: 7 parallel holds for the 5-unit Signature Retreat, empty future window
const idemBase = Date.now();
const attempts = await Promise.all(Array.from({ length: 7 }, (_, i) =>
  req('POST', '/api/v1/reservations', {
    roomTypeSlug: 'signature-retreat', ratePlanKey: 'flexible', checkIn: day(400), checkOut: day(402), adults: 2, children: 0, rooms: 1,
    guest: { firstName: `Probe${i}`, lastName: 'Race', email: `m7.probe${i}.${idemBase}@example.com`, phone: '254712000999', country: 'Kenya', requests: '', privacy: true },
  }, { 'Idempotency-Key': `m7-race-${idemBase}-${i}` })
));
const tally = attempts.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});
const created201 = tally[201] || 0;
record('P11 Concurrent booking race: at most 5 holds succeed (5-unit property)', created201 <= 5 && (tally[409] || 0) + created201 === 7, `created=${created201}, tally=${JSON.stringify(tally)}`);
console.log('   race references:', attempts.filter((a) => a.status === 201).map((a) => a.json?.reference).join(', ') || '(none)');

// P12. Financial summary reflects activity and returns sane shape
const fin = await req('GET', '/api/v1/admin/reports/financial-summary', null, send(aCookie));
record('P12 Financial summary shape (collectedMinor number >= 0)', fin.status === 200 && typeof fin.json?.collectedMinor === 'number' && fin.json.collectedMinor >= 0, `collected=${fin.json?.collectedMinor}`);

// P13. Possession-of-reference read (reference + email) strips phone/country (M5 data-minimization fix)
const possessed = await req('GET', `/api/v1/reservations/${encodeURIComponent('STL-2026-TJT4J9')}?email=guest@stillhouse.staging`);
const guestPayload = possessed.json?.guest || {};
record('P13 Possession read strips phone/country; status visible', possessed.status === 200 && guestPayload.phone === undefined && guestPayload.country === undefined && Boolean(possessed.json?.statusRaw || possessed.json?.status), `status=${possessed.status}, phonePresent=${Boolean(guestPayload.phone)}, countryPresent=${Boolean(guestPayload.country)}`);

// P14. Rate limit probe (auth limiter) — ONLY with --rate-limit; locks this IP for 15 minutes
if (process.argv.includes('--rate-limit')) {
  const tries = await Promise.all(Array.from({ length: 12 }, () => req('POST', '/api/v1/auth/sign-in', { email: 'nobody@example.invalid', password: 'wrong-password-probe' })));
  const codes = tries.map((t) => t.status);
  const count429 = codes.filter((c) => c === 429).length;
  record('P14 Auth rate limiter engages (429 after threshold)', count429 >= 1, `codes=${codes.join(',')}`);
} else {
  console.log('SKIP  P14 auth rate-limit probe (pass --rate-limit to run; locks this IP for 15 min)');
}

const passed = results.filter((r) => r.pass).length;
const report = { executedAt: new Date().toISOString(), target: 'https://staging.stillhouse.local:8443', summary: { total: results.length, passed, failed: results.length - passed }, steps: results };
const outDir = path.resolve(repoRoot, '..', 'm6-rehearsal');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'm7-probe-results.json'), JSON.stringify(report, null, 2));
console.log(`\n== ${passed}/${results.length} probes passed ==\nReport: ${path.join(outDir, 'm7-probe-results.json')}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
