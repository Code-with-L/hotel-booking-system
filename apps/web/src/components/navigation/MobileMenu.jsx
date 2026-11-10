import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { X } from "lucide-react";
import { NAV_LINKS, SITE } from "@/data/site.js";
import { gsap } from "@/animations/gsap.js";
import { createMenuTimeline } from "@/animations/navigation.js";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll.js";
import Button from "@/components/ui/Button.jsx";

const ITEMS = [{ label: "Home", to: "/" }, ...NAV_LINKS, { label: "My Reservation", to: "/account/reservations" }];

export default function MobileMenu({ open, onClose }) {
  const ref = useRef(null);
  const tl = useRef(null);
  const closeRef = useRef(null);
  useLockBodyScroll(open);

  useLayoutEffect(() => {
    const el = ref.current;
    const ctx = gsap.context(() => {
      tl.current = createMenuTimeline(el);
      tl.current.eventCallback("onReverseComplete", () => {
        el.style.visibility = "hidden";
      });
    }, el);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!tl.current) return undefined;
    if (open) {
      tl.current.timeScale(1).play();
      closeRef.current?.focus();
    } else {
      tl.current.timeScale(1.6).reverse();
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      id="mobile-menu"
      ref={ref}
      className="mobile-menu on-dark"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="mobile-menu__bar">
        <Link to="/" className="wordmark" onClick={onClose}>
          The Stillhouse
        </Link>
        <button ref={closeRef} className="menu-trigger" onClick={onClose} aria-label="Close menu">
          <span>Close</span>
          <X size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <nav className="mobile-menu__nav" aria-label="Mobile">
        {ITEMS.map((item, i) => (
          <div className="mobile-menu__row" key={item.to}>
            <NavLink to={item.to} end={item.to === "/"} className="mobile-menu__link" data-menu-item onClick={onClose}>
              <span className="mobile-menu__index">{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </NavLink>
          </div>
        ))}
      </nav>

      <div className="mobile-menu__foot">
        <div data-menu-foot>
          <Button to="/availability" variant="light" arrow onClick={onClose}>
            Book your stay
          </Button>
        </div>
        <p className="meta" data-menu-foot>
          {SITE.location} · {SITE.coordinates}
        </p>
      </div>
    </div>
  );
}
