# Booking Workflow — The Stillhouse

**Status:** Approved direction at M0 (2026-11-11). Implemented in M4–M5.

## 1. The happy path

```
Guest visits website
  → Select dates + guests (+ optional room type)
  → GET /api/v1/availability ──────────────► live inventory check (allocation-aware)
  → Rooms available?
       NO  → show alternatives / suggest nearby dates
       YES → select room type + rate plan (client state)
  → POST /api/v1/quotes ──────────────────► server computes authoritative total
                                            (rate plan, taxes/charges, expiry)
  → Guest checks quote → POST /api/v1/reservations
       body: quote snapshot + guest details + idempotency key
       server: recompute price, TX insert reservation (pending) + allocation hold
  → POST /api/v1/payments ────────────────► provider (M-Pesa Daraja STK first)
  → Provider webhook POST /api/v1/webhooks/mpesa
       verify → record payment_attempt → confirm reservation (TX)
  → Confirmation page (reference, summary) + transactional email
```

## 2. Reservation state machine

```
pending ──payment OK──────────► confirmed ──check_in──► checked_in ──check_out──► checked_out
pending ──payment fails───────► payment failed (reservation stays pending until expiry)
pending ──TTL elapses─────────► expired    (allocation released)
confirmed ──guest/staff cancel► cancelled  (fee per rate plan policy; refund flow if paid)
checked_in ──no-show──────────► (manual decision by staff; audit-logged; policy applies)
```

Transitions are explicit functions in the backend. No path outside the machine is permitted; every transition writes `audit_log`.

## 3. Temporary holds

- TTL: **15 minutes**, configurable. Starts when the reservation is created (`pending`).
- Hold = `room_allocation(kind='hold', expires_at = now() + ttl)`. Row occupies inventory and is invisible to new availability reads once `expires_at` passes (belt) **and** removed by the 60-second sweeper (braces). See `DATABASE_DESIGN.md` §3.
- Quote expiry: `expiresAt` on the quote equals the same TTL. A quote older than `expiresAt` is rejected at `POST /reservations` time — the client must re-quote.

## 4. Payment integration (M5)

- **M-Pesa Daraja (STK push) first.** Flow: server initiates STK → guest approves on phone → Daraja calls our webhook → we verify (request validation + the documented Daraja callback structure; see SECURITY.md) → confirm.
- Card provider later (Flutterwave/DPO/Stripe) — same `payments` module, same webhook pattern, PCI handled by provider; we never see PAN/CVV.
- **Idempotency**: `POST /reservations` accepts `Idempotency-Key`; `POST /webhooks/*` is naturally idempotent (we key on `payment_attempt.provider_reference`).
- A room is never marked `confirmed` without a verified provider result. A failed payment never permanently consumes inventory.

## 5. Cancellation & refunds

- Rate plan `cancellation_policy` JSONB: `{ window_hours, penalty_percent, refundable }`.
- Cancel endpoint: `POST /api/v1/reservations/:reference/cancel { reason? }`.
- If a payment exists and policy implies refund: create a refund intent with the provider (`payment.status → pending refund`), never auto-"succeed". Refund completion arrives via webhook → `payment.status = refunded|partially_refunded`.
- Cancellation of `confirmed` releases allocation only when payment state is resolved or policy allows immediate release; otherwise staff decides (audit-logged).
- Guest-facing cancellation rules are shown at review step and in confirmation email — no hidden fees.

## 6. Availability semantics

`GET /api/v1/availability?checkIn&checkOut&adults&children&rooms` returns, per room type: `available: true|false` (+ `reason` when false, e.g. capacity), and the list of applicable `ratePlans` with per-plan `nightly`, `subtotal`, taxes and `currency`. A room type is available iff: capacity suffices AND at least one physical room of that type has no occupying overlapping allocation (confirmed or active hold).

## 7. Edge cases that must never happen

- Double-booking one physical room (prevented by exclusion constraint — `DATABASE_DESIGN.md`).
- Quote accepted after expiry.
- Reservation confirmed without verified payment.
- Webhook replay confirming twice (idempotency on provider reference).
- Hold leak consuming inventory forever (sweeper + read-time filtering).
- Client-supplied totals used for charging (server always recomputes).
