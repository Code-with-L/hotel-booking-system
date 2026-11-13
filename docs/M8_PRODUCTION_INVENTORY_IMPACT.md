# M8 — Production inventory impact (read-only investigation)

**Status: investigated read-only. No production write has been made. Owner decision required before any correction.**

## 1. Read-only query methodology
All production queries were `SELECT`-only against The Stillhouse Neon database (AWS eu-central-1, pooled endpoint) using the connection string present in this session's context. Output was written to `scripts/_prod_probe.mjs` and `scripts/_prod_probe2.mjs` for traceability. No `INSERT`/`UPDATE`/`DELETE`/DDL was issued. The local `.env` points at Docker (`localhost:5432`) and was never used as evidence for production state. Production writes were explicitly NOT made.

## 2. Exact four room records
| room_id (bigint) | number | floor  | status | roomTypeId |
|---|---|---|---|---|
| 1 | C01 | Garden | active | 1 (stone-cottage) |
| 2 | C02 | Garden | active | 1 (stone-cottage) |
| 3 | C03 | Garden | active | 1 (stone-cottage) |
| 4 | C04 | Garden | active | 1 (stone-cottage) |

rate rows: flexible ×1.0 (id 1, green 2,210,000 / peak 3,060,000), advance ×0.88 (id 2, green 1,940,000 / peak 2,700,000 scheduled). rate plans present.

## 3. Reservation and allocation references
stone-cottage reservations by status: **confirmed 9, checked_out 3, cancelled 1** (13 total).

**9 future-or-current reservation allocations (kind='reservation', state='occupying'):**
source_id → room, dates:
- 8 → C01, 2026-11-24→28
- 2 → C01, 2026-12-06→10
- 9 → C01, 2026-12-12→14
- 32 → C01, 2026-12-22→23
- 29 → C01, 2026-12-24→25
- 28 → C01, 2027-01-02→04
- 25 → C01, 2027-01-12→15
- 3 → C01, 2027-01-15→16
- 5 → C02, 2026-12-07→10
Reservation/id linkage confirmed for all: C01 (8) + C02 (1) = 9 future occupying allocations.
C03 and C04 have **zero** reservation/allocation/block records.

## 4. FK dependencies
- `room."roomTypeId"` → `room_type.id` (NO ACTION default)
- `reservation."roomTypeId"` → `room_type.id`
- `reservation_room."roomId"` → `room.id`
- `room_allocation."room_id"` → `room.id`
- `inventory_block."roomId"`, `inventory_block."roomTypeId"` → `room.id` / `room_type.id`
- `rate_card."roomTypeId"`, `rate_plan."roomTypeId"` → `room_type.id`

No cascades are defined (`No Action`), so deleting the type would fail loudly, not silently corrupt history.

## 5. Soft-retirement support
The schema has `RoomStatus` = `{ active, out_of_service }` and every app read that surfaces availability or sellable inventory filters `room.status = 'active'`
(e.g. `availabilityRouter`: `WHERE r.status = 'active'`; selling count: `sellable` excludes `out_of_service`). Admin UI (rooms/routes.js) explicitly renders out-of-service and enforces the hard-guard rule: a room may not be transitioned to `out_of_service` while overlapping **active** reservations exist.

**However**, the admin hard-guard blocks the official toggle path for C01/C02 specifically because future `occupying` overlap exists (9 future reservations). The guard was designed to prevent silent inventory loss; it would (correctly) refuse out-of-service on rooms hosting live future reservations. C03/C04 have no reservations, so they could be out-of-serviced today without violating the guard — but the same cannot be done for C01/C02 without cancelling/moving those reservations, which we may not fabricate or delete.

## 6. Proposed reversible migration (only if owner explicitly approves)
**Option A (recommended, fully reversible, no data loss):**
1. `UPDATE room SET status='out_of_service', "updatedAt"=now() WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug='stone-cottage');`
   Set C01–C04 out_of_service.
2. `UPDATE room_type SET "unitCount" = 0 WHERE slug = 'stone-cottage';` (optional denormalisation; app already reads status).
3. Re-verify: `room-types` does not offer Stone Cottage to guests; availability excludes all four; sellable=28; admin inventory 28.
   Reversal: set the four rows back to `status='active'` and `unitCount=4`.
   Guard C01/C02 by moving/cancelling their future reservations first (owner decision; not authorised in this milestone) — until those depart, soft-retirement of C01/C02 is unethical (would silently hide an occupied room a guest already holds a booking for).

**Option B (not recommended in this milestone):** hard-delete C03/C04 only (no reservations) + leave C01/C02. Leaves mixed inventory, confusing.

**Option C (destructive, forbidden without explicit owner-authored instruction):** delete all stone-cottage rows incl. reservations — requires cascades and destroys financial history. Not acceptable.

## 7. Rollback procedure
Option A rollback: set the same four rows to `active` and `unitCount=4`. Property-wide snapshot before the action and row-count check after (28 vs 32) protect data integrity. No finance, no guest history is rewritten — `reservation`, `payment`, `payment_attempt`, `email_outbox`, `tax_invoice`, `room_allocation` are untouched.

## 8. Backup and verification requirements
- Before: `pg_dump` (custom format) verified by row counts (28 vs 32 rooms, current 34 reservations — all read-only counts).
- After: 4 rooms out_of_service, `reservation` count unchanged, allocation ledger unchanged, `availability` route shows no Stone Cottage, admin inventory sellable = 28, finance totals unchanged.
- 24h monitoring window on sandbox STK and error rate (Neon `/ready` + logs) — no code change required (status is a DB column, no migration).
- Keep archived seed (`seed.js` pre-M8) so local dev matches the retirement decision once approved.

## 9. Unresolved risks
- **The 9 future stone-cottage bookings** are the reason full soft-retirement cannot be done now: they belong to unknown future guests (or demo fixtures). Cancelling is destructive business/customer impact; the milestones mandate honesty (they should be honoured as booked). Their check-out dates run to 2027-01-16.
- **`admin.settings.hotel.rooms = 32`** is stored in the live DB; admin UI reads it. Should be 28 after retirement (1-row update in the same transaction).
- **Guest-facing `web` FE** after M8 only renders the three approved types; production API still serves the retired type. If untouched, the app loses nothing (it now requires the three types only), but retirement cleanliness requires the Option A decision above (and the Type row to remain for history).
- **Rate cards** for stone-cottage are `active`/`scheduled`; if retired in DB, guests will no longer be able to book them (correct, satisfies owner's 28-room requirement).
- **No TLS/enforcement note:** the Neon pooler uses `sslmode=require` as a libpq-compatible alias for `verify-full` (deprecation warning in v9). No action needed before pg v9 upgrade; flag for driver upgrade work.
- **Migration history gap**: the property has no `hidden` flag; soft-retirement piggy-backs `out_of_service`, which loses "retired by owner decision" vs "temporarily unavailable" distinction. Adding a `retired` flag is out of scope here.
- **Live data contains 3 cancelled** and 3 checked-out rows referencing the type — all preserved in option A/B.

**Bottom line:** production shows 4 extra rooms (Stone Cottage ×4) with 13 reservations, 9 of which are in the future. A safe, reversible soft-retirement (out_of_service + unitCount 0) is conceptually supported by app code but blocked today by the active guard on C01/C02. Nothing has been changed; the decision is the owner's.
