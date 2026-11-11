# Security Review — The Stillhouse (M2-D evidence)

Scope: authN/Z, sessions, RBAC, guest-data ownership, admin surface, payments/webhooks, DB access, CORS/CSRF, rate limiting, error handling, logging, secrets, dependencies, supply chain. Findings → fixes → tests → residual risks.

## Findings & fixes (all implemented and tested)

| # | Area | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | Secrets | No secrets committed; `.env` gitignored; `.env.example` names-only; image build excludes `.env` via `.dockerignore` | ✔ pass | Verified by `git ls-files` scan in audit |
| 2 | Deps | `npm audit`: 3 high in **dev-only** Prisma CLI chain (`deepmerge-ts ← @prisma/config ← prisma`) | Low (dev tooling) | Documented (D-029); runtime deps clean; Prisma 7 migration deferred to M7 (breaking config change) |
| 3 | Cookies | Session cookie would have worked over HTTP in dev | Medium | `COOKIE_SECURE` now **boot-enforced** in production (`env.js productionCheck`); dev default stays false |
| 4 | Prod config | App could boot with weak/default secrets in "production" | High | Boot refuses: SESSION_SECRET ≥ 32 non-dev-default + `COOKIE_SECURE=true` + HTTPS `WEB_ORIGIN` required |
| 5 | Rate limiting | Webhook + health could 429 (provider retries, probes) | Medium | Explicit bypass for `/api/v1/webhooks/*`, `/health`, `/ready` only |
| 6 | Admin access | Staff endpoints are RBAC-gated server-side; staff sign-in UI gate (M1) | ✔ pass | Tests: guest→403, anon→401, admin→200 |
| 7 | Guest isolation | Cross-guest read/cancel returns 403 | ✔ pass | Tested |
| 8 | Idempotency/double-book | Exclusion constraint; whole-tx retry; 8-way race → exactly 5 win | ✔ pass | Tested |
| 9 | Webhook | Daraja has no callback signatures; verified payload shape + amount == reservation total + reference lookup; optional IP allowlist (`MPESA_WEBHOOK_ALLOWED_IPS`); raw payload stored; replay idempotent | ✔ pass | Tested incl. amount-mismatch & replay |
| 10 | PII/logs | pino + redaction; no bodies logged; reference/email masked in logs | ✔ pass | Verified in test logs |
| 11 | CSRF | JSON-only API + SameSite=Lax + CORS allowlist → classic CSRF (form POST) inapplicable to state changes | ✔ pass | Documented decision; no cookie-authenticated form posts exist |
| 12 | Headers | helmet; production CSP at nginx (web vhost) | ✔ pass | `apps/web/nginx.conf` |
| 13 | Sessions | Server-side sessions, rotation on sign-in, idle 8h + absolute 7d, sweep of dead sessions every minute, logout deletes | ✔ pass | Tested; sweeper verified in logs |
| 14 | Seed in prod | Dev seed would create default-credential staff users | High | Production seed creates catalogue only unless `SEED_*_PASSWORD` explicitly set |
| 15 | Errors | No stack/SQLSTATEs to clients; mapped 23P01→ROOM_UNAVAILABLE; generic 500s | ✔ pass | Tested |
| 16 | Card data | Never stored (provider tokenization); refund flow records manual settlement only | ✔ pass | n/a by design |

## Residual / documented risks

- **R-1 (Medium):** Daraja callbacks are unauthenticated by design; mitigation = amount+reference verification + IP allowlist + idempotent replay. A forged callback passes only if attacker knows a valid pending checkoutId and exact amount — accepted risk, logged for monitoring.
- **R-2 (Low):** Dev/test fixtures ship with known dev passwords in the repo. Harmless in dev; **must** be overridden via `SEED_*` in any shared/staging/prod environment (now enforced in prod).
- **R-3 (Low):** `trust proxy = 1` assumed (single proxy hop). If deployment has a chain, set `TRUST_PROXY` accordingly or rate limiting mis-attributes IPs.
- **R-4 (Low):** No account lockout beyond rate limit (DoS-resistant); monitor failed sign-in bursts on `/auth/sign-in` logs.
- **R-5 (Info):** No 2FA for staff. For a 28-room boutique property, bcrypt+strong passwords+RBAC is proportionate; revisit if staff turnover/room count grows.
- **R-6 (Info):** `email_outbox` dedupes on (template, reference); a legitimate re-send (guest explicitly asks again) requires deleting the outbox row — intentional.
- **R-7 (Info):** eTIMS not certified; no fiscal claims made.

## Verified-by

`tests/auth.test.js` (401/403/200 matrix + guest isolation), `tests/booking.test.js` (race, idempotency, cancel releases), `tests/mpesa.test.js` (mocked STK push payload, requery transitions), plus manual config-refusal check in production mode (boot refused with missing `COOKIE_SECURE`).

## M5 addendum (2026-11-11)

M5 review covered authentication/authorization/sessions, RBAC matrix on all new endpoints, CSRF/CORS/rate-limiting, input validation, SQL (all parameterised), webhook security incl. terminal-state idempotency, payment security, secret handling, audit integrity, guest privacy and production error responses.

Deltas shipped in M5: (1) `GET /reservations/:reference` no longer returns phone/country when access is by possession of reference+email - staff and signed-in owners unchanged; (2) `/ready` and `/health` bypass session loading so orchestrators always reach them; database outages map to 503 SERVICE_UNAVAILABLE, never a bare 500; (3) success callback against a settled terminal payment is logged as an anomaly and never flips state; (4) refreshed `paymentFailed` notification path and arrival reminder sweeper reviewed - no data exposure, dedupe via email_outbox.

Findings: no new critical or high issues. Medium: rehearsal finding (readiness probe fatal under DB outage) - fixed and covered by `tests/release-rehearsal.mjs` S17. Low/residual: npm audit - 3 high in dev-only Prisma CLI chain (D-029/D-049 scope; Prisma 7 upgrade is M7); R-7 eTIMS not certified (unchanged); heading-order (best-practice, 1 node, false-positive-assessed).

See `docs/reports/M5.md` section 7 for the full table and classification summary.
