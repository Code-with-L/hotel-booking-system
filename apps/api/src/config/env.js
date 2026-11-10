// Centralised, validated environment config. Fails fast on missing secrets.
import dotenv from 'dotenv';
// Load repo-root .env when run from workspace dirs (e.g. apps/api); real env vars take precedence.
dotenv.config({ path: new URL('../../../../.env', import.meta.url) });
dotenv.config();

const required = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return v;
};
const num = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const bool = (name, fallback = false) => {
  const v = process.env[name];
  return v == null ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase());
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: num('PORT', 4000),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  sessionIdleMinutes: num('SESSION_IDLE_TIMEOUT_MINUTES', 480),
  sessionAbsoluteDays: num('SESSION_ABSOLUTE_LIFETIME_DAYS', 7),
  cookieSecure: bool('COOKIE_SECURE', (process.env.NODE_ENV || 'development') === 'production'),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  mpesaEnv: process.env.MPESA_ENV || 'disabled',
  mpesaConsumerKey: process.env.MPESA_CONSUMER_KEY || '',
  mpesaConsumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
  mpesaShortcode: process.env.MPESA_SHORTCODE || '',
  mpesaPasskey: process.env.MPESA_PASSKEY || '',
  mpesaCallbackUrl: process.env.MPESA_CALLBACK_URL || '',
  mpesaWebhookAllowedIps: (process.env.MPESA_WEBHOOK_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean),
  emailProvider: process.env.EMAIL_PROVIDER || '',
  emailApiKey: process.env.EMAIL_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  rateLimitMax: num('RATE_LIMIT_MAX', 300),
  authRateLimitMax: num('AUTH_RATE_LIMIT_MAX', 10),
};
