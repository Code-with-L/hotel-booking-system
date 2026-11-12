# Build Plan - The Stillhouse

**Status:** Approved direction at M0 (2026-11-11). Milestone gates are mandatory. M7 complete (2026-11-12) — final engineering acceptance done; CONDITIONAL GO; production owner-gated; see `docs/reports/M7.md` and `docs/FINAL_ACCEPTANCE.md`.

## Working agreements
- Small, reviewable commits; each commit compiles/passes tests for what it touches.
- Tests before "done": unit (Vitest) → integration (API) → e2e (Playwright booking flow).
- No fake success responses. No placeholder payment confirmations. No secrets in git.
- `docs/` is the source of truth; keep it current and never silently expand scope.
- The backend adapts to the frontend — never force-fit the frontend.
- No milestone begins while critical acceptance tests of earlier milestones fail.

## M2 stage detail (all 2026-11-11)
- **M2-A Daraja readiness ✅** STK push/callback/query implemented; request payload verified against mocked HTTP (base64 password construction asserted); requery sweeper for lost callbacks; reconciliation endpoint; IP allowlist; logs redact. Activation: `ACTIVATE_MPESA.md`. **Not live-verified — sandbox required.**
- **M2-B Transactional email ✅** Branded HTML/text templates; persistent outbox with (template, reference) dedupe; SMTP (any provider) or silent skip; booking confirmation, payment received, cancellation, password reset, admin new-booking alerts. Activation: `ACTIVATE_EMAIL.md`.
- **M2-C Tax & eTIMS readiness ✅ (design + partial implementation; KRA certification owner-gated)** `TaxInvoice` model, provider boundary (`Mock` for tests / `OscU` for KRA / `disabled`), retry sweeper, receipt series, audit trail; no fabricated wire formats; not compliant until certified. Activation: `ACTIVATE_ETIMS.md`.
- **M2-D Security hardening ✅** Boot-time production config guards; RBAC verified; seed now prod-safe (catalogue-only without explicit passwords); rate-limit bypass scoped to webhooks/health; session sweep; structured logs with redaction; findings + residuals: `SECURITY_REVIEW.md`.
- **M2-E Performance & reliability ✅** N+1 eliminated (5.7× availability throughput, measured); indexes verified sufficient at this scale; `/api/v1/ready`; graceful shutdown + connection drain; vendor bundle split; `PERFORMANCE.md`.
- **M2-F Production deployment architecture ✅** Non-root API image; nginx SPA image with CSP + security headers; `docker-compose.prod.yml` reference; migration-on-release; rollback = redeploy previous tag (additive-only migrations); monitoring guidance; `DEPLOYMENT.md`; **backup restore drill performed** (`BACKUP_RESTORE.md`).
- **M2-G Operational readiness ✅** Staff runbook (daily flow, desk settlement, reconciliation, refunds, blocks, rates, exits): `OPERATIONS.md`.

Note: frontend design unchanged throughout M2 (design system intact; only service plumbing, loading states and small copy edits where functionality demanded).

### M0 — Product specification ✅ (2026-11-11)
Blueprint approved; repo flattened; docs committed.

### M1 — frontend + backend + integration ✅ (2026-11-11)
the frontend accepted into `apps/web/`; Express/Prisma/PostgreSQL backend; allocation-ledger reservation engine; auth/RBAC; M-Pesa boundary + desk settlement; admin operations; API 17/17; e2e 3/3. Deviations per D-021…D-029 (Vite 6.4.6; Daraja deferred to owner registration; email deferred until M2; eTIMS deferred; booking fixtures dev-only).

### M2 — Production readiness ✅ (2026-11-11, this milestone)
Stages M2-A…M2-G above. Backend 20/20; e2e 3/3; both Docker images build; backup restore drill verified; measurement-backed performance work; all activation steps owner-gated and documented.

### M3 - Experience refinement ✓ (2026-11-11)
Visual pass on the guest-facing experience (motion, navigation, mobile); no redesign. Regression: API 20/20, e2e 3/3, build clean. See `docs/M3_VISUAL_REVIEW.md`.

### M4 - Administrative Operations ✓ (2026-11-11, this milestone)
Full operational maturity for the people who run the hotel: live dashboard (needs action, confirmed, payments summary, outstanding, cancellations 30d, occupancy/revenue), reservation workflow with paid-status badges and itemised pricing drawers (confirmed/cancel check-in/check-out with compare-and-swap transitions and audit in one tx), room + rate management with a hard no-override maintenance guard (409 + blocking references), room allocation history, guest CRM operational notes (audit-written), manager-only financial overview, receptionist+ history endpoint, audit-failure atomicity, concurrency hardening of allocation (`FOR UPDATE` + jittered backoff), and the M4 decision log. Backend 31/31 (8 consecutive clean runs), e2e 3/3, build clean, Docker Dockerfile set unchanged (verified M2). See `docs/reports/M4.md` and DECISIONS M4 block (D-035..D-040).

### M5 - External integrations & release readiness ✓ (2026-11-11, this milestone)
Daraja token cache + single-flight refresh + truthful 502/503 failure mapping; terminal-state callback idempotency with contradiction logging; new manager-only `GET /admin/reports/payment-health` (duplicate refs, amount mismatches, overpayments, cancelled-with-capture, stale pendings, invoice failures, attempt/payment total cross-check) and read-only eTIMS invoice history (`GET /admin/etims/invoices` + admin panel); transactional email extended (`paymentFailed`, `arrivalReminder` + afterFailed hooks); readiness probe bypass of session loading with 503 mapping (found by rehearsal); guest-detail PII minimization; WCAG AA contrast fixes (tokens only); self-hosted fonts, meta description, robots.txt, favicon. Tests: API 45/45, e2e 3/3, rehearsal 20/20, axe 0 violations, Lighthouse SEO 1.0. See `docs/reports/M5.md` and D-041..D-049.

### M6 - Staging deployment & operational commissioning ✓ (2026-11-11, this milestone)
Isolated local staging stack (Docker project `stillhouse-staging`) with production-equivalent images, TLS via local CA, persistent PG16 volume, loopback-only exposure; GitHub Actions CI/CD (verify job enforces API tests on PG16 + build + e2e + image build + Trivy scan; staging deploy is manual + owner-gated); production boot-guard verified; `docs/STAGING.md`, `docs/RELEASE_CHECKLIST.md` staging section, `docs/reports/M6.md`; rehearsal evidence: acceptance 16/16 over real HTTPS, backup+restore drill with exclusion constraint verified, restart/DB-outage/boot-guard drills. **No public URL, domain, DNS, or provider verification yet — owner-gated (M7).** See `docs/reports/M6.md` and `docs/STAGING.md`.

### M7 - Final release acceptance & go/no-go ✓ (2026-11-12, this milestone)
Independent acceptance re-verified without rebuilding M1-M6: guest/staff/management journeys, live probes P1-P14 over staging HTTPS (15/15), DB constraint verification via psql (exclusion constraint, CHECKs, UNIQUE idempotency keys), concurrency re-verified (5×201/2×409 twice; S16 1 winner/4 conflicts), security probes (auth matrix, rate-limit 429 live, CORS, cookies, webhook contract), `npm audit --omit=dev` = 0, CVE-2026-40345 **remediated** (root override `deepmerge-ts@^8.0.2`; Trivy CRITICAL/HIGH exit 0; `.trivyignore` exception removed), quote math verified live to the cent, axe 0/8 pages, Lighthouse lab: perf 58 / a11y 98 / BP 75 / SEO 100 / CLS 0 (indicative, loopback). Report: `docs/reports/M7.md`; concise reference: `docs/FINAL_ACCEPTANCE.md`. **Decision: CONDITIONAL GO — engineering acceptance satisfactory; production remains owner-gated** (hosting/domain/DNS/TLS, credentials, tax sign-off, monitoring, photography). See `docs/reports/M7.md` §12-14.

### Post-M7 (owner's call — in order)
**Commissioning sequence (owner-held):** host + managed PG16 (PITR) → domain + DNS + TLS → host secrets → tax sign-off → M-Pesa sandbox E2E → SMTP deliverability → (eTIMS track if fiscal in scope) → monitoring + runbook walkthrough → photography → production decision. Full checklist: `docs/FINAL_ACCEPTANCE.md` and `docs/reports/M7.md` §13.

## Open risks (register)
- R1 — frontend output quality/deviation: mitigated by the staging gate; mitigated by the staged gate; rejection criteria were pre-agreed.
- R2 — Tax/levy correctness: provisional policy implemented (SC 10%, levy 2%, VAT 16% net). Owner/accountant sign-off still required before real launch (TAX_AND_CHARGES.md §4).
- R3 — M-Pesa Daraja sandbox vs Go-Live credential lead time: registration should start now (ACTIVATE_MPESA.md), not after launch.
- R4 — Stock imagery licensing: current photography cannot ship publicly; commission or license before the site goes live.
- R5 — eTIMS: required for a real Kenyan trading property; not certified yet — decide launch scope accordingly (ACTIVATE_ETIMS.md).
- R6 — Scope creep via frontend: frontend may invent routes/features; FRONTEND_MAP.md is the acceptance baseline.
