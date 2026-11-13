# M8 — Phase A migration preflight — C03 / C04 soft-retirement

**Status: PREPARED ONLY. Not executed. Owner sign-off required before any production write.**

## Owner's words
> "Phase A C03/C04 retirement: PREFLIGHT AUTHORIZED, EXECUTION NOT AUTHORIZED."

## Evidence from production (read-only, 2026-11-13, Neon eu-central-1)

| Group | active | out_of_service | total |
|---|---|---|---|
| garden-room | 12 | 2 | 14 |
| signature-retreat | 5 | 0 | 5 |
| valley-suite | 8 | 1 | 9 |
| **stone-cottage** | 4 | 0 | 4 |
| **TOTAL** | **29** | **3** | **32** |

`admin.settings.hotel.rooms = 32` (stored in `setting`). `room_type.unitCount` rows: garden 14, valley 9, signature 5, stone-cottage 4.

**Semantic correction:** `admin.settings.hotel.rooms` is labelled `rooms` — but it has always been interpreted as total units, not sellable. Sellable (`room.status = 'active'`) is currently **29**, not 32 (3 rooms are `out_of_service`).

## Approid inventory alignment required to reach 28 (not in Phase A scope)

To honour "28 rooms" the full path requires:
1. Retire all four Stone Cottage rooms (Phase A retires the 2 with no reservations; Phase B retires the 2 still booked after their last reservations check out ≈ 2027-01-16).
2. Re-activate the 3 `out_of_service` rooms (2 garden + 1 valley), per their original maintenance reasons (G04 HVAC, G12 bathroom fixture, V07 terrace repainting) once cleared.

This yields 28 active rooms. Until both (1) complete for C01/C02 and (2) complete, the honest sellable count stays 27/28/29, never exactly 28 without owner action.

## Objects to be touched
- `room` rows: C03 (id 3), C04 (id 4) → `status='out_of_service'`; `notes` unchanged; `updatedAt` set to now().
- `setting.admin.settings.value.hotel.rooms` → **NOT TOUCHED in Phase A** (see below).
- `room_type.unitCount` (stone-cottage) → **NOT TOUCHED in Phase A** (reduces only when Phase B completes for C01/C02).

## `admin.settings.hotel.rooms` decision — DO NOT SET 28

Do NOT set this to 28 during Phase A:
- `hotel.rooms` reads as the hotel's declared capacity. Setting it to 28 now would over-report capacity by 3 because three approved units are currently `out_of_service`.
- Also, 28 only becomes correct after C01/C02 clear — not yet.
**Owner decision required:** leave `32` during Phase A/B (honest in intent: total units exist), or set to `27` (active only), or set to `30` (after Phase A only). M8 does not touch this field.

## Exact pre-migration checks (ALL must pass)

```sql
-- 1. C03/C04 exist and are active with no notes
SELECT number, status, notes FROM "room" WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug='stone-cottage') ORDER BY number;
-- expect: C01/C02/C03/C04 status='active', notes='' / NULL

-- 2. C03/C04 have NO reservation_room links (any status, including cancelled)
SELECT count(*) FROM reservation_room rr JOIN "room" r ON r.id = rr."roomId" WHERE r.number IN ('C03','C04');
-- expect: 0

-- 3. C03/C04 have NO allocations at all (hold/reservation/block)
SELECT count(*) FROM room_allocation ra JOIN "room" r ON r.id = ra.room_id WHERE r.number IN ('C03','C04');
-- expect: 0

-- 4. C03/C04 have NO inventory blocks
SELECT count(*) FROM inventory_block ib JOIN "room" r ON r.id = ib."roomId" WHERE r.number IN ('C03','C04');
-- expect: 0

-- 5. C03/C04 have NO referenced reservations via reservation.roomTypeId + assignment
SELECT count(*) FROM reservation WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug='stone-cottage');
-- NOTE: this is the stone-cottage type count (13, by status); direct row-level references to C03/C04 will be 0 by (2) above.

-- 6. RoomStatus enum values (confirmed: active, out_of_service)
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname='RoomStatus' ORDER BY e.enumsortorder;
-- expect: active, out_of_service

-- 7. FK constraints exist and are NO ACTION (no cascading deletes)
SELECT con.conname, conrelid::regclass AS from_table, confrelid::regclass AS to_table
  FROM pg_constraint con
 WHERE con.confrelid IN ('room'::regclass, 'room_type'::regclass) AND con.contype = 'f'
 ORDER BY con.conname;

-- 8. Availability excludes out_of_service rooms (app code path, not DB check)
-- Confirmed by inspection of apps/api/src/modules/rooms/routes.js: WHERE r.status = 'active'
```

## Exact reversible SQL (Phase A only, DO NOT EXECUTE TILL SIGNED)

```sql
BEGIN;

UPDATE "room"
   SET status = 'out_of_service',
       notes = 'Retired — owner decision, M8 Option A soft-retirement (2026-11-13). Reversible.',
       "updatedAt" = NOW()
 WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug = 'stone-cottage')
   AND number IN ('C03', 'C04');
-- expect: 2 rows updated

COMMIT;
```

## Post-migration verification SELECTs

```sql
-- Rooms by status
SELECT number, status, notes FROM "room" WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug='stone-cottage') ORDER BY number;
-- expect: C01, C02 active; C03, C04 out_of_service

-- Type still exists with full history intact; no reservations cancelled or modified
SELECT rt.slug, count(res.id) FROM room_type rt LEFT JOIN reservation res ON res."roomTypeId" = rt.id WHERE rt.slug='stone-cottage' GROUP BY rt.slug;
-- expect: 13

-- Sellable cap now
SELECT count(*) AS sellable FROM "room" WHERE status = 'active';
-- expect: 27 (after retirement), not 28 yet

-- Availability API after Phase A: the /availability response still includes a stone-cottage entry (the DB still has 2 active units, C01/C02), so this is an application-level check, not a DB absence. Guest-facing surfaces filter it out:
-- curl "http://localhost:4000/api/v1/availability?checkIn=2027-01-20&checkOut=2027-01-22&adults=2&children=0&rooms=1" | jq '.results[] | select(.roomTypeSlug=="stone-cottage")'
-- expect: stone-cottage may still be present in raw JSON; it is dropped by apps/web availabilityService (unknown slugs filtered against the 28-room catalogue). Stone-cottage vanishes from /availability only after Phase B.
```

## Rollback SQL

```sql
BEGIN;
UPDATE "room"
   SET status = 'active',
       notes = NULL,
       "updatedAt" = NOW()
 WHERE "roomTypeId" IN (SELECT id FROM room_type WHERE slug='stone-cottage')
   AND number IN ('C03', 'C04');
-- expect: 2 rows reverted
COMMIT;
```

## Backup requirements
- Before migration: Neon PITR snapshot or `pg_dump -Fc` of `neondb`, verified by row counts (32 rows in `room`).
- After migration: verify `room` count = 32, `status` per type distribution, "reservation count" = 13 for stone-cottage, `room_allocation` row count unchanged.

## Risks and open questions
1. **Phase A leaves 27 sellable**, not the approved 28. The 3 maintenance rooms must be returned to service (and possibly amended maintenance status) to reach 28. Owner decision required (G04, G12, V07).
2. `admin.settings.hotel.rooms` will read 32 while sellable is 27 — **owner decision required** whether to change it now (to 27), after Phase B (to 28), or after maintenance clears (to 28). Recommended: set 28 only when Phase B completes AND verification confirms 28 active rooms.
3. `room_type.unitCount` (stone-cottage = 4) remains until Phase B completes. This is fine — it's informational; availability counts rows, not unitCount.
4. No holds, allocations, or blocks on C03/C04 verified today; re-check immediately before migration runs.
5. The 9 future stone-cottage reservations must not be modified or deleted; Phase A does not touch C01/C02.
6. No data migration beyond this one is in M8's scope. Anything else counts as a production intervention and needs explicit instruction.
