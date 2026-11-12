import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, Search } from "lucide-react";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { addDays, todayISO } from "@/utils/dates.js";
import { validateSearch } from "@/utils/validators.js";

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
 */
export default function AvailabilityBar({ variant = "bar", initial, onSearch, submitLabel = "Book these dates" }) {
  const { search, setSearch } = useBooking();
  const navigate = useNavigate();
  const uid = useId();
  const [values, setValues] = useState(initial || search);
  const [errors, setErrors] = useState({});
  const today = todayISO();

  const patch = (p) => setValues((v) => ({ ...v, ...p }));

  const onCheckIn = (e) => {
    const checkIn = e.target.value;
    const next = { checkIn };
    if (!values.checkOut || values.checkOut <= checkIn) next.checkOut = addDays(checkIn, 1);
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

  return (
    <form className={`avail avail--${variant}`} onSubmit={submit} noValidate aria-label="Check availability" data-hero-bar-form>
      <div className="avail__field">
        <label className="avail__label" htmlFor={`${uid}-in`}>Check-in</label>
        <input id={`${uid}-in`} type="date" min={today} value={values.checkIn} onChange={onCheckIn} aria-invalid={errors.checkIn ? "true" : undefined} />
      </div>
      <div className="avail__field">
        <label className="avail__label" htmlFor={`${uid}-out`}>Check-out</label>
        <input
          id={`${uid}-out`}
          type="date"
          min={values.checkIn ? addDays(values.checkIn, 1) : today}
          value={values.checkOut}
          onChange={(e) => patch({ checkOut: e.target.value })}
          aria-invalid={errors.checkOut ? "true" : undefined}
        />
      </div>
      <Stepper id={`${uid}-ad`} label="Adults" value={values.adults} min={1} max={8} onChange={(adults) => patch({ adults })} />
      <Stepper id={`${uid}-ch`} label="Children" value={values.children} min={0} max={4} onChange={(children) => patch({ children })} />
      <Stepper id={`${uid}-rm`} label="Rooms" value={values.rooms} min={1} max={4} onChange={(rooms) => patch({ rooms })} />
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
