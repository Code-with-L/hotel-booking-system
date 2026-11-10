# API Requirements (for the backend engineering handoff)

All network access is isolated in `src/services/*`. Today `api.js → simulate()` returns local mock data; replace each service function with `request()` calls. JSON over HTTPS, ISO dates (`YYYY-MM-DD`), money as integer minor units or KSh integers with an explicit `currency`.

## Booking workflow
1. **Search** → `GET /api/availability`
2. **Select** a room type + rate plan (client state; optionally `POST /api/holds` for a short inventory hold)
3. **Guest details** (client validation; server re-validates)
4. **Quote** → `POST /api/quotes` (authoritative taxes/fees/total)
5. **Create reservation** → `POST /api/reservations` (+ payment step when integrated)
6. **Confirmation** → `GET /api/reservations/:reference`

### Reservation states
`pending` → `confirmed` → `checked_in` → `checked_out`; `pending|confirmed` → `cancelled`; `pending` → `expired`. (Frontend admin labels: Pending, Confirmed, Checked-in, Checked-out, Cancelled.) The demo status `DEMO` must disappear once real.

## Public endpoints
| Method & path | Request | Response |
| --- | --- | --- |
| `GET /api/room-types` | – | `[{ slug, name, summary, description[], sizeSqm, occupancy:{adults,children}, bed, view, amenities[], features[], images[{url,alt}] }]` |
| `GET /api/availability?checkIn&checkOut&adults&children&rooms` | query | `{ nights, results:[{ roomTypeSlug, available:boolean, reason?, plans:[{ ratePlanId, name, nightly, subtotal, currency, cancellationPolicy }] }] }` |
| `POST /api/quotes` | `{ roomTypeSlug, ratePlanId, checkIn, checkOut, adults, children, rooms }` | `{ nightly, nights, rooms, subtotal, lineItems:[{label,amount}], taxesAndFees, total, currency, expiresAt }` |
| `POST /api/reservations` | `{ quoteId, guest:{firstName,lastName,email,phone,country,requests}, consentPrivacy:true, paymentToken? }` | `{ reference, status, createdAt, room, stay, guest, pricing }` |
| `GET /api/reservations/:reference` | – (guest-auth or ref+email) | reservation object |
| `POST /api/reservations/:reference/cancel` | `{ reason? }` | updated reservation + any fee |
| `POST /api/enquiries` | `{ kind:'experience'|'dining', subject, name, email, date?, guests, message }` | `{ id }` |
| `POST /api/newsletter` | `{ email }` | `{ subscribed }` (double opt-in recommended) |

## Guest account
`POST /api/auth/sign-in`, `POST /api/auth/sign-out`, `GET/PUT /api/account/profile`, `GET /api/account/reservations` → `{ upcoming:[…], previous:[…] }`. Needs real sessions/tokens, rate limiting, password reset, email verification. (Current `authService` is an insecure demo.)

## Admin endpoints (staff auth + roles required)
| Endpoint | Purpose |
| --- | --- |
| `GET /api/admin/dashboard` | totals, arrivals/departures today, occupancy, revenue, recent reservations, availability by type |
| `GET /api/admin/reservations?q&status&roomType&sort&page` / `GET|PATCH /api/admin/reservations/:id` | list, detail, status transitions |
| `GET /api/admin/rooms`, `PATCH /api/admin/rooms/:number` | physical rooms, status, maintenance note |
| `GET /api/admin/guests?q`, `GET /api/admin/guests/:id` | guest records + history |
| `GET /api/admin/rates`, `PUT /api/admin/rates/:id` | rate cards per room type / plan / date range / status |
| `GET /api/admin/reports/occupancy?from&to`, `/reservations`, `/revenue` | report series |
| `GET|PUT /api/admin/settings` | hotel info, contact, policies, booking rules |

## Integration requirements
- **Inventory:** real per-night inventory by room type; concurrency-safe holds; overbooking rules.
- **Pricing:** server-side rate plans, seasons, taxes (service charge, tourism levy, VAT), currency formatting.
- **Payments:** PCI-compliant provider; the frontend must never claim payment success without a verified server result.
- **Notifications:** transactional email (confirmation, cancellation), staff alerts.
- **Security:** replace demo auth, add admin RBAC, CSRF/rate limiting, input validation, audit log.
- **Privacy:** GDPR/Kenya DPA-appropriate consent, retention and deletion.
- **Media:** replace stock photography with a CMS/CDN-backed library.

## Mock functionality that must be replaced
`availabilityService` (fake availability) · `utils/pricing.js` (demo tax math) · `reservationService` (sessionStorage, `DEMO-` refs) · `authService` (no verification) · `enquiryService` (stores locally) · `adminService` (mock datasets, no persistence) · `data/mock*.js` · placeholder contact/social/legal content in `data/site.js`.
