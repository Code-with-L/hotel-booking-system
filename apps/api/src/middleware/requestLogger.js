// Request logging middleware (no bodies, secrets redacted upstream in logger config).
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger.js';

export const requestLogger = pinoHttp({
  logger,
  // Log only the essentials; never request bodies (may contain PII/payment data).
  serializers: {
    req: (req) => ({ method: req.method, url: req.url?.split('?')[0], id: req.id }),
    res: (res) => ({ status: res.statusCode }),
  },
  autoLogging: {
    ignore: (req) => req.url === '/api/v1/health' || req.url === '/api/v1/ready',
  },
});
