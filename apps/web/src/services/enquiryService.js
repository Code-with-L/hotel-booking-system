/**
 * Enquiries (experiences, dining) and newsletter signups - persisted via the API.
 */
import { request } from "./api.js";

export async function submitEnquiry(payload) {
  return request("/enquiries", { method: "POST", body: payload });
}

export async function subscribeNewsletter(email) {
  return request("/newsletter", { method: "POST", body: { email } });
}
