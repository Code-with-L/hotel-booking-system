/**
 * Guest authentication against the real backend (server-managed sessions, HttpOnly cookies).
 * `bootstrap()` hydrates the in-memory cache on app load (used by AuthContext).
 */
import { request, ApiError } from "./api.js";
import { isEmail } from "@/utils/validators.js";

let cachedAccount = null;

export const getAccount = () => cachedAccount;

export async function bootstrap() {
  try {
    const { authenticated, account } = await request("/auth/session");
    cachedAccount = authenticated && account ? account : null;
  } catch {
    cachedAccount = null;
  }
  return cachedAccount;
}

export async function signIn({ email, password }) {
  const errors = {};
  if (!isEmail(email)) errors.email = "Enter a valid email address.";
  if (!password || password.length < 8) errors.password = "Use at least 8 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  try {
    const { account } = await request("/auth/sign-in", { method: "POST", body: { email, password } });
    cachedAccount = account;
    return { ok: true, account };
  } catch (err) {
    if (err.status === 401) return { ok: false, errors: { email: "Invalid email or password." } };
    if (err.status === 429) return { ok: false, errors: { email: "Too many attempts. Please wait a few minutes." } };
    return { ok: false, errors: { form: err.message || "Could not sign in. Please try again." } };
  }
}

export async function signOut() {
  try {
    await request("/auth/sign-out", { method: "POST" });
  } catch {
    /* session may already be gone */
  }
  cachedAccount = null;
}

export async function saveProfile(profile) {
  const { account } = await request("/account/profile", {
    method: "PUT",
    body: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      country: profile.country,
      notes: profile.notes,
    },
  });
  cachedAccount = account;
  return account;
}
