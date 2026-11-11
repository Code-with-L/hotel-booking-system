// Reservations: create (hold), retrieve, cancel, guest account history.
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { createReservationTx, reservationPayload } from '../../lib/reservationService.js';
import { createReservationSchema, cancelReservationSchema } from '@stillhouse/shared';
import { requireAuth, isStaff, validate } from '../../middleware/index.js';
import { badRequest, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { releaseAllocations } from '../../lib/allocations.js';
import { audit } from '../../lib/audit.js';
import { accountPayload } from '../../lib/account.js';
import { updateProfileSchema } from '@stillhouse/shared';
import { afterCreated, afterCancelled } from '../../lib/postBookingEvents.js';

export const reservationsRouter = Router();
export const accountRouter = Router();

const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked-in', checked_out: 'Checked-out', cancelled: 'Cancelled', expired: 'Expired' };

export const toListItem = (r, roomNumbers = []) => ({
  id: r.reference, // client-side identifier used across admin pages
  reference: r.reference,
  roomName: r.roomType?.name,
  roomSlug: r.roomType?.slug,
  roomNumbers,
  ratePlanId: r.ratePlan?.key,
  arrival: r.checkIn.toISOString().slice(0, 10),
  departure: r.checkOut.toISOString().slice(0, 10),
  nights: r.nights,
  adults: r.adults,
  children: r.children,
  rooms: r.rooms,
  totalMinor: r.totalMinor,
  total: Math.round(r.totalMinor / 100),
  currency: r.currency,
  status: STATUS_LABEL[r.status] || r.status,
  statusRaw: r.status,
  requests: r.specialRequests || '',
  createdAt: r.createdAt.toISOString(),
  guestName: r.guest ? `${r.guest.firstName} ${r.guest.lastName}`.trim() : undefined,
  guestEmail: r.guest?.email,
  guestPhone: r.guest?.phone,
});

reservationsRouter.post('/reservations', validate(createReservationSchema), async (req, res, next) => {
  try {
    const idempotencyKey = req.header('idempotency-key') || req.header('Idempotency-Key');
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw badRequest('An Idempotency-Key header (min 8 characters) is required.');
    }
    // Idempotent replay: return the original reservation
    const existing = await prisma.reservation.findUnique({
      where: { idempotencyKey },
      include: { guest: true, roomType: true, ratePlan: true },
    });
    if (existing) {
      return res.status(200).json(reservationPayload({
        reservation: existing,
        guest: existing.guest,
        roomType: existing.roomType,
        ratePlan: existing.ratePlan,
        pricing: { nightlyMinor: existing.nightlyMinor },
      }));
    }
    const { checkIn, checkOut, adults, children, rooms, roomTypeSlug, ratePlanKey, guest, source } = req.validatedBody;
    const result = await createReservationTx({
      checkIn, checkOut, adults, children, rooms, roomTypeSlug, ratePlanKey, guest,
      source: req.auth ? 'web' : (source || 'web'),
      idempotencyKey,
      actorUserId: req.auth?.user?.id ?? null,
      ip: req.ip,
    });
    await afterCreated(result);
    res.status(201).json(reservationPayload(result));
  } catch (err) { next(err); }
});

const loadWithRooms = (reference) =>
  prisma.reservation.findUnique({
    where: { reference },
    include: { guest: true, roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } } },
  });

const canSee = (req, reservation) => {
  if (isStaff(req)) return true;
  if (!req.auth) return false;
  const email = req.auth.guest?.email || req.auth.user?.email;
  return email && reservation.guest?.email === email;
};

reservationsRouter.get('/reservations/:reference', async (req, res, next) => {
  try {
    const email = (req.query.email || '').toString().trim().toLowerCase();
    const reservation = await loadWithRooms(req.params.reference);
    if (!reservation) throw notFound('Reservation not found.');
    const allowed = canSee(req, reservation) || (email && reservation.guest?.email === email);
    if (!allowed) throw forbidden();
    res.json(reservationPayload({
      reservation,
      guest: reservation.guest,
      roomType: reservation.roomType,
      ratePlan: reservation.ratePlan,
      pricing: { nightlyMinor: reservation.nightlyMinor },
    }));
  } catch (err) { next(err); }
});

reservationsRouter.post('/reservations/:reference/cancel', validate(cancelReservationSchema), async (req, res, next) => {
  try {
    const reservation = await loadWithRooms(req.params.reference);
    if (!reservation) throw notFound('Reservation not found.');
    if (!canSee(req, reservation)) throw forbidden();
    if (['cancelled', 'expired', 'checked_in', 'checked_out'].includes(reservation.status)) {
      throw badRequest(`A reservation that is ${STATUS_LABEL[reservation.status]} cannot be cancelled.`);
    }
    const plan = reservation.ratePlan;
    const policy = plan.cancellationPolicy || {};
    const windowHours = Number(policy.windowHours ?? 0);
    const penaltyPercent = Number(policy.penaltyPercent ?? 100);
    const hoursUntilCheckIn = (reservation.checkIn.getTime() - Date.now()) / 3_600_000;
    let fee = 0;
    if (!plan.refundable) fee = reservation.totalMinor;
    else if (hoursUntilCheckIn >= windowHours) fee = 0;
    else fee = Math.round(reservation.nightlyMinor * (penaltyPercent / 100));

    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: req.validatedBody.reason || null, cancelFeeMinor: fee },
      });
      await releaseAllocations(tx, { sourceType: 'reservation', sourceId: reservation.id, state: 'released' });
      await audit(tx, { actorUserId: req.auth?.user?.id ?? null, action: 'reservation.cancelled', entity: 'reservation', entityId: r.id, after: { reference: r.reference, cancelFeeMinor: fee, reason: req.validatedBody.reason || null }, ip: req.ip });
      return r;
    });
    await afterCancelled({ reservationId: updated.id, cancelFeeMinor: fee });

    res.json({
      reference: updated.reference,
      status: STATUS_LABEL[updated.status],
      statusRaw: updated.status,
      cancelFeeMinor: updated.cancelFeeMinor,
      currency: updated.currency,
      message: fee > 0 ? 'Reservation cancelled. A cancellation fee applies as per the rate plan policy.' : 'Reservation cancelled. No fee applies.',
    });
  } catch (err) { next(err); }
});

// --- Guest account ---
accountRouter.get('/account/reservations', requireAuth, async (req, res, next) => {
  try {
    const guestId = req.auth.guest?.id;
    if (!guestId) return res.json({ upcoming: [], previous: [] });
    const rows = await prisma.reservation.findMany({
      where: { guestId },
      include: { roomType: true, ratePlan: true, roomsAssigned: { include: { room: true } } },
      orderBy: { checkIn: 'desc' },
    });
    const today = new Date().toISOString().slice(0, 10);
    const mapped = rows.map((r) => toListItem(r, r.roomsAssigned.map((rr) => rr.room.number)));
    const upcoming = mapped.filter((r) => r.departure >= today && !['Cancelled', 'Expired', 'Checked-out'].includes(r.status)).sort((a, b) => a.arrival.localeCompare(b.arrival));
    const previous = mapped.filter((r) => !upcoming.includes(r));
    res.json({ upcoming, previous });
  } catch (err) { next(err); }
});

accountRouter.put('/account/profile', requireAuth, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const { firstName, lastName, phone, country, notes } = req.validatedBody;
    if (!req.auth.guest) throw notFound('No guest profile attached to this account.');
    const guest = await prisma.guest.update({
      where: { id: req.auth.guest.id },
      data: {
        ...(firstName != null ? { firstName } : {}),
        ...(lastName != null ? { lastName } : {}),
        ...(phone != null ? { phone } : {}),
        ...(country != null ? { country } : {}),
        ...(notes != null ? { notes } : {}),
      },
    });
    let user = req.auth.user;
    if (firstName != null || lastName != null) {
      const name = `${guest.firstName} ${guest.lastName}`.trim();
      user = await prisma.user.update({ where: { id: user.id }, data: { name }, include: { roles: { include: { role: true } } } });
    }
    res.json({ account: accountPayload(user, guest) });
  } catch (err) { next(err); }
});
