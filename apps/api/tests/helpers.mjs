// Shared helpers for API tests.
import pg from 'pg';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://stillhouse:stillhouse_dev_password@localhost:5433/stillhouse_test?schema=public';

/** Truncate booking/financial tables for a clean slate; keeps catalogue + users + seed guests. */
export async function truncateBookingTables() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'TRUNCATE reservation_room, reservation, payment_attempt, payment, room_allocation, audit_log, enquiry, newsletter_subscriber RESTART IDENTITY CASCADE'
    );
  } finally {
    await client.end();
  }
}

export const GUEST_CREDS = { email: 'naomi.achieng@example.com', password: 'GuestPassword!26' };
export const ADMIN_CREDS = { email: 'admin@thestillhouse.example', password: 'StillhouseAdmin!26' };
export const MANAGER_CREDS = { email: 'manager@thestillhouse.example', password: 'StillhouseManager!26' };
