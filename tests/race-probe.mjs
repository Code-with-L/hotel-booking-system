// Concurrency probe: fire N parallel reservation requests for the 5-unit Signature Retreat.
const BASE = 'http://localhost:4000/api/v1';
const run = Date.now();
const mk = (i) => ({
  roomTypeSlug: 'signature-retreat',
  ratePlanKey: 'flexible',
  checkIn: '2027-03-01',
  checkOut: '2027-03-03',
  adults: 2, children: 0, rooms: 1,
  source: 'web',
  guest: { firstName: `Race${i}`, lastName: 'Test', email: `race${i}.${run}@example.com`, phone: '+254712000000', country: 'Kenya', requests: '', privacy: true },
});

const N = Number(process.argv[2] || 7);
const attempts = await Promise.all(Array.from({ length: N }, (_, i) =>
  fetch(`${BASE}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `race-${run}-${i}` },
    body: JSON.stringify(mk(i)),
  }).then(async (r) => ({ i, status: r.status, body: await r.json() }))
));
const tally = attempts.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});
console.log('HTTP status tally:', JSON.stringify(tally));
const created = attempts.filter((a) => a.status === 201).map((a) => a.body.reference);
const conflicts = attempts.filter((a) => a.status === 409).map((a) => a.body?.error?.code);
console.log('created:', created.join(', ') || '(none)');
console.log('conflicts:', conflicts.join(', ') || '(none)');
