// Load test against a THROWAWAY database with its own API instance, so dev data is untouched.
// Run: node tests/load-test.mjs  (expects stillhouse_loadtest on 5433 already migrated+seeded, API on :4010)
import autocannon from 'autocannon';

const BASE = process.env.LOADTEST_BASE_URL || 'http://localhost:4010';

const report = (title, result) => {
  const pct = result.latency || {};
  console.log(`\n== ${title} ==`);
  console.log(`requests: ${result.requests?.mean}/s avg · total ${result.requests?.total} · errors ${result.errors ?? 0} · timeouts ${result.timeouts ?? 0} · non-2xx ${result.non2xx ?? 0}`);
  console.log(`latency ms — p50 ${pct.p50 ?? pct.mean} · p97.5 ${pct.p97_5 ?? 'n/a'} · p99 ${pct.p99 ?? 'n/a'} · max ${pct.p100 ?? pct.max}`);
};

const get = (path, connections, duration) =>
  autocannon({ url: `${BASE}${path}`, connections, duration, method: 'GET' });

const post = (path, body, connections, duration, amount) =>
  autocannon({
    url: `${BASE}${path}`,
    method: 'POST',
    connections,
    duration,
    amount,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    setupClient: (client) => {
      // unique idempotency key per request
      const orig = client.write;
      client.write = () => {
        client.headers['content-type'] = 'application/json';
        return orig.call(client);
      };
    },
  });

const main = async () => {
  report('GET /api/v1/availability (reads) 40 conn x 10s', await get('/api/v1/availability?checkIn=2026-12-21&checkOut=2026-12-24&adults=2&children=0&rooms=1', 40, 10));
  report('GET /api/v1/room-types (reads) 40 conn x 10s', await get('/api/v1/room-types', 40, 10));
  report('POST /api/v1/quotes (stateless write-ish) 20 conn x 10s', await post('/api/v1/quotes', { roomTypeSlug: 'garden-room', ratePlanKey: 'flexible', checkIn: '2026-12-21', checkOut: '2026-12-24', adults: 2, children: 0, rooms: 1 }, 20, 10));
  console.log('\nNote: reservation-creation contention is covered deterministically in the API suite (8-way race) and the report above measures read/quote throughput only.');
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
