import { useState } from "react";
import PageHero from "@/components/editorial/PageHero.jsx";
import ExperienceBlock from "@/components/editorial/ExperienceBlock.jsx";
import ClosingCta from "@/components/editorial/ClosingCta.jsx";
import EnquiryDialog from "@/components/forms/EnquiryDialog.jsx";
import Media from "@/components/ui/Media.jsx";
import Button from "@/components/ui/Button.jsx";
import { EXPERIENCES } from "@/data/experiences.js";
import { IMAGES } from "@/data/images.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

const LAYOUTS = ["a", "b", "c", "d", "e", "f"];
const INCLUSIONS = [
  {
    title: "A private guide, when you ask",
    text: "A dedicated naturalist and driver-guide is on property from dawn to dusk. Rift Valley routes, flower farms, dairy tours and quiet plateaus — everything is named on your stay, never upsold.",
  },
  {
    title: "Farm to table, every day",
    text: "Breakfast arrives from the property's own garden — honeysuckles, herbs, fruit, eggs from the farm down the lane. Lunch is a grazing table for whoever's still around. Dinner is fire-cooked and slow.",
  },
  {
    title: "The house is yours to use",
    text: "Full use of the pool terrace, library, sauna and treatment garden throughout your stay; much of it comes included, not itemised. You book the room; the house looks after the rest.",
  },
];

const PRACTICAL = [
  {
    label: "Booking",
    text: "Every experience is arranged around your dates — enquire by WhatsApp or at the front desk on arrival. Private evenings need at least 48 hours' notice; the bath benefits from a morning slot.",
  },
  {
    label: "What to wear",
    text: "Comfortable shoes for ridge paths, a layer for early starts, and something elegant for the private table. Nothing beyond that — the valley supplies the drama.",
  },
  {
    label: "Families & private groups",
    text: "Slow mornings are all ages. Guided walks welcome children aged 6+. Private evenings and the Rift Valley day are adults-only by default; tell us if you'd like to make an exception.",
  },
];

export default function Experiences() {
  useDocumentTitle("Experiences");
  const [topic, setTopic] = useState(null);

  return (
    <>
      <PageHero title={<>Days worth <em>remembering.</em></>}>
        <p className="lede">
          Mornings on the escarpment, long lunches by the pool, fire-cooked dinners under the acacias — every day here moves at its own quiet pace.
        </p>
        <div className="hero-actions">
          <Button to="/availability" arrow>Book your room</Button>
          <Button variant="outline" onClick={() => setTopic({ kind: "experience", title: "Experiences at The Stillhouse" })}>Enquire about experiences</Button>
        </div>
      </PageHero>

      <div className="container">
        <Media photo={IMAGES.expHero} ratio="21 / 9" parallax sizes="100vw" className="wide-image" priority />
      </div>

      <section className="section bg-parchment" aria-labelledby="included-title">
        <div className="container">
          <p className="eyebrow eyebrow--olive">Included in every stay</p>
          <h2 id="included-title" className="h-lg">The house works for you.</h2>
          <ul className="exp-includes-grid" data-reveal-group>
            {INCLUSIONS.map((inc) => (
              <li key={inc.title} className="exp-includes-grid__item">
                <h3 className="h-sm">{inc.title}</h3>
                <p className="body">{inc.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
        </div>
      </section>

      <section className="section bg-ink on-dark" aria-labelledby="practical-title">
        <div className="container">
          <p className="eyebrow eyebrow--terra">Practical</p>
          <h2 id="practical-title" className="h-lg">How the days fit together.</h2>
          <div className="exp-practical-grid" data-reveal-group>
            {PRACTICAL.map((p) => (
              <div key={p.label} className="exp-practical-grid__item">
                <p className="meta">{p.label}</p>
                <p className="body">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="small exp-practical-note">
            Every experience is subject to weather and the guide's judgment on the day. If something isn't right, we'll move it or refund it — that's the house's word, not ours alone.
          </p>
        </div>
      </section>

      <ClosingCta title="Days like these begin with one click." cta="Book your room" />
      <EnquiryDialog topic={topic} onClose={() => setTopic(null)} />
    </>
  );
}
