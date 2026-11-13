// Dedicated background-jobs worker (M10 P0-02 / A). No HTTP surface except /health via app if reused.
// Owns: hold expiry, stale M-Pesa re-query, arrival reminders, eTIMS retries, heartbeat.
// Safe at any point in its lifecycle: jobs are idempotent; crash/restart recovery needs no special repair.
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { SWEEP_INTERVAL_MS, runAllSweeps } from './lib/sweepers.js';

logger.info({ worker: process.env.WORKER_NAME || 'stillhouse-worker' }, 'stillhouse worker starting');

let stopping = false;
const timer = setInterval(() => {
  if (stopping) return;
  runAllSweeps().catch((err) => logger.error({ err: String(err?.message || err) }, 'sweep failed'));
}, SWEEP_INTERVAL_MS);

runAllSweeps().catch((err) => logger.error({ err: String(err?.message || err) }, 'initial sweep failed'));

const shutdown = async (signal) => {
  stopping = true;
  logger.info({ signal }, 'worker shutting down');
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
