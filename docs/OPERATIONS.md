# Operations Runbook — The Stillhouse

For front-desk, management and the owner. No code required for daily operation.

## Daily flow (front desk)

1. **Morning** — open Operations (`/admin`). Check Dashboard: today's arrivals/departures, occupancy, any out-of-service rooms.
2. **Arrivals** — find the guest on **Reservations** (search by name/reference/email). Verify ID/payment. Mark **Checked-in** in the status drawer (validated transitions only: Confirmed → Checked-in → Checked-out).
3. **Desk payment** — if the guest pays at the desk (cash/card/bank transfer), use the payment recording action (manager/admin or receptionist with the desk flow). It requires the **full balance** and confirms the reservation automatically.
4. **Check-out** — Reservations → open guest → **Checked-out**.
4a. **Operational notes** - Guests -> open dossier -> "Operational notes" (max 800 chars). Saved notes are written to the guest record and audit-logged (`guest.notes_updated`).
4b. **Room history** - Rooms -> **History** on any unit: allocation ledger rows (dates, kind, state) with Completed/In effect labels.
4c. **Financials** - Operations -> **Financials** (manager+): collected / outstanding / refunds / cancellation fees / pending value, outstanding-balances table and recent payments. Figures come from recorded payments only; desk settlements count immediately.
5. **Maintenance** - Rooms -> take room out of service with a note (creates a dated maintenance block; the room immediately disappears from sale). When fixed, set back to **Vacant clean** (future blocks are released automatically).

## Staging & release

- Staging is rehearsed locally via docker-compose.staging.yml (isolated project stillhouse-staging, self-signed TLS) - see docs/STAGING.md for bring-up, the owner commissioning checklist, and promotion to a public VPS + managed PostgreSQL.
- Deploy order is always: migrations first, then the API, then verify /api/v1/ready returns {"ok":true,"db":"up"}, then smoke node tests/staging-acceptance.mjs (16/16 expected).
- Rollback = redeploy previous image tag (migrations are additive-only; app rollback never reverses a migration). Database rollback = restore from backup; drill evidence in docs/reports/M6.md section 8.
- Production boot refuses unsafe config (missing/short SESSION_SECRET, COOKIE_SECURE!=true, non-HTTPS WEB_ORIGIN) with an explicit error - fix the environment, not the guard.

## Payment reconciliation (daily, 5 minutes)

- Operations -> Financials (manager+): collected/outstanding/refunds/cancellation fees/pending value, outstanding balances, and the Payment health panel - duplicate references, amount mismatches, overpaid reservations, cancelled-with-capture, stale pending M-Pesa transactions, and invoice failures. Findings are informational; correct records only through the existing flows (desk settlement, requery, refunds) - never by editing the ledger.
- Tomorrow's arrivals get an automated reminder email the night before (deduplicated per reservation; sent only when SMTP is configured, otherwise recorded as skipped in email_outbox).
- Operations → Reports → Reconciliation (`GET /api/v1/admin/reports/reconciliation?from&to`): lists payments with reference, provider, amount, status. Tick off against M-Pesa statements / bank deposits.
- Pending STK pushes that never resolved: ask the guest, then (manager+) use **Requery** on the payment (`POST /admin/payments/:id/requery`). It asks Daraja for the truth: confirmed / still pending / failed (with room released). KSh settles; the ledger follows.
- Failed payments release the room automatically within the hour (sweeper) — or instantly on a failed callback/requery.

## Cancellations & refunds

- Guest requests cancellation → find reservation → status **Cancelled**. Fee per rate plan: Flexible = free > 7 days before arrival (first night inside 7 days); Advance purchase = full amount. Fee is recorded on the reservation (`cancelFeeMinor`).
- Refunds are processed by management against the original payment rail (M-Pesa reversal or bank transfer) — **outside** this system. Then record it: manager+ → refund action on the payment (`POST /admin/payments/:id/refund`), which logs the refund and updates `payment.status` (refunded / partially_refunded). It never moves money itself — that is deliberate.

## Guest account management

- Guests manage their own profile and reservations at `/account`. Your role: verify on arrival, adjust notes by phone/email.
- Disabled guest access: no self-service lockout exists; for abuse, disable the linked `user` row (`status = 'disabled'`) via psql — planned future: admin UI. Until then, contact the technical owner.

## Room & rate management

- **Rates** — Seasonal rate cards (Green/Peak). Edit a card (manager+) → save; applies immediately and is audit-logged. Never delete history.
- **Blocks** — Taking rooms out for renovation: Rooms → set Out of service with note; blocks apply from today for ~1 year until released.
- **New seasons** — rate cards carry `validFrom/validTo`; contact the technical owner to add new season rows (a 2-minute change with a migration/seed update).

## Audit & oversight (owner weekly)

- **Admin → Audit log** (admin only): who changed what, when — reservations, rates, rooms, settings, refunds, sign-ins. Everything material lands here.
- **Email outbox** failures: if `email_outbox` has `status='failed'` rows, check SMTP config with the technical owner. Guests do not get confirmation emails until this reads clean.
- **Tax invoices** (`tax_invoice`): statuses `skipped` (eTIMS off), `issued` (all good), `failed` (KRA rejected or unreachable — retry runs hourly automatically; investigate `lastError`).

## Backups & disaster recovery

- Daily `pg_dump` is handled by the database host (managed provider) or a cron against `DATABASE_URL`. 30-day retention minimum.
- Restore procedure: `pg_restore` into a scratch database → verify counts (28 rooms / rate cards / reservation count) → point `DATABASE_URL` at restored DB → restart API → smoke a booking. Quarterly drill required.

## Incident quick responses

| Symptom | Do this |
|---|---|
| "Room shows occupied but guest never arrived" | Reservations → find it → verify/expire manually if it was a 15-min hold abandoned |
| "Guest paid but shows unconfirmed" | Reports → find payment → Requery (manager+). If still pending, customer care with the guest's M-Pesa SMS |
| "Website unreachable" | Check `/api/v1/ready`; check hosting dashboard; reboot app container; if DB is down, nothing else works — call host support |
| "Double-booked" | Impossible by design (database constraint). If display suggests it, it is a *block vs reservation data issue* — call technical owner immediately |
| "Lost Daraja callback" | Normal — Requery is the designed recovery; callbacks are an optimization, StK Query is the truth |

## Staff onboarding checklist

1. Admin creates your account (currently: technical owner via seed/role insert; self-service signup exists at `/account` register but never grants staff roles).
2. Your first day: shadow, then handle arrivals/departures for a week.
3. Know the four room statuses and the status transition map — the system refuses invalid moves; learn them from the allowed options in the drawer.
4. Never share the admin/manager login. Every action is audit-logged against your account.

## Ownership escalation

Front desk → Manager (refunds, cancellations, rate disputes) → Technical owner (incidents, integrations, deployments, KRA/eTIMS, Daraja).
