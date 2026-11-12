import { useState } from "react";
import PageHero from "@/components/editorial/PageHero.jsx";
import ExperienceBlock from "@/components/editorial/ExperienceBlock.jsx";
import ClosingCta from "@/components/editorial/ClosingCta.jsx";
import EnquiryDialog from "@/components/forms/EnquiryDialog.jsx";
import DemoNotice from "@/components/ui/DemoNotice.jsx";
import Media from "@/components/ui/Media.jsx";
import { EXPERIENCES } from "@/data/experiences.js";
import { IMAGES } from "@/data/images.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

const LAYOUTS = ["a", "b", "c", "d", "e", "f"];

export default function Experiences() {
  useDocumentTitle("Experiences");
  const [topic, setTopic] = useState(null);

  return (
    <>
      <PageHero title={<>Beyond the <em>room.</em></>}>
        <p className="lede">
          Six ways to spend a day here — each one a small, unhurried departure from doing nothing at all.
        </p>
      </PageHero>

      <div className="container">
        <Media photo={IMAGES.expHero} ratio="21 / 9" parallax sizes="100vw" className="wide-image" priority />
      </div>

      <section className="section exp-list" aria-label="Experiences">
        <div className="container">
          {EXPERIENCES.map((item, i) => (
            <ExperienceBlock
              key={item.id}
              item={item}
              index={i}
              layout={LAYOUTS[i]}
              onEnquire={(it) => setTopic({ kind: "experience", title: it.title })}
            />
          ))}
          <DemoNotice label="Illustrative programme">
            Experiences, durations and availability shown here are sample content for a concept property.
          </DemoNotice>
        </div>
      </section>

      <ClosingCta title="Tell us how you'd like to spend your days." cta="Plan your stay" />
      <EnquiryDialog topic={topic} onClose={() => setTopic(null)} />
    </>
  );
}
