// Server-side pricing: rate cards by date (fall back to fromPrice × plan multiplier), tax policy per business rules.
// Money: integer minor units (KES cents). VAT excludes service charge and tourism levy (VAT Act s.13(7)).
import { TAX_POLICY } from '@stillhouse/shared';

const roundHalfUp = (n) => Math.floor(n + 0.5);
const hundred = (n) => Math.round(n / 10000) * 10000; // round to whole KSh 100

export const toDateOnly = (iso) => new Date(`${iso}T00:00:00.000Z`);

export const nightsBetween = (checkIn, checkOut) =>
  Math.round((toDateOnly(checkOut) - toDateOnly(checkIn)) / 86400000);

export const addDaysISO = (iso, n) => {
  const d = toDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function resolveNightlyForDate(prisma, { roomTypeId, rateCardFallback, ratePlanId }, date, cache) {
  const key = `${roomTypeId}|${ratePlanId}|${date.toISOString().slice(0, 10)}`;
  if (cache?.has(key)) return cache.get(key);
  let nightly = null;
  try {
    const card = await prisma.rateCard.findFirst({
      where: {
        roomTypeId,
        ratePlanId,
        validFrom: { lte: date },
        validTo: { gte: date },
        status: { in: ['active', 'scheduled'] },
      },
      orderBy: { validFrom: 'desc' },
    });
    if (card) nightly = card.nightlyMinor;
  } catch {
    nightly = null;
  }
  if (nightly == null) nightly = hundred(roundHalfUp(rateCardFallback));
  cache?.set(key, nightly);
  return nightly;
}

export async function computeStayPricing(prisma, { roomType, ratePlan, checkIn, checkOut, rooms }) {
  const nights = nightsBetween(checkIn, checkOut);
  const cache = new Map();
  const nightlyRates = [];
  for (let i = 0; i < nights; i += 1) {
    const dateISO = addDaysISO(checkIn, i);
    const date = toDateOnly(dateISO);
    nightlyRates.push(await resolveNightlyForDate(prisma, {
      roomTypeId: roomType.id,
      rateCardFallback: roomType.fromPriceMinor * ratePlan.multiplier,
      ratePlanId: ratePlan.id,
    }, date, cache));
  }
  const roomSubtotal = nightlyRates.reduce((sum, n) => sum + n, 0);
  const subtotalMinor = roomSubtotal * rooms;
  const serviceChargeMinor = roundHalfUp(subtotalMinor * TAX_POLICY.serviceChargeRate);
  const tourismLevyMinor = roundHalfUp(subtotalMinor * TAX_POLICY.tourismLevyRate);
  const vatBase = TAX_POLICY.serviceChargeVatExclusive ? subtotalMinor : subtotalMinor + serviceChargeMinor;
  const vatMinor = roundHalfUp(vatBase * TAX_POLICY.vatRate);
  const totalMinor = subtotalMinor + serviceChargeMinor + tourismLevyMinor + vatMinor;
  const constantRate = nightlyRates.every((n) => n === nightlyRates[0]);
  return {
    nights,
    rooms,
    nightlyMinor: nightlyRates[0] ?? 0,
    nightlyRates,
    dynamicPricing: !constantRate,
    subtotalMinor,
    serviceChargeMinor,
    tourismLevyMinor,
    vatMinor,
    taxesAndFeesMinor: serviceChargeMinor + tourismLevyMinor + vatMinor,
    totalMinor,
    currency: TAX_POLICY.currency,
  };
}

export const minorToMajor = (minor) => Math.round(minor / 100);
export const majorToMinor = (major) => Math.round(Number(major) * 100);
