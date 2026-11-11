// Post-commit side effects for reservation lifecycle events.
// IMPORTANT: these run AFTER the database transaction commits. They never throw —
// failures are logged and recorded (outbox / tax_invoice rows), never rolled back into booking state.
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { sendBookingConfirmation, sendAdminNewBooking, sendPaymentReceived, sendBookingCancelled, sendPaymentFailed, sendArrivalReminder } from '../integrations/email/index.js';
import { issueTaxInvoiceSafe } from '../integrations/etims/index.js';

const withRelations = (reservationId) =>
  prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { guest: true, roomType: true, ratePlan: true, payments: { where: { status: 'succeeded' } } },
  });

export async function afterCreated({ reservation, guest, roomType, ratePlan }) {
  try {
    await sendBookingConfirmation({ guest, reservation, room: roomType, ratePlan });
    await sendAdminNewBooking({ guest, reservation, room: roomType, ratePlan, requests: reservation.specialRequests });
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'post-create notification failure');
  }
}

export async function afterConfirmed(reservationId) {
  try {
    const reservation = await withRelations(reservationId);
    if (!reservation) return;
    await sendPaymentReceived({ guest: reservation.guest, reservation });
    await issueTaxInvoiceSafe({ reservation });
  } catch (err) {
    logger.error({ err: String(err?.message || err), reservationId }, 'post-confirm event failure');
  }
}

export async function afterCancelled({ reservationId, cancelFeeMinor }) {
  try {
    const reservation = await withRelations(reservationId);
    if (!reservation) return;
    await sendBookingCancelled({ guest: reservation.guest, reservation, cancelFeeMinor });
  } catch (err) {
    logger.error({ err: String(err?.message || err), reservationId }, 'post-cancel event failure');
  }
}

export async function afterFailed({ reservationId, reason }) {
  try {
    const reservation = await withRelations(reservationId);
    if (!reservation) return;
    await sendPaymentFailed({ guest: reservation.guest, reservation, reason });
  } catch (err) {
    logger.error({ err: String(err?.message || err), reservationId }, 'post-failure notification failure');
  }
}

export async function sendArrivalReminders({ reservations }) {
  for (const reservation of reservations) {
    try {
      await sendArrivalReminder({ guest: reservation.guest, reservation, room: reservation.roomType });
    } catch (err) {
      logger.error({ err: String(err?.message || err), reservationId: reservation.id }, 'arrival reminder failure');
    }
  }
}
