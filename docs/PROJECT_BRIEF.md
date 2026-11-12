# Project Brief — The Stillhouse

**Status:** Approved at M0 (2026-11-11). Source of truth for scope. Changes require a new entry in `DECISIONS.md`.

## 1. What this is

**The Stillhouse** — a fictional 28-room boutique luxury retreat above the Great Rift Valley near Naivasha, Kenya. Single property. This repository is the project to design, build and ship it properly: public website, booking engine, payments, guest accounts, and an operations dashboard — as a learning exercise and a credible portfolio/production system.

## 2. Confirmed decisions (see DECISIONS.md for full log)

| # | Decision |
|---|---|
| 1 | Single-property hotel. No multi-tenancy, no multi-property platform. |
| 2 | Brand: **The Stillhouse** — fictional Kenyan boutique property. |
| 3 | Market: Kenya-first. KSh pricing, Kenya-ready architecture. M-Pesa Daraja is the **first** payment integration; card providers may follow. |
| 4 | Frontend: React + Vite + JavaScript (ES modules). |
| 5 | Styling: plain CSS with design tokens per `DESIGN_SYSTEM.md` (canonical). Cormorant Garamond (display) + DM Sans (functional). No gradients/gold/glass. |
| 6 | Animation: GSAP + ScrollTrigger, restrained, `prefers-reduced-motion` aware. |
| 7 | Backend: Node.js + Express + Prisma + PostgreSQL. JavaScript ES modules. |
| 8 | Repository: `hotel-booking-system`, npm workspaces monorepo (modular monolith). No microservices. |
| 9 | Workflow: the visual frontend was produced separately and staged for review, then moved into `apps/web/` after review. The frontend is treated as the product; the backend adapts to it. |
| 10 | Money: integer minor units with explicit `currency: "KES"`. |
| 11 | API base path: `/api/v1`. |
| 12 | The backend adapts to the frontend. The frontend is never redesigned to fit the backend without explicit approval. |

## 3. The 28 rooms

| Type | Units | Indicative rate |
|---|---|---|
| Garden Room | 14 | KSh 28,000 / night |
| Valley Suite | 9 | KSh 42,000 / night |
| Signature Retreat | 5 | KSh 65,000 / night |

(From `MOCK_DATA.md` — illustrative, to be validated as product content with the brand direction.)

## 4. Goals

- A guest can discover rooms, check real availability, receive a server-computed quote, reserve, pay (M-Pesa first), and receive confirmation.
- Staff can manage reservations, rooms, rates, guests and see reports/audit trail.
- Two guests can **never** secure the same physical room for overlapping dates.
- The system teaches JavaScript properly: guided + hybrid learning, small commits, tests before "done".

## 5. Non-goals

- Multi-property platform, channel manager, OTA connectivity (Booking.com/Airbnb) — out of scope.
- Real card storage (PAN/CVV) — never. Payments go through a PCI-compliant provider.
- Native mobile apps — responsive web only.
- Real-time chat, loyalty/points programme, dynamic pricing AI — out of scope unless approved.
- Production deployment details are decided in M7.

## 6. How this project is run

- `docs/` is the source of truth. AI assistants read these docs before changing anything and never silently expand scope.
- Milestone gates (M0–M7, see `BUILD_PLAN.md`). No milestone starts while critical acceptance tests of a previous milestone fail.
- Small, reviewable commits. No fake API success responses. No placeholder payment confirmations. No secrets in the repo.
- Learning model: hybrid — explanations, implementation challenges and code reviews. Unfamiliar JavaScript gets explained, not just generated.

## 7. Current state (2026-11-11)

- Project started as documentation and repository hygiene, then grew into the working system. The codebase, fixtures and this README describe it as it exists now.
