/**
 * Reservation service - talks to the real reservation engine.
 * Creates a pending reservation (15-minute hold); payment confirmation happens via M-Pesa webhook
 * or a front-desk manual settlement. Nothing is faked client-side.
 */
import { request, minorToMajor, mapPricing } from "./api.js";
import { session } from "@/utils/storage.js";

const LAST_KEY = "stillhouse.booking.last";
const IDEM_KEY = "stillhouse.booking.idempotency";

const newIdempotencyKey = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

/** Fetch the binding quote for the current selection (server recomputes taxes; never trust the client). */
export async function quoteStay({ roomTypeSlug, ratePlanKey, checkIn, checkOut, adults, children, rooms }) {
  const q = await request("/quotes", {
    method: "POST",
    body: { roomTypeSlug, ratePlanKey, checkIn, checkOut, adults, children, rooms },
  });
  return { ...mapPricing(q), expiresAt: q.expiresAt };
}

const normalizeReservation = (r, { search, selection, guest } = {}) => ({
  reference: r.reference,
  status: r.status,
  statusLabel: r.status,
  createdAt: r.createdAt,
  search: search || { checkIn: r.checkIn, checkOut: r.checkOut, adults: r.adults, children: r.children, rooms: r.rooms },
  selection: selection || { roomSlug: r.room?.slug, roomName: r.room?.name, ratePlanId: r.ratePlan?.key, ratePlanName: r.ratePlan?.name, nightly: minorToMajor(r.pricing?.nightlyMinor), nights: r.nights },
  guest: guest || r.guest || null,
  pricing: mapPricing(r.pricing || {}),
  payment: "Pending",
  holdExpiresAt: r.holdExpiresAt || null,
});

export async function createReservation({ search, selection, guest }) {
  let idem = session.get(IDEM_KEY, null);
  if (!idem) {
    idem = newIdempotencyKey();
    session.set(IDEM_KEY, idem);
  }
  const res = await request("/reservations", {
    method: "POST",
    headers: { "Idempotency-Key": idem },
    body: {
      roomTypeSlug: selection.roomSlug,
      ratePlanKey: selection.ratePlanId,
      checkIn: search.checkIn,
      checkOut: search.checkOut,
      adults: search.adults,
      children: search.children ?? 0,
      rooms: search.rooms ?? 1,
      source: "web",
      guest: { ...guest, requests: guest.requests || "", privacy: true },
    },
  });
  session.remove(IDEM_KEY);
  const reservation = normalizeReservation(res, { search, selection, guest });
  session.set(LAST_KEY, reservation);
  return reservation;
}

export const getLastReservation = () => session.get(LAST_KEY, null);
export const getPendingPaymentReference = () => {
  const r = session.get(LAST_KEY, null);
  return r?.status === "pending" ? r.reference : null;
};

/** Guest's own reservations (session-owned). Maps server rows to the account page shape. */
export async function listGuestReservations() {
  const data = await request("/account/reservations");
  const mapRow = (r) => ({
    id: r.reference,
    reference: r.reference,
    roomName: r.roomName,
    roomSlug: r.roomSlug,
    roomNumbers: r.roomNumbers || [],
    arrival: r.arrival,
    departure: r.departure,
    nights: r.nights,
    adults: r.adults,
    children: r.children,
    rooms: r.rooms,
    total: r.total,
    totalMinor: r.totalMinor,
    status: r.status,
    statusRaw: r.statusRaw,
    ratePlanId: r.ratePlanId,
    isDemo: false,
    requests: r.requests,
  });
  return {
    upcoming: (data.upcoming || []).map(mapRow),
    previous: (data.previous || []).map(mapRow),
  };
}
