/**
 * Centralised photography registry.
 * All imagery is self-hosted stock photography (Pexels, free license), staged in
 * public/photos/{id}-{width}.jpeg as a stand-in for a future commissioned shoot.
 * To ship commissioned photography, replace the files in public/photos/ and the
 * public/photos paths stay valid - this registry stays the single source of truth.
 * Each photo is { id, alt }; `photoUrl` builds a local sized path.
 */
const HOST = "/photos";

const FAMILY = [480, 768, 1280, 1600, 1920];
const nearest = (w) => FAMILY.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

export const photoUrl = (photo, width = 1600) => `${HOST}/${photo.id}-${nearest(width)}.webp`;

export const photoSrcSet = (photo, widths = FAMILY) =>
  widths.map((w) => `${HOST}/${photo.id}-${w}.webp ${w}w`).join(", ");

const p = (id, alt) => ({ id, alt });

export const IMAGES = {
  // Home
  hero: p(28054849, "Stone villa with a still pool at dusk, lit from within"),
  intro: p(27626185, "Contemporary house and pool looking out toward distant hills"),
  architecture: p(32208080, "Low modern hotel architecture set within green landscape"),
  homeDining: p(30420679, "A candlelit restaurant table among plants"),
  homeDiningDetail: p(24433378, "A table set for two with wine glasses and folded linen"),

  // Rooms - Stone Cottage
  stoneHero: p(16959786, "A stone villa above the lawn and a long pool at evening"),
  stoneA: p(3755590, "Crisp white linen and soft pillows"),
  stoneB: p(39836718, "Natural wood and woven textures in a quiet room"),
  stoneC: p(36162677, "Bed with white linen in soft morning light"),

  // Rooms - Garden Room
  gardenHero: p(36749692, "Bedroom with timber ceiling and glass doors onto greenery"),
  gardenA: p(39836703, "Neutral room with natural textures and soft daylight"),
  gardenB: p(36162677, "Bed with white linen in soft morning light"),
  gardenC: p(4210373, "Natural soap and folded grey towels on a stool"),
  gardenD: p(39836713, "Woven chair corner, detail of natural craft"),

  // Rooms — Valley Suite
  valleyHero: p(28054852, "Suite with skylight and a wide view beyond the glass"),
  valleyA: p(30808019, "Spacious bedroom with tall windows and a scenic outlook"),
  valleyB: p(27626174, "Large bed facing a long open view"),
  valleyC: p(24807124, "Terrace seating beside a softly lit pool"),
  valleyD: p(7745986, "Bright minimalist bedroom with pale walls"),

  // Rooms — Signature Retreat
  signatureHero: p(26859049, "Retreat bedroom with a soaking tub and balcony beyond"),
  signatureA: p(19467973, "Canopy bed with a broad view across the landscape"),
  signatureB: p(17217061, "Breakfast served in bed above a quiet valley"),
  signatureC: p(20975729, "Sun loungers beside an infinity pool at the edge of the terrace"),
  signatureD: p(8015809, "Simple bath essentials with eucalyptus"),

  // Experiences
  expHero: p(33640729, "Morning light moving through mist over a mountain landscape"),
  expValley: p(33315712, "Acacia trees against mountains and a bright lake"),
  expNature: p(4119901, "A walker on a ridge path at sunrise"),
  expWellness: p(4405006, "Wooden bath tray with a stone, prepared for a slow soak"),
  expPrivate: p(4451262, "A long table arranged with candles and plates"),
  expMornings: p(32166845, "A slow breakfast laid out in a quiet room"),
  expLocal: p(33720956, "Golden savanna at sunset with a single vehicle on the track"),

  // Dining
  diningHero: p(2290070, "Dining room with geometric pendant lights"),
  breakfast: p(8909320, "Berries and croissants on a tray at breakfast"),
  lunch: p(31742766, "A brunch spread with fresh orange and pastries"),
  dinner: p(35546716, "A plated dish finished with an edible flower"),
  seasonal: p(29259652, "A composed seasonal dish on a marble table"),
  diningEvening: p(36353801, "A quiet dining room in warm evening light"),

  // Story
  storyWide: p(9329794, "Misty mountains above a small lake"),
  storyLocation: p(5019023, "Green savanna with acacia trees under broad cloud"),
  storyArchitecture: p(16959786, "Modern stone-faced house, lawn and long pool"),
  storyMaterials: p(39836718, "Natural wood and woven textures in a quiet room"),
  storyLandscape: p(30174990, "A still lake at sunrise beneath misty mountains"),
  storyPhilosophy: p(3755590, "Crisp white linen and soft pillows"),
};
