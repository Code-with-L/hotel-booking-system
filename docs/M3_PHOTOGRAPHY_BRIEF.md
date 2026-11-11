# Photography Brief — THE STILLHOUSE

**Status:** Photography requirements prepared at M3 (2026-11-11). **No commissioned imagery exists.** All current photography is placeholder stock (Pexels). The site must not claim real property photography until a commissioned shoot is delivered and the registry (`apps/web/src/data/images.js`) is updated.

**Property:** fictional boutique retreat, 28 rooms, above the Great Rift Valley escarpment, Naivasha, Kenya. Tagline: "A quieter kind of extraordinary."

---

## 1. Art direction (binding)

- Architectural editorial: architecture first, people second (or never).
- Light: warm, directional, late afternoon / dawn. Avoid harsh midday and blue dusk grade (the current hero is a dusk image wired darker than the brand wants — a new, warmer hero is priority 1).
- Palette: limestone and natural stone; warm timber; natural linen; deep olive; dusty terracotta. Neutral, desaturated — nothing glossy, nothing neon, nothing golden-sprayed.
- Compositions: asymmetric editorial — off-center subject, intentional negative space, strong horizontal lines (escarpment), human scale implied by doors/beds/pools, not by posing people.
- No staged fake guests as faces-of-the-brand until a model/casting agreement exists.

## 2. Shot list

| # | Subject | Orientation | Composition / placement direction |
|---|---|---|---|
| 01 | **Hero: exterior at rest** — main villa elevation from the pool deck, warm light | Landscape 3:2, full-bleed | Off-center villa, horizon low; right side open for headline overlay (desktop) / lower-left (mobile). Replaces current hero |
| 02 | **Location: escarpment overlook** — valley floor + escarpment edge at dawn | Landscape 16:9 | Wide, minimal subjects; anchors "the setting" sections and `/story` |
| 03 | **Architecture detail** — stone wall meeting timber soffit | Portrait or square 4:5 | Material close-up; used in architectural split sections |
| 04 | **Garden Room** — hero of the type |Landscape 4:3 | Bed and full-height glass to garden; morning layer, linen undone naturally |
| 05 | **Garden Room terrace** — private terrace from inside, no people | Landscape 3:2 | Looking out-ward, interior framing |
| 06 | **Valley Suite skylight** — bed square to glass, Rift view beyond | Landscape 16:9 | Signature vantage; must carry the "view" claim in the room copy |
| 07 | **Signature Retreat soaking tub** — tub against glass, valley beyond | Landscape 4:3 | Evening warm interior; evening atmosphere, not night |
| 08 | **Bathroom detail** — stone basin/tap/soap | Square 1:1 | Material craft detail for room detail pages |
| 09 | **Dining table, The Table at Stillhouse** — set for two, candlelit | Landscape 3:2 | Natural linen, ceramic, wine; no faces needed; reserved |
| 10 | **Dining detail** — bread/coffee/hands reaching? — hands only, no faces | Square 1:1 | Editorial intimacy without model release complexity |
| 11 | **Arrival sequence** — gate, driveway, reception threshold | Landscape | Establishes "arrival as ritual" |
| 12 | **Garden/planting** — indigenous landscaping detail | Portrait 4:5 | Texture and place |
| 13 | **Pool/deck at golden hour** — still water, sun low | Landscape 3:2 (or 21:9 crop) | The closing-CTA image; replaces current closing hero crop |
| 14 | **Staff/hospitality (optional)** — hands, not faces | any | Only with signed release |
| 15 | **Exterior night asset** — warm interior glow from outside | Landscape | For seasonal/social campaign; not for home hero |

Each image ships in at least two crops: wide (hero/split) and card ratio (rooms grids, ~4:3).

## 3. File requirements

- Masters: 45–80 MP RAW, colour-managed to sRGB, delivered as high-quality JPEG (quality 8) + RAW originals archived.
- Exports: 640 / 1024 / 1600 / 2200 px widths via the same registry pattern already in `apps/web/src/data/images.js`.
- Naming: kebab-case, location + subject: `hero-exterior-dusk.jpg`, `room-garden-hero.jpg`.
- Alt text: one sentence per image stating what it shows (written for screen readers; registry already does this) — the commission must include alt descriptions per image.
- Licensing: contract must convey web/print/social usage to the fictional property's operator in perpetuity, all territories — or everything published is materially false (this property does not exist).

## 4. Placement plan (what gets swapped where)

Everything is centralised in `IMAGES` in `src/data/images.js` — swapping an entry re-propagates everywhere. Priority order:

1. `hero` (home + `/rooms` hero) — #01
2. `intro` + `architecture` (home intro, story) — #02, #03
3. `gardenHero/valleyHero/signatureHero` + gallery series (room pages) — #04–#08
4. `homeDining` + `dining.*` — #09, #10
5. `closing` (closing CTA band) — #13
6. `story.*` — #02, #11, #12

## 5. Honesty constraints (binding)

- The Stillhouse is fictional. Until real commissioned images exist, site copy/imagery remains "concept property" in legal pages; no fake reviews, no invented awards, no "as seen" badges.
- Placeholder stock may remain online only while the site is presented as the concept it is.
- Alt text must describe actual pixels — never describe a room that the photo does not show.
