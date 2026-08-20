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
  // board underneath. It opens onto MENU (2026-08-20) — the ways out of a
  // run and the world's own numbers — with the prose tabs behind it.
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await expect(page.locator('#help-menu')).toContainText('A SHARED RUN');
  await expect(page.locator('#help-manual')).toContainText('WHAT YOU SEE');
  // Tapped on PROSE, deliberately: the controls swallow their own taps (a
  // panel closing under an arming button could never be tapped twice), so
  // clicking the panel's bare centre is a coin toss about which half of it
  // the layout happens to put there.
  await page.locator('#help-name').click();
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

/**
 * The daily, put down and picked up (Marc, Day 2: "make sure we can resume a
 * daily too — right now it restarts if I'm mid-daily and restart the app").
 *
 * The reopened-app path specifically: an installed PWA relaunches at its START
 * URL, with no `?daily=` on it. Saving the board was only half the fix — this
 * proves the way BACK exists, which is the half that was actually missing.
 */
test('a daily put down mid-board is offered back, and resumes the same try', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto('/');
  await page.locator('#front-door-daily').click();
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();

  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  // A virgin ledger's first-contact card sits over the board and eats taps;
  // dismiss it so what follows is measuring placement, not the modal.
  await page.locator('#event-card-dismiss').click();
  await expect(page.locator('#event-card')).toBeHidden();

  const tilesBefore = Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  // Tap the seed tile's ring until the purse moves — the hand arrives with a
  // card already taken, so a board tap IS the placement. The legal ring is the
  // six neighbours of one tile, and how many CSS pixels out that sits depends
  // on the camera this world opened at, so the sweep walks several radii
  // rather than assuming one. A placement is what makes this a board worth
  // resuming rather than an untouched world.
  const placed = async (): Promise<boolean> =>
    Number(await page.locator('[data-stat="tiles"] .stat-value').textContent()) < tilesBefore;
  for (const radius of [30, 45, 60, 80, 110]) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      await page.mouse.click(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      if (await placed()) break;
    }
    if (await placed()) break;
  }
  const tilesAfter = Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  expect(tilesAfter).toBeLessThan(tilesBefore);

  // The app comes back at its start URL — no `?daily=`, exactly as a
  // relaunched PWA does — and the home door offers the board back.
  await page.goto('/');
  const daily = page.locator('#front-door-daily');
  await expect(daily).toContainText(/RESUME DAILY (#\d+|\d{4}-\d{2}-\d{2}) — PLACEMENT [1-9]/);

  await daily.click();
  await expect(page.locator('#front-door-begin')).toContainText(
    /RESUME DAILY .* — PLACEMENT [1-9]/,
  );
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();
  await expect(canvas).toBeVisible();

  // The same try, resumed: the purse is where it was left, not back at the
  // starting count — that is the difference between a resume and a restart.
  const tilesResumed = Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  expect(tilesResumed).toBe(tilesAfter);

  expect(errors).toEqual([]);
});
