> **Status note (M0, 2026-11-11):** This document is the *brief* for the Arena-generated frontend. It describes a build that does **not yet exist** in this repository — no application source has been delivered or committed. Everything below specifies the intended artifact. When Arena delivers, the export is staged in a separate directory and graded against [HANDOFF_CHECKLIST.md](HANDOFF_CHECKLIST.md); only after acceptance does it move into `apps/web/`. Companion docs: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) · [FRONTEND_MAP.md](FRONTEND_MAP.md) · [MOCK_DATA.md](MOCK_DATA.md) · [API_CONTRACTS.md](API_CONTRACTS.md) · [ARCHIVE_NOTE](archive/ARCHIVE_NOTE.md).

# THE STILLHOUSE — Frontend (Arena handoff brief)

A complete, multi-page luxury boutique hotel website, reservation prototype, guest account and hotel administration interface for **The Stillhouse**, a concept 28-room retreat above the Great Rift Valley, Naivasha, Kenya.

> **This is a frontend prototype for a fictional property.** Rooms, prices, availability, policies, guests and reservations are demonstration content. No payment is taken, no real availability is checked, and nothing is sent to a server. See [Demo limitations](#demo-limitations).

Art direction: *architectural minimalism + contemporary editorial hospitality.* Limestone, parchment, ink, deep olive, muted terracotta and charcoal; Cormorant Garamond + DM Sans; GSAP + ScrollTrigger used sparingly.

## Stack

| Concern | Choice |
| --- | --- |
| UI | React 19, JavaScript (ES modules, **no TypeScript** in the frontend source) |
| Routing | React Router (`createBrowserRouter`, route-level code splitting) |
| Motion | GSAP + ScrollTrigger (context-scoped, reduced-motion aware) |
| Styling | Plain CSS with custom properties (`src/styles`) |
| Icons | `lucide-react` |
| State | React context + `sessionStorage` (booking draft, demo reservations, demo account) |

### Two ways to run the same source

1. **In this repository (preview shell).** The sandbox runs Next.js. A thin shell (`src/app/[[...slug]]/page.tsx` → `src/app/SpaRoot.tsx`) mounts `src/app/App.jsx` client-side so React Router owns every URL. `next.config.ts` restricts `pageExtensions` to `ts/tsx` so `src/pages/*.jsx` is *not* treated as Next Pages Router.
   ```bash
   npm install
   npm run dev        # http://localhost:3000
   npm run build && npm start
   ```
2. **Standalone Vite handoff.** `index.html`, `vite.config.js` and `src/main.jsx` are included. In a fresh Vite project:
   ```bash
   npm i react react-dom react-router-dom gsap lucide-react
   npm i -D vite @vitejs/plugin-react
   npx vite
   ```
   The `@` alias resolves to `src/` (see `vite.config.js`). The `src/app/*.tsx`, `src/types` and `src/db` Next.js files are not needed in a Vite host.

## Dependencies
`react`, `react-dom`, `react-router-dom`, `gsap`, `lucide-react`. Fonts (Cormorant Garamond, DM Sans) are loaded from Google Fonts in `src/app/layout.tsx` / `index.html`.

## Structure

```
src/
  app/            App.jsx, router.jsx (+ Next shell: layout.tsx, SpaRoot.tsx, [[...slug]]/page.tsx)
  pages/          Home, Rooms, RoomDetails, Experiences, Dining, Story, Availability,
                  GuestDetails, BookingReview, BookingConfirmation, Account*, Legal, NotFound, Admin/*
  components/
    layout/       PublicLayout, AdminLayout, Footer
    navigation/   Header, MobileMenu
    booking/      AvailabilityBar, BookingSteps, BookingSummary
    rooms/        RoomFeature, RoomListing, RoomGallery, RoomResult, RelatedRooms, AmenityIcon
    editorial/    PageHero, SplitSection, ExperienceBlock, ClosingCta
    forms/        Fields, NewsletterForm, EnquiryDialog
    ui/           Button, Media, DemoNotice
  features/
    availability/ query-param parsing + useAvailability
    reservations/ BookingContext (sessionStorage-persisted draft)
    guest-account/ AuthContext, AccountShell
    administration/ AdminUI, SVG charts
  animations/     gsap.js, hero.js, reveals.js, navigation.js, transitions.js
  data/           images, rooms, experiences, dining, story, site, mock*.js
  services/       api, availability, reservation, auth, enquiry, admin  (the ONLY integration boundary)
  hooks/ utils/ styles/
```

Companion documents: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) · [FRONTEND_MAP.md](FRONTEND_MAP.md) · [API_REQUIREMENTS.md](API_REQUIREMENTS.md) · [MOCK_DATA.md](MOCK_DATA.md)

## Demo limitations
- **Availability is not real.** `availabilityService` returns every room type as available unless the party exceeds capacity.
- **Prices are illustrative** (KSh). Tax logic (10% service, 2% levy, 16% VAT) is a demonstration formula.
- **No payment.** The booking flow ends with a booking reference prefixed `DEMO-` and the status `DEMO / NOT A REAL RESERVATION`.
- **Account sign-in is not authentication.** Any valid email + 6-character password works. Use `naomi.achieng@example.com` to see sample history.
- **Admin has no authentication** and edits are held in component state (settings in sessionStorage). Everything is labelled as demonstration data.
- **Photography is stock imagery (Pexels)** standing in for a commissioned shoot and does not depict Naivasha. All image references are centralised in `src/data/images.js`.
- **Contact details, social links, map and legal text are placeholders.** No street address is given; the map is a marked placeholder.
- Enquiry and newsletter forms validate but store/send nothing.

## Accessibility & performance notes
Skip link, semantic landmarks, labelled form controls with `aria-invalid`/`role="alert"` errors, keyboard-operable gallery and menu (Esc closes), visible focus states, `prefers-reduced-motion` respected, parallax desktop-only, lazy-loaded responsive images with `srcset`, route-level code splitting, GSAP animations scoped with `gsap.context` and reverted on unmount.
