import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AvailabilityBar, { searchToQuery } from "@/components/booking/AvailabilityBar.jsx";
import BookingSteps from "@/components/booking/BookingSteps.jsx";
import RoomResult from "@/components/rooms/RoomResult.jsx";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { parseSearchParams } from "@/features/availability/searchParams.js";
import { useAvailability } from "@/features/availability/useAvailability.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";
import { validateSearch } from "@/utils/validators.js";
import { formatShort, nightsBetween } from "@/utils/dates.js";
import { pluralise } from "@/utils/format.js";

export default function Availability() {
  useDocumentTitle("Availability");
  const [params, setParams] = useSearchParams();
  const { search, setSearch, setSelection } = useBooking();
  const navigate = useNavigate();

  const current = useMemo(() => parseSearchParams(params) || search, [params, search]);
  const errors = validateSearch(current);
  const valid = Object.keys(errors).length === 0;
  const { loading, data } = useAvailability(current, valid);

  // Keep the booking draft in step with the URL.
  useEffect(() => {
    if (JSON.stringify(current) !== JSON.stringify(search)) setSearch(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const preferred = params.get("room");
  const results = useMemo(() => {
    if (!data) return [];
    return [...data.results].sort((a, b) => (a.room.slug === preferred ? -1 : b.room.slug === preferred ? 1 : 0));
  }, [data, preferred]);

  const nights = nightsBetween(current.checkIn, current.checkOut);

  const select = (room, plan, nightly) => {
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
    <div className="page-top booking-page">
      <div className="container">
        <BookingSteps current={0} />
        <header className="booking-head">
          <p className="eyebrow eyebrow--olive">Availability</p>
          <h1 className="h-xl">Choose your room.</h1>
          {valid && (
            <p className="lede">
              {formatShort(current.checkIn)} – {formatShort(current.checkOut)} · {pluralise(nights, "night")} ·{" "}
              {pluralise(current.adults, "adult")}
              {current.children > 0 && `, ${pluralise(current.children, "child", "children")}`} · {pluralise(current.rooms, "room")}
            </p>
          )}
        </header>

        <div className="bar-strip bar-strip--inset">
          <AvailabilityBar
            key={JSON.stringify(current)}
            initial={current}
            variant="bar"
            submitLabel="Update"
            onSearch={(s) => setParams(searchToQuery(s))}
          />
        </div>

        <p className="small">Live availability, computed by the hotel&apos;s reservation system for your dates.</p>

        {!valid && (
          <p className="form-alert" role="alert">
            {Object.values(errors)[0]} Please adjust your dates above.
          </p>
        )}

        {valid && loading && (
          <div className="results" aria-busy="true" aria-live="polite">
            <p className="sr-only">Searching availability…</p>
            {[0, 1, 2].map((i) => (
              <div className="result result--skeleton" key={i} aria-hidden="true" />
            ))}
          </div>
        )}

        {valid && !loading && (
          <div className="results">
            {results.map((r) => (
              <RoomResult key={r.room.slug} result={r} nights={nights} onSelect={select} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
