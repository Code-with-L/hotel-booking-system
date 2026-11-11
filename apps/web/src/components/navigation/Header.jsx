import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { NAV_LINKS } from "@/data/site.js";
import { watchNavScroll } from "@/animations/navigation.js";
import Button from "@/components/ui/Button.jsx";
import MobileMenu from "./MobileMenu.jsx";

/** Routes that open with a full-bleed photograph: the header starts transparent. */
const isOverlayRoute = (pathname) => pathname === "/" || pathname.startsWith("/rooms/");

export default function Header() {
  const { pathname } = useLocation();
  const overlay = isOverlayRoute(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef(null);
  const wasMenuOpen = useRef(false);

  useEffect(() => watchNavScroll(setScrolled), []);
  useEffect(() => setMenuOpen(false), [pathname]);

  // Return focus to the trigger button when the menu closes (not on mount)
  useEffect(() => {
    if (menuOpen) {
      wasMenuOpen.current = true;
      return;
    }
    if (wasMenuOpen.current) {
      menuTriggerRef.current?.focus();
      wasMenuOpen.current = false;
    }
  }, [menuOpen]);

  const solid = !overlay || scrolled;

  return (
    <>
      <header className={`site-header${overlay ? " site-header--overlay" : ""}${solid ? " is-solid" : ""}`}>
        <div className="site-header__inner">
          <Link to="/" className="wordmark" aria-label="The Stillhouse — home">
            The Stillhouse
          </Link>

          <nav className="site-nav" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className="nav-link">
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            <NavLink to="/account/reservations" className="nav-link">
              My Reservation
            </NavLink>
            <Button to="/availability" size="sm" className="btn--book">
              Book your stay
            </Button>
          </div>

          <button
            ref={menuTriggerRef}
            className="menu-trigger"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span>Menu</span>
            <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </header>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
