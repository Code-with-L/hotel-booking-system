# The Stillhouse - hotel-booking-system

A fictional 28-room boutique luxury retreat above the Great Rift Valley, Naivasha, Kenya — a working reservation platform: public website, booking engine, M-Pesa-ready payments, guest accounts and an operating dashboard for the property.

## Stack

- **Frontend:** React 18 + Vite 6, plain JS (no TypeScript), self-hosted fonts, no third-party origins
- **Backend:** Express, Prisma, PostgreSQL 16
- **Shared:** `packages/shared` — constants and zod schemas shared by both apps
- **Testing:** Vitest (API, real database), Playwright (e2e)

## Run it

Prerequisites: Node ≥ 20, Docker Desktop (for PostgreSQL).

```bash
# 1. Database
docker compose up -d db db_test

# 2. Install & schema + fixtures
npm install
npx prisma migrate deploy
npm run db:seed        # dev fixtures: hotel, rooms, rates, users, demo reservations
cp .env.example .env   # dev defaults are fine; never commit .env

# 3. Run (two terminals)
npm run dev:api        # http://localhost:4000/api/v1
npm run dev:web        # http://localhost:5173 (proxying /api)

# 4. Verify
npm test --workspace=@stillhouse/api
npx playwright test
npm run build --workspace=@stillhouse/web
```

Seed accounts (dev only — change or remove before any real deployment):
`admin@thestillhouse.example / StillhouseAdmin!26` (admin) · `manager@thestillhouse.example / StillhouseManager!26` · `naomi.achieng@example.com / GuestPassword!26` (guest).

Seeded demo data is clearly fake (example.com guests, generated references). The reservation engine, availability, payments boundary, admin operations and audit log are real code against a real database.

## Features

- **Public site:** rooms, experiences, dining, story — content-first pages, no full-page templates
- **Booking:** search availability (live, database-computed), room selection, guest details with Kenya-first validation (National ID required, +254 phone, auto-capitalized names), review, hold, payment via M-Pesa hand-off or front-desk settlement
- **Guest accounts:** sign-in, reservations, profile
- **Admin:** dashboard, rooms, reservations, guests, rates, reports, financials, settings; full audit log; RBAC (receptionist / manager / admin)
- **Money:** integer minor units (`KES`); VAT 16% on net, service charge 10%, tourism levy 2% (see `docs/TAX_AND_CHARGES.md` — owner/accountant sign-off required before any real transaction)

## Layout

```
apps/web        # React + Vite frontend (public site + guest/staff UIs)
apps/api        # Express API (/api/v1)
packages/shared # constants + zod schemas
prisma/         # schema + migrations
tests/          # e2e (Playwright)
docs/           # project documentation
```

## Ground rules

- JavaScript ES modules everywhere. No TypeScript, no Next.js, no Tailwind.
- Money is integer minor units with explicit `currency: "KES"`.
- M-Pesa (Daraja) is the first payment integration. Until `MPESA_ENV` + credentials are set, payment initiation returns a truthful `503 MPESA_NOT_CONFIGURED` — never a fake success. Desk settlement works today.
- `.env` is never committed; see `.env.example` for the key names.
- API base path: `/api/v1`.

## Status

Engineering complete. All tests green locally (API 53/53, e2e 3/3), Lighthouse a11y/BP/SEO 100 on audited pages, CI green on `main`. Not deployed publicly — hosting, domain, credentials and tax sign-off are owner actions (see `docs/COMMISSIONING.md`).

## Docs

| Doc | Purpose |
|---|---|
| `docs/PROJECT_BRIEF.md` | Scope, brand, non-goals |
| `docs/ARCHITECTURE.md` | Modular monolith; workspaces; error/response shapes; reservation states |
| `docs/DESIGN_SYSTEM.md` | Tokens, typography, components, motion |
| `docs/FRONTEND_MAP.md` | Route map |
| `docs/DATABASE_DESIGN.md` | Schema direction; allocation-ledger overlap prevention |
| `docs/BOOKING_WORKFLOW.md` | Holds, quotes, state machine, payments, cancellation |
| `docs/API_CONTRACTS.md` | `/api/v1` contract |
| `docs/DEPLOYMENT.md` | Production architecture, release & rollback |
| `docs/OPERATIONS.md` | Staff runbook |
| `docs/DECISIONS.md` | Decision log |
| `docs/TAX_AND_CHARGES.md` | VAT/Tourism Levy research — approval required |
