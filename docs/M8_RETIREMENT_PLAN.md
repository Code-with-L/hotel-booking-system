# M8 — Phased retirement plan (Option A) — NOT EXECUTED

**Owner approval required in writing before this plan runs. Nothing in this document is authorised by M8.**

## 1. Pre-conditions — ALL must hold
1. M8 milestone accepted by owner and deployed (or verified against a staging clone).
2. Production read-only confirmation logged today: stone-cottage has 13 reservations (9 confirmed, 3 checked_out, 1 cancelled), 9 future, 4 with zero future allocations (C03, C04); C01 (8 future) and C02 (1 future) are explicitly excluded.
3. Owner signs off two phase boundaries in `docs/DECISIONS.md` (a new D-075 or later).
4. Verified point-in-time backup is restorable (PITR for RPO-24h on The Stillhouse project).
5. Monitoring/paging is configured on the deployment, or owner accepts a defined monitoring gap.
6. Midnight-UTC maintenance window agreed; no new bookings created during the window (or the window follows final checkout of C01/C02).

## 2. Phase A — Retire C03 / C04 (zero reservations today)
Per-period definition: a room is "retireable" if it has **zero** `reservation` rows (all statuses incl. cancelled) pointing at it, **zero** occupying allocations in any future window, and **zero** occupying reservation_room links for future dates.

C03, C04 meet this bar today (verified: future_occupying = 0 for both, reservation_room rows = 0).

Migration steps (single transaction, reversible — ONLY the two room rows change):
1. `UPDATE "room" SET status='out_of_service', notes='Retired — owner decision 2026-11-13 (M8/Phase A)', "updatedAt"=now() WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug='stone-cottage') AND number IN ('C03','C04');` — expect 2 rows.
2. Verification queries (all read-only): stone-cottage rooms show C01/C02 active and C03/C04 out_of_service; reservation count for the type unchanged; sellable total = **27** (29 active today, minus 2).
3. Rollback: `UPDATE "room" SET status='active', notes=NULL, "updatedAt"=now() WHERE number IN ('C03','C04');` — restores the exact prior state (notes were NULL).

**Do NOT touch in Phase A:** `room_type.unitCount` (informational, consumed nowhere in code; consumed nowhere in web app — verified) and `setting`/`admin.settings.hotel.rooms` (an editable "Total rooms" label saved via the admin Settings form only; it has no live coupling to the `room` table and setting 28 today would misrepresent a database holding 29 active rooms).

**Phase A leaves sellable = 27, NOT the approved 28.** The path to an honest 28 requires, in order: Phase A, Phase B (C01/C02 after final reservation 2027-01-16), and restoration of the three `out_of_service` maintenance rooms (2 garden, 1 valley — G04 hvac, G12 bathroom, V07 terrace) by the owner. Only then does any config/label claiming 28 match reality.

## 3. Phase B — Retire C01 / C02 (only after final future reservation checks out)
Trigger condition: the calendar (`room_allocation` where `state='occupying' AND kind='reservation'`) for C01+C02 has no future occupied windows, i.e. the latest future reservation for these rooms has status `checked_out`.

Verified today's terminal case: latest future C01 allocation is 2027-01-15 → 2027-01-16 (source_id 3) — that is currently the binding end (~2027-01-16).

Migration steps (single transaction, minimal — room status change only):
1. `UPDATE "room" SET status='out_of_service', notes='Retired — owner decision (M8/Phase B)', "updatedAt"=now() WHERE "roomTypeId" = (SELECT id FROM room_type WHERE slug='stone-cottage');` — expect 2 rows (C01/C02).
2. `UPDATE room_type SET "unitCount"=0 WHERE slug='stone-cottage';` — now honest: the type exists historically with zero sellable units. (Optional but recommended in this phase only, because the type is fully retired — not partially.)
3. `setting`/`admin.settings.hotel.rooms`: **still NOT updated automatically.** The honest moment to declare 28 in that Settings label is when `room.status='active'` count equals 28 — i.e. after the three maintenance rooms return to service. Owner signs off that change explicitly; it is not part of the Phase B SQL.
4. Verification queries: sellable per type (garden 12 active / 14, valley 8 / 9, signature 5 / 5, stone-cottage 0 / 4); `room` active total = **25** before maintenance rooms are restored, **28** after; `/room-types` shows 4 rows (historical) but guest availability returns 3 types; reservations for garden/valley/signature unaffected; ledger unchanged.
5. Rollback: `UPDATE "room" SET status='active', notes=NULL, "updatedAt"=now() WHERE number IN ('C01','C02');` `UPDATE room_type SET "unitCount"=4 WHERE slug='stone-cottage';` — full data preservation; zero loss at any phase.

Reversibility: complete; no FK or data is deleted at any stage.

## 4. Verification queries (Phase A and B)
- `SELECT status, count(*) FROM "room" GROUP BY 1;` — expect stone-cottage C03/C04 out_of_service after Phase A; C01/C02 active until Phase B.
- `SELECT slug, "unitCount" FROM room_type;` — stone-cottage 4 during Phase A; 0 only after Phase B (informational field).
- `SELECT count(*) FROM "room" WHERE status='active';` — **29 today, 27 after Phase A, 25 after Phase B, 28 only after the three maintenance rooms return to service.** Do not declare 28 before all of these hold.
- `SELECT value FROM setting WHERE key='admin.settings';` — unchanged (32) until the owner explicitly sets the Settings label when 28 active rooms actually exist.
- `/availability?checkIn=2027-02-01&checkOut=2027-02-04&adults=2...` — 3 types, no stone-cottage, both after Phase A and Phase B.
- `/admin/rooms` — shows all `room` rows honestly; admin dashboard sellable (computed from `room.status`) drops 29→27→25 automatically.

Note: the admin Dashboard's "sellable" figure is computed live from `room.status ≠ 'out_of_service'` (see `apps/api/src/modules/admin/routes.js:41`), so no settings change is required for it to stay honest.

## 5. Risks & failure modes
- **Booking honesty:** retiring while a Stone Cottage future reservation exists violates the M-Pesa/guest confirmation contract — Phase B must never run before the final reservation converts checked_out.
- **Availability empty-state:** if a date range only had Stone Cottage inventory, availability correctly becomes empty; operator must have a runbook entry for "fully booked / retired inventory".
- **Admin report mismatch:** `admin.settings.hotel.rooms` (admin Settings "Total rooms" label, stored in `setting`, audit-logged on save) has no live coupling to the `room` table — the Dashboard's sellable count is computed live from `room.status`. Leaving it at 32 is a documented interim state; changing it to 28 before 28 rooms are actually active would be a dishonest label and is owner-gated, not automatic.
- **Rate cards:** stone-cottage rate_card rows remain in the database — an `active` rate card implies bookability; operators should mark those `inactive` in Phase B.
- **React-availability drift:** until Phase B completes, the FE correctly never shows Stone Cottage (M8 catalogue); make sure the operator understands that a "fully booked" message is misleading if they check manually before retirement.
- **Cache:** Neon pooled connections + Vercel serve the DB query directly on each hop; no stale cache aside from the vercel-edge. Insufficient to cause this risk at this traffic level.

## 6. Explicit owner authorisation
Phase A may only proceed after owner writes D-075 (or later) explicitly approving this document. Phase B may only proceed after Phase A has been verified stable in production for a defined observation window (recommend 14 days unless the owner directs otherwise) and the trigger condition in §3 holds.
