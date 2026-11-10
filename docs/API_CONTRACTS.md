# API Contracts (draft v0.9) — The Stillhouse

**Status:** Draft. **Field names are provisional until the Arena frontend is accepted** — the backend adapts to the delivered `src/services/*`, never the reverse. Structural rules below are binding. Internal reference: superseded `docs/archive/API_REQUIREMENTS.md` retained for history.

**Base path:** `/api/v1` · JSON over HTTPS · Dates `YYYY-MM-DD` · Money = **integer minor units** + explicit `currency` (`KES`) · Errors: `{ "error": { "code", "message", "details?" } }`.

## 0. Reservation states
`pending → confirmed → checked_in → checked_out`; `pending|confirmed → cancelled`; `pending → expired`. Demo/`DEMO-` statuses from the prototype must not survive into any real build.

## 1. Public endpoints

| Method & path | Notes |
|---|---|
| `GET /api/v1/room-types` | Catalogue for website: slug, name, summary, size, occupancy, bed, view, amenities, images |
| `GET /api/v1/availability?checkIn&checkOut&adults&children&rooms` | Allocation-aware availability + per-plan pricing. Server computes; returns `{ nights, results: [{ roomTypeSlug, available, reason?, plans: [{ ratePlanId, name, nightly, subtotal, currency, cancellationPolicy }] }] }` |
| `POST /api/v1/quotes` | Authoritative quote. `{ roomTypeSlug, ratePlanId, checkIn, checkOut, adults, children, rooms }` → `{ quoteId?, nights, rooms, subtotal, serviceCharge, tourismLevy, vat, taxesAndFees, total, currency, expiresAt }`. Exact tax line items pending TAX_AND_CHARGES.md approval |
| `POST /api/v1/reservations` | `Idempotency-Key` header required. `{ quote, guest{...}, consentPrivacy: true }` → `201 { reference, status, ... }` or `409 ROOM_UNAVAILABLE`. Server recomputes price; client total ignored |
| `GET /api/v1/reservations/:reference` | Session-owned guest, or `reference + email` for confirmation retrieval |
| `POST /api/v1/reservations/:reference/cancel` | `{ reason? }` → updated reservation + any fee; refund handed to payments module |
| `POST /api/v1/enquiries` | `{ kind: 'experience'\|'dining', subject, name, email, date?, guests, message }` → `{ id }` |
| `POST /api/v1/newsletter` | `{ email }` — double opt-in recommended |

## 2. Guest account
`POST /auth/sign-in` · `POST /auth/sign-out` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET|PUT /api/v1/account/profile` · `GET /api/v1/account/reservations` → `{ upcoming: [...], previous: [...] }`. Server sessions; see SECURITY.md.

## 3. Staff (RBAC: receptionist/manager/admin)
| Path | Purpose |
|---|---|
| `GET /api/v1/admin/dashboard` | KPIs: arrivals/departures today, occupancy, revenue, recent reservations |
| `GET|PATCH /api/v1/admin/reservations(/:id)` | List (q, status, roomType, page) / detail / status transitions |
| `GET|PATCH /api/v1/admin/rooms(/:number)` | Physical rooms, status (active/out_of_service), maintenance note → writes `inventory_block` |
| `GET /api/v1/admin/guests(/:id)` | Search, history |
| `GET|PUT /api/v1/admin/rates(/:id)` | Rate cards per plan/date-range/status |
| `GET /api/v1/admin/reports/{occupancy,reservations,revenue}?from&to` | Report series |
| `GET|PUT /api/v1/admin/settings` | Hotel info, policies, booking rules |
| `GET /api/v1/admin/audit-log?entity&id&page` | Admin+ only |

## 4. Payments & webhooks
- `POST /api/v1/payments` — initiate payment for a `pending` reservation (`{ reservationReference, provider: 'mpesa' }`); returns provider action (e.g. STK push pending) — **never** an immediate "success".
- `POST /api/v1/webhooks/mpesa` — Daraja callback. Verify first; record `payment_attempt`; confirm reservation in one transaction; idempotent on provider reference.
- `POST /api/v1/webhooks/<card-provider>` — same contract, added when cards land (M5+).
- Refunds: `POST /api/v1/admin/refunds` (manager/admin) → provider refund; completion via webhook.

## 5. Cross-cutting
- All money integers; all endpoints validate with zod; all staff endpoints require role; all writes emit `audit_log`.
- Pagination: `page`, `pageSize` (default 25, max 100). Filtering via query params; sorting via `sort`.
- Versioning: `/api/v1` prefix; breaking changes → `/api/v2`, never in-place.

## 6. What is deliberately undecided (owner approval required)
1. Exact JSON field names & quote representation — finalised against delivered frontend in M1 review.
2. Tax line items & computation (TAX_AND_CHARGES.md §4 proposal) — **awaiting owner approval**.
3. Confirmation lookup policy (session-only vs reference+email) for non-registered guests.
4. Rate limiting numbers per route; idle session timeouts.
5. `quoteId` persistence model (signed quote payload vs server-stored quote row).
