# M9 — Production Hardening & Operational Resilience Audit

**Date:** 2026-11-13 · **Scope:** audit only — no code changed in this milestone. **HEAD at audit:** `2ccffd9` (`feat(M8): improve booking trust and inventory consistency`) — working tree retains M8 doc corrections (`DEPLOYMENT.md`, `PHASE_1A_STAGING_PROVISIONING.md`, `PHASE_1_DEPLOYMENT_BLUEPRINT.md`) and `M8_RELEASE_SECURITY_READINESS.md`, all untracked/modified as intentionally left. **Production is not access-controlled in this audit; no database was touched, no M-Pesa call was made, no deployment was triggered.**

## Evidence classes used

Each finding is tagged:
- **IMPLEMENTED AND VERIFIED** — code path read and exercised/verified by test or live check.
- **IMPLEMENTED BUT NOT VERIFIED** — code inspected; not exercised live.
- **DOCUMENTED ONLY** — docs claim it; code does not do it.
- **MISSING** — absent.
- **OWNER DECISION REQUIRED** — business/infra choice; this audit does not make it.
- **NOT APPLICABLE** — out of scope or irrelevant for the current shape.

File:line references are to `C:\Users\leon2\Downloads\hotel booking system\hotel-booking-system`. Nothing was implemented; nothing was rotated; no dependency was installed or changed.

---

## 1. Executive summary

The Stillhouse is a **real, functional prototype with unusually good internal integrity controls** — an exclusion constraint for double-booking, a verified anonymous-guest funnel, honest M-Pesa scaffolding, 58 green tests, and a deliberately honest posture about sandbox payments. It is **not yet safe to operate as a real-money hotel payment platform**, chiefly because:

1. **A forged M-Pesa callback can confirm a reservation without payment** under the default configuration (no `MPESA_WEBHOOK_ALLOWED_IPS` set, no signature verification anywhere, and `checkoutRequestId` is returned to the anonymous caller at payment initiation).
2. **The documented live deployment (Vercel + Neon, D-067) runs none of the background jobs** — hold expiry, stale-payment requery, arrival reminders, eTIMS retries all live only in `server.js`, which Vercel never executes.
3. **A confirmed reservation can be granted with no payment and no room allocation** (admin override path), and late payment against an expired hold confirms a **confirmed-but-unallocated** reservation (result of `promoteHoldAllocation` is ignored).
4. **No production monitoring, alerting, log retention or on-call path exists**; failures are invisible except for payment-health reports nobody is paged on.
5. **Email is not configured in production** — password reset returns 503, booking confirmations are recorded `skipped`, and there is no retry or visibility for undeliverable mail.

These are launch-blocking for real money. They are fixable in a focused two-to-three-week programme (§10) without redesigning the architecture. Until then, the honest framing remains what the owner already applied for the presentation: a concept-property demonstration, with M-Pesa sandbox, no owner-authorized production GO, and no claim of live payment processing.

**Headline severity counts:** P0 × 4 · P1 × 14 · P2 × 13 · P3 × 11.

---

## 2. Exact architecture and deployment assumptions (as documented; cross-checked)

| Layer | Reality evidenced | Status |
|---|---|---|
| Web (guest SPA) | Vite/React SPA, `apps/web`; Vercel `services.web` (`vercel.json`); SPA fallback rewrite | IMPLEMENTED, deployed (D-067) |
| API (Express) | `apps/api/src/app.js` default-exports `createApp()`; Vercel function entry `src/app.js`; self-host path runs `server.js` (Docker `CMD`) | IMPLEMENTED, deployed (analysis verified) |
| Database | Neon Postgres `eu-central-1` (production, per D-067/D-074 probes); local Docker PG 16 for dev/test; raw SQL present (`routes.js:62-74`, `server.js`, `allocations.js`) | IMPLEMENTED |
| Background jobs | In-process `setInterval(60s)` in `server.js` only | IMPLEMENTED BUT ONLY ON SELF-HOST PATH |
| CI | GitHub Actions `ci.yml`: install, audit (critical blocks), PG16 service, API tests, build, Playwright e2e, Trivy CRITICAL/HIGH, staging deploy manual `workflow_dispatch` + `STAGING_DEPLOY_ENABLED` gate | IMPLEMENTED AND VERIFIED (CI passes; staging not enabled) |
| Docker reference stack | `docker-compose.prod.yml` (reference, not used live); Dockerfiles pass healthcheck (`/api/v1/ready`), `apps/api` runs as non-root, `USER app` | IMPLEMENTED AND VERIFIED (build-verified docs) — not the live topology |
| Vercel deployment | `https://hotel-booking-system-jet-gamma.vercel.app`; live bundle serves `27a8ff3` (pre-M8; M8 `2ccffd9` local only — proof in `docs/M8_RELEASE_SECURITY_READINESS.md` §5.1) | IMPLEMENTED BUT NOT AUTHORIZED (no owner GO recorded) |
| Email (SMTP) | Not configured anywhere (defaults empty; `EMAIL_NOT_CONFIGURED` → `skipped`) | MISSING (production) |
| M-Pesa | `MPESA_ENV=sandbox` live; requery/sweeper logic exists; callbacks unsigned | IMPLEMENTED, sandbox only |
| Payments custody | None taken; demo holds; concept property | OWNER DECISION REQUIRED for anything else |
| Observability | Vercel platform logs; no Sentry/UptimeRobot/log drain in repo | MISSING (documented as not configured) |
| Secrets | Vercel dashboard → env vars; local `.env` gitignored; Git history clean (M8 scan) | IMPLEMENTED AND VERIFIED (hygiene) |
| Backups | One executed drill: local Docker `pg_dump→restore→counts`, 2026-11-11 (`docs/BACKUP_RESTORE.md`) | DOCUMENTED ONLY for production |

**Trust assumptions**: one Vercel edge hop (`app.js:31` `trust proxy: 1`); helmet defaults on API only; SPA on Vercel gets **no security headers** (no `headers` block in `vercel.json`); CORS single-origin (`app.js:36`); `SameSite=Lax` session cookie.

---

## 3. Existing controls and their evidence (what is done right)

Accepted without suspicion only where evidenced:

- **Double-booking prevention is real.** `room_allocation_no_overlap` GiST exclusion constraint (`prisma/migrations/20261110224508_init/migration.sql:475-477`); `findFreeRooms` `SELECT … FOR UPDATE` room-row locks (`lib/allocations.js:19-22`); 23P01 → 409 retry loop ×6 (`reservationService.js:20-41`); CAS compare-and-swap on status transitions (`admin/routes.js:203-204`); 8-way concurrent-booking test passes (`tests/booking.test.js`). **IMPLEMENTED AND VERIFIED.**
- **Hold lifecycle.** 15-min `HOLD_TTL_MINUTES` (`lib/allocations.js:5`), `occupying` holds, expiry sweeper code (`server.js:14-38`) — code exists but does not run on Vercel. **IMPLEMENTED BUT NOT VERIFIED (and not running in production).**
- **Reservation idempotency.** `reservation.idempotencyKey @unique` (`schema.prisma:278`), replay returns original (`reservations/routes.js:54-73`). **IMPLEMENTED AND VERIFIED.**
- **Webhook/commit discipline.** Reservation creation in one transaction; payment callback verifies `(providerReference, amountMinor)` equality before marking `succeeded`; terminal-state replay is a no-op; `afterConfirmed`/`afterFailed` run post-commit so email/eTIMS never roll back booking state; email dedupe `dedupeKey @unique` (`schema.prisma:429`). **IMPLEMENTED BUT NOT VERIFIED (untested forging path).**
- **Password reset.** 256-bit token, sha256 at rest, 60-min TTL, single-use, **all user sessions deleted** on reset (`auth/routes.js:87-125`); uniform anti-enumeration response. **IMPLEMENTED AND VERIFIED (code-read).**
- **Session model.** Random 32-byte token, db `sha256(token)` lookup, `httpOnly`, `sameSite=lax`, `secure` in prod, idle 480 min + absolute 7-day enforcement at request time (`lib/session.js`, `middleware/index.js:25-53`); expired sessions deleted opportunistically; disabled-user sessions rejected and deleted. **IMPLEMENTED AND VERIFIED (M8 §3).**
- **RBAC.** Every `/admin/*` route behind `requireRole`; audit log admin-only; settings/financial manager+; reservation-cancel `canSee`-gated; staff checks client **and** server side. **IMPLEMENTED AND VERIFIED (m4/m5 tests).**
- **TLS + secrets hygiene.** Boot guard refuses prod without `SESSION_SECRET`/HTTPS/`COOKIE_SECURE` (`env.js:22-38`); CI critical-audit gate; Trivy blocks on CRITICAL/HIGH; `.env*` never committed; Git history clean of neon/key patterns (2026-11-13 scan). **IMPLEMENTED AND VERIFIED.**
- **Honest failure reporting.** `/api/v1/ready` `SELECT 1`, 503 `db:down` (`app.js:47-57`) — API truthfully reports DB outage; webhook replays idempotent; payments can never flip a failed callback to succeeded (m5 test). **IMPLEMENTED AND VERIFIED.**
- **Dependency posture.** Express 4.22.3, react 19.3.1, prisma 6.19.3, zod 4.6.7; `npm audit --audit-level=high` 2026-11-13 → **3 moderate advisories (dev-only `autocannon` chain: uuid/hyperid)**; zero high/critical; CI blocks on critical. **IMPLEMENTED AND VERIFIED (this audit).**
- **Accessibility/axe.** `axe-core` 0 violations on 8 pages (M5/M7); a11y 96–98 measured (export `devtools_…lighthouse_audit…md`, 2026-11-13); skip-links, focus-visible rings, `aria-*` conventions throughout. **IMPLEMENTED BUT NOT VERIFIED (no CI a11y gate).**
- **Performance posture today.** Site-wide WebP (195×2 files), GSAP on critical path still (`useReveals.js:2` static `gsap` import — Lighthouse perf **86**, a11y export **96**, target ≥90 unmet). **DOCUMENTED ONLY (partially fixed).**
- **Anonymous journey (M8).** `/account` "Track my booking" possession-based lookup; phone/country/idNumber stripped for unsigned readers; 28-room catalogue enforced web-side. **IMPLEMENTED AND VERIFIED (2ccffd9).**

## 4. Missing controls (compact list; details in §5)

Distributed rate-limit store · account-based throttling/lockout/captcha · Daraja callback authenticity (signature/IP/once-only constraint) · `POST /payments` per-reservation/attempt cap · shared job scheduler (Vercel Cron/GitHub Actions/pg-boss) · sweeper execution in production · error tracking · uptime alerting · log shipping/retention · email retry sweeper / outbox admin UI · production restore drill · RPO/RTO targets · automated migration apply in production · security headers for the SPA on Vercel · cookie signing (optional) · GDPR/erasure machinery · age/identity verification for ID capture · privacy consent management · build-time a11y/perf gates · Web rate limiting per-user for availability scraping · bot fingerprinting/captcha · payment-health alerting (currently passive report).

---

## 5. Vulnerabilities and operational weaknesses — severity P0→P3

### P0 — critical; block any real-money use

**M9-01 — Forgeable M-Pesa callback confirms a reservation without payment.** `POST /api/v1/webhooks/mpesa` (`payments/routes.js:92-157`): no request signing exists in Daraja, and verification here is (a) optional IP allowlist, **default disabled** (`env.js:56` — `MPESA_WEBHOOK_ALLOWED_IPS=''` unless explicitly set; empty in every known env file), (b) schema shape, (c) `CheckoutRequestID` lookup, (d) exact `Amount` match to `payment.amountMinor`. `checkoutRequestId` is returned to the caller at initiation (`routes.js:85`), reachable by anonymous callers carrying reference+email (`routes.js:24-25`). Chain: create booking → `POST /payments` → obtain id + know own amount → `POST /webhooks/mpesa` `{ResultCode:0, Amount:<own total>}` → `payment.status='succeeded'`, reservation `confirmed` — no money moved. Webhook also bypasses the global limiter entirely (`app.js:40-43`). *Evidence: code-read; reproduced by inspection, not execution.* **IMPLEMENTED BUT NOT VERIFIED (live).**

**M9-02 — Documented live deployment runs zero background jobs.** All unattended correctness machinery lives in `apps/api/src/server.js` (`SWEEP_INTERVAL_MS = 60s`, `server.js:11-117`: hold expiry + pending-reservation expiry + session purge; stale-payment requery `server.js:41-85`; arrival reminders `server.js:88-105`; eTIMS retry). Vercel's function entry is `src/app.js` (`export default createApp()`, `app.js:80`), which never `listen`s and never schedules. Therefore, on the deployment documented as live (D-067): holds never expire (inventory permanently "occupied" once held), reservation limbo never clears, payment-pending never re-queries, arrivals never get reminder emails (docs promise them — `docs/OPERATIONS.md:26`), eTIMS never retries. **DOCUMENTED ONLY at best; MISSING in production.**

**M9-03 — Payment success confirms zero-allocation reservations.** `confirmReservationTx` (`lib/confirm.js:5-20`) calls `promoteHoldAllocation` (`allocations.js:75-80`, `updateMany state='occupying' → reservation`) and ignores its result: if the hold expired before the callback (the normal failure mode), the reservation flips to `confirmed` with **no room allocated**, and the code has no status/allocation guard. Pair with M9-02 (holds never expire on Vercel) — under Docker it manifests; on Vercel it is masked by M9-02 itself. Neither outcome is safe. **IMPLEMENTED BUT NOT VERIFIED (untested path).**

**M9-04 — Confirmed booking with no payment is one staff click.** `PATCH /admin/reservations/:reference` permits `pending→confirmed` for receptionist/manager/admin (`admin/routes.js:169,188-214`) with **no payment artifact and no allocation promotion** (hold stays `kind='hold', expiresAt≈+15min`, then the sweeper flips it to `expired`, so the ledger shows the room free while the reservation reads confirmed) — test `m4.test.js:150` explicitly asserts 200. Fraud/error blast radius spans both money and inventory integrity. **DOCUMENTED INTENTIONAL ("authorized desk-settlement fallback") but without payment or ledger guarantees — OWNER DECISION REQUIRED on policy; IMPLEMENTED AND VERIFIED (code+test).**

### P1 — high; fix before any public/real-money posture

**M9-05 — In-memory rate limiter is per-process.** Both limiters use express-rate-limit's default `MemoryStore` (`middleware/index.js:81-96`); on Vercel each warm function instance counts separately; no Redis/Upstash store anywhere. Global 300/15 min ≈ unenforced per-IP for any multi-instance state. Docs claim "per IP + email" sign-in limiting (`docs/SECURITY.md:9`) — code is IP-only; no per-email/account throttle or lockout exists on any endpoint. **DOCUMENTED ONLY / MISSING (distributed store).**

**M9-06 — Unauthenticated inventory exhaustion.** `POST /reservations` is open to the internet (`reservations/routes.js:54`); each request burns room inventory as a 15-min hold. With M9-02, holds never clear. An attacker can lock out every bookable room with junk bookings using fresh `Idempotency-Key`s. No captcha, no per-email/per-phone velocity limit, only apiLimiter per IP. **IMPLEMENTED (accepted); MISSING mitigation.**

**M9-07 — `POST /payments` is unthrottled per reservation/provider.** No authLimiter, no per-reservation attempt cap, no phone-number cap (`payments/routes.js:28-87`). Any reference+email holder can fire unlimited real STK pushes at a victim's handset until IP cap binds. Harassment + Daraja quota burn. **IMPLEMENTED; MISSING controls.**

**M9-08 — Desk "manual payment" and refund paths are racy.** Desk: exact-amount check and cumulative-paid check are read **outside** the transaction (`routes.js:158-190`) → concurrent desk posts overpay a reservation. Refund: cumulative `refunded` aggregate also outside the transaction (`routes.js:253-262`) → concurrent refunds can exceed the capture. Both mitigate only with staff honesty. **IMPLEMENTED BUT NOT VERIFIED (TOCTOU real at code level).**

**M9-09 — Amount integrity is one-sided; requery paths never compare amounts.** Callback success requires amount equality (`routes.js:135`), but the failure side settles `failed` and releases inventory without question, and staff requery / sweeper confirm paths (`routes.js:213-223`, `server.js:52-60`) confirm **without any amount check** (Daraja query response carries no usable amount; value copied from our own row). A mis-entered booking total at callback time destroys the booking (payment `failed`, allocations released, guest charged → `payment-failed` email) with only a `logger.warn` and a manual reconciliation path. **IMPLEMENTED BUT NOT VERIFIED.**

**M9-10 — Concurrency at the callback: TOCTOU window.** Terminal-state check happens outside the transaction (`routes.js:105-115`); two simultaneous legitimate callbacks both observe pre-terminal state; both insert `paymentAttempt` rows (`providerReference` non-unique by design, `schema.prisma:384`) and both run the confirm transaction; reservation re-confirm and double audit rows result (email/eTIMS dedupe absorbs most harm). Not a forge, but a duplicate-charge ledger hazard. **IMPLEMENTED BUT NOT VERIFIED.**

**M9-11 — Email delivery is completely dark.** SMTP not configured in any environment (`env.js:57-63`; all known configs empty) → confirmation/reset/reminder mails recorded `skipped` (`email/index.js:33-38`); **no** admin endpoint/UI exposes `email_outbox` (grep: none); no retry for `pending`-stuck or `failed` rows (sweeper-less); password reset returns 503 to real users today. A paying guest can receive zero confirmation and nobody would know. **MISSING (production capability) / DOCUMENTED HONESTLY in code (`skipped`) but unmonitored.**

**M9-12 — No error tracking, alerting, or log retention.** Zero Sentry/Bugsnag/etc.; pino → stdout only; pino-http request ids are not propagated to audit rows, payment logs, or email logs (end-to-end correlation impossible); `console.error('[unhandled-error]', err)` (`middleware/index.js:112`) and `console.error('[google-oauth]')` (`google.js:165`) bypass the pino redactor; webhook IP-allowlist rejections are **unlogged** (`routes.js:95-97`); rate-limit 429s are unlogged; sweeper errors are `logger.error` to stdout with no counter/page. **MISSING.**

**M9-13 — Backups never tested on the real provider.** One restore drill executed, ever (local Docker, dev DB, 2026-11-11; `docs/BACKUP_RESTORE.md`). No Neon PITR verification, no off-site dump, no RPO/RTO definition, no managed-provider drill. COMMISSIONING Gate A/D explicitly requires PITR + restore drill on the production provider — undone. **DOCUMENTED ONLY; OWNER DECISION REQUIRED (provider capabilities).**

**M9-14 — No automated production migration path.** Vercel build runs `prisma generate` only (`vercel.json:15`); `migrate deploy` is never run against Neon by automation; schema drift is invisible. `migrate deploy` verified in CI/docker-compose reference paths only. **MISSING (operations).**

**M9-15 — Personal data: national ID stored with no special controls; no erasure machinery.** `guest.idNumber` (D-062); session ip/userAgent stored in `session` (`schema.prisma:233-234`); `payment_attempt.rawPayload` holds full Daraja JSON incl. MSISDN + receipt numbers; audit-log free-text notes can contain medical/PII detail; no GDPR/DPA-2019 access/export/erasure path anywhere (all rights are "WhatsApp us"); no retention/purge for any of these tables; ID captured but never validated or used for anything (dead weight with liability). **MISSING controls; OWNER DECISION REQUIRED (privacy policy, retention periods, lawful basis).**

**M9-16 — eTIMS/KRA invoicing is dormant and flag-mismatch.** `ETIMS_ENVIRONMENT` default `disabled`; `etimsEnabled` env flag exists (`env.js:68`) but is never consulted by the provider selector (`etims/index.js:20-22`); invoices would record `skipped`; retry sweeper only in `server.js` (M9-02) and `OPERATIONS.md:51` claims "hourly" while code retries every 60 s. **DOCUMENTED ONLY (docs contradict code) / MISSING (compliance).**

**M9-17 — Outbox/background failure visibility (beyond M9-11/12).** `sweepArrivalReminders`/invitee writes happen in-request or via the dead sweeper; a failed reminder is never retried (dedupeKey blocks resend even after fix); `email_outbox` rows are not a queue (nothing drains them). **IMPLEMENTED AS NON-GOAL; MISSING delivery guarantees.**

**M9-18 — "Failed callbacks destroy bookings" (threshold effects).** See M9-09; plus: `afterFailed` run post-commit, `payment-failed` email best-effort; if SMTP configured but fails, guest unaware (M9-11). **IMPLEMENTED BUT NOT VERIFIED.**

### P2 — medium

**M9-19 — User enumeration.** Registration returns explicit `"An account with this email already exists."` (`auth/routes.js:22-23`); sign-in has a timing oracle (bcrypt only when user exists, `routes.js:49-53`) and a disabled-account distinct message (`routes.js:55`); cancel route returns 404-vs-403 split (`routes.js:129-130`); anonymous reservation read moves the existence oracle to `?email=` (`reservations/routes.js:100-124` — documented intentional, still an oracle). All are authLimiter-capped IP-wise only. **IMPLEMENTED (accepted); partially mitigated.**

**M9-20 — Rate-limit bypass and validation blind spots.** `trust proxy: 1` is hardcoded (`app.js:31`); `TRUST_PROXY` env/docker compose config is dead documentation. On Vercel, whether client XFF is properly overwritten by the edge is **unverifiable from this repo**; misconfiguration collapses or spoofs per-IP bucketing. IPv6 bucketed by /56 by express-rate-limit v8 default (good). Webhook path bypasses limits entirely by design (provider retries) — correct but requires M9-01 fix to be safe. `/ready` is an unauthenticated `SELECT 1` amplifier. **IMPLEMENTED; verification UNRESOLVABLE from repo.**

**M9-21 — Availability and admin hot paths are unindexed/quadratic.** Availability SQL does a correlated `NOT EXISTS` per room with **no btree index on `room_allocation.room_id`** and no `state` predicate index (`routes.js:62-74`, `allocations.js:25-30`); admin dashboard hydrates **all** history then filters in memory (`admin/routes.js:25-45`); financial summary recomputes the same unindexed outstanding-balance subquery twice (`routes.js:561-589`); occupancy loop is O(days×allocations) (`routes.js:391-414`). Fine today (28 rooms); will not stay fine with seasons of history. **IMPLEMENTED BUT NOT VERIFIED (no index DDL added).**

**M9-22 — Connection pool uncontrolled.** Defaults of `pg`: `max=10`, no `idleTimeoutMillis`/`connectionTimeoutMillis` tuning, no `statement_timeout`; "pool max 10" docs (COMMISSIONING.md:77,139,157) merely restate the default; on serverless each instance opens its own pool against the free-tier Neon pooler; exhaustion → hung requests until Node's default requestTimeout (300 s) — `server.listen` sets **no** timeouts at all (`server.js:108`); no graceful drain on Vercel (platform-managed, SIGTERM contract unverified). **IMPLEMENTED (defaults); MISSING configuration.**

**M9-23 — CSRF posture is incidental, not designed.** No CSRF tokens anywhere (grep zero); mitigated by SameSite=Lax + single-origin CORS + JSON-only parsing (form POSTs fail Zod). **Adequate today; undocumented as a control; breaks silently if any endpoint ever accepts non-JSON bodies.** *OWNER DECISION REQUIRED* to formalize; P3-adjacent but classified P2 for drift risk.

**M9-24 — Google OAuth does not verify an ID token.** Flow exchanges code → fetches `userinfo` over TLS; never checks `aud`/`iss`/`exp`, no nonce, no PKCE; linking is by `email_verified` only; staff cannot obtain staff role through Google (correct); `google-auth` dormant until env set (D-067). **IMPLEMENTED (non-OIDC-conformant); acceptable for current use but not OIDC — document or upgrade.**

**M9-25 — CSP/headers: Vercel SPA path has none; nginx prod default lacks HSTS.** `vercel.json` has no `headers` block → no CSP/XFO/nosniff/Referrer-Policy/HSTS for HTML on the deployed site; nginx `deploy`/staging variants include HSTS but default `apps/web/nginx.conf` does not; helmet covers only API responses (its default CSP, `app.js:32-35`). **MISSING/DOCUMENTED ONLY (per deployment path); P2.**

**M9-26 — Logging PII hygiene gaps.** `maskPhone` defined never called (`logger.js:31`); `maskRef` used only at payment callbacks (`payments/routes.js:112,146`); `email_outbox.dedupeKey` logs refs in cleartext (`email/index.js:21,36,48,52`); `console.error` bypasses redaction (`middleware/index.js:112`); session table stores ip+userAgent (`schema.prisma:233-234`); audit notes are free text incl. possible health PII (`admin/routes.js:512`). **IMPLEMENTED (partial); P2.**

**M9-27 — No retention or partitioning anywhere** (sessions, tokens, outbox, attempts, audit log, enquiries, newsletter) — unbounded growth and backup weight. **DOCUMENTED ONLY; MISSING policy hooks.**

**M9-28 — Schema/doc falsehoods.** `schema.prisma:173` comment claims citext case-insensitivity — migration reverted emails to TEXT (`20261110225355_enquiries_newsletter:2-5`); `OPERATIONS.md:51`/`admin/routes.js:734` say "hourly retry" — code is 60 s; `SECURITY.md:9` "per IP+email" — code is IP-only; `docs/DATABASE_DESIGN.md`/`D-016` "availability filters lapsed holds" — **not implemented** in `rooms/routes.js:62-74` or `allocations.js:25-30`; `DEPLOYMENT.md:36` session-invalidation — corrected 2026-11-13 (verified). **DOCUMENTED ONLY / incorrect; integrity risk to future work.**

**M9-29 — Website availability/SEO/social surfaces weak.** No `sitemap.xml`, no canonical/`og:*`/`twitter:*`/JSON-LD; `robots.txt` exists; `llms.txt` present; index.html has description only; fonts lack `rel=preload`; no `.browserslistrc`. **DOCUMENTED (audit P2s open); P2 for launch polish.**

**M9-30 — Testing gaps are exactly where the risk lives.** No rate-limit test (limits raised to 10000 in `tests/setup.mjs:15` — deliberately untestable), no brute-force/lockout/credential-stuffing suite, no webhook-forgery test, no sweeper tests, no DB-outage unit test (only manual `tests/release-rehearsal.mjs` S17, never in CI), no security-headers test, no web tests at all, no CI a11y/Lighthouse gate. **MISSING coverage for every P0/P1 control above.**

**M9-31 — Client bundle: GSAP still on the critical path.** `ci.yml` build gates fine, but Lighthouse perf **86** (live) / **58** (M7 lab) vs ≥90 target; `PublicLayout.jsx` statically imports `useReveals` → static gsap (`useReveals.js:2`); the 27a8ff3 lazy-load covered only the hero intro. Total JS ~462 KB uncompressed route-initial. **DOCUMENTED (audit P1-13 "kill static gsap import" — open, partially shipped 27a8ff3); P2.**

**M9-32 — Duplicate `guest` rows on password registration.** `register` always creates a new `guest` row (`auth/routes.js:25-38`) instead of linking a pre-existing booking-guest row by email (the Google path does link correctly — `google.js:62-104`). Creates duplicate PII rows for the same human over time. **IMPLEMENTED (benign, no security impact); P3.**

**M9-33 — Cancel-path existence oracle, `notFoundHandler` reflection, and missing Content-Type assertion.** `/reservations/:reference/cancel` returns 404-vs-403 split (`reservations/routes.js:129-130`); `notFoundHandler` echoes method + path into JSON (`middleware/index.js:116-117`, attacker-controlled string); no write route asserts `Content-Type: application/json` (parse failures fall through silently into Zod, effectively failing closed today). None exploitable now; drift hazard if bodies are ever read raw. **IMPLEMENTED (accepted); P3.**

### P3 — low / hygiene

- **M9-34** `maskPhone` dead export; `email/index.js` dead `maskRef` import; `PasswordResetToken`/`Session.absoluteExpiryAt`/`Payment.createdAt`/`PaymentAttempt.status|paymentId|reservationId` unindexed; redundant duplicate `tax_invoice.reservationId` indexes. 
- **M9-35** `Hotel` singleton not enforced by CHECK constraint; `hotel` row unused by app code (web uses static data.site) — dead schema weight.
- **M9-37** `/auth/session` always-200 probe (by design); information-free — fine.
- **M9-38** No favicon/404 mismatch issues; NotFound original typographic (M8) — accepted.
- **M9-39** `console.error` also used for Google OAuth config errors — minor log hygiene, covered M9-12/26.
- **M9-40** `admin.settings.hotel.rooms` static label 32 vs reality — deliberate M8-documented interim (see DECISIONS D-075); 28 only after Phase A/B + maintenance rooms return.
- **M9-41** `Deployment protection / preview toggle / branch lock / log drain` for the live Vercel project — unverifiable from repo; **OWNER DECISION REQUIRED** to inspect dashboard.
- **M9-42** Container images: floating `node:22-alpine` tags (not digest-pinned); nginx reference stack non-root not enforced (workers are; master root — stock).
- **M9-43** Docs/code drift inventory (see M9-28) — keep corrected docs as part of every future milestone.

## 6. Severity classification

| Class | Count | IDs |
|---|---|---|
| **P0** Critical | 4 | M9-01 (forgeable callback), M9-02 (no background jobs in production), M9-03 (confirmed without allocation), M9-04 (confirmed without payment) |
| **P1** High | 14 | M9-05 (per-instance rate limiting), M9-06 (inventory exhaustion), M9-07 (unthrottled STK push), M9-08 (desk/refund TOCTOU), M9-09 (amount integrity one-sided), M9-10 (callback concurrency), M9-11 (email dark), M9-12 (no error tracking/alerting/retention), M9-13 (no managed-provider restore drill), M9-14 (no automated prod migrations), M9-15 (PII/ID/retention), M9-16 (eTIMS dormant + doc drift), M9-17 (outbox/reminder delivery), M9-18 (failed-callback bookings destroyed) |
| **P2** Medium | 13 | M9-19 (enumeration oracles), M9-20 (proxy trust/verification), M9-21 (indexing/quadratic paths), M9-22 (uncontrolled pool + no timeouts), M9-23 (incidental CSRF), M9-24 (non-OIDC Google), M9-25 (headers: Vercel SPA / nginx default), M9-26 (PII in logs), M9-27 (no retention anywhere), M9-28 (schema/docs falsehoods), M9-29 (SEO/social/a11y gaps), M9-30 (test gaps at the P0/P1 controls), M9-31 (GSAP critical path, perf 86 < 90 target) |
| **P3** Low | 11 | M9-32 (duplicate guest rows), M9-33 (cancel oracle / reflection / content-type), M9-34 (dead `maskPhone`, dead import, missing indexes, duplicate tax_invoice index), M9-35 (`Hotel` singleton), M9-37 (`/auth/session` ok), M9-38 (NotFound fine), M9-39 (Google config error logs), M9-40 (`admin.settings` 32-vs-28 interim), M9-41 (Vercel dashboard unverifiable), M9-42 (container floating tags), M9-43 (docs/code drift — see note below) |

M9-43 carries the recurring theme: **docs/code drift is an operational liability** — every milestone since M7 recorded claims the code does not meet (rate-limit per email, hold filtering, hourly retries, session invalidation). Any doc correction introduced from here (M8 pattern: minimal diff, show git diff, verify against code) should be treated as a standing acceptance item, not a one-off.

## 7. Rate-limiting & abuse — endpoint-specific recommended policy

Targets: **(a) no legitimate user noticeable**, **(b) no silent catastrophic lockouts**, **(c) fail closed for abuse**. All limits keyed **per IP + per account/phone where applicable**, backed by a **shared store** (Redis/Upstash) — not in-memory.

| Endpoint (method path) | Auth | Recommended policy | Notes |
|---|---|---|---|
| GET `/room-types`, `/availability`, `/quotes` | none | 300/15min IP; +50/15min burst cap; quotes additionally 30/15min **phone/email-keyed** after first quote (storage free) | Prevents occupancy scraping & quote farming; page ISPs fine at 28 rooms |
| GET `/reservations/:reference` | none (+email leg) | 60/15min IP; **10 failed lookups** → 1h cool-down; log rejections | Reference+email oracle needs friction |
| POST `/reservations/:reference/cancel` | session | 30/15min IP + per-account 10/15min | |
| POST `/reservations` | none | 20/15min IP **and** 5 active `pending` reservations per email/phone; captcha after Nth attempt; 409-with-honest-message on cap | Kills inventory exhaustion; keep anonymous flow |
| POST `/payments` | none | **5 STK pushes / reservation / day**, 20/day per phone; authLimiter-style skip-on-success; alert on cap hit | Directly mitigates STK flooding (M9-07) |
| POST `/webhooks/mpesa` | none | Keep **no rate limit** (providers retry) — replace the allowlist dependency with M9-01 fix (IP allowlist default-set + once-only constraint) | Do not "fix" by rate-limiting Safaricom |
| POST `/auth/sign-in`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | none | **Per-IP 10/15min AND per-email 10/15min**; account soft-lock after 10 fails (uniform response preserved); captcha optional | M9-05; keep `skipSuccessfulRequests: true` behavior |
| GET `/auth/google*` | none | 30/15min IP | State cookie already CSRF-guarded |
| POST `/enquiries`, `/newsletter` | none | 10/15min IP; per-email 3/day for newsletter; no list-install reads | Stops newsletter bombing |
| GET `/admin/*` | staff | 300/15min IP (unchanged); **per staff session** audit write on mutation already exists | Fine; no change needed |
| GET `/ready` | none | Keep unauthenticated (orchestrator) but **no DB** — move to cached liveness+shallow DB ping with 30 s memo | M9-20 mitigations without lying to orchestrators |
| Global | — | Environment-tuned; alert when any key hits 429 > N/hour | Today: zero visibility (M9-12) |

Implementation order: (1) fix M9-01; (2) shared store + per-key limits on auth/reservations/payments; (3) observability counters; (4) captcha only if abuse persists — do not pre-install friction.

## 8. Data protection & recovery — recommended controls

**Immediate (P0/P1-adjacent):**
1. Restore Neon backup evidence: enable/verify PITR window on the production project; drill `pg_restore` into a scratch project; log counts (mirror the 2026-11-11 local drill against the *managed* provider) — closes M9-13. **OWNER action.**
2. Off-site `pg_dump -Fc` weekly to object storage (any bucket) with 30-day + 12-month retention; automate; verify sha256. **OWNER decision on provider.**
3. Define RPO/RTO targets in writing (e.g. RPO ≤ 24 h, RTO ≤ 4 h for a 28-room property) — currently undefined. **OWNER DECISION REQUIRED.**
4. PII minimization: drop `guest.idNumber` from capture flow (unused) **or** encrypt-at-rest with access review; purge `payment_attempt.rawPayload` on success+90 days (keep hash only); stop logging/Storing session ip+userAgent beyond 30 days; scrub `audit_log` notes PII at write time where feasible. Classification: P1 task.
5. Erasure/access tooling: even a scripted `export + anonymize` runbook (manual WhatsApp intake → psql by staff with audit trail) closes the DPA-2019/GDPR gap honestly; retention schedule per table (sessions 30 d after logout, reset tokens on use, outbox 180 d, attempts 12 months, audit indefinite or 7 years for financial). **OWNER DECISION REQUIRED (legal review).**
6. Backup of prod never leaves provider boundary until encrypted; keys in Vercel env only.
7. Immutability hardening: `audit_log` insert-only enforced at DB (no UPDATE/DELETE for app role via REVOKE; or separate role for audit writes); `reservation`/`payment` no DELETE ever (FKs already RESTRICT — keep; add REVOKE DELETE for app role; belt-and-braces vs M9-04 abuse).
8. Validation of ID: if `idNumber` retained, format-check on capture; never log it; admin display masked (`99••••4567`).
9. Session table hygiene job (self-host path or Vercel cron): purge absolute-expired rows nightly; idle-expired handled request-time — document.
10. One-way hash for outbox `to` where full address not needed? Keep `to` for ops; mask in UI.
11. Confirm Neon free tier plan limits & PITR window; upgrade only on owner approval (no spend authorized by this audit).

## 9. Monitoring & alerting — minimum viable operator coverage

**Detect these within 5 minutes:**
- API `/ready` failing (uptime probe, e.g. UptimeRobot free or Healthchecks.io free — **owner must pick one**, P0.8 in COMMISSIONING).
- 5xx rate > 2% of requests for 5 min (Vercel Analytics or a log-drain → free tier of any log service, or pino→stdout + Vercel log drain to e.g. free BetterStack/Grafana Cloud).
- Any 429 density anomaly (brute force): counter for `rate_limited` events.
- Payments: `stale_pending_payments` > 0 for > 60 min; `amount_mismatches` > 0; `succeeded_sum_mismatch` ≠ 0 (payment-health job exposed via admin today — needs to be a **poll with alert**, not a manual view).
- Auth: failed sign-in spike per IP/account (log-derived).
- Sweeper health: last-success heartbeat timestamp for whichever mechanism runs holds/payments/reminders (e.g. heartbeat row in `setting` or BetterStack heartbeat URL) — answers M9-02 with evidence.
- Reconciliation drift: weekly scheduled job diffs `payment_attempt` vs provider settlement (M-Pesa Daraja `query` API — owner authorization for live calls still required).
- Certificate/TLS expiry (Vercel handles).
- Backup freshness: last successful dump timestamp alert (>48 h = page).

**Explicitly configured today: nothing of the above.** Only `/api/v1/ready` spot-checks and CI deploy-time poll+rollback for staging. **DOCUMENTED ONLY.**

Minimum ownership chain: named human on-call, private channel, written runbooks for (a) ready=503, (b) sweeper silent, (c) amount mismatch, (d) email outage, (e) Neon down. **OWNER DECISION REQUIRED (who + how paged + costs).**

## 10. Recommended remediation roadmap

**Phase 0 — stop the bleed (owner-authorized), target ≤ 3 days:**
1. Rotate the exposed Neon password (M8 §2 procedure); keep `MPESA_ENV=sandbox`; confirm no SMTP or KRA activation without authorization.
2. **M9-01 fix**: set `MPESA_WEBHOOK_ALLOWED_IPS` to Safaricom's published callback ranges **and** add a DB-level single-settlement constraint (`payment_attempt(providerReference, status='succeeded')` partial unique, or terminal-state compare-and-swap inside the transaction) — closes forgery *and* replay. (Sandbox until Safaricom IP list confirmed; owner provides.)
3. **M9-02 fix**: move sweeper work off `server.js`-only. Options (owner decides): (a) Vercel Cron (Hobby supports daily — insufficient for 15-min holds), (b) GitHub Actions scheduled workflow (5-min cadence, free, but — no DB write from CI against production without care; needs credentials management), (c) long-running Docker/Fly/Render instance (best fit; re-opens the Render option or cheapest VPS), (d) in-process `setInterval` on a paid/always-on instance. **Recommend (c).** Until then, treat the site as **not accepting/relying on holds** — disable reservation creation OR keep concept-mode clearly labelled (current posture).
4. **M9-11 fix**: configure SMTP (or explicitly document mails are `skipped` and hide guest messaging about emails — current behaviour, accept consciously).

**Phase 1 — payment/booking integrity (week 1–2):** M9-03, M9-04 (owner policy decision: desk confirm without payment → forbid via code, or gate behind `featureDeskOverride` + mandatory reason + alert), M9-07, M9-08 (move aggregates into transactions), M9-09 (reverse-lookup verification: requery amount before confirm), M9-10 (CAS on payment status), M9-12/structured correlation ids, sweeper heartbeat.

**Phase 2 — abuse & visibility (week 2–3):** M9-05 (Upstash or similar; per-IP+email), M9-06/07, M9-20 (proxy chain verification with Vercel), M9-12/26 (Sentry free or equivalent — owner picks), M9-13 (PITR drill), M9-14 (documented manual `migrate deploy` checklist or CD step), M9-19/US enumeration hardening, M9-25 headers (Vercel `headers` block), M9-30 test expansion.

**Phase 3 — compliance & polish (week 3–4):** M9-15 (PII minimalization + retention + erasure runbook), M9-16 (KRA/eTIMS decision — probably defer; document as out of compliance scope with owner), M9-21 (indexes: `room_allocation(room_id, state, check_in, check_out)`, `payment(createdAt)`, `payment_attempt(status)`; rewrite occupancy to bounded SQL), M9-22 (pool config + `server.timeout` etc.), M9-29/31 (sitemap/OG/preload/gsap), M9-30 full test matrix.

**Phase 4 — readiness gates:** restore-drill evidence, PITR verified, monitoring paged once in anger (test), rollback rehearsed (tag → previous release → verify), privacy note refreshed, and **only then** revisit production GO (owner).

## 11. Dependencies and infrastructure costs (where verifiable)

| Item | Status/cost |
|---|---|
| Vercel Hobby plan | Free; limits unverified in repo (deployments/day, bandwidth) — dashboard-only |
| Neon free tier | In use; plan limits (storage ~0.5 GB, compute hours, PITR window) **unverifiable from repo** — inspect Neon dashboard |
| Email provider (any SMTP) | Not configured; owner to choose; cheapest path (Mailgun/SendGrid/SES free tier or Postmark ~USD 15/mo at volume) |
| Upstash Redis (rate limiting) | Not used; free tier exists (10k cmds/day-ish); sufficient at 28-room scale — **OWNER decision** |
| Error tracking (Sentry free) | Not used; free tier 5k errors/mo class — **OWNER decision** |
| Uptime monitoring (UptimeRobot/Healthchecks) | Commissioned item P0.8 **unset**; free tiers suffice — **OWNER decision** |
| Object storage for backups (S3/R2/B2) | Not used; ~USD 0.02/GB — **OWNER decision** |
| CI | GitHub Actions minutes — current usage fine on public/private limits |
| Load test tooling | `autocannon` (dev dep) + `tests/load-test.mjs` exist; uncosted rerun possible locally |
| Trivy in CI | Free (OSS) |
| Testing | Vitest/Playwright/axe-core already in devDeps — no new cost |

## 12. Owner decisions and unresolved questions (this audit will not make them)

1. Production GO or continued concept-demo status (D-067 never recorded an owner GO; currently `27a8ff3` live unauthorized-ish — posture documented, not green-lit).
2. Deployment topology: keep Vercel+Neon (requires jobs solution, §10 Phase 0.3) **or** Render/Fly/VPS Docker (`server.js` path, jobs work today) — cost + ops burden trade.
3. M-Pesa Daraja onboarding: owner must register, get production credentials, test in sandbox→production progression; this audit changes nothing.
4. Desk payment / admin confirm-without-payment policy (M9-04) — keep, restrict, or forbid.
5. SMTP provider + `EMAIL_FROM` domain + SPF/DKIM/DMARC (with owner’s DNS).
6. Privacy policy legal review (Kenya DPA 2019 + GDPR if any EU guests; ID handling; retention; cookies/consent; marketing).
7. Monitoring budget & paging ownership (who’s on call; free tiers vs paid).
8. Preview deployments for Vercel (cost/enablement; branch protection; env isolation).
9. `admin.settings.hotel.rooms` timing (28 only after Phase A/B + maintenance restored; D-075).
10. PITR/backup plan tier on Neon (may require paid tier for longer window — verify).
11. Cookie-signing defence-in-depth (explicit owner decision to adopt or formally accept current opaque-token design; M8 §3.3/§7 records the open option).
12. Neon password rotation completion — owner action, pending.
13. 404/error-page and a11y sign-off (export shows a11y 96, not the brief’s "100" claim — both retained; owner to restate target).

## 13. Test evidence and commands executed

- `npm audit --audit-level=high` → **3 moderate** (dev-only `autocannon`→`uuid/hyperid`); zero high/critical. (2026-11-13)
- Live (read-only, unauthenticated) checks: `GET /api/v1/ready` → `{"ok":true,"service":"stillhouse-api","db":"up"}` (11:37 UTC); `GET /` bundle inspected — confirms **27a8ff3 deployed, 2ccffd9 not** (M8 readiness §5.1 evidence); route chunks lack M8 markers.
- Repository: full greps (all findings cite files/lines); Git history scan clean for secret patterns (this session); `git grep -n -i 'invalidat'` / `SESSION_SECRET` sweep.
- Automated test suite exists (9 files, 58 tests, all green at `2ccffd9` — **not re-run in this audit; read-only mandate**); gaps catalogued M9-30.
- No tests executed against production; no M-Pesa endpoint called; no database connection opened in this audit session (M8 production reads earlier this session were read-only SELECTs under separate authorization and are not repeated here).

## 14. Final production-readiness assessment

| Question | Answer |
|---|---|
| Safe for real guest PII retention today? | **No** — no access/erasure tooling, no retention, ID dead-weight, backups unverified (M9-13/15). |
| Safe for real M-Pesa payments today? | **No** — forgeable callback (M9-01), sweeper-less (M9-02), zero-allocation confirms (M9-03), no requery coverage on serverless, no monitoring. |
| Safe as a demo/concept property? | **Yes** (with the current posture: sandbox payments, honest "concept property" disclosure, no email claims) — exactly what M8 shipped and the owner approved for presentation. |
| Safe to accept real bookings processed at the desk (cash/MP-e manually)? | Only after M9-02/04 decisions and a locked-down admin override policy, plus sweeper correctness — **not today**. |
| Engineering quality bar (tests, docs, integrity design)? | **Strong** — exclusion constraint, reservation idempotency, CAS transitions, honest logging, 58 green tests, correct readiness path. The gap is operational, not motivational. |
| Closest blocker to "production" | M9-02 (jobs/deployment topology) — it silently invalidates holds, reminders, stale-payment recovery and invoice retry. |

**Bottom line.** The Stillhouse is a well-engineered pre-production system whose brief was "prove a booking platform can be built carefully and honestly" — and it is. It is not a hardened production payment system and must not be sold as one. The distance is now measured in specific, enumerated, fixable items (§10), each with an owner. **No production GO should be recorded before M9-01, M9-02, M9-03/04, M9-11/12 close, and before the backup drill and monitoring exist on the live provider with a paged human behind them.**
