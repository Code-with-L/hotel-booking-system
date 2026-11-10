import { isValidISO } from "@/utils/dates.js";

/** Parse /availability query params into a search object, or null if absent/invalid. */
export function parseSearchParams(params) {
  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  if (!isValidISO(checkIn) || !isValidISO(checkOut)) return null;
  const int = (key, min, max, fallback) => {
    const n = parseInt(params.get(key) || "", 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    checkIn,
    checkOut,
    adults: int("adults", 1, 8, 2),
    children: int("children", 0, 4, 0),
    rooms: int("rooms", 1, 4, 1),
  };
}
