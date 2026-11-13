import Media from "@/components/ui/Media.jsx";
import Button from "@/components/ui/Button.jsx";

/**
 * Editorial experience entry. Alternating magazine layout (.exp--a … .exp--f).
 * Shows the honest price/duration, what's included, and enquire CTA.
 */
export default function ExperienceBlock({ item, index, layout = "a", onEnquire }) {
  const ratios = { a: "3 / 2", b: "4 / 5", c: "1 / 1", d: "16 / 10", e: "4 / 5", f: "3 / 2" };
  return (
    <article className={`exp exp--${layout}`} id={item.id}>
      <div className="exp__media">
        <Media photo={item.image} ratio={ratios[layout]} parallax sizes="(min-width: 1025px) 55vw, 100vw" />
      </div>
      <div className="exp__text" data-reveal-group>
        <p className="eyebrow eyebrow--terra">
          {String(index + 1).padStart(2, "0")} · {item.category}
        </p>
        <h2 className="h-lg">{item.title}</h2>
        <p className="body">{item.text}</p>
        {item.includes?.length > 0 && (
          <ul className="exp__includes" aria-label="Included">
            {item.includes.map((inc) => <li key={inc}>{inc}</li>)}
          </ul>
        )}
        <p className="meta exp__duration">{item.duration} · <strong>{item.price}</strong></p>
        <Button variant="outline" size="sm" arrow onClick={() => onEnquire(item)}>
          Enquire
        </Button>
      </div>
    </article>
  );
}
