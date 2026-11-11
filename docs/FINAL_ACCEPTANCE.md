# THE STILLHOUSE — Final Acceptance Reference

**Status as of 2026-11-12 · HEAD `main` = post-M7 commit · see `docs/reports/M7.md` for full evidence.**

## Decision: CONDITIONAL GO

Engineering acceptance is satisfactory — **this is not a GO for production.** Production remains conditional on the owner-gated items below (no credentials, money, legal approvals, or DNS changes exist or may be invented). No public staging or production URL exists; the only exercised environment is the local isolated stack (`https://staging.stillhouse.local:8443`, self-signed).

## Acceptance matrix (all re-verified in M7)

| Domain | Status | Key evidence |
|---|---|---|
| Guest booking journey | PASS | availability → quote → hold → desk settlement → confirm → check-in → check-out (staging probes, e2e 3/3) |
| Staff/management ops | PASS | RBAC 401/403/200 matrix; CAS transitions (1 winner + 409s); dashboard/reports/audit live+suite |
| DB invariants | PASS | exclusion constraint `room_allocation_no_overlap` (GiST), CHECK constraints, UNIQUE idempotency keys — verified via `psql` |
| Concurrency | PASS | 7-way race → exactly 5 bookings (×2 runs); 8-way suite race → 5 wins; S16 concurrent confirm → 1 winner |
| Financial math | PASS (arithmetic) | SC 10% / levy 2% / VAT 16%-on-net — verified live on quote; totals reconcile to the cent |
| Tax/regulatory policy | **Owner sign-off REQUIRED** | VAT Act s.13(7) letter vs SC distribution agreement unconfirmed; levy base; deposit tax points |
| Security | PASS + residuals | auth/RBAC/rate-limit/CORS/headers/webhook probes; prod deps `npm audit` = 0; deepmerge-ts CVE remediated (override → Trivy exit 0) |
| Accessibility | PASS (axe 0 violations, 8 pages) | Lighthouse lab: perf 58 / a11y 98 / BP 75 / SEO 100 / CLS 0 — indicative only |
| Deployment readiness | PASS (local rehearsal) | CI green; migrations additive; backup/restore drilled; rollback rehearsed; boot guard; probes correct |
| Real integrations | **NOT VERIFIED (awaiting credentials)** | M-Pesa (503 truthful), SMTP (unconfigured), eTIMS (disabled, mock only) |
| Public availability | **DOES NOT EXIST** | owner must supply host/domain/TLS |

## What the owner must provide before any launch (summary of M7 §12–13)

1. Hosting + managed PostgreSQL 16 with automated backups (PITR).
2. Domain + DNS + TLS certificate; HTTPS callback URL.
3. Secrets on the host / CI store (`STAGING_*`), never in Git or chat.
4. **Tax sign-off** (SC distribution agreement under VAT Act s.13(7) or instruction to price VAT on SC-inclusive base; VAT treatment of deposits; Tourism Levy confirmation).
5. M-Pesa Daraja sandbox verification → production decision (`docs/ACTIVATE_MPESA.md`).
6. SMTP provider + deliverability check (SPF/DKIM/DMARC, test mailbox).
7. eTIMS certification only if/when fiscal invoices are in scope.
8. Monitoring + a named human to answer pages; quarterly restore drills.
9. Commissioned photography (also clears the Lighthouse/best-practices P2 items).
10. Explicit production go decision after a green runbook walkthrough.

## Honest one-liner

> The software is built, verified, and release-rehearsed. The business is not yet authorised, verified, or connected to the outside world. That last mile is yours — `docs/reports/M7.md` §13 is the checklist.

*Do not remove this banner until §1–§10 above are individually closed with evidence.*
