# THE STILLHOUSE — Phase 1A: Render Staging Provisioning (Pre-flight)

**Prepared:** 2026-11-12 · **Baseline:** `main` @ `cee2a11` · **Status:** Documentation only. **Nothing provisioned.** Leon's explicit authorization is required before any Render action.
**Decisions underpinning this doc (owner, not engineering):** Render hosting · Render-native Docker builds from in-repo Dockerfiles · Render Managed PostgreSQL 16 (PITR) · staging domain `staging.thestillhouse.co.ke` · production (`thestillhouse.co.ke`) reserved · Postmark + UptimeRobot Free (pending owner approval).
**Verified sources (fetched 2026-11-12):** Render Docker deploys (`render.com/docs/docker`), Web Services & port binding (`render.com/docs/web-services` + `render.com/docs/private-network`), Postgres docs (`render.com/docs/postgresql`, `…/postgresql-backups`). Prices cited in `docs/COMMISSIONING.md` §0.1 remain unchanged.

## 1. Render-native compatibility check (verified)

- Render **builds Dockerfiles natively** (BuildKit) with zero extra config; Dockerfile path is relative to repo root (`apps/api/Dockerfile`, `apps/web/Dockerfile` — both exist and build clean).
- Services must bind host `0.0.0.0` and listen on **default port 10000**, or a different port, which Render usually auto-detects (override with env `PORT` if detection fails); reserved ports: `18012`, `18013`, `19099` — none of our services use them.
- Static sites are **not** on a private network. Our SPA must stay same-origin via the **web service** (nginx proxy) — preserved architecture.
- Health checks: services report healthy via an HTTP path — our `/api/v1/ready` (API) and `/healthz` (web) already exist.
- Zero-downtime deploys & instant rollback: supported per docs.
- Private networking requires: same workspace + same region. Region choice cascades to latency (Frankfurt recommended; no Africa region on Render).

**Determinism decision (documented):** nginx vhost currently `listen 8080`. Render prefers port `10000`. Two viable paths — (a) rely on auto-detect of 8080 (documented as "usually works"), or (b) create one new repo file `apps/web/nginx.render.conf` that listens on `10000` (a build-arg `NGINX_CONF=nginx.render.conf` mirrors our staging pattern, same mechanism as `nginx.staging.conf`, **zero code change**, one new vhost). **Proposed: (b)** for determinism; (a) acceptable if owner declines a new file.

## 2. Exact Render service configuration

Region: **Frankfurt** (EU closest to Kenya; 180 ms-ish RTT; verify from Kenya before launch). Workspace: your private project `thestillhouse` (fresh, isolated).

### 2.1 `stillhouse-web` — Web Service (public)

| Field | Value |
|---|---|
| Service type | **Web Service** |
| Language | **Docker** |
| Dockerfile Path | `apps/web/Dockerfile` (relative to repo root) |
| Build Context | repository root (default) |
| Region | Frankfurt |
| Branch | `main` |
| Compute plan | `1c-2g` ($25/mo) — or `0.5c-512mb` ($7/mo) if owner accepts lighter spec; confirm at provision |
| Environment variables | `NODE_ENV=production`, `NGINX_CONF=nginx.render.conf` (path variant; if option (a) chosen, use default `nginx.conf`) |
| Health check path | `/healthz` |
| Auto-deploy | Manual or Branch auto — owner's call; recommend Manual until first public launch rehearsal |
| Custom domain | `staging.thestillhouse.co.ke` (after DNS) |
| Max deploy time | default |

Runtime behavior: nginx binds `0.0.0.0:(vhost port)`, serves `dist/` at `/`, proxies `/api/` to `http://<api internal addr>:4000`. The proxy target **must switch from `http://api:4000` to the Render private internal address** (§4). **One-line vhost change required**: `apps/web/nginx.render.conf` (new file) or edit `nginx.conf` (owner approval).

### 2.2 `stillhouse-api` — Private Service (not public internet)

| Field | Value |
|---|---|
| Service type | **Private Service** |
| Language | **Docker** |
| Dockerfile Path | `apps/api/Dockerfile` |
| Build Context | repository root |
| Region | Frankfurt (must match web + db) |
| Branch | `main` |
| Compute plan | `1c-2g` ($25/mo) or `0.5c-512mb` ($7/mo) — confirm gate decision |
| Environment variables | full matrix, §6 |
| Health check path | `/api/v1/ready` |
| Auto-deploy | Manual |

Notes: private service = invisible from the public internet; `/ready` only via web service nginx proxy for external uptime checks (UptimeRobot → `/ready` via nginx to the private service). **Daraja callback never needs the private service's address** — it reaches the API through nginx on the public origin.

### 2.3 `stillhouse-db` — Render PostgreSQL 16

| Field | Value |
|---|---|
| Type | Render PostgreSQL (managed) — compute plan `0.5c-1g` ($19/mo) minimum for paid PITR |
| Version | 16 |
| Region | Frankfurt |
| Private networking | default (internal only; no public port) |
| Backups | daily (paid) + PITR continuous — **Hobby 3-day window, Pro 7-day** — owner's workspace-plan decision |
| Logical exports | retained 7 days; weekly `pg_dump` optional offsite |
| Credentials | Render-generated; **separate non-DDL app role** created once after provision (see §5) |

## 3. Private networking & nginx upstream (documented)

Render services in the same workspace + same region share a private network. **Internal addresses** (visible under *Connect → Internal* in dashboard) are of the form `<service-name>-<id>:port` (example shown in docs: `elastic-qeqj:9200`). Attaching `http://` prefix is allowed. **Hostname-based**, never IP — IPs change on deploy.

- `stillhouse-api` internal addr: `<api-internal>:4000` → nginx upstream = `http://<api-internal>:4000`
- `stillhouse-db` internal addr: `<db-internal>:5432` → `DATABASE_URL=postgresql://<app_role>:<secret>@<db-internal>:5432/<db>?sslmode=require`
- Same-origin constraint respected: SPA → nginx `/api/*` → API over private network — all inside Render.
- `render.yaml` NOT required for this plan (manual dashboard provisioning preferred until stable; Blueprint optional later, owner's call).

## 4. PostgreSQL setup, TLS, and Prisma migration sequence

1. Provision `stillhouse-db`; wait for `available`.
2. From your machine (Provision-time only): `psql` external URL (dashboard Info page) — create non-DDL app role:
   ```
   CREATE ROLE app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '<generate locally>';
   GRANT CONNECT ON DATABASE <dbname> TO app;
   \c <dbname>
   GRANT USAGE ON SCHEMA public TO app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;
   ```
   (No `CREATE`, no `ALTER` — app runs migrations only via `migrate deploy` which uses the **owner/admin** URL from a one-off job, never the app role.)
3. `DATABASE_URL` uses role `app` (private internal host, `sslmode=require`); Render provides SSL. App's Prisma adapter uses `sslmode=require` honored from the URL.
4. **Migration order** (enforced by deploy sequence):
   a. Render one-off job (or `render ssh` into the API service) runs:
      `node node_modules/prisma/build/index.js migrate deploy`
   b. Confirms all 4 migrations applied; checks `room_allocation_no_overlap` exists (`\d room_allocation`); prints constraint definition.
   c. Seeds catalogue + staff: `node prisma/seed.js` with `SEED_*` env (0 reservations, 0 fixture users unless `SEED_*` set).
   d. Roll `stillhouse-api` forward.
   e. `stillhouse-web` health check green; `/api/v1/ready` returns `db:up` from a one-off command.
5. **PITR policy:** continuous (automatic); verify restore works once into a **new scratch instance** ("Recovery" → Restore Database → new instance → `psql` verify counts + `room_allocation_no_overlap`); export scratch (`pg_dump`), verify, then delete scratch. Log in `docs/BACKUP_RESTORE.md`.
6. **Rollback with additive migrations:** previous image tag rollback; zero DB reversal; destructive migration = restore from PITR.
7. **pg_dump offsite (optional):** weekly `pg_dump -Fc $DATABASE_URL -f stillhouse-$(date +%F).dump` to any S3/R2 bucket (Render doc: "Backup Render Postgres to Amazon S3" pattern) — not mandatory for launch.

## 5. DNS & TLS for `staging.thestillhouse.co.ke`

1. Leon registers `thestillhouse.co.ke` (if not already) via a KeNIC-accredited registrar (truehost.co.ke / hostafrica.ke etc. — **your choice, your account**).
2. In registrar DNS console (or Cloudflare if he prefers — optional):
   - `A`/`CNAME` record: `staging` → Render CNAME (e.g., `stillhouse-web-XXXX.ondrender.com` or `<short-id>.onrender.com` — the exact value shown in Render dashboard Custom Domain setup).
   - `CAA` record optional (pin to Let's Encrypt if desired: `0 issue "letsencrypt.org"`). Low TTL (300s) initially.
3. Render Custom Domains: add `staging.thestillhouse.co.ke` to `stillhouse-web`; Render verifies DNS and issues managed TLS (Let's Encrypt), auto-renews. HSTS stays in nginx vhost (`max-age=31536000; includeSubDomains`).
4. Verify: `curl -vI https://staging.thestillhouse.co.ke | …` shows 200 + valid cert chain; `curl -v http://staging.thestillhouse.co.ke` → 301 → https.
5. Daraja callback: `https://staging.thestillhouse.co.ke/api/v1/webhooks/mpesa` — reachable publicly the moment web service is up; no API public exposure needed.
6. Production remains untouched: `thestillhouse.co.ke` reserved; staging is fully isolated (own web/db/vhost).

## 6. Environment variable matrix (names only; values Leon types)

| Variable | `web` | `api` | Who sets | Source/Notes |
|---|---|---|---|---|
| `NODE_ENV` | ✓ (production) | ✓ (production) | Deploy session sets (Render UI) — **value constant** | boot guard requires production |
| `PORT` | (unset or 10000) | (unset, api listens 4000 internally) | Deploy session sets (Render UI) | default 10000 if null; Render detects 8080/4000 usually — set deterministically |
| `DATABASE_URL` | — | ✓ | **Leon types** (private internal host) | role `app`, `sslmode=require` |
| `SESSION_SECRET` | — | ✓ (≥32 random bytes) | **Leon types** (openssl rand -hex 32) | read at boot as a guard only — not used to sign cookies; rotation does not invalidate existing sessions (opaque DB tokens) |
| `WEB_ORIGIN` | — | ✓ `https://staging.thestillhouse.co.ke` | Leon types | must be HTTPS or boot refuses |
| `FRONTEND_BASE_URL` | — | ✓ `https://staging.thestillhouse.co.ke` | Leon types | used by email links |
| `COOKIE_SECURE` | — | ✓ `true` | Deploy session sets (Render UI) | boot-enforced |
| `TRUST_PROXY` | — | ✓ `1` | Deploy session sets (Render UI) | one Render edge hop |
| `RATE_LIMIT_WINDOW_MS` | — | default (900000) | Deploy session sets if override needed | 15min; leave defaults |
| `RATE_LIMIT_MAX` | — | default (300) | Deploy session sets if override needed | defaults fine |
| `AUTH_RATE_LIMIT_MAX` | — | default (10) | Deploy session sets if override needed | defaults fine |
| `LOG_LEVEL` | — | `info` | Deploy session sets | prod default |
| `MPESA_ENV` | — | `sandbox` | Leon types | **Stays sandbox** until 2.3 (comm §4) |
| `MPESA_CONSUMER_KEY` | — | ✓ | **Leon types** | Daraja portal |
| `MPESA_CONSUMER_SECRET` | — | ✓ | **Leon types** | Daraja portal |
| `MPESA_SHORTCODE` | — | ✓ `174379` | Deploy session sets (Render UI) | sandbox test shortcode |
| `MPESA_PASSKEY` | — | ✓ | **Leon types** | Daraja sandbox passkey |
| `MPESA_CALLBACK_URL` | — | ✓ `https://staging.thestillhouse.co.ke/api/v1/webhooks/mpesa` | Leon types | must be public HTTPS |
| `MPESA_WEBHOOK_ALLOWED_IPS` | — | optional | Leon types if Safaricom publishes IPs | optional IP allowlist |
| `EMAIL_PROVIDER` | — | `smtp` | Leon types (postmark) | or leave unset → `skipped` (still works, truthful) |
| `EMAIL_SMTP_HOST` | — | ✓ (e.g., smtp.postmarkapp.com) | **Leon types** | Postmark SMTP |
| `EMAIL_SMTP_PORT` | — | ✓ `587` | Leon types | STARTTLS port |
| `EMAIL_SMTP_SECURE` | — | `false` | Leon types | true only for 465 |
| `EMAIL_SMTP_USER` | — | ✓ | **Leon types** | Postmark server token as username |
| `EMAIL_SMTP_PASS` | — | ✓ | **Leon types** (same token) | Postmark server token |
| `EMAIL_FROM` | — | ✓ `The Stillhouse <reservations@thestillhouse.co.ke>` | Leon types | after DNS verification |
| `ADMIN_NOTIFICATION_EMAIL` | — | ✓ e.g. `frontdesk@staging.thestillhouse.co.ke` | Leon types | must be monitored |
| `ETIMS_ENVIRONMENT` | — | `disabled` | Deploy session sets | `disabled`/`mock` only until certification |
| `ETIMS_TIN` / `ETIMS_BRANCH_ID` / `ETIMS_DEVICE_SERIAL` / `ETIMS_BASE_URL` / `ETIMS_COMMUNICATION_KEY` / `ETIMS_SALES_INVOICE_PATH` | — | leave unset | **Leon types only if/when KRA-onboarded** | empty = disabled, truthful |
| `SEED_ADMIN_EMAIL` | — | ✓ (staging only) | Leon types | used once for staging staff seed |
| `SEED_ADMIN_PASSWORD` | — | ✓ (staging only) | **Leon types** random | staging staff seed only; prod via explicit env later |
| `SEED_MANAGER_EMAIL` / `SEED_MANAGER_PASSWORD` | — | ✓ (staging only) | Leon types | same pattern |
| `SEED_GUEST_EMAIL` | — | unused in prod | Leon types if desired | e2e fixture only in dev |
| `SEED_GUEST_PASSWORD` | — | unused in prod | Leon types if desired | same |

**Leon manually types:** all secrets (never in chat/Deploy session/git). **Deploy session sets in Render UI:** non-secret constants only (NODE_ENV, COOKIE_SECURE, TRUST_PROXY, MPESA_SHORTCODE, ETIMS_ENVIRONMENT, LOG_LEVEL, ports). Render UI access is Leon's account — Deploy session operates only at Leon's explicit direction, in his presence or via approved plan.

## 7. Security checklist (before first public traffic)

- [ ] `stillhouse-db` has **no public access** (private network only; external access disabled or IP-allowlisted)
- [ ] App role `app` is non-DDL (verified via `pg_roles`)
- [ ] `DATABASE_URL` uses `sslmode=require`
- [ ] `SESSION_SECRET` ≥ 32 random bytes; `COOKIE_SECURE=true`; boot guard passes
- [ ] `WEB_ORIGIN` is HTTPS; HSTS present in response headers
- [ ] CSP `default-src 'self'` (no `img-src https:` until photography commissioned — CSP blocks external images by that policy change)
- [ ] `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (nginx vhost, already set)
- [ ] Rate limits active (300/15min API; 10/15min auth) — fire 12 bad sign-ins, confirm 429
- [ ] Daraja callback path does not leak env/config (probe with bogus payload → `ResultCode 1`, HTTP 200)
- [ ] `SEED_*` staff users exist for staging; **zero** reservations; **zero** demo guest users
- [ ] UptimeRobot probe pings `https://staging.thestillhouse.co.ke/api/v1/ready` with 5-min interval; alert lands on Leon's phone
- [ ] Logical backup + PITR restore spot-check executed once into scratch instance; counts verified; scratch dropped
- [ ] No credentials in any Render env var name (names only, values hidden)

## 8. DNS/TLS verification procedure

After DNS propagates (up to 24h in worst case):

```
# A/AAAA record
$ dig staging.thestillhouse.co.ke +short
<render-provided-ip-or-cname>

# HTTPS chain
$ curl -vI https://staging.thestillhouse.co.ke 2>&1 | grep -E 'HTTP/|subject:|issuer:|expire'

# HTTP→HTTPS 301
$ curl -v http://staging.thestillhouse.co.ke/ 2>&1 | grep -E 'HTTP/|Location:'

# Ready probe via public path
$ curl -s https://staging.thestillhouse.co.ke/api/v1/ready
{"ok":true,"db":"up","time":"…Z"}
```

## 9. Acceptance tests (public staging, 16 checks)

Run from this machine against `https://staging.thestillhouse.co.ke` (never from Render shell):

```
node tests/staging-acceptance.mjs
```

Expects 16/16 PASS **with `A11Y_BASE_URL=https://staging.thestillhouse.co.ke`** (when running the accessibility suite the same way). Checks: homepage HTTPS 200, availability, quote/hold, desk-settlement confirm, staff auth, reservation ops (confirm→check-in→check-out), financial summary, audit log, backup evidence, restart evidence, ready probe. Output archived at `m6-rehearsal/staging-acceptance-public-<date>.json` (outside repo; not committed).

Additional public-staging-only checks:
- `curl -k https://staging.thestillhouse.co.ke/api/v1/webhooks/mpesa` with bogus `stkCallback` → `ResultCode 1` (HTTP 200) — webhook is reachable, returns truthful response
- Booking-availability smoke via browser (Leon's phone/laptop) — human verification, not automated

## 10. Rollback procedure (staging)

Triggers: post-deploy smoke fails, migrations fail, `/ready` ≠ 200 for 5 minutes, 5xx-rate spike.

1. **Immediate:** Render dashboard → service `stillhouse-web` / `stillhouse-api` → *Deploys* → previous deploy → *Rollback*. Render keeps N deploys (Hobby 5, Pro 15).
2. **If migration already applied:** additive-only ⇒ no DB rollback required; old code reads new schema harmlessly. If corruption suspected: `docs/BACKUP_RESTORE.md` PITR procedure → new scratch instance → verify → repoint services → restore.
3. **DNS rollback:** if widespread failure: registrar DNS → point `staging` back to placeholder or remove A-record (render shows unavailable); TTL was 300s.
4. **Verify:** health checks return 200; run the 16-check acceptance again; audit last 30 minutes of `/admin/audit-log`.
5. **Post-mortem:** write 5-line incident note to `docs/reports/PHASE_1A_INCIDENT-<date>.md` (working tree only; not committed). Fields: trigger, time, action, outcome, prevention.

## 11. Leon's manual actions (owner-gated; deploy role may not touch)

1. Register `thestillhouse.co.ke` (KeNIC registrar; if he already owns it, skip) — **and/or** decide DNS chain (registrar DNS vs Cloudflare)
2. Create Render account (Hobby or Pro workspace — his choice; decision on Hobby 3d vs Pro 7d PITR)
3. Create project `thestillhouse` + services `stillhouse-web` (Web), `stillhouse-api` (Private), `stillhouse-db` (PostgreSQL 16) in region **Frankfurt** — exact config per §2 (or dictate the values for Deploy session to click through under his supervision)
4. Add DNS records for `staging.thestillhouse.co.ke` (Type A/CNAME → Render)
5. Enter **all** secret env values in Render UI — **never in chat, never in Deploy session prompts** 
6. Approve Custom Domain in Render dashboard (Let's Encrypt issuance)
7. Decide Hobby vs Pro workspace; approve Postmark plan; approve UptimeRobot plan (Free is sufficient)
8. Approve `M-Pesa sandbox` credentials entry in Render UI
9. Approve rollback drill execution + final go/no-go for first public run

## 12. Deploy session's authorized actions (after Leon's explicit GO)

1. Create/adjust **only** documentation in repo; no code/config changes without separate Leon approval
2. Update DNS verification, TLS checks, `staging-acceptance.mjs` runs, archived evidence
3. Render **one-off commands** onLeon's behalf when explicitly directed (env var entry is Leon-only)
4. Final verification report: curl chains, header audit, 16-check result, rollback drill log, RTO/RPO note
5. Optional per §6 decisions: one new file `apps/web/nginx.render.conf` (listen 10000) if Leon prefers deterministic binding over auto-detect
6. Final acknowledgement: Leon read the security checklist (§7) and explicitly authorizes first public traffic

## 13. GO / NO-GO checklist (all must be YES)

- [ ] Leon has executed every §11 action personally
- [ ] TLS chain valid, HSTS present, HTTP→HTTPS 301 verified with evidence archived
- [ ] `staging-acceptance.mjs` → 16/16 against public URL
- [ ] `room_allocation_no_overlap` verified in the production-shaped staging DB
- [ ] PITR restore drill logged; scratch verified + dropped
- [ ] Rollback drill logged; previous deploy reachable again within 30 min
- [ ] UptimeRobot: 15 consecutive green probes; alert SMS delivered to Leon's phone
- [ ] No credentials, tokens or phone numbers committed; `.env` never left this machine
- [ ] `git status --short` shows only intended doc files (no application files touched)
- [ ] Nothing pushed without Leon's explicit Git instruction; CI re-runs green before any public traffic

**If any box is unchecked: STOP. Do not point `staging.thestillhouse.co.ke` at the web service. Do not enter the Daraja callback.**

## 14. Open questions / undecided items

1. `apps/web/nginx.render.conf` (deterministic 10000) vs relying on 8080 auto-detect — Leon's call, trade-off documented in §2.1
2. Workspace plan: Hobby (3d PITR, $0/mo workspace + $25 web + $19 db + $25 api = $69/mo) vs Pro (7d PITR + more rollback slots, +$25/mo workspace) — Leon's cost call
3. Robot: UptimeRobot Free vs $9/mo Solo — Leon's call at first page-less 1-min wait
4. Render blueprint (`render.yaml`) as future IaC — deferred until first staging stable; no repo change authorized yet
5. Cloudflare proxy in front of Render for Kenya latency — optional; not required for launch; adds SRM complexity; defer
