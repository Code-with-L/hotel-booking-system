// Structured logging with secret redaction. Replaces ad-hoc console usage.
import pino from 'pino';

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.secret',
  '*.consumerSecret',
  '*.passkey',
  '*.token',
  '*.tokenHash',
  '*.access_token',
  'body.password',
  'body.ConsumerSecret',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: 'stillhouse-api', env: process.env.NODE_ENV || 'development' },
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/** Mask phone for logs: +254 712 ••• 42 */
export const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 6) return '[phone]';
  return `+${digits.slice(0, 3)} ••• ${digits.slice(-2)}`;
};

/** Mask booking reference partially for logs: STL-2026-••K4VVP */
export const maskRef = (ref) => String(ref || '').replace(/^(STL-\d{4}-)[A-Z0-9]{2}/, '$1••');
