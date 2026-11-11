// Payments: M-Pesa initiation + callback, desk (manual) payments, refunds.
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { initiatePaymentSchema, recordDeskPaymentSchema } from '@stillhouse/shared';
import { validate, requireRole, isStaff } from '../../middleware/index.js';
import { badRequest, notFound, forbidden, conflict, ApiError } from '../../lib/errors.js';
import { mpesaConfigured, stkPush } from '../../lib/mpesa.js';
import { confirmReservationTx } from '../../lib/confirm.js';
import { releaseAllocations } from '../../lib/allocations.js';
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

paymentsRouter.post('/payments', validate(initiatePaymentSchema), async (req, res, next) => {
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

    res.status(201).json({ status: 'pending', provider: 'mpesa', checkoutRequestId: attempt.checkoutRequestId, message: 'Check your phone and enter your M-Pesa PIN to complete the payment.' });
  } catch (err) { next(err); }
});

// Daraja callback. Safaricom does not sign callbacks, so verification here is:
// optional IP allowlist (MPESA_WEBHOOK_ALLOWED_IPS) + payload structure + amount/reference match.
// See docs/SECURITY.md §5. Always 200 quickly; Daraja retries on non-200.
webhooksRouter.post('/webhooks/mpesa', async (req, res) => {
  const reply = (code, desc) => res.json({ ResultCode: code, ResultDesc: desc });
  try {
    if (env.mpesaWebhookAllowedIps.length && !env.mpesaWebhookAllowedIps.includes(req.ip)) {
      return reply(1, 'Rejected');
    }
    const cb = req.body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return reply(1, 'Malformed callback');
    const checkoutRequestId = String(cb.CheckoutRequestID);
    const resultCode = Number(cb.ResultCode);
    const items = cb?.CallbackMetadata?.Item || [];
    const amount = Number(items.find((i) => i?.Name === 'Amount')?.Value);

    const payment = await prisma.payment.findUnique({ where: { providerReference: checkoutRequestId }, include: { reservation: true } });
    if (!payment) return reply(1, 'Unknown transaction');

    // Terminal-state idempotency: any terminal payment ignores further callbacks entirely.
    // A success callback against a settled-failed payment is an anomaly ops must see - log it, never silently flip.
    if (['succeeded', 'failed', 'refunded', 'partially_refunded'].includes(payment.status)) {
      if (Number(cb.ResultCode) === 0 && payment.status !== 'succeeded') {
        logger.error({ reference: maskRef(payment.reservation?.reference), paymentId: payment.id, status: payment.status }, 'mpesa success callback against a settled terminal payment - manual reconciliation required');
      }
      return reply(0, `Accepted (already ${payment.status})`);
    }

    let confirmed = false;
    let failReason = 'payment_failed';
    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.create({
        data: {
          reservationId: payment.reservationId,
          paymentId: payment.id,
          provider: 'mpesa',
          providerReference: checkoutRequestId,
          amountMinor: Number.isFinite(amount) ? Math.round(amount * 100) : null,
          currency: 'KES',
          status: resultCode === 0 ? 'succeeded' : 'failed',
          rawPayload: req.body,
          verified: true,
          ip: req.ip,
        },
      });

      if (resultCode === 0 && Number.isFinite(amount) && Math.round(amount * 100) === payment.amountMinor) {
        // Keep providerReference as the CheckoutRequestID (stable lookup key). The receipt number
        // is preserved in payment_attempt.raw_payload and never needed for idempotency.
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'succeeded', capturedAt: new Date() } });
        await confirmReservationTx(tx, { reservation: payment.reservation, ip: req.ip, note: 'mpesa webhook' });
        confirmed = true;
      } else {
        failReason = resultCode === 0 ? 'Amount mismatch' : (cb.ResultDesc || 'Payment failed or cancelled');
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed', failureReason: failReason } });
        await releaseAllocations(tx, { sourceType: 'reservation', sourceId: payment.reservationId, state: 'released' });
        await audit(tx, { action: 'payment.failed', entity: 'payment', entityId: payment.id, after: { reason: failReason }, ip: req.ip });
        logger.warn({ reference: maskRef(payment.reservation?.reference), reason: failReason }, 'mpesa callback settled as failed');
      }
    });
    if (confirmed) await afterConfirmed(payment.reservationId);
    else await afterFailed({ reservationId: payment.reservationId, reason: failReason });

    return reply(0, 'Accepted');
  } catch (err) {
    logger.error({ err: String(err?.message || err) }, 'mpesa callback error');
    return reply(1, 'Internal error');
  }
});

adminPaymentsRouter.post('/admin/payments/manual', requireRole('receptionist', 'manager', 'admin'), validate(recordDeskPaymentSchema), async (req, res, next) => {
  try {
    const { reservationReference, amountMinor, method, note } = req.validatedBody;
    const reservation = await prisma.reservation.findUnique({ where: { reference: reservationReference }, include: { guest: true } });
    if (!reservation) throw notFound('Reservation not found.');
    if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
      throw badRequest(`This reservation is ${reservation.status.replace('_', ' ')}.`);
    }
    if (amountMinor !== reservation.totalMinor) {
      throw badRequest(`Desk payment must settle the full balance of ${reservation.totalMinor} minor units (received ${amountMinor}).`);
    }
    const already = await prisma.payment.aggregate({ where: { reservationId: reservation.id, status: 'succeeded' }, _sum: { amountMinor: true } });
    if ((already._sum.amountMinor || 0) >= reservation.totalMinor) throw badRequest('This reservation is already paid in full.');

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { reservationId: reservation.id, provider: 'manual', amountMinor, status: 'succeeded', capturedAt: new Date(), providerReference: `DESK-${Date.now()}` },
      });
      await tx.paymentAttempt.create({
        data: { reservationId: reservation.id, paymentId: payment.id, provider: 'manual', providerReference: payment.providerReference, amountMinor, currency: reservation.currency, status: 'succeeded', rawPayload: { method, note }, verified: true, ip: req.ip },
      });
      const confirmed = reservation.status === 'pending'
        ? await confirmReservationTx(tx, { reservation, actorUserId: req.auth.user.id, ip: req.ip, note: `desk payment (${method})` })
        : reservation;
      await audit(tx, { actorUserId: req.auth.user.id, action: 'payment.desk_recorded', entity: 'payment', entityId: payment.id, after: { method, amountMinor, note }, ip: req.ip });
      return { payment, confirmed };
    });
    if (reservation.status === 'pending') await afterConfirmed(reservation.id);

    res.status(201).json({ paymentId: result.payment.id, status: 'succeeded', reservationStatus: result.confirmed.status === 'pending' ? 'confirmed' : result.confirmed.status, message: 'Payment recorded and reservation confirmed.' });
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
      await prisma.$transaction(async (tx) => {
        await tx.paymentAttempt.create({
          data: { reservationId: payment.reservationId, paymentId: payment.id, provider: 'mpesa', providerReference: checkoutRequestId, amountMinor: payment.amountMinor, currency: payment.currency, status: 'succeeded', rawPayload: query.raw, verified: true, ip: req.ip },
        });
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'succeeded', capturedAt: new Date() } });
        await confirmReservationTx(tx, { reservation: payment.reservation, actorUserId: req.auth.user.id, ip: req.ip, note: 'stk requery' });
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
      await releaseAllocations(tx, { sourceType: 'reservation', sourceId: payment.reservationId, state: 'released' });
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
    const refundedAgg = await prisma.paymentAttempt.aggregate({ where: { paymentId: payment.id, status: 'refunded' }, _sum: { amountMinor: true } });
    const alreadyRefunded = refundedAgg._sum.amountMinor || 0;
    if (amountMinor + alreadyRefunded > payment.amountMinor) {
      throw badRequest(`Refund would exceed the paid amount (${payment.amountMinor} minor units; already refunded ${alreadyRefunded}).`);
    }
    const fully = amountMinor + alreadyRefunded >= payment.amountMinor;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.payment.update({
        where: { id: payment.id },
        data: { status: fully ? 'refunded' : 'partially_refunded' },
      });
      await tx.paymentAttempt.create({
        data: { reservationId: payment.reservationId, paymentId: payment.id, provider: payment.provider, providerReference: `REFUND-${Date.now()}`, amountMinor, currency: payment.currency, status: 'refunded', rawPayload: { reason, note: 'Manual refund recorded by staff; funds moved outside this system.' }, verified: true, ip: req.ip },
      });
      await audit(tx, { actorUserId: req.auth.user.id, action: 'payment.refunded', entity: 'payment', entityId: payment.id, after: { amountMinor, reason, status: u.status }, ip: req.ip });
      return u;
    });
    res.json({ paymentId: updated.id, status: updated.status });
  } catch (err) { next(err); }
});
