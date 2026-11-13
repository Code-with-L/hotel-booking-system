import Button from "@/components/ui/Button.jsx";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

// Original Stillhouse 404 — typographic, still, no motion (M8-E).
export default function NotFound() {
  useDocumentTitle("404 - Page not found");
  return (
    <section className="nf404" aria-label="Page not found">
      <div className="container nf404__inner">
        <p className="eyebrow eyebrow--olive">Not at The Stillhouse</p>
        <p className="nf404__code" aria-hidden="true">404</p>
        <hr className="nf404__rule" aria-hidden="true" />
        <h1 className="sr-only">Page not found</h1>
        <p className="nf404__lede">This path leads elsewhere. Every room, table and track at the property is still where you left it — this is a page that doesn&apos;t exist.</p>
        <div className="hero-actions nf404__actions">
          <Button to="/" arrow>Return home</Button>
          <Button to="/availability" variant="outline">Check availability</Button>
        </div>
      </div>
    </section>
  );
}
