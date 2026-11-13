import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button.jsx";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

// 16 locally-hosted photos, cycled to fill the ring of floating cards.
const PHOTOS = [
  "16959786", "17217061", "19467973", "20975729", "2290070", "24433378",
  "24807124", "26859049", "27626174", "27626185", "28054849", "28054852",
  "29259652", "30174990", "30420679", "30808019",
];
const CARD_COUNT = 26;

const seededRandom = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

export default function NotFound() {
  useDocumentTitle("404 - Page not found");
  const [phase, setPhase] = useState("scatter");

  const cards = useMemo(() => {
    const rand = seededRandom("404");
    return Array.from({ length: CARD_COUNT }, (_, i) => {
      const angle = (i / CARD_COUNT) * Math.PI * 2;
      return {
        id: i,
        src: `/photos/${PHOTOS[i % PHOTOS.length]}-480.jpeg`,
        // scattered start positions (percent of stage)
        sx: 4 + rand() * 92,
        sy: 8 + rand() * 62,
        rot: (rand() - 0.5) * 40,
        // ring positions on a circle of radius 34vmin around stage center
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        delay: Math.round(rand() * 420),
      };
    });
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("ring"), 1500);
    const t2 = setTimeout(() => setPhase("reveal"), 2900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const ringClass = [
    "nf__ring",
    phase !== "scatter" && "is-ring",
    phase === "reveal" && "is-spinning",
  ].filter(Boolean).join(" ");

  return (
    <section className={`nf phase--${phase}`} aria-label="404 - page not found">
      <div className={ringClass} aria-hidden="true">
        {cards.map((c) => (
          <img
            key={c.id}
            className="nf-card"
            src={c.src}
            alt=""
            draggable="false"
            style={{
              "--sx": `${c.sx}%`,
              "--sy": `${c.sy}%`,
              "--rot": `${c.rot}deg`,
              "--cos": c.cos,
              "--sin": c.sin,
              transitionDelay: `${c.delay}ms`,
            }}
          />
        ))}
      </div>

      <div className="container nf__content">
        <h1 className="nf__code">404</h1>
        <p className="nf__lede">This page went off the map. Everywhere else is still right here.</p>
        <div className="hero-actions nf__actions">
          <Button to="/" arrow>Return home</Button>
          <Button to="/rooms" variant="outline">View rooms</Button>
        </div>
      </div>
    </section>
  );
}
