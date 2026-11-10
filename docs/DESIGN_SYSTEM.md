# Design System — The Stillhouse

Source of truth: `src/styles/tokens.css` (+ `typography.css`).

## Colour tokens
| Token | Value | Use |
| --- | --- | --- |
| `--limestone` | `#F1EFE8` | Primary background (dominant) |
| `--parchment` | `#E8E4DA` | Secondary background, admin canvas, quiet panels |
| `--ink` | `#242722` | Primary text |
| `--stone` | `#77786F` | Secondary text, metadata |
| `--olive` | `#535B45` | Primary buttons, small labels, active states (sparingly) |
| `--terracotta` | `#A66F56` | Editorial accent only: numerals, rules, demo markers |
| `--charcoal` | `#252823` | Closing CTA, footer, admin sidebar, selected editorial sections |
| `--warm-white` | `#F1EFE8` | Text on charcoal |
| `--border` | `#D7D3C9` | Hairlines |
| `--white` | `#FFFFFF` | Form fields, booking panels |

Derived (opacity of the above, no new hues): `--ink-soft`, `--on-dark-muted`, `--border-dark`, `--scrim`. `--error` (#A4452F) exists **only** for form validation and cancelled status.
No gradients, glows, glass, gold or purple/cyan anywhere (the `scrim` is a flat translucent charcoal).

## Typography
- **Display — Cormorant Garamond** (400/500, italic for emphasis): hero/page headlines, room names, numerals.
- **Functional — DM Sans** (400/500): navigation, body, forms, prices, admin.

| Class | Size (fluid) | Use |
| --- | --- | --- |
| `.display` | 50 → 116px | Hero & page openings |
| `.h-xl` | 44 → 92px | Major editorial headings |
| `.h-lg` | 38 → 64px | Section headings |
| `.h-md` / `.h-sm` | 30–44 / 24–30px | Sub-headings, room names |
| `.lede` / `.body` | 17–19 / 16px | Copy |
| `.eyebrow` / `.meta` | 11px, 0.14–0.18em tracking, uppercase | Labels, categories, metadata |
Uppercase is reserved for small editorial labels, navigation and buttons.

## Spacing & layout
Tokens `--s-1…--s-9` (4→96px), `--section-y: clamp(80px, 10vw, 160px)`. Container max 1440px, horizontal padding `clamp(20px, 5.2vw, 80px)` (20–24px on mobile). 12-column editorial grids with intentional asymmetry; images may bleed beyond the container (`.room-feature--c`). Corners are square (`--radius: 2px`); structure comes from hairlines and whitespace, not cards.

## Components
- **Buttons** (`.btn`): square, 11px uppercase, 0.16em tracking. `solid` (olive → ink on hover), `outline`, `light`, `ghost-light` (on imagery), `text`. Arrows nudge 4px on hover. `ArrowLink` = underlined text link.
- **Media** (`.media`): square image with optional clip-path reveal, parallax (desktop) and hover zoom.
- **Availability bar**: hairline-divided horizontal bar (desktop), 6-col grid (tablet), stacked touch-sized rows (mobile); `panel` variant for room pages.
- **Fields**: white fill, 1px border, olive focus, `has-error` state with `role="alert"` message.
- **DemoNotice / demo-tag**: terracotta rule marking every piece of sample content.
- **Admin**: same tokens, denser (13px tables, hairline stat strips, flat status badges, SVG charts).

## Breakpoints
`1440` reference · `1280` laptop · `1024` tablet (header collapses to menu, editorial grids stack) · `768` · `640` mobile · 390/375 checked.

## Animation principles
1. Restrained, no bounce or elastic; `power2/3` eases, 0.5–1.5s.
2. Hero: clip-path image reveal → label → headline line-by-line → text → CTAs → scroll cue → booking bar.
3. Scroll: clip-path image reveals, small vertical text reveals, grouped stagger, gentle parallax (desktop only). Never every paragraph.
4. Navigation: solid-on-scroll via ScrollTrigger; menu overlay clip + staggered links.
5. Page transitions: 0.5s fade/lift, non-blocking.
6. Respect `prefers-reduced-motion` (all scroll motion skipped, menu instant). Everything scoped by `gsap.context` / `gsap.matchMedia` and reverted on unmount.
