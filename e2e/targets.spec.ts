import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/**
 * Every control a thumb can reach is at least 44px to that thumb.
 *
 * `NEXT.md` §4 has carried this as "a source-level test that every
 * `min-height` under 44px appears in the hit-area block", parked as "worth it
 * only to hold the class permanently". The class recurred on 2026-08-28 — the
 * screen audit went looking for it — so it is worth it now. But the shape it
 * was parked in would not have worked, and that is the more useful half of
 * what the audit learned:
 *
 *   - **The size is usually not declared.** `#stats .stat` has no
 *     `min-height` at all; its 36px is content plus padding. A scanner
 *     looking for small `min-height` values would have found nothing there.
 *   - **The target is usually not the element.** `style.css` grows small
 *     controls with a transparent pseudo — `::before` at `max(100%, 44px)`
 *     for most, `::after { inset: -6px }` for the HUD stats, sized against
 *     that row's own gap so neighbours meet exactly and never cross. Reading
 *     the box alone reports every one of them as a miss; reading only
 *     `::before` reports the stats as misses, which is exactly the false
 *     positive that nearly bought a redundant stylesheet rule.
 *
 * So it is measured where all three of those are already resolved: in a real
 * browser, on the rendered page, as the union of the element and both its
 * pseudo-elements. Two screens rather than the audit's full sweep — this is a
 * gate, and the gate's job is to hold a class, not to survey the game.
 */

/** The union of an element's own box and both its pseudo-elements', which is
 *  what a finger actually gets. Runs in the page. */
const SMALLEST_TARGETS = (): { where: string; w: number; h: number }[] => {
  const out: { where: string; w: number; h: number }[] = [];
  for (const el of document.querySelectorAll('button, [role="button"], summary')) {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (el.closest('[inert]') !== null) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    let w = box.width;
    let h = box.height;
    for (const which of ['::before', '::after'] as const) {
      const pseudo = getComputedStyle(el, which);
      if (pseudo.content === 'none') continue;
      const pw = parseFloat(pseudo.width);
      const ph = parseFloat(pseudo.height);
      if (Number.isFinite(pw)) w = Math.max(w, pw);
      if (Number.isFinite(ph)) h = Math.max(h, ph);
    }

    const cls = el.className;
    const classes = typeof cls === 'string' && cls !== '' ? `.${cls.trim().split(/\s+/)[0]}` : '';
    const owner =
      el.parentElement?.id !== undefined && el.parentElement.id !== ''
        ? `#${el.parentElement.id} > `
        : '';
    out.push({
      where: el.id !== '' ? `#${el.id}` : `${owner}${el.tagName.toLowerCase()}${classes}`,
      // Rounded, like the audit: 43.98px is 44px to a thumb, and an
      // un-rounded compare fails with "44 is less than 44".
      w: Math.round(w),
      h: Math.round(h),
    });
  }
  return out;
};

async function assertAllThumbable(page: Page, screen: string): Promise<void> {
  const targets = await page.evaluate(SMALLEST_TARGETS);
  expect(targets.length, `${screen}: no controls found at all — the walk is wrong`).toBeGreaterThan(
    2,
  );
  const small = targets.filter((t) => Math.min(t.w, t.h) < 44);
  expect(
    small,
    `${screen}: controls under the 44px thumb floor — either give them the ` +
      `pseudo-element target the hit-area block in style.css spends, or grow the box`,
  ).toEqual([]);
}

test('every control on the front door and its panels is thumbable', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#front-door-begin')).toBeVisible();
  await assertAllThumbable(page, 'the front door');

  await page.locator('#front-door-more').click();
  await expect(page.locator('#more-panel')).toBeVisible();
  await assertAllThumbable(page, 'MORE');

  await page.locator('#more-settings').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await assertAllThumbable(page, 'SETTINGS');

  expect(errors).toEqual([]);
});

test('every control on the board is thumbable, with the purse open and shut', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=7');
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#board canvas')).toBeVisible();

  // The virgin device's first-contact card holds `#game-shell` inert, and an
  // inert control is deliberately not measured — dismiss it so the board's
  // own chrome is what this walks.
  const card = page.locator('#event-card');
  if (await card.isVisible().catch(() => false)) {
    await page.locator('#event-card-dismiss').click();
    await expect(card).toBeHidden();
  }
  await assertAllThumbable(page, 'the board');

  // The purse is the fold with the most controls in the game, and the one
  // whose rows spend a currency a mis-tap cannot give back.
  const purse = page.locator('#purse-toggle');
  if (await purse.isVisible().catch(() => false)) {
    await purse.click();
    await assertAllThumbable(page, 'the purse, open');
  }

  // The manual, where the DETAILS folds live — the control that failed this
  // class on 2026-08-27.
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await assertAllThumbable(page, 'the manual');

  expect(errors).toEqual([]);
});
