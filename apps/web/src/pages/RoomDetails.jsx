import { useNavigate, useParams } from "react-router-dom";
import { getAmenity, getRoom, RATE_PLANS } from "@/data/rooms.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";
import AvailabilityBar, { searchToQuery } from "@/components/booking/AvailabilityBar.jsx";
import RoomGallery from "@/components/rooms/RoomGallery.jsx";
import RelatedRooms from "@/components/rooms/RelatedRooms.jsx";
import AmenityIcon from "@/components/rooms/AmenityIcon.jsx";
import ClosingCta from "@/components/editorial/ClosingCta.jsx";
import DemoNotice from "@/components/ui/DemoNotice.jsx";
import Media from "@/components/ui/Media.jsx";
import Button from "@/components/ui/Button.jsx";
import NotFound from "./NotFound.jsx";
import { formatKsh } from "@/utils/format.js";

export default function RoomDetails() {
  const { slug } = useParams();
  const room = getRoom(slug);
  const navigate = useNavigate();
  useDocumentTitle(room?.name);

  if (!room) return <NotFound />;

  return (
    <>
      <header className="room-hero on-dark">
        <Media photo={room.hero} parallax={7} priority className="room-hero__bg" sizes="100vw" />
        <div className="room-hero__scrim" aria-hidden="true" />
        <div className="container room-hero__content">
          <div>
            <p className="eyebrow">{room.number} — Accommodation</p>
            <h1 className="display">{room.name}</h1>
          </div>
          <dl className="room-hero__meta">
            <div><dt className="meta">Size</dt><dd>{room.size} m²</dd></div>
            <div><dt className="meta">Occupancy</dt><dd>{room.occupancy.label}</dd></div>
            <div><dt className="meta">Bed</dt><dd>{room.bed}</dd></div>
          </dl>
        </div>
      </header>

      <section className="section room-overview" aria-label="Overview">
        <div className="container room-overview__grid">
          <div className="room-overview__text" data-reveal-group>
            <p className="eyebrow eyebrow--olive">{room.view}</p>
            <h2 className="h-xl">{room.tagline}</h2>
            <div className="prose">
              {room.description.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <dl className="ledger ledger--wide">
              <div><dt>Dimensions</dt><dd>Approx. {room.size} m²</dd></div>
              <div><dt>Guest capacity</dt><dd>{room.occupancy.label}</dd></div>
              <div><dt>Bed configuration</dt><dd>{room.bed}</dd></div>
              <div><dt>Outlook</dt><dd>{room.view}</dd></div>
            </dl>
          </div>

          <aside className="booking-panel" aria-labelledby="panel-title">
            <p className="eyebrow">From, per night</p>
            <p className="booking-panel__price" id="panel-title">
              <span className="numeral">{formatKsh(room.fromPrice)}</span>
            </p>
            <p className="small">From rate per room, before taxes and fees. Final price is computed at review.</p>
            <AvailabilityBar
              variant="panel"
              submitLabel="Check these dates"
              onSearch={(s) => navigate(`/availability?${searchToQuery(s)}&room=${room.slug}`)}
            />
          </aside>
        </div>
      </section>

      <section className="section section--flush-top" aria-labelledby="gallery-title">
        <div className="container">
          <div className="section-head section-head--row" data-reveal="text">
            <div>
              <p className="eyebrow eyebrow--olive">Gallery</p>
              <h2 id="gallery-title" className="h-lg">Inside {room.name}</h2>
            </div>
          </div>
          <RoomGallery photos={room.gallery} name={room.name} />
        </div>
      </section>

      <section className="section bg-parchment" aria-labelledby="amen-title">
        <div className="container amen">
          <div data-reveal="text">
            <p className="eyebrow eyebrow--olive">Amenities</p>
            <h2 id="amen-title" className="h-lg">Everything necessary.<br />Nothing superfluous.</h2>
          </div>
          <div>
            <ul className="amenity-grid amenity-grid--compact" data-reveal-group>
              {room.amenities.map((id) => {
                const a = getAmenity(id);
                return (
                  <li key={id}>
                    <AmenityIcon name={a.icon} />
                    <span>{a.label}</span>
                  </li>
                );
              })}
            </ul>
            <h3 className="eyebrow amen__sub">Room features</h3>
            <ul className="feature-list">
              {room.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <DemoNotice label="Sample content">
              Amenities and features are illustrative for a concept property and are not confirmed facilities.
            </DemoNotice>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="pricing-title">
        <div className="container pricing">
          <div data-reveal="text">
            <p className="eyebrow eyebrow--olive">Rates</p>
            <h2 id="pricing-title" className="h-lg">Pricing information</h2>
            <p className="body">Two rate plans. Taxes and fees (service charge, tourism levy and VAT) are itemised at review.</p>
          </div>
          <div className="table-wrap" data-reveal="text">
            <table className="table">
              <caption className="sr-only">Rate plans for {room.name}</caption>
              <thead>
                <tr><th scope="col">Rate plan</th><th scope="col">Per night</th><th scope="col">Conditions</th></tr>
              </thead>
              <tbody>
                {RATE_PLANS.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    <td className="price">{p.id === "flexible" ? `from ${formatKsh(room.fromPrice)}` : "12% below Flexible"}</td>
                    <td>{p.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button to="/availability" variant="solid" arrow>Reserve this room</Button>
          </div>
        </div>
      </section>

      <RelatedRooms currentSlug={room.slug} />
      <ClosingCta title={`Stay in ${room.name}.`} cta="Plan your stay" />
    </>
  );
}
