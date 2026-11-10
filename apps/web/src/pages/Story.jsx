import PageHero from "@/components/editorial/PageHero.jsx";
import SplitSection from "@/components/editorial/SplitSection.jsx";
import ClosingCta from "@/components/editorial/ClosingCta.jsx";
import DemoNotice from "@/components/ui/DemoNotice.jsx";
import Media from "@/components/ui/Media.jsx";
import { IMAGES } from "@/data/images.js";
import { STORY_SECTIONS } from "@/data/story.js";
import { SITE } from "@/data/site.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function Story() {
  useDocumentTitle("Our Story");
  return (
    <>
      <PageHero eyebrow="Our Story" title={<>Rooted in place. <br />Designed for <em>pause.</em></>}>
        <p className="lede">
          The Stillhouse began with a simple question: what would a place look like if it were designed, entirely, around the idea of slowing down?
        </p>
      </PageHero>

      <div className="container">
        <Media photo={IMAGES.storyWide} ratio="21 / 9" parallax sizes="100vw" className="wide-image" priority />
      </div>

      <div className="story-sections">
        {STORY_SECTIONS.map((s, i) => (
          <SplitSection
            key={s.id}
            id={s.id}
            number={String(i + 1).padStart(2, "0")}
            label={s.label}
            title={s.title}
            paragraphs={s.paragraphs}
            photo={s.image}
            flip={i % 2 === 1}
            tall={i % 2 === 0}
          />
        ))}
      </div>

      <section className="section bg-parchment" aria-labelledby="loc-title">
        <div className="container location">
          <div className="location__text" data-reveal-group>
            <p className="eyebrow eyebrow--olive">Finding us</p>
            <h2 id="loc-title" className="h-lg">Above the valley, near Naivasha.</h2>
            <p className="body">
              The Stillhouse is imagined in the highlands above Naivasha, Kenya, looking out across the Great Rift Valley. {SITE.coordinates} marks the general area only.
            </p>
            <DemoNotice label="Concept property">
              No street address is given because this is a concept property. This page does not describe a real operating hotel.
            </DemoNotice>
          </div>
          <div className="map-placeholder" role="img" aria-label="Map placeholder: interactive map to be integrated in a future version" data-reveal="text">
            <svg viewBox="0 0 600 420" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="#D7D3C9" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="600" height="420" fill="url(#grid)" />
              <path d="M0 300 C120 250 200 330 320 270 S520 200 600 230" fill="none" stroke="#77786F" strokeWidth="1" strokeDasharray="4 6" />
              <circle cx="330" cy="225" r="6" fill="#A66F56" />
              <circle cx="330" cy="225" r="16" fill="none" stroke="#A66F56" strokeWidth="1" />
            </svg>
            <div className="map-placeholder__label">
              <p className="eyebrow">Map placeholder</p>
              <p className="small">Interactive map to be integrated in a future version.</p>
            </div>
          </div>
        </div>
      </section>

      <ClosingCta title="Come and slow down." cta="Plan your stay" />
    </>
  );
}
