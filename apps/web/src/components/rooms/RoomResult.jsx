import { Link } from "react-router-dom";
import Button from "@/components/ui/Button.jsx";
import { formatKsh, pluralise } from "@/utils/format.js";

/** One room type in the availability results - text-first; the photo lives on the room detail page. */
export default function RoomResult({ result, nights, onSelect }) {
  const { room, plans, available, reason } = result;
  return (
    <article className={`result result--compact${available ? "" : " is-unavailable"}`}>
      <div className="result__main">
        <header className="result__head">

          <h2 className="h-lg">{room.name}</h2>
          <p className="body">{room.tagline}</p>
          <ul className="result__meta">
            <li>{room.occupancy.label}</li>
            <li>{room.size} m²</li>
            <li>{room.bed}</li>
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
                  <p className="small">
                    {formatKsh(pricing.subtotal)} for {pluralise(nights, "night")}, before taxes and fees
                  </p>
                </div>
                <Button
                  onClick={() => onSelect(room, plan, nightly)}
                  variant={plan.id === "flexible" ? "solid" : "outline"}
                  aria-label={`Book now: ${room.name}, ${plan.name}`}
                >
                  Book now
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="result__reason" role="status">
            Not available for this party: {reason}
          </p>
        )}
      </div>
    </article>
  );
}
