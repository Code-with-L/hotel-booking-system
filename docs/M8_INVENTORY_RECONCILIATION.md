# M8 — Inventory reconciliation (32 → 28)

**Status: catalog corrected in repo; production data requires explicit owner action.**

## What happened
- Owner-approved property inventory (PROJECT_BRIEF §3, DECISIONS D-002, MOCK_DATA) is **28 rooms, three types**: Garden Room ×14, Valley Suite ×9, Signature Retreat ×5.
- On 2026-11-13 (commit `6a8a5f8`, "guest experience: Google OAuth sign-in, Stone Cottage, rooms overlay cards..."), a **fourth** type — **The Stone Cottage ×4** — was added without a decision record, taking the catalog to 4 types / 32 rooms.
- 32 propagated to: frontend catalogue (`apps/web/src/data/rooms.js`), seed (`prisma/seed.js`), guest copy (Home / Rooms / ClosingCta / settings), admin expectations, and the live Neon seed. No DECISIONS entry was written, and no availability or pricing rationale accompanied the new type.
- **The 32 was never an approved inventory**, it was a feature-sprint slip.

## What M8 changed (repo, now)
- `apps/web/src/data/rooms.js`: Stone Cottage entry removed (3 types); unit counts unchanged for the approved types.
- `prisma/seed.js`: Stone Cottage ROOM_TYPES entry removed; `admin.settings.hotel.rooms` = 28.
- Guest copy: Home, Rooms, ClosingCta read 28 rooms / three expressions.
- `apps/api/tests/auth.test.js`: rooms list expectation 32 → 28.
- `apps/api/tests/inventory.test.js` (new): guards catalog sum = 28, guards seed against Stone Cottage re-introduction, guards `admin.settings` = 28.
- Screenshot-grade copy everywhere guest-facing now says 28 / three expressions.

## What remains (explicit owner action only)
The live Neon database (`Stillhouse` project) contains 32 room rows (28 approved + 4 Stone Cottage: `C01`–`C04`) and any reservations referencing the Stone Cottage room type are legal fixture data. M8 does **not** delete them — deleting `reservation` rows would break foreign keys and financial history. A safe production correction, for the owner to approve, is a maintenance script executed once with a verified snapshot:

1. Snapshot/backup the database (PITR or `pg_dump`), verified by row counts.
2. Options, in increasing destructiveness:
   a. **Soft-remove (recommended):** set all `room` rows of type `stone-cottage` to `status = 'out_of_service'` and set the type's `unitCount` to 0 (or a new `hidden` flag if added). Preserves reservation history; inventory reads exclude `out_of_service` by contract already. Finance/analytics unaffected.
   b. **Hard-remove (only if zero reservations reference the type):** delete `reservation_room`/`allocation` rows tied to the type (only after verifying none exist), then delete the type and its `room` rows. Requires reconciling any live demo reservations first.
3. Re-verify: `GET /api/v1/rooms` 28 · availability counts · Compose admin view 28 · sandbox STK unaffected.

## Verification in this milestone
- `apps/api` suite green (see run log in M8 report).
- Regression guard prevents silent re-introduction (`inventory.test.js`).
- No production database was modified by this milestone.

## Reconciliation principle
Approved arithmetic wins over implemented arithmetic when they conflict, and over anything performed silently by a feature sprint. The inventory is therefore 28/3, hard-coded where needed, tested where possible, and documented where both would bite.
