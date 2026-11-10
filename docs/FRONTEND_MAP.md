# Frontend Map

All routes are defined in `src/app/router.jsx`. Public routes render inside `PublicLayout` (Header, MobileMenu, Footer, scroll reveals, page transition). `/admin/*` renders inside `AdminLayout`.

## Public
| Route | Page | Description / main interactions |
| --- | --- | --- |
| `/` | `Home` | Full-viewport hero with GSAP sequence, availability bar, editorial intro, three asymmetric room compositions, "Built to belong." photographic section, experiences, dining, closing CTA. Search → `/availability`. |
| `/rooms` | `Rooms` | Text-led opening, availability bar, three large listings with ledger specs, amenities, sample-content notice. |
| `/rooms/:slug` | `RoomDetails` | `garden-room`, `valley-suite`, `signature-retreat`. Hero, overview, sticky price + availability panel (passes `room` to availability), crossfading gallery (arrows, thumbs, ← →), amenities, features, rate table, related rooms. Unknown slug → NotFound. |
| `/experiences` | `Experiences` | Six magazine compositions; **Enquire** opens `EnquiryDialog` (validated, stored in session only). |
| `/dining` | `Dining` | The Table at Stillhouse: meals, illustrative hours, reservation-enquiry dialog. |
| `/story` | `Story` | Alternating sections (location, architecture, materials, landscape, philosophy) + map placeholder. |
| `/availability` | `Availability` | Reads `checkIn, checkOut, adults, children, rooms, room` query params; editable bar; demo results with two rate plans; **Select room** stores selection. |
| `/booking/guest-details` | `GuestDetails` | Validated form (blur + submit), summary, privacy notice. Guarded: needs a selection. |
| `/booking/review` | `BookingReview` | Itemised pricing, cancellation policy, demo acknowledgement, **Complete demo reservation**. Guarded. |
| `/booking/confirmation` | `BookingConfirmation` | `DEMO-XXXXXX` reference, summary, `DEMO / NOT A REAL RESERVATION`, print. |
| `/account` | `Account` | Demo sign-in → overview (next stay, counts, profile). |
| `/account/reservations` | `AccountReservations` | Upcoming / previous tabs with expandable details (includes demo bookings made this session). |
| `/account/profile` | `AccountProfile` | Editable profile (session only); sign out in the account bar. |
| `/privacy`, `/terms` | `Legal` | Placeholder policy text. |
| `*` | `NotFound` | |

## Admin (demonstration)
| Route | Page | Interactions |
| --- | --- | --- |
| `/admin` | `Dashboard` | KPI strip (reservations, arrivals, departures, occupancy, demo revenue), recent reservations, today's movements, availability by type. |
| `/admin/reservations` | `Reservations` | Search, status / room filters, sort, detail drawer with status change. |
| `/admin/rooms` | `Rooms` | Type summaries; 28 physical rooms with search/filters, status + maintenance note editing. |
| `/admin/guests` | `Guests` | Search; expandable reservation history. |
| `/admin/rates` | `Rates` | Filters; inline nightly-rate and status editing; reset. |
| `/admin/reports` | `Reports` | Occupancy bars (7/14/30 days), reservation trend, stacked revenue (SVG). |
| `/admin/settings` | `Settings` | Hotel, contact, policies, booking settings with validation. |

## Component hierarchy (abridged)
```
App → AuthProvider → BookingProvider → RouterProvider
 ├─ PublicLayout → Header → MobileMenu · <Outlet/> · Footer → NewsletterForm
 │    Home → AvailabilityBar · Media · RoomFeature · ClosingCta
 │    Rooms → PageHero · AvailabilityBar · RoomListing · AmenityIcon · DemoNotice
 │    RoomDetails → RoomGallery · AvailabilityBar(panel) · RelatedRooms
 │    Experiences → ExperienceBlock · EnquiryDialog      Dining/Story → SplitSection
 │    Availability → BookingSteps · AvailabilityBar · RoomResult
 │    GuestDetails/BookingReview/BookingConfirmation → BookingSummary · Fields
 │    Account* → AccountShell → SignInPanel
 └─ AdminLayout → Admin pages → AdminUI (Panel, Stat, StatusBadge, Toolbar) · charts
```
State: `BookingContext` (search/selection/guest, sessionStorage) · `AuthContext` (demo account) · per-page `useState` in admin.
