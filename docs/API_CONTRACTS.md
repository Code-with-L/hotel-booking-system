# API Contracts (v1.0 — as implemented in M1) — The Stillhouse

**Base path:** `/api/v1` · JSON over HTTPS · Dates `YYYY-MM-DD` · Money = **integer minor units** + explicit `currency` (`KES`) · Errors: `{ "error": { "code", "message", "details?" } }`.
CSRF: SameSite=Lax cookie + JSON-only APIs; CORS allowlist (`WEB_ORIGIN`); credentialed cookies (`credentials: include`).

## Conventions
- Reservation references: `STL-YYYY-NNNNNN` (e.g. `STL-2026-S000423`).
- Reservation states: `pending → confirmed → checked_in → checked_out`; `pending|confirmed → cancelled`; `pending → expired` (hold TTL).
- Guests can book without an account. Online payment initiation requires either a session owning the reservation or `email` matching the reservation (possession of reference + booking email authorises initiation only).

## Public

| Method & path | Request | Response |
|---|---|---|
| `GET /room-types` | — | Catalogue (slug, number, name, tagline, summary, description[], sizeSqm, occupancy{adults,children,label}, bed, view, fromPriceMinor, unitCount, amenities[], features[]) |
| `GET /room-types/:slug` | — | Single type or 404 |
| `GET /availability?checkIn&checkOut&adults&children&rooms` | query (validated) | `{ nights, checkIn, checkOut, results: [{ roomTypeSlug, available, reason?, plans: [{ ratePlanKey, name, summary, cancellationSummary, refundable, nightlyMinor, pricing{…minor} }] }] }` — allocation-aware |
| `POST /quotes` | `{ roomTypeSlug, ratePlanKey, checkIn, checkOut, adults, children, rooms }` | Authoritative quote `{ nights, nightlyMinor, subtotalMinor, serviceChargeMinor, tourismLevyMinor, vatMinor, taxesAndFeesMinor, totalMinor, currency: "KES", expiresAt }`. VAT = 16% × net (service charge & tourism levy excluded per VAT Act s.13(7)) |
| `POST /reservations` | `Idempotency-Key` header (required, ≥8 chars) + `{ roomTypeSlug, ratePlanKey, checkIn, checkOut, adults, children, rooms, source?, guest{firstName,lastName,email,phone,country,requests?,privacy:true} }` | `201 { reference, status: "pending", …, pricing{…} }` · replay with same key → `200` same reservation · `409 ROOM_UNAVAILABLE` |
| `GET /reservations/:reference` | session-owned guest, or `?email=` matching booking | Reservation detail |
| `POST /reservations/:reference/cancel` | `{ reason? }` | `{ statusRaw: "cancelled", cancelFeeMinor, currency, message }` — fee from rate-plan policy (flexible: free >7d before arrival else first-night; advance: full total) |
| `POST /enquiries` | `{ kind:'experience'\|'dining', subject, name, email, date?, guests, message }` | `201 { id }` |
| `POST /newsletter` | `{ email }` | `{ subscribed: true }` |
| `POST /payments` | `{ reservationReference, phone?, email? }` | `201 { status:"pending", checkoutRequestId, … }` when Daraja configured; otherwise `503 MPESA_NOT_CONFIGURED`. **Never a fake success.** |
| `POST /webhooks/mpesa` | Daraja STK callback | `{ ResultCode: 0|1, ResultDesc }`. Verifies structure + amount + reference; confirms reservation transactionally; idempotent on replay. Optional IP allowlist (`MPESA_WEBHOOK_ALLOWED_IPS`). **Not rate-limited** (provider retries) |
| `GET /ready` | liveness/readiness (DB `SELECT 1`) | `200 { ok, db: "up" }` or `503` |

## Guest account (session cookie)
`POST /auth/register` · `POST /auth/sign-in` (rate-limited) · `POST /auth/sign-out` · `GET /auth/me` · `POST /auth/forgot-password` (503 unless `EMAIL_PROVIDER` configured) · `POST /auth/reset-password` · `GET /account/reservations` → `{ upcoming[], previous[] }` · `PUT /account/profile`.
Sessions: server-managed, HttpOnly, `SameSite=Lax`, absolute 7d, idle 8h (configurable); bcrypt cost 12.

## Staff (RBAC: receptionist < manager < admin)
| Path | Notes |
|---|---|
| `GET /admin/dashboard` | KPIs; arrivals/departures today; occupancy; revenue; recent; availability by type; pending/confirmed counts; cancellations (30d); payment summary (succeeded/pending/failed); outstanding balance |
| `GET /admin/reservations?q&status&roomType&page&pageSize` | `{ total, rows: [toListItem + paymentStatus, totalPaidMinor, cancelFeeMinor] }` |
| `GET /admin/reservations/:reference` | Detail incl. itemised `breakdown{.}` (nightly, subtotal, SC/levy/VAT, total, cancel fee) and `payments[]` |
| `PATCH /admin/reservations/:reference` | `{ status: confirmed|checked_in|checked_out|cancelled, reason? }` - valid transitions only; compare-and-swap (concurrent modifier gets 409); cancellation releases allocations; audit-logged |
| `GET /admin/rooms` | 28 units with live status (out_of_service ? "Out of service", allocations today ? "Occupied", else "Vacant clean") |
| `PATCH /admin/rooms/:number` | `{ status: active|out_of_service, notes? }` - M4 **hard guard**: `out_of_service` rejected with 409 (blocking reservation references listed) while an occupying hold/reservation overlaps the next 365 days; no override |
| `GET /admin/rooms/:number/history` | M4 **new** - allocation ledger for the unit (dates, kind, state, source reservation + guest) |
| `PATCH /admin/guests/:id` | M4 **new** - operational notes (`notes`, <800 chars), audit-written (`guest.notes_updated`) |
| `GET /admin/reports/financial-summary` | M4 **new, manager+** - collected/pending/failed payments, refunds, cancellation fees, outstanding balances, recent payments |
| `GET /admin/rates` / `PATCH /admin/rates/:id` | Seasonal rate cards (`nightlyMinor` or status `active\|scheduled\|inactive`) — manager/admin only |
| `GET /admin/reports/occupancy?days` | Daily occupancy % derived from allocations |
| `GET /admin/reports/monthly?months` | Reservations + revenue (KSh) by month and room type |
| `GET /admin/settings` / `PUT /admin/settings` | Validated hotel/policies/booking settings (KV) — manager/admin |
| `POST /admin/payments/manual` | Desk settlement — full balance only; confirms reservation; receptionist+ |
| `POST /admin/payments/:id/requery` | STK query for a pending M-Pesa payment; confirms or fails per Daraja truth; manager/admin |
| `POST /admin/payments/:id/refund` | Records a manual refund (funds move outside the system); manager/admin |
| `GET /admin/reports/reconciliation?from&to` | Payment ledger for daily settlement: rows + totals; manager/admin |
| `GET /admin/audit-log?entity&page&pageSize` | Append-only audit trail — admin only |

## Cross-cutting (added M2)
- All money integers; all endpoints validate with zod; all writes emit audit_log.
- Pagination: page + pageSize (default 25, max 100).
- On reservation confirmed, a tax_invoice row is recorded (`issued` via configured eTIMS provider; `skipped` when disabled). Booking confirmation email is attempted; booking flow never blocks on it.
- `/api/v1/health` is for uptime probes; `/api/v1/ready` additionally checks PostgreSQL.
- Webhook and health endpoints are exempt from the global rate limiter (provider retries); all other /api/v1 routes share 300 req/15min per IP.
