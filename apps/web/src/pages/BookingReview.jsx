import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import BookingSteps from "@/components/booking/BookingSteps.jsx";
import BookingSummary from "@/components/booking/BookingSummary.jsx";
import { CheckField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { createReservation, quoteStay } from "@/services/reservationService.js";
import { getRatePlan } from "@/data/rooms.js";
import { formatKsh } from "@/utils/format.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function BookingReview() {
  useDocumentTitle("Review");
  const { search, selection, guest } = useBooking();
  const navigate = useNavigate();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");

  const plan = selection ? getRatePlan(selection.ratePlanId) : null;

  // The binding quote always comes from the server.
  useEffect(() => {
    if (!selection) return undefined;
    let cancelled = false;
    setQuote(null);
    quoteStay({
      roomTypeSlug: selection.roomSlug,
      ratePlanKey: selection.ratePlanId,
      checkIn: search.checkIn,
      checkOut: search.checkOut,
      adults: search.adults,
      children: search.children,
      rooms: search.rooms,
    })
      .then((q) => !cancelled && setQuote(q))
      .catch((err) => !cancelled && setQuoteError(err.message || "Could not load the price. Please go back and try again."));
    return () => { cancelled = true; };
  }, [selection, search]);

  if (!selection) return <Navigate to="/availability" replace />;
  if (!guest) return <Navigate to="/booking/guest-details" replace />;

  const pricing = quote;

  const submit = async () => {
    if (!ack) {
      setError("Please accept the cancellation terms to continue.");
      document.getElementById("review-ack")?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      await createReservation({ search, selection, guest });
      navigate("/booking/confirmation");
    } catch (err) {
      if (err?.code === "ROOM_UNAVAILABLE") {
        setError("Those rooms were just taken for these dates. Please choose different dates or another room type.");
      } else {
        setError(err?.message || "Could not complete the reservation. Please try again.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="page-top booking-page">
      <div className="container">
        <BookingSteps current={2} />
        <header className="booking-head">
          <p className="eyebrow eyebrow--olive">Step 3</p>
          <h1 className="h-xl">Review your stay.</h1>
        </header>
        <div className="booking-layout">
          <div className="booking-form">
            <section className="review-block" aria-labelledby="rv-guest">
              <div className="review-block__head">
                <h2 id="rv-guest" className="eyebrow">Guest</h2>
                <Link to="/booking/guest-details" className="link-arrow"><span>Edit</span></Link>
              </div>
              <p className="h-sm">{guest.firstName} {guest.lastName}</p>
              <p className="small">{guest.email} · {guest.phone} · {guest.country}</p>
              {guest.requests && <p className="small">Requests: {guest.requests}</p>}
            </section>

            <section className="review-block" aria-labelledby="rv-price">
              <h2 id="rv-price" className="eyebrow">Price breakdown</h2>
              {quoteError ? (
                <p className="form-alert" role="alert">{quoteError}</p>
              ) : !pricing ? (
                <p className="small" aria-live="polite">Calculating your stay…</p>
              ) : (
                <table className="table table--compact">
                  <tbody>
                    <tr><th scope="row">Nightly rate</th><td className="price">{formatKsh(pricing.nightly)}</td></tr>
                    <tr><th scope="row">Nights x rooms</th><td>{pricing.nights} x {pricing.rooms}</td></tr>
                    <tr><th scope="row">Subtotal</th><td className="price">{formatKsh(pricing.subtotal)}</td></tr>
                    <tr><th scope="row">Service charge (10%)</th><td className="price">{formatKsh(pricing.serviceCharge)}</td></tr>
                    <tr><th scope="row">Tourism levy (2%)</th><td className="price">{formatKsh(pricing.tourismLevy)}</td></tr>
                    <tr><th scope="row">VAT (16%)</th><td className="price">{formatKsh(pricing.vat)}</td></tr>
                    <tr className="table__total"><th scope="row">Total</th><td className="price">{formatKsh(pricing.total)}</td></tr>
                  </tbody>
                </table>
              )}
            </section>

            <section className="review-block" aria-labelledby="rv-policy">
              <h2 id="rv-policy" className="eyebrow">Cancellation policy · {plan?.name}</h2>
              <p className="body">{plan?.cancellation}</p>
            </section>

            <p className="small">
              Your room is held for 15 minutes after you confirm. Payment is settled on arrival, or by M-Pesa where the property has digital payment enabled — the front desk will confirm payment with you either way.
            </p>

            <CheckField id="review-ack" checked={ack} onChange={(e) => { setAck(e.target.checked); setError(""); }} error={error}>
                I have read and accept the rate shown and the cancellation policy above.
            </CheckField>

            <div className="form-actions">
              <Button to="/booking/guest-details" variant="text">Back</Button>
              <Button arrow onClick={submit} disabled={busy || !quote}>{busy ? "Confirming..." : "Confirm booking"}</Button>
            </div>
          </div>

          <BookingSummary search={search} selection={selection} pricing={pricing} showPricing={false} title="Selected stay" />
        </div>
      </div>
    </div>
  );
}


