# Decision Log — The Stillhouse

Append-only. Each: ID, date, decision, context, consequences. Changes to a decided item require a new entry superseding it.

## D-001 (2026-11-11) — Single-property scope
One hotel: The Stillhouse. No multi-tenancy, no platform, no channel manager. Consequence: simpler schema, single `hotel` row, no tenant scoping anywhere.

## D-002 (2026-11-11) — Brand: The Stillhouse
Fictional Kenyan boutique property (28 rooms, 3 types: Garden Room ×14, Valley Suite ×9, Signature Retreat ×5), Naivasha, Great Rift Valley. Indicative rates KSh 28,000/42,000/65,000 per MOCK_DATA.md (content validation pending but brand direction approved).

## D-003 (2026-11-11) — Kenya-first market
Kenya-ready: KSh pricing, Africa/Nairobi timezone, M-Pesa + Kenyan compliance (VAT, Tourism Levy, eTIMS later). Currency stored explicitly so international expansion is additive, not a migration.

## D-004 (2026-11-11) — Frontend stack
React 19 + Vite + JavaScript ES modules. **No TypeScript anywhere.** React Router (`createBrowserRouter`, route-level code splitting). Plain CSS with custom-property design tokens — no Tailwind/PostCSS/CSS-in-JS. Cormorant Garamond + DM Sans confirmed (DESIGN_SYSTEM.md canonical).

## D-005 (2026-11-11) — Backend stack
Node.js + Express + JavaScript ES modules; Prisma ORM; PostgreSQL 16 (Docker for local). Modular monolith; npm workspaces monorepo `hotel-booking-system`. Microservices rejected.

## D-006 (2026-11-11) — Visual direction
Editorial/architectural hospitality. Warm ivory/limestone, ink, muted stone, restrained olive/terracotta; hairlines; square corners (≤2px); editorial asymmetry; slow cinematic animation; no gradients, gold, glass, glow, oversized rounded cards. DESIGN_SYSTEM.md is the source of truth.

## D-007 (2026-11-11) — Flatten repository
Repo root = `hotel-booking-system/` (was: nested `hotel booking system/stillhouse-luxury-hospitality-website/`). npm workspaces: `apps/web`, `apps/api`, `packages/shared`, root `prisma/`, `tests/`, `docs/`.

## D-008 (2026-11-11) — Scaffold debris archived, not adopted
Next.js 16, TypeScript, Drizzle, Tailwind, PostCSS template files moved to `docs/archive/scaffold/`. API_REQUIREMENTS.md superseded by API_CONTRACTS.md (also archived). Nothing archived is an active choice; re-adoption requires a new decision.

## D-009 (2026-11-11) — Arena generates the frontend; OpenCode engineers the backend
The visual frontend is produced by Arena.ai Code Arena from the handoff brief + design system + frontend map. Arena output is staged OUTSIDE the repo (`../arena-staging/`), inspected and run against `HANDOFF_CHECKLIST.md`, and only then moved into `apps/web/`. OpenCode does not implement placeholder frontends. **The backend adapts to the accepted frontend; the frontend is never redesigned to fit the backend without an approved decision.**

## D-010 (2026-11-11) — API base `/api/v1`; money as integer minor units + explicit currency
All endpoints under `/api/v1`. All money integers in the smallest unit with `currency` (`KES`). No floats, no "KSh integers or minor units — pick one" ambiguity; the answer is always integer minor units + currency.

## D-011 (2026-11-11) — API contract provisional until frontend accepted
API_CONTRACTS.md v0.9 field names are drafts. Final contract is pinned against Arena's delivered `src/services/*` in the M1 review. Structural rules (versioning, error shape, state machine, idempotency) are binding.

## D-012 (2026-11-11) — Booking integrity at the database
Overlap prevention (reservations vs holds vs maintenance blocks vs simultaneous requests) is enforced by a `room_allocation` ledger table with a partial `EXCLUDE USING gist (room_id =, during &&) WHERE state='occupying'` constraint, written inside reservation/hold/block transactions. Application-side checks are never the guard. Full strategy + transaction boundaries + sweeper design: `DATABASE_DESIGN.md` §3. (Amends and supersedes the earlier "exclusion constraint on reservation_room" framing from the initial blueprint.)

## D-013 (2026-11-11) — M-Pesa Daraja first
First real payment integration is M-Pesa (Daraja, STK push), sandbox → go-live. Card providers (Flutterwave/DPO/Stripe) may follow behind the same payments module and webhook pattern. Daraja app registration should begin during M1–M2 (lead time risk R3).

## D-014 (2026-11-11) — Tax approach requires approval; illustrative formula invalid
Mock-data formula (10% SC + 2% levy + 16% VAT on subtotal+service) is not legally correct. Research (2026-11-11) documented in `TAX_AND_CHARGES.md`: accommodation standard-rated 16% VAT; Tourism Levy 2% (Tourism Act s.105, Tourism Fund) excluded from VAT base (VAT Act s.13(7)); service charge (≤10%, distributed to staff under written agreement) excluded from VAT base; eTIMS mandatory; Finance Act 2026 has pending amendments. Proposed configurable-policy computation awaits owner approval before M4. Not tax advice.

## D-015 (2026-11-11) — Sessions over JWT in localStorage
Authentication uses server-managed sessions (PostgreSQL session table), HttpOnly Secure SameSite=Lax cookies. Role-based authorization enforced server-side on every staff endpoint. See SECURITY.md.

## D-016 (2026-11-11) — Holds: 15-minute TTL + sweeper + read-time filtering
Pending reservations hold inventory for 15 minutes (config). Cleanup by periodic sweeper; availability reads always filter lapsed holds; the exclusion constraint is the backstop. See DATABASE_DESIGN.md §3 and BOOKING_WORKFLOW.md §3.

## D-017 (2026-11-11) — Grid for admin: none (same design system, denser)
Admin reuses the same tokens/components at higher density (13px tables, hairline stat strips, flat badges, SVG charts). No separate "dashboard design language", no glassmorphism, no dark-mode-only admin.

## D-018 (2026-11-11) — Remote repository linked, currently empty
`https://github.com/Code-with-L/hotel-booking-system` — public, zero commits at inspection (2026-11-11). M0 creates the first two commits locally (structure/hygiene, then M0 docs). Push only with owner instruction.

## D-019 (2026-11-11) — Staging outside the repo
Arena exports are staged in `../arena-staging/` (sibling of repo root) and never committed. Acceptance happens there; only accepted source is moved into `apps/web/`.

## D-020 (2026-11-11) — Documentation-first; AI boundaries
OpenCode: backend engineering, integration, docs. Arena: visual frontend. AI never invents schema/relationships, never silently expands scope, never commits secrets, never marks features complete without tests. Milestone gates are mandatory.

## Open (owner decision required)
- O-1 — Tax computation approval (TAX_AND_CHARGES.md §4). Blocks M4 pricing.
- O-2 — Card provider choice (if/when): Flutterwave vs DPO vs Stripe.
- O-3 — Production hosting & managed PostgreSQL provider (decide at M7).
- O-4 — Photography: commissioned shoot vs licensed stock vs Arena-generated placeholders (launch blocker; see BUILD_PLAN R4).
- O-5 — eTIMS scope for first real deployment (BUILD_PLAN R5).
- O-6 — Confirmation access policy for non-account guests (session-only vs reference+email).
