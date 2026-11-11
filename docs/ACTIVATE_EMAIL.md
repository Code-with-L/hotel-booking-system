# Activation: Transactional Email — Owner Action List

**State:** Pipeline implemented and tested with an in-memory transport (no real mail sent in tests). Templates (booking confirmation, payment received, cancellation, password reset, new-booking admin alert) are branded HTML + plain text. Without SMTP credentials, emails are recorded as `skipped` in `email_outbox` and the app works normally — nothing pretends to have been sent.

## Owner steps

1. Choose an SMTP provider (Mailgun / Postmark / Amazon SES / your own mail server — anything with standard SMTP).
2. Create credentials (username + password or API key as password).
3. Set in `.env` / platform secrets:
   ```
   EMAIL_PROVIDER=smtp
   EMAIL_SMTP_HOST=smtp.mailgun.org     # or yours
   EMAIL_SMTP_PORT=587                 # 587 STARTTLS (default) or 465 with EMAIL_SMTP_SECURE=true
   EMAIL_SMTP_SECURE=false             # true only for 465
   EMAIL_SMTP_USER=postmaster@yourdomain
   EMAIL_SMTP_PASS=…                   # the credential from step 2
   EMAIL_FROM="The Stillhouse <reservations@yourdomain>"
   ADMIN_NOTIFICATION_EMAIL=reservations@yourdomain   # receives new-booking alert
   ```
4. Restart the API (`docker compose … restart api` or platform redeploy).
5. **Test**: make a test booking with your own email → you must receive "Reservation received" with the booking reference. Check **Operations → email_outbox** or ask the technical owner to confirm `status='sent'` rows.
6. Verify password reset: request reset from `/account` sign-in (once exposed in UI, or POST `/api/v1/auth/forgot-password`) → message arrives within a minute.

## Failure behaviour (honest by design)

- Provider unreachable / wrong creds → send retried 3× with backoff; if all fail, the outbox row records `failed` + the error; **booking flow never blocks or fakes success**; admin notification is skipped silently if `ADMIN_NOTIFICATION_EMAIL` unset.
- Duplicate sends impossible: outbox dedupes on (template, reference) — e.g., retrying a webhook re-sends nothing.

## Verification evidence level

**Mock-verified** (tests: template rendering, HTML escaping, outbox dedupe, skip-when-unconfigured, send path via in-memory transport). **Not yet live-verified** — send one real booking confirmation and one password reset after step 5 and eyeball the rendering in Gmail/Outlook before calling it done.
