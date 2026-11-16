import { Link } from "react-router-dom";
import Button from "@/components/ui/Button.jsx";
import { formatKsh, pluralise } from "@/utils/format.js";

/**
 * One room type in the availability results. Per-party verdict chip,
 * nightly rate, and the exact tax-inclusive total for the chosen nights/rooms.
 */
export default function RoomResult({ result, nights, rooms, suggestion, onSelect }) {
  const { room, plans, available, reason } = result;
  return (
    <article className={`result result--compact${available ? "" : " is-unavailable"}`}>
      <div className="result__main">
        <header className="result__head">
          <div className="result__titlerow">
            <h2 className="h-lg">{room.name}</h2>
            <span className={`avail-chip ${available ? "avail-chip--ok" : "avail-chip--no"}`}>
              {available ? "Available" : "Not available for this party"}
            </span>
          </div>
          <p className="body">{room.tagline}</p>
          <ul className="result__meta">
            <li>{room.occupancy.label}</li>
            <li>{room.size} m²</li>
            <li>{room.bedLabel}</li>
            <li>{room.view}</li>
          </ul>
          <Link className="link-arrow" to={`/rooms/${room.slug}`}>
            <span>See room</span>
          </Link>
        </header>

        {available ? (
          <div className="plans">
            {plans.map(({ plan, nightly, pricing }) => (
              <div className="plan" key={plan.id}>
                <div className="plan__info">
                  <h3 className="plan__name">{plan.name}</h3>
                  <p className="small">{plan.summary}</p>
                  <p className="small plan__terms">{plan.cancellation}</p>
                  {plan.prepayment && <p className="small plan__nonrefundable">{plan.prepayment}</p>}
                </div>
                <div className="plan__price">
                  <p className="price plan__nightly">
                    {formatKsh(nightly)} <span>per night</span>
                  </p>
                  <p className="plan__total">
                    <strong>{formatKsh(pricing.total)}</strong> total
                    <span className="small block">{pluralise(nights, "night")} × {pluralise(rooms, "room")}</span>
                  </p>
                  <p className="small plan__breakdown">
                    Room {formatKsh(pricing.subtotal)} · Service charge 10% {formatKsh(pricing.serviceCharge)} · Tourism levy 2% {formatKsh(pricing.tourismLevy)} · VAT 16% {formatKsh(pricing.vat)}
                  </p>
                </div>
                <Button
                  onClick={() => onSelect(room, plan, nightly)}
                  variant={plan.id === "flexible" ? "solid" : "outline"}
                  aria-label={`Book this room: ${room.name}, ${plan.name}`}
                >
                  Book this room
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="result__unavailable">
            <p className="result__reason" role="status">
              <strong>Not available for this party.</strong>{" "}{reason}
            </p>
            {suggestion && (
              <p className="result__suggestion">
                {suggestion}
              </p>
            )}
            <Button variant="solid" disabled aria-disabled="true" className="result__cta">
              Book this room
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
