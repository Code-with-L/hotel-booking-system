// Prisma client with the pg driver adapter (no native query engine — required on this platform).
import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__prisma || new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.databaseUrl }),
});

if (env.nodeEnv !== 'production') globalForPrisma.__prisma = prisma;
