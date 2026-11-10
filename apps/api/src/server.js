// API server entry: HTTP listener + hold-expiry sweeper + graceful shutdown.
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

const SWEEP_INTERVAL_MS = 60_000;

async function sweepExpiredHolds() {
  try {
    const now = new Date();
    await prisma.roomAllocation.updateMany({
      where: { kind: 'hold', state: 'occupying', expiresAt: { lt: now } },
      data: { state: 'expired' },
    });
    // Expire pending reservations whose allocations are all expired/released and older than the hold TTL
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.$executeRaw`
      UPDATE "reservation" r
      SET status = 'expired', "updatedAt" = now()
      WHERE r.status = 'pending'
        AND r."createdAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "room_allocation" ra
          WHERE ra.source_type = 'reservation'
            AND ra.source_id = r.id
            AND ra.state = 'occupying'
        )`;
  } catch (err) {
    console.error('[sweeper]', err);
  }
}

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`Stillhouse API listening on http://localhost:${env.port} (env: ${env.nodeEnv})`);
});

const sweeper = setInterval(sweepExpiredHolds, SWEEP_INTERVAL_MS);

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down...`);
  clearInterval(sweeper);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
