import Button from "@/components/ui/Button.jsx";

export default function ClosingCta({ title = "Your time, uninterrupted.", cta = "Plan your stay", to = "/availability", eyebrow = "The Stillhouse · Naivasha" }) {
  return (
    <section className="closing on-dark" aria-labelledby="closing-title">
      <div className="container closing__inner">
        <p className="eyebrow" data-reveal="text">{eyebrow}</p>
        <h2 id="closing-title" className="display closing__title" data-reveal="text">
          {title}
        </h2>
        <div className="closing__actions" data-reveal="text">
          <Button to={to} variant="light" arrow>
            {cta}
          </Button>
          <p className="small">Twenty-eight rooms. No rush.</p>
        </div>
      </div>
    </section>
  );
}
