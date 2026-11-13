// Confirm a pending reservation after verified payment (or authorized settlement):
// promote holds, or re-allocate, or mark needs_allocation. Serialized per reservation.
// Every caller (webhook / admin requery / stale-payment sweeper / desk settlement)
// goes through this function. It is the ONLY path to status='confirmed'.
import { promoteHoldAllocation, findFreeRooms, insertAllocations } from './allocations.js';
import { audit } from './audit.js';
import { conflict } from './errors.js';

export async function confirmReservationTx(tx, { reservation, actorUserId = null, ip = null, ua = null, note = null, requestId = null }) {
  const reservationId = reservation.id;
  // Serialise every confirmation for this reservation
  const lockedRows = await tx.$queryRaw`SELECT id, status, "roomTypeId", "checkIn", "checkOut", rooms FROM reservation WHERE id = ${reservationId} FOR UPDATE`;
  const locked = lockedRows[0];
  if (!locked) throw new Error(`reservation ${reservationId} vanished during confirm`);
  const expected = locked.rooms ?? 1;
  if (locked.status === 'confirmed') return { outcome: 'already', reservation: null };
  if (locked.status !== 'pending' && locked.status !== 'needs_allocation') {
    throw conflict(`Reservation is ${locked.status}; it cannot be confirmed.`);
  }

  const promoted = await promoteHoldAllocation(tx, { reservationId });
  if (promoted.count >= expected) {
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await audit(tx, {
      actorUserId, ip, action: 'reservation.confirmed',
      entity: 'reservation', entityId: reservationId,
      after: { reference: reservation.reference, status: 'confirmed', note, requestId },
    });
    return { outcome: 'confirmed', reservation: updated };
  }

  // Hold(s) lost before settlement — attempt re-allocation against current availability.
  const remaining = expected - promoted.count;
  const free = await findFreeRooms(tx, { roomTypeId: locked.roomTypeId, checkIn: locked.checkIn, checkOut: locked.checkOut, count: remaining });
  if (free.length === remaining) {
    await insertAllocations(tx, free.map((r) => ({
      roomId: r.id, checkIn: locked.checkIn, checkOut: locked.checkOut,
      kind: 'reservation', state: 'occupying', sourceType: 'reservation', sourceId: reservationId,
    })));
    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await audit(tx, {
      actorUserId, ip, action: 'reservation.reallocated',
      entity: 'reservation', entityId: reservationId,
      after: { reference: reservation.reference, status: 'confirmed', promoted: promoted.count, reallocated: remaining, roomIds: free.map((r) => String(r.id)), note, requestId },
    });
    return { outcome: 'confirmed', reservation: updated, reallocated: true };
  }

  // Money has (or will shortly have) settled but inventory cannot be assigned right now.
  // Never mark confirmed. Surface to staff + guest; retry happens via sweeper/admin.
  const updated = await tx.reservation.update({
    where: { id: reservationId }, data: { status: 'needs_allocation' },
  });
  await audit(tx, {
    actorUserId, ip, action: 'reservation.needs_allocation',
    entity: 'reservation', entityId: reservationId,
    after: { reference: reservation.reference, promoted: promoted.count, expected, note, requestId },
  });
  return { outcome: 'needs_allocation', reservation: updated };
}
