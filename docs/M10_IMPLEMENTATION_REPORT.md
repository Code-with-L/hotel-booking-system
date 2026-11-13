# M10 — Implementation report (Phase 0) — 2026-11-13

**Status: implemented and verified locally — NOT deployed. Production remains untouched (`27a8ff3` serves live). M-Pesa remains sandbox everywhere. G1 (Neon rotation) UNVERIFIED — not claimed complete; M10 production deployment is not authorized.**

Branch: `main`, uncommitted work as of this report. HEAD unchanged from `2ccffd9`.

## Delivered

### A. Financial invariants (DB + transaction)
- Migration `20261113000000_m10_financial_integrity`:
  - `ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'needs_allocation'`
  - **`payment_attempt_providerReference_succeeded_key`** partial unique index (attempt-scope once-only)
  - `payment_reservationId_status_idx`, `payment_attempt_reservationId_status_idx`
  - **`one_desk_succeeded_per_reservation`** partial unique index (v1 exact-full desk settlement) — droppable when partial desk ships
  - **Trigger `payment_over_total_guard` / function `payment_net_capture_guard()`** — no `succeeded` payment can push net capture above the reservation total (net of refunded attempts). Layers: reservation row lock + in-transaction aggregate + this trigger + `one_desk_succeeded_per_reservation`.
- Migration verified on the isolated test database (`prisma migrate deploy` clean: 6 migrations).
- Reservation confirmation serialized via `SELECT … FOR UPDATE` inside the shared funnel.

### B. Payment verification and recovery (verify-then-settle)
- Webhook (`POST /webhooks/mpesa`): callback bytes never settle anything. Every callback triggers a server-side `stkQuery` with our credentials; settlement branches on Daraja's answer (0 → settle; terminal failure → fail + release; 9999/null → leave pending; query failure → 503, sweeper/backup path).
- Net-capture guard layered in transaction before any `succeeded` flip (webhook + sweeps + queries).
- Ambiguous callback metadata no longer decides settlement; the `amount` field is corroboration only (fails closed on mismatch: payment flipped `failed`, room released, audit `payment.amount_mismatch`).
- `POST /payments` no longer returns `checkoutRequestId` (Possession of the reference is no longer enough to settle — Daraja decides).
- Desk settlements, manual desk payments, manager requery and sweeper requery all now route through the same confirmation funnel (`confirmReservationTx`) with `SELECT … FOR UPDATE` serialization.
- Idempotency everywhere: payment CAS (`updateMany … where status='pending'`), attempt-scope DB unique index, reservation row lock, replay-safe terminals.

### C. Worker and recovery
- `apps/api/src/worker.js` — dedicated background-jobs entry point (plus `npm run worker` in `apps/api`). Runs idempotent sweeps every 60 s against the DB with an `pg_advisory_lock(900000000001)`, immediate sweep on boot, cooperative SIGTERM shutdown.
- `apps/api/src/lib/sweepers.js` — shared sweep implementation (hold expiry, stale M-Pesa requery, arrival reminders, eTIMS retries, heartbeat to `setting['jobs.heartbeat']`); consumed by `server.js` (local/Docker) and `worker.js` (production shape).
- `GET /api/v1/jobs/health` — 404 unless `JOB_TOKEN` is set; 503 when no heartbeat or stale > 5 min; meant for the owner's external monitor (token-protected, unauthenticated probes get nothing).
- `/api/v1/ready` now carries an advisory `jobs: 'ok'|'stale'` field (never fails readiness for jobs).

### D. API protection
- Per-surface rate limits: `availabilityLimiter` (180/15 min default), `quoteLimiter` / `writeLimiter` (60/15 min default for writes: reservations, payments, enquiries, newsletter), while auth endpoints keep the failed-only 10/15 min `authLimiter`. Tunable via `PUBLIC_READ_RATE_MAX` / `PUBLIC_WRITE_RATE_MAX`.
- Correlation/request IDs: `req_<hex>` minted per request (or `X-Request-Id` pass-through, clamped), echoed in logs and embedded in audit rows.
- Write routes remain protected by the same RBAC and Zod validation; webhook bypass for rate limit preserved by design.

### E. Admin settlement (replaces the unpaid confirm)
- `PATCH /admin/reservations/:reference` no longer admits `pending → confirmed` (**409** with an explicit pointer to the settle endpoint).
- **`POST /api/v1/admin/reservations/:reference/settle`** — receptionist+, `reason ∈ {desk_payment, comp, management_override}`, exact-balance completion, role-gated comp/override (manager+), mandatory ≥ 8-char note for comp/override, `Idempotency` not required — serialized by the reservation row lock; atomic with allocation (same funnel).
- `POST /admin/payments/manual` retained and rewired to the same in-transaction lock + funnel path (deterministic `DESK-<id>-<rand>` reference, settlement cap computed inside the lock).
- Refund handler: reservation row lock + in-transaction refund-cap recomputation (double-refund race closed), deterministic `REFUND-<id>-<rand>` references.
- Admin paid/unpaid path unchanged; `payment-health` gains `needs_allocation` (high) and `stale_unverified_payments` (medium) findings.
- Admin UI: the bare "Confirmed" status picker can no longer confirm; a "Record desk settlement" flow (reason, method, amount — full balance, note, external ref) sits in the reservation drawer alongside the status select. Same UI primitives, no redesign.

## Explicitly NOT done / blocked on owner
- **Production deployment** — not authorized, not attempted.
- **Neon password rotation** — not executed here; G1 remains open (evidence block still needed: `docs/G1_NEON_ROTATION_EXECUTION_CHECKLIST.md`).
- **DB-8 trigger vs code-only net-capture guard** — trigger ships enabled in the migration as written (fail-closed by construction); disabling it is a `DROP TRIGGER` away, but the transaction-level guard and the review's Layer-1 check would then have to carry the invariant. Owner sign-off on shipping the DB trigger is still required as written in the M10 spec §15 G2.
- **Monitor wiring for heartbeat** (`/jobs/health` probe implementation, on-call routing) — owner decision pending G6.
- **Email pipeline / SMTP** — untouched; G5 open; newsletter/comps/confirmations remain `skipped`/logged honestly.
- **M9 P1/P2 items** — rate-limit store (M9-05 shared store), proxy verification on Vercel (M9-20), headers for SPA path (M9-25), indexing of remaining hot paths (M9-21), PII retention tooling (M9-15) — none of these are in this scope.

## Tests and verification (local, throwaway test DB)
- `npm test --workspace=@stillhouse/api` → **Test Files 11 passed (11); Tests 66 passed (66)**. Duration ~40 s.
- Web build: `npm run build --workspace=@stillhouse/web` → ✓ built in 3.41 s.
- Migration verified: fresh `migrate deploy` on the test database → 6 migrations, 0 errors.
- New regression suites: `apps/api/tests/m10.test.js` (settlement invariants, comp role/money flow, concurrent duplicate callbacks, verify-failure release, DB over-capture guard, hold-expiry settle re-allocation, sweeper+heartbeat, idempotency); `m10-mpesa-disabled.test.js` (honest 503 with Daraja unconfigured).
- **Concurrency evidence**: 5-way concurrent desk settlement → exactly one 201, rest 409; 4-way concurrent identical callbacks → 1 payment attempt `succeeded`, reservation confirmed exactly once (asserted against DB).
- **Failure-recovery evidence**: sweeper flip path + heartbeat asserted; webhook verify-503 path exercised (query-unavailable) and never settles; amount-mismatch path flips to failed + releases rooms + audits.
- Webhook e2e flow verified against mocked Daraja confirm/failure callbacks; no network calls to Safaricom were made (all suites mock HTTP).
- `scripts/inline-wasm.mjs` untouched — deployment-time Prisma client regeneration runs on Vercel's build.
