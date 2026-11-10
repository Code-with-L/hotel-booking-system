// Room catalogue + public availability + authoritative quotes.
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { availabilityQuerySchema, quoteRequestSchema } from '@stillhouse/shared';
import { validate } from '../../middleware/index.js';
import { computeStayPricing, nightsBetween, toDateOnly } from '../../lib/pricing.js';
import { findFreeRooms } from '../../lib/allocations.js';
import { badRequest } from '../../lib/errors.js';

export const roomsRouter = Router();
export const availabilityRouter = Router();
export const quotesRouter = Router();

const typePayload = (t) => ({
  slug: t.slug,
  number: t.number,
  name: t.name,
  tagline: t.tagline,
  summary: t.summary,
  description: t.description,
  sizeSqm: t.sizeSqm,
  occupancy: { adults: t.maxAdults, children: t.maxChildren, label: `${t.maxAdults} adults` },
  bed: t.bed,
  view: t.view,
  fromPriceMinor: t.fromPriceMinor,
  currency: t.currency,
  unitCount: t.unitCount,
  amenities: t.amenities,
  features: t.features,
});

roomsRouter.get('/room-types', async (_req, res, next) => {
  try {
    const types = await prisma.roomType.findMany({ orderBy: { slug: 'asc' } });
    res.json(types.map(typePayload));
  } catch (err) { next(err); }
});

roomsRouter.get('/room-types/:slug', async (req, res, next) => {
  try {
    const t = await prisma.roomType.findUnique({ where: { slug: req.params.slug } });
    if (!t) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown room type.' } });
    res.json(typePayload(t));
  } catch (err) { next(err); }
});

const todayISO = () => new Date().toISOString().slice(0, 10);

availabilityRouter.get('/availability', validate(availabilityQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { checkIn, checkOut, adults, children, rooms } = req.validatedQuery;
    const nights = nightsBetween(checkIn, checkOut);
    const checkInDate = toDateOnly(checkIn);
    const checkOutDate = toDateOnly(checkOut);
    const types = await prisma.roomType.findMany({
      include: { ratePlans: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { slug: 'asc' },
    });

    const results = await Promise.all(types.map(async (type) => {
      const capacityOk = adults <= type.maxAdults * rooms && children <= type.maxChildren * rooms;
      let freeUnits = 0;
      if (capacityOk) {
        const free = await findFreeRooms(prisma, { roomTypeId: type.id, checkIn: checkInDate, checkOut: checkOutDate, count: rooms });
        freeUnits = free.length;
      }
      const available = capacityOk && freeUnits >= rooms;
      let reason = '';
      if (!capacityOk) {
        reason = adults > type.maxAdults * rooms
          ? `${rooms} ${rooms === 1 ? 'room sleeps' : 'rooms sleep'} up to ${type.maxAdults * rooms} adults.`
          : 'This party is too large for the selected number of rooms.';
      } else if (freeUnits < rooms) {
        reason = 'Not enough rooms of this type free for these dates.';
      }
      const plans = await Promise.all(type.ratePlans.map(async (plan) => {
        const pricing = await computeStayPricing(prisma, { roomType: type, ratePlan: plan, checkIn, checkOut, rooms });
        return {
          ratePlanKey: plan.key,
          name: plan.name,
          summary: plan.summary,
          cancellationSummary: plan.cancellationSummary,
          refundable: plan.refundable,
          nightlyMinor: pricing.nightlyMinor,
          pricing,
        };
      }));
      return { roomTypeSlug: type.slug, available, reason, plans };
    }));

    res.json({ nights, checkIn, checkOut, adults, children, rooms, results });
  } catch (err) { next(err); }
});

quotesRouter.post('/quotes', validate(quoteRequestSchema), async (req, res, next) => {
  try {
    const { roomTypeSlug, ratePlanKey, checkIn, checkOut, adults, children, rooms } = req.validatedBody;
    const type = await prisma.roomType.findUnique({ where: { slug: roomTypeSlug } });
    if (!type) throw badRequest('Unknown room type.');
    const plan = await prisma.ratePlan.findFirst({ where: { roomTypeId: type.id, key: ratePlanKey } });
    if (!plan) throw badRequest('Unknown rate plan for this room type.');
    if (adults > type.maxAdults * rooms || children > type.maxChildren * rooms) {
      throw badRequest('This party exceeds the capacity of the selected rooms.');
    }
    const pricing = await computeStayPricing(prisma, { roomType: type, ratePlan: plan, checkIn, checkOut, rooms });
    res.json({
      roomTypeSlug,
      ratePlanKey,
      checkIn,
      checkOut,
      nights: pricing.nights,
      rooms: pricing.rooms,
      nightlyMinor: pricing.nightlyMinor,
      subtotalMinor: pricing.subtotalMinor,
      serviceChargeMinor: pricing.serviceChargeMinor,
      tourismLevyMinor: pricing.tourismLevyMinor,
      vatMinor: pricing.vatMinor,
      taxesAndFeesMinor: pricing.taxesAndFeesMinor,
      totalMinor: pricing.totalMinor,
      currency: pricing.currency,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (err) { next(err); }
});
