import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Middleware and route modules read JWT_SECRET at import time, so it
    // must exist before any test file loads the app.
    env: {
      JWT_SECRET: 'test-secret',
    },
  },
});
