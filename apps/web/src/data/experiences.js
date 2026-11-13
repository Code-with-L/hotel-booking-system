/** Experiences at The Stillhouse — curated programmes for guests. */
import { IMAGES } from "./images.js";

export const EXPERIENCES = [
  {
    id: "rift-valley",
    title: "Rift Valley escarpment tour",
    category: "Signature day",
    duration: "Half day · departs 06:30",
    price: "KSh 14,500 per person",
    image: IMAGES.expValley,
    text:
      "A private guide leads you from the gate to the escarpment rim, down through the acacia forest to the crater floor. Lake viewpoints, a shaded picnic lunch, and the silence of the Rift at its widest.",
    includes: ["Private guide and vehicle", "Lake-view picnic lunch", "All park and picnic fees", "Return transfer to the house"],
  },
  {
    id: "nature",
    title: "Nature and outdoor exploration",
    category: "Outdoors",
    duration: "2–4 hours · any morning",
    price: "Complimentary",
    image: IMAGES.expNature,
    text:
      "Guided walks along the ridge paths, unhurried cycling through the surrounding farmland, or a still hour by the water's edge. Routes change with the season and the light; tell us what the morning feels like and we'll shape one around you.",
    includes: ["Route map or guide on request", "Bicycles and helmets", "Drinking water and kikoi", "Early or late departures"],
  },
  {
    id: "wellness",
    title: "The Bath at Stillhouse",
    category: "Wellness",
    duration: "60–90 minutes",
    price: "From KSh 12,000",
    image: IMAGES.expWellness,
    text:
      "Warm-stone rituals and long, quiet soaks prepared each morning with ingredients from the property's own garden — aloe, lemongrass, cold-pressed shea. No menus, no music, no hurry: just a deep recalibration in stone, oil and steam.",
    includes: ["Aromatherapy or deep-tissue massage", "Eucalyptus steam room access", "Herbal infusions and fruit platter", "Private treatment garden"],
  },
  {
    id: "private",
    title: "Private evenings",
    category: "Private dining",
    duration: "Evening · by enquiry",
    price: "KSh 28,000 per couple",
    image: IMAGES.expPrivate,
    text:
      "A table set where you choose — on your terrace, under the acacias, or at the edge of the pool terrace. A menu written for the occasion, paired wines, and a kitchen that only ever cooks for one table.",
    includes: ["Six-course tasting menu", "Paired wines or non-alcoholic pairing", "Champagne at dusk", "Private sommelier service"],
  },
  {
    id: "mornings",
    title: "Slow mornings",
    category: "Rest",
    duration: "Unscheduled",
    price: "Inclusive",
    image: IMAGES.expMornings,
    text:
      "Breakfast carried to wherever you'd like it — your terrace, the garden, or simply in bed. Eggs to order, honeys from the neighbouring farm, hot coffee pressed on the stove. The only timings are the birds'.",
    includes: ["Terrace, garden or in-room breakfast", "Seasonal fruit and pastry basket", "Fresh-pressed juices", "Unhurried, whenever you wake"],
  },
  {
    id: "local",
    title: "Curated local discoveries",
    category: "Culture",
    duration: "Half / full day",
    price: "From KSh 9,500 per person",
    image: IMAGES.expLocal,
    text:
      "Makers, growers and quiet corners of Naivasha chosen by the people who live here — a flower farm at dawn, a farm-to-table lunch, a dairy tasting among the hills. Each trip is deliberately small, so every stop has room to breathe.",
    includes: ["Private driver-guide", "Farm, flower-farm or dairy visits", "Local lunch included", "Seasonal itineraries"],
  },
];

export const HOME_EXPERIENCES = EXPERIENCES.slice(0, 4);
