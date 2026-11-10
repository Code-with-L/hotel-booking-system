import Media from "@/components/ui/Media.jsx";
import Button from "@/components/ui/Button.jsx";

/**
 * Magazine-style experience entry. `layout` selects one of six compositions
 * (CSS: .exp--a … .exp--f) so the page never settles into a repeating grid.
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
        <p className="meta exp__duration">Duration · {item.duration}</p>
        <Button variant="outline" size="sm" arrow onClick={() => onEnquire(item)}>
          Enquire
        </Button>
      </div>
    </article>
  );
}
