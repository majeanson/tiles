import type { Page } from '@playwright/test';

/**
 * Every uncaught error and console.error, collected to fail the test with.
 * Shared by every e2e spec (2026-08-26): smoke.spec.ts and menu.spec.ts each
 * defined this verbatim. Not itself a `*.spec.ts` — Playwright's default
 * `testMatch` only picks up `.spec.`/`.test.` files, so this stays a plain
 * helper module rather than a suite of its own.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}
