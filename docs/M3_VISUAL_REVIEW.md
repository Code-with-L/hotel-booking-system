# M3 Visual Review — THE STILLHOUSE

**Date:** 2026-11-11 · **Milestone:** M3 (luxury guest experience, motion, polish, photography readiness) · **Starting point:** `296ac98` (M2 complete) · **Method:** inspect existing work, preserve it, improve deliberately.

## 1. Original frontend structure

- React 19 + Vite 6 + JavaScript, plain CSS with design tokens (Cormorant Garamond display, DM Sans functional), GSAP + ScrollTrigger, `createBrowserRouter` route-level splitting.
- `src/animations/` — hero.js (hero choreography), reveals.js (ScrollTrigger clip-path/text reveals), navigation.js (solid-on-scroll + menu timeline), transitions.js (page enter), gsap.js (single registration point + `prefersReducedMotion()`).
- `src/hooks/useReveals.js` — attaches reveals per route with `gsap.context` cleanup + ScrollTrigger refresh on load; `src/hooks/useLockBodyScroll.js` for the menu.
- `src/components/layout/PublicLayout.jsx` — skip link, Header, Footer; pages lazy-loaded; admin pages async-wired to the live API from M2.
- Media handling already mature: `Media` with `aspect-ratio`, `srcset`, `loading`/`decoding`/`fetchPriority`; globals styles include `:focus-visible`, `aspect-ratio` reserved everywhere.
- The design system (M0 DESIGN_SYSTEM.md) — limestone, ink, olive, terracotta accents, square corners, hairlines, uppercase 11 px labels. **Untouched.**
- Booking flow preserved end-to-end (guest → review → held pending → confirmation → admin confirms → guest sees confirmed).

## 2. Baseline before M3 changes (measured, not asserted)

- API tests: 20/20. Playwright e2e: 3/3. Frontend build clean. Docker images build. (M2 verification.)
- Bundle: `dist/assets/index-*.js` 296.31 KB gzip 97.34 KB; `react` chunk 106.55 KB (35.85 gzip); `gsap` 70.90 KB (27.95 gzip) — measured from build output.
- Performance spot checks (M2 load test): availability 688 rps p50 55 ms.

## 3. Audit results & changes made

### 3.1 GSAP motion audit (what was already correct — kept, not rebuilt)
- Hero: `heroIntro()` — clip-path reveal → label → line-by-line headline → text → CTAs → cue → booking bar; `power2/3`, 0.5–2.4 s, `clearProps` so no inline transforms persist; **skipped entirely under `prefers-reduced-motion`** (returns null).
- Reveals: `initReveals()` — image clip-path + subtle scale-out, text rise (26 px), grouped stagger (0.11 s), parallax desktop-only (`data-parallax` within overflow-hidden parents), `once: true` triggers, `gsap.matchMedia()` skips motion for `no-preference` queries, mm.revert() cleanup, defensive kill of triggers whose roots unmount.
- `useReveals` + `PublicLayout`: `gsap.context` scoped, reverted on unmount; ScrollTrigger refresh on window load; `pageEnter` skipped on `/` and under reduced motion.
- Menu overlay: clip-path + staggered links; `onReverseComplete` sets `visibility: hidden`; `inert` when closed.

**Conclusion:** the architecture was already correct. M3 made surgical changes instead of rebuilding: see 3.2.

### 3.2 Changes implemented (file by file)
| File | Change | Why |
|---|---|---|
| `animations/navigation.js` | Removed dual scroll mechanism (ScrollTrigger.create **and** a scroll listener doing the same job); replaced with a single rAF-throttled passive scroll listener; no `ScrollTrigger` needed for a 40 px solid-toggle | Less machinery, same behaviour; no duplicate listeners; class toggle at most once per frame |
| `components/navigation/Header.jsx` | `menuTriggerRef` + `wasMenuOpen`; focus returns to the menu button when the menu closes | Keyboard users never lose their place; previously focus dropped to `<body>` |
| `components/navigation/MobileMenu.jsx` | `Tab`/`Shift+Tab` focus trap inside the open menu; focus moved to Close button on open; Esc closes; `inert`/`aria-hidden`/`aria-modal` retained | Keyboard users can't escape into the page behind an open menu; WCAG 2.4.3 |
| `styles/global.css` | `.btn:active` subtle press feedback (`translateY(1px) scale(0.99)`, 0.15 s ease); new `@media print` block printing only the confirmation content (chrome, steps, actions hidden; black on white) | Tactile honesty on CTAs; confirmation page genuinely prints like a folio |
| `README.md` | M3 documentation listed | Docs discoverability |
| `docs/M3_VISUAL_REVIEW.md` | This file | M3 requirement |
| `docs/M3_PHOTOGRAPHY_BRIEF.md` | Photography requirements (see §6) | M3 requirement |
| `tests/m3-screenshots.mjs` | Screenshot capture utility for visual evidence | Evidence tooling (not an e2e test) |

**Not changed (deliberately):** hero composition, section order, typography, colour system, image handling (`Media`, srcset, lazy/decoding already correct), booking flow behaviour, admin, payments, backend.

### 3.3 Image audit
- 30+ unique images, all centralised (`src/data/images.js`), Pexels stock as placeholders — labelled as such, not presented as property.
- `Media` sets `aspect-ratio` (no CLS), `srcset` 640/1024/1600/2200, `loading="lazy"` (priority only on home hero via `fetchPriority="high"`), `decoding="async"`.
- **Remaining issue:** zero commissioned assets; hero palette is dusk/cold and not ideal for the "warm limestone" brief — flagged in `M3_PHOTOGRAPHY_BRIEF.md` as the highest-value single asset.

## 4. Verification (what was actually run)

| Check | Result |
|---|---|
| API suite | **20/20 pass** (re-run after changes) |
| Playwright e2e | **3/3 pass** (guest book → held → staff confirm → guest sees confirmed; failure path; admin gate) |
| Frontend production build | clean (2186 modules; main chunk 296.84 KB, gzip 97.50 KB; vendor split r-eact 106.55 / gsap 70.90) |
| Backend build (Docker, from M2) | unchanged this milestone (API untouched except no changes required) |
| Mobile 390 px width | hero, availability results, menu overlay screenshots reviewed |

## 5. Responsive evidence (screenshots, `m3-screenshots/`)

| File | What it shows |
|---|---|
| `01-home-desktop.png` | Desktop home hero (composition unchanged) |
| `02-rooms-valley-suite.png` (full page) | Room detail editorial layout |
| `03-availability.png` | Desktop availability + live booking bar |
| `04-home-mobile.png` | 390 × 844 mobile hero — type and booking bar intact |
| `05-availability-mobile.png` (full page) | Mobile availability — stacked touch rows |
| `06-mobile-menu-open.png` | Mobile menu overlay — staggered links, bottom CTA, index numerals |

## 6. Accessibility notes

- Focus management in menu: trap + return (new). `aria-modal`, `aria-label`, `inert` on the closed menu (retained).
- Existing correct behaviour kept: skip link, labelled inputs (`htmlFor`), `role="alert"` errors with `aria-invalid`, keyboard-operable gallery (←/→ keys, thumbs), Escape closes dialogs/menu, visible `:focus-visible` everywhere incl. on-dark, contrast ≥ AA for text on limestone/charcoal pairings (verified by eyeball — no numeric contrast measure taken).
- Reduced motion: hero/menu/reveals/page transitions all skip. Print stylesheet added for confirmation.
- **Not verified numerically:** axe-core/Lighthouse contrast scan — not run; recommendations logged as next step rather than claimed.

## 7. Performance findings

- Bundle unchanged materially by M3 (296.84 KB app + 106.55 react + 70.90 gsap + 27.95 gsap-gzip) — M2 vendor split already did the heavy lifting; M3 added ~0.4 KB CSS.
- Images remain the dominant weight; largest registry entries (home hero ~2200 px) appropriate; `srcset` ensures selection by viewport.
- No layout shift sources found (all media reserves aspect ratio).
- Scroll listener halved in work (rAF throttle); ScrollTrigger count reduced by one (nav).
- **Not measured:** LCP/INP/CLS lab metrics — recommended next: Lighthouse CI on the staging deploy when one exists.

## 8. Remaining visual limitations (honest)

1. Hero is a dusk, cold-toned stock image that undercuts the warm limestone brief; no commissioned property imagery exists (see Photography Brief).
2. Menus/CTAs hover states are correct; interactive states on some tables/inputs could be slightly warmer — deliberately not restyled (no-redesign mandate).
3. Stock photography means no Kenya-specific architectural cues — placeholders read "international boutique", not "Rift Valley stone and timber".
4. No lightbox/focus trap has been added to the gallery (arrows/keys work; a full modal would be a design addition, not a defect).
5. The admin area is clean but deliberately dense; not visually audited this milestone.
