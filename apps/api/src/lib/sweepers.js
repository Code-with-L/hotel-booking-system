// Background sweepers, shared by src/server.js (self-host) and src/worker.js (dedicated worker).
// Every sweep is idempotent and takes a cross-process advisory lock, so multiple
// instances (or a fast restart) can never run the same sweep concurrently.
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { mpesaConfigured, stkQuery } from './mpesa.js';
import { retryFailedInvoices } from '../integrations/etims/index.js';

export const SWEEP_INTERVAL_MS = 60_000;
export const PAYMENT_REQUERY_AFTER_MS = 45 * 60 * 1000;
const SWEEP_LOCK_KEY = 900_000_000_001n;

async function withSweepLock(fn) {
  const rows = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`;
  if (!rows?.[0]?.locked) {
    logger.info('sweep lock held by another instance; skipping this tick');
    return null;
  }
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`.catch((err) =>
      logger.warn({ err: String(err?.message || err) }, 'advisory unlock failed'));
  }
}

export async function sweepExpiredHolds() {
  try {
    const now = new Date();
    const holds = await prisma.roomAllocation.updateMany({
      where: { kind: 'hold', state: 'occupying', expiresAt: { lt: now } },
      data: { state: 'expired' },
    });
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const pendings = await prisma.$executeRaw`
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
    const sessions = await prisma.session.deleteMany({ where: { absoluteExpiryAt: { lt: now } } });
    return { holdsExpired: holds.count, sessionsDeleted: sessions.count };
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'hold sweeper failed');
    return { holdsExpired: 0, sessionsDeleted: 0, error: true };
  }
}

// Re-query stale pending M-Pesa payments (callback loss safety net).
// Identical settlement semantics to the webhook: verify via Daraja, then settle via the funnel.
export async function sweepStalePayments() {
  try {
    if (!mpesaConfigured()) return { staleSettled: 0, staleFailed: 0 };
    let settled = 0;
    let failed = 0;
    const stale = await prisma.payment.findMany({
      where: { provider: 'mpesa', status: 'pending', createdAt: { lt: new Date(Date.now() - PAYMENT_REQUERY_AFTER_MS) }, NOT: { failureReason: 'OVER_CAPTURE_REFUSED' } },
      include: { reservation: true },
      take: 10,
    });
    for (const payment of stale) {
      try {
        const query = await stkQuery(payment.providerReference);
        if (query.resultCode === 0) {
          const totals = await prisma.payment.aggregate({ where: { reservationId: payment.reservationId, status: 'succeeded' }, _sum: { amountMinor: true } });
          const refundedAgg = await prisma.paymentAttempt.aggregate({ where: { payment: { reservationId: payment.reservationId }, status: 'refunded' }, _sum: { amountMinor: true } });
          const net = (totals._sum.amountMinor || 0) - (refundedAgg._sum.amountMinor || 0);
          if (net + payment.amountMinor > payment.reservation.totalMinor) {
            logger.error({ paymentId: payment.id, reservationId: payment.reservationId }, 'sweeper settlement would exceed reservation total; manual review required');
            await prisma.payment.update({ where: { id: payment.id }, data: { failureReason: 'OVER_CAPTURE_REFUSED' } });
            continue;
          }
          const claimed = await prisma.$transaction(async (tx) => {
            // CAS: another writer (webhook) may have settled it while we queried
            const claim = await tx.payment.updateMany({
              where: { id: payment.id, status: 'pending' },
              data: { status: 'succeeded', capturedAt: new Date() },
            });
            if (claim.count !== 1) return false;
            await tx.paymentAttempt.create({
              data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: payment.providerReference, amountMinor: payment.amountMinor, currency: payment.currency, status: 'succeeded', rawPayload: query.raw, verified: true, ip: 'sweeper' },
            });
            const { confirmReservationTx } = await import('./confirm.js');
            await confirmReservationTx(tx, { reservation: payment.reservation, note: 'payment timeout sweeper' });
            return true;
          });
          if (claimed) {
            const { afterConfirmed } = await import('./postBookingEvents.js');
            await afterConfirmed(payment.reservationId);
            settled += 1;
            logger.info({ paymentId: payment.id }, 'stale pending payment confirmed via STK query');
          }
        } else if (query.resultCode !== null && query.resultCode !== 9999) {
          const claimed = await prisma.$transaction(async (tx) => {
            const claim = await tx.payment.updateMany({
              where: { id: payment.id, status: 'pending' },
              data: { status: 'failed', failureReason: query.resultDesc || `STK query ${query.resultCode}` },
            });
            if (claim.count !== 1) return false;
            await tx.paymentAttempt.create({
              data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: payment.providerReference, amountMinor: payment.amountMinor, currency: payment.currency, status: 'failed', rawPayload: query.raw, verified: true, ip: 'sweeper' },
            });
            const { releaseAllocationsIfUnsettled } = await import('./allocations.js');
            await releaseAllocationsIfUnsettled(tx, payment.reservationId);
            return true;
          });
          if (claimed) {
            failed += 1;
            const { afterFailed } = await import('./postBookingEvents.js');
            await afterFailed({ reservationId: payment.reservationId, reason: query.resultDesc || `stk_query_${query.resultCode}` });
            logger.info({ paymentId: payment.id }, 'stale pending payment failed via STK query');
          }
        }
      } catch (err) {
        logger.warn({ paymentId: payment.id, err: String(err?.message || err) }, 'stale payment requery failed; will retry next sweep');
      }
    }
    return { staleSettled: settled, staleFailed: failed };
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'payment sweeper failed');
    return { staleSettled: 0, staleFailed: 0, error: true };
  }
}

export async function sweepArrivalReminders() {
  try {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayStart = new Date(`${tomorrow}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const reservations = await prisma.reservation.findMany({
      where: { status: 'confirmed', checkIn: { gte: dayStart, lt: dayEnd } },
      include: { guest: true, roomType: true },
      take: 200,
    });
    if (!reservations.length) return { remindersSent: 0 };
    const { sendArrivalReminders } = await import('./postBookingEvents.js');
    await sendArrivalReminders({ reservations });
    logger.info({ count: reservations.length, tomorrow }, 'arrival reminders dispatched');
    return { remindersSent: reservations.length };
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'arrival reminder sweeper failed');
    return { remindersSent: 0, error: true };
  }
}

export async function runAllSweeps() {
  return withSweepLock(async () => {
    const started = Date.now();
    const [holds, payments, reminders] = await Promise.all([
      sweepExpiredHolds(),
      sweepStalePayments(),
      sweepArrivalReminders(),
    ]);
    let invoices = { retried: 0 };
    try {
      invoices = await retryFailedInvoices();
    } catch (err) {
      logger.error({ err: String(err?.message || err) }, 'invoice retry failed');
    }
    const counts = {
      holdsExpired: holds?.holdsExpired ?? 0,
      staleSettled: payments?.staleSettled ?? 0,
      staleFailed: payments?.staleFailed ?? 0,
      remindersSent: reminders?.remindersSent ?? 0,
      invoicesRetried: invoices?.retried ?? 0,
    };
    logger.info({ ms: Date.now() - started, ...counts }, 'sweep completed');
    // Heartbeat for external staleness probes (non-secret, no PII)
    await touchHeartbeat(counts).catch((err) => logger.warn({ err: String(err?.message || err) }, 'heartbeat write failed'));
    return counts;
  });
}

export async function touchHeartbeat(counts = {}) {
  const value = { at: new Date().toISOString(), worker: process.env.WORKER_NAME || 'stillhouse-worker', counts };
  await prisma.setting.upsert({
    where: { key: 'jobs.heartbeat' },
    create: { key: 'jobs.heartbeat', value },
    update: { value },
  });
}
