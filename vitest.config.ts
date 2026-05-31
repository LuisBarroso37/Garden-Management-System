import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      LOG_LEVEL: 'error',
      CORS_ORIGIN: '*',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-at-least-32-characters-long',
    },
  },
});
