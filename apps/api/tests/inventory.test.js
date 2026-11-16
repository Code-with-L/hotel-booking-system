// Regression: the property is 28 rooms. (D-002 originally pinned this to three
// approved types; two family types were added after the capacity audit — The
// Garden Twin (2 queen beds, sleeps 4) and The Valley Cottage (3 double beds,
// sleeps 6) — with unit counts taken from the existing types so the total
// stays exactly 28.)
// This guards against drift back above 28 (e.g. the Stone Cottage slip recorded in DECISIONS D-072).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const EXPECTED_SLUGS = ['garden-room', 'garden-twin', 'signature-retreat', 'valley-cottage', 'valley-suite'];

describe('inventory: 28 rooms across the approved types', () => {
  it('frontend catalogue sums to exactly 28 units across the approved types', () => {
    return import('../../web/src/data/rooms.js').then(({ ROOMS }) => {
      const slugs = ROOMS.map((r) => r.slug).sort();
      expect(slugs).toEqual(EXPECTED_SLUGS);
      const total = ROOMS.reduce((sum, r) => sum + r.unitCount, 0);
      expect(total).toBe(28);
    });
  });

  it('capacity is derived from beds, never hand-typed', () => {
    return import('../../web/src/data/rooms.js').then(({ ROOMS, capacityOf }) => {
      for (const r of ROOMS) {
        expect(r.capacity, r.slug).toBe(capacityOf(r.beds));
        expect(r.occupancy.adults, r.slug).toBe(r.capacity);
        expect(r.occupancy.label, r.slug).toBe(`${r.capacity} adults`);
      }
      // The single source of capacity truth: bed counts.
      const byType = Object.fromEntries(ROOMS.map((r) => [r.slug, r.capacity]));
      expect(byType).toEqual({
        'garden-room': 2,
        'garden-twin': 4,
        'valley-suite': 2,
        'valley-cottage': 6,
        'signature-retreat': 2,
      });
    });
  });

  it('seed catalogue sums to exactly 28 units and does not reintroduce Stone Cottage', () => {
    const seed = readFileSync(join(repoRoot, 'prisma', 'seed.js'), 'utf8');
    expect(seed).not.toContain('stone-cottage');
    const unitCounts = [...seed.matchAll(/unitCount:\s*(\d+)/g)].map((m) => Number(m[1]));
    const total = unitCounts.reduce((a, b) => a + b, 0);
    // ROOM_TYPES entries only — the file has no other unitCount usages, but this keeps the guard cheap and explicit.
    expect(total).toBe(28);
    expect(seed).toContain("rooms: 28");
  });
});
