import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, Search } from "lucide-react";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { addDays, todayISO } from "@/utils/dates.js";
import { validateSearch } from "@/utils/validators.js";
import { MAX_NIGHTS, MAX_ROOMS_PER_BOOKING, MAX_ADULTS_PER_ROOM, MAX_CHILDREN_PER_ROOM } from "@/data/site.js";

export const searchToQuery = (s) =>
  new URLSearchParams({
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    adults: String(s.adults),
    children: String(s.children),
    rooms: String(s.rooms),
  }).toString();

function Stepper({ label, value, min, max, onChange, id }) {
  return (
    <div className="avail__field avail__field--stepper" role="group" aria-labelledby={id}>
      <span className="avail__label" id={id}>
        {label}
      </span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
          <Minus size={15} strokeWidth={1.5} />
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
          <Plus size={15} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/**
 * Availability search. variant: "bar" (horizontal desktop / stacked mobile) | "panel" (vertical).
 * On submit it stores the search in the booking draft and routes to /availability.
 * Steppers cap automatically: adults ≤ rooms × 2, children ≤ rooms × 2, rooms ≤ MAX_ROOMS_PER_BOOKING;
 * check-out is capped at MAX_NIGHTS after check-in so an out-of-range stay can never be selected.
 */
export default function AvailabilityBar({ variant = "bar", initial, onSearch, submitLabel = "Check availability" }) {
  const { search, setSearch } = useBooking();
  const navigate = useNavigate();
  const uid = useId();
  const [values, setValues] = useState(initial || search);
  const [errors, setErrors] = useState({});
  const today = todayISO();
  const maxCheckOut = values.checkIn ? addDays(values.checkIn, MAX_NIGHTS) : undefined;

  const patch = (p) => setValues((v) => {
    const next = { ...v, ...p };
    // If rooms changed, keep adults/children within the new room capacity.
    if ("rooms" in p) {
      const cap = next.rooms * MAX_ADULTS_PER_ROOM;
      const capChildren = next.rooms * MAX_CHILDREN_PER_ROOM;
      if (next.adults > cap) next.adults = cap;
      if (next.children > capChildren) next.children = capChildren;
    }
    // Keep check-out within the stay limit whenever dates change.
    if (next.checkOut && (next.checkOut <= next.checkIn || (next.checkIn && Math.round((new Date(next.checkOut) - new Date(next.checkIn)) / 86400000) > MAX_NIGHTS))) {
      next.checkOut = addDays(next.checkIn, MAX_NIGHTS);
    }
    return next;
  });

  const onCheckIn = (e) => {
    const checkIn = e.target.value;
    const next = { checkIn };
    if (!values.checkOut || values.checkOut <= checkIn) next.checkOut = addDays(checkIn, 1);
    else if (Math.round((new Date(values.checkOut) - new Date(checkIn)) / 86400000) > MAX_NIGHTS) next.checkOut = addDays(checkIn, MAX_NIGHTS);
    patch(next);
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validateSearch(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSearch(values);
    if (onSearch) onSearch(values);
    else navigate(`/availability?${searchToQuery(values)}`);
  };

  const firstError = Object.values(errors)[0];
  const maxAdults = values.rooms * MAX_ADULTS_PER_ROOM;
  const maxChildren = values.rooms * MAX_CHILDREN_PER_ROOM;

  return (
    <form className={`avail avail--${variant}`} onSubmit={submit} noValidate aria-label="Check availability" data-hero-bar-form>
      <div className="avail__field avail__field--stepper" role="group" aria-labelledby={`${uid}-rm-label`}>
        <span className="avail__label" id={`${uid}-rm-label`}>Rooms</span>
        <div className="stepper">
          <button type="button" onClick={() => patch({ rooms: Math.max(1, values.rooms - 1) })} disabled={values.rooms <= 1} aria-label="Fewer rooms">
            <Minus size={15} strokeWidth={1.5} />
          </button>
          <output aria-live="polite">{values.rooms}</output>
          <button type="button" onClick={() => patch({ rooms: Math.min(MAX_ROOMS_PER_BOOKING, values.rooms + 1) })} disabled={values.rooms >= MAX_ROOMS_PER_BOOKING} aria-label="More rooms">
            <Plus size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="avail__field">
        <label className="avail__label" htmlFor={`${uid}-in`}>Check-in</label>
        <input id={`${uid}-in`} type="date" min={today} value={values.checkIn} onChange={onCheckIn} aria-invalid={errors.checkIn ? "true" : undefined} />
      </div>
      <div className="avail__field">
        <label className="avail__label" htmlFor={`${uid}-out`}>Check-out <span className="avail__label-note">max {MAX_NIGHTS} nights</span></label>
        <input
          id={`${uid}-out`}
          type="date"
          min={values.checkIn ? addDays(values.checkIn, 1) : today}
          max={maxCheckOut}
          value={values.checkOut}
          onChange={(e) => patch({ checkOut: e.target.value })}
          aria-invalid={errors.checkOut ? "true" : undefined}
        />
      </div>
      <Stepper id={`${uid}-ad`} label="Adults" value={values.adults} min={1} max={maxAdults} onChange={(adults) => patch({ adults })} />
      <Stepper id={`${uid}-ch`} label="Children" value={values.children} min={0} max={maxChildren} onChange={(children) => patch({ children })} />
      <button type="submit" className="avail__submit">
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <span>{submitLabel}</span>
      </button>
      {firstError && (
        <p className="avail__error" role="alert">
          {firstError}
        </p>
      )}
    </form>
  );
}
