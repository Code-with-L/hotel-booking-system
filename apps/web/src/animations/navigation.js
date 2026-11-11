/** Navigation motion: solid-on-scroll toggle and the full-screen menu overlay. */
import { gsap, prefersReducedMotion } from "./gsap.js";

const SOLID_OFFSET = 40;

/** Calls onChange(true|false) as the page passes `offset` px. Returns cleanup. */
export function watchNavScroll(onChange, offset = SOLID_OFFSET) {
  let ticking = false;
  const update = () => onChange(window.scrollY > offset);
  update();
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}

/** Builds a paused timeline for the menu overlay. */
export function createMenuTimeline(overlay) {
  const reduce = prefersReducedMotion();
  const items = overlay.querySelectorAll("[data-menu-item]");
  const foot = overlay.querySelectorAll("[data-menu-foot]");
  const tl = gsap.timeline({ paused: true });
  tl.set(overlay, { visibility: "visible" })
    .fromTo(
      overlay,
      { clipPath: "inset(0 0 100% 0)" },
      { clipPath: "inset(0 0 0% 0)", duration: reduce ? 0.01 : 0.75, ease: "power3.inOut" }
    )
    .fromTo(
      items,
      { yPercent: 105, autoAlpha: 0 },
      { yPercent: 0, autoAlpha: 1, duration: reduce ? 0.01 : 0.8, stagger: reduce ? 0 : 0.08, ease: "power3.out" },
      reduce ? 0 : 0.35
    )
    .fromTo(
      foot,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: reduce ? 0.01 : 0.6, stagger: reduce ? 0 : 0.08, ease: "power2.out" },
      reduce ? 0 : 0.75
    );
  return tl;
}
