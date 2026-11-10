// Rebuild the test database from scratch, apply migrations and seed fixtures.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL
  || 'postgresql://stillhouse:stillhouse_dev_password@localhost:5433/postgres';
const TEST_DB = 'stillhouse_test';

export default async function globalSetup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const testDatabaseUrl = `postgresql://stillhouse:stillhouse_dev_password@localhost:5433/${TEST_DB}?schema=public`;
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl };
  const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: repoRoot, env, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(repoRoot, 'prisma', 'seed.js')], { cwd: repoRoot, env, stdio: 'inherit' });
}
