import { photoUrl } from "@/data/images.js";
import { getRoom } from "@/data/rooms.js";
import { CHARGES } from "@/utils/pricing.js";
import { formatKsh, pluralise } from "@/utils/format.js";
import { formatDate } from "@/utils/dates.js";

/** Booking summary used by guest details, review and confirmation. */
export default function BookingSummary({ search, selection, pricing, showPricing = true, title = "Your stay" }) {
  const room = getRoom(selection.roomSlug);
  return (
    <aside className="summary" aria-label="Booking summary">
      {room && (
        <div className="summary__image">
          <img src={photoUrl(room.hero, 800)} alt={room.hero.alt} loading="lazy" />
        </div>
      )}
      <div className="summary__body">
        <p className="eyebrow">{title}</p>
        <h2 className="h-sm">{selection.roomName}</h2>
        <p className="small">{selection.ratePlanName}</p>

        <dl className="kv">
          <div><dt>Check-in</dt><dd>{formatDate(search.checkIn)}</dd></div>
          <div><dt>Check-out</dt><dd>{formatDate(search.checkOut)}</dd></div>
          <div><dt>Nights</dt><dd>{selection.nights}</dd></div>
          <div>
            <dt>Guests</dt>
            <dd>
              {pluralise(search.adults, "adult")}
              {search.children > 0 && `, ${pluralise(search.children, "child", "children")}`}
            </dd>
          </div>
          <div><dt>Rooms</dt><dd>{search.rooms}</dd></div>
        </dl>

        {showPricing && pricing && (
          <dl className="kv kv--prices">
            <div><dt>{formatKsh(pricing.nightly)} × {selection.nights} {selection.nights === 1 ? "night" : "nights"}{pricing.rooms > 1 ? ` × ${pricing.rooms} rooms` : ""}</dt><dd>{formatKsh(pricing.subtotal)}</dd></div>
            <div><dt>{CHARGES.serviceCharge.label}</dt><dd>{formatKsh(pricing.serviceCharge)}</dd></div>
            <div><dt>{CHARGES.tourismLevy.label}</dt><dd>{formatKsh(pricing.tourismLevy)}</dd></div>
            <div><dt>{CHARGES.vat.label}</dt><dd>{formatKsh(pricing.vat)}</dd></div>
            <div className="kv__total"><dt>Total</dt><dd>{formatKsh(pricing.total)}</dd></div>
          </dl>
        )}
        <p className="demo-line">Rates and availability are computed live by the hotel's reservation system.</p>
      </div>
    </aside>
  );
}
