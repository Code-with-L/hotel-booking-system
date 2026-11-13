/**
 * Skeleton primitives. Shapes mirror the real layout so the swap to live content
 * causes no layout shift. Motion is opacity-only (no shimmer pan), respecting reduced motion.
 */

/** One skeleton block. `h`/`w` accept any CSS length. */
export function Skeleton({ className = "", h = 16, w = "100%", radius, style, ...rest }) {
  return <span className={`skeleton ${className}`.trim()} style={{ height: h, width: w, borderRadius: radius, ...style }} aria-hidden="true" {...rest} />;
}

/** Multi-line text skeleton with a ragged last line. */
export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`skeleton-lines ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? "58%" : i % 2 ? "92%" : "100%"} radius={2} />
      ))}
    </div>
  );
}

/** Imagery-backed card skeleton (room/figure photo box). */
export function SkeletonCard({ ratio = "4 / 5", className = "" }) {
  return (
    <div className={`skeleton skeleton-card ${className}`.trim()} style={{ aspectRatio: ratio }} aria-hidden="true">
      <div className="skeleton-card__body">
        <Skeleton h={10} w="38%" />
        <Skeleton h={14} w="70%" />
      </div>
    </div>
  );
}

/** Table skeleton with header cells. */
export function SkeletonTable({ rows = 5, columns = 5, className = "" }) {
  return (
    <div className={`table-wrap ${className}`.trim()} role="presentation" aria-hidden="true">
      <table className="table table--admin skeleton-table">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }, (_, c) => (
                <td key={c}><Skeleton h={12} w={c === 0 ? "55%" : `${62 + ((r * 13 + c * 29) % 30)}%`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dashboard stat tiles: mirrors the Stat layout. */
export function SkeletonStats({ count = 5 }) {
  return (
    <div className="stats skeleton-stats" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="stat skeleton-tile" key={i}>
          <Skeleton h={10} w="62%" />
          <Skeleton h={30} w="72%" />
          <Skeleton h={9} w="55%" />
        </div>
      ))}
    </div>
  );
}
