import { photoSrcSet, photoUrl } from "@/data/images.js";

/**
 * Photograph with optional reveal / parallax / hover zoom.
 *  - `reveal`   clip-path reveal on scroll (see animations/reveals.js)
 *  - `parallax` true | number — gentle parallax (desktop only)
 *  - `ratio`    CSS aspect-ratio, e.g. "4 / 5"
 * Square corners by design.
 */
export default function Media({
  photo,
  ratio,
  sizes = "100vw",
  reveal = true,
  parallax = false,
  zoom = false,
  priority = false,
  className = "",
  style,
  children,
}) {
  const cls = ["media", parallax && "media--parallax", zoom && "media--zoom", className].filter(Boolean).join(" ");
  return (
    <figure
      className={cls}
      style={{ aspectRatio: ratio, ...style }}
      data-reveal={reveal ? "image" : undefined}
    >
      <img
        src={photoUrl(photo, 1600)}
        srcSet={photoSrcSet(photo)}
        sizes={sizes}
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        data-parallax={parallax ? (typeof parallax === "number" ? parallax : 6) : undefined}
      />
      {children}
    </figure>
  );
}
