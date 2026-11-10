/**
 * Editorial experiences — DEMONSTRATION CONTENT.
 * Programmes, durations and availability are illustrative.
 */
import { IMAGES } from "./images.js";

export const EXPERIENCES = [
  {
    id: "rift-valley",
    homeTitle: "The Rift Valley",
    title: "Discover the Rift Valley",
    category: "Landscape",
    duration: "Half day",
    image: IMAGES.expValley,
    text:
      "The escarpment, the lake and the long acacia plains are the reason the property exists. Time with a local guide begins at the edge of the site and moves outward at the pace of the conversation.",
  },
  {
    id: "nature",
    homeTitle: "Outdoor exploration",
    title: "Nature and outdoor exploration",
    category: "Outdoors",
    duration: "2–4 hours",
    image: IMAGES.expNature,
    text:
      "Early walks along ridge paths, unhurried cycling through the surrounding countryside, and quiet time by the water. Routes are shaped around season, light and how far you want to go.",
  },
  {
    id: "wellness",
    homeTitle: "Wellness and restoration",
    title: "Wellness and restoration",
    category: "Wellness",
    duration: "60–90 minutes",
    image: IMAGES.expWellness,
    text:
      "Treatments and rituals designed around rest rather than spectacle. Warm stone, natural oils, long silences. The emphasis is on arriving fully in the body, not on a menu of options.",
  },
  {
    id: "private",
    homeTitle: "Private dining",
    title: "Private experiences",
    category: "Private",
    duration: "Evening",
    image: IMAGES.expPrivate,
    text:
      "A table set where you choose — on a terrace, in the garden or beneath the trees — with a menu composed for the occasion. Enquire early; these evenings are arranged individually.",
  },
  {
    id: "mornings",
    title: "Slow mornings",
    category: "Rest",
    duration: "Unscheduled",
    image: IMAGES.expMornings,
    text:
      "Breakfast that waits for you rather than the reverse. Served in the restaurant, on your terrace or in bed, with no fixed hour to meet and nowhere you need to be afterwards.",
  },
  {
    id: "local",
    title: "Curated local discoveries",
    category: "Culture",
    duration: "Half or full day",
    image: IMAGES.expLocal,
    text:
      "Makers, growers and places worth the journey, chosen by people who live here. A short list, deliberately — so each visit has the space to be a real encounter.",
  },
];

export const HOME_EXPERIENCES = EXPERIENCES.slice(0, 4);
