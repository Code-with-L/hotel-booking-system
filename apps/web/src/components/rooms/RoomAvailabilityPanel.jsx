/**
 * Booking panel for a specific room page. Auto-checks ~400ms after any change,
 * shows the per-party verdict chip and the exact tax-inclusive total for the
 * Flexible rate, and books straight through to guest details.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button.jsx";
import AvailabilityBar from "@/components/booking/AvailabilityBar.jsx";
import { useBooking, defaultSearch } from "@/features/reservations/BookingContext.jsx";
import { useAvailability } from "@/features/availability/useAvailability.js";
import { useDebouncedValue } from "@/hooks/useDebouncedValue.js";
import { validateSearch } from "@/utils/validators.js";
import { nightsBetween } from "@/utils/dates.js";
import { formatKsh, pluralise } from "@/utils/format.js";

export default function RoomAvailabilityPanel({ room }) {
  const navigate = useNavigate();
  const { setSelection } = useBooking();
  const [values, setValues] = useState(() => defaultSearch());
  const debounced = useDebouncedValue(values, 400);
  const valid = Object.keys(validateSearch(debounced)).length === 0;
  const { loading, data, error } = useAvailability(debounced, valid, 0);
  const checking = loading || JSON.stringify(debounced) !== JSON.stringify(values);
  const nights = nightsBetween(values.checkIn, values.checkOut);
  const results = data?.results ?? [];

  const result = results.find((r) => r.room.slug === room.slug);
  const flexible = result?.plans.find((p) => p.plan.id === "flexible") ?? result?.plans[0];
  const available = Boolean(result?.available && flexible);
  const alt = results.filter((r) => r.available).sort((a, b) => a.room.fromPrice - b.room.fromPrice)[0];
  const suggestion = result && !result.available
    ? alt
      ? `Try ${alt.room.name} — it sleeps ${alt.room.capacity}.`
      : "No room fits this party for these dates."
    : null;

  const book = () => {
    if (!available) return;
    setSelection({
      roomSlug: room.slug,
      roomName: room.name,
      ratePlanId: flexible.plan.id,
      ratePlanName: flexible.plan.name,
      nightly: flexible.nightly,
      nights,
    });
    navigate("/booking/guest-details");
  };

  return (
    <>
      <AvailabilityBar variant="panel" values={values} onChange={setValues} />

      <p className="avail-status panel-status" aria-live="polite">
        {checking && <span className="avail-chip avail-chip--checking"><span className="avail-chip__dot" />Checking…</span>}
        {!checking && available && <span className="avail-chip avail-chip--ok">Available for these dates</span>}
        {!checking && result && !result.available && <span className="avail-chip avail-chip--no">Not available for this party</span>}
        {!checking && error && <span className="avail-chip avail-chip--no">Couldn&apos;t check — connection issue</span>}
      </p>

      {!checking && available && flexible && (
        <div className="panel-total">
          <p className="panel-total__sum">
            <strong>{formatKsh(flexible.pricing.total)}</strong> total
            <span className="small block">{pluralise(nights, "night")} × {pluralise(values.rooms, "room")} · Flexible rate</span>
          </p>
          <p className="small plan__breakdown">
            Room {formatKsh(flexible.pricing.subtotal)} · Service charge 10% {formatKsh(flexible.pricing.serviceCharge)} · Tourism levy 2% {formatKsh(flexible.pricing.tourismLevy)} · VAT 16% {formatKsh(flexible.pricing.vat)}
          </p>
        </div>
      )}

      {!checking && result && !result.available && (
        <p className="result__reason" role="alert">
          <strong>Not available for this party.</strong> {result.reason}{" "}
          {suggestion && (
            alt
              ? <Link to={`/rooms/${alt.room.slug}`} className="panel-suggestion__link">{suggestion}</Link>
              : suggestion
          )}
        </p>
      )}

      <Button variant="solid" onClick={book} disabled={!available} aria-disabled={!available} className="booking-panel__cta">
        Book this room
      </Button>
    </>
  );
}
