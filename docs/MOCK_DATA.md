# Mock / Demonstration Data

> **Superseded (2026-11-11, M1):** every mock dataset listed here is now backed by the live system — see `API_CONTRACTS.md` (v1.0) and `DECISIONS.md` D-024/D-025. `MOCK_DATA.md` is preserved for history and to document what the prototype faked. Guest-facing bookings now create real reservations; admin surfaces show real (seeded) fixtures; nothing on these pages claims payment without a verified provider result.

Everything below is **fictional or illustrative**. None of it represents a real hotel, guest, price or booking.

| Dataset | File | What is fake | Used by |
| --- | --- | --- | --- |
| Photography | `src/data/images.js` | Stock photos (Pexels) as placeholders; not Naivasha, not the property | every page via `Media` / `RoomGallery` |
| Room types, amenities, rate plans | `src/data/rooms.js` | Sizes, prices (KSh 28,000 / 42,000 / 65,000), amenities, cancellation rules, unit counts (14 / 9 / 5 = 28) | Home, Rooms, RoomDetails, Availability, Booking*, Admin Rooms/Rates |
| Experiences | `src/data/experiences.js` | Programme, durations | Home, Experiences |
| Dining | `src/data/dining.js` | Menus copy, **illustrative opening hours** | Dining |
| Story copy | `src/data/story.js` | Narrative about a concept property | Story |
| Site content | `src/data/site.js` | Email `…@stillhouse.example`, phone `+254 000 000 000`, social links (platform home pages), legal placeholder text, approximate coordinates | Footer, MobileMenu, legal pages |
| Guests | `src/data/mockGuests.js` | 12 invented guests (reserved/`example.com` contact data). `G-1012` (naomi.achieng@example.com) is the demo account | Admin Guests, Account |
| Reservations | `src/data/mockReservations.js` | 28 invented reservations, dates generated relative to *today* so arrivals/departures appear on the dashboard | Admin Dashboard/Reservations/Guests, Account |
| Admin operations | `src/data/mockAdmin.js` | 28 physical rooms and statuses (derived from in-house reservations), seasonal rate rows, generated occupancy/reservation/revenue series, default settings | Admin Rooms/Rates/Reports/Settings |
| Availability results | `src/services/availabilityService.js` | **No inventory check.** All types "available" unless party exceeds capacity; 600ms artificial delay | Availability page |
| Pricing/taxes | `src/utils/pricing.js` | 10% service charge, 2% tourism levy, 16% VAT on (subtotal + service) | Availability, Booking*, Confirmation |
| Booking draft | sessionStorage `stillhouse.demo.booking` | User-entered; browser only | Booking flow |
| Demo reservations | sessionStorage `stillhouse.demo.reservations` | `DEMO-XXXXXX` references, status `DEMO`, payment "Not collected" | Confirmation, Account |
| Demo account | sessionStorage `stillhouse.demo.account` | No credential check at all | Account |
| Enquiries | sessionStorage `stillhouse.demo.enquiries` | Stored locally, never sent | Experiences, Dining |
| Admin settings | sessionStorage `stillhouse.demo.admin.settings` | Saved locally, no effect on public site | Admin Settings |

Closing the browser tab clears all sessionStorage data.
