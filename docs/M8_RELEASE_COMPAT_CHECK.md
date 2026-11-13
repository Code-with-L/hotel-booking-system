# M8 — Release compatibility check (read-only)

**Question answered:** can M8 ship without changing production data (today still 32-room)?

## Short answer
**Yes — Option A is safe.** M8's guest-facing catalogue is now 28 rooms (garden/valley/signature). Every code path that consumes the availability API either graceful-degrades (unknown slugs filtered) or is server-driven (admin, finance, settings) and unaffected by the 4 extra rows. No crash paths introduced.

**No new design is required. No production write is made.**

## Compatibility surfaces (evidence)

| Surface | Source / file | Behaviour with 32-room prod | Verdict |
|---|---|---|---|
| Guest availability page | `services/availabilityService.js` filters `bySlug` before building results | Stone Cottage simply never appears; page renders 3 types normally | ✓ Safe |
| Room detail route `/rooms/stone-cottage` | `pages/RoomDetails.jsx` renders `<NotFound/>` when `getRoom()` returns undefined | 404 — bookable nowhere, no crash | ✓ Safe |
| Guest booking funnel | pages consume `selection` (slug from catalogue) | Cannot ever select stone-cottage | ✓ Safe |
| Guest confirmation | `getRoom(selection.roomSlug)` — selection is always a 28-catalogue slug | Returns valid room | ✓ Safe |
| Guest account — list reservations | `AccountReservations` reads server rows; roomName comes from the server | Existing Stone Cottage reservations display (name/dates/status) correctly | ✓ Safe |
| Admin — Reservations | server-driven table; FE has no lookup of FE-catalogue by slug for rendering names/rates | Renders all 32 incl. Stone Cottage rows; filter options list only 3 types | ✓ Safe, cosmetic |
| Admin — Rooms | server-driven `GET /admin/rooms`; FE table doesn't look up rooms.js | Shows 32 units (honest); sellable count = 32 in UI until retirement | ✓ Safe, cosmetic |
| Admin — Rates | `FilterSelect options=RATE_PLANS` + `ROOMS` (FE catalogue = 3 types) | Filter values only 3; server list may show 4-type rows; cannot create bad pair via UI | ✓ Safe |
| `/room-types` API (not consumed by FE) | Server returns 4 rows unchanged | Added but unused gracefully | ✓ Safe |
| Booking quote/hold/confirmation for existing Stone Cottage bookings | Server stores/covers these; FE checkout simply has no such selector | Existing bookings unaffected; confirmation path operates on `selection` which cannot be Stone Cottage | ✓ Safe |
| FE routing `/availability?room=stone-cottage` | `?room=...` just sorts that slug first; mapped slug absent → no match, no crash, availability page shows 3 types | Graceful | ✓ Safe |

Note: the frontend *intentionally* hides Stone Cottage from guests. That is an honest representation of the owner's approved inventory (28), not a bug. Admin views remain 32 (truth about production today) — documented as a known, intentional interim mismatch until retirement completes.

## Options weighed

| Option | Guest impact | Booking risk | API compat | Existing res. | Rollback | Needs DB write |
|---|---|---|---|---|---|---|
| A. Ship M8 now, prod stays 32 | Guests see 3 types (correct); admin sees 32 (honest interim) | None; API filters already wired; unknown slugs dropped | Full | Preserved | Git revert + redeploy | No |
| B. Temporary FE "compat treatment" flag Stone Cottage as hidden instead of catalogue removal | Same guest result; hides drift | Introduces a toggle codepath; additional complexity for no practical gain | Full | Preserved | Revert | No |
| C. Hold deployment until retirement done | M8 fixes not live; C03/C04 cannot be retired "tomorrow" without deploy anyway | Loses M8 value (honesty/booking clarity) entirely until plan executed | n/a | n/a | n/a | n/a |

**Recommended: A.** It delivers the owner's M8 goals immediately, respects confirmed reservations, and blocks nothing. Existing Stone Cottage reservations remain untouched (`/account/reservations` shows them; host dashboard reports them); guests simply cannot create new ones — which is the approved inventory constraint.

Rollback = revert commits on `main` + redeploy. No schema, migration, seed, or settings row changes required.

## What this does NOT solve
- Production availability of Stone Cottage for those dates (intentionally removed from guest surface).
- Admin dashboard sellable/count mismatch (will still read 32 until retirement — documented; not fixed silently).
- `/room-types` API returning a 4-type list — consumed nowhere guest-facing.

## Sign-off conditions for Option A (all met)
- No guest compile/runtime crash paths exercised (verified: 3 unknown-slug branches all handled).
- No production writes required.
- No rollback complexity beyond a redeploy.
- All financial/legal/integrity paths unchanged.
