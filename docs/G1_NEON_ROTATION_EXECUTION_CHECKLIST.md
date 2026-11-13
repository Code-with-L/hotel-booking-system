# G1 — Neon production credential rotation — Owner execution checklist

**Date prepared:** 2026-11-13 · **Status:** PREPARED AND VERIFIED (read-only) — **the rotation itself has NOT been performed** and is reserved for the owner. **G1 is not claimed complete by this document.**
**Scope:** production Neon database password rotation only. No other secrets, no schema changes, no M-Pesa work, no M10 implementation.
**HEAD at preparation:** `2ccffd9` — docs-only worktree + M8/M9/M10 artifacts (see final section).

Cross-references (do not duplicate their content; read them first):
- `docs/M8_RELEASE_SECURITY_READINESS.md` §2 — the canonical rotation procedure (this checklist is its executable form) and §6 — rotation checklist.
- `docs/M10_AUTHORITATIVE_IMPLEMENTATION_SPEC.md` §15, **G1** — rotation is a *prerequisite* for M10 implementation, not a substitute for it.
- `docs/DEPLOYMENT.md` — §3 table (`DATABASE_URL` row), §4 release procedure, §5 backups, §7 monitoring.
- `docs/OPERATIONS.md` — backups section; incident quick responses; reconciliation duty.

---

## 1. Architecture verification (documented; cross-checked against repo)

| Aspect | Finding — evidence | Verified how |
|---|---|---|
| Pooled endpoint | Production `DATABASE_URL` targets the **pooled** Neon host — the hostname contains `-pooler` and the region string `eu-central-1` (recorded in `docs/DECISIONS.md` D-067 as "DATABASE_URL -> Neon pooled connection"). The pooled host is the correct serverless target (transaction-mode pooled connections survive per-invocation functions). | Doc read; live app answers `db:"up"` through it (baseline 2026-11-13 15:41 UTC) |
| Database name | `neondb` (implicit in the console; not re-stated in repo to keep the connection string out of Git). **Exact name is only visible in the Neon dashboard / Vercel env — UNVERIFIED from this repo; owner confirms in-console before reset.** | Owner console confirmation required |
| Role | `neondb_owner` (owner of the DB). The app connects via this role — **the same role being rotated**. There is no separate read-only app role in place (unlike the future Render plan, which specifies a non-DDL `app` role — `docs/DEPLOYMENT.md` §3). | Code comment in `M8_RELEASE_SECURITY_READINESS.md` §1.3; owner confirms in-console |
| SSL | Production connection string carries `sslmode=require` with `channel_binding=require` (recorded in M8 docs; Neon enforces TLS by default). Pooled endpoint also TLS. | Doc read (never printed connection strings in any output) |
| Vercel consumption | **One** Vercel Production env var consumes it: `DATABASE_URL` — used by `apps/api/src/config/env.js` → Prisma runtime (pooled `-pooler`). No other consumer: web bundle carries no DB references; CI uses throwaway local Postgres; local `.env` is localhost-class; `docker-compose*.yml` all use local volumes. **PREVIEW env var state is unverified — if Preview functions exist with the same value, rotate or re-scope them at the same time (prevents drift between preview and production DB auth).** | Repo read; Vercel dashboard confirmation required |
| Current state (baseline before rotation) | Live endpoint `GET /api/v1/ready` → `{"ok":true,"service":"stillhouse-api","db":"up"}` at 2026-11-13T15:41:59Z. Deployment (production) serves `27a8ff3` (pre-M8) per bundle inspection ledger in `docs/M8_RELEASE_SECURITY_READINESS.md` §5.1. | Live read-only check this session |
| Deploy method for env change | Env vars are consumed **at function instance start**. Editing the Vercel env var does **not** affect already-running instances; a **redeploy** is required. | Vercel platform behaviour (documented); owner drives it |
| Consumers of secret after rotation | Only: the next Vercel deployment's function instances. After redeploy all live traffic uses the new credential; old credential is dead everywhere by then. | Architecture read |

**Owner verification required BEFORE reset (two minutes, console only):**
- Neon project → Roles: `neondb_owner` present; confirm its database is the one serving the live site.
- Neon project → Settings → Billing/Plan: note plan name and whether PITR/point-in-time recovery is enabled, and its window. *(This is also P0.3 of COMMISSIONING — if PITR is unconfirmed, note it; rotation itself is non-destructive but the absence of verified backup makes ANY production change riskier.)*
- Vercel → Project → Settings → Environment Variables: confirm `DATABASE_URL` exists, is `Environment = Production`, and check whether a `Preview` target exists with the same or the old value.

## 2. Rotation sequence (exact, in order — do not resequence)

> The following is the owner-executed sequence. The agent **prepares**; the owner **executes**. No credentials are typed anywhere except by the owner, into the consoles directly.

0. **Pre-flight (5 min)**
   - [ ] `GET https://hotel-booking-system-jet-gamma.vercel.app/api/v1/ready` → `{"ok":true,"db":"up"}` — do not proceed if not.
   - [ ] Neon PITR/backup situation known (see §1). If PITR is unverified, take a manual `pg_dump` snapshot first (owner-authorized; the exact command lives in `docs/BACKUP_RESTORE.md` and `docs/OPERATIONS.md` §Backups) and/or note honestly that rotation proceeds with an unverified backup.
   - [ ] No deploys in-flight (Vercel Deployments tab: nothing "In progress"/"Queued").
   - [ ] Lowest-traffic window; warn staff if any exist.
1. **Generate the replacement**
   - [ ] Neon console → Project → **Roles** → `neondb_owner` → **Reset password**.
   - [ ] Copy the new connection string (pooled host, `sslmode=require&channel_binding=require`) **directly from the console into the Vercel env var editor**. Do not paste it into chat, email, tickets, notes, or the password manager's notes field.
   - [ ] If a separate Preview `DATABASE_URL` existed: either re-point it at the same new string, **or** delete/re-scope it — record which in the evidence block (§6).
2. **Apply to Vercel**
   - [ ] Vercel → Project → Settings → Environment Variables → `DATABASE_URL` → Edit → paste → **Save**.
   - [ ] Confirm the variable shows "Updated just now" (or equivalent).
3. **Redeploy (required — env changes do not reach running instances)**
   - [ ] Vercel → Deployments → latest Production deployment → ⋯ → **Redeploy** (do **not** uncheck "Use existing Build Cache" consideration — default is fine; the API rebuilds identically).
   - [ ] Alternative only with owner authorization: push-authorized empty commit (NONE exists; push is not currently authorized — **do not push**).
4. **Verify (no secrets printed or shared)**
   - [ ] Within 1–3 minutes of redeploy completion: `GET https://hotel-booking-system-jet-gamma.vercel.app/api/v1/ready` → expect `{"ok":true,"service":"stillhouse-api","db":"up"}`. (Any 503 here is **game-stop** → §5 rollback.)
   - [ ] `GET https://hotel-booking-system-jet-gamma.vercel.app/` loads and rooms/availability render (front page serves live data).
   - [ ] (If staff access available) one admin page loads (`/admin` → sign-in → dashboard shows "Sellable" figure).
   - [ ] Vercel logs (Deployments → latest → Functions/Runtime logs): **zero** `P1001`/`P1002`/`P1017` / "can't reach database" lines in the first 5 minutes.
   - [ ] Confirm the **old** credential is dead (implicitly): any function instance still configured with the old string fails `SELECT 1` loudly — i.e., a stale instance would return 503 on `/ready`, not silently 200. Vercel redeploy eliminates stale instances; nothing further to test (never re-enter the old secret anywhere).
5. **Close out**
   - [ ] Password manager updated; old value deleted everywhere it existed; notes of rotation date (no values) kept.
   - [ ] Evidence block (§6) filled and handed back for DECISIONS.md (owner authors the decision entry; agent drafts only if asked).
   - [ ] Optionally, verify Neon console shows last connection activity consistent with the redeploy time (informational only).

## 3. Exact success criteria (all four, objectively checkable)

| # | Criterion | Evidence form |
|---|---|---|
| S1 | `/api/v1/ready` returns `{ok:true, db:"up"}` for **three consecutive checks over ≥ 5 minutes** post-redeploy | 3× curl/browser timestamps + responses pasted into evidence block |
| S2 | Homepage + rooms + availability render with data; no console errors indicating API 503s | browser check (owner or agent-with-instruction) |
| S3 | Zero DB-connection error lines (`P1001/1002/1017`, `ECONNREFUSED`) in Vercel runtime logs for ≥ 5 minutes post-redeploy | log observation pasted as **counts**, not raw bodies with PII |
| S4 | No increase in guest-facing failures (if any traffic exists; otherwise explicitly recorded as "no traffic to assess, S2+S3 suffice") | operator note |

## 4. Objective failure criteria (any ONE triggers rollback §5)

| # | Failure | Immediate meaning |
|---|---|---|
| F1 | `/ready` returns non-200 or `db:"down"` for > 3 minutes after redeploy completes | New credential not usable by the deployed function — mismatch between console and Vercel var, wrong pooler host, or TLS/binding issue |
| F2 | Any `P1001/1002/1017` or connection-refused storms in runtime logs | Same class as F1; old or malformed string in effect |
| F3 | Partial deploy: some function instances Ready, others erroring (Vercel shows "Error" on some builds) | Redeploy incomplete — cancel/retry the redeploy first before any deeper action |
| F4 | Owner cannot retrieve the new connection string / suspects it was mistyped | Re-reset immediately (creates a new, unrelated credential — the previous broken one is irrelevant); old pre-reset password is already invalid |

## 5. Rollback and recovery (rotation-specific; data-safe)

- **The rotation is non-destructive.** Neon password reset changes bytes of the credential, never data. No PITR restore is required at any point.
- **Preferred rollback = re-application, not reversion:** `neondb_owner` password was already invalidated at step 1; the only way back to a working system is **another reset**: Neon console → Roles → Reset password → paste *that* new string into Vercel → **Redeploy**. (Reversion to the pre-rotation password is impossible by design — no downside; no secret is "lost" that matters, since it was compromised anyway.)
- **If Vercel redeploy cannot be performed** (dashboard down): Neon account remains valid; revert Vercel var after Vercel recovers; the emergency contact is the Neon console alone holding recovery material.
- **If the production app is down for > 10 minutes:** treat as incident — set Vercel env `DATABASE_URL` back to a verified-good string (only possible if one exists — i.e., if a reset produced a working-but-unrecorded string, re-fetch from Neon console; it always exists) → redeploy → verify `/ready`.
- **Never** resurrect the pre-rotation secret from chat/notes/memory — it must stay dead; any stashed copies are destroyed.
- **After any rollback path:** repeat §3 verification before declaring service restored; record what happened in DECISIONS.md (owner authorship).

## 6. Known risks and explicitly accepted trade-offs

| Risk | Mechanism | Mitigation in this checklist |
|---|---|---|
| **Warm functions hold dead connections** | Vercel instances keep pg pools with old credential; `/ready` from a warm stale instance would 503 (loud, safe) | Redeploy replaces instances wholesale; step 4 verifies zero stale errors; expected zero with Vercel's redeploy |
| **Deployment overlap during cutover** | Old and new instances may coexist briefly during rollout | Harmless: stale instances only fail their own requests (503 → retry lands on a new instance via edge routing); reads never corrupt |
| **Connection pooler behaviour** | Neon pooler reuses server connections; auth failure occurs at **connect** time | `select 1` failing ⇒ pooled instance from previous generation dies loud (503), never serves stale data silently |
| **Password reset is global for the role** | One rotation changes auth for `neondb_owner` everywhere — including any forgotten consumer (staging against prod? (checked: none), a forgotten script? (none tracked; M8 swept tree clean)) | §1 inventory listed every consumer found; owner double-checks Neon console "last used by" after redeploy |
| **Old credential exposure window** | Chat transcript holds the leaked string; any residue in engineer workstations | Rotation kills the leaked credential's usefulness; desk audit of password managers in §2 close-out |
| **Attacker replay using leaked string during the window** | Attacker could still use pre-rotation string in the window between leak and reset | Immediate reset ⇒ window closes; nothing else to revoke (role itself remains the same identity) |
| **Downtime** | 1–3 min of possible 503s during redeploy propagation | §2 pre-flight picks lowest-traffic window; booking flow unaffected (hold rows live in DB; no state depends on the password) |
| **Silent partial-deploy success** | Some functions deployed, env not applied to all | Vercel redeploy applies atomically per deployment; F1/F3 catches |
| **Unverified backup before change** | If PITR/backup unconfirmed, recovery from a *hypothetical* data problem mid-rotation is weak | §2 step 0: confirm backup or take one `pg_dump`; the risk class is availability-only, but the drill exists |

## 7. Not verifiable without owner/console access (list for owner's eyes — check them or accept them)

1. Neon plan tier, storage headroom, PITR enabled/window (Neon console → Billing/Settings).
2. Exact database name and `neondb_owner` privilege level (`neondb_owner` vs a lesser app role — console).
3. Whether any Preview `DATABASE_URL` in Vercel targets production Neon with the old string (Vercel → Environment Variables → Preview).
4. Number of function instances / concurrency limits in effect (Vercel dashboard).
5. Any scheduled jobs/cron in the Vercel project outside this repo (Vercel → Cron Jobs).
6. Team/team-member sessions with access to the leaked secret inside chat and whether they've rotated their own copies (human process — owner's call).
7. Whether `GET /api/v1/ready` pre-rotation log history shows any latent connection flapping already occurring (nice-to-know; not gating).

## 8. Explicit exclusions (what this checklist does NOT do)

- No rotation executed by preparation. G1 **closes only when the owner executes §2 and pastes the §3 evidence back**; until then G1 remains **OPEN** and blocks M10 Phase 0-A (`docs/M10_AUTHORITATIVE_IMPLEMENTATION_SPEC.md` §15, G1).
- No M10 code path touched; no schema; no worker; no Vercel config; no Daraja; no monitoring added (M9-12 stays open).
- No claims about Daraja, SMTP, monitoring, backups beyond what's documented here — all remain open items elsewhere in the M8/M9/M10 record.

## 9. Evidence block (owner fills and returns)

```
Rotation executed at (UTC): ____________________
Neon reset confirmed in console (Y/N): ________
Vercel DATABASE_URL updated (Y/N): ____________
Preview target found (Y/N/absent) + action taken: ____________________
Redeployment id/commit shown in Vercel: ____________________
/api/v1/ready ×3 + timestamps:
  1. ____________________________________
  2. ____________________________________
  3. ____________________________________
Homepage + availability render OK (Y/N): ____________
Vercel runtime log errors in 5 min (count): ____________
PITR/backup status before rotation: ____________________
Anything anomalous: ____________________________________
```

**Hand this block back and G1 is formally closed; the M10 implementation gates (G2 onwards) can then be discussed.**

---

## 10. Files created/changed by this preparation

- **Created** `docs/G1_NEON_ROTATION_EXECUTION_CHECKLIST.md` (this file).
- **Modified:** none. All M8, M9, M10 artifacts preserved verbatim.
- No secrets accessed, printed, or stored; the pooled host/region names are already part of the committed decision record (D-067) and were not re-exposed with any credential material.

## 11. Verification performed by the agent (this session, read-only)

- `GET /api/v1/ready` (production, unauthenticated) → `{"ok":true,"db":"up"}` at 2026-11-13T15:41:59Z.
- Read: M8_RELEASE_SECURITY_READINESS.md, M10_AUTHORITATIVE_IMPLEMENTATION_SPEC.md, DEPLOYMENT.md, OPERATIONS.md, DECISIONS.md (D-067), .env.example, docker-compose*.yml.
- Tracked-file secret sweep: no credential material in tree (unchanged from M8 scan).
- No database connections opened; no Neon/Vercel console access attempted; no rotation executed.
