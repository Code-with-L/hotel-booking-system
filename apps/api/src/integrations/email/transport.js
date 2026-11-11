// Email transport resolution.
// - NODE_ENV=test (or EMAIL_PROVIDER=json): nodemailer jsonTransport — captures, never sends.
// - EMAIL_PROVIDER=smtp with EMAIL_SMTP_HOST set: real SMTP delivery.
// - otherwise: disabled — sends are recorded as 'skipped' in the outbox and nothing is sent.
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

export const emailConfigured = () =>
  (env.emailProvider === 'smtp' && Boolean(env.emailSmtpHost)) || false;

export function createTransport() {
  if (env.nodeEnv === 'test' || env.emailProvider === 'json') {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  if (emailConfigured()) {
    return nodemailer.createTransport({
      host: env.emailSmtpHost,
      port: env.emailSmtpPort,
      secure: env.emailSmtpSecure,
      auth: env.emailSmtpUser ? { user: env.emailSmtpUser, pass: env.emailSmtpPass } : undefined,
    });
  }
  return null;
}
