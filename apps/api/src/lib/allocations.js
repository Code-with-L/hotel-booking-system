// Room allocation ledger helpers. THE conflict-arbitration point for inventory.
// See docs/DATABASE_DESIGN.md §3.
import { roomUnavailable } from './errors.js';

export const HOLD_TTL_MINUTES = 15;

export async function findFreeRooms(tx, { roomTypeId, checkIn, checkOut, count }) {
  const rooms = await tx.room.findMany({
    where: { roomTypeId, status: 'active' },
    orderBy: { number: 'asc' },
    select: { id: true, number: true },
  });
  if (rooms.length === 0) return [];
  const idList = rooms.map((r) => String(r.id)).join(',');
  const ci = (checkIn instanceof Date ? checkIn.toISOString() : String(checkIn)).slice(0, 10);
  const co = (checkOut instanceof Date ? checkOut.toISOString() : String(checkOut)).slice(0, 10);
  const blocked = await tx.$queryRawUnsafe(
    `SELECT DISTINCT room_id FROM room_allocation WHERE state = 'occupying' AND check_in < $1::date AND check_out > $2::date AND room_id = ANY($3::bigint[])`,
    co,
    ci,
    `{${idList}}`,
  );
  const blockedIds = new Set(blocked.map((b) => String(b.room_id)));
  const free = rooms.filter((r) => !blockedIds.has(String(r.id)));
  // Spread concurrent guests across the free rooms (avoid everyone racing the same lowest number).
  for (let i = free.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  return free.slice(0, count);
}

// Insert allocation rows with raw SQL so SQLSTATE 23P01 (exclusion_violation) can be detected reliably.
export async function insertAllocations(tx, allocations) {
  const fmt = (d) => {
    const iso = d instanceof Date ? d.toISOString() : String(d);
    return iso.slice(0, 10);
  };
  try {
    for (const a of allocations) {
      const roomId = typeof a.roomId === 'bigint' || typeof a.roomId === 'number' ? a.roomId : BigInt(a.roomId);
      const sourceId = typeof a.sourceId === 'bigint' || typeof a.sourceId === 'number' ? a.sourceId : BigInt(a.sourceId);
      await tx.$executeRaw`
        INSERT INTO room_allocation (room_id, check_in, check_out, kind, state, source_type, source_id, expires_at, updated_at)
        VALUES (${String(roomId)}::bigint, ${fmt(a.checkIn)}::date, ${fmt(a.checkOut)}::date,
                ${a.kind}::"AllocationKind", ${a.state}::"AllocationState", ${a.sourceType},
                ${String(sourceId)}::bigint, ${a.expiresAt ?? null}, now())`;
    }
  } catch (err) {
    const code = err?.meta?.code || (String(err?.message || '').match(/23P01/) ? '23P01' : null);
    if (code === '23P01' || String(err?.message || '').toLowerCase().includes('exclusion constraint')) {
      throw roomUnavailable();
    }
    throw err;
  }
}

// Release allocations tied to a source (reservation -> cancel/expire/fail; block -> maintenance removed).
export async function releaseAllocations(tx, { sourceType, sourceId, state = 'released' }) {
  return tx.roomAllocation.updateMany({
    where: { sourceType, sourceId: BigInt(sourceId), state: 'occupying' },
    data: { state },
  });
}

// Promote an active hold to a confirmed reservation allocation (same rows, no gap).
export async function promoteHoldAllocation(tx, { reservationId }) {
  return tx.roomAllocation.updateMany({
    where: { sourceType: 'reservation', sourceId: BigInt(reservationId), state: 'occupying' },
    data: { kind: 'reservation', expiresAt: null },
  });
}
