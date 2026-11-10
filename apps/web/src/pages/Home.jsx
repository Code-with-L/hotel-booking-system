import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { gsap } from "@/animations/gsap.js";
import { heroIntro } from "@/animations/hero.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";
import { IMAGES } from "@/data/images.js";
import { ROOMS } from "@/data/rooms.js";
import { HOME_EXPERIENCES } from "@/data/experiences.js";
import { SITE } from "@/data/site.js";
import AvailabilityBar from "@/components/booking/AvailabilityBar.jsx";
import Button, { ArrowLink } from "@/components/ui/Button.jsx";
import Media from "@/components/ui/Media.jsx";
import RoomFeature from "@/components/rooms/RoomFeature.jsx";
import ClosingCta from "@/components/editorial/ClosingCta.jsx";
import { photoSrcSet, photoUrl } from "@/data/images.js";

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
      {/* HERO */}
      <section className="hero" ref={heroRef} aria-label="Welcome to The Stillhouse">
        <div className="hero__stage">
          <figure className="hero__image" data-hero-image>
            <img
              src={photoUrl(IMAGES.hero, 1800)}
              srcSet={photoSrcSet(IMAGES.hero, [900, 1400, 2000, 2600])}
              sizes="100vw"
              alt={IMAGES.hero.alt}
              fetchPriority="high"
            />
            <span className="hero__scrim" aria-hidden="true" />
          </figure>

          <div className="container hero__content">
            <p className="eyebrow hero__label" data-hero-label>
              {SITE.location} — {SITE.coordinates}
            </p>

            <div className="hero__copy">
              <h1 className="display hero__title">
                <span className="line"><span data-hero-line>Somewhere between</span></span>
                <span className="line"><span data-hero-line>stillness and <em>discovery.</em></span></span>
              </h1>
              <p className="lede hero__text" data-hero-text>
                An intimate retreat above the Rift Valley, shaped by nature, architecture and the art of slowing down.
              </p>
              <div className="hero__ctas">
                <Button href="#intro" variant="ghost-light" arrow data-hero-cta>
                  Discover the Stillhouse
                </Button>
                <Button to="/availability" variant="light" data-hero-cta>
                  Reserve your stay
                </Button>
              </div>
            </div>

            <a href="#intro" className="hero__scroll" data-hero-scroll aria-label="Scroll to introduction">
              <span className="meta">Scroll</span>
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

      {/* INTRODUCTION */}
      <section className="section intro" id="intro" aria-labelledby="intro-title">
        <div className="container intro__grid">
          <div className="intro__media">
            <Media photo={IMAGES.intro} ratio="4 / 5" parallax sizes="(min-width: 1025px) 46vw, 100vw" />
            <p className="meta intro__caption">The terrace, late afternoon</p>
          </div>
          <div className="intro__text" data-reveal-group>
            <p className="eyebrow eyebrow--olive">THE STILLHOUSE / NAIVASHA</p>
            <h2 id="intro-title" className="h-xl">
              A different relationship with <em>time.</em>
            </h2>
            <p className="lede">
              The Stillhouse is a retreat of twenty-eight rooms set along the edge of the Great Rift Valley — built low, built quietly, and built to leave the landscape in charge.
            </p>
            <p className="body">
              There is no programme to follow here. Mornings begin with light across the escarpment; days are shaped by walking, swimming, long lunches and doing very little. The architecture holds the view; the service holds everything else.
            </p>
            <dl className="facts">
              <div><dt className="numeral">28</dt><dd className="meta">Rooms</dd></div>
              <div><dt className="numeral">3</dt><dd className="meta">Expressions of retreat</dd></div>
              <div><dt className="numeral">1</dt><dd className="meta">Valley</dd></div>
            </dl>
            <ArrowLink to="/story">Our story</ArrowLink>
          </div>
        </div>
      </section>

      {/* ACCOMMODATION */}
      <section className="section section--flush-top" aria-labelledby="rooms-title">
        <div className="container">
          <div className="section-head section-head--row">
            <div data-reveal="text">
              <p className="eyebrow eyebrow--olive">Accommodation</p>
              <h2 id="rooms-title" className="h-lg">Twenty-eight rooms,<br />three expressions.</h2>
            </div>
            <ArrowLink to="/rooms">View all rooms</ArrowLink>
          </div>
          <div className="rooms-stack">
            {ROOMS.map((room, i) => (
              <RoomFeature key={room.slug} room={room} variant={["a", "b", "c"][i]} />
            ))}
          </div>
          <p className="small rooms-stack__note">From rates shown per room, per night; taxes and fees added at review.</p>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section className="arch on-dark" aria-labelledby="arch-title">
        <Media photo={IMAGES.architecture} parallax={8} className="arch__bg" sizes="100vw" />
        <div className="arch__scrim" aria-hidden="true" />
        <div className="container arch__content">
          <div className="arch__title" data-reveal="text">
            <p className="eyebrow">Architecture and setting</p>
            <h2 id="arch-title" className="display">Built to belong.</h2>
          </div>
          <div className="arch__side" data-reveal="text">
            <p className="lede">
              Stone from the region, timber that weathers well, lime and linen. Each volume sits low beneath the canopy, so the landscape — not the building — is the first thing you see.
            </p>
            <ArrowLink to="/story#architecture" className="link-arrow--light">The architecture</ArrowLink>
          </div>
        </div>
      </section>

      {/* EXPERIENCES */}
      <section className="section bg-parchment" aria-labelledby="exp-title">
        <div className="container">
          <div className="section-head section-head--row">
            <div data-reveal="text">
              <p className="eyebrow eyebrow--olive">Experiences</p>
              <h2 id="exp-title" className="h-lg">Beyond the room.</h2>
            </div>
            <ArrowLink to="/experiences">All experiences</ArrowLink>
          </div>
          <div className="exp-home">
            {HOME_EXPERIENCES.map((item, i) => (
              <Link key={item.id} to={`/experiences#${item.id}`} className={`exp-home__item exp-home__item--${i}`}>
                <Media photo={item.image} ratio={["4 / 3", "4 / 5", "4 / 5", "4 / 3"][i]} zoom sizes="(min-width: 1025px) 50vw, 100vw" />
                <div className="exp-home__text">
                  <p className="eyebrow eyebrow--terra">{item.category} · {item.duration}</p>
                  <h3 className="h-md">{item.homeTitle}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DINING */}
      <section className="section dining-home" aria-labelledby="dining-title">
        <div className="container dining-home__grid">
          <div className="dining-home__media">
            <Media photo={IMAGES.homeDining} ratio="4 / 5" parallax sizes="(min-width: 1025px) 40vw, 100vw" className="dining-home__main" />
            <Media photo={IMAGES.homeDiningDetail} ratio="1 / 1" sizes="(min-width: 1025px) 22vw, 60vw" className="dining-home__inset" />
          </div>
          <div className="dining-home__text" data-reveal-group>
            <p className="eyebrow eyebrow--olive">The Table at Stillhouse</p>
            <h2 id="dining-title" className="h-xl">Gather around <br />the table.</h2>
            <p className="lede">
              A restaurant built around fire, season and the simple pleasure of eating slowly — with menus that follow the garden and the farms nearby.
            </p>
            <p className="body">Breakfast on the terrace, long lunches in the shade, and dinner by candlelight in a room that is quiet enough to talk.</p>
            <ArrowLink to="/dining">Discover dining</ArrowLink>
          </div>
        </div>
      </section>

      <ClosingCta />
    </>
  );
}
