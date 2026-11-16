/**
 * Booking flow — search dates, see rooms, select plan. Reused by both the
 * homepage (section) and the /availability route (page wrapper).
 * No submit button: availability re-checks automatically ~400ms after any change.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import AvailabilityBar, { searchToQuery } from "@/components/booking/AvailabilityBar.jsx";
import BookingSteps from "@/components/booking/BookingSteps.jsx";
import RoomResult from "@/components/rooms/RoomResult.jsx";
import { useBooking, defaultSearch } from "@/features/reservations/BookingContext.jsx";
import { parseSearchParams } from "@/features/availability/searchParams.js";
import { useAvailability } from "@/features/availability/useAvailability.js";
import { useDebouncedValue } from "@/hooks/useDebouncedValue.js";
import { validateSearch } from "@/utils/validators.js";
import { formatShort, nightsBetween } from "@/utils/dates.js";
import { pluralise } from "@/utils/format.js";

export default function AvailabilitySection({
  title = "Book your room.",
  lede,
  Heading = "h1",
  showSteps = true,
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSearch, setSelection } = useBooking();

  // URL wins on first load; otherwise fresh defaults (never a stale saved draft).
  const [values, setValues] = useState(() => parseSearchParams(params) ?? defaultSearch());
  const debounced = useDebouncedValue(values, 400);
  const errors = validateSearch(debounced);
  const valid = Object.keys(errors).length === 0;
  const [retryNonce, setRetryNonce] = useState(0);
  const { loading, data, error } = useAvailability(debounced, valid, retryNonce);
  const checking = loading || JSON.stringify(debounced) !== JSON.stringify(values);

  // Keep the booking draft and shareable URL in step with the debounced values.
  useEffect(() => {
    if (!valid) return;
    setSearch(debounced);
    setParams(searchToQuery(debounced), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(debounced)]);

  const preferred = params.get("room");
  const results = useMemo(() => {
    if (!data) return [];
    return [...data.results].sort((a, b) => (a.room.slug === preferred ? -1 : b.room.slug === preferred ? 1 : 0));
  }, [data, preferred]);

  const nights = nightsBetween(values.checkIn, values.checkOut);

  // Alternatives offered when a type cannot host the party: cheapest available types first.
  const alternatives = useMemo(
    () => (data?.results ?? []).filter((r) => r.available).sort((a, b) => a.room.fromPrice - b.room.fromPrice),
    [data],
  );
  const suggestionFor = (r) => {
    if (r.available) return null;
    const alt = alternatives[0];
    return alt
      ? `Try ${alt.room.name} — it sleeps ${alt.room.capacity}.`
      : "No room fits this party for these dates — try more rooms or other dates.";
  };

  const onSelect = (room, plan, nightly) => {
    setSelection({
      roomSlug: room.slug,
      roomName: room.name,
      ratePlanId: plan.id,
      ratePlanName: plan.name,
      nightly,
      nights,
    });
    navigate("/booking/guest-details");
  };

  return (
    <>
      {showSteps && <BookingSteps current={0} />}
      <header className="booking-head">
        <p className="eyebrow eyebrow--olive">Availability</p>
        <Heading className="h-xl">{title}</Heading>
        <p className="lede">
          {lede ?? `${formatShort(values.checkIn)} – ${formatShort(values.checkOut)} · ${pluralise(nights, "night")} · ${pluralise(values.adults, "adult")}${values.children > 0 ? `, ${pluralise(values.children, "child", "children")}` : ""} · ${pluralise(values.rooms, "room")}`}
        </p>
      </header>

      <div className="bar-strip bar-strip--inset">
        <AvailabilityBar variant="bar" values={values} onChange={setValues} />
      </div>

      <p className="avail-status" aria-live="polite">
        {checking ? (
          <span className="avail-chip avail-chip--checking"><span className="avail-chip__dot" />Checking…</span>
        ) : !valid ? (
          <span className="form-alert" role="alert">{Object.values(errors)[0]}</span>
        ) : null}
      </p>
      {!checking && !valid && (
        <p className="small">Adjust your dates or party above — stays are limited to 14 nights.</p>
      )}
      {!checking && valid && (
        <p className="small">Live availability, computed by the hotel&apos;s reservation system for your dates.</p>
      )}

      {valid && loading && !data && (
        <div className="results" aria-busy="true" aria-live="polite">
          <p className="sr-only">Checking availability…</p>
          {[0, 1, 2].map((i) => (
            <div className="result result--skeleton" key={i} aria-hidden="true" />
          ))}
        </div>
      )}

      {valid && !loading && error && (
        <div className="form-alert" role="alert">
          <p><strong>We couldn&apos;t load live availability right now.</strong> Please check your connection and try again.</p>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setRetryNonce((n) => n + 1)}>Try again</button>
        </div>
      )}

      {valid && !loading && !error && data && results.length === 0 && (
        <div className="empty-state" role="status">
          <h2 className="h-lg">Fully booked for those dates.</h2>
          <p className="lede">Every room in the property is taken (or blocked for maintenance) for your dates. Try adjusting your dates, party size, or contact the front desk on WhatsApp and we&apos;ll see what can be done.</p>
        </div>
      )}

      {valid && !error && data && results.length > 0 && (
        <div className="results" aria-busy={checking}>
          {results.map((r) => (
            <RoomResult key={r.room.slug} result={r} nights={nights} rooms={values.rooms} suggestion={suggestionFor(r)} onSelect={onSelect} />
          ))}
        </div>
      )}
    </>
  );
}
