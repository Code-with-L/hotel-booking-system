// Email integration boundary. M1 ships the interface + EMAIL_PROVIDER_NOT_CONFIGURED behaviour;
// wiring a real provider (e.g. Mailgun/SES/SendGrid) is a deliberate, small change here.
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/errors.js';

const notConfigured = () => new ApiError(503, 'EMAIL_PROVIDER_NOT_CONFIGURED', 'Email delivery is not configured. Set EMAIL_PROVIDER and credentials to enable outbound email.');

export async function sendPasswordReset({ to, token }) {
  if (!env.emailProvider) throw notConfigured();
  // Integration point: call the provider SDK here with { to, token, from: env.emailFrom }.
  throw notConfigured();
}

export async function sendReservationConfirmation({ to, reservation }) {
  if (!env.emailProvider) throw notConfigured();
  throw notConfigured();
}

export async function sendReservationCancellation({ to, reservation }) {
  if (!env.emailProvider) throw notConfigured();
  throw notConfigured();
}
