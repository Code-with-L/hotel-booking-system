import PageHero from "@/components/editorial/PageHero.jsx";
import { LEGAL } from "@/data/site.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function Legal({ doc }) {
  const content = LEGAL[doc];
  useDocumentTitle(content.title);
  return (
    <>
      <PageHero eyebrow="Legal" title={content.title}>
        <p className="lede">{content.intro}</p>
      </PageHero>
      <section className="section section--flush-top">
        <div className="container legal">
          {content.sections.map((s) => (
            <div key={s.heading} className="legal__item">
              <h2 className="h-sm">{s.heading}</h2>
              <p className="body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
