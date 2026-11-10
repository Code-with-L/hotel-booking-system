/** Page transition: a short fade/lift on arrival. Never blocks interaction. */
import { gsap, prefersReducedMotion } from "./gsap.js";

export function pageEnter(el) {
  if (!el || prefersReducedMotion()) return null;
  return gsap.fromTo(
    el,
    { autoAlpha: 0, y: 14 },
    { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out", clearProps: "opacity,visibility,transform" }
  );
}
