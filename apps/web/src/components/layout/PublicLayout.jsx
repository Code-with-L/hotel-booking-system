import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "@/components/navigation/Header.jsx";
import Footer from "./Footer.jsx";
import { useReveals } from "@/hooks/useReveals.js";
import { pageEnter } from "@/animations/transitions.js";

export default function PublicLayout() {
  const { pathname, hash } = useLocation();
  const mainRef = useRef(null);

  // Start every route at the top (or at its #anchor); fade the new page in.
  // The homepage has its own hero sequence, so it skips the generic fade.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (pathname !== "/") pageEnter(mainRef.current);
    if (hash) {
      const t = setTimeout(() => document.querySelector(hash)?.scrollIntoView({ block: "start" }), 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [pathname, hash]);

  useReveals(mainRef, [pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main" ref={mainRef}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
