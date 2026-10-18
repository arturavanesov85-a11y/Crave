import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    env: { DATABASE_URL: 'file:./test.db', SEED_DEMO: '0' },
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
