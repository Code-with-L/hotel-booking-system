// Request logging middleware (no bodies, secrets redacted upstream in logger config).
// Generates a correlation id per request (honoring an inbound X-Request-Id if present)
// and stitches it through logs; it is echoed in the error path for support tracing.
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const inbound = req.headers['x-request-id'];
    return inbound ? String(inbound).slice(0, 64) : `req_${crypto.randomBytes(8).toString('hex')}`;
  },
  // Log only the essentials; never request bodies (may contain PII/payment data).
  serializers: {
    req: (req) => ({ method: req.method, url: req.url?.split('?')[0], id: req.id }),
    res: (res) => ({ status: res.statusCode }),
  },
  autoLogging: {
    ignore: (req) => req.url === '/api/v1/health' || req.url === '/api/v1/ready',
  },
});