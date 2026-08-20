import { expect, test, type Page } from '@playwright/test';

/**
 * The stranger's first minute, in a real browser: boot, BEGIN, place tiles,
 * open the manual, work the camera — with WebGL rendering for real and any
 * uncaught page error failing the run. This is the canary for the crash
 * class the unit suite is blind to (happy-dom has no canvas): a sprite over
 * a destroyed texture takes Pixi down with an error this catches instantly.
 *
 * Deliberately NOT a gameplay test — the engine's rules live in the unit
 * suite. This proves the WIRING survives contact with a real renderer.
 */

/** Every uncaught error and console.error, collected to fail the test with. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

test('boots, begins, places, reads the manual, works the camera — no errors', async ({ page }) => {
  const errors = watchErrors(page);

  // A fixed seed so the walk is the same walk every run of CI.
  await page.goto('/?seed=7');

  // The front door names the mode (a ?seed= link is a shared run).
  const begin = page.locator('#front-door-begin');
  await expect(begin).toBeVisible();
  await expect(begin).toContainText('SHARED RUN');
  await begin.click();
  await expect(page.locator('#front-door')).toBeHidden();

  // The board is a live canvas and the HUD carries the run's numbers.
  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const tilesBefore = Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  expect(tilesBefore).toBeGreaterThan(0);

  // Tap around the board's centre: some taps place (the seed tile's ring is
  // legal ground), some explain — either way the wiring must hold. The spread
  // is wide enough that at least one placement lands whatever the layout.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  const spread: readonly [number, number][] = [
    [0, -40],
    [35, -20],
    [35, 20],
    [0, 40],
    [-35, 20],
    [-35, -20],
    [0, -80],
    [70, 0],
  ];
  for (const [dx, dy] of spread) {
    await page.mouse.click(cx + dx, cy + dy);
  }
  const tilesAfter = Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  expect(tilesAfter).toBeLessThan(tilesBefore);

  // The manual opens as a dialog and closes on a tap, without wounding the
  // board underneath.
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await expect(page.locator('#help-manual')).toContainText('WHAT YOU SEE');
  await page.locator('#help-panel').click();
  await expect(page.locator('#help-panel')).toBeHidden();

  // The camera toggle jumps in and back out; the wheel zooms. Every one of
  // these redraws the whole board through the texture caches this test
  // exists to keep honest.
  await page.locator('#camera-toggle').click();
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, 480);
  await page.locator('#camera-toggle').click();

  // One more placement after all that camera churn — eviction settles 250ms
  // after a zoom, which is exactly the window the alphaMode crash lived in.
  await page.waitForTimeout(700);
  await page.mouse.click(cx, cy - 40);

  expect(errors).toEqual([]);
});

test('the daily door opens its own world, plainly, with no errors', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto('/');
  await expect(page.locator('#front-door-begin')).toBeVisible();

  // The home door offers the daily; taking it reloads into the dated world.
  const daily = page.locator('#front-door-daily');
  await expect(daily).toBeVisible();
  await daily.click();
  // "#N" once the launch calendar has begun; the bare date during the
  // rehearsal week before it (Marc's epoch ruling, 2026-08-20) — this
  // spec must pass on both sides of launch day.
  await expect(page.locator('#front-door-begin')).toContainText(
    /BEGIN DAILY (#\d+|\d{4}-\d{2}-\d{2})/,
  );
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();
  await expect(page.locator('#board canvas')).toBeVisible();

  expect(errors).toEqual([]);
});
