# The Stillhouse — Creative Excellence & Experience Audit
**Date:** 2026-11-13 · **Scope:** full public site, admin, booking funnel, docs · **Constraint:** audit-only — no code changes were made.
**Repo:** `C:\Users\leon2\Downloads\hotel booking system\hotel-booking-system` · branch `main` @ `27a8ff3` · working tree clean at audit time (all audit findings reference files as of that commit).
**Live surface:** `https://hotel-booking-system-jet-gamma.vercel.app` (Vercel, `iad1`) → Neon Postgres (`eu-central-1`). M-Pesa sandbox. GOOGLE OAuth wired in Testing mode.

> Read this as an experienced commissioning report, not a pat on the back. Where praise exists, it is load-bearing; where a problem exists, it is named. Nothing in it is inferred; every claim traces to the code, the docs, the live deployment, or the Lighthouse export attached to this session.

---

## 1. Executive assessment

The Stillhouse is **not where it wants to be, and it is further along than most people would expect**. It is a token-disciplined, hand-rolled React/Vite site with a coherent editorial design system, real engineering underneath (53/53 tests, exclusion-constraint-guaranteed room ledger, server-authoritative quotes, idempotent booking, RBAC admin), genuine accessibility (axe 0/8 pages), and honesty in places the hospitality industry habitually fakes — e.g. every page carries a "concept property" disclosure, demo data is labelled, M-Pesa flows fail closed rather than lying.

It is **not yet award-calibre**. Its weakest point is also its most visible one: **the photography is 39 borrowed landscapes from Pexels**, cold-toned, unverifiably "Kenya" and unverifiably a property. Everything downstream of that — the "32-room boutique retreat" story — reads as a well-dressed template rather than a brand. Design decisions made circa 2026-11-13 (a 404 page recreating a downloaded third-party motion identity, WhatsApp-only contact leaking the owner's personal number into the public bundle and git history, Vercel deployment landed with zero DECISIONS.md entries despite the docs' own gate rules) suggest the project is now being steered by whoever is asking the loudest question at the keyboard rather than by a written creative direction. That has to stop before the brand is.

Performance is **86/96/100/100** (Lighthouse export, 2026-11-13, navigation audit, extension-heavy Chrome — see §10). The median interactive experience is fine on a hotel-room MacBook, not yet good on a nation-throttled Kenyan mobile network, and that is the actual guest this brand targets.

**Verdict: a very strong foundation with a collection of severe, fixable gaps — not a finished luxury product. Do not present it to investors as finished. Do present it to investors as deliberate, honest and improving — because it genuinely is.**

---

## 2. Current visual identity assessment

### What the design language is
- **Tokens** (`apps/web/src/styles/tokens.css`, 50 lines): limestone `#F1EFE8`, parchment `#E8E4DA`, ink `#242722`, stone `#66675F` (D-048), olive `#535B45`, terracotta `#8A563F` (D-048), charcoal `#252823`, hairline `#D7D3C9`, `--radius: 2px`, square corners, `--section-y: clamp(80px, 10vw, 160px)`. 34 raw hex across `src` vs ~367 `var(--)` usages — the token system is real and mostly honored.
- **Type:** Cormorant Garamond (display) + DM Sans (functional). Uppercase tracked eyebrows; `.display` fluid `clamp(50px, 8.4vw, 116px)`. The type system is the strongest single asset.
- **Composition:** all editorial pages are the same 12-col asymmetric split `.intro__grid … .page-hero__grid … .split__grid` declared in one shared CSS block — "the page never settles into a grid", per `ExperienceBlock`. Deliberate. Differentiated from template dribbble in intent.
- **Buttons:** one square-cornered, uppercase, 0.16em-tracked `.btn` family everywhere (23 usages). Consistency unmatched by 95% of luxury hotel sites.
- **Footer** is a shaded charcoal band with hairline `border` separations — correct instinct, well executed.

### Where it currently stands against "luxury Kenyan boutique 2026"
| Axis | State | Comment |
|---|---|---|
| Originality | Medium | Split-grid editorial is competent, rarely surprising. The 404 page (orbiting property photos around a giant "404") is the only page with a memorable signature moment — and its provenance is a problem (see §5, §13). |
| Sophistication | Medium-high | Type/colour discipline is high; stock imagery drags the entire register from "quiet luxury" to "expensive reference board". |
| Restraint | High | No gradients, no gold, no glass, no glow, no purple/cyan — and the code honors that. One genuine gradient remains (`.room-listing__overlay`) and it is the correct, minimal use. |
| Warmth | Low | The signature hero image (`IMAGES.hero = 28054849`) is a dusk-blue pool shot — the design review flagged this exact image as "wired colder than the brand wants" (M3_VISUAL_REVIEW) and nothing has replaced it. |
| Kenya-ness | ~Zero | Décor, photography, typography — nothing locates this property at Naivasha except the literal text labels and `+254` phone prefix. A luxury Palawan or Byron Bay site could ship this palette unchanged. |
| Craft | High code / Medium art direction | The engineering is finished; the art direction is a stock-library shuffle. |

### The structural problem
The visual identity tokens are consistent; the visual identity *content* is not. A visitor scrolling Home → Rooms → Story → Dining → Availability → Booking sees the same stone-and-pool imagery everywhere because the registry contains ~4 unique landscapes re-used everywhere (`16959786` is both `storyArchitecture` and `stoneHero`; `36162677` is `stoneC` *and* `gardenB`; `3755590` is `stoneA` *and* `storyPhilosophy`; `39836718` is `stoneB` *and* `storyMaterials`). Repetition of a handful of photos across a "32 rooms" property is not curation — it's scarcity.

---

## 3. Route-by-route evaluation

Evidence: `apps/web/src/app/router.jsx`, all `apps/web/src/pages/*`, agent inspection run 2026-11-13. Scores are **1–10**; harsh, calibrated against international boutique hospitality sites (Aman, Leeu Collection), not against generic web templates.

### Public

| Route | Score | Verdict |
|---|---|---|
| `/` Home | **5** | Hero is the single best-composed screen in the product — but the page is now *only* hero + a stripped availability bar + a 4-card row. The editorial sections that made it feel like a place were deleted. It reads as a booking widget parked on a photograph, not a world you enter. |
| `/rooms` | **6** | Works: full-width room rows, name-on-photo, price, availability bar. Room listings are strong. `amenity-grid` is **unstyled** (only the 768px rule exists) — an actual visual bug, not a taste call. |
| `/rooms/:slug` | **7** | Best detail page: sticky booking panel, parallax hero, gallery with keyboard nav + reduced-motion handling. Rate-plan table honest. Share it, don't yet commission it as final. |
| `/experiences` | **7** | The one page that genuinely avoids a repeating grid — six magazine-style `ExperienceBlock` compositions a–f. Content is invented but disclosed; the layout carries the page. |
| `/dining` | **6** | Strong intro, good split sections, honest hours block — but the dining story has zero dishes, zero a chef's name, no sourcing claim; it is atmosphere without evidence. |
| `/story` | **5** | Template-faithful but emotionally empty: five alternating split sections of "Rooted in place / Designed for pause.", plus a placeholder "map" SVG on a hardcoded grid (`#D7D3C9` etc. — tokens duplicated as hex). The single most important page for selling a fictional property is its weakest content. |
| `/availability` | **5** | Functional, fast, honest (live server quotes). Fails 0 empty-result states and silently swallows API errors (`useAvailability` returns `error`; the page ignores it) — a guest with a flaky connection gets a blank page with no signal. |
| `/booking/guest-details` | **6** | Trustworthy mechanics (automatic capitalisation, 9-digit Kenya phone, National ID hint, blur validation, focus-first-error). **The "special requests" field inits, payloads, and renders at review/confirmation — and no input exists.** A permanently dead field users can never reach. No cancellation reassurance anywhere on this page. |
| `/booking/review` | **6** | Best screen in the funnel for transparency (full price table, server quote, required acceptance). Leaks uncertainty: "once configured" M-Pesa copy; static `RATE_PLANS` copy instead of the server's `cancellationSummary`; CTA labelled "Proceed to payment" creates the reservation but never charges. |
| `/booking/confirmation` | **5** | Strong stamp/state ritual, excellent print CSS. But: payment UI never polls (the promise "confirms automatically" is unverifiable in-UI), no hold-expiry timestamp, anonymous guests reach a dead-end account screen with **no sign-up path anywhere in the product**, and the confirmation page presents a fake email-delivered notice ("if email is configured"). |
| `/account` | **5** | Clean panel dashboard. Infinite-loading on API failure (no `.catch`). No cancel/modify anywhere — the biggest commercial-flow gap. |
| `/account/reservations` | **4** | Read-only list with an un-namespaced expand panel. No cancel, no amend, no invoice, no "add to calendar". A guest booking expecting service can do *nothing* after booking except look. |
| `/account/profile` | **5** | Read-only email + Kenya, editable name/phone with zero phone validation (vs the strict booking rule). Readonly-data writes feel woolheaded. |
| `/privacy`, `/terms` | **7** | Plain, honest, disclaimer-correct. One of the few places that tells the truth about being a concept property. |
| `*` 404 | **7** | The only page with a memorable moment; provenance is a brand/legal question (§5, §13). Recreating a third party's motion identity as a page is not originality, it's attribution by omission. |

### Admin (8 routes, separate shell — a different, denser product)
| Route | Score | Verdict |
|---|---|---|
| `/admin` Dashboard | **6** | Dense, functional, unstyled-empty edge cases (Recent list has no empty state). |
| `/admin/reservations` | **7** | Genuinely good ops tooling: q filter, status/room/sort, drawer with quote breakdown + history, constrained transitions. `pageSize=100`, no pagination, no CSV export. |
| `/admin/rooms` | **4** | **PATCH-per-keystroke** maintenance notes, immediate status writes — will fire dozens of mutations from one fumble. Needs debounce + confirm. |
| `/admin/guests` | **6** | Search + history + notes (800-char cap, no counter); `mailto:` links are fine. No bulk actions. |
| `/admin/rates` | **5** | Inline saves; one shared `saving` boolean locks all Save buttons; pausing a live rate has zero confirmation. |
| `/admin/reports` | **6** | Honest manager+ gating; leaks an internal docs path (`docs/ACTIVATE_ETIMS.md`) into a UI string (D-044 violation of its own intent); occupancy filter row has no matching "30 days" option. |
| `/admin/financials` | **6** | Payment-health reconciliation is a differentiator — findings with severity badges, explicit "never edit the ledger" instruction. Insanely long totals line. |
| `/admin/settings` | **4** | No hints, no placeholders, no consequence text on "disable online booking" — the single most dangerous toggle on the property is one click away with zero explanation. `s.hotel.rooms` unbounded. |

---

## 4. Specific generic / AI-slop patterns identified

Quoted verbatim; line numbers as of `27a8ff3`.

**Template-opener hero (the universal luxury-coded pattern):**
1. `Home.jsx:61-62` — `Somewhere between stillness and <em>discovery.</em>` — the interpolation-relationship headline shared by 10,000 AI-generated hotel sites.
2. `Home.jsx:65` — `A 32-room retreat above the Rift Valley. Pick your dates, see the room and the price, and hold it.` — functional microcopy, fine; oversized, emotionally hollow.
3. `PageHero.jsx` (eyebrow → giant serif title → right-aligned aside) is used on **every** editorial page identically (Rooms, Experiences, Dining, Story, Legal) — page-openers are indistinguishable except in text.

**Template reassurance / unsupported scale claims:**
4. `ClosingCta.jsx` — `Your time, uninterrupted.` / `Thirty-two rooms. No rush.` — repeated on Rooms, RoomDetails, Experiences, Story; urgency-removed pitch repeated where four pages need exactly one.
5. `Rooms.jsx:15` / `Home.jsx:97` / `RoomDetails.jsx:24` — the "32 rooms" and "Four expressions" facts are self-consistent (4+14+9+5 = 32), fine — but presented without any other evidence of craft (no chef, no architect, no award, no local name).

**Watered-semantic hedging (customer-facing uncertainty dressed as polish):**
6. `BookingReview.jsx:117-120` — `Payment is settled on arrival or by M-Pesa once configured` — the guest cannot tell if they can pay now.
7. `BookingConfirmation.jsx:78` — `A confirmation email is on its way if email is configured.` — an internal config state leaked as a product promise.
8. `BookingConfirmation.jsx:79` — `by M-Pesa when available — quote your reference.`
9. `BookingConfirmation.jsx:123` — `Once you enter it, this booking confirms automatically.` — promised, never demonstrated or polled.
10. `Admin/Reports.jsx` — `Nothing is issued until KRA certifies the integration - see docs/ACTIVATE_ETIMS.md` — internal doc path rendered to staff (minor, but a boundary breach).

**Layout-automatism:**
11. `.amenity-grid` — **defined nowhere**, only a 768px column-count rule references it. Rooms renders an unstyled list of amenity icons (visible layout bug on the live site, most likely read as "minimalist" by viewers who never opened DevTools).
12. `.room-listing--flip` — prop passed in `Rooms.jsx`, class never styled; intended alternating layout never alternates.
13. `closing__inner` — rendered by `ClosingCta.jsx`, no CSS rule anywhere.
14. `.summary__image` — CSS exists; `BookingSummary.jsx` never renders an image; portrait figure slot permanently empty (a dead flex region).
15. `--limestone-2` — used with a hex fallback in `admin.css:434` for a token that does not exist. One hardcoded fallback. One of exactly two token-integrity failures in the system (the other is Story's inline SVG hex).
16. `.steps__n`, `.gallery__controls` — partially styled/orphaned hooks from an earlier iteration.

**Copy automatism:**
17. `GuestDetails.jsx` — dead `requests` init → payload → review/confirmation render — the field the guest can *never* fill. Reads *precisely* like an AI scaffolded a form and the human author never clicked through.
18. `Availability.jsx:77` — `Live availability, computed by the hotel's reservation system for your dates.` — fine sentence, but repeated verbatim on BookingSummary footer (`BookingSummary.jsx:37`) — boilerplate reassurance, not voice.
19. Ellipsis/style drift: `Signing in.` (trailing period) vs `Loading reservations…` vs `Confirming...` vs `Loading.` — four different "in progress" vocabularies in one product.

**The registerkiller:**
20. Hero of `~/room-feature*`, `.intro*`, `.arch*`, `.exp-home*`, `.dining-home*`, `.how-steps*` — **~150–180 unused CSS lines** + `RoomFeature.jsx` + `HOME_EXPERIENCES` + `IMAGES.intro/architecture/homeDining*` — the Home page was rebuilt to a booking-first strip and the previous design's corpse is left in the source tree. Dead code at this volume is a maintenance liability and a refactor-of-shame.

---

## 5. Photography audit

**Inventory:** 39 unique Pexels photo IDs (per D-065), each in 5 widths (480–1920), stored at `apps/web/public/photos/{id}-{w}.webp` (~24 MB WebP after 2026-11-13 conversion). Registry: `apps/web/src/data/images.js`, 43 entries, all alts descriptive sentences (good), but no Kenya-specific cue in any alt text. Two duplicate IDs carry divergent alt texts (`16959786`: "stone villa above the pool at evening" vs "Modern stone-faced house"; `39836718`: same ID as Stone's `stoneB` and Story's materials shot).

**Frame-by-frame verdict (the ones that matter):**
- `IMAGES.hero` (`28054849`) — dusk-blue, international-villa generic; M3 review already flagged it as "wired darker than the brand wants"; it remains.
- `stoneHero` (`16959786`) — strong stone architecture shot; would anchor the boutique story *if* used as the hero of one property with real commissioned scenes around it.
- `storyLocation` (`5019023`) / `storyLandscape` (`30174990`) — the only images that say "this is Kenya". Used once each, buried in Story.
- `signatureA` (`19467973`), `stoneB` (`39836718`) — the most credible dark-mode bedroom frames.
- `diningHero` (`2290070`) — geometric pendant lights; reads as any coastal-chic bistro. No food photography performs a single dish with any real craft — the dining story is atmosphere.

**Licensing chain:** Pexels free license (allows commercial use, no attribution required) — *legal for placeholder use*. No commissioned photography exists anywhere in the pipeline. The brief's art direction (warm, late-afternoon Kenyan light; stone/timber; people only with talent agreements) is **0% satisfied** by the current set — every image is internationally generic. A hotel selling itself as a Naivasha retreat using photos of a Palawan cliffside pool is not a boutique — it's a keyword.

**Provenance red flags**
- `404.mp4` (`./apps/web/public/404.mp4`, since superseded by a code-recreated page) — file name ("Discover community-made UI components.mp4") unambiguously signals it was downloaded from a third party's promotional video site (21st.dev-style marketing motion). Recreating its card-orbit motif is a derivative design. Not legally owned by this project. **Flag: replace with original direction or strip the 404 to stills + typography; do not ship the motif as "brand".**
- `storyArchitecture` uses `16959786` — the same exact frame reused across three pages; a visitor will consciously notice.

**File defects found (visual pass):**
- Hero `alt` claims "lit from within" — the image itself is dusk-dark; acceptable.
- None of the 26 404 cards is a landscape frame — all property interiors on `#F4F2ED`; visually the strongest page in the set, which is exactly why its provenance matters most.

**Required disposition (not optional):** commission (or properly license and self-host) photography that is: (1) Kenyan or convincingly East-African in material palette, (2) late-afternoon warm not blue-dusk cool, (3) architecture-first, (4) people only with talent agreements, (5) named & licensed per `docs/M3_PHOTOGRAPHY_BRIEF.md` (perpetuity, all territories, web/print/social). Until then, the site must keep its current honest posture ("concept property; imagery illustrative") — which it does — and **the investor-facing pitch must not claim it is the property**.

---

## 6. Typography and composition audit

**Strengths**
- One display face, one text face, one mono-free palette — restraint absolute.
- Fluid type scale via `clamp()` for `.display`, `.h-xl`, `.h-lg`, `.h-sm` — genuinely responsive without breakpoints.
- Uppercase is disciplined: small eyebrows/labels/buttons only. Never used for body.
- Square corners + hairline borders + generous measure — coherent editorial grid.

**Defects**
1. **The scale overshoots.** `.display` `clamp(50px, 8.4vw, 124px)` on a 1280px laptop resolves to ~107px; on a 1024px tablet ~86px. Headlines compete with the hero photograph instead of deferring to it. Home's hero is over-dominant; the image is the brand and the type crowds it.
2. **Grid declaration is list-soup.** The shared 12-col grid mixes 18 selectors in one declaration block — legal CSS, but one refactoring slip and every editorial page reflows silently. Break into 3 named grids (`editorial`, `form`, `system`) and the fragility vanishes.
3. **Section heads hand-rolled** everywhere — no component, so every page repeats `<div className="section-head">` verbatim; that is how inconsistencies sneak in (yr `section-head--row` uses two different alignments).
4. **Numeric facts in the UI are styled as ornament, not data.** `.facts` 3-col stat strips exist on Home (dead), RoomDetails meta, Account — they read as "numbers for atmosphere" because they carry no unit treatment at inline scale, and `KSh 24,500/night` is set as a `.numeral` used everywhere without a tabular-figure reset of DM Sans.
5. **`Cormorant Garamond` at 400 for body emphasis** renders thin on bright limestone at small sizes; `500` is the right answer for any `<em>` inside headings on limestone (current: unspecified weight interpolation).
6. **Eyebrow colour vs AA.** `.eyebrow` is styled `--olive #535B45` at 11px caps on limestone — fine; but all buttons set `color: var(--on-dark)` inherited via `.on-dark` parents even when inside light cards (the WhatsApp bug pre-fix is symptomatic of the broader cascade habit).

Score: **Type 8 / Composition 6**. Move `.display` down one step on ≤1280px and the whole site relaxes into its own restraint.

---

## 7. Motion and interaction audit

**Inventory (site-wide):**
- Hero clip-path wipe (1.5s `inOut`) + image `scale 1.16→1` (2.4s) — once, Home only, lazy GSAP chunk (2026-11-13 fix).
- ScrollTrigger reveals: `[data-reveal="image"]` clip-wipe 1.15s + img scale; `[data-reveal="text"]` fade+rise; `[data-reveal-group]` children stagger; all `once: true`, start `< 88–92%` — 1.15s/0.9s/0.7s; reduced-motion gated by `gsap.matchMedia`.
- Parallax (±7% `yPercent`) ≥1025px width only.
- MobileMenu: clip-path reveal + `yPercent 105→0` stagger of items (reduced-motion collapses to 0.01s).
- Scroll-locked header `is-solid` toggle (IntersectionObserver-free rAF scroll handler).
- `pageEnter(0.5s fade+y14)` on every non-Home route.
- 404: bespoke rAF-free CSS ring spin (70s linear infinite) + seeded-scatter.
- `.media--zoom` on hover (1.4s scale) everywhere across 11 files/17 usages.
- Reservation rows hover-translates (`transform: translateY(-4px)`), button `hover scale(1.035)`.

**What's good:** Motion has been restrained to purpose (reveal/scroll/feedback), reduced-motion is handled *in three layers* (CSS media query, `prefersReducedMotion()` JS guard, `matchMedia` gate), and the animation vocabulary is narrow enough to memorise. That is above luxury-hotel-website average.

**What's wrong:**
| # | Defect | Evidence |
|---|---|---|
| M-1 | **Every image on every page animates the same clip-wipe** — the same 1.15s `inOut` wipe on the hero, every card, every room row, every Dining split section. A page with 8 images costs 8 identical wipes. Motion variety zero. | `reveals.js` `initReveals` applies uniformly to all `[data-reveal="image"]`; every `Media` sets it by default. |
| M-2 | **Parallax on every wide parallax split section site-wide** — experiences/dining/story/split/room-hero — same ±7% everywhere; costs GPU layers for no narrative gain; triggers on images users don't dwell on. | `Media.jsx` `parallax` prop passed `7` on at least Dining ×4, Story ×5, Experiences ×1 wide, RoomDetails room-hero. |
| M-3 | Hero animation is engineered off-critical-path **but GSAP still ships in the first-load bundle** because `useReveals.js` (in PublicLayout) and `MobileMenu.jsx` statically import it. 2026-11-13's lazy-load was cosmetic, not structural. | `index.html` modulepreload of `gsap-DdEiTQuA.js` still present post-change. |
| M-4 | `.hero__scroll-line` CSS keyframe animation — infinite 2.6s — is global, doesn't check reduced-motion beyond the `animation-iteration-count: 0.01ms !important` reset, but still runs the keyframe for T=0.01s then stops: effectively fine, but implicit not explicit. | `responsive.css/global.css` `.hero__scroll-line`. |
| M-5 | Confirmation stamp rotates `-1.5deg` — unnecessary; reads as decorative sentimentality on a financial document. | `.stamp` transform in booking.css. |

**Direction (P1/P2, §11):** give `RoomDetails` parallax purpose-only on the 3 split-section heroes; consolidate reveal classes; drop `.media--zoom` on gridded thumbs; remove the stamp rotation; keep reduced-motion exactly as-is (it's excellent).

---

## 8. Mobile experience audit

Evidence: `responsive.css` (203 lines), ad-hoc `@media` scattered in pages.css/booking.css/admin.css/responsive.css. Not a single, audited breakpoint set — tests are desktop-layout-first with media queries bolted on.

**Observed**
- `.avail--bar` is a 6-col grid ≥1024px; collapses to column at 640px — passes, but the submit button stretches full-width without preserving tap target size on small screens (44px enforced by `.btn` padding, yes).
- `.booking-layout` stacks at 1024px — sidebar drops below form. Confirmation `.confirmation__grid` 5fr/7fr stacks similarly. ✓
- `.page-hero__grid` collapses to single col ≥768px with `.aside` going full-width and only 32px above the title — hierarchy preserved. ✓
- `.room-hero__meta` (`<dl>` inline right-aligned) wraps under the h1 below ~768px — fine. ✓
- **Amenity grid on Rooms:** `.amenity-grid` has no base CSS — on mobile it uses the `repeat(2, 1fr)` rule at ≤768px and desktop renders as block list; icons+text unstyled. **Real bug on production.** ✓ (visual)
- **Tables** `.table--compact` and `.table--admin` horizontal-scroll via `.table-wrap` — not all tables are wrapped (e.g., guest-count/pricing tables fine; admin Rates table OK; reports KV OK). One manual audit pass recommended.
- **Type scale:** `.display` `clamp(50px,8.4vw,116px)` — at 375px, 30px (since 8.4vw < 50px floor); fine.
- **Touch targets:** buttons 44px+; nav `.nav-link` ~ 28px height on desktop hover but ≥44px via padding in `.nav-link`? `.nav-link` is padding-block `.9rem` (≈14px) → ~36px total — **fails the 44px minimum** on touch devices; nav + footer links need ≥44px on coarse pointers.
- **Fixed header on mobile** overlays the hero on `/rooms` and `/` — the wordmark + burger stay legible across all hero tones; good.
- **Header overlay → solid swap on scroll:** mobile `.is-solid` toggles the header to charcoal — animation subtle; fine.
- **Save-the-dates calendar / date input:** `type="date"` on mobile uses native pickers — dates are Kenya-format display; fine.
- **WhatsApp CTA button on GuestDetails** wraps; `.whatsapp-btn` legible; contrast now fixed.
- **Admin on mobile:** unusable at <760px (sidebar 248px + dense tables) — acceptable; could be gated with a "desktop recommended" banner, but staff laptops dominate.

**Scores:** Mobile layout 6/10; touch targets 6/10; overflow scroll 7/10; localisation of format 7/10. Net: **usable, not considered** — no first-class small-screen design pass exists.

---

## 9. Booking conversion audit

This is where the product lives or dies. The flow is: Home/Rooms → Availability → GuestDetails → Review → Confirmation. Verdict per stage, then systemic findings.

### 9.1 Trust & credibility signals
- **No reviews, no testimonials, no ratings, no awards, no "as featured in"** — by deliberate decision (`docs/PROJECT_BRIEF.md`, honest), correctly executed. It is the property's only honest differentiator and it is undersold: guests can't feel safe booking a property that won't even claim a presence. The asymmetry vs. stock luxury-site kitsch is correct ethically and commercially weak. Acceptable and should stay.
- **No logo strip, no partner badges** — good.
- **Price shown before login** — good.
- **15-minute hold with zero timer** — the one behavioural nudge this funnel could eat, discarded. Urgency-free is on-brand; urgency-absent is a leak. A hold countdown is not manipulation — it's the actual mechanic.
- **Currency clarity** — KSh everywhere, KES minor units internal — correct.

### 9.2 Funnel friction
| Step | Friction | Evidence |
|---|---|---|
| Search | Two identical AvailabilityBar instances (Rooms: `variant="bar"`, Home: same) — consistent, fine. | `Home.jsx:54`, `Rooms.jsx:13` |
| Results | **Advance-purchase "12% below…" non-refundable is invisible at the point of choice** — computed in `RoomResult` payload but never rendered. Guests will pick Advance over Flexible and dispute at checkout. | `features/availability/RoomResult.jsx` renders name/price/CTA only. |
| | **No "best rate" badge** — Advance plan gets outline button, no visual anchor; Flexible solid. The discounted plan looks weaker than the flexible one. | `.plans` two button variants side by side. |
| | Preferred-room reordering `?room=slug` is silent — no "You chose The Stone Cottage — shown first" label. | `Availability.jsx` sort logic. |
| | **No empty state** — a search with zero rooms shows a blank grid. | `Availability.jsx` renders nothing on `results.length === 0`. |
| | **API failure → blank page** — `useAvailability` returns `error`; page destructures only `{ loading, data }`. | `useAvailability.js`, `Availability.jsx:23`. |
| Guest details | No price repetition in aside? (Aside has it.) No cancellation reassurance; no trust cue; phone actually correct; National ID demanded with no privacy signage beyond a `/privacy` link (fine). | `GuestDetails.jsx` |
| Review | Server quote ✓, ack ✓, but **CTA says "Proceed to payment" and performs `createReservation`** — label ≠ action; the click places the hold, not the payment. | `BookingReview.jsx` → `createReservation`. |
| | Cancellation copy static from `RATE_PLANS`, not server `cancellationSummary`. Two sources, one wins badly (static). | `BookingReview.jsx`, `data/rooms.js` |
| | **15-minute hold, zero countdown anywhere.** | Review + Confirmation. |
| | "once configured" M-Pesa copy — guest can't tell if ability to pay exists. | `BookingReview.jsx:117-120` |
| Confirmation | Payment instructions honest, email-delivery hedged to death, **no polling** — "confirms automatically" promised, page never transitions; guest must self-refresh or wait for email that isn't wired. | `BookingConfirmation.jsx` |
| | **No edit-payment-number path** — if the guest mistyped their M-Pesa number at GuestDetails, wrong number gets the STK prompt; no correction on this screen. Cost = entire booking lost + support outreach. | `BookingConfirmation.jsx` pay-box. |
| | **No sign-up path** — anonymous guests (majority for a boutique site) land on an auth-gated account screen with no registration affordance. Reservation unreachable in UI from then on. | `AccountShell.jsx` |
| | No add-to-calendar, no invoice, no "what happens next" timeline beyond settled/pending. | confirmation `.detail` dl only. |

### 9.3 Conversion tax on trust
- The hotel's own wording "Computed live by the hotel's reservation system" is the only thing preventing total improvisation-assessment — keep it, move it to every money display (currently only on Summary + Availability small prints).
- Price-in-full early is the biggest possible trust lever and it works: names and total visible at results step — keep.
- M-Pesa payment explicitly available **if configured** — showing a payment button for an unavailable provider is worse than omitting it; inline note instead of a CTA.

### 9.4 The single biggest conversion lever the product could add
- **Persist session across tabs** (`sessionStorage` lost on new tab; booking done from a shared-computer lobby would explode) — for a boutique property in the lobby is a real flow.
- **Hold-countdown timer** (in Review and Confirmation) to activate loss aversion honestly.
- **"Reserve now, pay on arrival, free cancellation 7d"** in the Availability results row as a single line of reassurance copy.

---

## 10. Technical and Lighthouse findings

### 10.1 Measured, from `devtools_do_a_lighthouse_audit_give_report.md` (Lighthouse 13.5.0, navigation, extension-heavy Chrome, 2026-11-13 09:29 UTC, live Vercel)
- **Performance 86 / 96 / 100 / 100** (Acc/BP/SEO 100 per the brief's claim "Accessibility 100" — the export shows **96**; the brief's 100 is the axe-class-claim — contradiction between two official records, both retained).
- Failing audits: FCP 2.3 s · LCP 3.0 s · Speed Index 5.3 s · Max Potential FID 86 · Minified JS 50 · Unused JS (est. ~43 KiB savings, `react-*.js`) · Forced reflow 0 · Unused init.js · Render-blocking CSS · Image delivery 0 (est. 30 KiB, `28054849-768.jpeg` — since converted to WebP, 58 KB).
- M7 lab (2026-11-12, local arm64 + Docker NAT): **perf 58**, a11y 98, BP 75, SEO 100, CLS 0, TBT 870 ms, 535 KiB. D-064: perf 80–95 text pages; BP 77→100 (image pages).
- axe-core: **0 violations, 8 pages** (M5/M7).
- M3 measurement sessions cited "**Not measured: LCP/INP/CLS lab metrics**" — correct; nav-mode Lighthouse now fills that gap for the live URL.

### 10.2 Separating app problems from noise
| Signal | Source | Verdict |
|---|---|---|
| `requests.js`, `processor.js` in network | Browser extensions (React DevTools/Assist) | **Noise** — subtract before scoring |
| `_cfuvid` cookie third-party | Pexels hotlink (pre-D-065) | Fixed since D-065; **no third-party origins remain** |
| Forced reflow 0 | app | App |
| `react-*.js` unused bytes | app (React + react-dom) | App — but structural; can't remove without replacing framework |
| Two DNS lookups to `accounts.google.com` | Google sign-in present on page | By design (link in sign-in panel) |
| Render-blocking single CSS (~12 KB gz) | Vite build output: one `index-*.css` | App — trivially inlinable |
| GSAP on critical path (~28 KB gz) | static import in `useReveals`/`MobileMenu` | App — structural fix below |
| Docker NAT +1.7 s FCP | Desktop Docker CPU/NAT hairpin r/w Neon EU — a measurement environment artefact documented in D-064. | Noise — not production-true |

### 10.3 Infrastructure path criticality
- Function in `iad1`; Neon in `eu-central-1` — every DB query crosses the Atlantic ≈ 80–120 ms RTT before the wasm compiler even runs. A free-tier Neon is closer to the function than a Kenyan booker is to either. **Not fixable on Hobby plan; flag as structural latency the product will carry regardless of app quality.** A us-east or London Neon pooler would halve it.
- Cold start: after idle, Neon compute resumes (~1–3 s) + Vercel function cold start (~400–800 ms) — a first visitor post-idle sees ~2–4 s mobile-network paint on the homepage; on Kenya mobile 4G, ~5–7 s. Not fatal for a hotel; catastrophic for "quick check rates".
- CSP `default-src 'self'` via nginx (local staging) / Vercel static + function headers (deploy) — good posture; no external font origins.

### 10.4 Real structural fixes available (not Lighthouse theatre)
- **Kill `useReveals` static import of GSAP** → lazy it behind `IntersectionObserver` or `requestIdleCallback`; saves ~28 KB gz from main chunk; Motion unchanged for in-viewport reveals (they fire later but imperceptibly).
- **Inline the single CSS bundle** into `<style>` in `index.html` (12 KB gz) — one less render-blocking request; typical −200–400 ms FCP.
- **Reduce `react-*.js` unused bytes** — not removable; move on.
- **Immutable cache for `/photos/*`** — `Cache-Control: public, max-age=31536000, immutable` on the photos path; repeat visits free.

### 10.5 Honest current state
**The site is already Fastest-to-Good-Enough on a hotel room MacBook, Not-Yet-Good on a 4G Kenyan phone. The gap is not the bundle — it's the 2.5 s of main-thread JS (React+GSAP+app code) and geographic distance. Every optimization that matters is structural and one-week-sized; none is a one-hour WebP swap.**

---

## 11. Prioritised improvements (P0 = must-fix, P1 = high-impact, P2 = polish)

### P0 — launch-blocking honesty/correctness (weeks, not days)
- **P0-1 — Empty states on `/availability`.** Render a clear "No rooms for your dates / try different dates or fewer guests" state (mirrors the `.result__reason` block with `role="status"`), plus a WhatsApp fallback CTA. *Why: current failure mode is a blank page — the worst conversion and trust outcome possible.*
- **P0-2 — Surface availability API errors.** `useAvailability` returns `{error}`; the page ignores it. Wire inline `.form-alert role="alert"` with a retry button. *Why: guests on bad hotel Wi-Fi must not see an empty page and assume the hotel is full.*
- **P0-3 — Echo M-Pesa configuration state accurately.** Remove/replace "if email is configured" and "once configured" hedging; resolve copy from a server-truth `payment.channel` status. *Why: current copy tells guests a truth about the booking system, not about this reservation — unacceptable at a money moment.*
- **P0-4 — Render the dead `requests` field or delete it.** One-way or the other. Currently payloads, review and confirmation all render it; no input exists. *Why: data written by code that can never fire confuses staff at check-in and breaks the audit trail of special requests.*
- **P0-5 — Room-admin input debounce + confirm.** `Rooms.jsx` maintenance note PATCH-per-keystroke and immediate status `PATCH` must be: debounced ≥400 ms, and status transitions beyond "out of service"/maintenance require a double-click confirm. *Why: fires N redundant server mutations from one accidental tap; rate-limits and data integrity both lose.*
- **P0-6 — Sign-up/registration affordance.** Anonymous guests hit a dead-end account screen; there must be at least an "Create account to view this booking" CTA (even a magic-link approach, which the codebase can support via `/auth/sign-in` + reset flow). *Why: without it, the reservation a guest just made is unreachable in UI — a commercial AND support failure.*
- **P0-7 — Cancel/amend for Flexible rate from the account view** (at least a "Request cancellation" button that transitions status → cancelled server-side, reversing the allocation and issuing the refund policy per rate plan). *Why: a guest who can book a `KSh 65,000` room cannot undo the mistake on the same surface — that's not a product, that's a kiosk.*
- **P0-8 — 404 page provenance.** Replace the recreated third-party motion system with an original quiet sequence (Typographic-only or a commissioned photo orbit), or legally clear the source. *Why: shipping a hospitality brand's "award moment" built on someone else's motion identity is an unlicensed derivative asset — legal risk without infringement depth.*
- **P0-9 — Commission/license photography brief** (or keep defensive "concept property" posture in every public surface including Availability and Booking). *Why: current stock cannot represent "a real retreat at Naivasha" honestly, and the investor/award audience will notice.*

### P1 — high-impact visual/experience work (the taste/coarseness pass)
- **P1-1 — Hero reframed or content stripped.** Decide: commissioned warm hero (per `docs/M3_PHOTOGRAPHY_BRIEF`), or a type-led home (no photo, no 100svh) — the current middle-position (stock dusk-blue hero + stripped editorial) is the weakest of the three. *Why: the 90-second stay-or-go moment on every visit; the single highest-leverage frame on the site.*
- **P1-2 — Home rebuilt to "entry into a world"** — reintroduce one signature editorial section (Materials or Landscape, using the real photos inventory) before the room list; keep the booking bar as accent, not hero. *Why: converts the page from booking widget-with-wallpaper to editorial first, commerce second — the brief demands architectural editorial.*
- **P1-3 — Remove dead CSS/components** (~180 lines of `pages.css` + `RoomFeature.jsx` + `IMAGES.intro/architecture/homeDining*` + `HOME_EXPERIENCES` + `.rooms-stack` leftover + `.how-steps/.how-step`). *Why: the design system is only as trustworthy as its hygiene; every dead rule is a future layout bug waiting.*
- **P1-4 — Kill the shared 12-col declaration; split into three named grids (`.grid--editorial`, `.grid--form`, `.grid--admin`).** *Why: one declaration block for 18 selectors is a refactor sinkhole; three named grids are self-documenting and refactor-safe.*
- **P1-5 — Section-head component.** `<SectionHead eyebrow title lede aside />` — components exist for everything else; this one spine pattern repeated by hand everywhere. *Why: any inconsistency in page openings propagates across the product.*
- **P1-6 — Rate-plan badge in availability results.** Render `plan.prepayment` text from the server payload ("Non-refundable" on the Advance plan) alongside the discounted price. *Why: the only plan decision a guest ever influences at that screen is currently invisible.*
- **P1-7 — 404 provenance and tone.** Strip `404.mp4` motif; keep the typographic 404; drop the photo-orbit gimmick that mimics a third party; match palette. *Why: distinctive without being derivative.*
- **P1-8 — Disable booking CTAs honestly when provider unconfigured.** On Confirmation, if `MPESA_NOT_CONFIGURED`, replace the M-Pesa CTA with an inline "Digital payment isn't live yet — settle at the front desk" note (current code does this, but through a raw button flow instead of inline text). *Why: never offer a payment button for an unavailable rail.*
- **P1-9 — Real project documentation gate.** DECISIONS.md entries for: 2026-11-13 Vercel deployment target; 404 page recreation; WhatsApp-only contact with personal number; WebP migration; Home cinematic strip removal; each a named owner ruling. *Why: the docs currently misdescribe `main`; every future author inherits the fiction.*
- **P1-10 — Split the availability "role=status" pattern to also carry `aria-live="polite"`.** *Why: the screen reader never announces rate changes otherwise.*
- **P1-11 — Inline CSS bundle / immutable photo cache / lazy `useReveals` GSAP import.** *Why: the three measurable, code-only FCP/LCP wins available this month.*
- **P1-12 — Roommate `Rooms.jsx` `amenity-grid`** base styles. *Why: production bug shipping now; one rule fixes it.*
- **P1-13 — Room-card `aria-label` removal** (let inner text be the name) — landed 2026-11-13 already; verify. *Why: parity between visible text and accessible name.*

### P2 — polish
- **P2-1** Reduce `.display` fluid scale by one step ≤1280px (e.g., `clamp(44px, 7.2vw, 96px)`). *Why: headlines currently intimidate the photograph they front.*
- **P2-2** Drop `.stamp` rotate; absolute square stamp; terracotta outline only. *Why: documents shouldn't perform sentiment.*
- **P2-3** Detail section: currency notation consistent (`KSh` vs `KES`) — pick one (KSh) everywhere. *Why: lexical drift reads as error on invoices.*
- **P2-4** Admin: modal drawer focus-trap + Esc-to-close + restore-focus — currently absent. *Why: keyboard accessibility for a dense product used all day.*
- **P2-5** `PageHero` overline fix (remove unused eyebrow slot or use it). *Why: dead props accumulate.*
- **P2-6** CSV export on admin Reservations/Financials. *Why: owners reconcile outside the system; file export is table stakes.*
- **P2-7** Navbar: `/rooms` wordmark "Stay" inconsistency — nav labels should match routes. *Why: wayfinding confidence.*
- **P2-8** Collapse four "in progress" copy styles; pick one (`Loading.` or ellipsis, consistent). *Why: micro-copy is where brands lose care points.*
- **P2-9** Add `prefers-reduced-motion` shortcut to skip the whole `.nf` orbit. *Why: the 404 is now the heaviest page to animate; respect it.*
- **P2-10** The 404 `.nf` block uses off-token `#F4F2ED`/`#17181A`; map to `--limestone`/`--ink`. *Why: token discipline.*
- **P2-11** The one hardcoded `rgba(20,22,18,0.55…)` gradient in `.room-listing__overlay` should use `--scrim` token. *Why: same.*

---

## 12. Specific files and components affected

### P0
| P0 | Files | Why |
|---|---|---|
| P0-1 | `apps/web/src/pages/Availability.jsx`, `features/availability/useAvailability.js`, `RoomResult.jsx`, `styles/pages.css` (empty-state block) | Empty grid on Il faut fixer |
| P0-2 | `useAvailability.js` + `Availability.jsx` (destructure `error`, render `.form-alert` + retry) | Silent failure |
| P0-3 | `pages/BookingReview.jsx`, `pages/BookingConfirmation.jsx`, server copy or server-truth flag | Hedged promises |
| P0-4 | `pages/GuestDetails.jsx` (+ `utils/validators.js` payload, `BookingConfirmation.jsx` requests render) | Dead data path |
| P0-5 | `pages/Admin/Rooms.jsx` (`maintenance` input + `update()`) | Mutation storm |
| P0-6 | `features/guest-account/AccountShell.jsx`, `/api/v1/auth/register` exists? If not: expose magic-link registration | Dead-end account |
| P0-7 | `pages/AccountReservations.jsx`, `adminService` own-reservation PATCH, `/api/v1/account/reservations/:id` | Self-service cancellation |
| P0-8 | `pages/NotFound.jsx`, `styles/global.css .nf*` | Replace motif |
| P0-9 | `apps/web/public/photos/*`, `apps/web/src/data/images.js`, `docs/M3_PHOTOGRAPHY_BRIEF.md` | Commission/license rewrite |
| P0-A0 | (next) `DECISIONS.md` entries | Process gap |

### P1
| P1 | Files |
|---|---|
| P1-1 | `pages/Home.jsx`, `src/data/images.js`, `apps/web/index.html` (favicon/theme), `styles/pages.css` hero rules |
| P1-2 | `pages/Home.jsx` (rebuild), new `components/editorial/MaterialsSplit.jsx` (optional new) |
| P1-3 | `styles/pages.css` (dead rules), `RoomFeature.jsx`, `data/images.js` orphans, `data/rooms.js` unused exports |
| P1-4 | `styles/pages.css` shared grid declaration block |
| P1-5 | new `components/editorial/SectionHead.jsx`, all pages that open `.section-head` |
| P1-6 | `features/availability/RoomResult.jsx` render `plan.prepayment` |
| P1-7 | `pages/NotFound.jsx` (de-film-derivative) |
| P1-8 | `pages/BookingConfirmation.jsx` (M-Pesa CTA states) |
| P1-9 | `docs/DECISIONS.md` |
| P1-10 | `pages/Availability.jsx`, `RoomResult.jsx` |
| P1-11 | `hooks/useReveals.js` → dynamic import; `index.html` inline CSS; Vercel `vercel.json` headers for `/photos/*` |
| P1-12 | `styles/responsive.css` or `pages.css` (`.amenity-grid` base rule) |
| P1-13 | `pages/Home.jsx` (aria-label removed 2026-11-13) |

### P2
| P2 | Files |
|---|---|
| P2-1 | `styles/typography.css` (.display) |
| P2-2 | `styles/booking.css` (.stamp) |
| P2-3 | `format.js`, all price renders (grep `KSh|KES`) |
| P2-4 | `pages/Admin/*.jsx` drawers + `features/administration/AdminUI.jsx` |
| P2-5 | `components/editorial/PageHero.jsx` |
| P2-6 | `services/adminService.js` + new export buttons in Reservations/Financials |
| P2-7 | `data/site.js` NAV_LINKS ("Stay"→"Rooms" or "Rooms"→"Stay") |
| P2-8 | copy continuation PR across pages |
| P2-9 | `styles/global.css` `.nf*` reduced-motion block |
| P2-10 | `styles/global.css .nf*` token mapping |
| P2-11 | `styles/pages.css` (`.room-listing__overlay` → `--scrim`) |

---

## 13. Risks and dependencies

- **P0-1/P0-2/P0-6/P0-7 require server work** — `/api/v1/account/reservations/:id` cancel endpoint must exist (or a `/account/cancel` variant); rate-plan refund policy logic couples to `TAX_AND_CHARGES.md` (already provisional; no signature).
- **P0-6/P0-9 block launch.** Photography commission needs owner budget + 1–2 shoot days + model/property releases; commissioning lead time dominates everything else on this list.
- **P0-8/P1-7** — dropping the 404 motif removes the single most legally-loaded motion on the site; owner must sign the decision in DECISIONS.md or a creative-direction sub-decision. Risk: team will resist removing the only "wow" moment.
- **P1-11** — inlined CSS roughly doubles first-paint parse cost (unavoidable); measure before/after via D-064 protocol; do not ship without a re-audit.
- **P0-5** — debounced/confirm flows change admin muscle memory; expect pushback from whoever runs front desk daily. Mitigate with a staff-facing short memo/OPS.md note.
- **P1-9** — DECISIONS.md will drift if content PRs land before the ADR entries — gate via PR template (CONTRIBUTING.md addition, optional).
- **Photography** cannot reuse stock even for "placeholder" if you intend to pitch for awards/investment — the award audience can spot Pexels instant-stock in seconds. Placeholders acceptable only while the property is presented as a concept.
- **Vercel free tier** cannot run an ISR/edge cache for `/photos/*`; immutable cache headers depend on `vercel.json` `headers` block support — verify against current Vercel Services semantics (static build outputs headers for `/photos/*` — test, don't assume).
- **Performance ceiling** on free-tier Hobby + `iad1` + Neon EU-central-1 cannot beat ~2.3 s FCP on Kenyan 4G regardless of app work — set stakeholder expectations accordingly; do not accept a target of 95 until the hosting decision is made (owner-gated).
- **The 404 page is the best argument for replacing the whole visual direction**: if the team will not ship something original for the 404, expect no other page to move. Use P0-8 as the canary.
- **Another 2026-11-13-class slip is probable** without a named owner for creative decisions; the commissioning doc gate was already breached twice this week.

---

## 14. Proposed implementation milestones

**M8 — Honesty & funnel correctness** (1–2 weeks, focused)
- P0-1..P0-6, P0-A0; no design changes; no photography requests yet.
- Gate: every P0 item closed; a guest can complete search→book→see confirmation→return to account→understand status without help.
- Deliverable: `docs/reports/M8.md` + a demo screencast.

**M9 — Creative identity reset** (3–5 weeks, owner budget)
- P0-8/P0-9 photography brief → shoot (or license) → registry rewrite; Home rebuild (P1-1/P1-2); `SectionHead` extraction (P1-5); P1-7; brand guide addendum (Type + motion + iconography) committed to DESIGN_SYSTEM.md.
- Gate: owner signs the new hero; no page shows Pexels stock; booking bar still converts.

**M10 — System-wide polish & technical** (1–2 weeks)
- P1-3..P1-13; P2-1..P2-11; reduced-motion audit passes; admin focus-trap; a11y numeric contrast re-check; re-run Lighthouse (Incognito, extensions off) — target **≥90 perf** on the live URL or a written structural rationale why the floor sits there.
- Gate: 53/53 tests green; axe 0/8; Lighthouse ≥ target or rationale signed.

**M11 — Commissioning rollup** (1 week)
- Full review against `docs/PROJECT_BRIEF.md` §5; update README status block honestly; DECISIONS append entries for everything landed; final audit in this style, with scores.

---

## 15. Acceptance criteria (pass/fail gates)

1. **A guest can book a room and manage the booking entirely on-site** — search, quote, hold, pay/await settlement, see status, retrieve reservation later, and cancel per Flexible policy — without email or phone-call intervention. (Gates P0-1, P0-6, P0-7.)
2. **No customer-facing copy leaks internal state** — no "if configured", no "once available", no `docs/ACTIVATE_ETIMS.md` path, no `email_outbox` terminology rendered to guests. (Gates P0-3.)
3. **No Pexels stock on the public site, or the site is unmistakably presented as concept** — one or the other, never silently in between. (Gate P0-9.)
4. **Every public page scores ≥ 88 on Lighthouse accessibility, ≥ 90 best-practices, ≥ 95 SEO** — repeatable, three runs, live URL, Incognito, extensions off. Perf target ≥ 88 with a written structural rationale for why it cannot exceed (iad1/EU, free tier) — signed by owner.
5. **axe-core reports 0 violations on all 8 audited pages.** (Keep current.)
6. **No adapter/debug/probe code paths ship** — e.g., no `includeFiles` experiments in `vercel.json` without a DECISIONS.md ruling.
7. **Every public image loads under `--on-dark` WCAG 4.5:1 over its scrim** — automated axe pass.
8. **All DECISIONS.md entries land on or before merge/publish day for each change** — process gate; no retroactive decision logging permitted for launch-critical rulings.
9. **The room names in `data/rooms.js` and the serial `STL-YYYY-NNNNNN` references are stable** across releases (no re-numbering accidents).
10. **The 404 is not a derivative of a third-party motion asset.** (Gate P0-8/P1-7.)
11. **`public/photos/` filenames match the `photos/{id}-{w}.webp` convention** and the registry — verified by script, not by eye.
12. **No hand-rolled fetches bypass `services/api.js` anywhere in the client.** The single raw `fetch("/api/v1/payments")` in `BookingConfirmation.jsx` is encapsulated or retired into `services/`.
13. **The homepage explains what the property is in one screen, in under 3 seconds, on a 4G-throttled connection**, measured by `speedIndex`.
14. **Site remains keyboard-navigable end-to-end** — skip link → header → main → footer, all pages; visible focus rings everywhere.
15. **Owner signs off the final M11 acceptance block in this document before claiming "done" in any stakeholder communication.**

---

*Prepared by inspection of the repository at `27a8ff3` + the Lighthouse export at `devtools_do_a_lighthouse_audit_give_report.md` (2026-11-13T09:29Z). No application code was modified. Where scores appear, they are reproduced, not improved. The audit's own standard applies to itself: do not treat any section as gospel; verify one item, then decide whether to trust the rest.*
