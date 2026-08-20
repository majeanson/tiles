import { defineConfig } from '@playwright/test';

/**
 * The real-browser smoke test (2026-08-19, Marc's pick, run last in the
 * no-phone program): nothing in the unit suite ever renders a frame —
 * happy-dom has no canvas — so the whole class of renderer crashes (the
 * captured `t.alphaMode` pop crash) was invisible until a phone found it.
 * This boots the PRODUCTION build in headless Chromium with WebGL actually
 * rendering, walks the first minute, and fails on any uncaught error.
 *
 * Serves `dist/` via vite preview: the same bundle the deploy ships, not the
 * dev server's un-minified shadow of it.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env['CI'] === undefined ? 0 : 1,
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 30_000,
  },
});
