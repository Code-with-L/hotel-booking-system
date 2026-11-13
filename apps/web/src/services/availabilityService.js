/**
 * Availability + catalogue - live data from the server.
 * Presentation (imagery, amenities) stays in src/data/rooms.js; price/inventory truth comes from the API.
 */
import { request, minorToMajor, mapPricing } from "./api.js";
import { ROOMS } from "@/data/rooms.js";

const bySlug = Object.fromEntries(ROOMS.map((r) => [r.slug, r]));

export async function searchAvailability({ checkIn, checkOut, adults = 2, children = 0, rooms = 1 }) {
  const query = new URLSearchParams({ checkIn, checkOut, adults: String(adults), children: String(children), rooms: String(rooms) });
  const data = await request(`/availability?${query.toString()}`);
  return {
    nights: data.nights,
    results: data.results.filter((r) => bySlug[r.roomTypeSlug]).map((r) => ({
      room: bySlug[r.roomTypeSlug],
      available: r.available,
      reason: r.reason || "",
      plans: r.plans.map((p) => ({
        plan: {
          id: p.ratePlanKey,
          name: p.name,
          summary: p.summary,
          cancellation: p.cancellationSummary,
          prepayment: p.refundable ? "" : "Non-refundable. Payable according to the booking confirmation.",
        },
        nightly: minorToMajor(p.nightlyMinor),
        pricing: mapPricing(p.pricing),
      })),
    })),
  };
}
