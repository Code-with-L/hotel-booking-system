import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";
import { IMAGES } from "@/data/images.js";
import { ROOMS } from "@/data/rooms.js";
import { SITE } from "@/data/site.js";
import { EXPERIENCES } from "@/data/experiences.js";
import Button, { ArrowLink } from "@/components/ui/Button.jsx";
import AvailabilitySection from "@/features/availability/AvailabilitySection.jsx";
import Media from "@/components/ui/Media.jsx";
import { photoSrcSet, photoUrl } from "@/data/images.js";
import { formatKsh } from "@/utils/format.js";

export default function Home() {
  const heroRef = useRef(null);
  useDocumentTitle("");

  useEffect(() => {
    let ctx;
    let canceled = false;
    (async () => {
      const [{ heroIntro }, { gsap }] = await Promise.all([
        import("@/animations/hero.js"),
        import("@/animations/gsap.js"),
      ]);
      if (canceled) return;
      ctx = gsap.context(() => heroIntro(heroRef.current), heroRef);
    })();
    return () => { canceled = true; ctx?.revert(); };
  }, []);

  return (
    <>
      {/* HERO — booking-first, full-screen */}
      <section className="hero" ref={heroRef} aria-label="Welcome to The Stillhouse">
        <div className="hero__stage">
          <figure className="hero__image" data-hero-image>
            <img
              src={photoUrl(IMAGES.hero, 1920)}
              srcSet={photoSrcSet(IMAGES.hero)}
              sizes="100vw"
              alt={IMAGES.hero.alt}
              fetchPriority="high"
            />
            <span className="hero__scrim" aria-hidden="true" />
          </figure>

          <div className="container hero__content">
            <p className="hero__label eyebrow" data-hero-label>
              {SITE.location} · {SITE.coordinates}
            </p>
            <div className="hero__copy">
              <h1 className="display hero__title">
                <span className="line"><span data-hero-line>Somewhere between</span></span>
                <span className="line"><span data-hero-line>stillness and <em>discovery.</em></span></span>
              </h1>
              <p className="lede hero__text" data-hero-text>
                Twenty-eight rooms above the Great Rift Valley. Farm-to-table dining, private escarpment excursions and a bath you will not want to leave.
              </p>
              <div className="hero__ctas">
                <Button href="#book" variant="light" arrow data-hero-cta>Book your room</Button>
                <Button href="#rooms" variant="ghost-light" data-hero-cta>See the rooms</Button>
              </div>
            </div>

            <a href="#rooms" className="hero__scroll" data-hero-scroll aria-label="Scroll to the rooms">
              <span className="meta">Rooms · Dining · Experiences</span>
              <span className="hero__scroll-line" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {/* BOOKING FLOW — search, rooms and selection live on the homepage */}
      <section className="section booking-page section--flush-top" id="book" aria-labelledby="book-title">
        <div className="container">
          <AvailabilitySection Heading="h2" />
        </div>
      </section>

      {/* ROOMS — big editorial cards */}
      <section className="section" id="rooms" aria-labelledby="rooms-title">
        <div className="container">
          <div className="section-head section-head--row">
            <div>
              <p className="eyebrow eyebrow--olive">The rooms</p>
              <h2 id="rooms-title" className="h-lg">Twenty-eight rooms.<br />Three expressions.</h2>
            </div>
            <ArrowLink to="/rooms">View all rooms &amp; rates</ArrowLink>
          </div>
          <ul className="home-room-cards">
            {ROOMS.map((room) => (
              <li key={room.slug} className="home-room-card">
                <Link to={`/rooms/${room.slug}`} className="home-room-card__link" aria-label={`${room.name} — from KSh ${(room.fromPrice / 100).toLocaleString("en-KE")} per night`}>
                  <Media photo={room.hero} ratio="4 / 3" zoom sizes="(min-width: 1025px) 33vw, 100vw" />
                  <div className="home-room-card__body">
                    <h3 className="home-room-card__name">{room.name}</h3>
                    <p className="home-room-card__tagline">{room.tagline}</p>
                    <div className="home-room-card__foot">
                      <span className="meta">From</span>
                      <span className="price">{formatKsh(room.fromPrice)}<small> / night</small></span>
                      <span className="home-room-card__cta">Check dates →</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* DINING — full spread */}
      <section className="section bg-parchment" aria-labelledby="home-dining-title">
        <div className="container dining-home__grid">
          <div className="dining-home__media" data-reveal="image">
            <Media photo={IMAGES.homeDining} ratio="5 / 4" sizes="(min-width: 1025px) 46vw, 100vw" />
            <Media photo={IMAGES.homeDiningDetail} ratio="4 / 5" sizes="(min-width: 1025px) 22vw, 45vw" className="dining-home__inset" />
          </div>
          <div className="dining-home__text" data-reveal-group>
            <p className="eyebrow eyebrow--olive">The Table at Stillhouse</p>
            <h2 id="home-dining-title" className="h-lg">Breakfast that waits for you. Dinner that shouldn't.</h2>
            <p className="body">
              A fire-fed kitchen shaped by the farm up the lane — eggs from the morning, herbs from the garden, wine from a short list we actually believe in. Private evenings on the terrace by enquiry.
            </p>
            <p className="meta">Breakfast 07:00–10:30 · Lunch 12:30–15:00 · Dinner 19:00–23:00</p>
            <ArrowLink to="/dining">View the menu &amp; reservation</ArrowLink>
          </div>
        </div>
      </section>

      {/* EXPERIENCES — four, numbered, in sequence */}
      <section className="section" aria-labelledby="home-exp-title">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--olive">Beyond the room</p>
            <h2 id="home-exp-title" className="h-lg">Days the valley gives back.</h2>
          </div>
          <ol className="home-exp-list">
            {EXPERIENCES.slice(0, 4).map((item, i) => (
              <li key={item.id} className="home-exp-item">
                <Link to={`/experiences#${item.id}`}>
                  <span className="home-exp-item__num">0{i + 1}</span>
                  <Media photo={item.image} ratio="4 / 3" zoom sizes="(min-width: 1025px) 28vw, (min-width: 640px) 44vw, 100vw" />
                  <div className="home-exp-item__text">
                    <p className="eyebrow eyebrow--terra">{item.category}</p>
                    <h3 className="h-sm">{item.title}</h3>
                    <p className="small">{item.duration} · {item.price}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: "clamp(32px, 4vw, 56px)" }}>
            <ArrowLink to="/experiences">Explore all experiences</ArrowLink>
          </div>
        </div>
      </section>

      {/* SPEC STRIP — 28 / Rift Valley / farm-to-table / private */}
      <section className="section spec-strip" aria-label="The property at a glance">
        <div className="container">
          <dl className="spec-strip__grid">
            <div><dt className="numeral">28</dt><dd>Rooms &amp; retreats</dd></div>
            <div><dt className="numeral">1872<span className="spec-strip__unit">m</span></dt><dd>Above the Rift plain</dd></div>
            <div><dt className="numeral">1</dt><dd>Farm, one valley, no rush</dd></div>
            <div><dt className="numeral">∞</dt><dd>Slow mornings</dd></div>
          </dl>
        </div>
      </section>

      {/* FINAL CTA — booking band */}
      <section className="section booking-band" aria-labelledby="home-cta-title">
        <div className="container booking-band__inner">
          <div>
            <p className="eyebrow eyebrow--olive">Ready when you are</p>
            <h2 id="home-cta-title" className="h-xl">Your stay begins with one click.</h2>
            <p className="body">Pick your dates and hold your room. Free to cancel up to seven days before arrival on the Flexible rate.</p>
          </div>
          <Button to="/availability" variant="solid" arrow size="lg">Book your room</Button>
        </div>
      </section>
    </>
  );
}
