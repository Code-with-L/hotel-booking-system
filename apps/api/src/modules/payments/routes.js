// Payments: M-Pesa initiation + callback, desk (manual) payments, refunds.
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { initiatePaymentSchema, recordDeskPaymentSchema, recordSettlementSchema } from '@stillhouse/shared';
import { validate, requireRole, isStaff, writeLimiter } from '../../middleware/index.js';
import { badRequest, notFound, forbidden, conflict, ApiError } from '../../lib/errors.js';
import { mpesaConfigured, stkPush } from '../../lib/mpesa.js';
import { confirmReservationTx } from '../../lib/confirm.js';
import { releaseAllocationsIfUnsettled } from '../../lib/allocations.js';
import { audit } from '../../lib/audit.js';
import { env } from '../../config/env.js';
import { logger, maskRef } from '../../lib/logger.js';
import { afterConfirmed, afterFailed } from '../../lib/postBookingEvents.js';
import { stkQuery } from '../../lib/mpesa.js';

export const paymentsRouter = Router();
export const webhooksRouter = Router();
export const adminPaymentsRouter = Router();

const canAccessReservation = (req, reservation, email) => {
  if (isStaff(req)) return true;
  const sessionEmail = req.auth?.guest?.email || req.auth?.user?.email;
  if (sessionEmail) return reservation.guest?.email === sessionEmail;
  // Unauthenticated bookings (no account): possession of reference + booking email authorises payment initiation only.
  return Boolean(email && reservation.guest?.email === email.toLowerCase());
};

paymentsRouter.post('/payments', writeLimiter, validate(initiatePaymentSchema), async (req, res, next) => {
  try {
    const { reservationReference, phone, email } = req.validatedBody;
    const reservation = await prisma.reservation.findUnique({
      where: { reference: reservationReference },
      include: { guest: true },
    });
    if (!reservation) throw notFound('Reservation not found.');
    if (!canAccessReservation(req, reservation, email)) throw forbidden();
    if (reservation.status !== 'pending') throw badRequest(`This reservation is ${reservation.status.replace('_', ' ')}; payment can only be initiated for a pending reservation.`);

    if (!mpesaConfigured()) {
      throw new ApiError(
        503,
        'MPESA_NOT_CONFIGURED',
        'M-Pesa is not configured yet. No payment can be taken. The hotel can confirm this booking at the desk, or set MPESA_ENV with Daraja credentials to enable STK push.'
      );
    }
    const normalizedPhone = String(phone || reservation.guest.phone || '').replace(/\D/g, '');
    if (!/^2547\d{8}$|^2541\d{8}$/.test(normalizedPhone)) {
      throw badRequest('Enter the M-Pesa number in 2547XXXXXXXX form.');
    }

    const amountMajor = Math.round(reservation.totalMinor / 100);
    const attempt = await stkPush({
      phone: normalizedPhone,
      amountMajor,
      accountReference: reservation.reference,
      transactionDesc: `Stillhouse ${reservation.reference}`,
    });

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          reservationId: reservation.id,
          provider: 'mpesa',
          providerReference: attempt.checkoutRequestId,
          amountMinor: reservation.totalMinor,
          status: 'pending',
        },
      });
      await tx.paymentAttempt.create({
        data: {
          reservationId: reservation.id,
          paymentId: payment.id,
          provider: 'mpesa',
          providerReference: attempt.checkoutRequestId,
          amountMinor: reservation.totalMinor,
          currency: reservation.currency,
          status: 'pending',
          rawPayload: attempt,
          ip: req.ip,
        },
      });
      await audit(tx, { actorUserId: req.auth?.user?.id ?? null, action: 'payment.initiated', entity: 'payment', entityId: payment.id, after: { provider: 'mpesa', providerReference: attempt.checkoutRequestId }, ip: req.ip });
    });

    res.status(201).json({ status: 'pending', provider: 'mpesa', message: 'Check your phone and enter your M-Pesa PIN to complete the payment.' });
  } catch (err) { next(err); }
});

// Daraja callback. Safaricom does not sign callbacks, so the bytes on the wire are NEVER
// proof of payment: every settlement is independently verified through stkQuery (our credentials).
// Callback = hint. Daraja = oracle. Always 200 when we handled the outcome; 503 only when we
// cannot verify right now (sweeper + manual requery are the recovery paths — do NOT rely on provider retries).
webhooksRouter.post('/webhooks/mpesa', async (req, res) => {
  const reply = (code, desc) => res.json({ ResultCode: code, ResultDesc: desc });
  try {
    if (env.mpesaWebhookAllowedIps.length && !env.mpesaWebhookAllowedIps.includes(req.ip)) {
      logger.warn({ ip: req.ip }, 'mpesa callback rejected by IP allowlist');
      return reply(1, 'Rejected');
    }
    const cb = req.body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return reply(1, 'Malformed callback');
    const checkoutRequestId = String(cb.CheckoutRequestID);
    const items = cb?.CallbackMetadata?.Item || [];
    const amount = Number(items.find((i) => i?.Name === 'Amount')?.Value);

    const payment = await prisma.payment.findUnique({ where: { providerReference: checkoutRequestId }, include: { reservation: true } });
    if (!payment) return reply(1, 'Unknown transaction');

    // Terminal-state idempotency: any terminal payment ignores further callbacks entirely.
    if (['succeeded', 'failed', 'refunded', 'partially_refunded'].includes(payment.status)) {
      if (Number(cb.ResultCode) === 0 && payment.status !== 'succeeded') {
        logger.error({ reference: maskRef(payment.reservation?.reference), paymentId: payment.id, status: payment.status }, 'mpesa success callback against a settled terminal payment - manual reconciliation required');
      }
      return reply(0, `Accepted (already ${payment.status})`);
    }

    // NEVER trust the callback: verify the outcome with Daraja first.
    let query;
    try {
      query = await stkQuery(checkoutRequestId);
    } catch (err) {
      logger.warn({ paymentId: payment.id, err: String(err?.message || err) }, 'mpesa verify-query failed; leaving payment pending for sweeper recovery');
      return reply(503, 'Verify unavailable');
    }

    let confirmed = false;
    let failReason = 'payment_failed';
    let settledElsewhere = false;
    await prisma.$transaction(async (tx) => {
      // Layer 1 net-capture guard (defence-in-depth behind the DB trigger).
      // Daraja carries no amount on query; our row is the amount authority.
      if (query.resultCode === 0) {
        const totals = await tx.payment.aggregate({ where: { reservationId: payment.reservationId, status: 'succeeded' }, _sum: { amountMinor: true } });
        const refundedAgg = await tx.paymentAttempt.aggregate({ where: { payment: { reservationId: payment.reservationId }, status: 'refunded' }, _sum: { amountMinor: true } });
        const net = (totals._sum.amountMinor || 0) - (refundedAgg._sum.amountMinor || 0);
        if (net + payment.amountMinor > payment.reservation.totalMinor) {
          logger.error({ reference: maskRef(payment.reservation?.reference), paymentId: payment.id }, 'mpesa settlement would exceed reservation total; manual review required');
          query = { ...query, resultCode: -1, resultDesc: 'OVER_CAPTURE_REFUSED' };
        }
      }

      if (query.resultCode === -1) {
        // Excess settlement: DO NOT move money to fulfilled-state, DO NOT flip to failed, DO NOT release rooms
        // of an already-confirmed reservation. Leave the payment pending for staff reconciliation with Daraja receipts.
        await audit(tx, { action: 'payment.over_capture_refused', entity: 'payment', entityId: payment.id, after: { reason: 'OVER_CAPTURE_REFUSED', amountMinor: payment.amountMinor }, ip: req.ip });
        failReason = 'manual_review';
      } else if (query.resultCode === 0) {
        const amountOk = !Number.isFinite(amount) || Math.round(amount * 100) === payment.amountMinor; // corroboration, fail closed only if present-and-mismatched
        const claim = await tx.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'succeeded', capturedAt: new Date() } });
        if (claim.count === 1 && !amountOk) {
          // Tampered self-reported amount alongside a Daraja-verified success: do not confirm.
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: 'Amount mismatch' } });
          await tx.paymentAttempt.create({
            data: {
              reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId,
              amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, currency: 'KES',
              status: 'failed', rawPayload: { callback: req.body, query: query.raw }, verified: true, ip: req.ip,
            },
          });
          await releaseAllocationsIfUnsettled(tx, payment.reservationId);
          await audit(tx, { action: 'payment.amount_mismatch', entity: 'payment', entityId: payment.id, after: { reason: 'Amount mismatch' }, ip: req.ip });
          failReason = 'Amount mismatch';
        } else if (claim.count === 1) {
          await tx.paymentAttempt.create({
            data: {
              reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId,
              amountMinor: payment.amountMinor, currency: payment.currency,
              status: 'succeeded', rawPayload: { callback: req.body, query: query.raw }, verified: true, ip: req.ip,
            },
          });
          const { confirmReservationTx } = await import('../../lib/confirm.js');
          await confirmReservationTx(tx, { reservation: payment.reservation, ip: req.ip, requestId: req.id, note: 'mpesa webhook (verified via STK query)' });
          confirmed = true;
        }
        // claim.count === 0: another writer settled us in the meantime — no-op (replay-safe).
        if (query.resultCode === 0 && !confirmed) settledElsewhere = true;
      } else if (query.resultCode !== null && query.resultCode !== 9999) {
        const claim = await tx.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'failed', failureReason: query.resultDesc || `STK query returned ${query.resultCode}` } });
        if (claim.count === 1) {
          await tx.paymentAttempt.create({
            data: {
              reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId,
              amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, currency: payment.currency,
              status: 'failed', rawPayload: { callback: req.body, query: query.raw }, verified: true, ip: req.ip,
            },
          });
          await releaseAllocationsIfUnsettled(tx, payment.reservationId);
          await audit(tx, { action: 'payment.failed', entity: 'payment', entityId: payment.id, after: { reason: query.resultDesc || String(query.resultCode) }, ip: req.ip });
          failReason = query.resultDesc || `stk_query_${query.resultCode}`;
          logger.warn({ reference: maskRef(payment.reservation?.reference), reason: failReason }, 'mpesa payment failed per Daraja verify');
        } else {
          settledElsewhere = true;
        }
      } else {
        // 9999 / null: still processing. Never fail closed on an indeterminate provider state.
        await tx.paymentAttempt.create({
          data: {
            reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId,
            amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null, currency: payment.currency,
            status: 'pending', rawPayload: { callback: req.body, query: query.raw }, verified: false, ip: req.ip,
          },
        });
        failReason = 'verify_inconclusive';
      }
    });
    if (confirmed) await afterConfirmed(payment.reservationId);
    else if (!settledElsewhere && failReason !== 'verify_inconclusive' && failReason !== 'manual_review') await afterFailed({ reservationId: payment.reservationId, reason: failReason });

    return reply(0, 'Accepted');
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'mpesa callback error');
    return reply(1, 'Internal error');
  }
});

adminPaymentsRouter.post('/admin/payments/manual', requireRole('receptionist', 'manager', 'admin'), validate(recordDeskPaymentSchema), async (req, res, next) => {
  try {
    const { reservationReference, amountMinor, method, note } = req.validatedBody;
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT id, "roomTypeId", "checkIn", "checkOut", rooms, status, "totalMinor", reference, currency FROM reservation WHERE reference = ${reservationReference} FOR UPDATE`;
      const reservation = locked[0];
      if (!reservation) throw notFound('Reservation not found.');
      if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
        throw badRequest(`This reservation is ${reservation.status.replace('_', ' ')}.`);
      }
      if (amountMinor !== reservation.totalMinor) {
        throw badRequest(`Desk payment must settle the full balance of ${reservation.totalMinor} minor units (received ${amountMinor}).`);
      }
      const already = await tx.payment.aggregate({ where: { reservationId: reservation.id, status: 'succeeded' }, _sum: { amountMinor: true } });
      if ((already._sum.amountMinor || 0) >= reservation.totalMinor) throw conflict('This reservation is already paid in full.');

      const providerReference = `DESK-${reservation.id}-${Math.random().toString(36).slice(2, 10)}`;
      const payment = await tx.payment.create({
        data: { reservationId: reservation.id, provider: 'manual', amountMinor, status: 'succeeded', capturedAt: new Date(), providerReference },
      });
      await tx.paymentAttempt.create({
        data: { reservationId: reservation.id, paymentId: payment.id, provider: 'manual', providerReference, amountMinor, currency: reservation.currency ?? 'KES', status: 'succeeded', rawPayload: { method, note }, verified: true, ip: req.ip },
      });
      let outcome = { outcome: 'confirmed', reservation: { status: reservation.status } };
      if (reservation.status === 'pending') {
        const { confirmReservationTx } = await import('../../lib/confirm.js');
        outcome = await confirmReservationTx(tx, { reservation, actorUserId: req.auth.user.id, ip: req.ip, requestId: req.id, note: `desk payment (${method})` });
      }
      await audit(tx, { actorUserId: req.auth.user.id, action: 'payment.desk_recorded', entity: 'payment', entityId: payment.id, after: { method, amountMinor, note }, ip: req.ip });
      return { payment, outcome };
    });

    if (result.payment && result.outcome.outcome !== 'already') await afterConfirmed(result.payment.reservationId);

    res.status(201).json({ paymentId: result.payment.id, status: 'succeeded', reservationStatus: result.outcome.outcome, message: 'Payment recorded and reservation updated.' });
  } catch (err) { next(err); }
});

// M10 Phase 0 — Administrative settlement: desk payment (exact balance, receptionist+)
// or complimentary/management override (no payment record, manager+, mandatory note, role-attributed).
// Always goes through the same confirmation funnel (allocations enforced).
adminPaymentsRouter.post('/admin/reservations/:reference/settle', requireRole('receptionist', 'manager', 'admin'), validate(recordSettlementSchema), async (req, res, next) => {
  try {
    const isComp = req.validatedBody.reason !== 'desk_payment';
    const isStaffManagerPlus = ['manager', 'admin'].some((r) => req.auth.roles.includes(r));
    if (isComp && !isStaffManagerPlus) {
      throw forbidden('Only a manager or admin may settle a reservation as complimentary or an override.');
    }
    const body = req.validatedBody;
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT id, "roomTypeId", "checkIn", "checkOut", rooms, status, "totalMinor", reference, currency FROM reservation WHERE reference = ${req.params.reference} FOR UPDATE`;
      const reservation = locked[0];
      if (!reservation) throw notFound('Reservation not found.');
      if (reservation.status !== 'pending' && reservation.status !== 'confirmed' && reservation.status !== 'needs_allocation') {
        throw badRequest(`This reservation is ${String(reservation.status).replace('_', ' ')} and cannot be settled.`);
      }
      const totals = await tx.payment.aggregate({ where: { reservationId: reservation.id, status: 'succeeded' }, _sum: { amountMinor: true } });
      const refundedAgg = await tx.paymentAttempt.aggregate({ where: { payment: { reservationId: reservation.id }, status: 'refunded' }, _sum: { amountMinor: true } });
      const alreadyNet = (totals._sum.amountMinor || 0) - (refundedAgg._sum.amountMinor || 0);
      const remaining = reservation.totalMinor - alreadyNet;

      let payment = null;
      if (!isComp) {
        if (remaining <= 0) throw conflict('This reservation is already paid in full.');
        if (body.amountMinor !== remaining) {
          throw badRequest(`Desk settlement must equal the remaining balance of ${remaining} minor units (received ${body.amountMinor}).`);
        }
        const providerReference = `DESK-${reservation.id}-${Math.random().toString(36).slice(2, 10)}`;
        payment = await tx.payment.create({
          data: { reservationId: reservation.id, provider: 'manual', amountMinor: body.amountMinor, status: 'succeeded', capturedAt: new Date(), providerReference },
        });
        await tx.paymentAttempt.create({
          data: { reservationId: reservation.id, paymentId: payment.id, provider: 'manual', providerReference, amountMinor: body.amountMinor, currency: reservation.currency ?? 'KES', status: 'succeeded', rawPayload: { method: body.method, reason: body.reason, externalRef: body.externalRef ?? null, note: body.note ?? null }, verified: true, ip: req.ip },
        });
      }
      const { confirmReservationTx } = await import('../../lib/confirm.js');
      const outcome = await confirmReservationTx(tx, { reservation, actorUserId: req.auth.user.id, ip: req.ip, requestId: req.id, note: isComp ? `comp: ${body.reason}${body.note ? ` — ${body.note}` : ''}` : `desk settlement (${body.method})` });
      await audit(tx, { actorUserId: req.auth.user.id, action: isComp ? 'reservation.comp_confirmed' : 'payment.desk_settled', entity: isComp ? 'reservation' : 'payment', entityId: isComp ? reservation.id : payment.id, after: { reason: body.reason, method: body.method, externalRef: body.externalRef ?? null, note: body.note ?? null, actorRoles: req.auth.roles, outcome: outcome.outcome }, ip: req.ip });
      return { payment, outcome };
    });

    if (result.outcome.outcome === 'needs_allocation') {
      await prisma.emailOutbox.create({
        data: {
          template: 'adminAllocationNeeded',
          to: env.adminNotificationEmail || 'front-desk@thestillhouse.example',
          subject: `ACTION REQUIRED: allocate room for ${req.params.reference}`,
          relatedType: 'reservation',
          relatedId: String(req.params.reference),
          dedupeKey: `allocation-needed:${req.params.reference}`,
          status: 'pending',
        },
      }).catch((err) => logger.warn({ err: String(err?.message || err) }, 'allocation-needed outbox row not written'));
    }
    if (result.payment && result.outcome.outcome === 'confirmed') await afterConfirmed(result.payment.reservationId);

    res.status(201).json({ outcome: result.outcome.outcome, reservationStatus: result.outcome.outcome, paymentId: result.payment?.id ?? null, message: isComp ? 'Reservation settled as complimentary and confirmed.' : 'Payment recorded and reservation settled.' });
  } catch (err) { next(err); }
});

// M10 follow-up — recovery for settled bookings whose hold expired before settlement.
// Re-attempts allocation through the same confirmation funnel. Safe: no funds move
// without the settle route; this endpoint only places rooms for already-settled bookings.
// Audit: reservation.assigned_confirmed | reservation.assigned_needs_allocation.
adminPaymentsRouter.post('/admin/reservations/:reference/assign-rooms', requireRole('receptionist', 'manager', 'admin'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT id FROM reservation WHERE reference = ${req.params.reference} FOR UPDATE`;
      const existing = locked[0] ? await tx.reservation.findUnique({ where: { id: locked[0].id } }) : null;
      if (!existing) throw notFound('Reservation not found.');
      if (existing.status !== 'needs_allocation') {
        throw badRequest(`Only a reservation awaiting allocation can be assigned (current: ${String(existing.status).replace('_', ' ')}).`);
      }
      const { confirmReservationTx } = await import('../../lib/confirm.js');
      const outcome = await confirmReservationTx(tx, { reservation: existing, actorUserId: req.auth.user.id, ip: req.ip, requestId: req.id, note: 'staff room assignment' });
      await audit(tx, { actorUserId: req.auth.user.id, action: outcome.outcome === 'confirmed' ? 'reservation.assigned_confirmed' : 'reservation.assigned_needs_allocation', entity: 'reservation', entityId: existing.id, after: { outcome: outcome.outcome, reference: existing.reference }, ip: req.ip });
      return outcome;
    });
    if (result.outcome === 'confirmed' && result.reservation?.id) await afterConfirmed(result.reservation.id);
    res.json({ outcome: result.outcome, reservationStatus: result.outcome === 'confirmed' ? 'confirmed' : 'needs_allocation', message: result.outcome === 'confirmed' ? 'Room assigned and reservation confirmed.' : 'Still no room available for this stay; resolve or refund.' });
  } catch (err) { next(err); }
});

adminPaymentsRouter.post('/admin/payments/:id/requery', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId)) throw badRequest('Invalid payment id.');
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { reservation: true },
    });
    if (!payment) throw notFound('Payment not found.');
    if (payment.provider !== 'mpesa') throw badRequest('STK requery only applies to M-Pesa payments.');
    if (payment.status !== 'pending') {
      throw conflict(`This payment is ${payment.status}; requery is only meaningful while pending.`);
    }
    if (!mpesaConfigured()) {
      throw new ApiError(503, 'MPESA_NOT_CONFIGURED', 'M-Pesa is not configured. No query can be sent to Daraja.');
    }

    const query = await stkQuery(payment.providerReference);
    const checkoutRequestId = payment.providerReference;

    // ResultCode semantics (Daraja): 0 = paid; 9999 / null-timeout class = still processing; anything else = failure.
    if (query.resultCode === 0) {
      const totals = await prisma.payment.aggregate({ where: { reservationId: payment.reservationId, status: 'succeeded' }, _sum: { amountMinor: true } });
      const refundedAgg = await prisma.paymentAttempt.aggregate({ where: { payment: { reservationId: payment.reservationId }, status: 'refunded' }, _sum: { amountMinor: true } });
      const net = (totals._sum.amountMinor || 0) - (refundedAgg._sum.amountMinor || 0);
      if (net + payment.amountMinor > payment.reservation.totalMinor) {
        logger.error({ paymentId: payment.id, reservationId: payment.reservationId }, 'requery settlement would exceed reservation total; manual review required');
        return res.json({ outcome: 'manual_review', reason: 'OVER_CAPTURE_REFUSED' });
      }
      await prisma.$transaction(async (tx) => {
        const claim = await tx.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'succeeded', capturedAt: new Date() } });
        if (claim.count !== 1) return;
        await tx.paymentAttempt.create({
          data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId, amountMinor: payment.amountMinor, currency: payment.currency, status: 'succeeded', rawPayload: query.raw, verified: true, ip: req.ip },
        });
        await confirmReservationTx(tx, { reservation: payment.reservation, actorUserId: req.auth.user.id, ip: req.ip, requestId: req.id, note: 'stk requery' });
      });
      await afterConfirmed(payment.reservationId);
      return res.json({ outcome: 'confirmed' });
    }

    if (query.resultCode === null || query.resultCode === 9999) {
      await prisma.paymentAttempt.create({
        data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId, amountMinor: payment.amountMinor, currency: payment.currency, status: 'pending', rawPayload: query.raw, verified: false, ip: req.ip },
      });
      return res.json({ outcome: 'still_pending', resultDesc: query.resultDesc });
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.create({
        data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId, amountMinor: payment.amountMinor, currency: payment.currency, status: 'failed', rawPayload: query.raw, verified: true, ip: req.ip },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: query.resultDesc || `STK query returned ${query.resultCode}` } });
      const { releaseAllocationsIfUnsettled } = await import('../../lib/allocations.js');
      await releaseAllocationsIfUnsettled(tx, payment.reservationId);
      await audit(tx, { actorUserId: req.auth.user.id, action: 'payment.requery_failed', entity: 'payment', entityId: payment.id, after: { resultCode: query.resultCode, resultDesc: query.resultDesc }, ip: req.ip });
    });
    await afterFailed({ reservationId: payment.reservationId, reason: query.resultDesc || `stk_query_${query.resultCode}` });
    return res.json({ outcome: 'failed', resultDesc: query.resultDesc });
  } catch (err) { next(err); }
});

adminPaymentsRouter.post('/admin/payments/:id/refund', requireRole('manager', 'admin'), async (req, res, next) => {
  try {
    const paymentId = Number(req.params.id);
    const amountMinor = Number(req.body?.amountMinor);
    const reason = String(req.body?.reason || 'Refund issued (manual settlement)');
    if (!Number.isInteger(paymentId) || !Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw badRequest('A payment id and a positive amountMinor are required.');
    }
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw notFound('Payment not found.');
    if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
      throw badRequest('Only a succeeded or partially refunded payment can be refunded.');
    }

    // Lock the reservation so a refund cannot race a concurrent settlement.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM reservation WHERE id = ${payment.reservationId} FOR UPDATE`;
      const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!fresh || (fresh.status !== 'succeeded' && fresh.status !== 'partially_refunded')) {
        throw badRequest('Payment state changed; refresh and try again.');
      }
      const refundedAgg = await tx.paymentAttempt.aggregate({ where: { paymentId: payment.id, status: 'refunded' }, _sum: { amountMinor: true } });
      const alreadyRefunded = refundedAgg._sum.amountMinor || 0;
      if (amountMinor + alreadyRefunded > fresh.amountMinor) {
        throw badRequest(`Refund would exceed the paid amount (${fresh.amountMinor} minor units; already refunded ${alreadyRefunded}).`);
      }
      const fully = amountMinor + alreadyRefunded >= fresh.amountMinor;
      const u = await tx.payment.update({
        where: { id: payment.id },
        data: { status: fully ? 'refunded' : 'partially_refunded' },
      });
      await tx.paymentAttempt.create({
        data: { reservationId: payment.reservationId, paymentId: payment.id, provider: payment.provider, providerReference: `REFUND-${payment.id}-${Math.random().toString(36).slice(2, 10)}`, amountMinor, currency: payment.currency, status: 'refunded', rawPayload: { reason, note: 'Manual refund recorded by staff; funds moved outside this system.', requestedBy: req.auth?.user?.id ?? null }, verified: true, ip: req.ip },
      });
      await audit(tx, { actorUserId: req.auth.user.id, action: 'payment.refunded', entity: 'payment', entityId: payment.id, after: { amountMinor, reason, status: u.status }, ip: req.ip });
      return u;
    });
    res.json({ paymentId: updated.id, status: updated.status });
  } catch (err) { next(err); }
});
