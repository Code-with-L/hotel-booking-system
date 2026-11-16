import { useId } from "react";
import { Minus, Plus } from "lucide-react";
import { addDays, todayISO } from "@/utils/dates.js";
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
 * Booking form (dates → rooms → adults → children). Fully controlled: the parent owns
 * the value and decides what to do with it (auto-check on change, etc.).
 * variant: "bar" (horizontal desktop / stacked mobile) | "panel" (vertical).
 * field order is dates → rooms → adults → children; steppers cap to the selected rooms.
 */
export default function AvailabilityBar({ variant = "bar", values, onChange }) {
  const uid = useId();
  const today = todayISO();
  const maxCheckOut = values.checkIn ? addDays(values.checkIn, MAX_NIGHTS) : undefined;

  const patch = (p) => {
    const next = { ...values, ...p };
    if ("rooms" in p) {
      const cap = next.rooms * MAX_ROOM_CAPACITY;
      const capChildren = next.rooms * MAX_CHILDREN_PER_ROOM;
      if (next.adults > cap) next.adults = cap;
      if (next.children > capChildren) next.children = capChildren;
    }
    if (next.checkOut && (next.checkOut <= next.checkIn || (next.checkIn && Math.round((new Date(next.checkOut) - new Date(next.checkIn)) / 86400000) > MAX_NIGHTS))) {
      next.checkOut = addDays(next.checkIn, MAX_NIGHTS);
    }
    onChange(next);
  };

  const onCheckIn = (e) => {
    const checkIn = e.target.value;
    const next = { checkIn };
    if (!values.checkOut || values.checkOut <= checkIn) next.checkOut = addDays(checkIn, 1);
    else if (Math.round((new Date(values.checkOut) - new Date(checkIn)) / 86400000) > MAX_NIGHTS) next.checkOut = addDays(checkIn, MAX_NIGHTS);
    patch(next);
  };

  const maxAdults = values.rooms * MAX_ROOM_CAPACITY;
  const maxChildren = values.rooms * MAX_CHILDREN_PER_ROOM;
  // Once rooms hold adults, decreasing rooms is refused if it would leave some adults without a bed.
  const roomsCanDecrease = values.rooms > 1 && (values.rooms - 1) * MAX_ROOM_CAPACITY >= values.adults && (values.rooms - 1) * MAX_CHILDREN_PER_ROOM >= values.children;

  return (
    <div className={`avail avail--${variant}`} aria-label="Booking search" data-hero-bar-form>
      <div className="avail__field">
        <label className="avail__label" htmlFor={`${uid}-in`}>Check-in</label>
        <input id={`${uid}-in`} type="date" min={today} value={values.checkIn} onChange={onCheckIn} />
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
        />
      </div>
      <Stepper label="Rooms" value={values.rooms} min={1} max={MAX_ROOMS_PER_BOOKING} onChange={(rooms) => patch({ rooms })} id={`${uid}-rm-label`} disabledMin={!roomsCanDecrease} />
      <Stepper label="Adults" value={values.adults} min={1} max={maxAdults} onChange={(adults) => patch({ adults })} id={`${uid}-ad-label`} />
      <Stepper label="Children" value={values.children} min={0} max={maxChildren} onChange={(children) => patch({ children })} id={`${uid}-ch-label`} />
    </div>
  );
}
