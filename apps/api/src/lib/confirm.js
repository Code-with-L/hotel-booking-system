// Confirm a pending reservation after verified payment: promote allocations, set confirmed.
import { promoteHoldAllocation } from './allocations.js';
import { audit } from './audit.js';

export async function confirmReservationTx(tx, { reservation, actorUserId = null, ip = null, note = null }) {
  await promoteHoldAllocation(tx, { reservationId: reservation.id });
  const updated = await tx.reservation.update({
    where: { id: reservation.id },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });
  await audit(tx, {
    actorUserId,
    action: 'reservation.confirmed',
    entity: 'reservation',
    entityId: reservation.id,
    after: { reference: reservation.reference, status: 'confirmed', note },
    ip,
  });
  return updated;
}
