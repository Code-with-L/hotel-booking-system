import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    globalSetup: './tests/global-setup.mjs',
    setupFiles: ['./tests/setup.mjs'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
});
