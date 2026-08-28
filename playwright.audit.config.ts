import { defineConfig } from '@playwright/test';

/**
 * The screen audit's own config (2026-08-28).
 *
 * Separate from `playwright.config.ts` for two reasons. It is slow — every
 * screen, in three skins, on three device histories, plus a full-page
 * screenshot each — and it is not a gate: it produces pictures to look at and
 * a table of measurements to read, not a pass or a fail. Wiring that into the
 * pipeline `verify-deploy` gates would buy nothing and cost a minute a push.
 *
 * `testMatch` is what keeps the two apart with no exclusions to maintain:
 * Playwright's default only picks up `*.spec.ts` and `*.test.ts`, so an
 * `*.audit.ts` is invisible to `pnpm test:e2e` and visible only here.
 *
 * ONE worker, deliberately: every test appends to a shared report array in
 * the file, and parallel workers are separate processes that would each write
 * a third of it over the other two.
 */
export default defineConfig({
  testDir: 'e2e/audit',
  testMatch: '**/*.audit.ts',
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
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
