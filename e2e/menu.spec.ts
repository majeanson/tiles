import { expect, test, type Page } from '@playwright/test';

/**
 * The front door, the wipe and the hall of fame, in a real browser — the
 * three surfaces the launch-week batch reshaped (Session 32) and the smoke
 * spec never walks. Same contract as smoke.spec.ts: production bundle,
 * WebGL rendering for real, any uncaught page error fails the run.
 *
 * Deliberately NOT gameplay tests — this proves the MENU's wiring: what a
 * stranger sees before the first tile, and what RESET ALL actually forgets.
 */

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

/** BEGIN through the door, dismissing the virgin device's first-contact
 *  card (Session 32) when it fires — every fresh browser context is a
 *  stranger's phone now, and the card is part of its first minute. */
async function begin(page: Page): Promise<void> {
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();
  const card = page.locator('#event-card');
  if (await card.isVisible()) {
    await expect(page.locator('#event-card-text')).toContainText('glowing hex');
    await page.locator('#event-card-dismiss').click();
    await expect(card).toBeHidden();
  }
}

test('the home door is the menu: mode line, daily, three worlds, no wipe for a virgin', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');

  // The door names the game BEGIN opens, before anything is tapped.
  await expect(page.locator('#front-door-begin')).toBeVisible();
  await expect(page.locator('#front-door-name')).toHaveText(/ashwake/i);
  await expect(page.locator('#front-door-mode')).toContainText('World 1 of 3');

  // The daily door carries its badge; all three world rows are offered.
  await expect(page.locator('#front-door-daily')).toBeVisible();
  const worlds = page.locator('#front-door-worlds button');
  await expect(worlds).toHaveCount(3);
  await expect(worlds.nth(0)).toContainText('WORLD 1 · NOW');
  await expect(worlds.nth(1)).toContainText('WORLD 2');

  // A device with nothing to forget gets no wipe (Session 32): RESET ALL
  // must not be the trap on the first screen a stranger ever sees.
  await expect(page.locator('#front-door-reset')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the first-contact card teaches placement once, and only once', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.locator('#front-door-begin').click();

  // A virgin ledger gets the one card, at the moment the door lifts.
  await expect(page.locator('#event-card')).toBeVisible();
  await expect(page.locator('#event-card-text')).toContainText('glowing hex');
  await page.locator('#event-card-dismiss').click();
  await expect(page.locator('#event-card')).toBeHidden();

  // Taught is taught: the next visit's door lifts onto a quiet board.
  await page.reload();
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();
  await expect(page.locator('#event-card')).toBeHidden();

  expect(errors).toEqual([]);
});

test('RESET ALL arms, wipes, and leaves a device it no longer offers itself to', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await begin(page);

  // Play enough to have something to forget — ONE placement. The home
  // world's seed is random and the fit zoom scales with whatever beacons
  // it rolled, so no fixed pixel spread is safe (a beaconless world zooms
  // in until the whole spread sits inside the occupied seed tile). Spiral
  // outward from the centre and stop the moment the TILES stat pays a
  // placement cost — the one signal that a tile actually landed.
  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const tiles = async (): Promise<number> =>
    Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  const tilesBefore = await tiles();
  spiral: for (let r = 45; r <= 300; r += 45) {
    for (let step = 0; step < 12; step++) {
      const x = cx + r * Math.cos((step * Math.PI) / 6);
      const y = cy + r * Math.sin((step * Math.PI) / 6);
      if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) continue;
      await page.mouse.click(x, y);
      if ((await tiles()) < tilesBefore) break spiral;
    }
  }
  expect(await tiles()).toBeLessThan(tilesBefore);

  // The run autosaves; a reload's door says RESUME and now offers the wipe.
  await page.reload();
  const reset = page.locator('#front-door-reset');
  await expect(page.locator('#front-door-begin')).toContainText('RESUME');
  await expect(reset).toBeVisible();

  // Two taps, the arming contract: the first only changes the words.
  await reset.click();
  await expect(reset).toContainText('TAP AGAIN');
  await expect(page.locator('#front-door')).toBeVisible();
  await reset.click();

  // The wipe navigates home. Everything is forgotten: BEGIN (no resume),
  // and the wipe button itself is gone — a virgin device again.
  await expect(page.locator('#front-door-begin')).toBeVisible();
  await expect(page.locator('#front-door-begin')).toHaveText('BEGIN');
  await expect(page.locator('#front-door-reset')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the hall of fame opens tabbed, states the clean start, and closes', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  await page.locator('#front-door-fame').click();
  const panel = page.locator('#fame-panel');
  await expect(panel).toBeVisible();

  // Three tabs, always (the timeline is unconditional since Session 32).
  const tabs = panel.locator('.help-tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveText('TIMELINE');
  await expect(tabs.nth(1)).toHaveText('DAILY');
  await expect(tabs.nth(2)).toHaveText('TOTALS');

  // A virgin device's TIMELINE says the record begins now, over the
  // world-filter chips.
  await expect(panel.locator('.fame-chip')).toHaveCount(4);
  await expect(panel).toContainText('The record begins now');

  // TOTALS is the original flat ledger: three worlds, the daily, perks.
  await tabs.nth(2).click();
  await expect(panel).toContainText('WORLDS');
  await expect(panel).toContainText('THE DAILY');
  await expect(panel).toContainText('PERKS FOUND');

  await page.locator('#fame-back').click();
  await expect(panel).toBeHidden();

  expect(errors).toEqual([]);
});

test('the ♪ toggle flips sound on, persists it, and SETTINGS agrees', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await begin(page);

  // Ships muted; one tap turns it on (and is the Web Audio user gesture).
  const sound = page.locator('#sound-toggle');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');

  // One wire: the SETTINGS switch reads the same flag as ON.
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  const soundRow = page.locator('.flag', { hasText: 'Sound' }).locator('.flag-toggle');
  await expect(soundRow).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#help-panel').click();

  // Sticky: the choice survives a reload.
  await page.reload();
  await begin(page);
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');

  expect(errors).toEqual([]);
});
