import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

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

/**
 * Does this PNG carry the ENTROPY of a picture, or is it a flat rectangle in
 * disguise (2026-08-21, `the board renders a picture` below)? A WebGL
 * context that never came up, a layout collapsed to nothing, a draw that
 * threw halfway, or a snapshot capturing the clear colour and nothing else:
 * each ends in a flat fill, each compresses to almost nothing, and each
 * currently reaches production unchallenged. Counting distinct byte-chunks
 * measures how much VARIETY survived PNG compression — precisely the axis a
 * flat fill collapses on, whatever colour it happens to be. Measured on a
 * real board: ~60KB and ~15,000 distinct chunks, against thresholds two
 * orders of magnitude below that — deliberately NOT pixel-diffing, since a
 * baseline image would differ between this machine and CI's Linux renderer,
 * buying flakiness rather than confidence.
 */
function assertLooksLikeAPicture(bytes: Buffer, label: string): void {
  const seen = new Set<string>();
  for (let i = 0; i + 4 <= bytes.byteLength; i += 4) {
    seen.add(bytes.subarray(i, i + 4).toString('hex'));
  }
  expect(bytes.byteLength, `${label}: suspiciously small`).toBeGreaterThan(8000);
  expect(seen.size, `${label}: looks like a single flat colour`).toBeGreaterThan(1000);
}

/**
 * Taps an expanding ring of points around a centre until the TILES stat
 * drops — i.e. until one tap actually placed something, rather than merely
 * explaining a hex or landing on ground already spent. Same technique the
 * daily-resume test above uses to hunt a legal hex without knowing the
 * board's layout ahead of time; factored out here because the new tests
 * below need "place at least one tile" as a precondition, not a whole test
 * on its own.
 */
async function placeOneTile(page: Page, cx: number, cy: number): Promise<void> {
  const tilesNow = async (): Promise<number> =>
    Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  const before = await tilesNow();
  for (const radius of [40, 60, 80, 30, 100, 20, 120, 140]) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI / 6) * i;
      await page.mouse.click(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      if ((await tilesNow()) < before) return;
    }
  }
  throw new Error('placeOneTile: no legal hex found in the search rings');
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

  // A REAL phone in portrait, which is the only device this game targets and
  // the only shape its layout is designed for. Pinned here rather than left
  // to the runner's default because this test hunts for a legal hex by
  // tapping pixels: a desktop-shaped viewport puts the ring somewhere else
  // entirely, which is exactly how this went green locally and red on CI.
  await page.setViewportSize({ width: 390, height: 844 });

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
  // Hunt for one legal hex, and be thorough about it. The hand arrives with a
  // card already taken, so a board tap IS the placement — but WHICH taps are
  // legal depends on the day: this is the daily, its seed changes every
  // midnight, and the ring around the arrival clearing can hold walls. A
  // sparse sweep passed for weeks of seeds and then failed on CI's, which is
  // the worst way to learn that a test is a coin toss.
  //
  // So: rings of radius, twelve directions each, stopping the instant the
  // purse moves. The radii are ordered by where the ring ACTUALLY sits at
  // this viewport (measured across five daily seeds: 2 to 18 taps of the 108
  // available), most likely first — headroom is the whole point, since the
  // seed this runs against is whatever date the runner thinks it is.
  const tilesNow = async (): Promise<number> =>
    Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());
  let tilesAfter = tilesBefore;
  outer: for (const radius of [74, 90, 60, 105, 120, 48, 140, 165, 190]) {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI / 6) * i;
      await page.mouse.click(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      tilesAfter = await tilesNow();
      if (tilesAfter < tilesBefore) break outer;
    }
  }
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

/**
 * The board actually DREW something (2026-08-21).
 *
 * `STATUS.md` has carried "nothing visual is tested by this repository" since
 * the fields were built — happy-dom has no canvas, so every visual claim in
 * this project is verified as wiring and unverified as a picture. This is the
 * cheap floor under that, and deliberately NOT pixel diffing: baseline images
 * would differ between this machine and CI's Linux renderer, buying flakiness
 * rather than confidence.
 *
 * It asserts the one thing a blank board cannot fake — that the screenshot
 * carries the ENTROPY of a picture. A WebGL context that never came up, a
 * layout collapsed to nothing, a draw that threw halfway: each ends in a flat
 * rectangle, each compresses to almost nothing, and each currently reaches
 * production unchallenged. Measured on a real board: ~60KB and ~15,000
 * distinct chunks, against a threshold two orders of magnitude below that.
 */
test('the board renders a picture, not a flat rectangle', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=7');
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();

  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(100);

  // A screenshot rather than `toDataURL`: reading a WebGL canvas back needs
  // `preserveDrawingBuffer`, which the renderer does not ask for and should
  // not have to. A screenshot sees what the player sees.
  const shot = await canvas.screenshot();
  assertLooksLikeAPicture(shot, 'the opening board');

  expect(errors).toEqual([]);
});

/**
 * The same floor, after a placement (2026-08-26).
 *
 * The opening board draws once and sits still; a placement is the first
 * redraw the camera and the renderer do together — new ground, a fresh
 * frontier, the placed tile's own pop animation queued. If a redraw after
 * state actually changes is where a texture cache or an animation frame
 * goes wrong, the boot-only screenshot above would never see it.
 */
test('after a placement, the board still draws a picture, not a flat rectangle', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=7');
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();

  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await placeOneTile(page, cx, cy);
  const shot = await canvas.screenshot();
  assertLooksLikeAPicture(shot, 'the board after a placement');

  expect(errors).toEqual([]);
});

/**
 * The same floor, either side of the FIT⇄HERE camera toggle (2026-08-26).
 *
 * The camera is FLOWN rather than cut (STATUS.md, Day-1 rulings), which
 * means a tween runs every frame while it moves — `PixiRenderer#zoomLevel`
 * only reaches the destination once the flight lands, some `CAMERA_MS` (320)
 * later. That per-frame draw during a zoom is exactly the class of change
 * POLISH.md called out as unmeasured and silently breakable — this is the
 * cheap floor under it: toggle, wait for the fly to land, screenshot; toggle
 * back, wait, screenshot again. Deliberately not asserting on the button's
 * own label text either side of the tap — `#syncCamera` (`src/ui/game.ts`)
 * reads the zoom synchronously at click time, before the tween has advanced
 * a frame, so the label reflects the PRE-click state until some later
 * gesture happens to call it again; that is a real, separate staleness this
 * session is not the one to fix (only the render floor is in scope here).
 */
test('after the FIT⇄HERE camera toggle, the board still draws a picture, not a flat rectangle', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=7');
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();

  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await placeOneTile(page, cx, cy);
  // A placement can start the camera flying on its own; let that land
  // before driving the toggle.
  await page.waitForTimeout(700);

  const toggle = page.locator('#camera-toggle');
  await toggle.click();
  await page.waitForTimeout(700);
  assertLooksLikeAPicture(await canvas.screenshot(), 'the board after the first camera toggle');

  await toggle.click();
  await page.waitForTimeout(700);
  assertLooksLikeAPicture(await canvas.screenshot(), 'the board after toggling back');

  expect(errors).toEqual([]);
});

/**
 * The same floor, on the end screen (2026-08-26).
 *
 * `#renderEnd` takes exactly one snapshot of the board at the ended
 * transition (`PixiRenderer#snapshot`, `src/ui/game.ts`) and hands it to the
 * `<img class="end-snapshot">` on the end screen as a PNG data URL — the
 * player's one lasting picture of the run, and the same asset the share card
 * builds from. `snapshot()` already has an honest-null contract for a
 * missing 2D API; what nothing checks is whether a REAL browser's capture
 * came back as an actual picture rather than the clear colour alone (a
 * `clearColor` bug or an empty stage would both pass a mere non-null check).
 *
 * Reaching "ended" for real means playing an actual run out — no debug
 * shortcut exists, and content/engine are off-limits to this session. Seed 7
 * at this exact viewport ends deterministically in 24 placements / 248 taps
 * (measured by hand before this test was written), so the loop below is
 * shaped around that, with headroom rather than a hard-coded count.
 */
test('the end screen carries a real picture of the run, not a blank capture', async ({ page }) => {
  // 300s, not 60: the run finishes in ~8s on a dev machine, but a CI runner
  // pays its slower locator round-trips 248 times over — the 60s budget this
  // test shipped with timed out up there on every push and silently held the
  // WHOLE deploy pipeline shut for a day's worth of commits (2026-08-26).
  // The generosity costs nothing when green; only a genuinely stuck run
  // spends it.
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?seed=7');
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();

  const canvas = page.locator('#board canvas');
  await expect(canvas).toBeVisible();

  const tilesNow = async (): Promise<number> =>
    Number(await page.locator('[data-stat="tiles"] .stat-value').textContent());

  // Any modal in the way of the next tap: the first-contact card, the
  // crossing card (arms on tap one, confirms on tap two — both fall out of
  // clicking the one shared dismiss button twice), or the harvest choice
  // that appears once a pocket ripens. TILES is deliberately last choice: it
  // refunds tiles, which is the one outcome that would keep this run solvent
  // forever instead of ending it.
  async function clearWhatBlocksTheNextTap(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      const card = page.locator('#event-card');
      if (!(await card.isVisible().catch(() => false))) break;
      await page
        .locator('#event-card-dismiss')
        .click({ timeout: 2000 })
        .catch(() => undefined);
    }
    for (const id of ['harvest-points', 'harvest-burn', 'harvest-treasure', 'harvest-tiles']) {
      const button = page.locator(`#${id}`);
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 2000 }).catch(() => undefined);
        break;
      }
    }
  }

  const radii = [40, 60, 80, 100, 30, 120, 20, 140, 160, 180, 200, 10];
  const maxTaps = 1000;
  let taps = 0;
  let box = (await canvas.boundingBox())!;
  let cx = box.x + box.width / 2;
  let cy = box.y + box.height / 2;
  const ended = async (): Promise<boolean> =>
    page
      .locator('#end')
      .isVisible()
      .catch(() => false);

  outer: while (taps < maxTaps && !(await ended())) {
    await clearWhatBlocksTheNextTap();
    if (await ended()) break;

    let placedThisSweep = false;
    for (const radius of radii) {
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI / 6) * i;
        const before = await tilesNow().catch(() => -1);
        await page.mouse.click(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        taps++;
        await clearWhatBlocksTheNextTap();
        if (await ended()) break outer;
        if ((await tilesNow().catch(() => before)) < before) placedThisSweep = true;
        if (taps >= maxTaps) break outer;
      }
      if (placedThisSweep) break;
    }
    if (!placedThisSweep) {
      // The structure has grown past what the ring sweep can reach from the
      // player's own position — fit the camera to the whole thing and
      // re-centre the sweep on what is now visible.
      const toggle = page.locator('#camera-toggle');
      if ((await toggle.textContent())?.trim() !== 'FIT') break;
      await toggle.click();
      taps++;
      await page.waitForTimeout(700);
      box = (await canvas.boundingBox())!;
      cx = box.x + box.width / 2;
      cy = box.y + box.height / 2;
    }
  }

  await expect(page.locator('#end')).toBeVisible();

  const snapshot = page.locator('.end-snapshot');
  await expect(snapshot).toBeVisible();
  const src = await snapshot.getAttribute('src');
  expect(src, 'the end screen has no snapshot image at all').not.toBeNull();
  const match = src?.match(/^data:image\/png;base64,(.+)$/);
  const base64 = match?.[1];
  expect(base64, 'the snapshot src is not a PNG data URL').not.toBeUndefined();
  assertLooksLikeAPicture(Buffer.from(base64 as string, 'base64'), 'the end-screen snapshot');

  expect(errors).toEqual([]);
});
