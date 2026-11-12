import { Link } from "react-router-dom";
import Media from "@/components/ui/Media.jsx";
import { formatKsh } from "@/utils/format.js";

/** Rooms page listing: photo-led card, wording on the picture. Specs live on the room detail page. */
export default function RoomListing({ room, flip = false }) {
  return (
    <article className={`room-listing${flip ? " room-listing--flip" : ""}`}>
      <Link className="room-listing__photo" to={`/rooms/${room.slug}`} aria-label={`View ${room.name}`}>
        <Media photo={room.hero} ratio="16 / 9" parallax zoom sizes="(min-width: 1025px) 92vw, 100vw" />
        <div className="room-listing__overlay">
          <h2 className="display room-listing__name">{room.name}</h2>
          <div className="room-listing__foot">
            <p className="room-listing__price">
              <span className="meta">From</span>
              <span className="price">{formatKsh(room.fromPrice)} <small>/ night</small></span>
            </p>
            <span className="link-arrow">View room &rarr;</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
