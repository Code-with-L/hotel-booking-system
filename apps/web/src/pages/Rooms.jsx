import PageHero from "@/components/editorial/PageHero.jsx";
import AvailabilityBar from "@/components/booking/AvailabilityBar.jsx";
import RoomListing from "@/components/rooms/RoomListing.jsx";
import AmenityIcon from "@/components/rooms/AmenityIcon.jsx";
import DemoNotice from "@/components/ui/DemoNotice.jsx";
import ClosingCta from "@/components/editorial/ClosingCta.jsx";
import { AMENITIES, ROOMS } from "@/data/rooms.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function Rooms() {
  useDocumentTitle("Stay");
  return (
    <>
      <PageHero title={<>Find your own kind of <em>stillness.</em></>}>
        <p className="lede">Twenty-eight rooms. Three distinct expressions of retreat.</p>
      </PageHero>

      <section className="bar-strip" aria-label="Search availability">
        <div className="container">
          <AvailabilityBar variant="bar" />
        </div>
      </section>

      <section className="section section--flush-top">
        <div className="container room-listings">
          {ROOMS.map((room, i) => (
            <RoomListing key={room.slug} room={room} flip={i % 2 === 1} />
          ))}
        </div>
      </section>

      <section className="section bg-parchment" aria-labelledby="inc-title">
        <div className="container">
          <div className="section-head" data-reveal="text">
            <p className="eyebrow eyebrow--olive">In every room</p>
            <h2 id="inc-title" className="h-lg">Considered, not crowded.</h2>
          </div>
          <ul className="amenity-grid" data-reveal-group>
            {AMENITIES.map((a) => (
              <li key={a.id}>
                <AmenityIcon name={a.icon} />
                <span>{a.label}</span>
              </li>
            ))}
          </ul>
          <DemoNotice label="Sample specification">
            These amenities, sizes and prices describe a concept property and are sample content. They are not confirmed hotel facilities or offers.
          </DemoNotice>
        </div>
      </section>

      <ClosingCta title="Choose your dates. Keep the rest open." cta="Check availability" />
    </>
  );
}
