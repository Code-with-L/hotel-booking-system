# Build Plan — The Stillhouse

**Status:** Approved direction at M0 (2026-11-11). Milestone gates are mandatory.

## Working agreements
- Small, reviewable commits; each commit compiles/passes tests for what it touches.
- Tests before "done": unit (Vitest) → integration (API) → e2e (Playwright booking flow).
- No fake success responses. No placeholder payment confirmations. No secrets in git.
- `docs/` is the source of truth; AI assistants read it first and never silently expand scope.
- The backend adapts to the accepted Arena frontend — never force-fit the frontend.
- No milestone begins while critical acceptance tests of earlier milestones fail.

## M2 stage detail (all 2026-11-11)
- **M2-A Daraja readiness ✅** STK push/callback/query implemented; request payload verified against mocked HTTP (base64 password construction asserted); requery sweeper for lost callbacks; reconciliation endpoint; IP allowlist; logs redact. Activation: `ACTIVATE_MPESA.md`. **Not live-verified — sandbox required.**
- **M2-B Transactional email ✅** Branded HTML/text templates; persistent outbox with (template, reference) dedupe; SMTP (any provider) or silent skip; booking confirmation, payment received, cancellation, password reset, admin new-booking alerts. Activation: `ACTIVATE_EMAIL.md`.
- **M2-C Tax & eTIMS readiness ✅ (design + partial implementation; KRA certification owner-gated)** `TaxInvoice` model, provider boundary (`Mock` for tests / `OscU` for KRA / `disabled`), retry sweeper, receipt series, audit trail; no fabricated wire formats; not compliant until certified. Activation: `ACTIVATE_ETIMS.md`.
- **M2-D Security hardening ✅** Boot-time production config guards; RBAC verified; seed now prod-safe (catalogue-only without explicit passwords); rate-limit bypass scoped to webhooks/health; session sweep; structured logs with redaction; findings + residuals: `SECURITY_REVIEW.md`.
- **M2-E Performance & reliability ✅** N+1 eliminated (5.7× availability throughput, measured); indexes verified sufficient at this scale; `/api/v1/ready`; graceful shutdown + connection drain; vendor bundle split; `PERFORMANCE.md`.
- **M2-F Production deployment architecture ✅** Non-root API image; nginx SPA image with CSP + security headers; `docker-compose.prod.yml` reference; migration-on-release; rollback = redeploy previous tag (additive-only migrations); monitoring guidance; `DEPLOYMENT.md`; **backup restore drill performed** (`BACKUP_RESTORE.md`).
- **M2-G Operational readiness ✅** Staff runbook (daily flow, desk settlement, reconciliation, refunds, blocks, rates, exits): `OPERATIONS.md`.

Note: frontend design unchanged throughout M2 (Arena system intact; only service plumbing, loading states and small copy edits where functionality demanded).

### M0 — Product specification ✅ (2026-11-11)
Blueprint approved; repo flattened; docs committed.

### M1 — Arena frontend + backend + integration ✅ (2026-11-11)
Arena export accepted into `apps/web/`; Express/Prisma/PostgreSQL backend; allocation-ledger reservation engine; auth/RBAC; M-Pesa boundary + desk settlement; admin operations; API 17/17; e2e 3/3. Deviations per D-021…D-029 (Vite 6.4.6; Daraja deferred to owner registration; email deferred until M2; eTIMS deferred; booking fixtures dev-only).

### M2 — Production readiness ✅ (2026-11-11, this milestone)
Stages M2-A…M2-G above. Backend 20/20; e2e 3/3; both Docker images build; backup restore drill verified; measurement-backed performance work; all activation steps owner-gated and documented.

### M3+ (renumbered)
Remaining scope is the owner's call: pricing/tax sign-off, live Daraja registration, eTIMS certification (or explicit decision to defer paid launch until certified), photography commission, final release rehearsal, and M7-style release candidate review.

## Open risks (register)
- R1 — Arena output quality/deviation: mitigated by the staging gate; rejection criteria pre-agreed (HANDOFF_CHECKLIST §1–5).
- R2 — Tax/levy correctness: provisional policy implemented (SC 10%, levy 2%, VAT 16% net). Owner/accountant sign-off still required before real launch (TAX_AND_CHARGES.md §4).
- R3 — M-Pesa Daraja sandbox vs Go-Live credential lead time: registration should start now (ACTIVATE_MPESA.md), not after launch.
- R4 — Stock imagery licensing: current photography cannot ship publicly; commission or license before the site goes live.
- R5 — eTIMS: required for a real Kenyan trading property; not certified yet — decide launch scope accordingly (ACTIVATE_ETIMS.md).
- R6 — Scope creep via Arena: Arena may invent routes/features; FRONTEND_MAP.md is the acceptance baseline.
