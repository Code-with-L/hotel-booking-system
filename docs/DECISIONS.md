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

- D-030 (2026-11-11) — M2-A: Daraja integration verified against **mocked HTTP** (request shape incl. base64 password construction, callback verification with structure+amount+reference checks, replay idempotency, STK requery sweep for lost callbacks). **No live payment has been tested — credentials are owner-gated.** Activation runbook: `docs/ACTIVATE_MPESA.md`.
- D-031 (2026-11-11) — M2-B: Transactional email as outbox-persisted pipeline (`email_outbox`, dedupe per (template, reference)). SMTP via nodemailer (any provider) or explicit skip when unconfigured. Templates branded HTML+text. Confirmation gap: booking never claims "email received" unless outbox says `sent`.
- D-032 (2026-11-11) — M2-C: eTIMS boundary implemented (`TaxInvoice` model, provider interface, `MockEtimsProvider` for tests/dev, `OscUProvider` for KRA; sales-invoice wire format deliberately NOT fabricated — requires owner KRA sandbox registration and the OSCU spec). App is not eTIMS-compliant; reservations issue nothing until activated. See `ACTIVATE_ETIMS.md`.
- D-033 (2026-11-11) — M2-D: Security review recorded in `SECURITY_REVIEW.md`. Boot-time production guards: SESSION_SECRET strength, COOKIE_SECURE=true, HTTPS WEB_ORIGIN (all enforced). Prod seed creates catalogue only without SEED_* passwords. Webhooks bypass rate limit (provider retries). Session sweep every 60s. Dev default-password fixtures remain dev-only.
- D-034 (2026-11-11) — M2-E/F/G: N+1 elimination in availability/pricing (5.7×, p50 316→55 ms at 40 conn, measured); vendor chunk split; autocannon load test committed; production Dockerfiles build-verified; restore drill performed (dump→scratch counts verified); operational runbooks written (`OPERATIONS.md`, `DEPLOYMENT.md`, `BACKUP_RESTORE.md`, `PERFORMANCE.md`, `ACTIVATE_*.md`, `SECURITY_REVIEW.md`).

## Open (owner decision required)
- O-1 — Tax computation approval (TAX_AND_CHARGES.md §4). **Provisional approach implemented in M1**: configurable-by-code policy — SC 10%, Tourism Levy 2%, VAT 16% on net; SC and levy excluded from VAT base (VAT Act s.13(7)). Still needs your/accountant sign-off before real launch.
- O-2 — Card provider choice (if/when): Flutterwave vs DPO vs Stripe.
- O-3 — Production hosting & managed PostgreSQL provider (decide at M7 or with owner now — DEPLOYMENT.md lays out options).
- O-4 — Photography: commissioned shoot vs licensed stock vs Arena-generated placeholders (launch blocker; see BUILD_PLAN R4).
- O-5 — eTIMS scope for first real deployment (BUILD_PLAN R5).
- O-6 — Guest confirmation access policy. **Resolved in M1**: confirmation page shows reference + status; guest retrieval requires sign-in or reference+email.

## M1 decisions (2026-11-11)
- D-021 (2026-11-11) — Arena frontend located: `stillhouse-luxury-hospitality-website.zip` (Downloads) extracted to `../arena-staging/`, accepted into `apps/web/`. Next.js/TS/Drizzle shell debris removed from the web app; plain Vite + React + JS preserved intact otherwise.
- D-022 (2026-11-11) — Prisma on Windows-on-ARM64 uses `engineType = "client"` (pure JS/WASM query compiler; native engine unavailable on this platform) + `@prisma/adapter-pg`. Migrations run via the x64-emulated schema engine; verified end-to-end.
- D-023 (2026-11-11) — Vite pinned to ^6.4.6 + @vitejs/plugin-react ^4.7.0 (Vite 7/rolldown pre-transform crash: "Missing field moduleType").
- D-024 (2026-11-11) — Concurrency: reservation creation retries the whole transaction on allocation conflict (PG aborts a tx on any constraint violation; an in-tx retry would hit 25P02). Randomised room assignment spreads load; DB exclusion constraint remains the arbiter. Verified: 8 parallel requests for 5 rooms → exactly 5 succeed, 3 × ROOM_UNAVAILABLE.
- D-025 (2026-11-11) — Booking seed fixtures (34 deterministic reservations, 12 guests, allocations via the real ledger) are dev/demo fixtures, not production data. Production seed = hotel, 28 rooms, rate plans/cards, roles/users, settings only.
- D-026 (2026-11-11) — Daraja STK push cannot be exercised without credentials: payments module ships the real client + truthful `MPESA_NOT_CONFIGURED` 503; webhook verifies structure/amount/reference and is idempotent; desk settlement is the operational payment path until M-Pesa is registered. Confirmation emails likewise unconfigured (`EMAIL_PROVIDER` unset → 503 on reset-by-email, not a fake send).
- D-027 (2026-11-11) — No booking modification endpoint (change of dates/rooms): cancel + rebook is the supported flow; front-desk status changes are audit-logged. Arena UI has no modification surface. Reopen via DECISIONS.md if the business wants edit-in-place.
- D-028 (2026-11-11) — Reservation references are also the admin list identifier; room numbers are shown to staff only (guest-facing rows show room name).
- D-029 (2026-11-11) — `npm audit` (M1): 3 high — all in the dev-only Prisma CLI chain (`deepmerge-ts` ← `@prisma/config` ← `prisma`). Runtime dependencies clean. Fix requires Prisma 7 (breaking config) — deferred to M7 review; no production attack surface from this class in M1 scope.

## M4 decisions (2026-11-11)
- D-035 (2026-11-11) - M4: roadmap framing: the owner M4 brief overrides BUILD_PLAN's "M3+" stub; M4 executed per brief; residual (tax sign-off, Daraja, eTIMS, photography, release rehearsal) carried to M5 recommendation. Documented, not silently skipped.
- D-036 (2026-11-11) - M4: RBAC matrix locked in OPERATIONS-relevant form: guest < receptionist (front desk: view/checkout/cancel/notes/history) < manager (financial summary, rates, settings, refunds, requery) < admin (audit log only). Enforced with requireRole on every endpoint; no new roles; no nav-only enforcement.
- D-037 (2026-11-11) - M4 (amends D-024): allocation race hardened twice: (a) findFreeRooms locks candidate room rows FOR UPDATE in ascending id (identical order in every tx -> no self-deadlock; serialises contenders pre-exclusion-constraint); (b) ROOM_UNAVAILABLE retries get jittered backoff (40ms x (attempt+1) + rand60ms, max 6). M1 "8 for 5" baseline now deterministic; 8/8 consecutive clean 31/31 API runs verified.
- D-038 (2026-11-11) - M4: M4-era M1 regression root cause was cross-test pollution, not engine failure: m4 guard test left a signature-retreat room out_of_service; vitest file order varies per run; booking suite then saw 4 active rooms. Fix: m4 guard test restores status/notes in finally (M1 test untouched).
- D-039 (2026-11-11) - M4: maintenance guard: out_of_service is rejected (409 + blocking references) while any occupying hold|reservation allocation overlaps the next 365 days. Holds included deliberately (pending reservations also occupy inventory). No override, no silent invalidation; resolve stays first.
- D-040 (2026-11-11) - M4: financials derived only from recorded money (payment/reservation rows; outstanding = SUM GREATEST(total-successSum,0)). Daraja remains owner-gated (503 MPESA_NOT_CONFIGURED); no synthetic transactions; desk settlement is the operational path. Dev DB: 11 synthetic race-probe guest rows removed after JSON export (zero reservations; documented in docs/reports/M4.md).

## M5 decisions (2026-11-11)
- D-041 (2026-11-11) - M5: Daraja OAuth tokens are cached module-level with single-flight refresh (provider expires_in respected, 30s margin); Daraja outages map to 502 MPESA_UPSTREAM_ERROR; unconfigured remains 503 MPESA_NOT_CONFIGURED.
- D-042 (2026-11-11) - M5 (amends D-024 failure surface): webhook callbacks treat any terminal payment status as final (verified no-op); success-vs-settled-failed contradiction is logged as an anomaly and never flips the payment or the reservation.
- D-043 (2026-11-11) - M5: commitment to read-only reconciliation: GET /admin/reports/payment-health surfaces duplicate references, amount mismatches, overpayments, cancelled-with-capture, stale pendings, invoice failures and attempt/payment total mismatch. No auto-correction by design.
- D-044 (2026-11-11) - M5: eTIMS boundary completed (invoice history + admin panel). Invoice issuance remains KRA-certification-gated; skipped is the honest unconfigured state; no KRA wire formats invented.
- D-045 (2026-11-11) - M5: transactional email extended: paymentFailed (hooked from every failure path, deduped per reservation) + arrivalReminder (tomorrow's confirmed check-ins, deduped); email_outbox remains the source of truth.
- D-046 (2026-11-11) - M5: /ready and /health bypass session loading (orchestrators must always reach them); Prisma connection-class failures map to 503 SERVICE_UNAVAILABLE (was: 500). Found by the release rehearsal; suite re-verified (45/45).
- D-047 (2026-11-11) - M5: public reservation detail strips phone/country when authenticated only by possession of reference+email (staff/owner unchanged) - data minimization on public surfaces.
- D-048 (2026-11-11) - M5: Arena token contrast fixes (stone #66675f, terracotta #8a563f, on-dark-muted 0.78) - design system hues preserved, only lightness adjusted to WCAG AA; axe 2.1 AA scan reports zero violations on 8 pages.
- D-049 (2026-11-11) - M5: reconciliation and rehearsal are release-gated by docs/RELEASE_CHECKLIST.md; no automated production deployment exists or is claimed.

## M6 decisions (2026-11-11)
- D-050 (2026-11-11) - M6: staging topology is a single VPS/app host (Fly/Railway/Render/VPS-class) + managed PostgreSQL 16; no Kubernetes, no microservices; background sweepers stay in-process; rehearsal runs on an isolated local project (`stillhouse-staging`), never sharing dev/prod DBs.
- D-051 (2026-11-11) - M6: staging TLS via baked-in nginx vhost (`apps/web/nginx.staging.conf`, build-arg NGINX_CONF in Dockerfile) instead of bind-mounting a single file into the container; self-signed cert only for local rehearsal, gitignored with certs/ and .env.staging.
- D-052 (2026-11-11) - M6: `stillhouse-staging` is the isolated compose project namespace; cross-project orphan containers must not appear (dev DB recreation incident recorded and fixed).
- D-053 (2026-11-11) - M6: CI/CD = GitHub Actions (verify job gates on API tests w/ PG16 service, build, e2e, image builds, Trivy CRITICAL/HIGH); staging deploy is workflow_dispatch and owner-gated by repo variable STAGING_DEPLOY_ENABLED + STAGING_* secrets; GHCR images produced on demand.
- D-054 (2026-11-11) - M6: backup drill on populated staging verified restore incl. exclusion constraint room_allocation_no_overlap; restore drill evidence in m6-rehearsal/ (outside repo).
- D-055 (2026-11-11) - M6: rollback semantics fixed in docs: app rollback = redeploy previous image tag (additive-only migrations); DB rollback = restore from backup; never conflate the two.
- D-056 (2026-11-11) - M6: Windows dev host caveat - bind-mounted single files into nginx on Docker Desktop served stale content during rehearsal; all container configs baked at build time instead. Production images built on Linux runners in CI.
- D-057 (2026-11-11) - M6: test harness (global-setup.mjs) derives test DB URL from TEST_DATABASE_URL/TEST_ADMIN_DATABASE_URL; no hardcoded localhost:5433 or dev passwords in the harness.

## M7 decisions (2026-11-12)
- D-058 (2026-11-12) - M7: CVE-2026-40345 (deepmerge-ts) remediated by root package.json override `deepmerge-ts@^8.0.2` instead of accepting the exception; Prisma 6.19.3 CLI re-verified (validate + migrate deploy on scratch DB), API suite 45/45, Trivy CRITICAL/HIGH exit 0 on the API image; `.trivyignore` removed. The D-029 deferral to a Prisma 7 migration is superseded.
- D-059 (2026-11-12) - M7: Lighthouse vs axe-core divergence recorded (heading-order 1 node flagged by Lighthouse; axe-core 0 violations on all 8 pages); axe-core remains the WCAG acceptance instrument; Lighthouse retained as indicative lab signal only; hero/rooms Pexels imagery identified as the performance and third-party-cookie root cause; commissioned self-hosted photography closes P2-1..P2-4.
- D-060 (2026-11-12) - M7: release decision CONDITIONAL GO - engineering acceptance satisfactory; production readiness conditional on owner-gated items (hosting, DNS/TLS, credentials, VAT Act s.13(7) tax sign-off, monitoring, photography). A locally rehearsed staging URL was explicitly ruled insufficient for GO (docs/reports/M7.md sections 12-14).
- D-061 (2026-11-12) - M7: tax policy stays as implemented (SC 10% VAT-exclusive, levy 2%, VAT 16% on net, KES minor units) pending owner/accountant written approval; no tax-rule change may be made without that approval; TAX_AND_CHARGES.md remains binding over TAX_POLICY constants.

## M-phase+ (2026-11-12)
- D-062 (2026-11-12) - Guest ID number collection at booking: `guest.idNumber` added (nullable column, required in UI). Required for hotel guest registration in Kenya; used solely to register stays and satisfy property security obligations. Never logged; never exposed in possession-of-reference responses; visible to staff and the signed-in owner only. Not part of any marketing or analytics path. Privacy notice updated accordingly. Migration 20261112093000_guest_id_number is additive-only.
- D-063 (2026-11-12) - Kenya-only booking experience: the guest-facing flow assumes a Kenyan guest. Name fields auto-capitalize (client blur + server `capWords`, HTTP-layer enforcement, not just mobile keyboard `autoCapitalize`); phone is +254 with 9 local digits (leading 254/0 stripped on blur/submit, digits-only input); National ID number is digits-only (5-12) and is the only registration document accepted - no passport field anywhere; country is fixed to Kenya everywhere (booking + account profile, read-only). The special-requests textarea was removed from booking; guests use a WhatsApp chat row instead (`wa.me` deep link). Progress-step numerals and room-number eyebrows were removed from guest UI. Booking summary no longer carries a room photograph (text-first). Room cards/results are text-first everywhere guest-facing.
- D-064 (2026-11-12) - Lighthouse iteration 1-3 (audit -> fixes -> re-audit): added anonymous-safe `GET /api/v1/auth/session` (always 200 `{authenticated}`) used by the web client's bootstrap hydrate instead of the 401-ing `/auth/me` probe, eliminating the console error on every public page (`/auth/me` unchanged for compatibility); self-hosted preconnect for images.pexels.com; `/llms.txt` authored (H1, summary, links); font preloads removed (competed with LCP over slow 4G). Result (mobile emulation, vite preview, same machine/model as M7 12.2.1 labs): a11y 100 on all 8 pages, SEO 100, BP 100 on text pages (availability, privacy), BP 77 on image pages (remaining: Pexels `_cfuvid` third-party cookie + DevTools Cookie issues); perf 80-95 (availability 93, privacy 95, rooms 93, story 93, garden-room 83, home 82, experiences 84, dining 80). M7's `heading-order` info flag no longer reproduces. Text-page FCP ~2.0s/LCP ~2.7s and all sub-second-throttle deltas are lab artifacts; media-page LCP remains bounded by the Pexels CDN. Docker Desktop's NAT proxy adds ~1.7s FCP on Windows loopback (audits will differ on Linux/Render); not a config defect. Nothing committed; working tree awaiting owner review.
- D-065 (2026-11-12) - Lighthouse iteration 4: Pexels imagery self-hosted per owner decision - 39 photos x 5 widths ({480,768,1280,1600,1920}) downloaded into apps/web/public/photos/ (26.2 MB, Pexels free license; every file is JPEG, magic-byte verified). photoUrl/photoSrcSet now build same-origin `/photos/...` paths; srcset default normalized to the family; call sites updated (Home hero src 1920 + default srcset, RoomGallery thumb 480). `dns-prefetch`/`preconnect` for pexels removed - no third-party origins remain. `node --watch` in apps/api dev script was restart-looping on phantom node_modules mtime changes, causing intermittent 500s from the vite dev proxy (availability 500 at 10:43 UTC killed two e2e tests); scoped to `node --watch --watch-path=src`. e2e re-verified 3/3 (13.6s). Lighthouse re-run with self-hosting: see D-064 numbers plus BP 100 expected on all pages; Pexels commission or stock swap remains the P2-1/P2-3 cp.
