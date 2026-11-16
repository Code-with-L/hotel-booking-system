import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, Search } from "lucide-react";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { addDays, todayISO } from "@/utils/dates.js";
import { validateSearch } from "@/utils/validators.js";
import { formatKsh, pluralise } from "@/utils/format.js";
import { MAX_NIGHTS, MAX_ROOMS_PER_BOOKING, MAX_CHILDREN_PER_ROOM } from "@/data/site.js";
import { MAX_ROOM_CAPACITY } from "@/data/rooms.js";

export const searchToQuery = (s) =>
  new URLSearchParams({
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    adults: String(s.adults),
    children: String(s.children),
    rooms: String(s.rooms),
  }).toString();

function Stepper({ label, value, min, max, onChange, id, disabledMin = false }) {
  return (
    <div className="avail__field avail__field--stepper" role="group" aria-labelledby={id}>
      <span className="avail__label" id={id}>
        {label}
      </span>
      <div className="stepper">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={disabledMin || value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
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
 * field order is dates → rooms → adults → children; steppers cap to the selected rooms.
 * If the panel is given `fromPriceMinor`, a live nightly × nights totalEST estimate is shown.
 */
export default function AvailabilityBar({ variant = "bar", initial, onSearch, submitLabel = "Check availability", fromPriceMinor }) {
  const { search, setSearch } = useBooking();
  const navigate = useNavigate();
  const uid = useId();
  const [values, setValues] = useState(initial || search);
  const [errors, setErrors] = useState({});
  const today = todayISO();
  const maxCheckOut = values.checkIn ? addDays(values.checkIn, MAX_NIGHTS) : undefined;

  const patch = (p) => setValues((v) => {
    const next = { ...v, ...p };
    if ("rooms" in p) {
      const cap = next.rooms * MAX_ROOM_CAPACITY;
      const capChildren = next.rooms * MAX_CHILDREN_PER_ROOM;
      if (next.adults > cap) next.adults = cap;
      if (next.children > capChildren) next.children = capChildren;
    }
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

  const nights =
    values.checkIn && values.checkOut && values.checkOut > values.checkIn
      ? Math.round((new Date(values.checkOut) - new Date(values.checkIn)) / 86400000)
      : null;
  const totalMinor = fromPriceMinor && nights ? Math.round(fromPriceMinor * nights * values.rooms) : null;

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
  const maxAdults = values.rooms * MAX_ROOM_CAPACITY;
  const maxChildren = values.rooms * MAX_CHILDREN_PER_ROOM;
  // Once rooms hold adults, decreasing rooms is refused if it would leave some adults without a bed.
  const roomsCanDecrease = values.rooms > 1 && (values.rooms - 1) * MAX_ROOM_CAPACITY >= values.adults && (values.rooms - 1) * MAX_CHILDREN_PER_ROOM >= values.children;

  return (
    <form className={`avail avail--${variant}`} onSubmit={submit} noValidate aria-label="Check availability" data-hero-bar-form>
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
      <Stepper label="Rooms" value={values.rooms} min={1} max={MAX_ROOMS_PER_BOOKING} onChange={(rooms) => patch({ rooms })} id={`${uid}-rm-label`} disabledMin={!roomsCanDecrease} />
      <Stepper label="Adults" value={values.adults} min={1} max={maxAdults} onChange={(adults) => patch({ adults })} id={`${uid}-ad-label`} />
      <Stepper label="Children" value={values.children} min={0} max={maxChildren} onChange={(children) => patch({ children })} id={`${uid}-ch-label`} />
      {fromPriceMinor && nights != null && (
        <p className="avail__estimate" aria-live="polite">
          <span className="avail__estimate-note">
            {pluralise(nights, "night")} × {pluralise(values.rooms, "room")}{" "}
            <em className="small">(rate from {formatKsh(Math.round(fromPriceMinor / 100))}/night)</em>
          </span>
          <strong>{formatKsh(Math.round((totalMinor ?? 0) / 100))}</strong>
        </p>
      )}
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
