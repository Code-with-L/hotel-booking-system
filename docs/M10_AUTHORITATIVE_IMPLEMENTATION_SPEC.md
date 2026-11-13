# M10 — Authoritative Implementation Specification (Phase 0)

**Status:** authoritative design baseline for M10 — **not yet implemented; not committed; not pushed — do not begin coding without explicit owner approval of §15 gates.**
**Date:** 2026-11-13 · **HEAD:** `2ccffd9` (unchanged).

This document supersedes the settlement, schema and worker sections of `docs/M10_PHASE_0_REMEDIATION_PLAN.md` per the corrections in `docs/M10_PHASE_0B_DESIGN_REVIEW.md`. **Evidence documents are preserved verbatim** — M9 findings, the M10 plan, and the 0-B review remain the audit record; this file is the spec built on them. No prior document is deleted or rewritten.

## 0. Supersession notice (explicit, non-silent)

| Original (Phase 0 plan) | Superseded by (Phase 0-B review) | Final rule |
|---|---|---|
| DB-2 "once-only settlement" as the reservation-level guard | §1.2, §1.5, D1 | DB-2 kept as **attempt-scope** invariant only; reservation-level net capture enforced by transaction **Layer 1** + trigger **DB-8** (owner-approved) + desk **DB-9** |
| "Safaricom retries callbacks" / 503 → Daraja retries | §2.1, D2 | Recovery = sweeper + manual requery + 503-as-honest-signal; provider retry **not relied upon** |
| Worker heartbeat + "optional" external probe | §3.5, D3 | Heartbeat + **mandatory external staleness probe** exit criterion for Phase 0-D |
| `/ready` jobs advisory component as planned | §3.5, D4 | **Advisory only** or omitted; never a restart trigger |
| Comp payment marker row undecided | §4.1, D5 | **No payment row**; audit-only; manager+; reason mandatory |
| Deterministic-vs-`Date.now()` desk reference | §4.3, D7 | `DESK-<reservationId>-<settlementSeq>` |
| Sweeper re-query settle without reservation row lock | §3/§8, D8 | Sweeper uses the **same funnel lock** as all other writers |
| `needs_allocation` resolution undefined | §5.1, D9 | Two sanctioned writers only: worker re-allocation sweep (bounded) + admin "Assign rooms" action |
| Refund TOCTOU acknowledged but not fixed per se | §4.3, D11 | Refund recomputes cap **inside reservation row lock** |
| Provider-settlement on callback trust | P0-01 core | **Verify-then-settle**: `stkQuery` decides; callback bytes are hints |
| Cost figures "USD 3–9/mo" | §3.6, D14 | Owner's live quote governs; estimate withdrawn |
| M10 §11 question list | Issue 0-B §12 | Re-issued here §15/§16 with resolutions where D-decisions applied |

If a conflict is discovered between this spec and the review/plan, **the review (0-B) wins**, then this spec. Flag conflicts — do not resolve silently.

---

## 1. Scope and evidence status of the four P0s

| P0 | Finding (M9 ref) | Root cause (verified) | Final resolution in this spec | Status after spec |
|---|---|---|---|---|
| P0-01 | M9-01 forgeable callback | No provider verification; optional empty IP allowlist; `checkoutRequestId` leaked to initiator | §4 verify-then-settle; DB-2; Layer 1; trigger DB-8 (owner-approved) | closed at design; closed at code after Gate B |
| P0-02 | M9-02 jobs absent in prod | `app.js` (Vercel) never runs `server.js` sweepers | §5 dedicated worker architecture A (owner-approved), interim C accepted | closed at design; closed at Phase 0-D |
| P0-03 | M9-03 zero-allocation confirms | `confirmReservationTx` ignores `promoteHoldAllocation` result; no re-allocation | §3 funnel contract; `needs_allocation` mid-state | closed at design; closed at Gate B tests |
| P0-04 | M9-04 unpaid confirm + desk TOCTOU | `TRANSITIONS.pending` admits `confirmed`; payment routes don't lock | §6 settle endpoint; PATCH narrowing; refund cap in-tx | closed at design; closed at Gate C |

Out of scope (correctly excluded): M9 P1/P2 items — rate-limit stores (M9-05), inventory-exhaustion 429s (M9-06), email pipeline (M9-11), monitoring (M9-12), indexing/timeouts (M9-21/22), headers (M9-25), GDPR work (M9-15), eTIMS/KRA (M9-16), all prepaid-travel behaviour changes, web redesigns. These remain logged in M9; Phase 0 does not touch them.

---

## 2. Final architecture

```
 STK push (POST /payments) ──► Daraja ──► (customer PIN) ──► callback ─► webhook
                                                              │  verify-then-settle  ◄── stkQuery (our creds)
 Admin desk settle             ──► POST /admin/reservations/:reference/settle (NEW)
 Sweeper re-query (worker)     ──► verify-then-settle (stale pendings ≥ 45 min)
   all three ─────────────────────► confirmReservationTx  (single funnel)
        1. SELECT reservation FOR UPDATE
        2. idempotent no-op if already confirmed
        3. promoteHoldAllocation (hold → reservation)
        4. else findFreeRooms re-allocation (fresh availability)
        5. else status → needs_allocation (+ admin alert outbox)
        6. payment.update(status='succeeded') — CAS where status='pending'
        7. net-capture guard (Layer 1; Trigger DB-8 backstop)
        8. audit (namespace: payment.mpesa_settled / payment.desk_settled /
                            reservation.comp_confirmed / reservation.needs_allocation /
                            reservation.reallocated)
   ═► Reservation confirmed ⇔ ∃ occupying 'reservation' allocation rows (per room)
```

Principles: **verify, then mutate** · **one confirmation funnel** · **honest outcome states** · **reservation-level single settlement** · **provider truth over local bytes**.

## 3. Reservation | allocation confirmation funnel (final)

`lib/confirm.js` becomes:

```
confirmReservationTx(tx, { reservationId, actorUserId = null, ip = null, ua = null, note, kind }):
  row      := tx.queryRaw`SELECT * FROM reservation WHERE id = ${reservationId} FOR UPDATE`
  if row.status == 'confirmed': return { outcome: 'already' }          // idempotent (CAS safety net)
  if row.status != 'pending' and row.status != 'needs_allocation':
      throw conflict('Reservation is ' + row.status)                   // checked_out etc. unreachable here
  expected := SELECT count(*) FROM reservation_room WHERE "reservationId" = row.id
  promoted := tx.roomAllocation.updateMany({ where: { sourceType:'reservation', sourceId:row.id, state:'occupying' },
                                             data: { kind:'reservation', expiresAt:null } })
  if promoted.count >= expected: goto done(row, promoted.count, 'confirmed', note='paid')
  free     := findFreeRooms(tx, { roomTypeId:row.roomTypeId, checkIn:row.checkIn, checkOut:row.checkOut, count:expected })
  if free.length == expected:
      insertAllocations(tx, free.map(... kind='reservation', state='occupying' ...))
      audit(tx, { action:'reservation.reallocated', ... { roomIds: free.map(r=>r.id), reason:'hold_expired_before_settlement' } })
      goto done(row, expected, 'confirmed', note='reallocated')
  else:
      tx.reservation.update({ where:{id:row.id}, data:{ status:'needs_allocation' } })
      audit(tx, { action:'reservation.needs_allocation', after:{ promoted:promoted.count, expected } })
      tx.emailOutbox.create({ template:'adminAllocationNeeded', dedupeKey:'allocation-needed:'+row.id, ... }) // if SMTP/outbox-ready
      return { outcome:'needs_allocation' }
done(): tx.reservation.update({ status:'confirmed', confirmedAt: now() }); audit(...); return { outcome:'confirmed' }
```

Re-allocation is idempotent under the row lock; concurrent settle paths serialise on `FOR UPDATE`.
`needs_allocation` resolution (exactly two writers):
- worker re-allocation sweep (below), retrying `findFreeRooms` every 15 min, max 96 attempts/24 h, on rows still in `needs_allocation`; on success flips to `confirmed` + audit;
- staff "Assign rooms" action (Admin Rooms page: filter + one button) — one transaction: allocate (offers same `findFreeRooms` guarantee) + flip to `confirmed`. Audit `reservation.assigned`.

No other writer may produce `confirmed`. `TRANSITIONS.pending` admitting `['cancelled']` only (PATCH narrowing) — checked_in branch unaffected.

## 4. Payment verification & recovery architecture

### 4.1 Webhook (URL + ResultCode envelope unchanged — Safaricom contract)

Order of checks (unchanged order where compatible; changes marked):

1. `MPESA_WEBHOOK_ALLOWED_IPS` allowlist — **mandatory in production config** (owner provides values; sandbox/dev may leave empty with a boot warning — not an error).
2. Envelope parse; find `payment` by `providerReference` (unique; unchanged).
3. Terminal-state short-circuit → 200 `Accepted (already …)`; anomaly log on contradictory success-vs-terminal-failure (unchanged).
4. **`stkQuery(reference)` — 5 s timeout, 1 retry; our credentials; no caching.**
5. Branch:
   - `resultCode === 0`: in one transaction — net-capture guard (Layer 1 §1) → `payment.update({status:'succeeded', capturedAt})` guarded `WHERE status='pending'` (count 0 ⇒ commit as no-op) → insert `payment_attempt(status='succeeded')` (DB-2 backstops) → funnel confirm → `afterConfirmed`.
   - `resultCode` in {1032 user-cancelled, plus explicit failure codes}: settle as `failed`; release allocations; `afterFailed`.
   - `resultCode === 9999 || null` (inconclusive): **no settlement**; insert attempt `pending,verified=false`; payment stays `pending`; return 503. Sweeper recovers. No `failed` flip on 9999.
   - Query error/timeout/5xx: **no state change**; 503; sweeper/manual recovery only. **Provider retry is not assumed** (D2).
6. Idempotency across branch 5s: any number of callbacks against a `succeeded` payment no-op (terminal read) — replay-safe.

**Amount corroboration (defence-in-depth, fail closed):** if the callback carries `Amount`, require `Math.round(Amount*100) === payment.amountMinor`; mismatch ⇒ settle blocked, payment `failed`, allocations released, `logger.error payment.amount_mismatch`. Daraja `stkQuery` carries no amount — **our initiated row is the amount authority**.

**Post-initiation secret reduction:** `POST /payments` no longer returns `checkoutRequestId` (A-1 contract change; web verified not to read it). Possession of the id is never authorization; the design never relies on it.

### 4.2 Sweeper-driven recovery (the missing-callback path)

`requeryStalePayments(tx)` exported from the worker for direct call: finds `mpesa` payments `pending` older than 45 min, limit 10/tick, per item: `stkQuery` → branch per §4.1 (same funnel, same guards, same attempt-once constraints). Idempotency identical. Duplicate execution between sweeper and a **concurrent webhook settle** is prevented by the reservation row lock + payment CAS (subsection 4.3).

### 4.3 Provider truth vs internal state (rule hierarchy, normative)

1. Daraja decides money movement (via `stkQuery`). 2. Our rows decide inventory (exclusion constraint). 3. Our rows never lead provider truth. 4. Every write of financial meaning passes the reservation lock. 5. Callback bytes are never evidence of payment. 6. `paymentAttempt.rawPayload` retained verbatim (KRA/forensics); retention review scheduled Phase 2.

### 4.4 Delayed settlement recovery (money after hold loss)

Callback/sweeper succeeds at minute 20 of a 15-min hold: funnel re-allocates (any same-type room free NOW) → `confirmed`; else `needs_allocation` + alert email + payment-health flag + guest message "assignment in progress". **No money is stranded unallocated; nothing silently confirms.**

---

## 5. Background worker (final — architecture A)

**Recommended: A — one always-on worker container** (`apps/api/src/worker.js`, thin refactor of `server.js` sweepers + heartbeats + immediate sweep on boot), deployed on the cheapest provider the owner explicitly approves (Fly shared-cpu-1x / Render Starter-class / existing VPS). **OWNER DECISION REQUIRED.** Interim: **C** — protected `POST /jobs/sweep` (`JOB_TOKEN`) on GitHub Actions cron `*/5 * * * *` ($0, delayed-execution caveat documented, no SLA, correctness preserved via §3 funnel). B (Vercel cron) rejected on Hobby (once/day) — re-evaluable only if owner already buys Pro. D (pg_cron) rejected.

| Property | Final |
|---|---|
| Execution | 60 s loop; sweeper idempotent; `pg_advisory_lock(900_000_000_001)` per sweep (release on end; lease expiry = 2× interval, self-healing after crash) |
| Heartbeat | `setting['jobs.heartbeat'] = { at, worker, counts:{holdsExpired,staleSettled,remindersSent,retries} }` each tick |
| External probe | owner's uptime monitor asserts heartbeat freshness ≤ 5 min (implementation detail owner picks: probe-endpoint-with-token vs direct Neon select vs cron-mail). **Gate C exit requires this probe proven** |
| Retry/backoff | provider failures: keep pending; no auto-fail; attempts unbounded but flagged: 5 consecutive query failures → payment-health `query_failed_repeatedly` finding; no state flip |
| Dead letter | none (bounded work); all terminal failure surfaces via payment-health + heartbeat + outbox rows; operator runbook manual override documented |
| Crash recovery | boot → immediate sweep → loop; SIGTERM cooperative stop → finish item → `prisma.$disconnect()` → exit; 10 s hard backstop; restart is safe (all jobs idempotent under constraints) |
| /ready | advisory `{ jobs: 'ok'|'stale'|'unknown' }` field ONLY; never orchestration restart input; or omit |
| Cost | unverifiable in-repo; owner's binding quote; budget ceiling a decision of the owner; worker's steady DB load = 1 connection + ~1 query/min |
| Monitoring of jobs | heartbeat + probe (above) + sweeper duration log per tick (`logger.info worker.sweep {ms,counts}`) |

Worker does **not** handle: M-Pesa initiation (request path, unchanged), guest-facing requests, eTIMS invoicing beyond existing retry, migrations.

## 6. Administrative settlement & refunds (final)

### 6.1 `POST /admin/reservations/:reference/settle` (receptionist+; manager+ for comp)

Body (`recordSettlementSchema`):
```
{ reason: 'desk_payment' | 'comp' | 'management_override',
  method: 'cash' | 'mpesa' | 'card' | 'bank' | 'other',
  amountMinor?: integer — defaults to remaining balance; must EQUAL remaining balance when reason='desk_payment'; must be ABSENT or 0 when reason ∈ { 'comp', 'management_override' },
  externalRef?: string (recommended for non-cash),
  note?: string — REQUIRED (≥ 8 chars) when reason ∈ { comp, management_override } }
  // comp / management_override additionally require role ∈ { manager, admin }.
```
Behaviour: `reservation FOR UPDATE` lock → aggregate succeeded (net of refunded attempts) **inside tx** → if ≥ balance: 409 `ALREADY_PAID`; else insert payment (`provider='manual'`, `status='succeeded'`, `providerReference='DESK-<reservationId>-<settlementSeq>'` where seq derives from `count(*)` rows + 1 in-tx or random hex) → insert attempt (`verified=true`, rawPayload evidence incl. reason/role/session) → funnel confirm → audit `payment.desk_settled` (or skip payment row for comp — `reservation.comp_confirmed` instead). Response `{outcome, reservationStatus}`.

**Comp rules:** manager/admin only; **no payment row**; method must be `comp`; allocations happen identically (comp room occupies inventory); role snapshot + session id + actor + note mandatory; monthly comp audit query exists (Findings area in Reports).

### 6.2 `PATCH /admin/reservations/:reference` (narrowed)

`TRANSITIONS.pending = ['cancelled']` only. Any pending→confirmed attempt returns **409 `REDIRECT_SETTLEMENT`** for one release cycle; thereafter 422 with same code. `checked_in`/`checked_out`/`cancelled` unchanged.

### 6.3 Refunds (`POST /admin/payments/:id/refund`)

- Reason: recompute cap **inside the reservation row lock** — `captured_net = SUM(payment.succeeded) − SUM(attempt.refunded for reservationId)`; reject if `refund + already_refunded > captured_net` (400 `REFUND_EXCEEDS_CAPTURE`).
- Full refund: `payment.status → refunded` (attempts carry refund rows); partial: `partially_refunded`. Reservation status untouched (refund ≠ cancel); allocations unchanged (documented: finance and occupancy are independent post-settlement).
- No M-Pesa API reversal (Daraja B2C not implemented; refunds are bank/cash handled by staff, recorded here) — **irreversible on Daraja's side; note in `OPERATIONS.md`**.
- Esperance: `REFUND-<paymentId>-<attemptSeq>`; cap enforced by DB-8-consistent net-capture accounting.

### 6.4 Audit & attribution (final)

Namespace convention: `reservation.*` · `payment.*` · `guest.*` · `auth.*` · `settings.*` · `room.*`. Staff writes capture: `actorUserId`, `sessionId` (middleware exposes it), `roles[]` snapshot, `ip`, `ua` (truncate). System writes use `actorUserId=NULL` with actions prefixed `system.` (or documented: webhook settle = `payment.mpesa_settled` with NULL actor, query evidence referenced by payment id). Insert-only REVOKE is **Phase 2** — named here so no one "discovers" immutability gaps later.

## 7. State machines (normative)

### 7.1 Reservation
| From \ To | pending | confirmed | checked_in | checked_out | cancelled | expired | needs_allocation |
|---|---|---|---|---|---|---|---|
| pending | create | **funnel only** (W/RQ/SW/D) | — | — | A(release) / W/RQ/SW (failure releases) | SW (15 min elapsed & no occupying allocation) | W/RQ/SW/D funnel when realloc fails |
| confirmed | — | — | A | — | A | — | — |
| checked_in | — | — | — | A | — | — | — |
| checked_out | — | — | — | — | — | — | — |
| cancelled | — | — | — | — | — | — | — |
| expired | — | re-query may resurrect via funnel (re-allocation) — see 7.2 | — | — | — | — | W/RQ/SW when realloc fails |
| needs_allocation | — | **funnel: staff assignment or sweeper realloc** | — | — | A | — | — |

### 7.2 Payment attempt
| From \ To | pending | succeeded | failed | refunded | partially_refunded |
|---|---|---|---|---|---|
| pending | initiate / attempt | W/RQ/SW/D settle | STK failure; amount mismatch | — | — |
| succeeded | — | — | **never** | full refund | partial refund |
| failed | — | **never** (test) | — | — | — |
| refunded | — | — | — | — | — |
| partially_refunded | — | — | — | remainder refund | — |

**Resurrection semantics (explicit):** a payment settled after its reservation expired performs the funnel *from whatever state the reservation is in*, flipping it to `confirmed` (re-alloc) or `needs_allocation` — never silent, never without allocation.

### 7.3 Payment
Mirrors 7.2 with same transitions; additionally `pending → failed` covered above; no path writes `succeeded` except the funnel CAS.

### 7.4 RoomAllocation
| From (kind,state) \ To | hold,occupied | reservation,occupied | released | expired |
|---|---|---|---|---|
| hold,occupying | create (TTL) | promote (funnel; `expiresAt=NULL`) — realloc inserts *new* rows if holds lost | cancel / payment-failure release | SW flip at `expiresAt` |
| reservation,occupied | — | — | cancel release | — |
| released,* / expired,* | — | — | — | — |

Invariants: exclusion constraint (unchanged) backstops all of this; every `confirmed` reservation has ≥ 1 `reservation,occupying` allocation per room (enforced by §3 precondition + tested).

### 7.5 Reconciliation (derived detectors, exposed via payment-health)
| Detector | Definition | Severity if non-zero |
|---|---|---|
| `unpaid_confirmed` | confirmed ∧ no net-captured ≥ 0 (comp excluded via audit action) | error |
| `paid_but_unallocated` | succeeded payment ∧ reservation `needs_allocation` > 5 min | high |
| `duplicate_confirmation` | > 1 confirmed audit row per reservation | error (should be impossible) |
| `refunded_exceeds_captured` | net capture < 0 | error |
| `over_total_blocked` | trigger P0001 events from app logs | high |
| `stale_pending` | pending > 45 min (query failure streak ≥ 5) | medium |

## 8. API contracts (final)

| # | Endpoint | Change | Compat |
|---|---|---|---|
| 1 | POST `/payments` | Response `{status:'pending', provider:'mpesa', message}` — **no `checkoutRequestId`** | Web verified unaffected |
| 2 | POST `/webhooks/mpesa` | External envelope unchanged; §4 internal verify-then-settle; 200 on settle/no-op; 503 on transient verify failure | Daraja-compatible |
| 3 | PATCH `/admin/reservations/:reference` | `pending → confirmed` removed; 409 `REDIRECT_SETTLEMENT` (one release cycle, then 422) | Staff workflow replaces with settle dialog |
| 4 | POST `/admin/reservations/:reference/settle` **(new)** | §6.1; `recordSettlementSchema` shared zod; `Idempotency-Key` header supported (recommended adopt — owner confirms §16.11) | new surface |
| 5 | POST `/admin/payments/manual` | Kept; rewired to §6.1 transaction (no duplicate logic); response shape extended with `outcome` | backward compatible |
| 6 | GET `/admin/reports/payment-health` | gains `needs_allocation` + `query_failed_repeatedly` + `over_total_blocked` findings; comp count added to Financials | additive |
| 7 | POST `/jobs/sweep` **(only if owner picks C; owner picks A → not created in v1)** | `Authorization: Bearer <JOB_TOKEN>`; `{swept, at}`; namespaced `internal` | optional |
| 8 | GET `/api/v1/ready` | advisory `jobs` field only (§5) | additive, harmless |
| 9 | Web BookingConfirmation | one status branch: `needs_allocation` → "Your payment is received — we're assigning your room and will confirm within the hour. Reference <ref>." — minimal, existing design system | web copy only |
| 10 | Web Admin Rooms / Reservations | `needs_allocation` filter + "Assign rooms" action; settle dialog distinguishes `desk_payment` / comp with reason select; no layout redesign | additive UI |
| 11 | Admin audit-log UI | namespace filter (`reservation.`, `payment.`) if trivial; else defer | additive/optional |

## 9. Database invariants & migration strategy

**DB changes (additive only; forward-only migrations):**

| # | Change | Kind | Reversibility |
|---|---|---|---|
| DB-1 | `ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'needs_allocation';` | enum add | **not revertible** (Postgres) — dormant value if reverted (no rows written); dropped code paths ignore it; keep constant migration |
| DB-2 | `CREATE UNIQUE INDEX payment_attempt_providerReference_succeeded_key ON payment_attempt (providerReference) WHERE status='succeeded';` | partial unique | droppable |
| DB-3 | `CREATE INDEX payment_reservationId_status_idx ON payment ("reservationId", status);` | index | droppable |
| DB-7 | `CREATE INDEX payment_attempt_reservationId_status_idx ON payment_attempt ("reservationId", status);` | index | droppable |
| DB-8 | `CREATE OR REPLACE FUNCTION payment_net_capture_guard() …; CREATE TRIGGER payment_over_total_guard …` | trigger | `DROP TRIGGER` instant; **owner approval required to ship** |
| DB-9 | `CREATE UNIQUE INDEX one_desk_succeeded_per_reservation ON payment ("reservationId") WHERE provider='manual' AND status='succeeded';` | partial unique | droppable in Phase 1 (partial payments) |

Explicitly rejected: secondary "one active hold per room" constraint (trigger is the settlement guarantee; holds don't need it), changing `PaymentStatus`, `RoomAllocation` or any FK, altering the exclusion constraint.

**Migration order:** DB-1 first (enum add) → DB-2/3/7 → DB-9 (v1) → DB-8 (if approved) after owner sign-off → regenerate client → `inline-wasm.mjs` → committed generated client updated → `migrate deploy` on scratch DB → full suite. Production Neon: **owner-executed** migration window with PITR fresh backup first; pre-flight = restore drill completion (owner).

**Rollback:** revert deploy (prior commit) → drop DB-2/3/7/9 and trigger → keep enum value (dormant, harmless) → worker stopped → prior behaviour restored. No data loss ever; reservation rows never need editing.

**Safety:** `room_allocation_no_overlap` remains the room-level arbiter at every step.

## 10. Failure-injection acceptance suite (all 12, from 0-B §6)

| # | Injection | Acceptance criterion |
|---|---|---|
| a | Two concurrent captures (desk + M-Pesa, both == balance) | one 201/200 · other 409 · `SUM captured net = T` · one confirm · one allocation set · trigger/Layer-1 never errors for legit single pay |
| b | Worker offline; callback arrives | settles normally (webhook is worker-independent) · holds eventually expire independently · heartbeat staleness probe fires · on worker restart backlog clears · tests must NOT assert callback failure with worker down |
| c | DB tx fails after provider reports success | 503 to caller · 0 rows persisted · `payment.pending` unchanged · sweeper later settles cleanly · migration replay green |
| d | Allocation expires immediately before settlement | funnel: promote 0 → realloc success → `confirmed` + fresh `reservation,occupying` rows OR `needs_allocation` · never zero-allocation `confirmed` |
| e | Worker crashes mid-reconciliation | heartbeat stale alert fires · restart re-runs idempotently · no duplicated reminders/attempts beyond constraints · locks released |
| f | Duplicate admin settlement (double-click, ×8 concurrent) | exactly one 201 · rest 409 · captured sum = T · one audit row |
| g | Refund races settlement | reservation lock serialises · loser 409/400 · sum ≤ T · audit consistent · allocations unchanged |
| h | Daraja inconclusive (9999/null) | payment stays `pending` · attempt rows `verified=false` · allocations retained · no `failed` flip · sweeper re-queries indefinitely |
| i | Callback replay hours later | 200 `Accepted (already …)` · no new attempt (DB-2) · zero state change · zero audit additions |
| j | Over-capture attempt | P0001 (or Layer-1 400) · no rows written · `payment.over_total_blocked` logged |
| k | Confirm with zero allocations | fixture: hold expired manually; type sold out ⇒ `needs_allocation` · allocation count = 0 · `status ≠ confirmed` |
| l | Forged webhook | 200 + `reply(1,…)` or stkQuery-disagreement branch · zero writes · `payment.forgery_attempt` audit/log |

**Gate criteria:** 12/12 green in CI (local Docker Postgres) + full existing 58 green (`m4` modified per §6.2 expectation) + e2e settle journey (if owner approves scope §16.8) + staging rehearsal: create → hold expiry → sandbox pay → `confirmed` with allocation → comp flow → double-settle blocked.

## 11. Migration windows, rollback limitations, release acceptance

**Sequencing with owners at each gate:**
Phase 0-A (env/secrets enablement — Neon rotation, allowlist env values, SMTP decision) → Gate A (branch `m10-phase-0`; schema deployed to scratch; CI green) → Phase 0-B (webhook verify-then-settle; A-1; A-6 counter) → Gate B (12/12 + 60+ green; invariant property test; staging rehearsal #1) → Phase 0-C (settle endpoint; PATCH narrow; UI dialog; comp path; refunds) → Gate C (staging rehearsal #2; owner walkthrough; `needs_allocation=0` demo) → Phase 0-D (worker + heartbeat + probe; C bridge if A denied) → Gate D (heartbeat ≥ 24 h staging; stale recovery demo; reboot resilience) → Phase 0-E (owner-authorized production deploy; §11 verification; 7-day observation).

**Rollback limitations (explicit):** enum value cannot be dropped (§9); trigger not needed post-revert (dropped with DB rollback); Vercel `main` rollback is a `git revert` redeploy (DB untouched); worker rollback = stop container (jobless posture, known-bad state documented); **never revert by editing production data**; never run `migrate deploy` outside an approved window with fresh PITR-verified backup; rollback of UI ships independently (web static; API contract still accepts old payloads for one release).

**Release acceptance criteria (all required, in order):** CI green (audit critical, Trivy CRIT/HIGH, 12/12 injection suite, existing suite, build, e2e) → staging rehearsal signed by owner → heartbeat + probe evidence → 7-day observation with `needs_allocation=0`, zero `over_total_blocked`, zero unexpected `paid_but_unallocated` → production post-deploy verification → DECISIONS.md entries recorded by **owner** (agent may draft; owner commits decisions in own words) → M10 closeout.

## 12. Release blockers cross-mapped to M9

P0-01/02/03/04 ↔ M9-01/02/03/04 (all closed at design). Phase 0 does **not** close M9-05..31 — their disposition remains in M9 §10 remediation roadmap and must not be silently scooped into Phase 0.

## 13. Security requirements (summary layer, normative)

Single settlement enforced at **four layers** (lock / aggregate / DB-2 / trigger) — no single failure is fatal. Callback is never proof. Credentials env-only. Desk evidence captured. Audit namespace consistent. Role walls: comp ≥ manager; settle ≥ receptionist; money refunds ≥ manager. No PII in logs beyond reference masking. Sessions carry IP+UA (in DB, by design). `rawPayload` PII retention — Phase 2 review. Console error redaction — Phase 2.

## 14. Dependency graph (implementation)

```
DB-1 ─┬─► §3 funnel ─┬─► P0-01 webhook ─┬─► Gate B ──► Phase 0-C ──┐
DB-2 ─┤              │                  │                          ▼
DB-3 ─┤              └─► P0-02 worker ──► Gate D ──────────────► Phase 0-E
DB-7 ─┤                                                       (prod, owner-gated)
DB-9 ─┤   ▲                                                      ▲
DB-8* ┘   │                                                      │
        §6 settle ──► Gate C ──────────────────────────────────────┘
        §6 refund cap ──► §6 settle shared invariants ──► Gate C
        recordSettlementSchema ─► §8.4 settle route ─► §8.10 admin UI
        adminAllocationNeeded template ─► §3 escalation (optional per owner SMTP)
        heartbeat + probe ─► Gate D (mandatory)
   * DB-8 ships only if owner approves (Layer 4; see §16.3)
```

Milestone order (A→E above) is binding; no gate skipped, no scope folded in without owner approval.

## 15. Owner approval gates (explicit; nothing here is self-authorizing)

| Gate | Approval required from owner |
|---|---|
| G1 | Neon password rotation executed + `ready` verified (M8 §2 prerequisite) |
| G2 | DB-8 trigger approval (or explicit Layer-1-only decision) |
| G3 | Worker hosting A vs C + budget ceiling + binding quote (provider, region) |
| G4 | `MPESA_WEBHOOK_ALLOWED_IPS` values for production (Safaricom list) |
| G5 | SMTP provider + domain + `EMAIL_FROM` + `adminAllocationNeeded` enabled/absent |
| G6 | Heartbeat probe implementation choice + on-call owner |
| G7 | Admin UI spec (settle dialog + Assign rooms + needs_allocation filter + comp report location) |
| G8 | Desk reference option `DESK-<resId>-<seq>` acceptance (zero-cost; confirm) |
| G9 | Partial desk payments scope (v1 exact-full only — or pull into Phase 0) |
| G10 | Comp manager-only rule acceptance (vs receptionist allowed) |
| G11 | Go/no-go for production deploy + observation window sign-off |
| G12 | Explicitly: **no Daraja production credentials, no M-Pesa activation, no Vercel production push** without separate written owner instruction |

## 16. Remaining architectural uncertainties (explicitly not resolved here)

1. **Trigger design scrutiny:** Layer-2 `payment_net_capture_guard` — trigger placement `BEFORE INSERT OR UPDATE OF status ON payment` covers the funnel's `update(...)` from pending→succeeded and inserts of desk payments; does not lock rows across DAL callers that bypass Prisma (raw SQL inserts) — acceptable: DAL is the only writer today; flag for review at implementation.
2. **SettlementSeq derivation:** in-tx `count(*)+1` collision-prone under serialization fallback? No — row lock serialises; but `count(*)` ties to reservation scope: `SELECT count(*) FROM payment WHERE "reservationId" = ?` + 1 → unique per reservation across desk settles; concurrency safe under lock. Alternative: random 6-hex. **Decision owner can confirm at code review** (G8 covers desk uniqueness mechanism).
3. **Comp is terminal?** Comp-confirmed reservation with cancellation later — allowed by `TRANSITIONS.confirmed = ['checked_in','cancelled']`; comp + cancel = clean ledger, allocation releases; no refund involved. Documented; no change.
4. **Worker multi-instance later** — `pg_advisory_lock` required then; v1 single instance; documented limitation, not a Phase 0 blocker.
5. **`needs_allocation` SLA** — 24 h fail-safe: any reservation in `needs_allocation` > 24 h auto-expires via worker refund-mark + outbox customer apology draft (no auto-refund movement — money never auto-reverses; staff executes) — **owner decision** whether to enable in v1 or leave staff-only.
6. **eTIMS for comp** — issueTaxInvoiceSafe runs on confirm; comp reservations produce `skipped` invoices unless owner authorizes mock/sandbox KRA certification; currently `ETIMS_ENVIRONMENT=disabled`; unchanged.
7. **Helpers sharing `requeryStalePayments` between worker and tests** — exports defined at implementation; shape (in-process function vs module import) is internal; not capability-relevant.
8. **e2e coverage of settle dialog** — owner scope decision (G7/G11).
9. **Callback Amount mismatch → fail closed forever?** If Daraja ever returns amount in a different unit (KSh vs cents) the failure mode bricks that transaction class — `stkQuery` confirms outcome but not amount; acceptable fail-closed given exact-balance initiation; documented; monitor `amount_mismatch` finding.
10. **Refund of `needs_allocation` reservation** — allowed; releases nothing (no allocations); leaves reservation `needs_allocation` with net capture negative → payment-health `unpaid_confirmed` exception excludes comp only — confirm comp vs ordinary encode for refund exclusion at implementation.
11. **`Idempotency-Key` on settle** — recommended; owner confirms (G6-ish / open).
12. **`/ready` jobs field vs separate `/jobs/health`** — two owners of "job freshness"; recommended single: separate protected endpoint for the probe; `/ready` stays minimal. **Owner picks.**
13. **Webhooks: does Safaricom retry on non-200 at all?** Unverifiable; recovery design never relies on it (§4.2) — no decision needed, behaviour safe regardless.
14. **Neon PITR + restore drill on provider** — prerequisite G1; owner-submitted evidence required; nothing in this spec proceeds without it.
15. **Node major on worker host** — Node ≥ 22 matches Docker images; worker image follows `apps/api/Dockerfile`; owner confirms host capability.

## 17. What this specification does not authorize (unchanged boundaries)

No code, no schema applied, no env changed, no infra provisioned, no Daraja sandbox→production flip, no commit, no push, no deployment, no M10-B input merged into any environment. Implementation begins at G1–G4 minimum, by explicit owner instruction, one gate at a time.
