import { useLayoutEffect } from "react";
import { gsap, ScrollTrigger } from "@/animations/gsap.js";
import { initReveals } from "@/animations/reveals.js";

/**
 * Attach scroll reveals to a container for the lifetime of a route.
 * Uses gsap.context for scoped cleanup and refreshes ScrollTrigger once
 * imagery has had time to settle.
 */
export function useReveals(ref, deps = []) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let cleanup = () => {};
    const ctx = gsap.context(() => {
      cleanup = initReveals(root);
    }, root);
    const t = setTimeout(() => ScrollTrigger.refresh(), 700);
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);
    return () => {
      clearTimeout(t);
      window.removeEventListener("load", onLoad);
      cleanup();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
