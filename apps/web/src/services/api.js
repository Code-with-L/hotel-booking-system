/**
 * API boundary. Every backend call goes through this module.
 * Same-origin by default (Vite proxy in dev/preview, reverse proxy in prod).
 * Errors are thrown as ApiError { status, code, message, details? }.
 */
export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) || "/api/v1";

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request(path, { method = "GET", body, headers } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Could not reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return null;
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new ApiError(res.status, err.code || "INTERNAL_ERROR", err.message || "Something went wrong. Please try again.", err.details);
  }
  return json;
}

/** API carries money as integer minor units (KES cents); the UI formats major KES. */
export const minorToMajor = (minor) => (minor == null ? minor : Math.round(minor / 100));
export const majorToMinor = (major) => (major == null ? major : Math.round(Number(major) * 100));

export const mapPricing = (p) => ({
  nightly: minorToMajor(p.nightlyMinor),
  nights: p.nights,
  rooms: p.rooms,
  subtotal: minorToMajor(p.subtotalMinor),
  serviceCharge: minorToMajor(p.serviceChargeMinor),
  tourismLevy: minorToMajor(p.tourismLevyMinor),
  vat: minorToMajor(p.vatMinor),
  taxesAndFees: minorToMajor(p.taxesAndFeesMinor),
  total: minorToMajor(p.totalMinor),
  currency: p.currency || "KES",
});
