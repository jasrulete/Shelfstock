import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias from tsconfig.json so server modules can be
    // imported the same way in tests as in the app.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Middleware and route modules read JWT_SECRET at import time, so it
    // must exist before any test file loads the app.
    env: {
      JWT_SECRET: 'test-secret-at-least-32-characters-long',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/shelfstock',
    },
  },
});
