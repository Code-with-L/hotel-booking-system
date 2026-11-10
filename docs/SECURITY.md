# Security — The Stillhouse

**Status:** Approved direction at M0 (2026-11-11). Enforced from M3 onward. No checklist item may be waived silently; waivers require a DECISIONS.md entry.

## 1. Authentication

- **Server-managed sessions** in PostgreSQL (session table) via HttpOnly, Secure, `SameSite=Lax` cookies. No tokens in `localStorage`. Session id rotated on login/privilege change; idle timeout (e.g. 8h guests, 30m staff); absolute lifetime (e.g. 7 days).
- Passwords: **bcrypt** (cost ≥ 12). Never stored, logged or transmitted in clear text after hashing.
- Sign-in rate limiting per IP + email; exponential backoff; generic error messages (no user enumeration).
- Password reset: single-use, time-boxed token emailed to the account; token hash stored, not raw token.
- Email verification for guest accounts; unverified accounts cannot complete a paid booking (they may browse).
- Staff accounts are created by an admin, never self-registered. Staff sessions expire sooner and require step-up (re-auth) for destructive actions (delete/cancel).

## 2. Authorization (RBAC)

| Role | Can |
|---|---|
| guest | View/manage own profile; view/cancel own reservations; make new bookings |
| receptionist | Front-desk: reservations read/create/modify/check-in/out; guest records read/create; no rates, no settings, no refunds above threshold |
| manager | All receptionist + rates, inventory blocks, cancellations/refunds, reports |
| admin | Everything + staff management, hotel settings, audit log export |

Rules:
- Every admin route checks role server-side (middleware), not in the UI.
- A guest must never act on another guest's reservation by changing an ID in the URL — every guest-scoped query filters by the session's `guest_id`.
- Staff queries are scoped and logged.

## 3. Input & query safety

- **Zod schemas on every endpoint** (shared package where practical). Client validation is UX; server validation is truth. Reject unknown fields (`.strict()`).
- Prisma parameterised queries only; **no raw string concatenation SQL**. Any `queryRaw` requires review + explicit parameters.
- UUID/reference guessability: reservation references are unique but not sequential-guessable for guest access; guest access always requires session ownership or `reference + email` for confirmation lookup.

## 4. Transport & web surface

- HTTPS only in production; HSTS; secure cookies; `helmet`-equivalent headers (CSP, X-Frame-Options, nosniff, referrer-policy).
- **CSRF**: SameSite=Lax + anti-CSRF token on state-changing form posts for cookie-authenticated routes (or double-submit).
- **Rate limiting**: global + per-route tighter limits on `/auth/*`, `/reservations`, `/enquiries`, availability search (bursts).
- CORS: explicit allowlist (the web origin), never `*`.
- File upload: none in v1. If added (e.g. ID/KYC), it goes through a signed upload flow with type/size validation.
- Error responses never leak stack traces or SQLSTATE codes to clients; SQLSTATE is logged server-side and mapped to `error.code`.

## 5. Payments

- **M-Pesa Daraja (STK push)**: server-side OAuth token; webhook verified via documented callback structure + (recommended) IP allowlisting for Daraja callback source ranges + rejection of unexpected `ResultCode`s. Store raw payload in `payment_attempt` **before** any state change, signature verification result recorded.
- **Card (later)**: Stripe/Flutterwave/DPO class provider — hosted fields/tokenization. **We never see, log or store PAN/CVV.** Not even temporarily in application memory beyond the provider SDK's own handling.
- Webhook replay protection: idempotency keyed on `payment_attempt.provider_reference`; duplicate callbacks are no-ops.
- Amounts are compared server-side against the reservation snapshot; mismatched amounts are rejected and audit-logged.
- Secrets (Daraja credentials, provider keys, `DATABASE_URL`, session secret) live in environment variables only. Never in git, never in `docs/`, never in logs. Rotation procedure documented at M3.

## 6. Data protection

- Kenya Data Protection Act 2019 (and GDPR where applicable): explicit consent capture (`consentPrivacy`) at booking; data minimisation; purpose limitation; retention policy (e.g. booking data retained per tax/legal requirement, anonymise on request where lawful).
- Audit log: append-only, administrator-accessible, export-controlled.
- Secrets in logs: request logging must redact bodies with PII/passwords/tokens; webhook payloads logged with amounts/references but never payment secrets.
- Database: least-privilege DB user for the app (no `DROP`, no DDL); migrations run under a separate migration role.

## 7. Verification

- Checklist applied at M3 (baseline), M5 (payments), M7 (pre-release): dependency audit (`npm audit`), session fixation test, RBAC matrix test, booking-race test (concurrent requests → exactly one succeeds), webhook signature negative tests, SQL injection probes on all inputs, CSRF negative test, rate-limit burst test.
- Security findings block release; no exceptions without DECISIONS.md.
