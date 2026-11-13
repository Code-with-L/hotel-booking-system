// Regression: the property is 28 rooms across exactly three types (D-002 / M8-D1).
// This guards against drift back to 32 or beyond (e.g. the Stone Cottage slip recorded in DECISIONS D-072).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('inventory: 28 rooms, three types (D-002)', () => {
  it('frontend catalogue sums to exactly 28 units across the three approved types', () => {
    return import('../../web/src/data/rooms.js').then(({ ROOMS }) => {
      const slugs = ROOMS.map((r) => r.slug).sort();
      expect(slugs).toEqual(['garden-room', 'signature-retreat', 'valley-suite']);
      const total = ROOMS.reduce((sum, r) => sum + r.unitCount, 0);
      expect(total).toBe(28);
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
