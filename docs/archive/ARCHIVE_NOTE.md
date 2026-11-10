# Archive note

Everything in `docs/archive/` is **preserved for provenance only** and is **not an active architectural choice**.

## `archive/scaffold/`

Files that arrived in the original `stillhouse-luxury-hospitality-website/` folder. They came from a generic `nextjs-postgresql-template` and contradict the approved stack:

| File | Why it is archived, not used |
|---|---|
| `package.json` (`nextjs-postgresql-template`) | Next.js 16 + TypeScript + Drizzle + Tailwind 4 + `pg`. The approved stack is React + Vite + JavaScript (frontend) and Express + Prisma (backend). |
| `next.config.ts` | Next.js configuration. Next.js is explicitly not part of this project. |
| `tsconfig.json` | TypeScript. The project uses JavaScript ES modules only. |
| `drizzle.config.json` | Drizzle ORM. The project uses Prisma. |
| `postcss.config.mjs` | Tailwind 4 / PostCSS. The project uses plain CSS with custom properties. |
| `eslint.config.mjs` | Template lint config; superseded by project-level tooling decisions in M3/M7. |
| `vite.config.js` | Vite handoff config for a frontend that was never delivered. Kept as reference: its `@` → `src/` alias and plugin-react expectation are consistent with the approved Vite direction. |
| `index.html` | Vite entry referencing `/src/main.jsx` — the file that proved no source was ever delivered. Kept as the reference for the Arena brief. |

## `archive/API_REQUIREMENTS.md`

Superseded by [`../API_CONTRACTS.md`](../API_CONTRACTS.md), which adopts `/api/v1`, integer minor units with explicit `currency`, and marks all field names as provisional until the Arena handoff is accepted. Preserved for traceability.

## Rules

- Archived files must not be imported, referenced by builds, or used as implementation guidance beyond historical context.
- If any archived decision is ever revisited, it requires a new entry in [`../DECISIONS.md`](../DECISIONS.md) and owner approval — no silent re-adoption.
