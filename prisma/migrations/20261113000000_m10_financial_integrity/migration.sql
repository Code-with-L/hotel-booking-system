-- M10 Phase 0 (G2) — financial integrity invariants (additive only)
--
-- 1. need_allocation reservation state: reservation is money-settled but no room could be
--    allocated (hold lost before settlement) — honest "in-flight" state, never silent.
ALTER TYPE "ReservationStatus" ADD VALUE IF NOT EXISTS 'needs_allocation';

-- 2. Attempt-scope once-only settlement: a CheckoutRequestID may never settle twice.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempt_providerReference_succeeded_key
  ON payment_attempt ("providerReference") WHERE status = 'succeeded';

-- 3. Settle-time aggregate lookups (net capture) without seq scans.
CREATE INDEX IF NOT EXISTS payment_reservationId_status_idx ON payment ("reservationId", status);
CREATE INDEX IF NOT EXISTS payment_attempt_reservationId_status_idx ON payment_attempt ("reservationId", status);

-- 4. v1: exactly one succeeded desk (manual, non-zero) capture per reservation.
--    Dropped in Phase 1 if partial desk payments ship.
CREATE UNIQUE INDEX IF NOT EXISTS one_desk_succeeded_per_reservation
  ON payment ("reservationId") WHERE provider = 'manual' AND status = 'succeeded';

-- 5. Reservation-level net-capture guard. No settlement may raise captured amount
--    above the reservation total (net of fully-refunded payments). Defence-in-depth
--    behind the transaction-level Layer 1 check in lib/confirm.js.
CREATE OR REPLACE FUNCTION payment_net_capture_guard() RETURNS trigger AS $$
DECLARE
  prior_net bigint;
  refunded_net bigint;
  total_minor bigint;
BEGIN
  IF NEW.status <> 'succeeded' THEN
    RETURN NEW;
  END IF;
  SELECT "totalMinor" INTO total_minor FROM reservation WHERE id = NEW."reservationId";
  IF total_minor IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_WITHOUT_RESERVATION' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(SUM(p."amountMinor"), 0) INTO prior_net
    FROM payment p
   WHERE p."reservationId" = NEW."reservationId"
     AND p.status = 'succeeded'
     AND p.id <> NEW.id;
  SELECT COALESCE(SUM(a."amountMinor"), 0) INTO refunded_net
    FROM payment_attempt a
    JOIN payment p ON p.id = a."paymentId"
   WHERE p."reservationId" = NEW."reservationId"
     AND a.status = 'refunded';
  IF prior_net + NEW."amountMinor" - refunded_net > total_minor THEN
    RAISE EXCEPTION 'PAYMENT_OVER_TOTAL' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_over_total_guard ON payment;
CREATE TRIGGER payment_over_total_guard
  BEFORE INSERT OR UPDATE OF status ON payment
  FOR EACH ROW EXECUTE FUNCTION payment_net_capture_guard();
