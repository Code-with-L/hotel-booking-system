/**
 * Scroll reveals. Markup contract:
 *   [data-reveal="image"]   clip-path reveal on a .media figure (inner <img> eases from scale)
 *   [data-reveal="text"]    subtle vertical text reveal (single element)
 *   [data-reveal-group]     children rise in with a controlled stagger
 *   [data-parallax]         gentle parallax on an element inside an overflow-hidden parent
 * Motion is skipped for prefers-reduced-motion; parallax is desktop-only.
 * Returns a cleanup function that reverts every tween and ScrollTrigger created.
 */
import { gsap, ScrollTrigger } from "./gsap.js";

export function initReveals(root) {
  if (!root) return () => {};
  const mm = gsap.matchMedia();

  mm.add(
    { motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1025px)" },
    (context) => {
      const { motion, desktop } = context.conditions;
      if (!motion) return;

      root.querySelectorAll('[data-reveal="image"]').forEach((el) => {
        const trigger = { trigger: el, start: "top 92%", once: true };
        gsap.fromTo(
          el,
          { clipPath: "inset(0 0 100% 0)" },
          { clipPath: "inset(0 0 0% 0)", duration: 1.15, ease: "power3.inOut", scrollTrigger: trigger, clearProps: "clipPath" }
        );
        const img = el.querySelector("img");
        if (img && !img.hasAttribute("data-parallax")) {
          gsap.fromTo(img, { scale: 1.12 }, { scale: 1, duration: 1.6, ease: "power2.out", scrollTrigger: trigger });
        }
      });

      root.querySelectorAll('[data-reveal="text"]').forEach((el) => {
        gsap.from(el, {
          autoAlpha: 0,
          y: 26,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
        });
      });

      root.querySelectorAll("[data-reveal-group]").forEach((group) => {
        gsap.from(group.children, {
          autoAlpha: 0,
          y: 22,
          duration: 0.85,
          stagger: 0.11,
          ease: "power3.out",
          scrollTrigger: { trigger: group, start: "top 88%", once: true },
        });
      });

      if (desktop) {
        root.querySelectorAll("[data-parallax]").forEach((el) => {
          const amount = Number(el.getAttribute("data-parallax")) || 6;
          gsap.fromTo(
            el,
            { yPercent: -amount },
            {
              yPercent: amount,
              ease: "none",
              scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
            }
          );
        });
      }
    }
  );

  return () => {
    mm.revert();
    // Defensive: kill any trigger whose element lives inside this root.
    ScrollTrigger.getAll().forEach((st) => {
      if (st.trigger && root.contains(st.trigger)) st.kill();
    });
  };
}
