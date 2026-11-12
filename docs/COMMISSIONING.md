# THE STILLHOUSE — Production Commissioning Roadmap

**Prepared:** 2026-11-12 · **Baseline:** `main` @ `cee2a11` (remote in sync) · **Scope:** documentation ONLY — nothing here authorizes any production action.
**Authoritative inputs:** `docs/reports/M7.md`, `docs/reports/MPESA_SANDBOX_STK_ACCEPTANCE.md`, `docs/reports/M6.md`, `docs/FINAL_ACCEPTANCE.md`, `docs/STAGING.md`, `docs/RELEASE_CHECKLIST.md`, `docs/BACKUP_RESTORE.md`, `docs/TAX_AND_CHARGES.md`, `docs/OPERATIONS.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md` (D-050..D-061).
**M-Pesa status at baseline:** sandbox OAuth verified; one sandbox STK Push initiated; **owner-cancelled on handset**; cancellation callback verified idempotent; **success path NOT live-verified** (no sandbox PIN entered, no `confirmed` transition observed outside mocks).

## 0. How to read this document (evidence discipline)

## 0.1. Provider research (2026-11-12) — PROPOSED, awaiting Leon's sign-off

(See also `docs/PHASE_1_DEPLOYMENT_BLUEPRINT.md` — Render reference design, and `docs/RENDER.md` — Render-native build/activation procedure including vhost, build args, and envsubst contract. Both PROPOSED until Leon approves.)

All recommendations below are the researched outcome of Phase 0.1 (this document update), not decisions. Nothing here is authorized until Leon signs P0.x rows in §2. Prices fetched/verified 2026-11-12; FX ≈ 1 USD = KES 129.97. Costs are indicative, not quotes.

**Recommended integrated stack (PROPOSED):** Render (web service + Postgres) **or** Railway+Neon as the alternative; domain via a KeNIC-accredited registrar (.co.ke) or global (.com); Postmark or Amazon SES for email; UptimeRobot Free for uptime; managed backups at the database provider; M-Pesa stays **sandbox** until 2.3. Full comparison tables: see evaluation report (2026-11-12 chat) and the DEPLOYMENT/STAGING docs.

**Key findings**
- Hosting: Render Developer-docs/pricing (render.com/pricing, fetched 2026-11-12): Hobby $0 workspace + compute (web 0.5¢-512MB $7/mo, 1¢-2GB $25/mo; Frankfurt EU region available; zero-downtime deploys + instant rollback; PITR on Postgres (3d Hobby / 7d Pro)). Railway (railway.com/pricing, fetched 2026-11-12): Hobby $5/mo incl. $5 usage + usage-based ($10/GB RAM, $20/vCPU/mo); no Africa region; managed PG not a PITR product (use Neon). Fly.io (fly.io/docs/about/pricing, fetched 2026-11-12): no Africa region; lowest-cost Machine ~$2.19 in iad/ewr but Frankfurt ~$7.73 for 512MB (region-specific); Managed Postgres Basic $38/mo; egress to Africa $0.12/GB — expensive for Kenya-origin traffic; no free tier.
- Managed PG: Neon (neon.tech/pricing, fetched 2026-11-12): Launch ~$0.106/CU-hour, published intermittent-load estimate ~$15/mo; instant restore $0.20/GB-month (PITR up to 7d Launch / 30d Scale); PG16 supported; pooled connections; scale-to-zero (disable on prod Launch). Render PG: 0.1¢-256MB $6/mo, 0.5¢-1GB $19/mo, PITR 3d (Hobby workspace) / 7d (Pro). AWS RDS for PostgreSQL: instance-hours region-specific; pricing page deferred to AWS calculator (not quoted — JS tables not capturable verbatim); af-south-1 (Cape Town) exists; biggest ops overhead; overkill at this scale.
- Domain: .co.ke via KeNIC-accredited registrars ~KSh 299–999 first year / ~KSh 1,500–2,350 renewal (truehost.co.ke, hostafrica.ke, fetched 2026-11-12); .com ~KSh 2,990/yr (per Hostafrica retail). KeNIC wholesale .co.ke is KSh 999+VAT since Feb 2025 (CircleID, 2026-02-03 KeNIC notice referenced there).
- Email: Postmark Basic $15/mo (10k emails, 45-day retention); Mailgun Basic $15/mo (10k incl. + extras); Amazon SES à la carte ~$0.10/1k (cheapest class; requires SES production access request; 0→10k/mo ≈ $1). SES Essentials plan pricing applies to new accounts (from 2026-07-21).
- Monitoring: UptimeRobot $0 free (50 monitors, 5-min interval — sufficient for 28-room property); Solo $9/mo annual ($10/mo) for 1-min intervals + SSL monitor.
- VPS option (Hetzner-class): adequate if Leon self-manages PG backups — **rejected by D-050 (managed PG required)**; not recommended for this owner profile.
- Latency: no Africa region on Render/Railway/Fly; Kenya→Frankfurt/Paris ≈ 150–250ms RTT — acceptable for booking flows; must be re-verified from Kenya on the public staging URL before launch.
- Daraja callback consequences: Daraja callbacks must reach `https://<domain>/api/v1/webhooks/mpesa`; IP allowlist via `MPESA_WEBHOOK_ALLOWED_IPS` once Safaricom publishes production callback IPs; public reachability mandatory.

**PROPOSED (not approved):** P0.2/P0.3 — host 1× Render web service (1¢-2GB) + Render Postgres 0.5¢-1GB (workspace Hobby or Pro — Leon's call); P0.4 — registrar to Leon's preference (.co.ke recommended for Kenyan market; ~KSh 1,500/yr renewal); P0.7 — Postmark $15/mo Basic (SES as cheaper fallback if Leon wants the process); P0.8 — UptimeRobot Free initially; P0.5 — sandbox stays; Leon decides production go-live after sandbox E2E.



| Label | Meaning |
|---|---|
| **VERIFIED** | Observed with our own eyes on this machine / CI, with artifacts recorded |
| **REHEARSED** | Executed against the local isolated stack (`https://staging.stillhouse.local:8443`, self-signed); not a public deployment |
| **NOT VERIFIED** | Code exists and is unit-tested with mocks, but has never touched a live provider/KRA/SMTP/public URL |
| **OWNER-GATED** | Requires Leon's money, legal judgement, credentials, or signature; engineering cannot close it |
| **UNSET** | No decision made yet |

Nothing in this document marks a gate as passed. A green CI run is **not** evidence of production readiness.

## 1. Non-negotiable boundaries

1. Arena AI frontend preserved; no redesign, no new frontend, no route/feature changes without an explicit decision log entry.
2. PostgreSQL 16 + Prisma + existing booking architecture unchanged; migrations stay **additive-only**.
3. No dependency swaps; no framework upgrades. Security posture (M2–M7) never weakened; no new suppressions without sign-off.
4. **M-Pesa stays `MPESA_ENV=sandbox`** until (a) Safaricom production go-live approval, (b) Leon's explicit written authorization, (c) a Leon-authorized Z-1-style KES 1 live transaction.
5. No production reservations or guest data may be used as fixtures, anywhere.
6. No credentials, tokens, passkeys, private keys or real personal numbers in git, docs, chat, images or logs.
7. No public staging/production deployment by engineering action alone — owner commissioning + Gate sign-off required.
8. No M-Pesa production cutover, no KRA eTIMS invocation, no real email to guests until the corresponding gate passes.

## 2. Phase 0 — Owner decision register

Owner: **Leon** unless marked otherwise. Status as of 2026-11-12 is **UNSET** for all of these. "Closes with" = the evidence that converts the row to DECIDED.

| # | Decision | Why it matters / what breaks without it | Options (established) | Dependencies | Current | Closes with |
|---|---|---|---|---|---|---|
| P0.1 | Hotel operational & legal readiness for real trading (permits, licences, trading name, staff, insurance) | A live site taking real bookings before the property may trade is illegal exposure | — (business fact, not an engineering option) | None | PROPOSED — awaiting Leon (§0.1) | Written statement from Leon/accountant that the property may legally trade |
| P0.2 | Hosting provider for staging/production (Fly.io / Railway / Render / VPS-class, EU region closest to Kenya per D-050) | No host, no public URL; affects ops model and cost | D-050 options; `docs/DEPLOYMENT.md` §recommended | P0.4 (domain) partially | PROPOSED — awaiting Leon (§0.1) | Signed hosting account + chosen plan + region; cost recorded (not in this repo) |
| P0.3 | Managed PostgreSQL 16 provider with automated backups + PITR (Neon/Render/RDS-class) | No verified restore = no launch; self-hosting rejected (D-050) | Neon / Render PG / AWS RDS / provider-native add-on | P0.2 (same or sibling provider) | PROPOSED — awaiting Leon (§0.1) | PITR enabled **and** a restore drill logged against it (not local docker) |
| P0.4 | Domain + registrar (e.g. `thestillhouse.co.ke` / `staging.<domain>` for staging) | HTTPS callback URLs, browser trust, brand | Any accredited registrar | P0.2 (DNS target) | PROPOSED — awaiting Leon (§0.1) | Domain registered; DNS A/AAAA resolves to host (`dig` evidence) |
| P0.5 | Daraja **production** application + Safaricom go-live process (start now — approval has lead time) | Sandbox is not production; no real money until certified | Safaricom Daraja portal (developer.safaricom.co.ke); `docs/ACTIVATE_MPESA.md` | P0.4 (production callback URL), P0.1 | PROPOSED — awaiting Leon (§0.1) | Safaricom approval in writing; `MPESA_ENV=production` set **only by Leon** |
| P0.6 | Accountant + tax sign-off (VAT s.13(7) SC distribution agreement or instruction to price VAT on SC-inclusive base; VAT tax point on deposits; Tourism Levy base; Finance Act 2026 Cap. 476 check) | Tax is a legal precondition for real money; wrong recipe = KRA exposure | `docs/TAX_AND_CHARGES.md` (binding research, not advice) | P0.1 | PROPOSED — awaiting Leon (§0.1) | Written accountant approval; any `TAX_POLICY` change executed + re-tested + archived |
| P0.7 | SMTP provider (own mail server / Mailgun / Postmark / SES / similar) + SPF/DKIM/DMARC alignment; sender identity | Guest mail, admin alerts; deliverability below par = lost bookings | `docs/ACTIVATE_EMAIL.md` | P0.4 (sender domain) | PROPOSED — awaiting Leon (§0.1) | Live SPF/DKIM/DMARC pass for one test mailbox; send + failure-path evidence archived |
| P0.8 | Monitoring + named incident responder (who reads the page at 03:00?) | Alerts with no human = zero uptime guarantee | Free-tier uptime probe + provider notifications; or host-native monitoring | P0.2 | PROPOSED — awaiting Leon (§0.1) | Named responder in writing; a test page received by that person |
| P0.9 | Photography commissioning (clears Lighthouse third-party `_cfuvid` cookie, biggest perf gap) | Real guests won't launch on stock Pexels; legality of stock imagery | Leon's budget + photographer/licence agreement | P0.1 | PROPOSED — awaiting Leon (§0.1) | Commissioned images staged self-hosted; Lighthouse re-run filed |
| P0.10 | eTIMS launch scope: is KRA fiscal invoicing in scope for day 1? | KRA certification timeline is long; determines whether `ETIMS_ENVIRONMENT` ever leaves `disabled` | `docs/ACTIVATE_ETIMS.md` (OSCU; protocol-blocked until registered) | P0.6 (accountant), P0.5 | PROPOSED — awaiting Leon (§0.1) | Written scope decision: "eTIMS in scope" (then full ACTIVATE_ETIMS flow) or "not in scope at launch" |
| P0.11 | Hotel launch date authority (who decides the go date; decision rehearsed) | Execution needs a date + authority; else drift | — (organisational) | P0.1..P0.10 | PROPOSED — awaiting Leon (§0.1) | Signed Gate D decision file naming date/time, scope, rollback authority |
| P0.12 | Production secrets custody & rotation owner | Secret sprawl = breach vector | Platform secret store / GitHub Actions `STAGING_*` secrets | P0.2 | PROPOSED — awaiting Leon (§0.1) | Owner designated; rotation cadence written in `docs/OPERATIONS.md` |

## 3. Phase 1 — Infrastructure and public staging (Leon purchases/approves; OpenCode executes)

**Gate A = all of this green, else NO-GO.** Local evidence is NOT accepted in place of public evidence for Gate A.

| # | Task | Owner | Dependency | Evidence required (archive) |
|---|---|---|---|---|
| 1.1 | Provision host + managed PG16 (non-DDL app role, `sslmode=require`, pool `max:10`) | Leon (account/billing); OpenCode (config) | P0.2, P0.3 | Host console record; app role confirmed non-DDL; TLS-to-DB verified |
| 1.2 | DNS for `staging.<domain>`; propagation | Leon (registrar); OpenCode (verify) | P0.2, P0.4 | `dig A/AAAA` output saved |
| 1.3 | TLS certificate (Let's Encrypt/provider CA); HSTS on nginx vhost | OpenCode; Leon approves domain scope | 1.2 | `curl -vI` chain; issuer + expiry (≥60 days at issuance) |
| 1.4 | `.env.staging` on host (mode 600, never committed, never echoed); `WEB_ORIGIN=https://staging.<domain>` | **Leon types values** | 1.1 | Boot-guard passes: `NODE_ENV=production` requires SESSION_SECRET/COOKIE_SECURE/HTTPS origin (already enforced; log line archived) |
| 1.5 | `migrate` additive deploy → API → web; `restart: unless-stopped` | OpenCode | 1.4 | Migration output applied in order; `/ready` 200 with DB up; containers healthy |
| 1.6 | `tests/staging-acceptance.mjs` against **public** URL (16/16) | OpenCode | 1.5 | `m6-rehearsal/staging-acceptance-public-<date>.json` 16/16 |
| 1.7 | Backup drill on managed PG: `pg_dump` → scratch restore → counts + `room_allocation_no_overlap` | OpenCode | 1.5 | Drill log with timestamp; counts match; constraint present; scratch dropped |
| 1.8 | **Rollback drill**: redeploy previous image tag; verify 16/16 smoke again; document app rollback vs DB rollback | OpenCode | 1.6 | Drill timings ≤30 min; smoke green; written note in `docs/BACKUP_RESTORE.md` drill log |
| 1.9 | Monitoring wired: uptime probe on `/api/v1/ready`; 5xx-rate; `email_outbox` failures; backup age (>26h alert); cert expiry 30/14/7d; disk >80%; **pager reaches a named human** | OpenCode (wire); Leon (prove page reaches them) | 1.5, P0.8 | Test page received + acknowledged by responder |
| 1.10 | CSP/toggling pass on public URL (no third-party resources needed) | OpenCode | 1.6 | Header dump archived; no regressions in audit/a11y |

## 4. Phase 2 — Integrations, money and legal compliance

**Gate B = Phase 2 complete or explicitly descoped by owner in writing.** Phase 2 order matters.

| # | Task | Owner | Evidence |
|---|---|---|---|
| 2.1 | **Tax sign-off** (P0.6): SC written distribution agreement (s.13(7) precondition) OR instruction to compute VAT on SC-inclusive base; deposit tax-point; levy confirmation; Finance Act 2026 Cap. 476 | Leon + accountant | Signed letter/email from accountant; `TAX_AND_CHARGES.md` annotated; any `TAX_POLICY` change committed + 45/45 re-verified + quote re-measured live |
| 2.2 | **M-Pesa sandbox end-to-end**: disposable booking → STK push → enter sandbox PIN → reserved flips `confirmed`; replay idempotent; cancellation releases allocation; reconciliation report matches M-Pesa statement line-for-line | OpenCode executes; Leon holds phone | Archived logs (refs masked); webhook trace; reconciliation output; suite green |
| 2.3 | **Daraja production go-live** (only after 2.2 green AND P0.5 approval): production app issued; `MPESA_ENV=production` set **by Leon**; KES 1 live transaction authorized by Leon → confirm → statement match → refund recorded | **Leon decides and types**; OpenCode verifies | Leon's written authorization; KES 1 settlement; refund record; audit log entries |
| 2.4 | **SMTP live** (P0.7): credentials on host; bookingConfirmation + password reset to owner-controlled mailbox; failure path verified (bad host/creds → outbox `failed`, booking intact) | OpenCode + provider | Mailbox headers (SPF/DKIM/DMARC pass); outbox rows `sent`/`failed`; failure injection archived |
| 2.5 | **eTIMS (only if P0.10=in scope)**: KRA sandbox registration → OSCU spec download → sandbox sales invoices pass → KRA vetting → certification → only then production OSCU | **Leon leads** (PIN, OTP, commitment form); OpenCode implements to spec | KRA acceptance notices; sandbox invoice numbers; certification letter |
| 2.6 | VAT display decision on guest-facing invoice (three lines vs bundled) | Leon + accountant | Issued receipt sample reviewed |
| 2.7 | Production seed decision: catalogue-only + staff via explicit `SEED_*`; fixtures banned | Leon approves; OpenCode enforces (`node prisma/seed.js` prod path already refuses default-credential users) | Fresh prod DB audit: 28 rooms, 0 reservations, staff users only via `SEED_*` |
| 2.8 | Commissioned photography replaces Pexels hotlinks (P0.9); self-hosted; modern formats; Lighthouse re-run | Leon (budget); OpenCode (swap + verify) | Lighthouse report improving perf score; axe still 0/8 |

**M-Pesa production is fenced:** it cannot happen before P0.5 + Gate B + Leon's typed instruction + a KES 1 transaction Leon personally authorizes. Engineering may not flip `MPESA_ENV=production` under any circumstance.

## 5. Phase 3 — Launch readiness

**Gate C = People & content & operations green.** Unscheduled launches fail.

| # | Task | Owner | Evidence |
|---|---|---|---|
| 3.1 | Runbook walk-through: `OPERATIONS.md` read aloud with the actual responder; rollback demo (restore previous image tag) live on staging | OpenCode leads; Leon + responder execute | Signed attendance note; measured rollback ≤30 min |
| 3.2 | Final regression battery on `main` tip: build, `npm test` 45/45, Playwright 3/3, rehearsal 20/20, axe 0/8, CI green incl. Trivy | OpenCode | Archived run ids + outputs |
| 3.3 | Domain cutover plan: TTL lowered ≥24h before production DNS switch; rollback DNS rehearsed; HSTS verified post-switch | Leon (DNS); OpenCode (verify) | `dig` before/after; rollback tested ≤5 min |
| 3.4 | Photography/content approved; Arena site content reviewed for real accuracy (prices, policies) | Leon + any content owner | Screenshot set filed |
| 3.5 | **Gate D decision file signed by Leon**: date/time, scope, authority, rollback authorizer | **Leon alone** | `docs/reports/LAUNCH_DECISION-<date>.md` signed by Leon |

## 6. Phase 4 — Production launch and hypercare

1. **Production deploy** via tagged release (`git tag v1.0.0`): migrate → API → web on the production host; `/ready` green within 3 min or auto-halt (deploy script already polls; P3/Fly/CI job same).
2. **First real reservation** — Leon or explicitly authorized person books at a real (possibly discounted/Courtesy) rate; confirm M-Pesa settle; check audit log end-to-end; **refund drill** executed and recorded.
3. **72h hypercare**: named human watches `payment-health`, `/ready` uptime, outbox `failed` count; incident per runbook; daily reconciliation vs M-Pesa statement.
4. **30-day review**: restore-from-backup spot check on production; alert tuning; occupancySanity; invoice cadence (if eTIMS); performance re-measurement (CrUX/Lighthouse vs lab baseline); adjust or retire alerts.

**Gate D passes when** the first real production reservation completes end-to-end (book → pay → confirm → audit → reconcile → refund drill) with Leon witnessing; subsequent 72h clean. **Gate D failure = freeze launches, rollback per runbook, post-mortem before any retry.**

## 7. GO / NO-GO gates (single page)

| Gate | Pass criteria — ALL required | Decision owner | If not passed |
|---|---|---|---|
| **A — Public staging** | 1.5–1.10 all evidenced; TLS valid ≥60d; backup-restore drill logged; rollback ≤30 min; monitoring page received by named human; acceptance 16/16 **on public URL** | OpenCode evidence + Leon sign-off | NO-GO — no public anything. Fix, re-verify |
| **B — Legal, money and integrations** | 2.1–2.8 complete or explicitly descoped in writing by Leon; `TAX_POLICY` matches accountant sign-off; M-Pesa **sandbox** E2E green; SMTP verified on real mailbox; (eTIMS certified if in scope) | **Leon (with accountant)** | NO-GO — no paying guests. Fix or descope in writing |
| **C — People and content** | 3.1–3.4 complete; responder named; rollback demo signed; content approved | Leon + responder | NO-GO — no launch date. Reschedule, don't press |
| **D — Production cutover decision** | 3.5 signed; Phase 4 hypercare rostered for 72h; rollback authority named | **Leon alone** | NO-GO — do not proceed; post-mortem if attempted |

## 8. Security, backup, recovery, deployment & rollback requirements

**Security**
- App/server secrets: host store / CI secrets only; never git/chat; rotate after any exposure suspicion (local incident 2026-11-12 destroyed a `.env` — nothing leaked, all values rotated or regenerated; lesson recorded).
- DB app role non-DDL; `sslmode=require`; loopback/private networking; connection pool `max:10` documented; no schema changes without `migrate deploy` rehearsed on a restored backup.
- Boot guard enforces `NODE_ENV=production` + `SESSION_SECRET` ≥ 32 random chars + `COOKIE_SECURE=true` + HTTPS `WEB_ORIGIN` (already enforced; verified refusal in M6).
- TLS ≥1.2; HSTS; CSP `default-src 'self'` + `img-src 'self' data: https:` until P0.9, then drop `https:`; `X-Frame-Options DENY`; `Referrer-Policy`; `Permissions-Policy`; cookies `Secure; HttpOnly; SameSite=Lax`; single-origin CORS; rate limits (300/15min API, 10/15min auth); webhooks bypass rate limiter but enforce amount+reference+IP-allowlist; logs redact refs/emails; audit log is append-only & transaction-bound to the protected action; 2FA for staff is a P2 decision when headcount grows, not a launch blocker at 28 rooms.
- No production data in staging; no staging data anywhere public; fixtures never reach production.

**Backup & recovery**
- Managed PG PITR **enabled and verified by a restore drill on the production provider before Gate D**.
- Weekly `pg_dump` to off-site object storage (belt-and-braces; retention 30d daily + 12 monthly).
- Monthly restore into scratch; quarterly full rehearsal: restore to staging, boot API against restored DB, walk the booking journey, verify allocations + exclusion constraint.
- Restore must be **practised**, not assumed; every drill logged in `docs/BACKUP_RESTORE.md` (see file for local drill template).

**Deployment**
- Tag releases (`vX.Y.Z`); no direct push-to-prod; `migrate` before API rollover; containers `restart: unless-stopped`; healthchecks gate traffic; `/ready` unauthenticated but reveals nothing sensitive; `TRUST_PROXY=1` (or actual hop count) set to match the edge; CSP/HSTS verified post-deploy on the **public** URL; deploy job polls `/ready` 3 min then halts (or serves previous image).

**Rollback**
- App rollback = redeploy previous tag (additive migrations ⇒ no DB reversal). Target ≤30 min; rehearsed before Gate D.
- DB rollback = restore-from-backup; never confuse the two; destructive migration = same-day restore rehearsal mandatory.
- DNS TTL lowered ≥24h before cutover; rollback = repoint; CDN/edge purge documented.
- Failed deploy = previous image keeps serving (CI never auto-deploys; manual `workflow_dispatch` only; `STAGING_DEPLOY_ENABLED` gate stays `!= true` until Leon flips it).

## 9. External accounts and cost categories (no prices invented)

| Category | Examples / notes | Owner decision |
|---|---|---|
| Hosting plan + region | Fly.io / Railway / Render / small VPS — EU region; container count = 2 (web + api) + managed add-ons | P0.2 |
| Managed PostgreSQL | Paid tier w/ PITR; backup retention window | P0.3 |
| Domain registration | `.co.ke` registrar or global; renewal cadence | P0.4 |
| TLS | Let's Encrypt (free) or provider CA; renewals automated | P0.3/P0.4 |
| SMTP provider | Their free tier vs paid per-message; DNS-SPF/DKIM edits | P0.7 |
| Monitoring | Free uptime probe vs paid (BetterStack/UptimeRobot/host-native) | P0.8 |
| Photography | Commissioned shoot/licence vs usage rights | P0.9 |
| Accounting/tax advice | VAT/SC agreement review, Finance Act 2026 check | P0.6 |
| Legal/registration | Business registration, trading permits, accommodation licence | P0.1 |
| Safaricom go-live | Production app terms; potential shortcode/registration requirements | P0.5 |
| KRA eTIMS | OSCU onboarding (if in scope) | P0.10 |
| Insurance (optional) | Business interruption / cyber | P0.1 |

## 10. Execution order and critical path

**Critical path:** P0.1 → P0.2/P0.3/P0.4 → Phase 1 (Gate A) → P0.6 & P0.5 (start, takes weeks) → Phase 2 (Gate B) → P0.9 → Phase 3 (Gate C) → Phase 4 (Gate D).

**Parallel tracks:** P0.6 (tax) and P0.5 (Safaricom) run in parallel with Phase 1 — both have external lead times. P0.7/P0.8 can slot anywhere before Phase 2. P0.9 feeds Gate C only.

**Things NOT on any path:** new features, redesigns, framework upgrades. None are authorized by this document.

## 11. What OpenCode does vs what Leon does (final)

**OpenCode (this machine + configured infra):** all config files, Dockerfiles, nginx vhosts, CI/CD edits, deployments, migrations, seed enforcement, test/verify/drills, security scans, Lighthouse/axe runs, archived evidence, this document's maintenance after sign-off. OpenCode **may not**: purchase, open accounts, type credentials, accept legal terms, sign anything, call Safaricom/KRA/banks, mark a gate passed, or touch production without Leon's Phase-by-phase approval.

**Leon personally:** every purchase, account opening, DNS approval, secret entry into the host store, accountant/lawyer engagement, Gate A–D **sign-offs**, KES 1 live authorization, sandbox PIN decisions, incident responder designation, and the final launch decision. No one else may sign gates.

## 12. Honest status at the time of writing

- **Verified engineering:** local staging stack 16/16 acceptance; CI green at `cee2a11`; prod-deps audit 0; Trivy clean; exclusion constraint in DB; 45/45 tests; e2e 3/3; rehearsal 20/20; axe 0/8; rollback/restart drills on local stack.
- **Sandbox payment:** STK push delivered to Leon's handset; owner-cancelled; cancellation callback verified; forged-success rejected; reconciliation truthful. **Success path not live-verified.**
- **Everything public:** NOT VERIFIED. No staging URL, DNS, cert, or public endpoint exists.
- **Everything legal/financial:** NOT SIGNED. Tax unapproved; eTIMS uncertified; M-Pesa uncertified; no one has verified guests can pay in production.
- **Everything cloud:** NOT PROVISIONED.

**Verdict:** READY TO COMMISSION (engineering). NOT READY TO LAUNCH. This document is the contract between those two states; Gates A–D enforce it.
