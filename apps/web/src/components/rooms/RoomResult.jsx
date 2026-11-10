import { Link } from "react-router-dom";
import Button from "@/components/ui/Button.jsx";
import Media from "@/components/ui/Media.jsx";
import { formatKsh, pluralise } from "@/utils/format.js";

/** One room type in the availability results, with its rate plans. */
export default function RoomResult({ result, nights, onSelect }) {
  const { room, plans, available, reason } = result;
  return (
    <article className={`result${available ? "" : " is-unavailable"}`}>
      <div className="result__image">
        <Media photo={room.hero} ratio="4 / 3" reveal={false} zoom sizes="(min-width: 1025px) 34vw, 100vw" />
      </div>
      <div className="result__main">
        <header className="result__head">
          <p className="eyebrow eyebrow--terra">
            {room.number} — {room.name.toUpperCase()}
          </p>
          <h2 className="h-lg">{room.name}</h2>
          <p className="body">{room.summary}</p>
          <ul className="result__meta">
            <li>{room.occupancy.label}</li>
            <li>{room.size} m²</li>
            <li>{room.bed}</li>
          </ul>
          <ul className="result__features">
            {room.features.slice(0, 3).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Link className="link-arrow" to={`/rooms/${room.slug}`}>
            <span>Room details</span>
          </Link>
        </header>

        {available ? (
          <div className="plans">
            {plans.map(({ plan, nightly, pricing }) => (
              <div className="plan" key={plan.id}>
                <div className="plan__info">
                  <h3 className="plan__name">{plan.name}</h3>
                  <p className="small">{plan.summary}</p>
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
                  aria-label={`Select ${room.name}, ${plan.name}`}
                >
                  Select room
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
