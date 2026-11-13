# FINAL PRODUCTION COMMISSIONING REPORT — The Stillhouse

**Date:** 2026-11-13 · **HEAD:** `159b970` (`chore: harden production security headers`) — remote `main` **synced & verified** · **Mode:** commissioning. No further engineering milestones.

Short version: the platform is **deployed, hardened and verifiably live in production shape** — but it is **NOT yet production-ready for a live launch**. Four things block true production: the **Neon credential rotation (G1)**, the **production migration (G2)**, worker hosting (G3), and Daraja production cutover (G5). Until those close, The Stillhouse remains a concept-property demonstration — honest, live on Vercel, with sandbox M-Pesa and zero real guests.

---

## 1. Executive summary

**Live URL:** `https://hotel-booking-system-jet-gamma.vercel.app` (Vercel project `hotel-booking-system` — web SPA + Express API + Neon PostgreSQL `eu-central-1`).
Verified 2026-11-13 read-only: `/api/v1/ready` → `{ok:true, db:up, jobs:stale}`; `/api/v1/availability` → full catalogue (28-room client view; production DB still contains the 4 retired Stone Cottage rows — guests never see them); deep SPA routes render 200; 404 page renders 200; `/api/v1/webhooks/mpesa` → `ResultCode:1` (honest rejection, no state change); security headers live (CSP, nosniff, DENY, Referrer-Policy, Permissions-Policy — deployed 16:37Z 2026-11-13, verified); API headers include HSTS, nosniff, frame-ancestors. Tests (local): 69/69 API; web build ✓; migrations apply cleanly.

**Not production-ready for direct commercial launch because:** production DB lacks the M10 financial-integrity migration (live risk on settlement flows); no background worker running (`jobs:stale` — holds never expire, arrival reminders never send, stale payments never re-query in production); M-Pesa is sandbox (`MPESA_ENV=sandbox`); SMTP is unconfigured (confirmations recorded as `skipped`); no monitoring; the Neon password leaked in session history (rotation pending, owner-only action).

**Honest verdict:** engineering complete and acceptance-tested; commissioning ~55% complete — every remaining item is owner-gated (accounts, credentials, DNS, compliance sign-offs, or physical/hotel business readiness), OR owner-authorized production writes (migration), OR external-service provisioning only the owner can initiate (worker host, SMTP, monitoring).

**Correctness of the guest path RIGHT NOW:** booking inquiries, browsing and even reservation holds work safely; nothing can silently corrupt data (exclusion constraint holds; M-Pesa unconfigured by design; settlement flows dormant until production credentials exist).

---

## 2. Final architecture and hosting topology

```
 Guest browser → https://hotel-booking-system-jet-gamma.vercel.app
                    │ Vercel edge (iad1)
        ┌───────────┴───────────┐
        ▼                       ▼
  Web (Vite SPA, static)   API (Express serverless, /api/v1/*)
        │                       │
        └───────────┬───────────┘
                    ▼
        Neon PostgreSQL (eu-central-1, pooled, sslmode=require)
   Production DB sits in the HOTEL's Neon project; Vercel holds the DATABASE_URL
```

- Web service: Vercel `web` service (Vite), `vercel.json` at repo root; SPA fallback rewrite `/(.*) → /index.html`; static assets fingerprinted; security headers set at the edge.
- API: Vercel `api` service (Express function), `framework: express`; `prisma generate && node scripts/inline-wasm.mjs` on build; committed wasm compiler inline; `engineType=client`.
- Database: Neon PostgreSQL 16, pooler endpoint, `sslmode=require`, PITR-capable (plan unknown — verify at activation).
- Worker: **not deployed** — `apps/api/src/worker.js` runs sweepers (hold expiry, stale-payment requery, arrival reminders, heartbeat) with a `pg_advisory_lock`; in production nothing currently runs it. **Owner hosts it** (see §6, exact instructions).
- CI: unchanged; no auto-deploy from CI; Vercel deploys on push to `main` directly from GitHub.
- Staging: in-repo Docker compose stack (staging.stillhouse.local) — rehearsal-only; not public.

### Routes exposed live
- `GET /api/v1/ready` → `{ok, service, db, jobs, time}` — no auth; `jobs: stale` by design until worker deployed; `503 db:down` when DB dies (honest).
- `GET /api/v1/health` → liveness only.
- `GET /api/v1/jobs/health` → **requires** `JOB_TOKEN` (404 by default, hides existence); 503 when worker heartbeat missing/stale > 5 min.
- `POST /api/v1/webhooks/mpesa` → accepts Daraja callbacks; verifies via server-side `stkQuery` before settling; malformed bodies rejected without writes.
- `POST /api/v1/admin/reservations/:reference/settle` — desk settlement (receptionist+); the only way a reservation becomes `confirmed`.
- Admin endpoints: all behind RBAC (`receptionist|manager|admin`, audit-log admin-only).

---

## 3. Completed implementation

Everything from the 2026-11-11/12/13 build sequence is live in production NOW (pushed history): WebP photo conversion coverage site-wide; GSAP lazy-loading; skip links & reduced-motion; focus-visible states; catalogue server-derived (`availabilityService.js`) so retired rooms (Stone Cottage) are never shown to guests; 404 with no motion, original copy, Cormorant/hairline system; WhatsApp as the only guest contact channel (owner decision stands); demo disclosure ("concept property") in footer; availability holds 15-minute expiry; public availability with correct pricing (pre-tax, service charge, tourism levy, VAT shown separately); 28-room catalogue constant + regression test; admin booking-integrity (stone-cottage invisible to staff filters), `out_of_service` rooms logic, `fetchRooms`/`admin.rooms` pipeline; M8 trust/booking-clarity fixes (hold countdown, possession-based anonymous lookup, ConceptNotice); M10 financial-integrity hardening (verify-then-settle webhook, `confirmReservationTx` single funnel, FOR UPDATE reservation lock, allocation re-creation on late settlement, `needs_allocation` state, over-capture DB trigger + layers, admin settle route, worker code, differentiated rate limits, correlation IDs); security headers at edge (CSP/X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy, 2026-11-13).

Test status: **69/69 API tests green**; `npm run build` ✓; DB migration `20261113000000_m10_financial_integrity` applies cleanly on local PG16; `prisma migrate deploy` exits 0.

## 4. Database and migration status

| Layer | State | Evidence |
|---|---|---|
| Prisma schema / generated client | committed; includes `needs_allocation` + trigger-managed ORM client | repo |
| Migration file `20261113000000_m10_financial_integrity` | WRITTEN & TESTED on local PG16; NOT in production | `prisma/migrations/20261113000000_m10_financial_integrity/migration.sql` |
| Exclusion constraint `room_allocation_no_overlap` | live in prod since M1 | availability works |
| Trigger `payment_net_capture_guard` (A-1 guard) | active in local PG; **absent in prod** | migration not applied |
| Indexes `payment_*_reservationId_status_idx`, `payment_attempt_providerReference_succeeded_key`, `one_desk_succeeded_per_reservation` | local ✓; prod pending | same |
| Production backup (pre-migration) | **assert needed by owner** — Neon PITR windows unverified | `docs/BACKUP_RESTORE.md`; G1/G2 gate |
| Rollback path for migration | unit-safe (additive); enum left in place if rolled back; app rollback = git revert | §9 below |

**Required next step (owner):** approve & run the migration against production Neon (exact commands in §9). Do NOT bypass via `prisma migrate dev`. Confirm back-up first; verify `pg_dump --format=custom` completes on the Neon console or via `pg_dump` to object storage.

## 5. Credential security status

| Item | Status | Evidence |
|---|---|---|
| Neon password (exposed in chat) | **ROTATION PENDING — owner action** | leaked 2026-11-13 during session use; safest: rotate today, then redeploy Vercel (env change) — see `docs/G1_NEON_ROTATION_EXECUTION_CHECKLIST.md` for the exact console procedure |
| `SESSION_SECRET` (Vercel) | set (required at boot); rotation does NOT invalidate sessions (opaque DB tokens) | `docs/DEPLOYMENT.md`, M8 assessment |
| `GOOGLE_CLIENT_*` / OAuth | wired dormant; consent screen in **Testing** mode, 0 test users | live `/api/v1/auth/google` redirects to consent screen; guests cannot sign in |
| `MPESA_*` | sandbox per D-067 | no real money possible |
| SMTP | not configured anywhere | emails recorded `skipped` (honest failure, verified in rehearsal) |
| `JOB_TOKEN` | not set in prod | `/jobs/health` returns 404 by design |
| Git history / tracked files | **clean** (no secrets committed; `.env*` gitignored; `deploy/certs` local-only) | scan 2026-11-13 |

## 6. Worker hosting and health status

**Not running anywhere in production.** Production has two possible entrypoints: `app.js` (Vercel serverless — serves web+API; **never runs `worker.js`**) and `worker.js` (dedicated process). Docker runs `server.js` (which includes sweeps). Vercel is the current host → nothing sweeps.

### What the worker does (every 60 s, `pg_advisory_lock(900000000001)`)
- `sweepExpiredHolds` — expired holds → `room_allocation.state='expired'`; stale pending reservations → `expired`; expired absolute-timeout sessions deleted.
- `sweepStalePayments` — pending MPESA older than 45 min → `stkQuery` → settle (CAS + net-capture guard + confirmReservationTx) or release.
- `sweepArrivalReminders` — UTC tomorrow's confirmed arrivals get reminders (outbox-deduped).
- `retryFailedInvoices` — eTIMS failures (currently `disabled`).
- Heartbeat upserted into `setting['jobs.heartbeat']` → drives `/api/v1/ready.jobs` and the protected `/jobs/health`.

### Exactly how to get the worker running (owner action)
Railway (~US$5/mo, $5 included usage) or Fly.io Frankfurt (~US$7/mo, no Africa region) — **choose one**:

1. Create account on railway.app (or fly.io). Connect repo `Code-with-L/hotel-booking-system`.
2. Service configuration → **Deploy a subset**:
   - Build: `docker build -f apps/api/Dockerfile .` **or** buildpacks with `npm ci && npx prisma generate && node scripts/inline-wasm.mjs` (must match production install path — use Dockerfile to preserve wasm helper).
   - Start command: `node apps/api/src/worker.js` (NOT `server.js`).
   - Environment variables (exact, names only): `NODE_ENV=production`, `DATABASE_URL=<neon pooled url>`, `JOB_TOKEN=<openssl rand -hex 32>`, `SESSION_SECRET=<existing vercel production value — DO NOT override>`, `LOG_LEVEL=info`.
   - No volume, no outbound, no inbound ports, no healthcheck (process exits only on SIGTERM).
   - Enable **Restart on crash**; disable scale-to-zero.
3. After first start: `/jobs/health` must return `{ok:true, worker:"stillhouse-worker", ageMs:<2000}` once you curl it with `Authorization: Bearer <JOB_TOKEN>`.
4. Verify `jobs:"ok"` flips within 60 s on `/api/v1/ready`.
5. **Verification method:** `curl -H "Authorization: Bearer <token>" https://<worker-domain>/api/v1/jobs/health` (workers typically have no public domain — probe via Vercel `/ready` `jobs` field, or Railway's internal `railway run` diagnostic).

**Owner gate (G3). Cost is owner's decision.**

## 7. Frontend and backend deployment URLs

| Surface | URL | Status |
|---|---|---|
| Web | `https://hotel-booking-system-jet-gamma.vercel.app` | **Live — verified 2026-11-13** (28-room catalogue, 404, `Three expressions, twenty-eight rooms` served) |
| API (`/api/v1`) | same origin | Live — `/ready` db up; `/jobs/health` 404 by design |
| Daraja callback (production) | `https://hotel-booking-system-jet-gamma.vercel.app/api/v1/webhooks/mpesa` — **needs Safaricom go-live + `MPESA_ENV=production` by owner only** | ready to register once authorized |
| Staging | `https://staging.stillhouse.local` (local Docker) — public staging never deployed | local only |

## 8. Daraja production status

**`MPESA_ENV=sandbox` — a real customer is never charged in any current configuration.**

- Sandbox STK push from M7 testing: **initiated, callback verified idempotent, reservation held — NEVER completed with a real PIN** (comm-record from acceptance; see `docs/reports/MPESA_SANDBOX_STK_ACCEPTANCE.md`).
- Production: nothing registered; production Daraja application, consumer key/secret, live `MPESA_ENV=production`, callback allowlist entry `MPESA_WEBHOOK_ALLOWED_IPS` (Safaricom publishes these; current allowlist is empty so every callback is processed by payload-structure + amount check + `stkQuery` verification).
- Production activation requires, in order: Safaricom go-live approval (organization docs, accountant sign-off) → sandbox E2E → Daraja production app → `MPESA_ENV=production` + `MPESA_WEBHOOK_ALLOWED_IPS=<Safaricom ips>` (owner-only) → KES 1 live test reservation (owner-authorized) → refund drill → hypercare 72 h.
- **Zero engineering action is possible; Safaricom + livery only owner does.**

## 9. Migration & rollback instructions (production)

**Prerequisites (owner):** Neon project backed up (PITR enabled — verify Neon console → project → Settings → Backups). Point-in-time recovery window visible; if unverified, **do not run yet** — capture `pg_dump -Fc https://... > stillhouse-pre-m10.dump` via a Neon "download a backup" flow and archive offsite first.

**Exact commands (owner-authorized only):**
```
# 1. Neon console → project → SQL Editor (or psql with owner credentials):
\d+ room_allocation        -- confirm exclusion constraint present pre-migration
\dtv room_allocation       -- expect pg_index for room_allocation_no_overlap
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
 WHERE t.typname = 'ReservationStatus' ORDER BY e.enumsortorder;   -- must NOT yet list needs_allocation

# 2. Apply (one sitting):
npx prisma migrate deploy    # against the production DATABASE_URL (export it first, do not commit it)

# 3. Verify:
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
 WHERE t.typname = 'ReservationStatus' ORDER BY e.enumsortorder;   -- now includes needs_allocation
SELECT tgname FROM pg_trigger WHERE tgrelid = 'payment'::regclass;  -- expect payment_over_total_guard
SELECT indexname FROM pg_indexes WHERE indexname IN
  ('payment_attempt_providerReference_succeeded_key','payment_reservationId_status_idx','payment_attempt_reservationId_status_idx','one_desk_succeeded_per_reservation');   -- 4 rows
```

**Rollback (safe, rehearsed shape — no destructive steps):** revert `main` to `2ccffd9` (pre-M10) via `git push origin HEAD:main --force` (only if owner commands it) → the API stops referencing `needs_allocation`; migration is additive and forward-only, so the enum/trigger remain harmlessly dormant until next migration; capacity to roll back is limited only by the fact the `needs_allocation` enum value cannot be dropped without breaking any rows written since migration. **Do not attempt to drop the trigger while production is live.**

**Rollback trigger drill (before approving):** if Neon provider confirms PITR, restore a scratch branch/copy and replay migration in isolation; confirm counts (room_count=32, reservation_count per existing M8 report); release scratch.

## 10. Email delivery status

**None — honestly not configured.** All outbound email records as `skipped` in `email_outbox`; no guest notification exists yet, including booking confirmations or password resets (password-reset path returns 503 honestly, not fake success).

**Owner steps (G6):** choose provider (Postmark $15/mo Basic — recommended, strong deliverability — or Amazon SES ≈ $0.10/1k, or Mailgun, or the hotel's own mail server), register sender identity, set SPF+DKIM+DMARC alignment for `@yourdomain`, then add to Vercel env: `EMAIL_PROVIDER=smtp`, `EMAIL_SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`. Then: `tests/release-rehearsal.mjs` must pass with `EMAIL_PROVIDER` pointing at a disposable mailbox; verify a confirmation email arrives; verify failure path (bad host → outbox `failed` row, booking intact).

## 11. Monitoring and alerting status

**Not wired.** Required minimum (G7): uptime probe on `/api/v1/ready` (or Vercel's built-in monitoring) — UptimeRobot free tier (50 monitors, 5-min interval); named responder; alert on `jobs:stale` for > 10 min; alert on 5xx rate; healthz page test. Vercel dashboards give function error counts; Neon console shows connection/storage; `/jobs/health` (token-gated) exposes worker state; `email_outbox.status='failed'` rows indicate guest notification failure; `payment-health` endpoint surfaces anomalies (duplicate provider transactions, amount mismatches, over-capture blocked, cancelled-with-capture).

**Owner steps:** sign up at uptimerobot.com, create a 5-min HTTP(s) monitor on `https://hotel-booking-system-jet-gamma.vercel.app/api/v1/ready`, alert email = front desk address, add one at log-level error>5/hour (Vercel notifications free tier suffices for launch).

## 12. Security verification (M10 formal close-out)

| Area | Status |
|---|---|
| Secrets in git / in this report | **None**; scanned 2026-11-13; `.env` local-only & gitignored; only `.env.example` tracked |
| Authentication | bcrypt 12; httpOnly+Secure+SameSite=Lax cookies; opaque DB-session tokens; idle 480 min + absolute 7-day; request-time expiry check; disabled users rejected; password reset wipes all sessions |
| Authorization | RBAC `receptionist|manager|admin` on admin routes; audit log admin-only; comp settlement manager+ |
| CSRF | SameSite=Lax + CORS single origin; mutating routes behind JSON + `credentials:true` |
| Rate limits | API 180/15min public read, 60/15min writes, 10/15min failed-only auth; JWT absent |
| Injection | Prisma parameterized; no `$queryRawUnsafe` with user input; Zod on every write |
| XSS | No `dangerouslySetInnerHTML` anywhere; zero innerHTML sinks |
| Security headers | CSP / nosniff / DENY / Referrer-Policy / Permissions-Policy — **live** (verified 2026-11-13 16:37Z) |
| Logs | redact cookie/auth/password/token/passkey; no req bodies; query strings stripped; no MSISDN |
| Audit trail | append-only (`audit_log`, RESTRICT FKs, transaction-bound); no app-level deletes |
| Cookies | opaque, not signed; SESSION_SECRET = boot guard only; rotation does NOT invalidate sessions (documented) |
| Dependency audit | 3 moderate, all dev-only (`autocannon`→`hyperid`→`uuid`) — CI blocks on critical |
| Backup | one local docker drill passed 2026-11-11; **production PITR unverified** — part of migration gate |

## 13. End-to-end test evidence

| Suite | Result | Evidence |
|---|---|---|
| API suite (vitest, local PG16) | **69/69 green** (66 at M10-B + 3 regression) | `npm test` 2026-11-13; `m10.test.js`, `m10-mpesa-disabled.test.js`, `booking`, `m4`, `m5`, `mpesa`, `m8-anonymous`, `inventory`, `auth`, `google-auth*` |
| Web build | ✓ built in ~3 s | `npm run build` |
| Booking flow (in-app browser) | Boot/exploration verified M8; full flow not re-run in this session — CI or local rehearsal proves the pipeline; production is displaying correct data | snapshot 2026-11-13 |
| Concurrent settlement | 5-way desk settle → one 201 / rest 409; 4-way duplicate callback → one attempt, reservation confirmed once (verified by test) | `m4.test.js`, `m10.test.js` |
| Admin workflows | Evidence of role gating + audit trail + settle flow — green in suite | `m4`, `m5`, `m10` |
| Failure injection | Over-capture blocked by trigger (direct insert test); verify-failure (1032) → failed+released; inconclusive (9999) → pending, no release; forged callback → no settlement; sweeper+release-on-expiry (idempotency double-run) | `m10.test.js` |
| Destructive/edge on production | **NOT executed** — production data untouched in this session | — |

**Not testable without owner action:** live Daraja (KES 1 txn), email delivery to a real mailbox, worker heartbeat via public probe, production migration outcome.

---

## 14. GitHub state
- `main` remote/local in sync at **`159b970`** (`chore: harden production security headers`)
- Preceded by M10 (`f69de3a`, 47 files), M8 (`2ccffd9`, 30 files), etc. — all pushed.
- No uncommitted work remains; no untracked file belongs to this commissioning task except this report (commit below).
- CI green? CI cannot access Vercel secrets; Trivy/scan pass on local. GitHub CI is informational until Leon flips `STAGING_DEPLOY_ENABLED=true`.

## 15. Final remaining owner actions (all-or-nothing gates)

1. **Neon password rotation** — G1. 2-minute console operation (`docs/G1_NEON_ROTATION_EXECUTION_CHECKLIST.md` §2 steps 0–5); paste into Vercel env `DATABASE_URL` → **Redeploy**. Verification: `/ready` returns db:up.
2. **Backup + Phase A migration of production DB** — G2. See §9. Execute on Neon SQL Editor or `prisma migrate deploy` from your machine. Verification queries in §9. If anything goes wrong, rollback (§9).
3. **Worker hosting** — G3. Railway/Fly instructions §6; verify heartbeat. Verification: `/ready jobs:ok` + curl of `/jobs/health` with token.
4. **Daraja production credentials** — G5. Safaricom go-live; owner credentials; `MPESA_ENV=production` only set by Leon; `MPESA_WEBHOOK_ALLOWED_IPS=<Safaricom-callback-ranges>` (Safaricom publishes these). Verification: sandbox callback exercised; one KES 1 test reservation; refund to KES account; 72 h hypercare.
5. **Email provider configuration** — G6. §10; verify confirmation arrives; verify failure path. Verification as §10.
6. **Monitoring** — G7. UptimeRobot; named responder; test page received. Verification: test incident fires alert.
7. **Neon PITR + weekly `pg_dump`** — P0.3 / backup clause in COMMISSIONING. Verification: Neon console shows PITR window; drill log.
8. **Staff login distribution** (2 named staff minimum for coverage) — seed with `SEED_*` by you; nobody can enter production staff context otherwise. Verification: two-person check-in/check-out confirmed.
9. **Photography decision** (P0.9 COMMISSIONING) — current images are self-hosted WebP from the M-3 commissioned shot list; no third-party imagery remains (CREATIVE_EXCELLENCE_AUDIT verified); confirm or commission the definitive set — launch literally cannot ship with unlicensed images, and the current set **is** the M3 licensed/cleared set (D-031).
10. **Business readiness sign-off** (P0.1, P0.6, P0.10, P0.11) — permits, accountant VAT/Tax sign-off (see `TAX_AND_CHARGES.md` for what he must confirm in writing), eTIMS launch decision, Go/no-go date definition; **none of this is engineering's decision**.
11. **WhatsApp number review** — D-070: `0708 097 490` is publicly visible on the live footer/hotel contact. Be sure this remains voice-or-WhatsApp for guests.
12. **ConceptNotice/works copy check** — verify every guest-facing screen that claims "concept property" is acceptable to the hotel (D-080 legal exposure).

---

## 16. Final launch recommendation

**Current status honestly reported: engineering complete and acceptance-tested at the M10 bar. Delivery to a commercial guest is NOT recommended today.**

Sequence strictly, with owner sign-off at each gate:
G1 (rotation) → G2 (migration: backup → apply → verify) → G3 (worker: `/ready jobs:ok`) → G6 (email live) → G5 (M-Pesa production KES 1 test) → G7 (monitor live) → G8 business/legal sign-off → **Gate D decision** → 72 h hypercare → GO.

Each of those steps is independently valuable; none can be skipped; none are engineering milestones. Skipping G2 leaves the live site one rare "hold expires mid-checkout" away from a 500 with moneyCaptured=true. Skipping G3 means room holds and stale payments never clear; a full season's stale holds invisibly block inventory. Skipping G6 means no guest ever receives a confirmation. **Treat current state as "technically ready for a supervised demonstration," not as "ready for take-out."** The hotel's decision on actual launch date must come after G8 is signed by the actual hotel parties — not from this report.
