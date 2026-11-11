// Transactional email service. Delivery is tracked in `email_outbox`; duplicate sends are impossible
// per (template, dedupeKey). Never throws — callers get { status, ... } and booking flows never break.
import { prisma } from '../../lib/prisma.js';
import { logger, maskRef } from '../../lib/logger.js';
import { createTransport, emailConfigured } from './transport.js';
import { renderTemplate } from './templates.js';
import { env } from '../../config/env.js';

const MAX_ATTEMPTS = 3;

/**
 * Send (or record a skip for) a transactional email.
 * @param {{ template: string, to: string, dedupeKey: string, vars: object, relatedType?: string, relatedId?: string }} args
 */
export async function sendEmail({ template, to, dedupeKey, vars, relatedType, relatedId }) {
  try {
    const { subject, html, text } = renderTemplate(template, vars);

    // Dedupe: unique dedupeKey means this exact logical email happens once.
    let outbox;
    try {
      outbox = await prisma.emailOutbox.create({
        data: { dedupeKey, to, template, subject, relatedType: relatedType ?? null, relatedId: relatedId != null ? String(relatedId) : null, status: 'pending' },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        const existing = await prisma.emailOutbox.findUnique({ where: { dedupeKey } });
        return { status: existing?.status || 'already_recorded', outboxId: existing?.id ?? null, duplicate: true };
      }
      throw err;
    }

    const transport = createTransport();
    if (!transport) {
      await prisma.emailOutbox.update({ where: { id: outbox.id }, data: { status: 'skipped', error: 'EMAIL_NOT_CONFIGURED' } });
      logger.info({ template, dedupeKey }, 'email skipped (provider not configured)');
      return { status: 'skipped', outboxId: outbox.id };
    }

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const info = await transport.sendMail({ from: env.emailFrom, to, subject, html, text });
        await prisma.emailOutbox.update({
          where: { id: outbox.id },
          data: { status: 'sent', attempts: attempt, sentAt: new Date(), providerMessageId: info?.messageId || null, error: null },
        });
        logger.info({ template, dedupeKey, to: String(to).replace(/^(.{2}).*(@.*)$/, '$1••$2') }, 'email sent');
        return { status: 'sent', outboxId: outbox.id };
      } catch (err) {
        lastError = err;
        logger.warn({ template, attempt, err: String(err?.message || err) }, 'email attempt failed');
      }
    }

    await prisma.emailOutbox.update({
      where: { id: outbox.id },
      data: { status: 'failed', attempts: MAX_ATTEMPTS, error: String(lastError?.message || lastError).slice(0, 500) },
    });
    return { status: 'failed', outboxId: outbox.id, error: 'send_failed' };
  } catch (err) {
    logger.error({ err: String(err?.message || err), template }, 'email pipeline failure');
    return { status: 'error', error: 'email_pipeline_failure' };
  }
}

export const sendBookingConfirmation = ({ guest, reservation, room, ratePlan }) =>
  sendEmail({
    template: 'bookingConfirmation',
    to: guest.email,
    dedupeKey: `booking-confirmation:${reservation.reference}`,
    vars: {
      firstName: guest.firstName,
      reference: reservation.reference,
      roomName: room.name,
      ratePlanName: ratePlan.name,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      adults: reservation.adults,
      children: reservation.children,
      rooms: reservation.rooms,
      totalMinor: reservation.totalMinor,
      statusLabel: 'Pending payment',
    },
    relatedType: 'reservation',
    relatedId: reservation.id,
  });

export const sendAdminNewBooking = ({ guest, reservation, room, ratePlan, requests }) => {
  if (!env.adminNotificationEmail) return { status: 'skipped', reason: 'ADMIN_NOTIFICATION_EMAIL not set' };
  return sendEmail({
    template: 'adminNewBooking',
    to: env.adminNotificationEmail,
    dedupeKey: `admin-new-booking:${reservation.reference}`,
    vars: {
      reference: reservation.reference,
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      roomName: room.name,
      ratePlanName: ratePlan.name,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      totalMinor: reservation.totalMinor,
      source: 'web',
      requests: requests || '',
    },
    relatedType: 'reservation',
    relatedId: reservation.id,
  });
};

export const sendPaymentReceived = ({ guest, reservation }) =>
  sendEmail({
    template: 'paymentReceived',
    to: guest.email,
    dedupeKey: `payment-received:${reservation.reference}`,
    vars: {
      firstName: guest.firstName,
      reference: reservation.reference,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      totalMinor: reservation.totalMinor,
    },
    relatedType: 'reservation',
    relatedId: reservation.id,
  });

export const sendBookingCancelled = ({ guest, reservation, cancelFeeMinor }) =>
  sendEmail({
    template: 'bookingCancelled',
    to: guest.email,
    dedupeKey: `booking-cancelled:${reservation.reference}`,
    vars: {
      firstName: guest.firstName,
      reference: reservation.reference,
      cancelFeeMinor: cancelFeeMinor ?? 0,
    },
    relatedType: 'reservation',
    relatedId: reservation.id,
  });

export const sendPasswordReset = ({ user, guest, token }) =>
  sendEmail({
    template: 'passwordReset',
    to: user.email,
    dedupeKey: `password-reset:${user.id}:${token.slice(-8)}`,
    vars: {
      firstName: guest?.firstName || user.name?.split(' ')[0] || 'guest',
      resetUrl: `${env.frontendBaseUrl}/reset-password?token=${encodeURIComponent(token)}`,
    },
    relatedType: 'user',
    relatedId: user.id,
  });
