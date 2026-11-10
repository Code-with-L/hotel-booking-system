// Test-only environment: point Prisma at the throwaway test database before any module reads env.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://stillhouse:stillhouse_dev_password@localhost:5433/stillhouse_test?schema=public';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production-use';
process.env.SESSION_IDLE_TIMEOUT_MINUTES = '480';
process.env.SESSION_ABSOLUTE_LIFETIME_DAYS = '7';
process.env.MPESA_ENV = 'disabled';
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
