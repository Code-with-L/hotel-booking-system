// Rebuild the test database from scratch, apply migrations and seed fixtures.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL
  || 'postgresql://stillhouse:stillhouse_dev_password@localhost:5433/postgres';
const TEST_DB = 'stillhouse_test';
// Derive the test database URL from the admin URL (keeps password/host/port); CI sets
// TEST_DATABASE_URL/TEST_ADMIN_DATABASE_URL explicitly — never hardcode credentials here.
const deriveTestUrl = (admin) => {
  const u = new URL(admin);
  u.pathname = `/${TEST_DB}`;
  return u.toString();
};
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || deriveTestUrl(ADMIN_URL);

export default async function globalSetup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const testDatabaseUrl = TEST_DATABASE_URL;
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl };
  const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: repoRoot, env, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(repoRoot, 'prisma', 'seed.js')], { cwd: repoRoot, env, stdio: 'inherit' });
}
