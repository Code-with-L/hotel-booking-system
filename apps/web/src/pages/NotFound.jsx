import Button from "@/components/ui/Button.jsx";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function NotFound() {
  useDocumentTitle("404 - Page not found");
  return (
    <section className="nf" aria-label="404 - page not found">
      {/* autoplay muted looped ambient backdrop */}
      <video
        className="nf__video"
        src="/404.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      <div className="nf__scrim" aria-hidden="true" />
      <div className="container nf__content">
        <p className="nf__code">404</p>
        <h1 className="nf__title">This path leads nowhere.</h1>
        <p className="lede nf__lede">The page you were looking for doesn't exist. Let's get you back.</p>
        <div className="hero-actions">
          <Button to="/" arrow>Return home</Button>
          <Button to="/rooms" variant="outline">View rooms</Button>
        </div>
      </div>
    </section>
  );
}
