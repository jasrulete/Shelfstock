import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" because Next does its own JSX
  // transform, and Vite reads that and then cannot parse a .tsx test file at
  // all. This plugin compiles JSX for the tests instead. (Setting the legacy
  // `esbuild.jsx` option does nothing here - Vite 8 transforms with oxc.)
  // Tests only; the app build still goes through Next.
  plugins: [react()],
  resolve: {
    // Mirrors the "@/*" path alias from tsconfig.json so server modules can be
    // imported the same way in tests as in the app.
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    // Middleware and route modules read JWT_SECRET at import time, so it
    // must exist before any test file loads the app.
    env: {
      JWT_SECRET: 'test-secret-at-least-32-characters-long',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/shelfstock',
    },
    // Two projects, because the suites need different environments: the API
    // tests mount Express and mock pg, so they run on Node; the component
    // tests need a DOM. Splitting them keeps the server suite from paying for
    // jsdom on every run, and `.ts` vs `.tsx` is what selects between them.
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          // happy-dom rather than jsdom, chosen on measurement: both pass the
          // whole suite, but jsdom's environment setup is roughly an order of
          // magnitude heavier here and it repeatedly blew Vitest's worker
          // start budget on a cold dependency cache. That budget is a
          // hardcoded 60s, and CI's cache is cold on every run.
          environment: 'happy-dom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['./tests/setup-dom.ts'],
        },
      },
    ],
  },
});
