# M10 — Phase 0-B: Independent design review of the Phase 0 remediation plan

**Date:** 2026-11-13 · **Type:** design review, no implementation. **HEAD:** `2ccffd9` (unchanged). M8/M9/M10 artifacts preserved. **No database, credential, infrastructure, or deployment action taken.**

Reviewed document: `docs/M10_PHASE_0_REMEDIATION_PLAN.md`. This review is intentionally adversarial: every recommendation it contains is re-examined, and several are **corrected**. Verdict key per finding:
- **CONFIRMED** — holds up as written.
- **CORRECTED** — must change before implementation.
- **WEAKENED** — acceptable only under tightened conditions.
- **OWNER DECISION REQUIRED** — not an engineering call.

---

## 1. Single-settlement guarantee — the plan's weakest link, corrected honestly

### 1.1 What the M10 plan actually guarantees, formally

M10 proposes DB-2: `CREATE UNIQUE INDEX payment_attempt_providerReference_succeeded_key ON payment_attempt(providerReference) WHERE status='succeeded'`.

That index enforces exactly one invariant:
> **No two payment attempts with the same `providerReference` may both reach `succeeded`.**

It does **not** enforce reservation-level settlement-once. Concrete counter-examples of what DB-2 alone allows:

1. M-Pesa payment A (`ws_CO_xxxx1`) settles. Later, staff desk-posts a second **full** payment B (`DESK-…`). Both are `succeeded`; sum = 2× total. DB-2 is silent (different references).
2. Webhook A settles. Two days later the Sweeper re-queries the same payment — already `succeeded`; CAS blocks the flip — fine. But desk top-ups are **never** blocked by DB-2, so path 1 remains fully open.
3. Refund of A executes; A becomes `refunded`; a desk payment B now lands. Two `succeeded`-class payments existed for one reservation (A was succeeded before refund). Legit at the sequence level — but the invariant must be *net*: `SUM(captured, net of refunds) ≤ total` or explicitly overpaid-and-flagged. DB-2 enforces none of this.

### 1.2 The exact invariant required

For each reservation `R` with total `totalMinor T` and currency `C`:

```
SUM(minor over payments p where p.reservationId = R.id AND p.status IN ('succeeded'))
− SUM(attempt.amountMinor over payment_attempt a where a.paymentId = p.id AND a.status = 'refunded')
  ≤ T
```

and separately: **no reservation may reach `confirmed` twice** (serialize by row lock — see 1.3) — this is currently satisfied by the `FOR UPDATE` + `status = 'pending'` CAS, but the above payment invariant is enforced by **nothing** in M10.

### 1.3 Enforcement layers, in order of preference

**Layer 1 — transaction + lock (works for every code path, races included):** every settle/refund path takes `SELECT … FROM reservation WHERE id = $1 FOR UPDATE`, then inside the transaction computes the net-captured sum **from rows it is about to join**, and rejects if `newNet > T`. This is code-enforced, reviewed, and code-reviewed in M10; but the plan delegates *all* enforcement to code in four paths (webhook, requery, sweeper, desk) — a fifth call-site that forgets the check silently re-opens the hole.

**Layer 2 — DB trigger (recommended, closes the class forever):**

```sql
CREATE OR REPLACE FUNCTION payment_net_capture_guard() RETURNS trigger AS $$
DECLARE over_minor bigint;
BEGIN
  IF NEW.status <> 'succeeded' THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(p."amountMinor"), 0)
       - COALESCE((SELECT SUM(a."amountMinor") FROM payment_attempt a
                    JOIN payment px ON px.id = a."paymentId"
                   WHERE px."reservationId" = NEW."reservationId" AND a.status = 'refunded'), 0)
    INTO over_minor
    FROM payment p
   WHERE p."reservationId" = NEW."reservationId" AND p.status = 'succeeded' AND p.id <> NEW.id;
  IF over_minor + NEW."amountMinor" > (SELECT "totalMinor" FROM reservation WHERE id = NEW."reservationId") THEN
    RAISE EXCEPTION 'PAYMENT_OVER_TOTAL' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payment_over_total_guard BEFORE INSERT OR UPDATE OF status ON payment
FOR EACH ROW EXECUTE FUNCTION payment_net_capture_guard();
```
(Design only — exact column casing verified against `schema.prisma` `Payment` and `Reservation`; `refunded` attempts carry `paymentId`, reserved alongside `partially_refunded` transitions. Owner approval needed to ship the trigger versus code-only. **OWNER DECISION REQUIRED.**)

**Layer 3 — partial unique for the desk full-capture case (optional, v1 exact-full only):**

```sql
CREATE UNIQUE INDEX one_succeeded_desk_full_per_reservation
  ON payment ("reservationId") WHERE provider = 'manual' AND status = 'succeeded' AND "amountMinor" > 0;
```

permits exactly one succeeded desk full payment per reservation — matches v1 semantics (desk requires exact balance). **Drops automatically when partial desk payments are enabled in Phase 1** (schema change in the same migration; documented dependency).

**Recommendation: Layer 1 + Layer 3, plus Layer 2 if the owner approves a trigger in the migration.** Do not ship Layer 1 alone for a four-branch call graph; do not ship Layer 3 alone (it can't see M-Pesa). DB-2 stays — it is genuinely correct for its own scope (once-only per provider reference).

### 1.4 Refunds and legitimate additional payments — represented correctly

- **Refunds reduce capture; they do not release allocation holds automatically** (cancel path does allocation release; refund does finance only). Net-capture accounting must subtract refunded major minors — shown in Layer 2. Refund race with settle: refund should take the **same reservation `FOR UPDATE` lock** (it does not today — `payments/routes.js:245-277` never locks), compute net captured in-tx, verify cap, then write — reviewed in §4 and §6-g.
- **Legitimate additional payments** = partial settlements before full capture. v1 forbids them silently (sum must not exceed total) — Layer 1/2 represent them honestly as `pending` partial rows whose sum stays ≤ total; reservation remains `pending` until the sum reaches total; settlement flips only then. (Design detail missing from M10: partial desk payments are *representable* today, just not permitted by the route — confirm in §12.5.)
- **Over-capture** = P0001 error → never a `succeeded` row overwriting balance; surfaced as 400/409 and as a `payment-health` anomaly finding (existing report gains two findings: `over_total_blocked`, `net_capture_negative` — money left the ledger shape).

### 1.5 Concurrency demonstration

Two transactions `T1`,`T2` (desk settle; webhook) both insert `payment` row `NEW` for reservation `R`:

- **Layer 1:** both block on `SELECT … FOR UPDATE` of R's row. T1 proceeds; T2's `afterConfirmed`-equivalent re-check observes `T1`'s committed sum (returns ≥ T → 409) — deterministic regardless of winner.
- **Layer 2:** T2's `INSERT` passes Layer 1 (never runs its trigger path if T1 commits first at read time — but under `READ COMMITTED` the trigger's `SELECT SUM` runs **inside** T2's transaction and **sees uncommitted T1? No** — it sees T1 only if T1 committed before T2's trigger read. Under row lock Layer 1 prevents the case where both trigger reads see the same pre-T1 state plus their own NEW row and overshoot. If Layer 2 fires without Layer 1, both could overshoot past total **before** one commits. So Layer 2 alone is not sufficient; Layer 1 alone is not defense-in-depth. Both.
- **DB-2 (attempt unique):** both transactions create attempt rows with different references → no collision; both persist; only the *payment* row criticality matters — handled above.

### 1.6 Corrections to the M10 doc

- **M10 DB-2** stays but is called out as attempt-scope only; add **M10 DB-8** (Layer 2 trigger, pending owner approval) and **M10 DB-9** (Layer 3 index, v1-only, coordinated drop in partial-desk migration).
- **M10 §5 (P0-03 funnel)** gains an explicit over-capture guard at settle time (defense-in-depth with the trigger): compute net captured before `payment.update({status:'succeeded'})` and refuse if over.
- **Desk `providerReference` uniqueness:** replace `DESK-${Date.now()}` with deterministic `DESK-<reservationId>-<attemptSeq>` (unique per settle call, human-legible, collision-safe under concurrency) — see §12.4.

---

## 2. Daraja payment recovery

### 2.1 Callback fault matrix (behaviour definition)

| Scenario | Defined behaviour (M10-compatible) | Notes / gaps found |
|---|---|---|
| **Missing callback** (customer pays; Safaricom delivers nothing) | Payment stays `pending`. Sweeper re-queries every 60 s from creation+45 min; on query `0` → settles via funnel (with §1 over-capture guard); on failure/release → releases allocations; guest never "loses" money silently | Works today; missing in docs is **operator-visible staleness** — M9-12 gap remains: add PaymentHealth `needs_attention` counter (P0-04/§5 extension) |
| **Duplicated callback** (same CheckoutRequestID, twice) | Terminal-state early-200 path (`routes.js:110-115`) + once-only settle CAS (`updateMany … where status='pending'`) + DB-2 constraint as final arbiter → **zero double settlement** | M10's once-only index prevents attempt duplication; payment CAS prevents status duplication; end-to-end idempotent |
| **Delayed callback** (arrives after 45-min sweep, or at minute 20 post-expiry) | Same as missing/present: verify via `stkQuery`; if `0` → settle; hold already expired → **re-allocation branch** (§3); if impossible → `needs_allocation` | Delayed + hold lost is the normal real-world case → the re-allocation path is **mandatory**, not optional |
| **Forged callback** (attacker replays initiation response's `checkoutRequestId`) | Server re-queries Daraja with our credentials: `stkQuery` outcome decides. Forgery fails (STK never completed for that reference). **Callback bytes are never proof.** Amount corroboration kept (fail closed) but is not the security boundary | M10 §3 P0-01 delivers this; this is the fix's raison d'être |
| **Callback with malformed/unknown CheckoutRequestID** | `reply(1,'Unknown transaction')`; no writes; rate-limit bypass unchanged; optionally log at `warn` | unchanged from current code — fine |
| **Callback for a payment already terminal** | 200 `Accepted (already <status>)`, anomaly-log on success-vs-failed contradiction | unchanged; add **no** mutation — confirmed |
| **Daraja query unavailable** (HTTP 5xx, timeout, non-200 to `/stkpushquery`) | **No settlement.** Webhook responds **503** to Daraja; Daraja's retry policy is **not relied upon** (see §2.2). Payment remains `pending`; sweeper re-queries; heartbeat/stale metric surfaces it | M10's "Safaricom retries" assumption is **CORRECTED**: do not count on provider retry; the sweeper + 503 (for future webhooks) + manual requery are the recovery path; document both |
| **Query inconclusive** (`resultCode = 9999`/`null`) | Treated identically to "still processing": no settlement, no failure flip; attempt recorded `pending`/`verified=false`; re-query next sweep | Correctly identified in M10; **gap:** no attempt-cap/terminal-stale escape; a payment whose guest never completes STK will keep `payment` row `pending` **forever** → add a terminal-stale transition after N sweeps of explicit provider failure *only* (never on 9999 alone → possibly a paid-but-unreviewed booking — terminal done via human reconciliation, not auto-fail) |
| **Provider total outage** | Same as unavailable: zero settlements; availability continues for cash/desk at property (manual settle path unaffected — runs locally); document comms to guests (no confirmation until Daraja healthy) | Not modeled in M10 explicitly — **CORRECTED**: offline Daraja must not block the hotel operating manually; desk settlement (P0-04) explicitly is the outage mode |

### 2.2 Provider truth vs internal state — rule hierarchy

```
Daraja owns:   did money move?  (resultCode, via stkQuery with our credentials)
Our own DB:    what we initiated, what we've recorded, what inventory is held,
               allocation ledger, audit trail.
Never inverted: internal state never advances without provider acknowledgement,
                and provider acknowledgement is never consumed without allocation.
```

**Retry cannot duplicate financial records** iff:
- settle is at-most-once per payment (§1 layers), AND
- requery retries are outside the settle CAS (`updateMany ... where status='pending'`), AND
- attempt rows are append-only with a partial unique constraint, AND
- re-allocation on late settlement does **not** create new reservation/source rows — it reuses the reservation (no `sourceId` churn) — M10's design does this correctly; flagged for tests in §6-d.

### 2.3 The signal this review forces into the open

`POST /payments` initiation returns 201 with `status:'pending'` — the guest sees no confirmation at all. **Both current production and the M10 design keep the same guest contract** ("Your room is held… settle at the front desk or wait"). That is honest. Do not pretend otherwise in the UI copy or staff training. (M8 booking honesty docs carry this; keep.)

---

## 3. Worker reliability — mechanisms the plan under-specified

M10 recommends architecture A with a 60-second loop and heartbeat. Adversarial review below:

### 3.1 Distributed locking and lease expiry

- **Single instance v1:** one worker per deployment. Locking is advisory; do not claim distributed correctness that doesn't exist. M10's "optional later" is actually **required if A ever scales beyond one instance** (owner may add a second worker for HA).
- **`pg_advisory_lock(9001000000)`** (or a `job_lock` table row `{key='sweep', lease_until}`) acquired at sweep start, released at sweep end; lease expiry = sweep interval × 2 (2 min) — if the worker crashes mid-sweep, the next worker (or orchestrator restart) acquires after expiry; no two sweepers ever run concurrently beyond one crash-boundary window.
- Lock scope per job, not per loop (inventory sweep ≠ email sweep) to avoid cross-job convoying.
- Implementation hint only — final design in Phase 0-D with owner sign-off. Not a dependency for v1 single-instance.

### 3.2 Duplicate execution — where it can and cannot hurt

- Idempotent UPDATEs (`hold→expired`, `pending→expired`) — duplicate-safe even without locking.
- `sweepStalePayments` — **not** trivially safe: two instances both see the same stale pending → both call `stkQuery`, both settle or both flip failed, duplicate attempt rows (DB-2 blocks succeeded-dedupe; CAS on payment blocks state flip; attempts can still double: two `pending` query-attempts, both fresh — benign; two `succeeded` attempts — blocked by DB-2). Duplicate execution is tolerable **only** via §1 constraints. Single instance avoids the entire class.
- `sweepArrivalReminders` — outbox `dedupeKey` unique → at-most-once per reservation; safe under duplication.
- `retryFailedInvoices` — attempts bounded (5); receipt `MAX+1` race documented (M10 DB note): collisions land as `failed` with `P0001`→ unique index — no corruption; dry coverage exists (m5 eTIMS boundary test).

### 3.3 Retry/backoff/dead-letter

| Job input | Policy | Terminal escape |
|---|---|---|
| Hold/pending reservation flip | No retry needed (single UPDATE; crashes rolled back by statement atomicity; next tick retries free) | n/a — can't wedge |
| Stale M-Pesa re-query | Immediate re-query each sweep; on provider failure keep `pending`; after **5 consecutive query failures**, flag `payment-health.stale_pending` + notify admin (existing report query gains a "query_failures" column); never auto-`failed` (guest may still pay → hold lost → re-allocation path) | hand to humans |
| Arrival reminder send | 3 inline attempts (existing `MAX_ATTEMPTS=3`), outbox→`failed` with attempt count; manual retry endpoint or SQL nudge (runbook) | humans review `email_outbox` daily — automate detection in M9-12 work, not Phase 0 |
| eTIMS invoice retry | 5 attempts, `failed` terminal | report flag exists; no auto-anything |
| **Dead letter (general)** | none needed beyond the above three + heartbeat; document "if heartbeat stale > 5 min, page operator" (see 3.5) | — |

### 3.4 Graceful shutdown and restart recovery

- SIGTERM → cease new sweeps → finish in-flight item (≤ 60 s worst case, typically <1 s) → `prisma.$disconnect()` → `process.exit(0)` with 10 s backstop (pattern already present in `server.js:119-130` — **parent design correct, not to be regressed**).
- On boot: run sweep **immediately**, then loop. Any backlog from downtime is handled by the first sweep (no expensive catch-up logic needed).
- In-flight settlement during shutdown: payment settle is a single DB transaction — it either commits or rolls back; provider truth unchanged; sweeper recovers on restart. Document in runbook: "worker restart is safe at any point" with this argument.

### 3.5 Health monitoring and missed-execution detection

- **Heartbeat:** worker writes `setting['jobs.heartbeat'] = { at: ISO, counts: {holdsExpired, stalePaymentsSettled, remindersSent, invoicesRetried} }` every sweep (cheap KV write already used for `admin.settings`; same table, additive key).
- **Detection:** an external probe (owner's uptime monitor choice) must assert `SELECT value FROM setting WHERE key='jobs.heartbeat'` freshness ≤ 5 min — one of: a tiny cron endpoint (`GET /jobs/health` requiring `JOB_TOKEN`, or a direct DB-side probe via Neon's connector if permitted, or a Vercel cron function that emails on staleness — **owner decision**). Without an external probe, the heartbeat is a dead letter.
- **/ready:** M10 added an optional cached `jobs` component on `/ready` — **WEAKENED**: do not conflate DB readiness with job freshness on the same endpoint shape; if included, must degrade, not fail (orchestrators may restart on false negatives); acceptable only as advisory field (`{ok:true, jobs:'stale'}`).
- **Stale-instance detection:** worker logs sweep-duration; if a sweep exceeds interval, log `warn` + skip overlap via in-process flag (single instance); monitoring watches job duration too.

### 3.6 Cost — challenged, not rubber-stamped

M10's "~USD 3–9/mo (Fly shared-cpu-1x / Render Starter / VPS)" is **an unverified estimate, not a fact**. It may be right, may not be — pricing pages, trial credits, per-seat vs per-project billing, and regional premiums all change it; none of it is legally knowable from this repo. Requirements for Phase 0-D sign-off:

- Owner retrieves live quotes for exactly one named provider, in writing, before purchase; the number wins over this document;
- Include the worker's own DB load: 1 constant connection + 1 query/min + spikes — fine on Neon free tier, but if owner picks a separate DB host (e.g. Fly Postgres) that's a different budget and data residency question (**OWNER DECISION REQUIRED**);
- If budget is a hard constraint, architecture **C** (protected endpoint + free GitHub Actions cron, 5-minute best effort) remains a zero-cash fallback with an explicit, documented SLA gap and the 503-on-webhook backstop for callbacks (§2.1) — the hotel can still operate with a slower sweep; correctness is not compromised, latency is;
- Vercel Pro (cron) stays **rejected at this brief** (needed cadence vs Hobby's once/day; Pro re-evaluates only if owner already pays Pro for other reasons — **OWNER DECISION REQUIRED**);
- Neon `pg_cron` stays **rejected** (SQL rewrite; unverified availability; poor fit).

### 3.7 Corrections to M10

- Heartbeat + external probe + runbook § "worker down" become **mandatory** (not "recommended") for Phase 0-D exit criteria.
- Graceful-shutdown block above supersedes the implicit assumption that "60 s interval + Docker restart = fine".
- GH Actions interim bridge confirmed as zero-cash option with documented staleness expectations; document expected hold-release latency 5–10 min worst case.

---

## 4. Administrative financial controls — full review

### 4.1 Complimentary reservations (comp / management_override)

- **Reservation path unchanged** — comp confirms via the identical funnel (§3 funnel): locks, allocation, audit. A comp room occupies inventory exactly like a paid room — this is correct and must survive unmodified.
- **Authorization:** manager/admin only; receptionist cannot comp (principle: staff who sells is not staff who writes off).
- **Evidence:** `reason` enum from {`complimentary`, `management_override`, `comp_upgrade`} + mandatory `note` ≥ 8 chars; audit action `reservation.comp_confirmed` distinct from `payment.*` so auditors can filter comps in one query; request `role` snapshot recorded in audit row (`roles: ['manager']`).
- **Anti-abuse:** monthly comp report query (`action='reservation.comp_confirmed'` grouped by actor) surfaces in Financials or Reports (**owner decision**: where) — a manager comping 20 rooms in a month is a policy event, not an accounting event.
- **Money-flow:** no payment row (per this review's recommendation; M10 question 4 resolved as **no row** — a zero-amount succeeded row lies in "payment volume" aggregates; keep comp off the ledger, keep it in the audit log only).
- **Duplication:** comp is reservation-level confirmation — once confirmed, guard blocks re-comp; in-tx lock prevents concurrent double-comps; comp after occupancy (post check-in) is a policy non-goal for this milestone.

### 4.2 Partial desk payments

Partially allowed by reality, denied by v1 route semantics (exact balance). Review findings:

- M10 v1 keeps exact-full only — **CONFIRMED, keep** for Phase 0 (simplicity beats completeness for the first safe release; a partial-money path with settlement logic interacts with every invariant in §1–2 and deserves Phase 1).
- **Forward-compatibility (design in now, ship later):** the over-capture trigger (§1) already permits partial `succeeded` payments as long as cumulative net ≤ total; the settle-time re-aggregation in P0-04 Layer 1 already implements "sum succeeded ≥ total ⇒ 409 already paid" vs "sum < total ⇒ accept, do not confirm". So partial payments are *permitted by the invariants*; the route just rejects them at the boundary. Phase 1 flips boundary validation only — documentation of this seam belongs in `docs/DATABASE_DESIGN.md` now (one paragraph), so Phase 1 is a route-validation change, not a schema migration.
- **Deposit / part-payment at desk** (guest pays 20% to hold, balance at arrival) is the realistic partial case; when unlocked in Phase 1, reservation stays `pending` until total captured; confirmations fire automatically on the payment that completes the sum. No design change needed then beyond the route schema and the confirm test matrix.

### 4.3 Refunds and payment reversals — races and accounting

Current refund path (`payments/routes.js:245-277`) is a **TOCTOU over-refund** (aggregate outside transaction) — M10 already flagged; this review upgrades it to a required fix because it directly undermines §1's net-capture guard:

- **Lock the reservation row** in the refund transaction (same discipline as settle);
- **Recompute the refund cap inside the transaction** from attempts + prior refunds; reject `> remaining refundable`;
- `REFUND-${Date.now()}` reference is non-unique — replace with `REFUND-<paymentId>-<attemptSeq>` (or uuid) — uniqueness guaranteed by the settlement-seq pattern; add unique index? attempts are not required unique; the payment row's `status` transitions enforce accumulation semantics; leave index out, rely on recompute-in-tx;
- Partial refund leaves reservation status untouched (stays `confirmed` on an already-arrived booking or `cancelled` on a refunded stay — documented semantics: allocation release happens only on cancel/expire, never on refund; hotel expectation matches practice).
- **Refund vs settlement race:** refund `describe before lock` → settle locks reservation → whichever commits first wins the other's pre-check; loser returns 409/400; no partial writes; net-capture guard holds at every interleaving (Layer 1 is evaluated against committed state inside the lock). Test in §6-g.
- **Accounting visibility:** payment-health report already surfaces `cancelled_with_outstanding_payment` (routes.js:703-708) — keep; add `refunded_net_exceeds_captured` CRITICAL anomaly (should be impossible post-fix; if it fires, the invariant broke).

### 4.4 Immutable audit evidence & actor attribution

- `audit_log.actorUserId` is nullable — for system-origin actions (sweeper, webhook verify settle) the actor is "system" (NULL is acceptable **with** `action` prefixing `system.` vs `admin.` vs `guest.`) — adopt namespace now: webhook settlement → `payment.mpesa_settled` (system); desk → `payment.desk_settled` (staff); comp → `reservation.comp_confirmed` (staff). Searchability by prefix becomes one query.
- **IP + user agent** on every financial audit — currently `audit()` takes `ip`; add `ua` (userAgent, truncated to 300 chars as in Session) — one line in the shared audit helper; closes attribution gap for comp disputes (e.g., "manager X at 21:44 from office laptop").
- **Session binding:** audit captures `sessionId` (schema has `Session.id`; `middleware/index.js:52` exposes `sessionId` on `req.auth`) — settle route records both `actorUserId` and `sessionId` → replay of stolen session can be tied to evidence; if the session row later expires, evidence survives (id retained, row deleted — FK is SET NULL for actorUserId only, sessions have no FK to audit — good, document).
- **Insert-only enforcement:** app-role `REVOKE UPDATE, DELETE ON audit_log` — **Phase 1**, not Phase 0 (out of P0 scope, but named now; `docs/SECURITY.md` already labels the log "append-only by convention" — the convention gets teeth in Phase 1).
- **Receipt/evidence fields:** `externalRef` column doesn't exist today — evidence lands in `audit_log.after.externalRef` (JSON) — keep schema-minimal in Phase 0; Phase 1 decides if a first-class column is warranted (reconciliation tooling prefers it).

### 4.5 Administrative paths that bypass inventory or accounting — enumerated and closed

- `PATCH pending→confirmed` (admin) — **removed** by P0-04 narrowing → cannot bypass allocation anymore.
- `PATCH confirmed→cancelled` — already correct (CAS + `releaseAllocations` + audit); stays.
- `POST /admin/payments/manual` — kept, rewired to funnel (P0-04); exact-full + lock + funnel → cannot bypass allocation.
- `POST /admin/payments/:id/requery` — already funnels; gains over-capture guard + refund cap symmetry.
- `POST /admin/payments/:id/refund` — cap-in-tx (§4.3); no allocation side effects by design; can no longer over-refund.
- **Manual room assignment** (`PATCH /admin/rooms/:number` for maintenance) — unrelated kind=`block` path; unaffected; confirm no confirm path hides behind it (it doesn't).
- **Compensation via refund-zero + manual confirm** — no longer possible (PATCH narrowed; settle path requires either money or comp reason).
- **Seed data in production** — `prisma/seed.js` creates 28-room inventory + users from env; harmless if env set; seeding production is a deliberate owner action with its own gates — unchanged, restated in §9.

### 4.6 Verdict on P0-04

P0-04 design **CONFIRMED with corrections:** lock ordering added, comp-marker row rejected (no payment row), refund cap-in-tx + refund lock added, desk reference `DESK-<resId>-<seq>`, audit namespace convention added.

---

## 5. State-machine consistency — full matrices

Notation: `S → S'` = only via named writer. Writers: W=webhook-settle, RQ=requery, SW=sweeper, D=desk/settle, A=admin PATCH, CAS=reservation row CAS, T=trigger(§1).

### 5.1 Reservation (`Reservation.status`)

| From \ To | pending | confirmed | checked_in | checked_out | cancelled | expired | needs_allocation |
|---|---|---|---|---|---|---|---|
| **pending** | create | W/RQ/SW/D (funnel) | A only after confirmed* | — | A, W/RQ/SW (payment failed→release; `expired` at sweep) | SW (15 min + no remaining allocations) | W/RQ/SW/D funnel when re-alloc fails |
| **confirmed** | — | — | A (checked_in) | — | A (release) | — | — |
| **checked_in** | — | — | — | A (checked_out) | — | — | — |
| **checked_out** | — | — | — | — | — | — | — |
| **cancelled** | — | — | — | — | — | — | — |
| **expired** | — | — (**money-only path blocked here**: any settle on expired reservation must not resurrect without allocation; re-allocation path belongs to the *payment* writer via the funnel; see 5.2) | — | — | — | — | W/RQ/SW when re-alloc fails |
| **needs_allocation** | — | W/RQ/SW/D (realloc success or staff assignment) | — | — | A (refund via §4.3) | — | — |

\* `checked_in` only from `confirmed` — enforced by existing `TRANSITIONS` (routes.js:168-175); keep.

### 5.2 Payment attempt (`PaymentAttempt.status` = `PaymentStatus` for attempts)

| From \ To | pending | succeeded | failed | refunded | partially_refunded |
|---|---|---|---|---|---|
| **pending** | initiate (`stkPush` ok) | W/RQ/SW/D settlement | STK terminated failure (callback/query/requery or sweeper) | — | — |
| **succeeded** | — | — | — | refund endpoint (full) | refund endpoint (partial) |
| **failed** | — | **never** (m5 test enforces) | — | — | — |
| **refunded** | — | — | — | — | — |
| **partially_refunded** | — | — | — | full remaining refund | — |

### 5.3 Payment (`Payment.status`)

| From \ To | pending | succeeded | failed | refunded | partially_refunded |
|---|---|---|---|---|---|
| **pending** | initiate | W/RQ/SW/D settle (CAS `where status='pending'`) | STK failure; amount mismatch (fail closed) | — | — |
| **succeeded** | — | — | — | full refund | partial refund |
| **failed** | — | **never** — contradiction (m5) | — | — | — |
| **refunded** | — | — | — | — | — |
| **partially_refunded** | — | — | — | remaining refund | — |

### 5.4 Inventory allocation (`RoomAllocation`: kind, state)

| From (kind,state) \ To | hold,occupied | reservation,occupied | released | expired |
|---|---|---|---|---|
| **hold,occupying** | create (TTL set) | **promote** (`kind→reservation`, `expiresAt→NULL`) — funnel; reallocate: **new** `reservation,occupying` rows (fresh) | cancel/fail/release (`state→released`) | SW flip at `expiresAt` |
| **reservation,occupying** | — | — | cancel | — |
| **reservation,occupied** | — | — | — | — |
| **released,\*** | — | — | — | — |
| **expired,\*** | — | — | — | — |

Invariants: (i) `reservation,occupying` rows always imply reservation status ∈ {pending, confirmed, checked_in} — checked_in retains rows; (ii) an overlapping pair violates exclusion constraint (impossible by construction); (iii) every confirmed reservation has ≥ 1 `reservation,occupying` row per room (the funnel guarantees; test in §6); (iv) `expired` hold rows never resurrect in place — new rows only.

### 5.5 Reconciliation (derived — no stored state)

Not an entity; a set of **detector queries** over the above tables:

- `unpaid_confirmed` — reservation.confirmed with no succeeded payment net ≥ 0? (comp-confirmed reservations legitimately have zero payments — detector must exclude `reason=comp` audit actions)
- `paid_but_unallocated` — succeeded payments on reservations in `needs_allocation` > 5 min
- `over_capture_blocked` — trigger log / P0001 events from application logs or audit
- `duplicate_outcome` — any reservation confirmed twice
- `refunded_exceeds_captured` — net < 0
- `terminal_failed_with_pending_alloc` — `payment.failed` with allocations still `occupying` (cancel path released them — verify both directions)
All six are read-only SQL; surface in payment-health as findings (P0-04 A-6). No migration required beyond existing tables.

### 5.6 Impossible / contradictory states (post-fix) and their guardians

| Contradiction | Guardian |
|---|---|
| `confirmed` ∧ zero allocations | funnel precondition + §6 invariant test |
| two full succeeded captures | §1 Layer 1+2 |
| `payment.succeeded` ∧ reservation `cancelled` | refund-only interplay: allowed by design (finance ≠ occupancy) — flagged in payment-health, **not** an error |
| `attempt.succeeded` ∧ payment `failed` | CAS + settle order: payment flips before attempt insert in same tx → both-or-neither; trigger §1 covers payment side; attempt unique DB-2 covers dup |
| hold re-activated after `expired` state | allocations flip state never reversible; re-allocation creates new rows only |
| `failed` payment later `succeeded` (same reference) | impossible: terminal read blocks; DB-2 once-only |
| overlapping `occupying` allocations | exclusion constraint (unchanged, backstop) |
| `checked_in` while `pending` | `TRANSITIONS` map — unchanged, correct |
| `needs_allocation` auto-expiring | no sweep path targets it — only resolution writes transition it; expired is never applied |

**RECOVERABLE-UNCONDITIONAL:** `needs_allocation` (staff reallocate or money-path via refund); `expired` reservation with pending payment (sweeper re-query can still settle — with re-allocation). **NON-RECOVERABLE/POLICY:** any path that "heals" `needs_allocation` by marking `confirmed` without allocation — forbidden forever.

---

## 6. Failure-injection tests — acceptance criteria

Each maps to a concrete vitest-style case; all against the local Docker Postgres (not production). No production execution is authorized by this section — these are the gate list for implementation.

| # | Injection | Assertion (acceptance criterion) |
|---|---|---|
| a | Two concurrent **successful captures** for one reservation (desk settle + M-Pesa callback simultaneously, both amounts == balance) | Exactly one `201/200` settle; second receives `409`; `SUM(payment succeeded net) = T`; audit contains one `payment.desk_settled`/`payment.mpesa_settled`; reservation confirmed exactly once; **one** set of `reservation` allocations |
| b | Worker **offline** while Daraja delivers callback | Callback verifies → settles — settlement is **not worker-dependent** (by design); holds expire independently without worker; `setting['jobs.heartbeat']` absent/stale — external probe alerts; on worker restart, backlog clears; **no** test asserts callback failure without worker |
| c | **DB transaction fails after** provider reports success (inject `COMMIT` failure) | Context: webhook `stkQuery` succeeded → settle tx throws → endpoint 503 → attempt row rolled back → `payment.pending` unchanged; **no** partial `reservation.confirmed`; sweeper later re-queries → settles cleanly; constraint DDL replay passes |
| d | Allocation **expires immediately before** settlement | Callback path: `promoteHoldAllocation` returns 0 → re-allocation branch → `confirmed` with fresh `reservation,occupying` rows + audit `reservation.reallocated`; **zero** confirmed reservation with zero allocations |
| e | Worker **crashes mid-reconciliation** (kill between sweep start and end) | Heartbeat absent/stale alarm fires; next run re-executes idempotently; no duplicated reminder/attempt beyond constraints; reservation locks released (session semantics); `pg_stat_activity` shows no leaked lock after restart |
| f | **Duplicate admin settlement** (double-click / two tabs) | Second settle → `409` identical error shape; no second payment row; no duplicate audit; UI disables after first |
| g | **Refund races settlement** (settle + full-refund same instant) | Reservation lock serialises; loser receives `409/400` with no writes; sum captured ≤ total; `net_capture` audited; inventory unchanged |
| h | Daraja query **inconclusive** (`9999`/`null`) | Payment remains `pending`; attempt `pending,verified=false` recorded once per query; no allocation released (guest may still pay); sweeper re-queries on cadence; **no** `failed` flip on 9999 |
| i | Callback **replay** with identical payload hours later | 200 `Accepted (already …)`; no state change; no new attempt (attempt insert blocked by DB-2 once-only); audit untouched |
| j | **Over-capture attempt** via corrupted total | P0001 from trigger (or 400 via layer-1 guard) → zero rows written; anomaly logged at `error`; payment stays `pending` |
| k | **Confirm with zero allocations** impossible | Fixture: hold expired manually; no free rooms in type → settlement yields `needs_allocation`; assertion `count(allocations kind='reservation' for R) = 0` **and** `status ≠ confirmed` |
| l | **Forged callback** from unauthenticated caller with guessed id | Webhook 200, `reply(1,'Unknown transaction')` or `stkQuery` disagreement → zero writes; reservation still `pending`; security log `webhook.forgery_attempt` |

**Gate criterion:** all twelve green in CI + one sandbox end-to-end order (create → expire → pay → assert allocation + status) passing before any production conversation.

---

## 7. Corrections to M10_PHASE_0_REMEDIATION_PLAN.md (adversarial deltas)

| # | M10 text | Verdict | Required change |
|---|---|---|---|
| D1 | DB-2 called "once-only settlement, kills replay" | **CORRECTED** | Re-title "attempt once-only (initiation scope)"; add DB-8 net-capture trigger + DB-9 desk partial unique (v1); add Layer-1 in-tx guard as explicit code requirement in every settle path |
| D2 | "Safaricom retries callbacks" / "HTTP 503 to trigger Daraja retry" | **CORRECTED** | Remove provider-retry reliance; recovery = sweeper + manual requery; 503 retained only as honest "not settled yet" signal for a future Safaricom smart retry layer — do not depend on it |
| D3 | Heartbeat "+ probe" optional | **WEAKENED→required** | External staleness probe gates Phase 0-D exit |
| D4 | `/ready` jobs component | **WEAKENED** | Advisory field only; never a restart trigger; or omit entirely |
| D5 | Comp: no decision between marker row vs no payment row | **RESOLVED (this review)** | **No payment row.** Audit carries reason/roles |
| D6 | `payment.marked` `failed` via `amount mismatch` | **CONFIRMED** | Keep fail-closed; add `logger.error` with anomaly code `payment.amount_mismatch` |
| D7 | Desk reference `DESK-${Date.now()}` | **CORRECTED** | Deterministic `DESK-<reservationId>-<seq>`; unique under concurrency by construction; DB-9 complements |
| D8 | Sweeper settle without `SELECT FOR UPDATE` | **CORRECTED** | Sweeper re-query settle path must take the reservation row lock (same as settle endpoint); interposition added to job spec |
| D9 | `needs_allocation` resolution path unspecified | **CORRECTED** | Two resolution writers only: (i) worker re-allocation sweep (bounded retry of re-alloc for `needs_allocation` reservations, e.g. every 15 min up to 24 h), and (ii) staff "Assign rooms" action in admin (Rooms page: `needs_allocation` filter; calls one transaction: allocate + flip confirmed + audit). No other path may set `confirmed` |
| D10 | `TransActions.pending` removal | **CONFIRMED** | PATCH `409 REDIRECT_SETTLEMENT` for one release cycle (ops comms), then 422 thereafter |
| D11 | Refund race acknowledged as "TOCTOU" | **CORRECTED → mandatory** | Refund takes reservation row lock + net-capture recheck in-tx (§4.3) |
| D12 | Admin-notify email template `adminAllocationNeeded` | **CONFIRMED optional** | Recommended; reuses `email_outbox` + `sendAdminNewBooking` pattern; needs owner SMTP decision (M8 §2) |
| D13 | Phase 0 does not touch security headers / monitoring | **CONFIRMED** | M9-12/25 remain Phase 2; noted so nobody assumes they're in |
| D14 | Cost estimates | **REPLACED** | Owner's live quote governs; document tolerance to free-tier limits |
| D15 | "reservation confirmed exactly once; one set of reservation allocations" | **CONFIRMED** | Strengthened by §6-a/f |

Net: **12 substantive corrections, 3 confirmations, 0 silent approvals.** The plan survives as a skeleton; it does not survive verbatim.

## 8. Schema & transaction recommendations (consolidated, additive-only)

```sql
-- DB-8 (owner approval required): net-capture guard trigger.
-- DB-9 (v1): one succeeded manual (desk) capture per reservation.
CREATE UNIQUE INDEX one_desk_succeeded_per_reservation
  ON payment ("reservationId") WHERE provider = 'manual' AND status = 'succeeded';

-- Recommended indexes (M9-21 follow-through):
CREATE INDEX payment_reservationId_status_idx ON payment ("reservationId", status);
CREATE INDEX payment_attempt_reservationId_status_idx ON payment_attempt ("reservationId", status);

-- Worker heartbeat: no schema needed (reuses setting KV; owner-approved key).
```

Transaction shapes (all settle/refund paths):

1. `tx.$transaction(async (t) => { const r = await t.$queryRaw`SELECT id FROM reservation WHERE id = $1 FOR UPDATE`; … checks …; writes …; })`
2. Sweeper settle: identical funnel (no special snowflake — one code path for all writers).
3. Refund: identical lock; net-capture recomputation inside lock.
4. Settle endpoint: identical lock; aggregate re-check inside; deterministic `providerReference`.

Migrations remain additive; rollback notes in M10 §8 remain valid; DB-8 trigger droppable instantly (`DROP TRIGGER`); DB-9 droppable at Phase 1 with partial payments.

## 9. Unresolved owner decisions (this review does not resolve)

1. DB-8 trigger approval (plus who owns SQL execution on Neon — owner console, never agent; M-Pesa stays out until authorized).
2. Worker hosting A vs C (interim bridge); binding quote from owner before Phase 0-D.
3. `adminAllocationNeeded` email template now or defer (depends on SMTP decision).
4. `/jobs/health` exposure shape (token-protected GET on API vs Vercel cron alert-on-staleness vs external probe against DB heartbeat) — external probe recommended; never open to public unauthenticated read of operational details.
5. Guest-facing copy for `needs_allocation` (call-us-to-assign wording approval).
6. Whether staff assignment UI (D9) ships in Phase 0 (recommended yes — one small Rooms-page filter + one button) or Phase 1.
7. Refund-freeze: no partial refund > balance — v1 rejects; confirm.
8. Comp settlement by receptionist vs manager+ (this review forces manager+; override owner choice documented if rejected).
9. Production Daraja credentials — owner action, unchanged, out of M10 scope.
10. Neon PITR verification evidence — owner supplies; unchanged.
11. Idempotency-key requirement on `POST /admin/…/settle` (`Idempotency-Key` header same pattern as public reservations) — **recommend adopt**; confirm.
12. Where the comp/abuse report lands (Financials vs Reports — admin UI) — cosmetic, decide at implementation.

## 10. Verdict

**Phase 0 architecture (verify-then-settle, one-funnel confirmation, needs_allocation honesty, worker A) is sound** and remains recommended. **Implementation must not begin from M10 unreviewed** — D1 through D15 are merge-blockers for code review; §1 forces two real schema additions and one trigger decision; §6 is the acceptance gate for the release; §9 is yours, not ours. If any single thing is skipped, the silent-corruption class (double settlement, ghost confirmed, zero-allocation confirmed) re-opens exactly the failure M9 catalogued.

**No M10 implementation is authorized by this document. Nothing here is executed against any environment. Commit, push, database access, deployments: all prohibited unless separately instructed.**
