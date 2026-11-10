/** Text-led editorial page opening: oversized serif heading with a quiet supporting column. */
export default function PageHero({ eyebrow, title, children, aside, className = "" }) {
  return (
    <header className={`page-hero page-top ${className}`.trim()}>
      <div className="container">
        {eyebrow && (
          <p className="eyebrow eyebrow--olive page-hero__eyebrow" data-reveal="text">
            {eyebrow}
          </p>
        )}
        <div className="page-hero__grid">
          <h1 className="display page-hero__title" data-reveal="text">
            {title}
          </h1>
          {(children || aside) && (
            <div className="page-hero__aside" data-reveal="text">
              {children}
              {aside}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
