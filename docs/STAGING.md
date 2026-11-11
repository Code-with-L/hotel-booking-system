# Staging — The Stillhouse

**Status:** staging architecture prepared and rehearsed **on the local development host** (isolated Docker project `stillhouse-staging`). No public staging URL exists yet — until the owner commissions a host and domain, "staging" means this isolated local stack, not an internet deployment.
**M6 relationship:** `docs/reports/M6.md` records verification evidence. This doc is the operating manual.

## 1. Hosting architecture (decision)

| Tier | Quantity | Placement |
|---|---|---|
| Web (SPA + TLS termination) | 1 container | nginx, serves the built SPA, proxies `/api`, terminates TLS |
| API (Node 20+) | 1 container | stateless, horizontally scalable later (28-room property ≠ internet scale) |
| PostgreSQL 16 | 1 instance | managed in the real world (Neon/RDS/Render); local staging uses a dedicated container with a **persistent named volume** (`stillhouse_staging_data`) |
| Background jobs | in-process | hold sweeper, stale-payment requery, invoice retry, arrival reminders run inside the API (60s interval) |

No Kubernetes, no microservices, no service mesh. If the property outgrows one API container, that is a success problem — add a second container behind nginx, not an architecture rewrite.

### Options considered

| Concern | Fly.io / Railway / Render | VPS (Hetzner/Linode/DO) | Vercel + Neon | Chosen |
|---|---|---|---|---|
| PostgreSQL ≥16 native | ✓ managed add-on | ✓ self-managed (accept backup duty) | ✓ Neon managed | managed PG in production; container PG locally |
| Static SPA + API in one place | ✓ | ✓ | split across two platforms | single nginx container (single domain, same-origin, simplest CORS story) |
| Kenya latency | CDN edge helps | pick closest region (EU) + CDN | edge | CDN-fronted origin either way |
| Persistent storage | ✓ volumes | ✓ block storage | ✓ | container volume locally / managed in prod |
| Backup automation | provider PITR | self-managed (doc: `BACKUP_RESTORE.md` drill) | Neon PITR | provider PITR in prod; manual drill verified locally |
| Cost control | small plan | fixed monthly | usage-based | small fixed plan (flyctl/render ~ $5–20/mo class) |
| Deploy complexity | lowest | moderate | moderate | compose file already committed (`docker-compose.staging.yml`) |

**Decision:** single VPS or managed app host (Fly.io/Railway/Render-class) + managed PostgreSQL 16 + the committed compose stack behind TLS-terminating nginx. Everything else is a rebuild, not an evolution. Revisit only at M7+ with real traffic data.

### Trade-offs (honest)

- **Not free of ops work:** provider backups still need a restore drill (verified locally 2026-11-11; re-drill quarterly).
- **No zero-downtime story yet:** migrations are additive-only so API restarts are safe; true blue/green is unnecessary at 28 rooms.
- **Self-signed CA locally:** fine for rehearsal; browsers will warn until a real domain issues a real cert.

## 2. Environments

| Environment | Purpose | Database | TLS |
|---|---|---|---|
| development | local coding | `stillhouse-db` (:5432) + `stillhouse-db-test` tmpfs (:5433) | none |
| staging | release rehearsal, this doc | isolated project `stillhouse-staging`: `stillhouse-staging-db` (:5434, persistent volume) | self-signed local CA |
| production | NOT YET COMMISSIONED | owner-chosen managed PG | owner-chosen CA |

Staging never shares a database with development or production. Fixtures (`npm run db:seed`) load 34 fake reservations + staff demo users **only in the local rehearsal stack**; production seeds catalogue-only with explicit `SEED_*` passwords.

## 3. The local staging stack (how to bring it up/down)

```bash
# 1. Certificates (self-signed, gitignored). One-time or on expiry.
mkdir -p deploy/certs
docker run --rm -v "$PWD/deploy/certs:/certs" alpine:3 sh -c \
  "apk add --no-cache openssl && openssl req -x509 -newkey rsa:2048 \
    -keyout /certs/staging.key -out /certs/staging.crt -days 825 -nodes \
    -subj '/CN=staging.stillhouse.local' \
    -addext 'subjectAltName=DNS:staging.stillhouse.local,DNS:localhost,IP:127.0.0.1' \
    && chmod 644 /certs/staging.key /certs/staging.crt"

# 2. Secrets: copy .env.staging.example to .env.staging and fill in
#    STAGING_DB_PASSWORD, STAGING_SESSION_SECRET, STAGING_SEED_* (openssl rand -hex 32)

# 3. Bring up, in order (isolated compose project: -p stillhouse-staging)
docker compose -f docker-compose.staging.yml --env-file .env.staging -p stillhouse-staging up -d db
docker compose -f docker-compose.staging.yml --env-file .env.staging -p stillhouse-staging run --rm migrate
docker compose -f docker-compose.staging.yml --env-file .env.staging -p stillhouse-staging --profile rehearsal run --rm seed   # fixtures only
docker compose -f docker-compose.staging.yml --env-file .env.staging -p stillhouse-staging up -d api web

# 4. Verify
curl --cacert deploy/certs/staging.crt https://staging.stillhouse.local:8443/api/v1/ready
node tests/staging-acceptance.mjs   # 16/16 expected
```

- HTTP (`:8080`) answers 200 on `/healthz` for container health checks and 301 → HTTPS for everything else.
- HTTPS (`:8443`) terminates TLS and proxies `/api` to the API container.
- nginx vhost is baked into the staging image (`apps/web/nginx.staging.conf`) — no host-file bind mounts into nginx (single-file bind mounts from Windows into Linux containers serve stale content unpredictably).
- Production image uses `apps/web/nginx.conf` unchanged (build-time `ARG NGINX_CONF`).

## 4. Deploy procedure (when a host exists)

1. `git tag vX.Y.Z && git push --tags`
2. On the host: pull repo at tag, `docker compose -f docker-compose.staging.yml --env-file .env.staging -p stillhouse-staging pull` (registry images) or `up -d --build`.
3. Apply migrations **before** rolling the API: `... run --rm migrate` (additive-only; never destructive).
4. `up -d api web`; poll `GET /api/v1/ready` until `{"ok":true,"db":"up"}`.
5. Smoke: `node tests/staging-acceptance.mjs` against the staging URL (adapt `BASE` in the file or via env).
6. Rollback: redeploy previous image tag. **Migrations are additive-only — app rollback never reverses a migration.** Destructive rollback = restore from backup (`docs/BACKUP_RESTORE.md`).

## 5. Commissioning checklist for the owner (to make staging public)

- [ ] Choose host (recommended: Fly.io app or small VPS in EU closest to Kenya) + managed PostgreSQL 16 with automated backups + PITR.
- [ ] Choose staging domain (e.g. `staging.thestillhouse.co.ke`) and point DNS A/AAAA at the host.
- [ ] Issue TLS cert (Let's Encrypt / provider CA) for the staging domain; replace `deploy/certs/staging.crt` with the real chain (or use provider TLS in front of the container).
- [ ] Set DNS-propagation check (`dig A staging.domain`) — readiness gate before smoke tests.
- [ ] Create `.env.staging` on the host (secret manager or mode-600 file): `STAGING_DB_PASSWORD`, `STAGING_SESSION_SECRET`, `STAGING_WEB_ORIGIN=https://staging.domain`, integrations: Daraja sandbox creds if verifying payments, SMTP if verifying email, `ETIMS_ENVIRONMENT=disabled` (never mock outside certification).
- [ ] Boot-time guard check: `NODE_ENV=production node apps/api/src/server.js` with placeholders must exit with the clear "Unsafe production configuration" error.
- [ ] `docker compose ... up -d`; verify end-to-end TLS: cert chain, HTTPS redirect, secure cookie (`Secure; HttpOnly; SameSite=Lax`), CORS allowlist matches `WEB_ORIGIN`.
- [ ] Run `tests/staging-acceptance.mjs` against the public staging URL; archive output.
- [ ] Backup drill on staging: `pg_dump` → drop scratch → `pg_restore` → verify counts (see `docs/BACKUP_RESTORE.md`).
- [ ] Monitoring: point an uptime probe at `https://staging.domain/api/v1/ready` (30s interval, alert on 2 consecutive failures).

## 6. Secrets & credential commissioning

All credentials are owner-held. Nothing below enters Git.

**Daraja** (M-Pesa): Consumer Key, Consumer Secret, Shortcode, Passkey, Callback URL (`https://<domain>/api/v1/webhooks/mpesa`), `MPESA_ENV=sandbox` → `production` only after sandbox verification. See `docs/ACTIVATE_MPESA.md`.

**eTIMS**: KRA sandbox registration, OSCU device credentials, `ETIMS_SALES_INVOICE_PATH` from the registered spec. See `docs/ACTIVATE_ETIMS.md`. Never enable issuance before KRA certification.

**SMTP**: provider + sender identity (SPF/DKIM/DMARC recommended before real guest mail). See `docs/ACTIVATE_EMAIL.md`.

**Application**: `DATABASE_URL`, `SESSION_SECRET` (≥32 random bytes), `WEB_ORIGIN` (https, slotted CORS allowlist), `COOKIE_SECURE=true`, `TRUST_PROXY` matching the actual proxy hop count (1 behind nginx/ALB).

**Never paste secrets into chat, Git, or docs.** Use the host's secret store or GitHub Actions secrets (`STAGING_*`).

## 7. Monitoring

- **Uptime**: probe `/api/v1/ready` (independent of session auth by design — M5 fix), 30s interval, 2 consecutive failures → page.
- **Errors**: pino logs to stdout → container logs; forward to provider aggregator or a Loki/vector shipper. Alert on 5xx rate > 2% over 5 min.
- **Payments**: alert on failed webhook processing count spike; monitor `email_outbox` `failed` count.
- **Jobs**: sweeper errors log at error level; alert on any `"sweeper failed"` burst.
- **Backups**: alert if the last successful backup > 26h old (provider PITR or a cron'd `pg_dump` + off-host copy).
- **Disk**: container volume at > 80% → alert.
- **Cert expiry**: probe TLS cert expiry; alert at 30/14/7 days.

No monitoring SaaS has been purchased; everything above works with any free-tier uptime service or the host's built-in monitoring.

## 8. Backup & restore

Drill verified locally 2026-11-11: `pg_dump -Fc` of the populated staging DB → dropped → `pg_restore` into scratch → row counts match (reservations 35, allocations 34, payments 31, audit_log 5) and `room_allocation_no_overlap` constraint present. Evidence: `m6-rehearsal/backup-ok.json`, `m6-rehearsal/restore-ok.json` (local artifact). Cadence: daily provider backup + quarterly restore drill + before/after every migration release.
