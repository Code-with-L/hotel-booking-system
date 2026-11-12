import PageHero from "@/components/editorial/PageHero.jsx";
import Button from "@/components/ui/Button.jsx";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function NotFound() {
  useDocumentTitle("Page not found");
  return (
    <>
      <PageHero title={<>This path leads <em>nowhere.</em></>}>
        <p className="lede">The page you were looking for doesn't exist. Let's get you back.</p>
        <div className="hero-actions">
          <Button to="/" arrow>Return home</Button>
          <Button to="/rooms" variant="outline">View rooms</Button>
        </div>
      </PageHero>
      <div className="section section--flush-top" />
    </>
  );
}
