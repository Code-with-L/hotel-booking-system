# Build Plan — The Stillhouse

**Status:** Approved direction at M0 (2026-11-11). Milestone gates are mandatory.

## Working agreements
- Small, reviewable commits; each commit compiles/passes tests for what it touches.
- Tests before "done": unit (Vitest) → integration (API) → e2e (Playwright booking flow).
- No fake success responses. No placeholder payment confirmations. No secrets in git.
- `docs/` is the source of truth; AI assistants read it first and never silently expand scope.
- The backend adapts to the accepted Arena frontend — never force-fit the frontend.
- No milestone begins while critical acceptance tests of earlier milestones fail.

## Milestones

### M0 — Product specification ✅ (this milestone)
Deliverable: approved project blueprint — documentation + repository hygiene. **No application code.**
Exit: owner sign-off on blueprint; repo flattened; commits created.

### M1 — Arena frontend + backend + integration ✅ (implemented 2026-11-11)
Arena export located (`stillhouse-luxury-hospitality-website.zip`), staged in `../arena-staging/`, NEXT/TS debris removed, accepted into `apps/web/`. Backend built (Express + Prisma + PostgreSQL): authn/BCrypt sessions, RBAC, allocation-ledger reservation engine (exclusion constraint verified), M-Pesa boundary with truthful unconfigured state + desk settlement, full admin API. Frontend `src/services/*` and `AuthContext` rewired to the live API (quote computed server-side; holds created; session bootstrap; admin pages async). e2e green (guest book → held → staff confirm → guest sees confirmed), backend 17/17 green, concurrency probe 5/5.
Stages: M1-A repo/DB/migrations/seed ✅ · M1-B auth/RBAC/admin ✅ · M1-C availability/reservations ✅ · M1-D payments/admin ✅ · M1-E frontend integration ✅ · M1-F tests/e2e/build ✅.
Deviations (see DECISIONS D-021…D-029): Vite pinned to 6.4.6; M-Pesa unavailable until Daraja registered (503, desk settlement path live); no booking edit (cancel+rebook); no outbound email (503, never faked); eTIMS deferred; booking fixtures are dev seeds; Daraja webhook replay safe and admin-rooms RBAC enforced.

### M2 — GSAP & motion pass
Tune existing animations of the accepted design (absent files/edge cases, reduced-motion coverage, performance). **Not a redesign.** Exit: motion consistent with DESIGN_SYSTEM §Animation; no jank on low-end hardware; owner eyeball approval.

### M3 — Database & API foundation
PostgreSQL 16 via Docker; Prisma schema per `DATABASE_DESIGN.md` (incl. `btree_gist`, `room_allocation` exclusion constraint); migrations + seed (28 rooms, 3 types, sample rates); Express skeleton; session auth; zod middleware; error model; `/api/v1/room-types`, `/availability`; integration tests for the allocation constraint (concurrent booking race → exactly one wins).
Exit: `docker compose up` → migrate → seed → API serves real availability; CI green.

### M4 — Reservation engine
Quotes (server-side, taxes per TAX_AND_CHARGES.md **approved** approach), reservation creation TX, allocation hold + 15-min TTL + sweeper, cancellation, idempotency keys, state machine, price snapshot. Integration tests: full booking flow, expiry race, double-booking attempt, quote-expired rejection.
Exit: end-to-end reservation lifecycle passes in tests; owner review of booking math.

### M5 — Payments & authentication
Guest accounts (register/verify/reset), RBAC staff seeding; **M-Pesa Daraja** end-to-end (STK → callback → webhook verify → confirm), `payment_attempt` audit; transactional email (confirmation/cancellation) via provider-agnostic interface; card provider scaffolding (interface only, unless approved earlier).
Exit: sandbox STK payment confirms a real reservation in a test environment; negative webhook tests pass; audit log complete.

### M6 — Administration
Dashboard KPIs, reservation management (search/filter/status), rooms & maintenance blocks (block cannot overlap occupied dates — enforced), rates management, guest CRM, reports (occupancy/revenue SVG charts already exist on frontend — wire to real endpoints), audit log viewer.
Exit: front-desk can run a day's arrivals/departures/check-ins; owner walkthrough.

### M7 — Quality, security & release
Vitest coverage targets; Playwright e2e (search → book → pay-sandbox → confirmation; admin sign-in); security review per `SECURITY.md` (RBAC matrix, rate limits, CSRF, webhook negatives, `npm audit`); accessibility pass (WCAG 2.1 AA); performance budget (LCP/CLS); Lighthouse; deployment decision; runbooks; backup/restore drill.
Exit: release candidate; owner sign-off.

## Open risks (register)
- R1 — Arena output quality/deviation: mitigated by the staging gate; rejection criteria pre-agreed (HANDOFF_CHECKLIST §1–5).
- R2 — Tax/levy correctness: provisional policy implemented (SC 10%, levy 2%, VAT 16% net). Owner/accountant sign-off still required before real launch (TAX_AND_CHARGES.md §4).
- R3 — M-Pesa Daraja sandbox vs Go-Live credential lead time: register Daraja app early (M1/M2), not M5.
- R4 — Stock imagery licensing: Pexels placeholders cannot ship publicly; commissioned shoot or licensed purchase before M7.
- R5 — eTIMS: required for real Kenyan sales; not in any milestone yet — flag to owner before production launch.
- R6 — Scope creep via Arena: Arena may invent routes/features; FRONTEND_MAP.md is the acceptance baseline.
