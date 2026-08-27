import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/**
 * Scene changes that do NOT reload the page (2026-08-27).
 *
 * Every scene switch in this game used to be `location.href = …`: the theme
 * swatches, the slot list, the daily door, the crossing. A session ends and
 * the next one begins in place now, which means three things that a reload
 * used to guarantee for free have to be proved instead — that the renderer
 * really is rebuilt rather than left for dead, that the ~50 listeners on
 * markup `index.html` declares once do not accumulate a copy per session,
 * and that nothing throws while one session is being swapped for another.
 *
 * The specs that DO reload (menu.spec.ts) stay exactly as they were: a real
 * reload is still a supported entry — a relaunched PWA is one every time —
 * and those are now the tests that guard it.
 */

/** The APPEARANCE swatches, on the SETTINGS panel behind MORE. */
async function openAppearance(page: Page): Promise<void> {
  await page.locator('#front-door-more').click();
  await expect(page.locator('#more-panel')).toBeVisible();
  await page.locator('#more-settings').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await expect(page.locator('#appearance-options')).toBeVisible();
}

/** Which direction the document is actually wearing. */
function themeId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.dataset['theme'] ?? null);
}

/**
 * Clear whatever the teaching drip is holding up. A virgin browser context is
 * a stranger's phone, and the first placement teaches its ground colour on
 * top of the first-contact card — both are held event cards that cover the
 * board until they are dismissed.
 */
async function clearCards(page: Page): Promise<void> {
  const card = page.locator('#event-card');
  for (let i = 0; i < 4 && (await card.isVisible()); i++) {
    await page.locator('#event-card-dismiss').click();
    await expect(card).toBeHidden();
  }
}

test('an appearance swatch swaps the theme in place, with no navigation', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  // Mark the document. A real navigation throws this away, so its survival
  // is the proof that the swap never left the page.
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });

  const before = await themeId(page);
  expect(before).not.toBeNull();

  await openAppearance(page);
  await page.locator('#appearance-options button', { hasText: 'DAYLIGHT' }).click();

  // The theme really changed...
  await expect
    .poll(() => themeId(page), { message: 'the document never took the new theme' })
    .toBe('daylight');

  // ...and the page it changed on is the same one.
  expect(
    await page.evaluate(
      () => (window as unknown as { __sameDocument?: boolean }).__sameDocument === true,
    ),
  ).toBe(true);

  // The session that came back is a whole one: the door is up, the shell is
  // inert behind it, and the board's canvas has been rebuilt.
  await expect(page.locator('#front-door')).toBeVisible();
  await expect(page.locator('#game-shell')).toHaveAttribute('inert', '');
  await expect(page.locator('#board canvas')).toBeVisible();

  expect(errors).toEqual([]);
});

test('the swatch keeps the run, and the rebuilt board still plays', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  // A run in progress, then a theme change on top of it. The board is saved
  // after every action, so the restart has to hand it straight back.
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();
  await clearCards(page);

  await page.locator('#board').click({ position: { x: 180, y: 240 } });
  await clearCards(page);
  const placed = await page.locator('#stats').innerText();

  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await page.locator('#to-settings').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await page.locator('#appearance-options button', { hasText: 'HIGH CONTRAST' }).click();

  await expect.poll(() => themeId(page)).toBe('torchlit-bright');

  // The door offers the board back rather than a fresh one — the run
  // survived a scene change that destroyed and rebuilt the whole renderer.
  await expect(page.locator('#front-door-begin')).toContainText('RESUME');
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#board canvas')).toBeVisible();
  expect(await page.locator('#stats').innerText()).toBe(placed);

  expect(errors).toEqual([]);
});

/**
 * The listener-accumulation canary, and the WebGL-context one.
 *
 * Five swaps is well past the ~4 live contexts iOS will hold, and each one
 * re-runs every line of door and panel wiring against the same markup. If
 * `endSession` missed either half — the AbortController or the renderer's
 * own `destroy` — this is where it shows up, as a thrown error or a board
 * that never comes back.
 */
test('five theme swaps in a row leave one live board and no errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  const order = ['DAYLIGHT', 'TORCHLIT', 'HIGH CONTRAST', 'AUTO', 'DAYLIGHT'];
  for (const want of order) {
    await openAppearance(page);
    await page.locator('#appearance-options button', { hasText: want }).click();
    await expect(page.locator('#front-door')).toBeVisible();
  }

  // Exactly one canvas: a renderer that was not destroyed would have left
  // its own behind inside #board.
  await expect(page.locator('#board canvas')).toHaveCount(1);
  await expect(page.locator('#board canvas')).toBeVisible();

  // And the door is still a door, not five doors' worth of handlers.
  await expect(page.locator('#front-door button:visible')).toHaveCount(4);

  expect(errors).toEqual([]);
});
