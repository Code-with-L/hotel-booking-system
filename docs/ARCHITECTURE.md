# Architecture — The Stillhouse

**Status:** Approved direction at M0 (2026-11-11). Amendments via `DECISIONS.md`.

## 1. Style

**JavaScript modular monolith.** One repository, one ecosystem, clearly separated frontend, backend, database and business logic. Microservices are deliberately rejected: they add operational complexity with no benefit for a single-property booking system.

## 2. Repository layout

```
hotel-booking-system/
├── apps/
│   ├── web/                 # Arena-generated React + Vite frontend (handoff → acceptance gate → lives here)
│   └── api/                 # Express backend (M3+). JavaScript ES modules.
├── packages/
│   └── shared/              # constants/ + validation/ (zod schemas, enums). No React, no Prisma, no Express.
├── prisma/                  # schema.prisma, migrations/, seed.js  (created in M3, not before)
├── docs/                    # Source of truth
├── tests/                   # integration/ (API), e2e/ (Playwright booking flow)
├── .env.example             # Named keys only — never real secrets
└── package.json             # npm workspaces: apps/*, packages/*
```

Staging: the Arena export is inspected and run in a **separate staging directory** (`../arena-staging/`, sibling of the repo, never committed) before acceptance. Acceptance = every applicable item in `HANDOFF_CHECKLIST.md` passes. Only then is the code moved into `apps/web/`.

## 3. Components

### `apps/web` — guest website + admin interface
React 19 + Vite + JavaScript ES modules. React Router (`createBrowserRouter`), GSAP + ScrollTrigger, plain CSS with custom properties (`src/styles/tokens.css` is canonical per `DESIGN_SYSTEM.md`).

- Routes per `FRONTEND_MAP.md`: public site (`/` … booking flow … `/account`) and `/admin/*` inside `AdminLayout`.
- **The seam:** all network access is isolated in `src/services/*`. Today those services may return mock data (`MOCK_DATA.md`); in M3+ they become `request()` calls to `/api/v1`. No component, page or feature module talks HTTP directly.
- Business logic (availability validity, pricing truth, reservation legality) is **never** decided in React.
- Animation choreography lives in `src/animations/`, separate from business logic.

### `apps/api` — application server
Node.js + Express + JavaScript ES modules. Owns everything that must be trustworthy:

- Modules: `auth`, `guests`, `rooms`, `availability`, `pricing`, `reservations`, `payments`, `notifications`, `reports`.
- Middleware: session auth, RBAC authorization, zod request validation, rate limiting, error handling, request logging.
- Integrations (M5+): `integrations/mpesa/` (Daraja), later `integrations/cards/`; `integrations/email/` for transactional mail. Provider chosen behind an internal interface — never hardcoded into the booking engine.
- Prisma client for PostgreSQL. All queries parameterised via Prisma.

### `packages/shared`
Constants and zod validation schemas used by **both** apps (reservation states, roles, currency, error codes, DTO shapes). Keeps the contract honest.

### `prisma/`
Single database. Migrations committed. `seed.js` for development fixtures (the 28 rooms, three room types, sample rate plans).

## 4. The API boundary

- Base path: **`/api/v1`**. JSON over HTTPS. Dates `YYYY-MM-DD`. Money = **integer minor units** + explicit `currency: "KES"`.
- Errors: `{ "error": { "code": string, "message": string, "details?": object } }`.
- The contract in `API_CONTRACTS.md` is a **draft** until the Arena frontend is accepted; field names conform to the delivered `src/services/*`, not vice versa.
- Reservation states: `pending → confirmed → checked_in → checked_out`; `pending|confirmed → cancelled`; `pending → expired`.

## 5. Data flow (booking, simplified)

```
Browser (React)                    API (Express)                PostgreSQL
AvailabilityBar ── query params ──► GET /api/v1/availability ──► inventory/allocation check
Booking flow    ── quote ─────────► POST /api/v1/quotes ──────► rate plans + taxes (server truth)
Create          ── reservation ───► POST /api/v1/reservations ─► TX: lock, allocation insert,
                                                                 hold, reservation(pending)
Payment         ── webhook ───────► POST /api/v1/webhooks/mpesa► TX: verify signature,
                                                                 release-or-confirm allocation
```

Booking integrity is enforced in the database (see `DATABASE_DESIGN.md`), not by the UI.

## 6. Development

- Vite dev server on `:5173`, proxying `/api` → Express on `:4000`.
- `docker compose` for local PostgreSQL **when M3 starts** (Docker is the chosen local DB runtime).
- npm workspaces scripts at root: `dev:web`, `dev:api`, `build`, `lint`, `test`.
- Production topology is decided in M7 (static web served by CDN or by Express; Express on a single VM/container; managed PostgreSQL).

## 7. Architectural rules (non-negotiable)

1. React never queries PostgreSQL and never decides whether a reservation is valid.
2. The frontend is never redesigned to fit the backend without an approved decision.
3. No TypeScript, no Next.js, no Drizzle, no Tailwind, no CSS frameworks. Plain CSS tokens.
4. No secrets in source. `.env` is gitignored; `.env.example` lists key names only.
5. Two-phase booking integrity: DB constraints + transactions, not application-side checks.
6. Never any fake success responses, "DEMO" data in production paths, or placeholder payment confirmations.
7. `packages/shared` stays free of framework dependencies.
