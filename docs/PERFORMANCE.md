# Performance — The Stillhouse

**All numbers below are measured on this workspace (Windows 11 ARM64, Docker Desktop, local NVMe), 2026-11-11.** Production numbers will differ; the *shape* matters, not the absolutes. Reproduce with `node tests/load-test.mjs` against a throwaway DB (`stillhouse_loadtest` on :5433, API on :4010, `RATE_LIMIT_MAX=1000000`).

## Headline measurements

| Endpoint | Before M2-E | After N+1 elimination |
|---|---|---|
| `GET /api/v1/availability` (40 conn × 10 s) | 120 rps · p50 316 ms · 5 783 2xx | **688 rps · p50 55 ms · 0 errors** |
| `POST /api/v1/quotes` (20 conn × 10 s) | 542 rps · p50 36 ms | **916 rps · p50 21 ms · p99 28 ms** |
| `GET /api/v1/room-types` (40 conn × 10 s) | ≈ same (already fast) | **2 262 rps · p50 17 ms** |

Availability budget breakdown after fix: 1 roomType query + 1 aggregated free-units query (single `FILTER (WHERE NOT EXISTS …)` instead of per-type allocation scans) + 1 prefetch of all relevant rate cards + in-memory pricing. ~5 queries per request instead of ~21.

## What was slow and why

1. **N+1 rate-card lookups** — one query *per room type per night*. Now one prefetch per request; `computeStayPricing` accepts prefetched cards.
2. **Per-room free-room probing** — allocation checks per type. Now one aggregate SQL with `NOT EXISTS` + `FILTER`, returning counts per type.
3. **Vite bundle** — vendor split (`react`, `gsap`) for long-term caching: app chunk 296 KB (was 475 KB).

## What is already adequate (don't "fix")

- 28 rooms / ~110 queries per admin dashboard load — trivial PostgreSQL work.
- Admin list endpoints are paginated/bounded (pageSize ≤ 100) or take-limited.
- Allocation GiST index + composite `reservation(status, checkIn)` cover the hot paths.
- bcrypt 12 (~300 ms/sign-in) dominates auth cost and is intentional.
- Single-node + managed Postgres is the correct scale for this property.

## Known non-goals / future

- No CDN image optimization pipeline yet (photos are still placeholders).
- Availability could cache per (dates, party) with 30 s TTL — unnecessary at this volume; revisit if public marketing traffic grows.
- `npm audit`: dev-only Prisma CLI chain resolved in M7 via root override `deepmerge-ts@^8.0.2` (advisory CVE-2026-40345); runtime tree is clean and Trivy CRITICAL/HIGH exits 0 on the API image. Remaining dev-chain residual: 3 moderate (autocannon→uuid/hyperid; dev-only, breaking-change fix).

## Verify after any performance change

`npm test --workspace=@stillhouse/api` (45/45, includes the 8-way reservation race) + `npx playwright test` (3/3) + `node tests/release-rehearsal.mjs` (20/20) + the load-test script.
