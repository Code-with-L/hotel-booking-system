import Media from "@/components/ui/Media.jsx";
import { ArrowLink } from "@/components/ui/Button.jsx";
import { formatKsh } from "@/utils/format.js";

/**
 * Homepage editorial room composition. Three deliberate variants:
 *  a — wide image left, text right
 *  b — tall image right, text left (offset)
 *  c — wide image right, text left, image bleeds to the viewport edge
 */
export default function RoomFeature({ room, variant = "a" }) {
  const ratio = variant === "b" ? "4 / 5" : "3 / 2";
  return (
    <article className={`room-feature room-feature--${variant}`}>
      <div className="room-feature__media">
        <Media photo={room.hero} ratio={ratio} parallax sizes="(min-width: 1025px) 58vw, 100vw" zoom />
      </div>
      <div className="room-feature__text" data-reveal-group>
        <p className="eyebrow eyebrow--terra">{room.name.toUpperCase()}</p>
        <h3 className="h-lg">{room.tagline}</h3>
        <p className="body">{room.summary}</p>
        <dl className="specs">
          <div><dt>Occupancy</dt><dd>{room.occupancy.label}</dd></div>
          <div><dt>Size</dt><dd>{room.size} m²</dd></div>
          <div><dt>From</dt><dd className="price">{formatKsh(room.fromPrice)} <span>/ night</span></dd></div>
        </dl>
        <ArrowLink to={`/rooms/${room.slug}`}>Explore room</ArrowLink>
      </div>
    </article>
  );
}
