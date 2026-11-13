// API server entry: HTTP listener + sweepers + graceful shutdown.
// The express import also makes this file detectable as an Express service entry point.
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { SWEEP_INTERVAL_MS, runAllSweeps } from './lib/sweepers.js';

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'stillhouse-api listening');
});

const sweeper = setInterval(() => {
  runAllSweeps().catch((err) => logger.error({ err: String(err?.message || err) }, 'sweep failed'));
}, SWEEP_INTERVAL_MS);
// Run one sweep promptly on boot so backlog clears without waiting a full interval.
runAllSweeps().catch((err) => logger.error({ err: String(err?.message || err) }, 'initial sweep failed'));

const shutdown = async (signal) => {
  logger.info({ signal }, 'shutting down');
  clearInterval(sweeper);
  server.close(async () => {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));