import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gsap, prefersReducedMotion } from "@/animations/gsap.js";
import { photoSrcSet, photoUrl } from "@/data/images.js";

/** Room gallery: crossfading stage, thumbnails, arrows and arrow-key navigation. */
export default function RoomGallery({ photos, name }) {
  const [index, setIndex] = useState(0);
  const stage = useRef(null);
  const first = useRef(true);
  const count = photos.length;

  const go = (i) => setIndex((i + count) % count);

  useLayoutEffect(() => {
    const slides = stage.current?.querySelectorAll(".gallery__slide");
    if (!slides) return undefined;
    const ctx = gsap.context(() => {
      const dur = first.current || prefersReducedMotion() ? 0 : 0.8;
      slides.forEach((el, i) => {
        const active = i === index;
        gsap.to(el, { autoAlpha: active ? 1 : 0, duration: dur, ease: "power2.inOut" });
        if (active && dur) gsap.fromTo(el.querySelector("img"), { scale: 1.06 }, { scale: 1, duration: 1.4, ease: "power2.out" });
      });
      first.current = false;
    }, stage);
    return () => ctx.revert();
  }, [index]);

  useEffect(() => {
    // Preload neighbours for smooth transitions.
    [index + 1, index - 1].forEach((i) => {
      const img = new Image();
      img.src = photoUrl(photos[(i + count) % count], 1600);
    });
  }, [index, photos, count]);

  const onKey = (e) => {
    if (e.key === "ArrowRight") go(index + 1);
    if (e.key === "ArrowLeft") go(index - 1);
  };

  return (
    <div className="gallery" role="region" aria-roledescription="carousel" aria-label={`${name} gallery`} onKeyDown={onKey}>
      <div className="gallery__stage" ref={stage} tabIndex={0} aria-live="polite">
        {photos.map((p, i) => (
          <div className="gallery__slide" key={p.id} aria-hidden={i !== index} style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? "visible" : "hidden" }}>
            <img
              src={photoUrl(p, 1600)}
              srcSet={photoSrcSet(p)}
              sizes="(min-width: 1025px) 70vw, 100vw"
              alt={p.alt}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
        <div className="gallery__controls">
          <span className="meta gallery__count">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          <div>
            <button onClick={() => go(index - 1)} aria-label="Previous image"><ChevronLeft size={20} strokeWidth={1.25} /></button>
            <button onClick={() => go(index + 1)} aria-label="Next image"><ChevronRight size={20} strokeWidth={1.25} /></button>
          </div>
        </div>
      </div>
      <div className="gallery__thumbs">
        {photos.map((p, i) => (
          <button key={p.id} className={i === index ? "is-active" : ""} onClick={() => go(i)} aria-label={`Show image ${i + 1}: ${p.alt}`} aria-current={i === index}>
            <img src={photoUrl(p, 400)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}
