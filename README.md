# The Stillhouse — `hotel-booking-system`

A fictional 28-room boutique luxury retreat above the Great Rift Valley, Naivasha, Kenya — a working reservation platform: public website, booking engine, M-Pesa-ready payments, guest accounts and an operating dashboard.

**Status: M7 complete - final engineering acceptance done, decision CONDITIONAL GO (not production-ready by itself). Staging rehearsed locally over real HTTPS (16/16); CI/CD green on GitHub; production deps `npm audit` = 0; deepmerge-ts CVE remediated. No public URL yet - host/domain/TLS and tax/credentials are owner-gated. See `docs/reports/M7.md`, `docs/FINAL_ACCEPTANCE.md`, `docs/STAGING.md` and `docs/ACTIVATE_*.md`.**

## Run it

Prerequisites: Node ≥ 20, Docker Desktop (PostgreSQL).

```bash
# 1. Database (PostgreSQL 16 in Docker, plus a throwaway test DB on :5433)
docker compose up -d db db_test

# 2. Install & database schema + fixtures
npm install
npx prisma migrate deploy
npm run db:seed        # dev fixtures: hotel, 28 rooms, rates, users, 34 demo reservations
cp .env.example .env   # dev defaults are fine; never commit .env

# 3. Run (two terminals)
npm run dev:api        # http://localhost:4000/api/v1
npm run dev:web        # http://localhost:5173 (proxying /api)

# 4. Verify
npm test --workspace=@stillhouse/api     # 45 API tests (real PostgreSQL, race-condition, RBAC, audit, Daraja mock suite, reconciliation, rehearsal)
npx playwright test                      # 3 e2e journeys (guest books → staff confirms → guest sees it)
npm run build --workspace=@stillhouse/web
```

Seed accounts (dev only — change or remove for any real deployment): `admin@thestillhouse.example / StillhouseAdmin!26` (admin) · `manager@thestillhouse.example / StillhouseManager!26` · `naomi.achieng@example.com / GuestPassword!26` (guest).

Starting state after `npm run db:seed`: **demo fixtures are clearly fake** (example.com guests, generated references). The reservation engine, availability, payments boundary, admin operations and audit log are all real code against a real database.

## Read the docs first

| Doc | Purpose |
|---|---|
| `docs/PROJECT_BRIEF.md` | Scope, brand, non-goals |
| `docs/ARCHITECTURE.md` | Modular monolith; workspaces; the `src/services/*` seam; API rules |
| `docs/DESIGN_SYSTEM.md` | Tokens, typography, components, motion — canonical visual truth |
| `docs/FRONTEND_MAP.md` | Route map the Arena frontend must implement |
| `docs/M3_VISUAL_REVIEW.md` | M3 experience refinements + verification evidence |
| `docs/M3_PHOTOGRAPHY_BRIEF.md` | Shot list for the commissioned photography |
| `docs/DEPLOYMENT.md` | Production architecture, release & rollback, monitoring |
| `docs/OPERATIONS.md` | Daily staff runbook: arrivals, settlement, refunds, blocks, rates |
| `docs/BACKUP_RESTORE.md` | Backup cadence + performed restore drill (evidence) |
| `docs/PERFORMANCE.md` | Measured load tests and optimisation notes |
| `docs/SECURITY_REVIEW.md` | M2-D audit: findings, fixes, residual risks |
| `docs/ACTIVATE_MPESA.md` | Owner steps for Daraja STK (current: mock-verified only) |
| `docs/ACTIVATE_EMAIL.md` | Owner steps for SMTP transactional email |
| `docs/ACTIVATE_ETIMS.md` | KRA eTIMS reality + what remains owner-side |
| `docs/ARENA_HANDOFF_BRIEF.md` | Original Arena brief (historical — the frontend now exists in `apps/web/`) |
| `docs/HANDOFF_CHECKLIST.md` | Acceptance gate used for the Arena handoff (M1) |
| `docs/DATABASE_DESIGN.md` | Schema direction; allocation-ledger overlap prevention |
| `docs/BOOKING_WORKFLOW.md` | Holds, quotes, state machine, payments, cancellation |
| `docs/API_CONTRACTS.md` | `/api/v1` contract (draft until frontend accepted) |
| `docs/SECURITY.md` | AuthN/Z, sessions, RBAC, payments, data protection |
| `docs/TAX_AND_CHARGES.md` | Kenyan VAT/Tourism Levy research — **approval required, not yet usable** |
| `docs/BUILD_PLAN.md` | Milestones M0–M7, risks |
| `docs/DECISIONS.md` | Decision log D-001…D-020 |
| `docs/MOCK_DATA.md` | What is fake in the prototype and must be replaced |

## Layout

```
apps/web        ← future Arena frontend (M1)
apps/api        ← future Express backend (M3+)
packages/shared ← constants + zod schemas (both apps)
prisma/         ← schema + migrations (M3+)
tests/          ← integration/ (API) · e2e/ (Playwright)
docs/           ← source of truth (see above)
```

## Ground rules

- JavaScript ES modules everywhere. No TypeScript, no Next.js, no Drizzle, no Tailwind.
- Money: integer minor units + explicit `currency: "KES"`. API base: `/api/v1`.
- M-Pesa (Daraja) is the first payment integration. Until `MPESA_ENV` + Daraja credentials are set, payment initiation returns truthful `503 MPESA_NOT_CONFIGURED` — never a fake success. Desk settlement via the admin UI works today.
- `.env` is never committed; see `.env.example` for key names.
- Milestones M0–M7 gates are mandatory — no skipping ahead.
- The Arena frontend in `apps/web/` is an existing product: preserve its design; backend adapts to it, never the reverse.
