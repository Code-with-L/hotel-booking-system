# M8 — Release security & readiness (read-only, 2026-11-13)

**No production credentials were changed, rotated, retrieved or printed. No database writes, migrations, Vercel changes, deployments, commits or pushes were made.**

Local commit under review: `2ccffd9` — `feat(M8): improve booking trust and inventory consistency` (branch `main`; **not pushed**).
Deployed commit (proven by live bundle inspection, §5): `27a8ff3`.

---

## 1. Credential exposure assessment

### 1.1 Secrets consumed by the application (names only — no values in this document)

| Variable | Consumed by | Where it lives today | Required? |
|---|---|---|---|
| `DATABASE_URL` | `apps/api/src/config/env.js` → Prisma client (pooled Neon in production) | Vercel Production env vars (not repo); local `.env` (gitignored, localhost-class) | yes |
| `SESSION_SECRET` | `apps/api/src/config/env.js` — **boot-time guard only** (§4) | Vercel env vars; local `.env` | yes (prod guard refuses boot) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | `apps/api/src/modules/auth/google.js` — read **directly** from `process.env`, not via `env.js` | Vercel env vars per D-067; code dormant until set | optional |
| `MPESA_ENV` / `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` / `MPESA_SHORTCODE` / `MPESA_PASSKEY` / `MPESA_CALLBACK_URL` / `MPESA_WEBHOOK_ALLOWED_IPS` | `config/env.js` → `lib/mpesa.js`, `modules/payments/routes.js` | Vercel env vars; `MPESA_ENV=sandbox` everywhere (verified local; D-067 records same for production) | conditional |
| `EMAIL_PROVIDER` / `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` / `EMAIL_SMTP_SECURE` / `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASS` / `EMAIL_FROM` | `config/env.js` → `integrations/email/transport.js` | unset/empty in all known configs → emails recorded `skipped` | optional |
| `ADMIN_NOTIFICATION_EMAIL` | `config/env.js` → reservation alert path | Vercel env vars (per docs) | optional |
| `ETIMS_*` (ENVIRONMENT, TIN, BRANCH_ID, DEVICE_SERIAL, BASE_URL, COMMUNICATION_KEY, SALES_INVOICE_PATH, INVOICE_SERIES_PREFIX, ENABLED) | `config/env.js` + `integrations/etims/oscu.js` | disabled everywhere; KRA OSCU not registered | no |
| `SEED_ADMIN_* / SEED_MANAGER_* / SEED_GUEST_*` | `prisma/seed.js` (build-time, not runtime) | documented only; not in Vercel | conditional |
| `VITE_API_BASE_URL` | `apps/web`, defaults to same-origin `/api/v1` | **not a secret**; public in client bundle by design | no |
| `COOKIE_SECURE` / `WEB_ORIGIN` / `FRONTEND_BASE_URL` / `TRUST_PROXY` / `RATE_LIMIT_*` / `LOG_LEVEL` | non-secret config | Vercel env vars / defaults | yes/no |

### 1.2 Cloudinary / object storage

**No Cloudinary SDK, key names or references exist anywhere in the codebase** (searched `apps/web`, `apps/api`). Photography is served as committed local assets under `apps/web/public/photos/`. There is no Cloudinary credential to rotate; introducing one is out of scope without a new decision.

### 1.3 Where each secret must be updated when rotated

| Secret | Rotation touch points |
|---|---|
| `DATABASE_URL` (Neon password) | Neon "Reset password" for the `neondb_owner` role → new pooled connection string → update **Vercel Production env var** (project → Settings → Environment Variables) → **redeploy** (env changes only take effect on new function instances). Local `.env` if/when the developer machine is repointed at Neon (currently localhost). `.env.staging` only if staging exists and points at Neon. CI (`.github/workflows/ci.yml`) uses throwaway local-Postgres credentials — untouched by Neon rotation. |
| `SESSION_SECRET` | Vercel env var + **redeploy**. Local `.env`. Impact §4 — none on existing sessions. |
| `GOOGLE_*` | Vercel env var + redeploy; values also read via `google.js` directly. Google Cloud console (consent screen + credentials) is the source for the pair themselves. |
| `MPESA_*` | **Do not rotate/activate until Safaricom go-live.** Values change only after owner authorizes Daraja production onboarding; then Vercel env var + redeploy + callback URL registered with Daraja. Sandbox stays sandbox. |
| `EMAIL_*` | Vercel env var + redeploy; provider dashboard is the source. Currently unset → no impact. |
| `SEED_*` | Only consumed at seed time; rotating = re-run procedure in a maintenance window (not planned). |

### 1.4 Does rotation cause downtime or session invalidation?

| Rotation | Downtime | Session invalidation |
|---|---|---|
| Neon password (reset semantics) | **Yes — brief.** Old credential stops working immediately; already-deployed Vercel functions keep/open connections with the old string until their runtime is replaced. Expect seconds–minutes of `db: down` / HTTP 503 (the API fails truthfully: `loadSession` and `/ready` report 503, writes fail closed, nothing is half-committed). Rotate at lowest traffic, update Vercel var, redeploy immediately. | No — sessions are DB tokens (§4) |
| `SESSION_SECRET` | None (cosmetic boot guard; value never read at request time) | **None in this implementation** (§4). Codebase does not sign cookies — see `middleware/index.js` and `config/env.js`. Doc claim corrected 2026-11-13 (§3.3) |
| `MPESA_*` / Google / EMAIL / ETIMS | None (all are dormant or read per-request at sign-in/payment time) | No |

### 1.5 Git history vs external configuration

Verified read-only across **all refs and all commits** (`git rev-list --all` + `git grep`):

- Neon password pattern (`npg_*`): **0 hits in any commit**.
- Private key blocks (`BEGIN … PRIVATE KEY`): **0 hits**.
- Live-token patterns (`sk_live`, `whsec_…`, `AIza…`): **0 hits**.
- `.env`, `.env.staging`, `verify-ca`-style files: **never committed**; `.gitignore` covers `.env`, `.env.*`, `deploy/certs/`; only `.env.example` / `.env.staging.example` tracked (names only).
- Untracked and gitignored, safe: `deploy/certs/staging.crt` / `staging.key` (self-signed, staging-local TLS; never in Git).
- **The Neon password exists only in (a) the Neon console and (b) this chat history** (pasted by the owner/operator 2026-11-13). Treat (b) as compromised — it has not been copied anywhere else by tooling in this session (verified: working tree + history contain zero occurrences).

Conclusion: **the repository and its full Git history are clean of production secrets.** The only known exposure is the chat transcript; rotation is the correct remedy, not history surgery (and history rewriting on a pushed repo is off the table — push of `main` is also not currently authorised).

---

## 2. Neon password rotation — operator procedure (NOT executed)

Executed **by the owner in the Neon console**; engineering/agent does not print or handle the new credential.

**Pre-conditions**

1. Confirm the app is in a known-good state: `GET https://hotel-booking-system-jet-gamma.vercel.app/api/v1/ready` → `{"ok":true,"db":"up"}` (verified 2026-11-13 11:37 UTC).
2. Verify/enable Point-in-Time Recovery on the Neon project (free tier supports PITR windows; `docs/BACKUP_RESTORE.md` covers restore drills). A password rotation is non-destructive, but snapshot-before-change is house practice.
3. Pick lowest-traffic window. Accept ~1–5 minutes of degraded API during cutover; no booking data is touched.
4. Have the Neon dashboard open (do not share session). Do not paste the new password into chat, tickets, or commit it.

**Steps**

1. Neon console → project → **Roles** → `neondb_owner` → **Reset password** (or create a **new** role `neondb_app_*` with grants and migrate — zero-downtime-ish path; see note on complexity. Simplest supported: reset on the existing role).
2. Copy the new **pooled** connection string (`-pooler` host, `sslmode=require`) directly from the console — never transcribe via chat/email.
3. Update local `.env` only if the machine needs Neon access (recommended: leave local on localhost; prefer a separate Neon branch for local work).
4. Update Vercel → project → **Settings → Environment Variables**: `DATABASE_URL` (Production) → new pooled string. Leave Preview envs as the owner decides (see §5 risks — preview should ideally point at a separate Neon branch).
5. **Redeploy** (Deployments → ⋯ → Redeploy on the latest production deployment, or push-authorized empty commit). Functions start with the new credential.
6. Verify **without printing the secret**:
   - `/api/v1/ready` → `db:"up"` (truthful 503 otherwise);
   - homepage loads; rooms/availability queries return 3 types (expected pre-Phase-B);
   - one safe admin sign-in (admin account) or a seeded read-only screen;
   - admin audit log records no error spike;
   - rehearse: after successful rotation, the OLD password must fail — an app boot with a stale env must 503 loudly, not silently serve.
7. **Rollback**: if the new credential fails, re-reset the password in the console to a known-good value, or point Vercel back at the previous string if the rotation was a no-op risk. Because the reset is atomic and Neon invalidates the old secret immediately, "rollback" = generate another new password and redeploy. No data recovery is needed (no data path changed). Verify after rollback the same way as step 6.
8. Invalidate anything that cached the old string: Vercel function instances (redeploy covers this), any local scripts/notes/password managers holding the old value (delete).

**Post-rotation**: update the team's password manager entry; never re-use the old value; note rotation date in `docs/DECISIONS.md` (as owner-authored decision record, not by the agent unless explicitly asked).

---

## 3. SESSION_SECRET assessment

### 3.1 Actual session architecture (verified in code)

- Cookie name: `stillhouse_session` (`apps/api/src/middleware/index.js`). Value: 32 random bytes, base64url — **opaque token, not a JWT**.
- Server stores `sha256(token)` in the `session` table via Prisma (`lib/session.js`); lookup is `findUnique({ where: { tokenHash } })`.
- Cookie is `httpOnly`, `sameSite=lax`, `secure` per `COOKIE_SECURE`/production guard, path `/` (`COOKIE_OPTIONS`).
- `cookie-parser` is used **without a signing secret** (`app.use(cookieParser())`). There is **no HMAC, no signature verification anywhere in the session path**.
- `SESSION_SECRET` is consumed exactly once — the **boot-time guard** in `config/env.js` (production refuses to boot when missing/`dev-only`/<32 chars). **The value is never read again.**
- Expiry model: idle timeout (`SESSION_IDLE_TIMEOUT_MINUTES=480`) + absolute lifetime (`SESSION_ABSOLUTE_LIFETIME_DAYS=7`, sliding touch at most 1×/min). Sessions live in Postgres, so any instance/region/function sees the same sessions.

### 3.2 Rotation impact (truthful answers)

| Question | Answer |
|---|---|
| Do existing sessions become invalid? | **No.** Tokens are random; nothing derives from `SESSION_SECRET`. |
| Must users log in again? | **No** (admin or guests — all sessions survive rotation). |
| Do multiple app instances need coordinated config? | **No coordination required.** Instances are stateless; shared state is the DB; the guard only gates boot. |
| Is there a compatibility/dual-secret mechanism? | **None built, none needed** in this architecture. If the codebase were later changed to sign cookies (HMAC/JWT), a dual-verify window would then be required — that would be a code change requiring its own review, not a config toggle. |

### 3.3 Documentation discrepancy — RECOVERED 2026-11-13

`docs/DEPLOYMENT.md` §3 previously stated `SESSION_SECRET` "rotate = all sessions invalidated." **That was never true of the implementation** — it described a signed-cookie design this codebase does not use. On 2026-11-13 this was corrected (owner-authorized doc correction, no code change): §3 now states the secret is read once at startup as a presence/length guard, is not used to sign or verify cookies or sessions, and that changing it does not invalidate existing sessions. The same false shorthand in `docs/PHASE_1A_STAGING_PROVISIONING.md` §6 ("rotate = session invalidation (documented)") was corrected in the same pass. All other `SESSION_SECRET` references in `docs/DECISIONS.md`, `docs/COMMISSIONING.md`, `docs/OPERATIONS.md` describe the boot guard and were accurate — left untouched.

The defence-in-depth option remains open **only as an owner decision**: sign cookies with `SESSION_SECRET` (requires a dual-secret rollover window and its own review). Until such a decision is taken, rotating `SESSION_SECRET` is a hygiene/no-op for sessions and can be done any time with zero user impact.

### 3.4 Why keep the guard then?

Fail-fast on stolen-but-empty or `dev-only` secrets in production is cheap insurance and the only thing the current secret does. It should not be removed without a replacement control.

---

## 4. (intentionally merged into §5)

## 5. Deployment trigger findings (Vercel / GitHub)

### 5.1 What is deployed right now (determined read-only)

- **`27a8ff3` is the deployed commit; `2ccffd9` (M8) is NOT deployed.**
  Proof from the live bundle served 2026-11-13: `/assets/NotFound-CTeYeCBo.js` contains the pre-M8 third-party-derived 404 (scatter→ring→spin phases; copy "This page went off the map…"). M8 markers (`Not at The Stillhouse` original typographic 404, `Track my booking`, `Concept notice`) are absent. `/api/v1/ready` → `{"ok":true,"db":"up"}` (11:37 UTC).
- Production environment variables live in the **Vercel dashboard**, not the repo (D-067). `DATABASE_URL` → Neon pooled (`eu-central-1`); `MPESA_ENV=sandbox`; `NODE_ENV=production`; `COOKIE_SECURE=true` (enforced); `WEB_ORIGIN=https://hotel-booking-system-jet-gamma.vercel.app`; `GOOGLE_CLIENT_ID/SECRET` wired dormant.
- Historical deploy chain recorded in `docs/DECISIONS.md` D-067 (`0c740ec`…`27a8ff3`) — deploys happened by pushing `main` (see §5.2). Live site reflects exactly the last pushed `HEAD`.

### 5.2 Does pushing `main` deploy production?

**Yes — by observed behavior, almost certainly.** Every recorded fix (SPA fallback `9362dc7`, WhatsApp `6b9d3a1`, WebP `7210151`, GSAP lazy-load `27a8ff3`) went live via push to `origin/main` (`github.com/Code-with-L/hotel-booking-system`), with no other release step between push and availability, and no contrary evidence in repo, CI, or docs. The GitHub CI workflow (`.github/workflows/ci.yml`):
- triggers on `push: main` and PRs; runs audit/tests/build/e2e/Trivy;
- **has no Vercel deploy step at all** — it cannot deploy;
- its only deploy job is staging via **manual `workflow_dispatch`** + `STAGING_DEPLOY_ENABLED=true` + `STAGING_*` secrets + `docker-compose.staging.yml` on a self-managed host — and it is off by default;
- uses zero production secrets (throwaway CI Postgres + `ci-session-secret-not-for-production-use-…` placeholder; not real values).

Therefore production deploys are driven by **Vercel's Git integration on push to `main`**, not by CI. Sprint caveats not verifiable from this repo: whether the project has **deployment protection**/SSO, whether **preview builds** are enabled, whether the production branch is locked to `main`, whether builds are paused, and rate limits — all live in the Vercel dashboard and were neither checked nor changed.

### 5.3 Preview deployments

Vercel's default Git-connected behavior builds **every branch/PR push** as a *Preview* deployment (unique `*-git-<branch>-…vercel.app` URL) **without promoting to production** — on Hobby, within monthly build-minute limits. Whether this is enabled for this project is unverifiable from the repository. To test M8 as preview the owner must (all under owner authorization):

1. Confirm/enable **Preview Deployments** for the repo (Vercel → project → Settings → Git) and confirm the production branch is `main`.
2. Authorize a **push of `2ccffd9` to a feature branch** (e.g. `m8-release-candidate`) — **push is currently NOT authorised**.
3. Decide the preview database: either (a) Neon branch (copy of prod data or empty) — **recommended**, previews then never touch production data, or (b) same production `DATABASE_URL` for previews — **not recommended** (write paths: holds, reservations, admin actions would hit prod). (b) also works for read-mostly smoke tests but is booking-unsafe.
4. Run the M8 acceptance checklist on the preview URL: homepage, availability (28-room catalogue), booking flow end-to-end, confirmation honesty page, anonymous "Track my booking" lookup, 404 page, admin sign-in (if staff access expected to work there).
5. Only after preview sign-off: owner separately authorizes the `main` push (this deploys production).

### 5.4 Deployment protection / branch restrictions

Not verifiable from this repo. The site is publicly reachable (all checks here were unauthenticated, including `/api/v1/ready` and bundle fetches), so there is no SSO gate on production today. Branch restrictions/ignore rules may exist in Vercel Git settings — check the dashboard; none of them can be read from here, and none were changed.

### 5.5 Safest release sequence (all steps require explicit owner authorization)

1. **Rotate the Neon password** (§2) — independent of M8; closes the only known exposure. Verify `ready` after.
2. **Authorize a preview deployment** of `2ccffd9` from a feature branch (§5.3). Fix-forward any preview failures as new commits on that branch (never amend `2ccffd9` history).
3. **Preview sign-off** against the M8 acceptance list (see `docs/M8_RELEASE_COMPAT_CHECK.md` and audit).
4. **Owner decision: push `main`** → Vercel deploys → verify production: `ready`, homepage, booking flow, admin, M8 surfaces (404, anonymous lookup). Confirm `2ccffd9` (or later) in the Vercel deployments list.
5. **Post-deploy**: only after stable — Phase A migration for C03/C04 with written authorization (`docs/M8_PHASE_A_PREFLIGHT.md`); leave `admin.settings` untouched; 14-day observation before Phase B.
6. **Deferred owner actions** that this sequence does NOT close: GOOGLE OAuth consent screen (Testing + zero test users) → add test users or publish before claiming live sign-in works; M-Pesa remains **sandbox**; site remains a concept-property demo; `admin.settings.hotel.rooms` stays 32 until Phase B + maintenance rooms restored; production monitoring/rollback posture (no alerting confirmed — only `ready` spot-checks).

### 5.6 If the release must be aborted after production deploy

Rollback = `git revert 2ccffd9` on a branch → push (owner-authorized) → Vercel redeploys previous commit. Database is untouched by M8 (no schema/data changes; retirement SQL is Phase A, separate, owner-gated). Reversible end-to-end; no data repair needed.

---

## 6. Secret rotation checklist (summary — no secrets handled by the agent)

- [ ] Neon `neondb_owner` password reset (owner, Neon console) — today; closes chat-history exposure.
- [ ] Vercel `DATABASE_URL` updated + redeploy; `ready` verified `db:"up"`.
- [ ] Old credential purged from password manager/notes/scripts; **no reuse**.
- [ ] Vercel env diff reviewed (owner): `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_*`, `MPESA_*`, `EMAIL_*`, `COOKIE_SECURE`, `NODE_ENV`, `WEB_ORIGIN` — values never echoed into chat/tickets; only via dashboard.
- [x] DEPLOYMENT.md §3 and PHASE_1A_STAGING_PROVISIONING.md §6 session-invalidation wording — **corrected 2026-11-13** (docs only; implementation unchanged).
- [ ] `SESSION_SECRET` rotation — optional **anytime**, zero session impact (§3), do not couple to incident; schedule convenience reset if desired.
- [ ] Confirm Google OAuth consent state; adding test users is required before any live guest sign-in claim.
- [ ] Confirm no `MPESA_*` change lands without Safaricom go-live authorization.
- [ ] Git history confirmed clean (this document, §1.5) — no remediation needed.
- [ ] Record rotation in `docs/DECISIONS.md` (owner as author) and in the team password manager.
- [ ] Decide cookie-signing (defence-in-depth) or accept current session design; decide preview DB strategy; decide whether monitoring/alerting gap is accepted.

## 7. What remains unowned / risk accepted

1. Vercel dashboard settings (protection, preview toggle, branch lock, log drain, deployment protection) — **not inspected, not changed**; only the owner can attest.
2. No production monitoring/paging confirmed; `ready` checks are manual spot-checks.
3. WhatsApp number public on site (D-070) — accepted posture, still flagged.
4. `admin.settings.hotel.rooms = 32` in production — intentional, documented; 28 only after Phase A+B+maintenance restore.
5. Google OAuth consent screen is Testing with zero test users; live sign-in does not work until the owner adds test users or publishes the app.
6. M-Pesa sandbox — no revenue path live; all payments settle as unpaid holds/demo.
7. 32-room production database — intentional interim; guests see 28.
8. The chat transcript retains the exposed Neon password (messages are not retroactively editable). Rotation is the remedy.
9. Defence-in-depth cookie signing (HMAC/JWT + dual-secret rollover) — open question, not taken, requires owner decision and engineering review; not assumed by any document in this repo.
10. Vercel dashboard facts (preview toggle, deployment protection, branch restrictions, log drain) remain owner-attested only — not verifiable from the repo and do not guess.

## 8. Prohibitions honoured in this review

No credential changes; no secret retrieval or printing; no database access (zero queries this session); no migration/execution; no Vercel changes; no deployment; no commit; no push; no M9; no Daraja activation. All code inspection was read-only against the working tree at `2ccffd9`.

## 9. Bottom line

- Repo + Git history: **no production secrets**; exposure = chat transcript only → **rotate Neon password (owner action, today)**.
- `SESSION_SECRET` rotation: **zero user impact** in this architecture (§3); docs corrected 2026-11-13; optional convenience task.
- Deployment path: **`push origin/main` → Vercel production**, CI cannot deploy; M8 is currently unpushed/undeployed (production serves `27a8ff3`, verified by bundle inspection).
- Preview path exists **only if the owner (a) authorizes pushing a branch/PR and (b) chooses a preview database**; recommend Neon branch to protect production data.
- Safest order: **rotate now → preview → verify → owner-authorized prod push → (later) Phase A**.
