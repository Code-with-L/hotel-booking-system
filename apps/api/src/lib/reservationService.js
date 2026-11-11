// Reservation lifecycle: the transaction that turns a request into held inventory.
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { computeStayPricing, nightsBetween, toDateOnly, addDaysISO } from './pricing.js';
import { findFreeRooms, insertAllocations, HOLD_TTL_MINUTES } from './allocations.js';
import { badRequest, notFound, roomUnavailable } from './errors.js';
import { audit } from './audit.js';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newReference = () => {
  const year = new Date().getUTCFullYear();
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  return `STL-${year}-${out}`;
};

const MAX_NIGHTS_DEFAULT = 14;

export async function createReservationTx(args) {
  // The reservation is one atomic transaction. On an allocation race (exclusion constraint
  // fired against another guest's committed room), the inner tx rolls back fully and we retry
  // with a fresh candidate set - PostgreSQL cannot continue inside an aborted transaction.
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await innerCreateReservation(args);
    } catch (err) {
      if (err?.code === 'ROOM_UNAVAILABLE') {
        lastErr = err;
        // Back off briefly so the next candidate set reflects what competing in-flight
        // transactions committed (READ COMMITTED only sees committed rows). Without this,
        // an unlucky retry can repeatedly lose to uncommitted speculation holds.
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1) + Math.floor(Math.random() * 60)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || roomUnavailable();
}

async function innerCreateReservation({ checkIn, checkOut, adults = 2, children = 0, rooms = 1, roomTypeSlug, ratePlanKey, guest: guestInput, source = 'web', idempotencyKey, actorUserId = null, ip = null }) {
  const nights = nightsBetween(checkIn, checkOut);
  if (!Number.isInteger(nights) || nights < 1) throw badRequest('Check-out must be after check-in.');
  if (nights > MAX_NIGHTS_DEFAULT) throw badRequest(`Stays longer than ${MAX_NIGHTS_DEFAULT} nights are not supported online. Please contact the hotel directly.`);

  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.findUnique({ where: { slug: roomTypeSlug } });
    if (!roomType) throw badRequest('Unknown room type.');
    const ratePlan = await tx.ratePlan.findFirst({ where: { roomTypeId: roomType.id, key: ratePlanKey } });
    if (!ratePlan) throw badRequest('Unknown rate plan for this room type.');

    if (adults > roomType.maxAdults * rooms) {
      throw badRequest(`This party exceeds the capacity of ${rooms} ${rooms === 1 ? 'room' : 'rooms'} (max ${roomType.maxAdults * rooms} adults).`);
    }
    if (children > roomType.maxChildren * rooms) {
      throw badRequest(`This party exceeds the children capacity of ${rooms} ${rooms === 1 ? 'room' : 'rooms'}.`);
    }

    const pricing = await computeStayPricing(tx, { roomType, ratePlan, checkIn, checkOut, rooms });

    const email = guestInput.email.trim().toLowerCase();
    const guest = await tx.guest.upsert({
      where: { email },
      create: { firstName: guestInput.firstName.trim(), lastName: guestInput.lastName.trim(), email, phone: guestInput.phone.trim(), country: guestInput.country.trim(), notes: guestInput.requests?.trim() || null, marketingConsent: false },
      update: { firstName: guestInput.firstName.trim(), lastName: guestInput.lastName.trim(), phone: guestInput.phone.trim(), country: guestInput.country.trim() },
    });

    const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60 * 1000);
    const checkInDate = toDateOnly(checkIn);
    const checkOutDate = toDateOnly(checkOut);

    let reservation;
    for (let attempt = 0; attempt < 3 && !reservation; attempt += 1) {
      try {
        reservation = await tx.reservation.create({
          data: {
            reference: newReference(),
            guestId: guest.id,
            roomTypeId: roomType.id,
            ratePlanId: ratePlan.id,
            status: 'pending',
            checkIn: checkInDate,
            checkOut: checkOutDate,
            nights,
            adults,
            children,
            rooms,
            nightlyMinor: pricing.nightlyMinor,
            subtotalMinor: pricing.subtotalMinor,
            serviceChargeMinor: pricing.serviceChargeMinor,
            tourismLevyMinor: pricing.tourismLevyMinor,
            vatMinor: pricing.vatMinor,
            totalMinor: pricing.totalMinor,
            currency: pricing.currency,
            specialRequests: guestInput.requests?.trim() || null,
            source,
            idempotencyKey,
          },
        });
      } catch (err) {
        if (err?.code === 'P2002' && String(err?.meta?.target || '').includes('reference')) continue;
        throw err;
      }
    }
    if (!reservation) throw new Error('Could not allocate a booking reference.');

    const free = await findFreeRooms(tx, { roomTypeId: roomType.id, checkIn: checkInDate, checkOut: checkOutDate, count: rooms });
    if (free.length < rooms) throw roomUnavailable();

    await insertAllocations(tx, free.map((room) => ({
      roomId: room.id,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      kind: 'hold',
      state: 'occupying',
      sourceType: 'reservation',
      sourceId: BigInt(reservation.id),
      expiresAt: holdExpiresAt,
    })));

    await tx.reservationRoom.createMany({
      data: free.map((room) => ({ reservationId: reservation.id, roomId: room.id })),
    });

    await audit(tx, { actorUserId, action: 'reservation.created', entity: 'reservation', entityId: reservation.id, after: { reference: reservation.reference, status: 'pending', totalMinor: reservation.totalMinor }, ip });

    return {
      reservation,
      guest,
      roomType,
      ratePlan,
      pricing,
      roomIds: free.map((r) => String(r.id)),
      holdExpiresAt,
    };
  });
}

export function reservationPayload({ reservation, guest, roomType, ratePlan, pricing }) {
  return {
    reference: reservation.reference,
    status: reservation.status,
    createdAt: reservation.createdAt.toISOString(),
    checkIn: reservation.checkIn.toISOString().slice(0, 10),
    checkOut: reservation.checkOut.toISOString().slice(0, 10),
    nights: reservation.nights,
    adults: reservation.adults,
    children: reservation.children,
    rooms: reservation.rooms,
    room: { slug: roomType.slug, name: roomType.name },
    ratePlan: { key: ratePlan.key, name: ratePlan.name, cancellationSummary: ratePlan.cancellationSummary },
    guest: { firstName: guest.firstName, lastName: guest.lastName, email: guest.email, phone: guest.phone, country: guest.country, requests: reservation.specialRequests || '' },
    pricing: {
      nightlyMinor: pricing.nightlyMinor ?? reservation.nightlyMinor,
      subtotalMinor: reservation.subtotalMinor,
      serviceChargeMinor: reservation.serviceChargeMinor,
      tourismLevyMinor: reservation.tourismLevyMinor,
      vatMinor: reservation.vatMinor,
      totalMinor: reservation.totalMinor,
      taxesAndFeesMinor: reservation.serviceChargeMinor + reservation.tourismLevyMinor + reservation.vatMinor,
      currency: reservation.currency,
    },
    holdExpiresAt: new Date(reservation.createdAt.getTime() + HOLD_TTL_MINUTES * 60 * 1000).toISOString(),
  };
}
