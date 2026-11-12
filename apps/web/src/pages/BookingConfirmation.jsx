import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import BookingSteps from "@/components/booking/BookingSteps.jsx";
import Button from "@/components/ui/Button.jsx";
import Media from "@/components/ui/Media.jsx";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { getLastReservation } from "@/services/reservationService.js";
import { CHARGES } from "@/utils/pricing.js";
import { getRoom } from "@/data/rooms.js";
import { formatDateLong } from "@/utils/dates.js";
import { formatKsh, pluralise } from "@/utils/format.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function BookingConfirmation() {
  useDocumentTitle("Confirmation");
  const { clearDraft } = useBooking();
  const [reservation] = useState(getLastReservation);
  const [payStatus, setPayStatus] = useState("idle");
  const [payError, setPayError] = useState("");

  // The draft has been converted to a reservation; reset it.
  useEffect(() => {
    clearDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!reservation) {
    return (
      <div className="page-top booking-page">
        <div className="container">
          <BookingSteps current={3} />
          <header className="booking-head">
            <h1 className="h-xl">No booking in progress.</h1>
            <p className="lede">Start a search to create a reservation.</p>
            <Button to="/availability" arrow>Search availability</Button>
          </header>
        </div>
      </div>
    );
  }

  const { search, selection, guest, pricing } = reservation;
  const room = getRoom(selection.roomSlug);
  const confirmed = reservation.status === "confirmed";

  const initiatePayment = async () => {
    setPayStatus("sending");
    setPayError("");
    try {
      const res = await fetch("/api/v1/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationReference: reservation.reference, phone: guest?.phone, email: guest?.email }),
      });
      if (res.status === 201 || res.status === 200) { setPayStatus("sent"); return; }
      if (res.status === 503) { setPayStatus("desk"); return; }
      const body = await res.json().catch(() => null);
      setPayError(body?.error?.message || "Could not initiate payment.");
      setPayStatus("error");
    } catch {
      setPayError("Network error — could not initiate payment.");
      setPayStatus("error");
    }
  };

  return (
    <div className="page-top booking-page confirmation">
      <div className="container">
        <BookingSteps current={3} />

        <header className="confirmation__head">
          <p className="stamp" role="status">{confirmed ? "CONFIRMED" : "BOOKING RECEIVED — PAYMENT PENDING"}</p>
          <h1 className="display">{confirmed ? "Your room is confirmed." : "Your stay is held."}</h1>
          <p className="lede">
            {confirmed
              ? "Payment received. We look forward to welcoming you. A confirmation email is on its way if email is configured."
              : "Your reservation is held for the next 15 minutes. Your room is released if payment is not received in time. Settle at the front desk or by M-Pesa when available — quote your reference."}
          </p>
        </header>

        <div className="confirmation__grid">
          <div className="confirmation__ref">
            <p className="eyebrow">Booking reference</p>
            <p className="numeral confirmation__code">{reservation.reference}</p>
            <p className="small">Keep this reference. You will need it at the front desk and for any amendments.</p>
            {room && <Media photo={room.hero} ratio="4 / 3" reveal={false} sizes="(min-width: 1025px) 40vw, 100vw" />}
          </div>

          <div className="confirmation__detail">
            <dl className="kv kv--large">
              <div><dt>Status</dt><dd><strong>{confirmed ? "Confirmed" : "Pending payment"}</strong></dd></div>
              <div><dt>Payment</dt><dd>{confirmed ? "Received" : "Not yet received"}</dd></div>
              <div><dt>Room</dt><dd>{selection.roomName}<br /><span className="small">{selection.ratePlanName}</span></dd></div>
              <div><dt>Check-in</dt><dd>{formatDateLong(search.checkIn)}</dd></div>
              <div><dt>Check-out</dt><dd>{formatDateLong(search.checkOut)}</dd></div>
              <div><dt>Guests</dt><dd>{pluralise(search.adults, "adult")}{search.children > 0 && `, ${pluralise(search.children, "child", "children")}`} · {pluralise(search.rooms, "room")}</dd></div>
              <div><dt>Guest</dt><dd>{guest.firstName} {guest.lastName}<br /><span className="small">{guest.email} · {guest.phone}</span></dd></div>
              {guest.requests && <div><dt>Requests</dt><dd>{guest.requests}</dd></div>}
            </dl>

            <dl className="kv kv--prices">
              <div><dt>{formatKsh(pricing.nightly)} x {pricing.nights} x {pricing.rooms}</dt><dd>{formatKsh(pricing.subtotal)}</dd></div>
              <div><dt>{CHARGES.serviceCharge.label}</dt><dd>{formatKsh(pricing.serviceCharge)}</dd></div>
              <div><dt>{CHARGES.tourismLevy.label}</dt><dd>{formatKsh(pricing.tourismLevy)}</dd></div>
              <div><dt>{CHARGES.vat.label}</dt><dd>{formatKsh(pricing.vat)}</dd></div>
              <div className="kv__total"><dt>Total</dt><dd>{formatKsh(pricing.total)}</dd></div>
            </dl>

            {!confirmed && (
              <div className="pay-box" aria-labelledby="payment-title">
                <p className="eyebrow" id="payment-title">Payment</p>
                {payStatus === "idle" && (
                  <>
                    <p className="body">One tap sends an STK prompt to the M-Pesa number on this booking{guest?.phone ? ` (${guest.phone})` : ""}. Total <strong>{formatKsh(pricing.total)}</strong>.</p>
                    <Button arrow onClick={initiatePayment}>Pay with M-Pesa - {formatKsh(pricing.total)}</Button>
                  </>
                )}
                {payStatus === "sending" && <p className="body">Sending the M-Pesa prompt…</p>}
                {payStatus === "sent" && (
                  <>
                    <p className="body"><strong>Check your phone.</strong> Enter your M-Pesa PIN to pay <strong>{formatKsh(pricing.total)}</strong>. Once you enter it, this booking confirms automatically.</p>
                    <Button variant="outline" onClick={initiatePayment}>Resend the prompt</Button>
                  </>
                )}
                {payStatus === "desk" && <p className="body">Online payment is not enabled for this reservation yet — your room stays held while we confirm it. The front desk will settle the payment; quote reference <strong>{reservation.reference}</strong>.</p>}
                {payStatus === "error" && <p className="body">{payError || "Payment could not be initiated."} The room stays held — settle at the front desk quoting <strong>{reservation.reference}</strong>.</p>}
              </div>
            )}

            <div className="form-actions">
              <Button variant="outline" onClick={() => window.print()}><Printer size={15} strokeWidth={1.5} style={{ marginRight: 8 }} />Print summary</Button>
              <Button to="/account/reservations" arrow>View in my account</Button>
            </div>
            <p className="small"><Link to="/availability">Start another search</Link> · <Link to="/">Return home</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
