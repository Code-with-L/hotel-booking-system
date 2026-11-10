import Media from "@/components/ui/Media.jsx";

/**
 * Alternating image / text editorial section (Story, Dining).
 * `flip` swaps sides; `tall` uses a portrait crop.
 */
export default function SplitSection({ id, label, title, paragraphs = [], photo, flip = false, tall = true, children, number }) {
  return (
    <section className={`split${flip ? " split--flip" : ""}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="container split__grid">
        <div className="split__media">
          <Media photo={photo} ratio={tall ? "4 / 5" : "3 / 2"} parallax sizes="(min-width: 1025px) 50vw, 100vw" />
        </div>
        <div className="split__text" data-reveal-group>
          <p className="eyebrow eyebrow--olive">
            {number && <span className="split__n">{number} · </span>}
            {label}
          </p>
          <h2 id={`${id}-title`} className="h-lg">
            {title}
          </h2>
          <div className="prose">
            {paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
