# Activation: M-Pesa (Daraja) STK Push — Owner Action List

**State:** Implementation complete and **mock-tested only** (stubbed Daraja endpoints; 20/20 API tests pass). No real payment can be taken and none has been. Nothing below happens automatically.

## What the owner must do (≈ 30–60 min + Safaricom approval lead time)

1. **Register on Daraja:** https://developer.safaricom.co.ke — create an account (company/PINs as prompted).
2. **Create an app** (My Apps → Add) → note `Consumer Key` and `Consumer Secret`.
3. **Request access to M-Pesa Express (STK Push) and STK Query** for the app (Simulation/Production as appropriate; sandbox is instant).
4. **Choose the shortcode:** sandbox uses `174379` (test). Production: your Paybill/Till + the passkey from the M-Pesa onboarding portal.
5. **Get a publicly reachable HTTPS callback URL** — `https://<your-domain>/api/v1/webhooks/mpesa` (TLS required; Daraja will not call plain HTTP). Set it via env; do NOT put "mpesa" or "safaricom" in the path.
6. Set in `.env` (or platform secret store), never in code/chat:
   ```
   MPESA_ENV=sandbox        # or production when certified
   MPESA_CONSUMER_KEY=…
   MPESA_CONSUMER_SECRET=…
   MPESA_SHORTCODE=174379   # sandbox
   MPESA_PASSKEY=…          # from portal
   MPESA_CALLBACK_URL=https://<domain>/api/v1/webhooks/mpesa
   MPESA_WEBHOOK_ALLOWED_IPS= # optional Safaricom callback IP allowlist (see Daraja Getting Started)
   ```
7. **Test in sandbox**: book a room → on review page, "Confirm" → STK push arrives on the test MSISDN from Daraja docs → pay with PIN → reservation flips to `confirmed` within seconds (callback) — or use **Requery** (manager: `POST /admin/payments/:id/requery`) if the callback is lost.
8. **Only after sandbox passes end-to-end**, switch `MPESA_ENV=production` (requires Daraja production certification) and repeat with a real KSh 1 transaction; refund it afterwards via the manager refund flow.

## What "done" looks like

- A real STK push lands on a real phone; entering the PIN flips the reservation to `confirmed`; webhook logs show `resultCode: 0`; replay is a no-op; failing (user cancels / wrong PIN) releases the room automatically; the payment reconciliation report matches your M-Pesa statement.

## Behaviour while unconfigured (safe)

- "Pay online" returns truthful **503** with `MPESA_NOT_CONFIGURED` — never a fake success.
- Front desk settles at the property via desk-payment action; reconciliation and refunds work.

## Timeouts & reconciliation

- 20s HTTP timeouts on Daraja calls; stale pending pushes are auto-requeried every 60s after 45 min, and hourly via sweeper; admin requery anytime; amount/reference mismatches are rejected and audit-logged; duplicate callbacks are idempotent no-ops.

## Verification evidence level

**Mock-verified** (this repo's tests): request shape, callback verification, idempotency, requery transitions, failure paths. **Not yet sandbox-verified** (needs owner's Daraja credentials) — do not claim live payment readiness until step 7 passes.
