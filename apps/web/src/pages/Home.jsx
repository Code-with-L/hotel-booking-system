import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { gsap } from "@/animations/gsap.js";
import { heroIntro } from "@/animations/hero.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";
import { IMAGES } from "@/data/images.js";
import { ROOMS } from "@/data/rooms.js";
import { SITE } from "@/data/site.js";
import AvailabilityBar from "@/components/booking/AvailabilityBar.jsx";
import Button, { ArrowLink } from "@/components/ui/Button.jsx";
import Media from "@/components/ui/Media.jsx";
import { photoSrcSet, photoUrl } from "@/data/images.js";
import { formatKsh } from "@/utils/format.js";

export default function Home() {
  const heroRef = useRef(null);
  useDocumentTitle("");

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      heroIntro(heroRef.current);
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <>
      {/* HERO — booking-first: the stay is the search. */}
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
            <p className="eyebrow hero__label" data-hero-label>
              {SITE.location} - {SITE.coordinates}
            </p>

            <div className="hero__copy">
              <h1 className="display hero__title">
                <span className="line"><span data-hero-line>Somewhere between</span></span>
                <span className="line"><span data-hero-line>stillness and <em>discovery.</em></span></span>
              </h1>
              <p className="lede hero__text" data-hero-text>
                A 32-room retreat above the Rift Valley. Pick your dates, see the room and the price, and hold it.
              </p>
              <div className="hero__ctas">
                <Button to="/availability" variant="light" arrow data-hero-cta>
                  Reserve your stay
                </Button>
                <Button href="#rooms" variant="ghost-light" data-hero-cta>
                  See the rooms
                </Button>
              </div>
            </div>

            <a href="#rooms" className="hero__scroll" data-hero-scroll aria-label="Scroll to rooms">
              <span className="meta">Rooms</span>
              <span className="hero__scroll-line" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="hero__bar" data-hero-bar>
          <div className="container">
            <AvailabilityBar variant="bar" />
          </div>
        </div>
      </section>

      {/* ROOMS — compact cards: small photo, name, rate, explore. */}
      <section className="section" id="rooms" aria-labelledby="rooms-title">
        <div className="container">
          <div className="section-head section-head--row">
            <div>

              <h2 id="rooms-title" className="h-lg">Four expressions,<br />thirty-two rooms.</h2>
            </div>
            <ArrowLink to="/rooms">All rooms &amp; rates</ArrowLink>
          </div>

          <ul className="room-cards" >
            {ROOMS.map((room) => (
              <li key={room.slug} className="room-card">
                <Link to={`/rooms/${room.slug}`} className="room-card__link">
                  <div className="room-card__image">
                    <Media photo={room.hero} ratio="4 / 3" zoom sizes="(min-width: 1025px) 33vw, (min-width: 640px) 50vw, 100vw" />
                  </div>
                  <div className="room-card__body">

                    <p className="lede room-card__tagline">{room.tagline}</p>
                    <div className="room-card__foot">
                      <span className="meta">From</span>
                      <span className="room-card__price">{formatKsh(room.fromPrice)}<small>/night</small></span>
                      <span className="room-card__cta">View &amp; book →</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className="small rooms-stack__note">Rates shown per room, per night; taxes and levies itemised at review. Final price computed from your dates.</p>
        </div>
      </section>

    </>
  );
}
