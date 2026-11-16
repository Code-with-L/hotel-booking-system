/**
 * Room catalogue — imagery and copy for the public site.
 * Rates, availability and inventory are computed by the backend; seeded prices match the live rate card.
 */
import { IMAGES } from "./images.js";

/** Compute sleeping capacity from a beds list. King/queen/double = 2, single = 1. Never type capacity by hand. */
export const BED_CAPACITY = { king: 2, queen: 2, double: 2, single: 1 };
export const capacityOf = (beds) => beds.reduce((sum, bed) => sum + (BED_CAPACITY[bed.type] || 0) * bed.count, 0);

export const AMENITIES = [
  { id: "bed", label: "King-size bed", icon: "BedDouble" },
  { id: "terrace", label: "Private terrace", icon: "Trees" },
  { id: "shower", label: "Rainfall shower", icon: "ShowerHead" },
  { id: "climate", label: "Climate control", icon: "Thermometer" },
  { id: "wifi", label: "Wi-Fi", icon: "Wifi" },
  { id: "refreshments", label: "In-room refreshments", icon: "Coffee" },
  { id: "workspace", label: "Workspace", icon: "Laptop" },
  { id: "bath", label: "Natural bath products", icon: "Leaf" },
];

export const RATE_PLANS = [
  {
    id: "flexible",
    name: "Flexible rate",
    multiplier: 1,
    summary: "Change dates or cancel without charge up to 7 days before arrival.",
    cancellation:
      "Free cancellation up to 7 days before arrival. Within 7 days, the first night will be charged.",
    prepayment: "Payable at the property or as per your confirmation.",
  },
  {
    id: "advance",
    name: "Advance purchase rate",
    multiplier: 0.88,
    summary: "12% below the flexible rate. Booked at least 21 days ahead, non-refundable.",
    cancellation:
      "Non-refundable and non-changeable once confirmed. Must be booked at least 21 days before arrival.",
    prepayment: "Payable at the property or as per your confirmation.",
  },
];

const RAW_ROOMS = [
  {
    slug: "garden-room",
    number: "01",
    name: "The Garden Room",
    tagline: "Low, quiet and open to the trees.",
    summary:
      "A ground-level room that opens through full-height glass onto its own planted terrace. Timber overhead, stone underfoot, linen everywhere in between.",
    description: [
      "The Garden Room is where the property is most intimate. Set among established indigenous planting, its timber ceiling and pale stone walls hold the daylight softly, and the terrace doors slide fully open to the garden.",
      "Furnishing is deliberately reduced: a low king-size bed dressed in natural linen, a workspace by the window, and a bathroom finished in the same stone as the paths outside.",
    ],
    size: 42,
    beds: [{ type: "king", count: 1 }],
    bedLabel: "One king-size bed",
    view: "Garden and acacia canopy",
    fromPrice: 28000,
    unitCount: 12,
    hero: IMAGES.gardenHero,
    gallery: [IMAGES.gardenHero, IMAGES.gardenA, IMAGES.gardenB, IMAGES.gardenC, IMAGES.gardenD],
    amenities: ["bed", "terrace", "shower", "climate", "wifi", "refreshments", "workspace", "bath"],
    features: [
      "Full-height sliding glass onto a planted private terrace",
      "Timber ceiling and lime-washed stone walls",
      "Bathroom with freestanding stone basin",
      "Garden outlook from bed",
    ],
  },
  {
    slug: "garden-twin",
    number: "02",
    name: "The Garden Twin",
    tagline: "Two queens, one garden.",
    summary:
      "The Garden Room's wider sibling. Two queen beds in the same planted setting, breathing room in place of austerity.",
    description: [
      "The Garden Twin keeps the Garden Room's low ceiling, pale stone and generous glass — but splits the single bed in two. Two queen beds face each other across a quiet stretch of timber floor.",
      "Ideal for families or friends travelling together: one room, two real beds, the same full-height terrace doors opening to the garden.",
    ],
    size: 46,
    beds: [{ type: "queen", count: 2 }],
    bedLabel: "Two queen beds",
    view: "Garden and acacia canopy",
    fromPrice: 34000,
    unitCount: 2,
    hero: IMAGES.gardenA,
    gallery: [IMAGES.gardenA, IMAGES.gardenHero, IMAGES.gardenB, IMAGES.gardenC, IMAGES.gardenD],
    amenities: ["bed", "terrace", "shower", "climate", "wifi", "refreshments", "workspace", "bath"],
    features: [
      "Two queen beds — sleeps four",
      "Full-height sliding glass onto a private terrace",
      "More space for luggage, chairs and slow mornings",
      "Garden outlook from both beds",
    ],
  },
  {
    slug: "valley-suite",
    number: "03",
    name: "The Valley Suite",
    tagline: "A long view, held at a distance.",
    summary:
      "Raised above the garden level with a skylit bedroom, a separate sitting area and a terrace oriented toward the escarpment.",
    description: [
      "The Valley Suite is organised around its view. The bed sits square to a wall of glass, and a skylight draws a slow line of light across the room as the day moves.",
      "A separate sitting area and a generous terrace give the suite the feeling of a small private house — somewhere to stay in, as much as somewhere to sleep.",
    ],
    size: 68,
    beds: [{ type: "king", count: 1 }],
    bedLabel: "One king-size bed",
    view: "Rift Valley escarpment",
    fromPrice: 42000,
    unitCount: 7,
    hero: IMAGES.valleyHero,
    gallery: [IMAGES.valleyHero, IMAGES.valleyA, IMAGES.valleyB, IMAGES.valleyC, IMAGES.valleyD],
    amenities: ["bed", "terrace", "shower", "climate", "wifi", "refreshments", "workspace", "bath"],
    features: [
      "Skylit bedroom with a wall of glass toward the valley",
      "Separate sitting area",
      "Extended terrace with outdoor seating",
      "Elevated position above the garden level",
    ],
  },
  {
    slug: "valley-cottage",
    number: "04",
    name: "The Valley Cottage",
    tagline: "The valley, its own address.",
    summary:
      "The Valley Suite's generous sibling. Three double beds under a skylit roof, a sitting room, and a terrace that belongs entirely to you — sleeps six.",
    description: [
      "The Valley Cottage takes everything the Valley Suite is and scales it honestly: three double beds, a dedicated sitting area, and the same escarpment outlook, from a freestanding cottage set slightly apart from the main roofline.",
      "A natural fit for families or small groups travelling together — one booking, three beds, breakfast delivered to the terrace, evenings at the firepit outside.",
    ],
    size: 82,
    beds: [{ type: "double", count: 3 }],
    bedLabel: "Three double beds",
    view: "Rift Valley escarpment",
    fromPrice: 48000,
    unitCount: 2,
    hero: IMAGES.valleyA,
    gallery: [IMAGES.valleyA, IMAGES.valleyHero, IMAGES.valleyB, IMAGES.valleyC, IMAGES.valleyD],
    amenities: ["bed", "terrace", "shower", "climate", "wifi", "refreshments", "workspace", "bath"],
    features: [
      "Three double beds — sleeps six",
      "Freestanding cottage with the same escarpment outlook",
      "Separate sitting area and private firepit",
      "Plush workspace for guests working from the valley",
    ],
  },
  {
    slug: "signature-retreat",
    number: "05",
    name: "The Signature Retreat",
    tagline: "The whole horizon, entirely to yourself.",
    summary:
      "The property's largest expression: a freestanding retreat with a soaking tub, a deep terrace and the widest outlook across the valley.",
    description: [
      "The Signature Retreat stands slightly apart from the rest of the property. Its plan is simple — a bedroom, a bathing room and a deep terrace — but every dimension is generous, and every opening is placed toward the landscape.",
      "A soaking tub sits beside the glass, so the valley is part of the evening ritual. Breakfast arrives quietly and is taken wherever the light is best.",
    ],
    size: 96,
    beds: [{ type: "king", count: 1 }],
    bedLabel: "One king-size bed",
    view: "Widest valley outlook on the property",
    fromPrice: 65000,
    unitCount: 5,
    hero: IMAGES.signatureHero,
    gallery: [IMAGES.signatureHero, IMAGES.signatureA, IMAGES.signatureB, IMAGES.signatureC, IMAGES.signatureD],
    amenities: ["bed", "terrace", "shower", "climate", "wifi", "refreshments", "workspace", "bath"],
    features: [
      "Freestanding soaking tub beside the glass",
      "Deep private terrace with the widest outlook",
      "Set slightly apart for added privacy",
      "Bedroom, bathing room and living space in one plan",
    ],
  },
];

export const ROOMS = RAW_ROOMS.map((r) => {
  const capacity = capacityOf(r.beds);
  return { ...r, capacity, occupancy: { adults: capacity, label: `${capacity} adults` } };
});

/** Largest sleeping capacity of any single room in the catalogue — the upper bound for a one-room party. */
export const MAX_ROOM_CAPACITY = Math.max(...ROOMS.map((r) => r.capacity));

export const getRoom = (slug) => ROOMS.find((r) => r.slug === slug);
export const getRatePlan = (id) => RATE_PLANS.find((r) => r.id === id);
export const getAmenity = (id) => AMENITIES.find((a) => a.id === id);

