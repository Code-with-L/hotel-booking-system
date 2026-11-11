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

// Production guardrails: refuse to boot with unsafe configuration.
const productionCheck = () => {
  if ((process.env.NODE_ENV || 'development') !== 'production') return;
  const problems = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('dev-only') || process.env.SESSION_SECRET.length < 32) {
    problems.push('SESSION_SECRET must be set to a long random string in production.');
  }
  if (String(process.env.COOKIE_SECURE).toLowerCase() !== 'true') {
    problems.push('COOKIE_SECURE must be true in production (requires HTTPS).');
  }
  if (!/^https:\/\//.test(process.env.WEB_ORIGIN || '')) {
    problems.push('WEB_ORIGIN must be an https:// origin in production.');
  }
  if (problems.length) {
    throw new Error(`Unsafe production configuration:\n - ${problems.join('\n - ')}\nSee .env.example / docs/DEPLOYMENT.md.`);
  }
};
productionCheck();

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
  emailSmtpHost: process.env.EMAIL_SMTP_HOST || '',
  emailSmtpPort: num('EMAIL_SMTP_PORT', 587),
  emailSmtpSecure: bool('EMAIL_SMTP_SECURE', false),
  emailSmtpUser: process.env.EMAIL_SMTP_USER || '',
  emailSmtpPass: process.env.EMAIL_SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'The Stillhouse <reservations@stillhouse.example>',
  adminNotificationEmail: process.env.ADMIN_NOTIFICATION_EMAIL || '',
  frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',

  // eTIMS (KRA) — system-to-system OSCU route. Disabled until the owner registers, sandboxes and certifies.
  etimsEnabled: bool('ETIMS_ENABLED', false),
  etimsEnvironment: process.env.ETIMS_ENVIRONMENT || 'disabled', // disabled | sandbox | production
  etimsTin: process.env.ETIMS_TIN || '',
  etimsBranchId: process.env.ETIMS_BRANCH_ID || '00',
  etimsDeviceSerial: process.env.ETIMS_DEVICE_SERIAL || '',
  etimsBaseUrl: process.env.ETIMS_BASE_URL || '', // e.g. https://etims-api-sbx.kra.go.ke (sandbox) — set explicitly; never defaulted to production
  etimsCommunicationKey: process.env.ETIMS_COMMUNICATION_KEY || '', // issued by KRA after device activation
  etimsInvoiceSeriesPrefix: process.env.ETIMS_INVOICE_SERIES_PREFIX || 'STL',
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  rateLimitMax: num('RATE_LIMIT_MAX', 300),
  authRateLimitMax: num('AUTH_RATE_LIMIT_MAX', 10),
};
