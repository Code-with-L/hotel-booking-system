import { Link } from "react-router-dom";
import Media from "@/components/ui/Media.jsx";
import { ROOMS } from "@/data/rooms.js";
import { formatKsh } from "@/utils/format.js";

export default function RelatedRooms({ currentSlug }) {
  const others = ROOMS.filter((r) => r.slug !== currentSlug);
  return (
    <section className="section bg-parchment" aria-labelledby="related-title">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">Also at The Stillhouse</p>
          <h2 id="related-title" className="h-lg">Other expressions of retreat</h2>
        </div>
        <div className="related">
          {others.map((room, i) => (
            <Link key={room.slug} to={`/rooms/${room.slug}`} className={`related__item related__item--${i}`}>
              <Media photo={room.hero} ratio={i === 0 ? "4 / 3" : "4 / 5"} zoom sizes="(min-width: 1025px) 45vw, 100vw" />
              <div className="related__text">

                <h3 className="h-md">{room.name}</h3>
                <p className="small">
                  {room.size} m² · {room.occupancy.label} · from <span className="price">{formatKsh(room.fromPrice)}</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
