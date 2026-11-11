/**
 * Administration service - live data from the staff API (RBAC enforced server-side).
 * All functions are async. Monetary values arrive as minor units and are converted to major KES.
 */
import { request, minorToMajor } from "./api.js";

const statusToRaw = (label) =>
  String(label).trim().toLowerCase().replace(/[-\s]+/g, "_");

export const getDashboard = () => request("/admin/dashboard");
export const getRoomHistory = (number) => request(`/admin/rooms/${encodeURIComponent(number)}/history`);
export const updateGuestNotes = (guestId, notes) => request(`/admin/guests/${encodeURIComponent(guestId)}`, { method: "PATCH", body: { notes } });
export const getFinancialSummary = () => request("/admin/reports/financial-summary");
export const getReservationDetail = (reference) => request(`/admin/reservations/${encodeURIComponent(reference)}`);

export async function getReservations() {
  const data = await request("/admin/reservations?pageSize=100");
  return (data.rows || []).map((r) => ({ ...r, id: r.reference }));
}

export async function getGuests() {
  return request("/admin/guests");
}

export const getUnits = () => request("/admin/rooms");

export async function updateUnit(number, patch) {
  const body = {};
  if (patch.status) {
    // UI labels -> API values
    body.status = patch.status === "Out of service" ? "out_of_service" : "active";
  }
  if (patch.maintenance !== undefined) body.notes = patch.maintenance;
  return request(`/admin/rooms/${encodeURIComponent(number)}`, { method: "PATCH", body });
}

export async function getRates() {
  const rates = await request("/admin/rates");
  return rates.map((r) => ({ ...r, from: r.from, to: r.to }));
}

export async function updateRate(id, patch) {
  const body = {};
  if (patch.nightly !== undefined) body.nightlyMinor = Math.max(0, Math.round(patch.nightly * 100));
  if (patch.status) { // UI vocabulary: Active | Scheduled | Paused
    body.status = { active: "active", scheduled: "scheduled", paused: "inactive", inactive: "inactive" }[String(patch.status).toLowerCase()] || String(patch.status).toLowerCase();
  }
  return request(`/admin/rates/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export const getOccupancySeries = (days = 30) => request(`/admin/reports/occupancy?days=${days}`);
export const getMonthlySeries = () => request("/admin/reports/monthly?months=6");

export const getSettings = () => request("/admin/settings");
export const saveSettings = (s) => request("/admin/settings", { method: "PUT", body: s });

export async function updateReservationStatus(reference, statusLabel, reason) {
  return request(`/admin/reservations/${encodeURIComponent(reference)}`, {
    method: "PATCH",
    body: { status: statusToRaw(statusLabel), reason },
  });
}
