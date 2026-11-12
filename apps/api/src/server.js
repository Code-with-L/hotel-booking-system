// API server entry: HTTP listener + sweepers + graceful shutdown.
// The express import also makes this file detectable as an Express service entry point.
import express from 'express';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { mpesaConfigured, stkQuery } from './lib/mpesa.js';
import { retryFailedInvoices } from './integrations/etims/index.js';

const SWEEP_INTERVAL_MS = 60_000;
const PAYMENT_REQUERY_AFTER_MS = 45 * 60 * 1000;

async function sweepExpiredHolds() {
  try {
    const now = new Date();
    await prisma.roomAllocation.updateMany({
      where: { kind: 'hold', state: 'occupying', expiresAt: { lt: now } },
      data: { state: 'expired' },
    });
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.$executeRaw`
      UPDATE "reservation" r
      SET status = 'expired', "updatedAt" = now()
      WHERE r.status = 'pending'
        AND r."createdAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "room_allocation" ra
          WHERE ra.source_type = 'reservation'
            AND ra.source_id = r.id
            AND ra.state = 'occupying'
        )`;
    // Expire stale sessions
    await prisma.session.deleteMany({ where: { absoluteExpiryAt: { lt: now } } });
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'hold sweeper failed');
  }
}

// Re-query stale pending M-Pesa payments (callback loss safety net). Runs only when Daraja is configured.
async function sweepStalePayments() {
  try {
    if (!mpesaConfigured()) return;
    const stale = await prisma.payment.findMany({
      where: { provider: 'mpesa', status: 'pending', createdAt: { lt: new Date(Date.now() - PAYMENT_REQUERY_AFTER_MS) } },
      include: { reservation: true },
      take: 10,
    });
    for (const payment of stale) {
      try {
        const query = await stkQuery(payment.providerReference);
        if (query.resultCode === 0) {
          await prisma.$transaction(async (tx) => {
            await tx.paymentAttempt.create({
              data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: payment.providerReference, amountMinor: payment.amountMinor, currency: payment.currency, status: 'succeeded', rawPayload: query.raw, verified: true },
            });
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'succeeded', capturedAt: new Date() } });
            const { confirmReservationTx } = await import('./lib/confirm.js');
            await confirmReservationTx(tx, { reservation: payment.reservation, note: 'payment timeout sweeper' });
          });
          const { afterConfirmed } = await import('./lib/postBookingEvents.js');
          await afterConfirmed(payment.reservationId);
          logger.info({ paymentId: payment.id }, 'stale pending payment confirmed via STK query');

        } else if (query.resultCode !== null && query.resultCode !== 9999) {
          await prisma.$transaction(async (tx) => {
            await tx.paymentAttempt.create({
              data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: payment.providerReference, amountMinor: payment.amountMinor, currency: payment.currency, status: 'failed', rawPayload: query.raw, verified: true },
            });
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: query.resultDesc || `STK query ${query.resultCode}` } });
            const { releaseAllocations } = await import('./lib/allocations.js');
            await releaseAllocations(tx, { sourceType: 'reservation', sourceId: payment.reservationId, state: 'released' });
          });
          const { afterFailed } = await import('./lib/postBookingEvents.js');
          await afterFailed({ reservationId: payment.reservationId, reason: query.resultDesc || `stk_query_${query.resultCode}` });
          logger.info({ paymentId: payment.id }, 'stale pending payment failed via STK query');
        }
      } catch (err) {
        logger.warn({ paymentId: payment.id, err: String(err?.message || err) }, 'stale payment requery failed; will retry next sweep');
      }
    }
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'payment sweeper failed');
  }
}

// Upcoming-arrival reminders: tomorrow's confirmed check-ins, deduped via the email outbox.
async function sweepArrivalReminders() {
  try {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayStart = new Date(`${tomorrow}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const reservations = await prisma.reservation.findMany({
      where: { status: 'confirmed', checkIn: { gte: dayStart, lt: dayEnd } },
      include: { guest: true, roomType: true },
      take: 200,
    });
    if (!reservations.length) return;
    const { sendArrivalReminders } = await import('./lib/postBookingEvents.js');
    await sendArrivalReminders({ reservations });
    logger.info({ count: reservations.length, tomorrow }, 'arrival reminders dispatched');
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'arrival reminder sweeper failed');
  }
}

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'stillhouse-api listening');
});

const sweeper = setInterval(() => {
  sweepExpiredHolds();
  sweepStalePayments();
  sweepArrivalReminders().catch((err) => logger.error({ err: String(err?.message || err) }, 'arrival reminder failed'));
  retryFailedInvoices().catch((err) => logger.error({ err: String(err?.message || err) }, 'invoice retry failed'));
}, SWEEP_INTERVAL_MS);

const shutdown = async (signal) => {
  logger.info({ signal }, 'shutting down');
  clearInterval(sweeper);
  server.close(async () => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
