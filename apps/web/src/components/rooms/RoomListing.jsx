import Media from "@/components/ui/Media.jsx";
import Button from "@/components/ui/Button.jsx";
import { formatKsh } from "@/utils/format.js";

/** Rooms page listing: a wide photograph with a ledger-style specification column. */
export default function RoomListing({ room, flip = false }) {
  return (
    <article className={`room-listing${flip ? " room-listing--flip" : ""}`}>
      <div className="room-listing__image">
        <Media photo={room.hero} ratio="16 / 10" parallax zoom sizes="(min-width: 1025px) 66vw, 100vw" />
      </div>
      <div className="room-listing__body">
        <div data-reveal="text">
          <p className="eyebrow eyebrow--terra">{room.name.toUpperCase()}</p>
          <h2 className="h-xl">{room.name}</h2>
          <p className="lede">{room.summary}</p>
        </div>
        <div className="room-listing__ledger" data-reveal="text">
          <dl className="ledger">
            <div><dt>Size</dt><dd>{room.size} m²</dd></div>
            <div><dt>Occupancy</dt><dd>{room.occupancy.label}</dd></div>
            <div><dt>Bed</dt><dd>{room.bed}</dd></div>
            <div><dt>Outlook</dt><dd>{room.view}</dd></div>
            <div className="ledger__price"><dt>From, per night</dt><dd className="price">{formatKsh(room.fromPrice)}</dd></div>
          </dl>
          <Button to={`/rooms/${room.slug}`} variant="outline" arrow>View room</Button>
        </div>
      </div>
    </article>
  );
}
