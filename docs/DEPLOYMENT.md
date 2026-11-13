# Deployment — The Stillhouse

**Status (2026-11-13):** The system is LIVE at `https://hotel-booking-system-jet-gamma.vercel.app` (Vercel, project web + API + Neon PostgreSQL eu-central-1). M8/M10 are deployed (`main` @ `159b970` includes security headers; M-Pesa remains sandbox). The production database has NOT yet been migrated to the M10 financial-integrity schema — that action requires owner authorization (see `docs/FINAL_PRODUCTION_COMMISSIONING_REPORT.md`). Do not confuse "deployed" with "launched": business readiness gates remain with the owner.

**History:** Prepared at M2-F (2026-11-11). Supersedes the stale pre-deployment note below.

## 1. Recommended production shape

| Concern | Recommendation |
|---|---|
| Static web (Vite SPA) | Any static CDN/host: Vercel, Netlify, Cloudflare Pages, or nginx container in front of the API |
| API (Node 20+) | Container host: Fly.io, Railway, Render, or a small VPS (≥ 1 vCPU, 1 GB RAM is ample at this scale) |
| PostgreSQL | **Managed** (Neon, AWS RDS, Render Postgres, Supabase) — automated backups + point-in-time recovery included. Do not self-host the production database |
| Object/photo storage | CDN bucket for commissioned photography (Cloudflare R2/S3-class) |
| Email | SMTP via any provider (Mailgun, Postmark, SES, even the hotel's own mail server) |
| Monitoring | Uptime probe on `https://api-host/api/v1/ready` + error-tracking (Sentry or similar) + log drain |
| Inbound TLS | Platform or CDN terminates TLS (Let's Encrypt) — never expose plain HTTP |

Capacity planning note: The Stillhouse is a **28-room single property**. One small API node + one managed Postgres instance comfortably serves the entire booking workload with large headroom. Do not build for scale you will not need.

## 2. Environments

| Env | Purpose | Credentials |
|---|---|---|
| development | Local (`docker compose db db_test`) | Dev-only defaults in `.env` (gitignored) |
| staging | Optional pre-production rehearsal | Staging secrets, mirror of prod wiring |
| production | Live hotel | Real secrets, injected via platform secret store |

Production boot now **refuses to start** on unsafe config (M2-D): missing/weak `SESSION_SECRET`, `COOKIE_SECURE≠true`, or non-HTTPS `WEB_ORIGIN` → process exits with a clear error. That is intentional — fix the environment, not the guard.

## 3. Environment variables (full table)

Never commit values. Names only in `.env.example`. Secrets marked 🔒.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | 🔒 yes | Managed Postgres connection string; app role must be non-DDL |
| `SESSION_SECRET` | 🔒 yes | ≥ 32 random bytes; read once at application startup (production boot guard only) — **never used to sign or verify cookies or sessions**; the session cookie (`stillhouse_session`) is unsigned and the server stores only a SHA-256 hash of an opaque random token in the `session` table. Changing `SESSION_SECRET` does **not** invalidate existing sessions |
| `PORT` / `WEB_ORIGIN` / `FRONTEND_BASE_URL` / `TRUST_PROXY` | yes | `TRUST_PROXY=1` behind one proxy hop (default) |
| `COOKIE_SECURE` | yes | Must be `true` in production (enforced) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | no | Defaults: 15m, 300, 10 |
| `MPESA_ENV` / `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` | 🔒 conditional | `disabled` until registered; then `sandbox` → verify → `production` |
| `MPESA_SHORTCODE` / `MPESA_PASSKEY` / `MPESA_CALLBACK_URL` | 🔒 conditional | Till/paybill + passkey from Daraja; callback must be public HTTPS and not contain "mpesa"/"safaricom" |
| `MPESA_WEBHOOK_ALLOWED_IPS` | no | Comma-separated allowlist for Daraja callback IPs (defence in depth; Daraja publishes these in the Getting Started guide) |
| `EMAIL_PROVIDER` (=`smtp`) / `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` / `EMAIL_SMTP_SECURE` / `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASS` / `EMAIL_FROM` | 🔒 conditional | Without SMTP, booking still works; emails record as `skipped` in `email_outbox` |
| `ADMIN_NOTIFICATION_EMAIL` | no | Reception team inbox for new-booking alerts |
| `ETIMS_ENVIRONMENT` (`disabled`/`sandbox`/`production`/`mock`) | conditional | Real OSCU activation is owner-gated (see ACTIVATE_ETIMS.md); `mock` is dev-only |
| `ETIMS_TIN` / `ETIMS_BRANCH_ID` / `ETIMS_DEVICE_SERIAL` / `ETIMS_BASE_URL` / `ETIMS_COMMUNICATION_KEY` / `ETIMS_SALES_INVOICE_PATH` | 🔒 conditional | All issued by KRA after device service approval |
| `LOG_LEVEL` | no | `info` in production; `debug` only temporarily |
| `SEED_*` (admin/manager/guest passwords) | 🔒 conditional | Required for production seeding of staff users; **without them, production seed creates catalogue only and no users** |

## 4. Release procedure

1. `git tag vX.Y.Z` on main; CI (optional) runs: `npx playwright test` (dev) + `npm test --workspace=@stillhouse/api`.
2. Build images: `docker build -f apps/api/Dockerfile -t hotel-booking-system-api:vX.Y.Z .` (same for web).
3. Apply migrations **before** rolling the API: `npx prisma migrate deploy` (or the `migrate` service in `docker-compose.prod.yml`).
4. Deploy web (static) and API; verify `GET /api/v1/ready` → `{ ok: true, db: "up" }`.
5. Smoke: create a test reservation (cancel immediately); check admin dashboard loads; check audit log records the event.
6. Rollback: redeploy previous tag; migrations are additive-only (M2 added columns/tables: `email_outbox`, `tax_invoice`, unique index). Destructive rollbacks = restore from backup (see BACKUP_RESTORE.md).

## 5. Backups & restore

**Tested 2026-11-11:** `pg_dump --format=custom` of the dev database restored into a scratch database with row counts verified (28 rooms / 12 rate cards / 34 reservations / allocation ledger intact). See `BACKUP_RESTORE.md` for the exact drill and cadence.

Production: rely on **managed provider snapshots/PITR** as primary; optional `pg_dump` cron to object storage as a secondary copy. Restore drills quarterly (pick a random backup, restore to scratch, verify counts + a booking lookup).

## 6. Security headers & TLS

The web nginx vhost (`apps/web/nginx.conf`) sets: CSP (self + Google Fonts + images), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, 30-day immutable caching for fingerprinted assets. TLS is terminated in front (CDN/proxy). The API sets helmet headers; HSTS belongs to the TLS terminator.

## 7. Monitoring & alerting

- Ping `/api/v1/ready` every 60s (UptimeRobot/Healthchecks.io — free tier suffices for one property).
- Alert on: ready=false > 2 consecutive, 5xx rate > 1%, disk > 80%, certificate expiry < 14 days.
- Logs: pino JSON lines to stdout → platform drain. Query by `req.id` for request tracing. No bodies logged by design.
- Daily: skim `/admin/audit-log` and `email_outbox` failures (status='failed').

## 8. Image sizes / builds

`hotel-booking-system-api` ≈ 160 MB (node:22-alpine + prod deps). `hotel-booking-system-web` ≈ 25 MB (nginx + static dist). Build contexts use `.dockerignore` (node_modules, dist, .env excluded).

## 9. What is deliberately NOT in the repo

- No cloud account/project files. No Terraform yet (owner's call after hosting pick).
- No CI/CD pipeline file — add `.github/workflows/ci.yml` (build + tests on PR) when ready; keep deploy manual until the first production rehearsal passes.
