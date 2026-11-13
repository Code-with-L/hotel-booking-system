# M10 — Phase 0 Remediation Plan: the four P0s

**Date:** 2026-11-13 · **Status:** DESIGN AND PLANNING ONLY — nothing here is authorized to implement yet. **HEAD at audit:** `2ccffd9`. M8/M9 artifacts preserved. **No code, credential, database, Vercel/Render/Neon or Daraja changes made in this milestone.**

Cross-references: `docs/M9_PRODUCTION_HARDENING_AUDIT.md` (M9-01..04), `docs/M8_RELEASE_SECURITY_READINESS.md` (secret posture), `docs/SECURITY.md`, `docs/DATABASE_DESIGN.md`, `prisma/schema.prisma`, `apps/api/src/**` (as read in this audit; file:line citations).

**Spend control:** every infrastructure choice below is tagged **OWNER DECISION REQUIRED**. Nothing in this document may be executed (no branch push, no migration, no env change) without an explicit, separate instruction. Production remains `27a8ff3` and intentionally untouched; M-Pesa stays sandbox.

**Owner-authorized sequencing boundary, restated:** the Neon password rotation (M8 readiness §2) remains open and is prerequisite to anything M10 touches in production.

---

## 1. Technical root causes (precise)

### P0-01 — Daraja callback authenticity (`apps/api/src/modules/payments/routes.js:92-157`)

Root cause chain, in the order the code actually executes it:

1. **No signature exists.** Daraja does not sign callbacks (comment `routes.js:89-90`). Authenticity must come from something else, and the only remote check performed is an *optional* source-IP allowlist, **empty by default** (`env.js:56` → `MPESA_WEBHOOK_ALLOWED_IPS=''`; unset in every known env file).
2. **Possession of `CheckoutRequestID` + knowledge of the booking total suffices to forge a settlement.** `POST /payments` returns `checkoutRequestId` to the anonymous caller (`routes.js:85`); the callback needs nothing else (`routes.js:98-103`). `checkoutRequestId` is not-that-secret by design intent (it identifies an STK request), but possession-only authorisation was tolerated because the codebase treated it as an idempotency key *in addition* to verification — except there is no other verification.
3. **Amount equality is the only integrity check** (`routes.js:135`). It compares the callback's self-reported `Amount` to our row. A forger who knows their own booking total passes it. It detects Daraja-reported mismatches; it does not detect forgery.
4. **No independent settlement verification.** The admin requery path already proves `stkQuery` works (`routes.js:192-243`) and returns `resultCode`; the callback never performs it. The webhook trusts bytes off the wire.
5. **Terminal-state idempotency exists but is application-level** (check-then-transact outside the transaction, `routes.js:105-119`), and `payment_attempt.providerReference` is non-unique (`schema.prisma:374-384`) — concurrent duplicate callbacks can both reach the settle path (M9-10).
6. **`checkoutRequestId` escapes into API responses, logs (masked refs only — logs are fine) and `paymentAttempt.rawPayload` retains full Daraja JSON** (MSISDN + receipt number) — secure-handling gap, not a settlement one.

Punchline: **a forged callback is currently sufficient evidence of payment.** There is no path in the system where Daraja is asked "did this transaction settle?" before flipping state.

### P0-02 — Background jobs absent in production

Root cause: two entrypoints, two lifecycles.

- `apps/api/src/server.js` — the only file with `setInterval`: `sweepExpiredHolds` (`server.js:14-38`: holds→expired, pending→expired, stale sessions deleted), `sweepStalePayments` (`server.js:41-85`: re-queried M-Pesa pendings → settle/release), `sweepArrivalReminders` (`server.js:88-105`), `retryFailedInvoices`, `SWEEP_INTERVAL_MS = 60_000` (`server.js:11-12`, 112-117).
- `apps/api/src/app.js` — default-export `createApp()` (`app.js:80`); Vercel's `framework: express` uses this file as the function; it never `listen()`s; nothing schedules anything.
- `vercel.json` — no `crons` block; the `functions` keys cover `src/app.js` / `apps/api/src/app.js` only.
- Jobs are also absent from tests, so no regression signal exists.

Consequence on the documented-live topology (D-067, D-074): holds never expire; `expired` reservations never get flipped; inventory freezes after any single hold; stale payments never re-query; arrival reminders and required emails for tomorrow's guests never send; eTIMS retries never run; and `expired`-allocation release only converges on the request path (next search nudges inventory math via `state='occupying'` filtering — but nothing flips the rows, so the availability math silently overstates fullness while *any* hold ever existed on this deployment — booking inventory appears permanently scarce).

### P0-03 — Reservation allocation integrity (`lib/confirm.js:5-20` + `lib/allocations.js`)

Root cause: **update-then-ignore.** `confirmReservationTx` calls `promoteHoldAllocation`, discards the result, and unconditionally sets `status='confirmed'`. `promoteHoldAllocation` (`allocations.js:75-80`) flips `occupying` rows to `kind='reservation'` but:

- returns a count/`updateMany` result that nobody inspects;
- performs no fallback re-allocation when the hold already expired (`state='expired'`);
- has no `reservation.status` guard itself (it trusts its caller);
- is invoked from three surfaces (webhook, requery, sweeper) plus desk and seed — five call sites, zero shared invariants.

Failure modes:

1. Hold expires (sweeper, 15-min TTL) → guest pays at minute 20 → callback settles per P0-01 → `updateMany` matches 0 rows → guest now "owns" a `confirmed` reservation with **zero room allocations**.
2. Concurrent confirms (callback + sweeper requery + desk post) all observe `status='pending'` pre-transaction → both execute promotion/flip; last write wins; audit rows double (`reservation.confirmed` ×N).
3. Promotion itself is fine under `room_allocation_no_overlap` (GiST exclusion enforces one occupying allocation per room window), but the *status flip* is what lies to every consumer (arrivals list, occupancy, hold release on cancel is unaffected — cancel releases allocations, a confirmed reservation with no allocations cancels cleanly but sells nothing).
4. `admin PATCH` pending→confirmed (P0-04) confirms with no promotion at all — separate defect, same silhouette (P0-04).

### P0-04 — Administrative desk settlement (`modules/admin/routes.js:169-214`, `modules/payments/routes.js:159-190`)

Root cause(s):

1. **Status and payment are decoupled at the worst seam.** `PATCH /admin/reservations/:reference` accepts `pending → confirmed` (see `admin/routes.js:169`: `TRANSITIONS.pending = ['confirmed','cancelled']`, handler `:177-214`) with no payment record, no evidence, no promotion (see P0-03 root cause 4), and a client-side UI button wired to it (`apps/web/src/pages/Admin/Reservations.jsx:66-78`, `adminService.js:66-70`).
2. **Evidence-free settlement.** The only requirement is an optional `reason` string. No staff identity is bound to the settlement beyond the session (good — session exists), but no reason taxonomy, no external reference requirement, no amount check at confirm time — anything goes.
3. **Desk payments bypass the funnel.** `POST /admin/payments/manual` (`payments/routes.js:159-190`) creates the payment itself ad-hoc with `providerReference: DESK-${Date.now()}` (collision-prone, non-unique reference shape, unsequenced), performs its cumulative "already paid" aggregate **outside** the transaction (`routes.js:170-171` → TOCTOU double-credit), and confirms via the broken `confirmReservationTx` — i.e., the legitimate desk path inherits P0-03.
4. **No duplicate-settlement protection.** Two simultaneous desk posts both see `succeeded sum < total` and both insert full payments.
5. **Complimentary/override** has no sanctioned channel at all today — staff would either misuse desk payment (free fake payment row) or misuse the PATCH confirm (unallocated confirmed room).

Punchline: **the system cannot tell an honest sale from a free one, and it cannot tell an authorized comp from an error, because nothing is required to be recorded.**

---

## 2. Target architecture (overview)

Three design laws govern every fix:

- **Verify, then mutate.** No payment/reservation state changes until Daraja has answered (P0-01) or staff have deposited evidence + full amount (P0-04). Never trust the callback payload as proof.
- **One funnel for confirmation.** `confirmReservationTx` becomes the only path to `confirmed` — callable with a `method` of `mpesa webhook verified` | `mpesa requery verified` | `mpesa sweeper verified` | `desk manual` | `complimentary (manager+)`. Inside that funnel: lock reservation → promote or re-allocate holds → flip status → audit. No other call-site may set `confirmed` (P0-03 + P0-04).
- **Honest outcome states.** If money settles but inventory can't be assigned, the reservation becomes `needs_allocation` (new enum value) with staff escalation + automatic guest notification — never `confirmed` without a room, never silently `pending` with captured money.

Component graph after Phase 0:

```
Daraja STK push (POST /payments)          ──► Daraja
Daraja callback (webhook)                  ──► re-query via stkQuery (verify)
Admin desk settlement (new settle route)   ──► same confirm funnel
Sweeper / background worker (P0-02)        ──► re-query stale pendings via same funnel
all settle paths ──► confirmReservationTx ──► promote/re-allocate rooms ──► confirmed | needs_allocation
                        └── audit + outbox (payment-received email / admin alert) + reservation.room link
```

Inventory and rate integrity (exclusion constraint, `findFreeRooms` FOR UPDATE locks, CAS status transitions) are **unchanged** — the arena front-end and design system are untouched except two UI additions listed in §6.

---

## 3. Proposed fix per P0

### P0-01 — Verify-don't-trust settlement flow

**Design:** callback becomes a *hint*; Daraja becomes the *oracle*.

```
webhook POST /api/v1/webhooks/mpesa            (URL + ResultCode envelope unchanged — Safaricom compat)
  1. IP allowlist (unchanged role, now MANDATORY in production config — see §7)
  2. Parse envelope; locate payment by providerReference (unique key, unchanged)
  3. If payment is terminal → 200 "already <status>" (unchanged) + log anomalies (unchanged)
  4. ► stkQuery(providerReference) — server-side, our credentials, 5 s timeout, 1 retry
  5. Branches:
     a. query.resultCode === 0:
        - verify query amount equivalence: Daraja query has no amount; we therefore
          trust outcome from Daraja and amount from our own initiated row — if the
          callback's self-reported Amount disagrees with both (rot: tampering), fail closed → (c)
        - open ONE transaction: payment.update({where:{id}, data:{status:'succeeded'}})
          GUARDED updateMany(... where status='pending') → if count=0: commit no-op (double callback, replay) 
        - insert paymentAttempt(status='succeeded', rawPayload={callback, query}) — unique partial index
        - confirmReservationTx(funnel) — see P0-03
        - afterConfirmed post-commit
        - reply 200 Accepted
     b. query.resultCode in {1032 (cancelled-by-user), 2001…}: 
        - payment.update → failed; releaseAllocations; afterFailed; 200
     c. query throws/9959/non-0 non-terminal (still processing):
        - DO NOT settle. Insert paymentAttempt(status='pending', verified=false)
        - leave payment.status='pending'; reply 503 (Safaricom retries webhook up to 3×)
        - separate sweeper re-queries (P0-02) as backstop (existing behaviour, now correct)
     d. query unreachable (network/timeout): reply 503; no state changes; sweeper backstop
```

**Decision matrix when settlement is ambiguous** (the part M9 forced into the open):
- callback says 0 but query says pending → treat as (c); never confirm; alarm at 45 min via sweeper.
- callback says 0 and query says 0 → settle exactly once (§5 constraint).
- callback says non-zero but query says 0 (rare reordering) → settle via (a); log warning; callback amount irrelevant to settle path.
- neither path can produce `confirmed` for a payment Daraja never confirmed.

**What stays:** `providerReference` lookup, terminal-state early-200s, always-respond-200-when-settled contract, IP allowlist as defence-in-depth (not proof), maskRef logging (no raw MSISDN in logs; raw payloads stay in DB `payment_attempt.rawPayload` — improvement §6).

**What is removed/narrowed:** anonymous settle power (returned `checkoutRequestId` no longer leaks at initiation — §6 API contract change).

### P0-02 — Background job execution — architecture options

| Criterion | A. Dedicated worker (Docker, always-on host) | B. Vercel Cron (native) | C. External scheduler → protected endpoint (GH Actions cron → `POST /api/v1/jobs/sweep`) | D. Provider-native (pg_cron in Neon — if available) |
|---|---|---|---|---|
| Fit for 15-min hold expiry | Native — 60 s loop exists today | Hobby: once-a-day only — **fails requirement**; Pro ($20/seat): minutely possible | best-effort 5 min; scheduled workflows can be delayed/skipped under load, no SLA | depends on Neon support + SQL-only jobs (rewrite) |
| Reliability | High with container healthcheck + restart | High (Vercel SLA) but cadence wrong on Hobby | Low/medium — scheduler is not guaranteed | Medium-high |
| Duplicate execution | None if 1 instance (idempotent anyway) | Same function instance-coupling as Vercel functions; cold starts fine | Endpoint runs per invoke — must be idempotent (it is) | Single cron executor in DB |
| Distributed locking | Optional later: `pg_advisory_lock(42)` per sweep or lock table; single instance fine now | n/a | n/a (can add lock table) | Native singleton |
| Retry behaviour | In-process loop; per-item retry; logger.error; heartbeat row | Vercel cron retry-ish on 5xx, no partial retry | GH Actions re-runs manually/schedule; endpoint returns 200 fast, work async | pg_cron no retry semantics |
| Monitoring | Needs external uptime peek + container metrics (orchestrator) + heartbeat row | Vercel dashboard visibility | Alerting on heartbeats (needs own probe) | DB-side; needs log access |
| Ops complexity | Low (one Dockerfile path exists, `apps/api/Dockerfile`) | Medium (provision Pro, CRON_SECRET env, rewrite jobs as HTTP) | Low (one GHA YAML + one endpoint; secret in GH) | High (SQL rewrite of 4 jobs; DB migrations; KRA receipt logic not portable) |
| Infra cost | ~USD 3–9/mo (Fly shared-cpu-1x / Render Starter / small VPS) — **OWNER DECISION REQUIRED** | $20/mo + must also solve requery-every-5-min granularity (Hobby fails) | $0 (GH Actions free tier) but no SLA — **OWNER DECISION REQUIRED** | $0 extra (if Neon supports) but engineering cost high |
| Code longevity | Reuses `server.js` sweeper functions verbatim (exact same code as tested locally) | Rewrite as serverless handlers; idempotency must be re-proven | Add `POST /jobs/sweep` protected endpoint; reuses same functions | Full SQL rewrite |

**Recommendation: A — one always-on worker container running `node apps/api/src/worker.js` (thin refactor of `server.js`), deployed on the cheapest host the owner already trusts.** Rationale:

1. Correctness today depends only on the existing, already-tested sweeper code — zero rewrite risk, preserves the exclusion-constraint/CAS invariants already proven in tests.
2. Hold TTL of 15 minutes demands ≤ 5-minute worst-case cadence with hard guarantees — only A/B-on-Pro meet it. A is cheaper than Pro.
3. A is isolated from the Vercel function lifecycle: no timeouts, no cold starts, no web/function CPU coupling, one place to watch (`/jobs/health` + container restarts).
4. C is a legitimate **interim bridge** if the owner cannot provision A immediately: GH Actions cron hits the protected endpoint every 5 minutes; document the SLA gap and the sweep-miss behaviour (no correctness loss — only latency).
5. D is rejected unless Neon confirms pg_cron availability *in writing* and the owner wants SQL-side jobs — rewrite risk outweighs infra thrift.

**Failure semantics for the jobs themselves (all candidates):** idempotent (holds/sweeper updates are `updateMany`), at-least-once execution, per-item try/catch with `logger.error`, `email_outbox` dedupe via unique `dedupeKey`, dead-letter = row remains `failed`/`pending` in tables, operator SQL or admin UI surfaces them; heartbeats: worker writes `setting['jobs.heartbeat']` every sweep (cheap, queryable alert target).

**Not in scope:** Vercel cron creation, GH Actions enablement, any deployment — **OWNER DECISION REQUIRED** (choice of A vs C, budget, host).

### P0-03 — Confirmation integrity (the shared funnel)

**Corrected `confirmReservationTx` semantics** (same signature for all callers):

```
confirmReservationTx(tx, { reservation, actorUserId, ip, note }):
  1. const locked = SELECT * FROM reservation WHERE id = $1 FOR UPDATE          -- serialises all confirms
  2. if (locked.status === 'confirmed') return { outcome: 'already', reservation }  -- idempotent
  3. if (locked.status !== 'pending') throw conflict('reservation not confirmable') -- checked_out etc.
  4. promoted = promoteHoldAllocation(tx, { reservationId })          -- kind hold→reservation
  5. remaining = count(rooms booked by reservation vs count of occupying reservation allocations)
  6. if (promoted.count >= remainingExpected):
        updated = tx.reservation.update({ status: 'confirmed', confirmedAt: now() })
        audit('reservation.confirmed', { note })
        return { outcome: 'confirmed', reservation: updated }
  7. else -- hold(s) expired: defined recovery, not silent failure
        realloc = findFreeRooms(tx, { roomTypeId, checkIn, checkOut, count: remaining })
        if (realloc.length === remaining):
            insertAllocations(tx, realloc, kind='reservation', state='occupying')
            audit('reservation.reallocated', { promoted: 0, newRoomIds })
            updated = confirmed as (6); return outcome 'confirmed' (flag reallocated in audit)
        else:
            updated = tx.reservation.update({ status: 'needs_allocation' })
            audit('reservation.needs_allocation', { promoted: promoted.count, remaining })
            insert paymentAttempt note for staff visibility? (no — attempts belong to payment rows)
            outbox insert (admin alert template) — see P0-04 + §6 for admin notification
            return { outcome: 'needs_allocation', reservation: updated }
```

**Invariants enforced by this shape:**
- `confirmed` is unreachable without ≥ 1 occupying allocation per room booked (or outcome `needs_allocation`, never silent).
- Concurrency: the `FOR UPDATE` on the reservation row serialises webhook/requery/sweeper/desk settles; promotion `updateMany` is inherently atomic; `confirmedAt` set inside the same tx.
- `needs_allocation` recovery: staff alert email (`email_outbox`, admin template — exists pattern: `sendAdminNewBooking` analogue) tells front desk to allocate manually or refund via existing `POST /admin/payments/:id/refund` (`payments/routes.js:245`, already audited); UI shows the reservation as an action-required item (§6).
- Expired holds are not resurrected blindly: re-allocation re-checks current availability (`findFreeRooms` excludes occupying windows) → no oversell.
- If re-allocation succeeds, audit links original hold expiry → reallocation so investigations can trace the chain.

**Hotels cannot be double-confirmed or double-allocated**, and the exclusion constraint remains the final arbiter of room conflicts.

### P0-04 — Desk settlement redesign

**Principles:** status ≠ payment; every confirmation of a reservation requires either (i) verified payment record or (ii) explicit, authorized, evidence-carrying desk action; every desk action is bounded, audited, duplicate-proof, and leaves the ledger consistent.

**API changes (additive + one narrowing):**

1. **Narrow `PATCH /admin/reservations/:reference`** — remove `pending → confirmed` from `TRANSITIONS` (keep `cancelled`; keep `checked_in`/`checked_out`). Attempting it returns **409 `REDIRECT_SETTLEMENT`** with a pointer to the settle route (until release), then 422.
2. **New `POST /admin/reservations/:reference/settle`** (receptionist+):
   - body: `{ method: 'cash'|'mpesa'|'card'|'bank'|'other', amountMinor?: integer (defaults to full balance), externalRef?: string, reason: 'desk_payment' | 'comp' | 'management_override', note?: string (min 8 chars for comp/override) }`
   - `desk_payment`: `amountMinor` **must equal remaining balance** (exact, as today — v1 keeps full-settle semantics; partial desk settlement deferred to Phase 1, documented).
   - `comp` / `management_override`: `amountMinor` must be `0`; `method` must be `'comp'`; **`requireRole('manager','admin')`** only; `note` mandatory ≥ 8 chars; no payment row is created (or optionally a zero-amount marker row with `status='succeeded', provider='manual', amountMinor=0` for uniform ledger reporting — final shape: marker row, see DB changes).
   - Transaction: `SELECT reservation ... FOR UPDATE` → re-aggregate succeeded payments inside the tx → reject if already paid (409) → create payment + attempt (`DESK-<reservationId>-<millis>` renamed to `DESK-<reservationId>-<settlementSeq>` via a settlement counter or uuid suffix — removes `Date.now()` collision class) → run the shared confirmation funnel → audit with `{ actorUserId, action: 'payment.desk_settled'|'reservation.comp_confirmed', reason, externalRef, method, amountMinor, ip }`.
   - Response: `{ outcome: 'confirmed'|'needs_allocation', reservationStatus, paymentId? }`.
3. **`POST /admin/payments/manual`** — kept as a thin alias to settle for backward compatibility OR replaced outright with a 308-style redirect; final shape: **keep route, rewire internals to the same transaction + funnel** (no duplicate logic), same RBAC. Not removed — M9 explicitly requires alternatives, not capability removal.
4. **No free confirmations.** No endpoint sets `confirmed` without either settlement evidence or the comp reason; `m4.test.js`-style direct pending→confirmed via PATCH disappears.

**Ledger correctness:** the settle path uses the same `confirmReservationTx` → identically responsible for promotion/re-allocation/needs_allocation; audit + outbox chain identical; desk-comped bookings hold rooms via the same allocation rows (`kind='reservation'`), differing only in `payment` row shape (zero marker or absent) — the arrivals list treats them as confirmed bookings, correctly, since a comp room occupies inventory identically.

**Duplicate settlement proof:** row lock on reservation + in-tx aggregate re-check + single deterministic `providerReference` suffix (never `Date.now()`) + unique payment attempt index → second concurrent settle fails 409; no double-credit, no double confirm.

**Evidence:** every settle writes `audit_log` with actor id, role snapshot, ip, session-derived userId (exists: `req.auth.user.id`), note, reason enum, externalRef. `audit_log` already retained (restrictive FKs; append-only by convention — flagged for DB-level REVOKE in Phase 1, noted as non-P0).

---

## 4. Database changes (exact)

All migrations **additive-only**; forward-only deploy; down SQL provided where feasible; no destructive DDL; no data backfill except the new enum default.

| # | Change | Why | Type |
|---|---|---|---|
| DB-1 | `ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'needs_allocation';` | P0-03 honest mid-state | enum add (additive; **not revertible** — see rollback §8) |
| DB-2 | `CREATE UNIQUE INDEX payment_attempt_providerReference_succeeded_key ON payment_attempt (providerReference) WHERE status = 'succeeded';` | once-only settlement, kills replay class & concurrent dup | partial unique index (additive; create CONCURRENTLY in prod but plain in migration for speed — table is tiny) |
| DB-3 | `CREATE INDEX payment_reservationId_status_idx ON payment (reservationId, status);` | re-aggregation inside locked tx without seq scan (M9-21) | index (additive) |
| DB-4 | `CREATE UNIQUE INDEX settlement_marker_unique ON payment_attempt (providerReference) WHERE provider = 'manual' AND "amountMinor" = 0;` — optional marker constraint if zero-amount comp marker rows are adopted | comp marker idempotence | partial unique (additive; optional — see §12 question 4) |
| DB-5 | No changes to: enum PaymentStatus, `room_allocation` exclusion constraint, FKs, reservation unique refs — deliberate (reuse) | minimal blast radius | — |
| DB-6 | Outbox template row? None — email template is code (`integrations/email/index.js` — add `adminAllocationNeeded` template mirroring `sendAdminNewBooking` pattern) | P0-03 escalation channel | code, not DB |
| DB-7 | Consider (optional, recommend **yes** alongside DB-2/3): `CREATE INDEX payment_attempt_reservationId_status_idx ON payment_attempt (reservationId, status);` | in-tx aggregate performance | index |

**Schema code changes** (`prisma/schema.prisma`): `models` kept identical; `ReservationStatus` gains `needs_allocation`; comment on `PaymentProvider` unchanged; `PaymentAttempt.providerReference` comment notes new unique index. Client regenerated; `inline-wasm.mjs` re-run; committed generated client updated (matches existing pattern — deploy step).

**No production data migration is executed by this plan; DB-1 is a pure enum addition on an idle table.**

---

## 5. API changes (exact contracts)

| # | Endpoint | Change | Compat |
|---|---|---|---|
| A-1 | `POST /payments` (initiation) | Response **drops `checkoutRequestId`** (returns `{status, provider, message}` only). Status 201/503 unchanged. | Web never reads it — verified `BookingConfirmation.jsx` (`fetch(...)` → status classes only) — **zero frontend impact** |
| A-2 | `POST /webhooks/mpesa` | Contract **external unchanged** (ResultCode envelope); internal verify-then-settle (P0-01 §3). Returns 200 on settle/no-op, 503 on transient verify failure (Safaricom retry). | Fully compatible with Safaricom retry semantics |
| A-3 | `PATCH /admin/reservations/:reference` | `pending→confirmed` removed; other transitions unchanged; attempt returns **409 `REDIRECT_SETTLEMENT`** | Web UI shows the new settle action instead (§6) |
| A-4 | `POST /admin/reservations/:reference/settle` (**new**) | See P0-04 §3; body `recordSettlementSchema` (new shared zod schema in `packages/shared/src/validation.js`); `reason` enum; `comp` restricted to manager/admin | New surface; no callers before release |
| A-5 | `POST /admin/payments/manual` | Response gains `outcome`; internals rewire to the same transaction (no behaviour change for exact-full desk payments) | Backward compatible for staff workflow |
| A-6 | `GET /api/v1/admin/settings` / reports | `payment-health` gains `needs_allocation` counter (report addition, `routes.js:680-749`) — surfaces stuck reservations to admins | Additive |
| A-7 | `POST /jobs/sweep` (**only if owner picks architecture C**, or for A-internal health) | `Authorization: Bearer <JOB_TOKEN>` (or Vercel `CRON_SECRET` pattern); 200 fast with `{swept, at}`; NOT public; if A chosen, endpoint still useful as authenticated manual trigger — flagged **OPTIONAL / OWNER DECISION** | New; protected |
| A-8 | `/api/v1/ready` | Add cached `jobs` component (`true/stale`) backed by `setting['jobs.heartbeat']` once worker exists | Additive, harmless |
| A-9 | Web: BookingConfirmation | Guest-facing label for `needs_allocation` reservations (existing status switch gets one branch: "Your payment is received — we're assigning your room and will confirm within the hour." + reference display) — **minimal, same design system** | Web copy only |
| A-10 | Web: Admin Reservations detail | Replace bare "Confirm" with **"Settle…"** dialog (reason select, method select, amount read-only, note ≥ 8 for comp/override), wires to A-4 | UI addition, same components |

**Frontend impact summary:** two additions (A-9 status label, A-10 settle dialog). The arena front-end, design system, rooms/experience pages and catalogue are untouched. No visual re-architecture.

---

## 6. Security design (per fix + cross-cutting)

| Control | Applies to | Design |
|---|---|---|
| Settle-once constraint | P0-01/03/04 | DB partial unique (DB-2) + status CAS `updateMany … where status='pending'` inside locked transaction + unique `paymentAttempt(providerReference, status='succeeded')` |
| Re-auth before settlement | P0-01 | `stkQuery` server-side; failure ⇒ no state change; EDGE case: `1041`/`2001` etc. mapped explicitly |
| Forgery resilience | P0-01 | IP allowlist (now mandatory prod env), envelope structure, internal re-query; **never** settle on payload bytes; possession of CheckoutRequestID insufficient without Daraja agreement |
| Amount authority | P0-01/04 | Authority = initiated row; callback amount is corroboration only; mismatch ⇒ settle blocked + anomaly audit; desk = staff-entered exact balance (v1) |
| Ledger immutability | P0-03/04 | No DELETE on payment/reservation (already); settlement uses insert-only; allocations transition kinds only, rows never deleted |
| Authorization | P0-04 | `desk_payment`: receptionist+; `comp`/`management_override`: **manager/admin only**; audit actor always recorded; session required (no unauthenticated desk) |
| Evidence minimum | P0-04 | `note` ≥ 8 chars for comp/override; `reason` enum; externalRef recommended for all money movements |
| Race safety | P0-03/04 | `SELECT … FOR UPDATE` reservation row; `findFreeRooms` room locks; exclusion constraint backstop |
| Failure honesty | all | Outcome enum `confirmed | needs_allocation | already`; 503 on transient verify failure; Daraja retries intact; sweeper backstop; `never`-lie invariants in §7 tests |
| Secret handling | all | No secrets in code; `JOB_TOKEN`/allowlist env-only; no callback logging raw (maskRef already); rawPayload retained (justified: KRA/audit — flagged for retention review in Phase 2, not removed) |
| Rate limiting | P0-01 interplay | Webhook keeps bypassing apiLimiter by design; relies on allowlist + verify; **this stays** (documented), optional IP allowlist now mandatory in prod; all other M9-05 abuse controls are Phase 1, not P0 |
| Transport/infra | P0-02 | Worker uses `DATABASE_URL` (Neon pooled), `sslmode=require`; worker gets its **own** `/jobs/health` + no inbound public surface except the health check; health path returns no DB metrics publicly |
| Audit enforcement | P0-04 | New settle actions audit `action: reservation.comp_confirmed | payment.desk_settled | reservation.needs_allocation` with before/after; admin-only visibility (existing) |

**Credential handling this milestone:** none used. No `.env` reads, no Daraja calls, no DB opens. The plan assumes sandbox only until owner authorizes production Daraja registration.

---

## 7. Test plan & acceptance criteria

**Existing suites re-run unchanged:** `apps/api/tests/booking.test.js` (webhook replay cases), `m5.test.js` (terminal-state replay), `mpesa.test.js`, `m8-anonymous.test.js`, `inventory.test.js`, `auth.test.js`, `google-auth*.test.js` — all must remain green; `m4.test.js` **changes** as noted below.

**Modified tests:**

| Test | Change |
|---|---|
| `m4.test.js` — "pending→confirmed PATCH returns 200" | Now expects **409 `REDIRECT_SETTLEMENT`**; replacement asserts `POST /settle` with manager role → **201** and allocation exists; comp variant asserts no payment row (or marker) + audit present |
| `m4.test.js` — maintenance guard, RBAC matrix | Extend with settle-route roles: receptionist desk 201, comp denied 403 |

**New tests (all vitest, local PG):**

P0-01:
- `p0-01 webhook (forged callback, wrong amount) → payment NOT succeeded; reservation stays pending` (inject stkQuery stub returning 9999).
- `p0-01 callback says success but Daraja says pending → resolve as pending/attempt recorded; afterConfirmed NOT fired` (stkQuery stub: resultCode null).
- `p0-01 callback + stkQuery both success → settled exactly once; replay second identical callback → no double attempt/payment (DB unique constraint hit → 200 already-settled path)`.
- `p0-01 settlement against failed/terminal reservation → 200 no-op, no flip to succeeded`.
- `p0-01 stkQuery throws → 503; state untouched; sweeper (test double) recovers later` (`server.js` invocation is out of scope for vitest — stub `requeryStalePayments()` exported for direct call).
- `p0-01 IP allowlist rejects disallowed caller → no state change, 200 with ResultCode 1 + no payment writes`.

P0-02:
- `p0-02 exported sweep functions are idempotent when run twice concurrently` (holds flipped once; reservations flipped once).
- `p0-02 stale payment sweeper settles via the same funnel (stub stkQuery success) and releases allocations on failure` (`server.js:41-85` logic, refactored to be callable).
- `p0-02 heartbeat row updated on each sweep (assert setting['jobs.heartbeat'] fresh)`.

P0-03:
- `p0-03 hold expired before callback → payment succeeds; reservation becomes needs_allocation (not confirmed)`; allocations none; outbox admin alert exists; guest email indicates pending assignment.
- `p0-03 hold expired but same room re-freeable → reservation confirmed with NEW allocation (audit reallocated)`; exclusion constraint respected.
- `p0-03 concurrent callbacks (Promise.all ×8) → exactly one confirm; one payment attempt succeeded; others receive already-settled 200`.
- `p0-03 confirmed outcome always has allocations.kind='reservation' rows` (invariant test for all settle paths).
- `p0-03 sweeper expiry vs callback race → deterministic outcome; never confirmed with 0 allocations` (order both ways).

P0-04:
- `p0-04 settle as receptionist exact balance → 201; allocations promoted; audit has actor+reason; PATCH confirm refused 409`.
- `p0-04 settle with comp (manager) → confirmed without payment rows; audit action comp_confirmed; reason enforced (min length)`.
- `p0-04 double concurrent settles → one 201, one 409; succeeded sum unchanged`.
- `p0-04 desk settlement releases hold and reuses funnel — same allocation assertions as webhook path`.
- `p0-04 amount mismatch → 400, no writes`.

**Acceptance criteria (all must hold in CI + staging before production talk):**

- Zero P0 regressions; 68+ tests green (58 + ~12 new − 2 modified rows net green).
- `npx prisma migrate deploy` clean on scratch DB; enum add verified; client regenerated.
- Invariant property test suite passes: no `confirmed` reservation lacks occupying allocation (query fixture).
- Pending→confirmed reachable **only** via settle/verify paths (source-tree grep invariant test).
- Docs updated: `SECURITY.md §5` (callback threat model), `OPERATIONS.md` (worker runbook + heartbeat alert), `DATABASE_DESIGN.md` (needs_allocation semantics), `M10` retrospective in `DECISIONS.md` as owner authorizes.

**Non-goals:** load testing, k6, live Daraja verification — all excluded from Phase 0 (Phase 1/2).

---

## 8. Migration & rollback strategy

**Order of operations (owner-gated at every step — see §9):**

1. Pre-flight (today): rotate Neon password (M8 §2); verify `ready` returns `db:"up"`.
2. Branch `m10-phase-0` → implement fixes → CI green (all checks incl. Trivy) → owner review.
3. Staging rehearsal: `prisma migrate deploy` on the **staging** database (compose stack) — verify enum + indexes; run full suite against it + smoke: create reservation → expire hold → pay (Daraja **sandbox** with sandbox credentials) → confirm → allocation present; comp flow; double-settle attempt blocked.
4. Production migration window (owner-authorized): `migrate deploy` on Neon; deploy behind Vercel **only after** worker (A or C) is live; order deploys as API first (backwards-compatible) → worker second → front-end build (still compatible with old PATCH replies since UI ships atomically in same deployment).
   - Migration adds `needs_allocation` enum value — safe on non-empty tables, additive.
5. Post-deploy verification: `ready` 200; create/expire/pay cycle on **sandbox**; `payment-health` shows `needs_allocation = 0` target; heartbeat fresh; admin settle UI exercised.

**Rollback runbook (pre-approved steps, all documented here — not executed by audit):**
- **API rollback**: `git revert` the Phase-0 commits on `main` → Vercel redeploys → PATCH/webhook revert to prior behavior (safe: prior behavior is the known-accepted state; risk returns but no new risk).
- **DB rollback**: Prisma forward-only: DB-2/3/7 indexes and DB-4 marker index droppable cleanly (`DROP INDEX`); **DB-1 enum value `needs_allocation` cannot be dropped** — documented: rollback leaves the enum value unused-complete; no data references it (no reservations were transitioned); acceptable and standard Postgres practice (harmless dormant value).
- **Worker rollback**: stop/remove worker container → jobs stop (regression to M9-02 state, known-bad but reversible in minutes).
- **Embargo**: never migrate production outside a window with verified Neon PITR + a fresh `pg_dump`; restore drill rehearsed once on staging before prod (Phase 2 item).
- **Data safety invariant**: `room_allocation_no_overlap` + `reservation_room` uniqueness guarantee zero overselling at every migration stage.

**Feature flags (recommend, owner to approve):** `JOBS_ENABLED=true` on the worker host only; `SETTLEMENT_V2=on` is not recommended (silent fallback would defeat P0 invariants — hard cutover preferred).

---

## 9. Infrastructure decisions requiring owner approval (do NOT proceed silently)

| # | Decision | Recommended | Alternatives | Cost impact |
|---|---|---|---|---|
| 1 | Worker hosting (P0-02) | **A — always-on worker on cheapest host owner trusts** (Fly shared-cpu-1x / Render Starter / existing VPS) | **C — GHA cron bridge** ($0, explicit SLA gap, interim only); B rejected (Hobby cadence fails); D rejected (rewrite) | $3–9/mo (A) vs $0 (C) |
| 2 | Neon PITR window / backups | Verify existing Neon PITR; add weekly `pg_dump` to object storage — **owner approves provider** | RDS/Supabase later; keep Neon | ~$0–2/mo |
| 3 | `MPESA_WEBHOOK_ALLOWED_IPS` values in production | **Mandatory env** set to Safaricom callback IPs (Daraja guide) — owner obtains from Safaricom and enters via Vercel env UI | none (interim readiness doc explicitly flags absent allowlist as risk) | $0 |
| 4 | SMTP provider for guest notifications | Cheapest transactional tier; `EMAIL_FROM` domain verified (SPF/DKIM) | stay silent (current honest `skipped` posture — acceptable, deliberate) | $0–15/mo |
| 5 | Error tracking & uptime | Sentry free tier + UptimeRobot free (P0.8 COMMISSIONING) — **owner picks** | none — accept residual blindness consciously | $0 |
| 6 | Production Daraja onboarding | Owner registers, tests sandbox, authorizes prod credentials + Callback URL before any live-money posture | remain sandbox indefinitely (acceptable posture) | $0 |
| 7 | Front-end settle copy (A-10) | Approve the minimal Admin UI addition + one BookingConfirmation status label | defer UI; API-only changes with `// TODO` — not recommended (staff need the button) | $0 |
| 8 | Deleting `.env`/`dist` drift? | No action needed (dist is gitignored; M8 probe scripts deleted earlier) | — | $0 |
| 9 | `needs_allocation` guest messaging | Approve activation when P0-03 ships (guest sees honest status label) | keep hidden state internal (bad UX; not recommended) | $0 |
| 10 | `tests/e2e` extension to settle flow | Approve 1 additional e2e spec (admin signs in → settle dialog → ledger shows allocation) | unit-only coverage (acceptable) | $0 |

Non-decisions (do not decide for owner): any production go-live, any Daraja production credentials, any budget/subscription, privacy policy, retention windows, monitoring ownership, preview-vs-production strategy, the M-Pesa activation question — all remain open.

---

## 10. Recommended implementation sequence (with owners and gates)

**Phase 0-A — Foundations (target: 1–2 days once authorized)**
1. Neon password rotation (**owner**, M8 §2) — gate: production posture clean.
2. Branch `m10-phase-0`; schema migration DB-1/2/3/7; regenerate client; **Gate A: CI green incl. Trivy + migration deploy clean on scratch.**
3. Shared funnel refactor (`confirmReservationTx` exactly-once, `FOR UPDATE`, promote/re-allocate/`needs_allocation`) + P0-03 tests green.

**Phase 0-B — Payment settlement (2–3 days)**
4. Webhook verify-then-settle (P0-01) + stkQuery helper resilience (timeout/retry) + P0-01 tests green.
5. Initiation response drops `checkoutRequestId` (A-1); `payment-health` `needs_allocation` counter (A-6).

**Phase 0-C — Desk settlement & admin UI (2–3 days)**
6. Settle endpoint (A-4) + `PATCH` narrowing (A-3) + `payments/manual` rewire (A-5) + shared `recordSettlementSchema`; admin Reservations settle dialog (A-10); confirmation-page honest label (A-9).
7. **Gate B:** full suite green; one staging compromise-free rehearsal (sandbox); owner walkthrough of the settle dialog (removes ambiguity at first real use).

**Phase 0-D — Jobs substrate (1–2 days, owner-gated §9#1)**
8. `apps/api/src/worker.js` (thin: scheduler + heartbeats + refactored sweeper exports); Docker compose `worker` service (profile `jobs`); GH Actions cron workflow **only if C chosen** (`.github/workflows/jobs-sweep.yml`, `cron: '*/5 * * * *'`, secret `JOB_TOKEN`); local sweep test suite green.
9. **Gate C:** worker heartbeat visible for ≥ 24 h on staging with correct `expired` flows; stale-payment recovery exercised sandbox.

**Phase 0-E — Release (owner-gated)**
10. `docs/DECISIONS.md` entries (owner authorship), `OPERATIONS.md` worker runbook, `M10` sign-off checklist; **owner authorizes production deployment**; verify per §8 step 5; 7-day observation with `needs_allocation = 0` and heartbeat green.

**Estimated total: 6–10 working days + owner review time.** Not started; no step is implicitly authorized by this document.

---

## 11. Remediation dependency map

```
DB-1 (needs_allocation) ──────────┐
DB-2 (once-only partial unique) ──┼──► P0-01 webhook settle       ─────┐
DB-3/DB-7 (indexes)             ──┘    stkQuery helper (§3)            ├──► A-6 payment-health counter ──► §7 tests ──► Gate A/B
RBAC role map (manager for comp) ─────► P0-04 settle route        ─────┤
recordSettlementSchema (shared) ──► P0-04 settle endpoint       ──┘

promoteHoldAllocation ──► confirmReservationTx (funnel, §3) ──► P0-03 recovery path
findFreeRooms (unchanged) ──► re-allocation branch              (needs_allocation)
confirmReservationTx ──► P0-01 (webhook) + P0-04 (settle) + existing sweeper requery (P0-02 worker)
SWEEP code (server.js) ──► worker.js (P0-02) — depends on identical shared services
mini-UI (A-9, A-10) ──► frontend build — depends on A-4/A-3 contracts
Email outbox templates (adminAllocationNeeded) ──► needs_allocation escalation (P0-03) — optional but required for "defined recovery path"
```

**Cross-item coupling (do not ship partial fixes):**
- P0-03 fix is hollow without P0-01 (still no trust anchor) and without P0-04 (desk paths bypass funnel).
- P0-01 alone leaves admin settle broken; P0-04 alone leaves anonymous settle broken.
- P0-02 worker is meaningless while P0-01/P0-03 defects exist — jobs would faithfully process unsound settlements.
- **Ship as one release, verify as one, roll back as one.** (`needs_allocation` dormant otherwise — see §8.)

**Existing tests touched:** `m4.test.js` (2 cases), `booking.test.js` (assertion tweaks only — callback response shape), `m5.test.js` (unaffected), new suite under `apps/api/tests/m10-*.test.js`. **No test is weakened.**

---

## 12. Unresolved questions for the owner (explicit, not resolved here)

1. Worker hosting A vs C (§9#1); default approval needed before Phase 0-D begins.
2. Production PITR window verification policy + backup provider (§9#2) — owner returns evidence, not engineering assumption.
3. Safaricom IP ranges for production allowlist — owner must obtain; sandbox note: allowlist mandatory in prod envs only (staging may stay empty).
4. Comp settlement **zero-amount marker payment row vs no payment row** — recommendation: **no payment row** (cleaner ledger; comp is explicitly not a payment); `rawPayload`/audit carry the reason. Confirm or override.
5. Desk settle **partial amounts** — v1 enforces exact full balance; partial desk collection emerges in Phase 1 (schema unaffected; `amountMinor < balance` per DESK-x row with remainder derived). Accept v1 scope or extend.
6. `needs_allocation` guest-facing copy (A-9) — approve wording, or keep internal-only with phone-call recovery messaging.
7. `payment_attempt.rawPayload` retention (P2/Phase-2 item M9-15) — retained in M10; scheduled for Phase 2 retention review.
8. E2E admin settle spec (§9#10) — in or out of scope.
9. Naming of settlement endpoint (`/settle` vs `/desk-settle`) — house style is plural-noun resources; `settle` verb as action sub-resource accepted or renamed.
10. Whether `payment-health` `needs_allocation` should **page** (Phase 2) or just list (Phase 0) — recommend list now.

---

## 13. Verification commands for this plan milestone

- `git status --short` (expect: M8 files + `?? docs/M10_PHASE_0_REMEDIATION_PLAN.md` only)
- `git log --oneline -1` → `2ccffd9` (unchanged; nothing committed or pushed)
- No application code touched (`git diff --name-only` → docs only)
- No database connected; no migrations executed; no dependency installed; no M-Pesa call made; no Vercel/Render/Neon change performed.

**Stopping here. Nothing in this document authorizes implementation; each Phase gate (A/B/C/D/E) requires your explicit written instruction, and the production deployment itself requires a separate go decision made after staging rehearsal.**
