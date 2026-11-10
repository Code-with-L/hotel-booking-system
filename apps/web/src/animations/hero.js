/**
 * Homepage hero sequence:
 * image clip-path reveal → location label → headline (line by line) →
 * supporting text → CTAs → scroll indicator → booking bar.
 * Call inside gsap.context(); the context handles cleanup.
 */
import { gsap, prefersReducedMotion } from "./gsap.js";

export function heroIntro(root) {
  if (!root || prefersReducedMotion()) return null;
  const q = (s) => root.querySelectorAll(s);
  const image = q("[data-hero-image]");
  const img = q("[data-hero-image] img");

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.fromTo(
    image,
    { clipPath: "inset(0 0 100% 0)" },
    { clipPath: "inset(0 0 0% 0)", duration: 1.5, ease: "power3.inOut", clearProps: "clipPath" }
  )
    .fromTo(img, { scale: 1.16 }, { scale: 1, duration: 2.4, ease: "power2.out" }, 0)
    .from(q("[data-hero-label]"), { autoAlpha: 0, y: 10, duration: 0.8 }, 0.9)
    .from(q("[data-hero-line]"), { yPercent: 110, duration: 1.1, stagger: 0.14 }, 1.05)
    .from(q("[data-hero-text]"), { autoAlpha: 0, y: 16, duration: 0.9 }, 1.7)
    .from(q("[data-hero-cta]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.1 }, 1.95)
    .from(q("[data-hero-scroll]"), { autoAlpha: 0, duration: 0.8 }, 2.2)
    .from(q("[data-hero-bar]"), { autoAlpha: 0, y: 18, duration: 0.8 }, 2.0);
  return tl;
}
