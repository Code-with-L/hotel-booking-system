import { Link } from "react-router-dom";
import { NAV_LINKS, SITE } from "@/data/site.js";
import NewsletterForm from "@/components/forms/NewsletterForm.jsx";

export default function Footer() {
  return (
    <footer className="site-footer on-dark">
      <div className="container">
        <div className="footer-top">
          <div className="footer-intro">
            <p className="eyebrow">{SITE.location}</p>
            <p className="h-md footer-tagline">{SITE.tagline}</p>
          </div>
          <NewsletterForm />
        </div>

        <div className="footer-cols">
          <div>
            <p className="meta">Contact</p>
            <ul>
              <li>{SITE.location}</li>
              <li>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
              <li>
                <a href={`tel:${SITE.phone.replace(/\s/g, "")}`}>{SITE.phone}</a>
              </li>
              <li className="footer-note">Placeholder details — concept property</li>
            </ul>
          </div>
          <div>
            <p className="meta">Explore</p>
            <ul>
              {NAV_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="meta">Reservations</p>
            <ul>
              <li>
                <Link to="/availability">Check availability</Link>
              </li>
              <li>
                <Link to="/account/reservations">My reservation</Link>
              </li>
              <li>
                <Link to="/rooms">All rooms</Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="meta">Follow</p>
            <ul>
              {SITE.socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noreferrer">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-wordmark" aria-hidden="true">
          THE STILLHOUSE
        </div>

        <div className="footer-base">
          <p className="meta">© {new Date().getFullYear()} The Stillhouse — a concept property above the Rift Valley.</p>
          <p className="footer-legal meta">
            <Link to="/privacy">Privacy policy</Link>
            <Link to="/terms">Terms and conditions</Link>
            <Link to="/admin">Staff sign in</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
