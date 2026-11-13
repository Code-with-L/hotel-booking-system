import { Link } from "react-router-dom";
import { NAV_LINKS, SITE } from "@/data/site.js";

export default function Footer() {
  return (
    <footer className="site-footer on-dark">
      <div className="container">
        <div className="footer-cols">
          <div>
            <p className="meta">Contact</p>
            <ul>
              <li>{SITE.location}</li>
              <li>
                <a href={`https://wa.me/${SITE.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                  WhatsApp {SITE.phone}
                </a>
              </li>
              <li className="footer-note">The Stillhouse is a fictional boutique retreat; imagery is illustrative.</li>
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
            <p className="meta">Reach us</p>
            <ul>
              <li>
                <a
                  className="whatsapp-btn"
                  href={`https://wa.me/${SITE.phone.replace(/\D/g, "")}?text=${encodeURIComponent(SITE.whatsappMessage)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Chat on WhatsApp
                </a>
              </li>
            </ul>
          </div>
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
