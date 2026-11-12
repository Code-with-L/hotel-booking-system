# STK Push acceptance — Daraja sandbox (2026-11-12)

**Environment:** local dev stack (`apps/api` on `:4000`, dev DB `stillhouse`), `MPESA_ENV=sandbox`, callback via Cloudflare quick tunnel (`implementing-feels-roll-furniture.trycloudflare.com` → `:4000`).
**What was tested:** one sandbox STK Push, user-cancelled by their choice. No real-money movement is possible in this environment — sandbox only, shortcode 174379.
**Phone number:** owner-registered Daraja sandbox number, entered on their own terminal via `%TEMP%\stk-push-prompt.mjs`; never persisted in the repo, logs, or database; not printed here.
**Disposition of test reservation:** `STL-2026-DNJQWS` (garden-room, flexible, 20→21 Nov 2027, 2 adults) — **STI-2026 reference stays `pending` by design** (failed payment does not auto-cancel a hold; it expires via 15-minute hold TTL / sweeper). Allocation released. Disposable fixture; safe to leave to expire.

## Verified results (evidence collected 2026-11-12, this machine)

1. **API health & config** — `/api/v1/health` → 200. `MPESA_ENV=sandbox` (verified by env read; production endpoints never referenced).
2. **Daraja OAuth** — consumer key/secret authenticate: `https://sandbox.safaricom.co.ke/oauth/v1/generate` → **HTTP 200**, token issued (never printed).
3. **Tunnel reachability (callback path)** — bogus-callback probe via public tunnel returned the API's own response (`{"ResultCode":1,"ResultDesc":"Unknown transaction"}`); `/api/v1/health` via tunnel → 200. Callback URL in `.env` matches the active tunnel exactly.
4. **Reservation readiness** — fresh 1-night disposable booking `STL-2026-DNJQWS`, KES 35,840.00 (net 28,000 + SC 2,800 + levy 560 + VAT 4,480), pending, hold TTL 15 min, enforceable by exclusion constraint.
5. **STK push accepted** — `POST /api/v1/payments` → **HTTP 201**, `CheckoutRequestID` issued. Phone number: **2547••••••490** (masked). The push physically reached the owner's sandbox handset.
6. **Persistence** — `payment` id 31: provider `mpesa`, amountMinor `3584000`, KES, status `pending`; `payment_attempt` id 31: pending + `providerReference` set; `audit_log`: `payment.initiated`.
7. **Owner cancelled the prompt on the handset** (their deliberate choice — no real charge even in sandbox).
8. **Cancellation callback received by the API** — captured in `payment_attempt` id 32: `ResultCode 1032`, `ResultDesc "Request Cancelled by user."`, verified, amount matches. Webhook answered 200 with the Daraja-style envelope (no 5xx).
9. **Post-cancellation state (DB-verified)** — payment `failed`, `failureReason="Request Cancelled by user."`, `capturedAt` null; reservation remains `pending`; allocation `released` (was exactly 1 occupying → 0); audit rows: `payment.initiated` → `payment.failed` — atomic with the state change (M2-B invariant).
10. **Duplicate callback idempotency** — verbatim replay of the captured 1032 callback, twice → `{"ResultCode":0,"ResultDesc":"Accepted (already failed)"}` both times; zero new payment_attempts; zero new state changes; allocations unchanged.
11. **Forged success callback (synthetic, labelled)** — a POST with `ResultCode 0` and the real CheckoutRequestID/amount → `{"ResultCode":0,"ResultDesc":"Accepted (already failed)"}` — **terminal-state guard rejected the forged confirmation**. Reservation NOT confirmed. Error-level anomaly logged (`mpesa success callback against a settled terminal payment - manual reconciliation required`).
12. **Reconciliation** — `GET /admin/reports/reconciliation`: 31 payments, succeededMinor = 4,359,552.00 KES; failed=1 (this one); pending=0; refunded=0; the failed row appears as `failed`, `capturedAt=null`.
13. **Payment health (admin)** — after a one-line fix (see below): `healthy: true` with a single informational low-severity finding `failed_payments_last_30d` (count 1) — exactly the real event, nothing spurious.
14. **Test suite** — 45/45 API tests green with the fix in place.

## Defect found and fixed during this test

`GET /admin/reports/payment-health` reported `duplicate_provider_transactions` (severity high) on **every** normally-settled M-Pesa payment, because the check counted `payment_attempt` rows per `providerReference` with `HAVING count(*) > 1`, whereas a normal lifecycle creates exactly 2 attempts (initiation + settlement). Fixed to `HAVING count(*) > 2` (one-line change, `apps/api/src/modules/admin/routes.js`). Suite still 45/45; report now truthful.

## Not exercised live (honest limits)

- **Successful payment path** — owner chose to cancel the prompt; no sandbox PIN was entered successfully, so no live success-callback → reservation-confirmed transition was observed in this run. That transition is covered by the automated suite (mocked callbacks) but NOT by this physical test.
- **STK Query on a still-pending transaction** — not exercised live: the cancellation settled the payment before a requery was meaningful. The admin requery route correctly refused (409: `This payment is failed; requery is only meaningful while pending.`). Requery logic is covered by the suite (`mpesa.test.js` requery tests) with mocks.
- **Callback via a permanent domain** — the callback relied on a Cloudflare quick-tunnel, which is ephemeral (URL changes on restart, process death, or machine reboot). A reboot during/after a payment would silently break the callback path until the tunnel is recreated. Not a defect — a constraint of this environment — but production requires the managed host + permanent domain from M6/M7.
- **Amount verification of SMS/notification content** — outbox records were checked only via the test suite; no real SMS exists in Daraja sandbox without a real handset flow (which did not complete with PIN entry).
- **TLS chain validity** — the quick tunnel presents Cloudflare's edge cert (publicly valid) rather than our own; hosted staging/prod must use a real CA for the domain with HSTS — unchanged from M6/M7 decisions.
- **eTIMS invoice issuance for the (never completed) payment** — nothing issued; correct.

## Remaining blockers / next actions

1. **Success-path live test** — repeat with owner entering sandbox PIN and observing `confirmed`; also verifies `paymentReceived` email path end-to-end. (5 minutes; same fixture reservation approach.)
2. **Permanent callback URL** — commissions the hosted staging/prod deployment (M7 §13 items G-1/G-2); Cloudflare quick tunnels are not viable long-term.
3. **Daraja Go-Live** — when Safaricom issues the live app credentials (after sandbox verification), repeat identical checks against `api.safaricom.co.ke` with KES 1 first — never production defaults.
4. **Commit** — this acceptance deliberately changed no committed code except the one-line health-check fix (`routes.js`); it is intentionally left uncommitted pending your review; commit when you're ready.

## Verdict

Sandbox delivery works end-to-end up to the handset; cancellation callback verified, idempotent, correctly isolated from financial state; forged confirmations rejected; reconciliation truthful; suite green. The one code defect found was fixed. The success path and a permanent callback remain the two open items before this integration can be called production-verified — both require only a repeat session (owner PIN entry) and the existing M7 commissioning work.
