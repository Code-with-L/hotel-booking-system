# Frontend Handoff Acceptance Checklist — Arena → `apps/web/`

**Status:** Binding gate (M1). Arena output is staged OUTSIDE the repo (`../arena-staging/`, never committed) and inspected there. Passing = every applicable box verified by **running the app**, not by reading Arena's description. Sections 1–5 are mandatory; any ✗ blocks acceptance. Sections 6–10 may be fixed or explicitly waived by owner sign-off.

Verified by: __________  Date: __________  Arena delivery ref: __________

## 1. Source integrity
- [ ] Real, complete source on disk: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/app/App.jsx`, `src/app/router.jsx`, styles, all pages/components — nothing missing, no dead imports
- [ ] `npm install` clean; `npm run build` succeeds; `npm run dev` serves; browser console free of errors on all primary routes
- [ ] No Next.js/TypeScript/Drizzle/Tailwind artifacts (next.config.ts, .tsx/.ts files, tsconfig.json, drizzle/postcss configs)
- [ ] No placeholder "lorem" routes; every FRONTEND_MAP route exists

## 2. Dependencies
- [ ] Runtime: only `react`, `react-dom`, `react-router-dom`, `gsap`, `lucide-react` (+ nothing else without written justification)
- [ ] Dev: `vite`, `@vitejs/plugin-react` (+ optional lint/format)
- [ ] No CSS frameworks; styling = plain CSS custom properties

## 3. Routes (FRONTEND_MAP.md)
- [ ] Public: `/` `/rooms` `/rooms/garden-room` `/rooms/valley-suite` `/rooms/signature-retreat` `/experiences` `/dining` `/story` `/availability` `/booking/guest-details` `/booking/review` `/booking/confirmation` `/account` `/account/reservations` `/account/profile` `/privacy` `/terms` + `*` NotFound
- [ ] Admin: `/admin` `/admin/reservations` `/admin/rooms` `/admin/guests` `/admin/rates` `/admin/reports` `/admin/settings`
- [ ] Unknown room slug → NotFound; booking pages redirect to `/availability` when no selection (guards work)

## 4. Design-system compliance (DESIGN_SYSTEM.md)
- [ ] `tokens.css` with documented values: limestone #F1EFE8, parchment #E8E4DA, ink #242722, stone #77786F, olive #535B45, terracotta #A66F56, charcoal #252823, border #D7D3C9, white #FFFFFF
- [ ] Cormorant Garamond display + DM Sans functional; uppercase only on labels/nav/buttons (0.14–0.18em)
- [ ] Zero gradients, glows, glass, gold, purple/cyan anywhere (scrim = flat translucent charcoal only)
- [ ] Corners ≤ 2px; hairline borders; square buttons (11px tracked uppercase); olive→ink hover; no oversized rounded cards
- [ ] Asymmetric editorial grids; container ≤1440px; fluid `clamp()` type

## 5. Components & behaviour
- [ ] AvailabilityBar: hairline desktop bar / stacked mobile rows; query-param driven; `room` context on detail pages
- [ ] RoomGallery: ←/→ keys, thumbs, focus visible, aria labels; Esc closes
- [ ] Booking: selection → validated guest details (blur+submit, `role="alert"`, `aria-invalid`) → review (itemised, cancellation policy) → confirmation with `DEMO-` ref + explicit "NOT A REAL RESERVATION" marking
- [ ] Admin: Dashboard KPIs; Reservations search/filter/sort/drawer/status change; Rooms list (28 units, status + maintenance); Guests search/history; Rates inline edit; Reports SVG charts; Settings validated + labelled demo
- [ ] Every mock dataset / demo panel carries a visible DEMO/sample-content marking (terracotta-rule `DemoNotice` or equivalent)

## 6. Assets
- [ ] Images centralised (`data/images.js`); responsive `srcset`; `loading="lazy"`; meaningful `alt`
- [ ] Zero broken URLs; licence/attribution list provided (Pexels placeholders explicitly marked as non-production)
- [ ] Fonts load from Google Fonts (or self-hosted); lucide-react icons only

## 7. Responsive
- [ ] No horizontal overflow at 390 / 640 / 768 / 1024 / 1280 / 1440 px
- [ ] Header → menu ≤1024px; editorial grids stack; availability bar → touch rows; tap targets ≥44px
- [ ] Fluid type scales; sticky elements behave (RoomDetails price panel, admin table overflow scrolls internally)

## 8. Animation (GSAP + ScrollTrigger — restrained)
- [ ] Hero sequence (clip-path reveal → label → line-by-line headline → CTAs → cue → booking bar); 0.5–1.5s; power2/3 eases
- [ ] Scroll reveals via ScrollTrigger; `gsap.context` / `matchMedia`; reverted on unmount; no per-paragraph reveals; no bounce/elastic
- [ ] `prefers-reduced-motion`: scroll motion skipped, menu instant, hero content visible without animation
- [ ] Parallax desktop-only

## 9. Mock-data boundaries
- [ ] All demo content isolated in `src/data/*` + `src/services/*`; no mock arrays/fetch inside components/pages
- [ ] Service signatures match what M3 will implement (seam intact): `availabilityService`, `reservationService`, `authService`, `adminService`, `enquiryService`
- [ ] sessionStorage keys per MOCK_DATA.md (`stillhouse.demo.booking`, `stillhouse.demo.reservations`, `stillhouse.demo.account`, …); closing tab clears state
- [ ] No secrets, API keys, or `.env` committed; `.env.example` lists names only; no network calls leave the app except documented font/image CDNs

## 10. Handoff hygiene & accessibility
- [ ] Delivery includes file tree + run instructions; deviations itemised in writing (not discovered by us)
- [ ] Skip link; semantic landmarks; labelled controls; visible focus states; Esc closes overlays; keyboard-complete gallery/menu
- [ ] README (or HANDOFF notes) accurately describes what was delivered, not what was requested

**Gate rule:** any ✗ in §1–5 → rejection with itemised findings sent back to Arena. Do not start backend work (M3) until owner signs this checklist.
