# Database Design — The Stillhouse

**Status:** Approved design direction at M0 (2026-11-11). Not yet implemented — no schema, migrations or database exist. Implementation happens in M3 under an approved change to this document.

PostgreSQL 16+. Money as **integer minor units** (KES cents) + `currency`. Dates as `date` columns; stay ranges as half-open `daterange [check_in, check_out)` so a room is free on checkout day.

---

## 1. Entities

### Property & catalogue
- **`hotel`** (effectively a singleton row): name, legal name, address, phone, email, coordinates, policies (cancellation, check-in/out times, age policy), currency (`KES`), timezone (`Africa/Nairobi`), settings JSONB.
- **`room_type`**: id, slug (`garden-room`, `valley-suite`, `signature-retreat`), name, summary, description, size_sqm, max_adults, max_children, bed, view, amenities[], image set reference.
- **`room`**: id, number (e.g. `101`…), room_type_id → room_type, floor, status (`active|out_of_service`), notes. **28 physical rooms**, protected by `unique(room_type_id, number)`.
- **`rate_plan`**: id, room_type_id, name (`Standard`, `Non-refundable`, `Promotional`), cancellation_policy (JSONB: window + penalty), meal_basis, refundable bool, effective date range (`daterange`), status (`active|inactive`).
- **`rate`**: id, rate_plan_id, date (`date`), or date-range via `valid_from/valid_to`, nightly price minor units, currency. (Seasonal/date-override pricing; nightly price resolution order: specific-date rate → date-range rate → plan default.)

### People & access
- **`guest`**: id, first_name, last_name, email (citext), phone (E.164), country, requests, marketing_consent bool, created_at. Guests may exist without a login (walk-in/phone bookings).
- **`user`**: id, guest_id nullable, email (citext unique), password_hash (bcrypt), name, status (`active|disabled`), last_login_at. Staff and guests share this table.
- **`role`**: id, key (`guest|receptionist|manager|admin`).
- **`user_role`**: user_id, role_id, PK(user_id, role_id). RBAC source of truth.

### Reservations & payments
- **`reservation`**: id, reference (human-friendly unique, e.g. `STL-2026-000123`), guest_id → guest, status (`pending|confirmed|checked_in|checked_out|cancelled|expired`), check_in, check_out, adults, children, room_type_id, rate_plan_id, price snapshot (nightly, nights, subtotal, service_charge, tourism_levy, vat, total — all minor units; currency), special_requests, source (`web|admin|phone`), idempotency_key (unique), created_at, cancelled_at, cancellation_reason, cancel_fee minor units.
- **`reservation_room`**: id, reservation_id → reservation, room_id → room. A reservation for N rooms of one type has N rows.
- **`payment`**: id, reservation_id, provider (`mpesa|card|cash|other`), provider_reference, amount minor units, currency, status (`pending|succeeded|failed|refunded|partially_refunded`), captured_at, failure_reason.
- **`payment_attempt`**: id, reservation_id, provider, provider_reference, amount, status, raw_payload JSONB, created_at. Every callback is stored — including failures — before any state change.
- **`audit_log`**: id, actor_user_id nullable, action, entity, entity_id, before JSONB, after JSONB, ip, created_at. **Append-only** (no UPDATE/DELETE grants).

### The conflict-relevant pair (see §3)
- **`inventory_block`**: id, room_id → room, period `daterange`, kind (`maintenance|renovation|out_of_service|hold`? — **no**, holds are not blocks; see allocation model below), reason, created_by, created_at.
- **`room_allocation`**: the single occupancy ledger — **this is the mechanism that enforces non-overlap across reservations, holds and blocks.**

---

## 2. Money, taxes, snapshots

All amounts are integer minor units (`bigint`) with `currency` (`KES`). Sub-units: 100 cents = 1 KES.
Reservations store a **price snapshot** at creation time (nightly × nights, service charge, tourism levy, VAT, total). Repricing never rewrites history; changes create a new quote/reservation or an audit-logged adjustment.

## 3. Overlap prevention — allocation ledger + exclusion constraint (required design)

**Why not a constraint on `reservation_room` alone.** An exclusion constraint on `reservation_room(room_id, daterange)` prevents *reservation vs reservation* overlap, but it lives in one table. A `inventory_block` (maintenance) or a short-lived **hold** is a different row in a different lifecycle with no way for `reservation_room`'s constraint to see it. Two separate per-table constraints cannot coordinate: nothing stops a transaction inserting a maintenance block over a confirmed reservation, or two concurrent bookings both passing disjoint application-side checks. Application-side "check then insert" is a textbook race.

**Design: one allocation table that everything booking-relevant writes to.**

```sql
CREATE TABLE room_allocation (
  id           bigint generated always as identity primary key,
  room_id      bigint NOT NULL REFERENCES room(id),
  during       daterange NOT NULL,              -- [check_in, check_out)
  kind         text NOT NULL CHECK (kind IN ('reservation','hold','block')),
  state        text NOT NULL CHECK (state IN ('occupying','released','expired')) DEFAULT 'occupying',
  source_type  text NOT NULL,                   -- 'reservation' | 'inventory_block' | 'hold'
  source_id    bigint NOT NULL,                 -- reservation.id / inventory_block.id / hold id
  expires_at   timestamptz,                     -- set for kind='hold' only
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Postgres integrity enforces exactly one rule: no two occupying
-- allocations for the same room may overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE room_allocation
  ADD CONSTRAINT room_allocation_no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&)
  WHERE (state = 'occupying');
```

Notes that make this work correctly:

- **Half-open ranges** (`'[2026-12-24,2026-12-28)'::daterange`) let consecutive guests share checkout/check-in day.
- The partial predicate `state = 'occupying'` is on a plain column — valid for exclusion constraints — so releasing/expiring a row instantly takes it out of scope without deleting history.
- **Confirmed reservations**, **active holds**, and **maintenance/inventory blocks** all occupy rows in this table. Intra-table exclusion constraint ⇒ cross-type conflicts are physically impossible. A block cannot be placed over a confirmed reservation and vice-versa.
- **`reservation_room` remains as the relational join** (reservation ↔ rooms, for queries/admin/reports) but is not the guard; `room_allocation` is.

### Transaction boundaries

**Create reservation (hold) — `POST /api/v1/reservations`:**
```
BEGIN;                                   -- default READ COMMITTED is sufficient:
                                           the exclusion constraint is the arbiter
1. Recompute quote server-side from rate_plan/rate (+ taxes) — never trust the client's total.
2. For each requested room of the type: pick candidate room (not out_of_service).
   INSERT INTO room_allocation(room_id, during, kind, state, source_type, source_id, expires_at)
   VALUES (..., '[ci,co)', 'hold'|'reservation', 'occupying', 'reservation', :id, now() + interval '15 minutes');
   -- exclusion violation (SQLSTATE 23P01) ⇒ this room is taken.
   -- Try the next candidate room; if none free ⇒ ROLLBACK; return 409 ROOM_UNAVAILABLE.
3. INSERT reservation (status 'pending', idempotency_key unique) + reservation_room rows.
COMMIT;
```
Everything in one transaction: either the allocation + reservation + join rows all exist, or none do.

**Payment success webhook → confirm:**
```
BEGIN;
1. Verify provider signature BEFORE any DB write (see SECURITY.md). Insert payment_attempt (audit raw payload).
2. Locate reservation by provider reference / idempotency key. If already confirmed ⇒ COMMIT no-op (idempotent).
3. UPDATE room_allocation SET kind='reservation', expires_at=NULL WHERE source_id=:id AND kind='hold';
   (Allocation row already occupying ⇒ no gap in which someone else could grab the room.)
4. UPDATE reservation SET status='confirmed'; UPDATE payment SET status='succeeded'.
5. INSERT audit_log.
COMMIT;
```

**Payment failure / cancellation / hold expiry:**
```
BEGIN;
UPDATE room_allocation SET state='released'|'expired' WHERE source_id=:id;
UPDATE reservation SET status='cancelled'|'expired' | (payment stays failed);
INSERT audit_log.
COMMIT;
```

**Hold expiry and cleanup (belt and braces):**
- A periodic sweeper (cron or `pg_cron`, every 60s) does:
  `UPDATE room_allocation SET state='expired' WHERE kind='hold' AND state='occupying' AND expires_at < now();`
  `UPDATE reservation SET status='expired' WHERE status='pending' AND (SELECT expires_at FROM room_allocation ...) < now();`
- Between expiry and the next sweep, expired holds still occupy — this is **safe** (conservative): availability queries always filter `state='occupying' AND (expires_at IS NULL OR expires_at > now())`, so a lapsed hold is invisible to new bookers immediately even if the sweep hasn't run.
- `now()` cannot appear in the constraint predicate, so the exclusion constraint alone is not time-aware; correctness comes from sweeper + always-filtering reads + the constraint as the ultimate backstop.

### Simultaneous booking requests
Two guests, same room, same nights, same millisecond:
1. Both transactions pick room 103.
2. Both attempt the `INSERT` into `room_allocation`.
3. **One succeeds; the other gets SQLSTATE 23P01** (`room_allocation_no_overlap`). The loser's transaction retries with the next candidate room (same type). If the type has no free unit, it returns `409 ROOM_UNAVAILABLE`.
4. No locks are held longer than the transaction; there is no deadlock-prone two-table lock ordering because the arbitration point is a single row insert.

Why not SERIALIZABLE everywhere? The exclusion constraint gives the required invariant with far less abort/retry churn. SERIALIZABLE remains an option for admin bulk operations (rate changes over date ranges) where we want predicate-level safety.

### Maintenance vs reservations
`inventory_block` rows also project an allocation row (`kind='block'`, `source_type='inventory_block'`). Placing a maintenance block therefore **fails fast** (23P01) if the room has a confirmed/held overlapping allocation — the admin UI surfaces "room occupied for those dates" instead of silently corrupting the calendar. Removing the block releases its allocation in the same transaction.

## 4. Keys, indexes, integrity

- PKs: `bigint generated always as identity` everywhere; human references (`reservation.reference`) separate and unique.
- Unique: `room(room_type_id, number)`; `reservation.reference`; `reservation.idempotency_key`; `user.email`; `rate(rate_plan_id, valid_from, valid_to)` (no duplicate rate rows).
- Indexes: `room_allocation(room_id, during)` (GiST comes with the constraint); `reservation(status, check_in)`; `reservation(guest_id)`; `payment(reservation_id)`; `payment_attempt(provider_reference)`; `audit_log(entity, entity_id)`; `rate_plan(room_type_id)`; GiST on any `daterange` queried directly.
- FK actions: `reservation → reservation_room` cascade; **no cascade on `user` deletion** (audit integrity) — users are disabled, never hard-deleted.
- Checks: `check_out > check_in`; `adults >= 1`; `rooms >= 1`; non-negative amounts; `during` not empty.

## 5. Explicit non-goals / pending items

- Tax computation rules are **not final** — see `TAX_AND_CHARGES.md`; the final approach requires owner approval before M3/M4 implementation.
- Rates/availability SLA, overbooking policy (0 — we never overbook), channel sync — out of scope.
- Hold TTL = 15 minutes (configurable). Sweep cadence = 60s. Both tunable without schema change.
