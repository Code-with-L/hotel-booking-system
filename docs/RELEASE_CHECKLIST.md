# Release Candidate Checklist — The Stillhouse

Use this checklist before any staging or production promotion. It is designed to be run top-to-bottom.
Nothing here authorises an actual production deployment or spend against real infrastructure — that decision is the owner's.

## D-staging (M6) — pre-launch rehearsal evidence (local)

- [x] `tests/staging-acceptance.mjs` → 16/16 PASS against the local isolated stack over real HTTPS (self-signed CA).
- [x] Backup drill: pg_dump → drop scratch → pg_restore → row counts match; `room_allocation_no_overlap` verified present.
- [x] Restart drills: API and web restart; `/ready` recovered; container health probes green.
- [x] Outage drill: `docker stop` db → `/ready` 503 → `docker start` → 200.
- [x] Boot-guard: image refuses to start with missing `SESSION_SECRET`.
- [ ] Public staging URL, DNS, TLS (owner-gated) — see `docs/STAGING.md` §5.
- [ ] Provider verification (owner-gated) — see `docs/ACTIVATE_*.md`.

## A. Pre-flight (repository)

- [ ] `git status` clean; working tree matches `origin/main` HEAD.
- [ ] `npm install` from a fresh clone succeeds (Node ≥ 20).
- [ ] `npm run build` completes without warnings that block shipping.
- [ ] `npm test --workspace=@stillhouse/api` → **45/45**.
- [ ] `npx playwright test` → **3/3**.
- [ ] `node tests/release-rehearsal.mjs` → **20/20** (isolated `stillhouse_test` DB; never touches production data).
- [ ] `node tests/accessibility.mjs` → 0 violations (axe-core, WCAG 2.1 A/AA).
- [ ] `npm audit` reviewed; known residuals documented in `docs/SECURITY_REVIEW.md`.

## B. Configuration (staging/production)

- [ ] `.env` derived from `.env.example`; **no** secrets committed; `.gitignore` covers `.env`.
- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true`, `WEB_ORIGIN` is the real **https** origin, `SESSION_SECRET` ≥ 32 random bytes (boot refuses otherwise — verified in M2-D).
- [ ] `TRUST_PROXY=1` matches the actual reverse-proxy hop count (nginx/ALB = 1).
- [ ] Database: managed PostgreSQL 16 (non-DDL app role); `DATABASE_URL` uses TLS; connection limits sized for the pool (pg `max: 10`).
- [ ] Migrations: `npx prisma migrate deploy` runs as a release step **before** traffic shifts (never on app boot).
- [ ] Production seed: catalogue-only (hotel, rooms, rate plans) **plus** staff users only via explicit `SEED_*` variables; dev fixtures never seeded in production.
- [ ] Health checks wired: `GET /api/v1/ready` → 200 only when PostgreSQL answers (bypasses auth by design — orchestrators must always reach it).
- [ ] Background jobs: the API process runs the hold/payment/invoice/arrival-reminder sweepers in-process (60s interval). For multi-instance deployments, run sweepers on **one** instance only (leader election or a sidecar) — see `docs/DEPLOYMENT.md`.

## C. Integrations (owner-gated)

- [ ] **M-Pesa Daraja**: sandbox first — `MPESA_ENV=sandbox` with Daraja credentials; verify STK push → callback flips a test reservation to `confirmed`; replay is a no-op; then production keys after Safaricom certification. Never use sample keys. Activation: `docs/ACTIVATE_MPESA.md`.
- [ ] **eTIMS (KRA)**: OSCU device activation with KRA → `ETIMS_*` from the registered spec → sandbox sales invoices issued and accepted → only then production. Nothing in this repo fabricates KRA wire formats; `ACTIVATE_ETIMS.md` remains binding.
- [ ] **Email**: real SMTP credentials (`EMAIL_PROVIDER=smtp`, `EMAIL_SMTP_*`, `EMAIL_FROM`); verify one test mailbox receives `bookingConfirmation`; verify failure path (bad SMTP host) leaves the reservation unaffected and the outbox row marked `failed`.
- [ ] **Tax sign-off**: owner/accountant approves SC/levy/VAT policy in `TAX_AND_CHARGES.md` before any real funds flow.

## D. Release rehearsal (must pass on staging or isolated equivalent)

- [ ] `node tests/release-rehearsal.mjs` → 20/20, including the DB-interruption probe.
- [ ] Guest journey walked manually on staging: availability → quote → hold → (simulated) desk settlement → confirmed → check-in → check-out.
- [ ] Audit log contains the full lifecycle for the rehearsal reservation.
- [ ] Financial summary reflects the settled reservation; outstanding excludes it.
- [ ] Backups: a fresh `pg_dump -Fc` taken; restore drilled on a scratch database (`docs/BACKUP_RESTORE.md`).

## E. Rollback

- [ ] Previous release tag identified; rollback = redeploy previous tag (migrations are additive-only; no destructive changes in any release).
- [ ] If a migration must be reversed, restore from the pre-release backup (tested in M2 drill).
- [ ] Feature flags: none used; no runtime kill-switches besides integration 503s (`MPESA_NOT_CONFIGURED`, `EMAIL` skipped, eTIMS `skipped`).

## F. Launch-day checks

- [ ] DNS/TLS live; HSTS on; CSP reported via nginx; cookies `Secure; HttpOnly; SameSite=Lax`.
- [ ] Logs flowing; alerting on 5xx rate; uptime probe on `/api/v1/ready`.
- [ ] First real reservation executed end-to-end and verified in the audit log + M-Pesa statement match.
- [ ] Owner has the runbook (`docs/OPERATIONS.md`) and rollback contact.

## Honest status block (current truth at M7, 2026-11-12)

Reproduce this block at any real release; never pre-fill it optimistically.

- What is live vs simulated: **no payments are live.** M-Pesa is simulated (desk settlement / mocked callbacks); no real money has moved. Emails: recorded in `email_outbox` (no real SMTP). eTIMS invoices: mock series only; **zero fiscal invoices issued**. The only environment exercised is the local isolated staging stack (`https://staging.stillhouse.local:8443`, self-signed) — **no public deployment exists.**
- Daraja environment: **not configured** (`MPESA_ENV=disabled`); API returns 503 `MPESA_NOT_CONFIGURED` by design.
- eTIMS status: **disabled** (`ETIMS_ENVIRONMENT=disabled`); adapter tested with mocks only; not KRA-certified.
- Engineering gate: CI green on `main` (Verify: 15/15, incl. e2e 3/3 + Trivy CRITICAL/HIGH clean on both images); API 45/45; rehearsal 20/20; axe 0/8; staging acceptance 16/16; M7 probes 15/15. Decision: **CONDITIONAL GO** (`docs/reports/M7.md` §14) — production blocked on §13 owner actions (hosting, domain/TLS, credentials, tax sign-off, monitoring).
- Who verified: engineering acceptance, 2026-11-12. Live end-to-end guest verification **not possible** (no public URL; no provider credentials).
