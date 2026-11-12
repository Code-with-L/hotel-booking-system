import { useState } from "react";
import PageHero from "@/components/editorial/PageHero.jsx";
import SplitSection from "@/components/editorial/SplitSection.jsx";
import EnquiryDialog from "@/components/forms/EnquiryDialog.jsx";
import DemoNotice from "@/components/ui/DemoNotice.jsx";
import Button from "@/components/ui/Button.jsx";
import Media from "@/components/ui/Media.jsx";
import { IMAGES } from "@/data/images.js";
import { HOURS, MEALS } from "@/data/dining.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function Dining() {
  useDocumentTitle("Dining");
  const [topic, setTopic] = useState(null);
  const enquire = () => setTopic({ kind: "dining", title: "The Table at Stillhouse — reservation enquiry" });

  return (
    <>
      <PageHero title={<>Good things take <em>time.</em></>}>
        <p className="lede">
          A restaurant for slow mornings, long lunches and quiet evenings — cooked over fire, shaped by season.
        </p>
        <div className="hero-actions">
          <Button arrow onClick={enquire}>Reservation enquiry</Button>
        </div>
      </PageHero>

      <div className="container">
        <Media photo={IMAGES.diningHero} ratio="21 / 9" parallax sizes="100vw" className="wide-image" priority />
      </div>

      <section className="section dining-intro" aria-labelledby="dining-intro-title">
        <div className="container dining-intro__grid">
          <div data-reveal-group>
            <p className="eyebrow eyebrow--olive">The restaurant</p>
            <h2 id="dining-intro-title" className="h-lg">A room made for lingering.</h2>
          </div>
          <div className="prose" data-reveal="text">
            <p>
              The Table at Stillhouse seats guests in a single, low-lit room opening onto the garden. The kitchen cooks with fire and patience, using produce from the property's own beds and nearby farms.
            </p>
            <p>
              Menus are short, seasonal and shared. Nothing is rushed — the best tables are the ones you forget to leave.
            </p>
          </div>
          <Media photo={IMAGES.diningEvening} ratio="3 / 2" sizes="(min-width: 1025px) 40vw, 100vw" className="dining-intro__img" />
        </div>
      </section>

      {MEALS.map((m, i) => (
        <SplitSection
          key={m.id}
          id={m.id}
          number={String(i + 1).padStart(2, "0")}
          label={m.label}
          title={m.title}
          paragraphs={[m.text]}
          photo={m.image}
          flip={i % 2 === 1}
          tall={i % 2 === 0}
        />
      ))}

      <section className="section bg-charcoal on-dark" aria-labelledby="hours-title">
        <div className="container hours">
          <div data-reveal="text">
            <p className="eyebrow">Opening hours</p>
            <h2 id="hours-title" className="h-lg">Service times</h2>
            <DemoNotice label="Illustrative hours">
              These times are sample content for a concept property and are not confirmed opening hours.
            </DemoNotice>
          </div>
          <div data-reveal="text">
            <dl className="hours__list">
              {HOURS.map((h) => (
                <div key={h.service}>
                  <dt>{h.service}</dt>
                  <dd className="price">{h.time}</dd>
                </div>
              ))}
            </dl>
            <Button variant="light" arrow onClick={enquire}>Reservation enquiry</Button>
          </div>
        </div>
      </section>

      <EnquiryDialog topic={topic} onClose={() => setTopic(null)} />
    </>
  );
}
