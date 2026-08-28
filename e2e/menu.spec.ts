import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers';

/**
 * The front door, the wipe and the hall of fame, in a real browser — the
 * three surfaces the launch-week batch reshaped (Session 32) and the smoke
 * spec never walks. Same contract as smoke.spec.ts: production bundle,
 * WebGL rendering for real, any uncaught page error fails the run.
 *
 * Deliberately NOT gameplay tests — this proves the MENU's wiring: what a
 * stranger sees before the first tile, and what RESET ALL actually forgets.
 */

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

/** Open MORE, where everything that is not "play right now" lives since
 *  2026-08-25 — the wipe, the backups, the manual, the hall of fame. */
async function openMore(page: Page): Promise<void> {
  await page.locator('#front-door-more').click();
  await expect(page.locator('#more-panel')).toBeVisible();
}

/**
 * The lean door (Marc, 2026-08-25: "make sure our homepage is lean — WORLDS,
 * DAILY, MORE"). Pinned as a COUNT as well as a list, because the failure
 * mode is not one wrong button, it is the eleven that accumulated one
 * defensible addition at a time between 2026-08-18 and launch week.
 */
test('the home door is four buttons: BEGIN, WORLDS, DAILY, MORE', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  // The door names the game BEGIN opens, before anything is tapped — and a
  // virgin device gets the fresh-world sentence, not a paragraph about
  // remembered ground it does not have (Day-1 batch, 2026-08-20).
  await expect(page.locator('#front-door-begin')).toBeVisible();
  await expect(page.locator('#front-door-name')).toHaveText(/ashwake/i);
  await expect(page.locator('#front-door-mode')).toContainText('A fresh world');

  // Four, in this order, and nothing else. `:visible` rather than a count of
  // the markup: SETTLE and YOUR WORLD exist in the DOM for the detour modes.
  const buttons = page.locator('#front-door button:visible');
  await expect(buttons).toHaveCount(4);
  await expect(buttons.nth(0)).toHaveAttribute('id', 'front-door-begin');
  await expect(buttons.nth(1)).toHaveText('WORLDS');
  await expect(buttons.nth(2)).toContainText('DAILY');
  await expect(buttons.nth(3)).toHaveText('MORE');

  // A detour's door is leaner still, and stays about the detour: no WORLDS
  // and no DAILY on a daily, because neither is the game this door opens.
  await page.locator('#front-door-daily').click();
  await expect(page.locator('#front-door-begin')).toContainText('DAILY');
  const dailyButtons = page.locator('#front-door button:visible');
  await expect(dailyButtons).toHaveCount(3);
  await expect(dailyButtons.nth(1)).toHaveText('YOUR WORLD');
  await expect(dailyButtons.nth(2)).toHaveText('MORE');

  expect(errors).toEqual([]);
});

test('WORLDS holds all three slots, and NOW begins the run BEGIN would', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  await page.locator('#front-door-worlds').click();
  const panel = page.locator('#worlds-panel');
  await expect(panel).toBeVisible();
  // What a world IS, said where the choice is made — it was on no screen at
  // all while the slots sat unexplained on the door. Only RELICS travel
  // (2026-08-27): this line, and the test pinning it, had both outlived the
  // 2026-08-26 split that made a perk the world's own.
  await expect(panel).toContainText('Relics travel between them');
  await expect(panel).toContainText('the perks you find');

  const worlds = page.locator('#worlds-list button');
  await expect(worlds).toHaveCount(3);
  await expect(worlds.nth(0)).toContainText('WORLD 1 · NOW');
  await expect(worlds.nth(1)).toContainText('WORLD 2');

  // NOW is BEGIN wearing the slot's name. The panel has to CLOSE on the way
  // through, or the dialog stack leaves #game-shell inert and hands the
  // player a board they can see and cannot tap.
  await worlds.nth(0).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#front-door')).toBeHidden();
  await expect(page.locator('#game-shell')).not.toHaveAttribute('inert', /.*/);
  await expect(page.locator('#board canvas')).toBeVisible();

  expect(errors).toEqual([]);
});

test('MORE holds the manual, and a virgin device is offered no wipe and no museum', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await openMore(page);

  // HOW TO PLAY and SETTINGS are unconditional — the tutorial door a stranger
  // taps cannot be behind a ledger they have not filled.
  await expect(page.locator('#more-help')).toBeVisible();
  await expect(page.locator('#more-settings')).toBeVisible();

  // A device with nothing to forget gets no wipe (Session 32) and no museum
  // of nothing (Day-1 batch) — and, since 2026-08-25, no THIS DEVICE heading
  // standing over three buttons that are all hidden.
  await expect(page.locator('#more-reset')).toBeHidden();
  await expect(page.locator('#more-fame')).toBeHidden();
  await expect(page.locator('#more-backup')).toBeHidden();
  await expect(page.locator('#more-data-title')).toBeHidden();

  // BACK returns to the door and gives focus back to the button that opened
  // it — the dialog-stack contract, which MORE gets from the same helper the
  // other three panels do rather than from a fourth copy of the wiring.
  await page.locator('#more-back').click();
  await expect(page.locator('#more-panel')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).toBe('front-door-more');

  expect(errors).toEqual([]);
});

/**
 * SETTINGS is a destination now (2026-08-25), not the bottom of a scroll.
 * It opens from MORE on the door and from the MENU tab mid-run, and both
 * paths land on the same panel — there is one switchboard, as there is one
 * manual.
 */
test('SETTINGS opens from the door and from the MENU tab, and stacks over both', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');

  await openMore(page);
  await page.locator('#more-settings').click();
  const settings = page.locator('#settings-panel');
  await expect(settings).toBeVisible();
  await expect(settings).toContainText('Nothing leaves your phone');
  // Over MORE, not instead of it: BACK has to lead somewhere that is still
  // there, and the panel underneath must be inert while it is covered.
  await expect(page.locator('#more-panel')).toBeVisible();
  expect(await page.locator('#more-help').evaluate((el) => el.closest('[inert]') !== null)).toBe(
    true,
  );
  await page.locator('#settings-back').click();
  await expect(settings).toBeHidden();
  await expect(page.locator('#more-help')).toBeEnabled();

  // Mid-run, the same panel through the MENU tab — where every other way out
  // of a run already lives.
  await page.locator('#more-back').click();
  await begin(page);
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await page.locator('#to-settings').click();
  await expect(settings).toBeVisible();
  // Public since 2026-08-27: the look, the sound, the lessons — and no
  // DEVELOPER fold hiding a switch a player wants behind a word that tells
  // them it is not for them.
  await expect(settings).toContainText('APPEARANCE');
  await expect(settings).toContainText('the board is this switch');
  await expect(page.locator('#reset-teaching')).toBeVisible();
  await expect(settings).not.toContainText('DEVELOPER');
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  // Escape reaches the TOP panel only — the manual it opened over is still up.
  await expect(page.locator('#help-panel')).toBeVisible();

  expect(errors).toEqual([]);
});

/**
 * The MENU tab, after the 2026-08-27 concision pass: every way out of a run
 * above the fold, the world's own ledger behind DETAILS — and the NEW WORLD
 * label telling the truth about what survives.
 *
 * That label is pinned because it has now gone stale TWICE under the same
 * storage split: shop levels became a world's own on 2026-08-20 and it still
 * promised them, perks became a world's own on 2026-08-26 and it still
 * promised those. It is read one second before it is obeyed, on the one
 * control in the game that cannot be undone.
 */
test('MENU offers the exits first, folds the world’s ledger, and says only relics travel', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await begin(page);
  await page.locator('#help').click();

  const menu = page.locator('#help-menu');
  await expect(menu).toBeVisible();
  // The exits are on screen without opening anything.
  await expect(page.locator('#to-main-menu')).toBeVisible();
  await expect(page.locator('#to-settings')).toBeVisible();
  await expect(page.locator('#new-run')).toBeVisible();

  // The atlas is behind DETAILS, and comes out when it is asked for.
  const fold = page.locator('#world-details');
  await expect(page.locator('#atlas')).toBeHidden();
  await fold.locator('summary').click();
  await expect(page.locator('#atlas')).toBeVisible();
  await expect(menu).toContainText('SEED');
  // Opening a fold must not close the panel under it.
  await expect(page.locator('#help-panel')).toBeVisible();

  // Every exit is a plain word, and the consequence arrives on the tap
  // (2026-08-27, Marc: "have normal words like Restart and New world that
  // when you tap you get a confirmation about whats going to happen").
  const restart = page.locator('#new-run');
  const abandon = page.locator('#abandon-world');
  await expect(restart).toHaveText('RESTART');
  await expect(abandon).toHaveText('NEW WORLD');
  await expect(page.locator('#to-main-menu')).toHaveText('MAIN MENU');

  await restart.click();
  await expect(restart).toContainText('abandoned unscored');
  await expect(page.locator('#help-panel')).toBeVisible();

  // Reaching for a second control disarms the first: two buttons both saying
  // TAP AGAIN is two questions and no way to tell which one a tap answers.
  await abandon.click();
  await expect(restart).toHaveText('RESTART');
  await expect(abandon).toContainText('only relics travel');
  await expect(abandon).toContainText('perks you found here stay behind');
  await expect(page.locator('#help-panel')).toBeVisible();

  expect(errors).toEqual([]);
});

/**
 * BACK is the only way out but Escape (2026-08-27, Marc: "remove the
 * close-the-menu-on-click and put it only on the back button top right
 * instead"). Tapping the prose used to close the panel, which made every
 * control inside it a special case — the tabs, both DETAILS folds and all
 * four MENU buttons had to swallow their own taps to keep working.
 */
test('the ? panel closes on BACK, and not on the prose', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await begin(page);
  await page.locator('#help').click();

  const panel = page.locator('#help-panel');
  await expect(panel).toBeVisible();

  // Read something, tap it, and the manual is still open. `.help-title`
  // rather than an arbitrary paragraph (Stage 4, 2026-08-27): a manual
  // paragraph can now hold a `button.term` of its own, and this test is
  // about the panel closing on nothing but BACK — not about that button,
  // which gets its own test below.
  await page.locator('.help-tab').nth(1).click();
  await page.locator('.help-panel-body:not([hidden]) .help-title').first().click();
  await expect(panel).toBeVisible();
  await page.locator('#help-name').click();
  await expect(panel).toBeVisible();

  await page.locator('#help-back').click();
  await expect(panel).toBeHidden();

  expect(errors).toEqual([]);
});

/**
 * The glossary's own card (WORKPLAN Stage 4, 2026-08-27): a term inside the
 * manual opens a definition rather than sending a reader hunting the
 * sentence that first used it. `#help-panel` stays open underneath, inert
 * while the card covers it — the same dialog-stack contract every other
 * panel already keeps.
 */
test('a term inside HOW TO PLAY opens its own card, and Escape closes only the card', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await begin(page);
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();

  // START, not MENU — the tutorial tab RIPENS lives on.
  await page.locator('.help-tab').nth(1).click();
  const term = page
    .locator('.help-panel-body:not([hidden]) button.term')
    .filter({ hasText: 'RIPENS' })
    .first();
  await expect(term).toBeVisible();
  await term.click();

  const card = page.locator('#term-card');
  await expect(card).toBeVisible();
  await expect(page.locator('#term-card-name')).toHaveText('RIPENS');
  await expect(page.locator('#term-card-text')).not.toHaveText('');
  await expect(page.locator('#help-panel')).toHaveAttribute('inert', /.*/);

  await page.locator('#term-card-dismiss').click();
  await expect(card).toBeHidden();
  await expect(page.locator('#help-panel')).not.toHaveAttribute('inert', /.*/);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('RIPENS');

  // Reopened, Escape reaches the card only — the manual underneath stays up.
  await term.click();
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(page.locator('#help-panel')).toBeVisible();

  expect(errors).toEqual([]);
});

test('the same tap-a-term flow works from the front door too, via MORE ▸ HOW TO PLAY', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('/');

  await openMore(page);
  await page.locator('#more-help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  // HOW TO PLAY opens straight onto START (pinned above, 2026-08-20), so
  // the term is on screen with no tab click needed.
  const term = page
    .locator('.help-panel-body:not([hidden]) button.term')
    .filter({ hasText: 'RIPENS' })
    .first();
  await expect(term).toBeVisible();
  await term.click();

  await expect(page.locator('#term-card')).toBeVisible();
  await page.locator('#term-card-dismiss').click();
  await expect(page.locator('#term-card')).toBeHidden();
  await expect(page.locator('#help-panel')).toBeVisible();

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

  // The run autosaves; a reload's door says RESUME, and MORE now offers the
  // wipe under its own heading (2026-08-25 — it is not on the door at all).
  await page.reload();
  await expect(page.locator('#front-door-begin')).toContainText('RESUME');
  await openMore(page);
  const reset = page.locator('#more-reset');
  await expect(page.locator('#more-data-title')).toBeVisible();
  await expect(reset).toBeVisible();

  // Two taps, the arming contract: the first only changes the words.
  await reset.click();
  await expect(reset).toContainText('TAP AGAIN');
  await expect(page.locator('#more-panel')).toBeVisible();
  await reset.click();

  // The wipe navigates home. Everything is forgotten: BEGIN (no resume), and
  // the wipe button itself is gone — a virgin device again.
  await expect(page.locator('#front-door-begin')).toBeVisible();
  await expect(page.locator('#front-door-begin')).toHaveText('BEGIN');
  await openMore(page);
  await expect(page.locator('#more-reset')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the hall of fame opens tabbed, and a run row unfolds its night', async ({ page }) => {
  const errors = watchErrors(page);

  // A device WITH a history — the empty hall hides from virgin doors now
  // (Day-1 batch), so the diary is seeded before boot: one finished run,
  // written in the timeline's own stored shape.
  await page.addInitScript(() => {
    localStorage.setItem(
      'tiles.timeline.v1',
      JSON.stringify([
        {
          at: 1755600000000,
          kind: 'run',
          slot: 1,
          worldSeed: 42,
          score: 312,
          reach: 14,
          arc: '▁▅█',
          highlights: [{ kind: 'best-score' }],
          detail: {
            placements: 121,
            harvests: 28,
            popped: 96,
            bigPop: 412,
            bigPopAt: 0.78,
            claims: 3,
            quests: 1,
            relics: 5,
            epitaph: 'Out of tiles on the plane, after 121 placements.',
          },
        },
      ]),
    );
  });
  await page.goto('/');

  await openMore(page);
  await page.locator('#more-fame').click();
  const panel = page.locator('#fame-panel');
  await expect(panel).toBeVisible();

  // Three tabs, always (the timeline is unconditional since Session 32).
  const tabs = panel.locator('.help-tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveText('TIMELINE');
  await expect(tabs.nth(1)).toHaveText('DAILY');
  await expect(tabs.nth(2)).toHaveText('TOTALS');
  await expect(panel.locator('.fame-chip')).toHaveCount(4);

  // The seeded run is a row wearing its chevron; tapping it unfolds the
  // end screen it kept — score at end-screen weight, the epitaph, the
  // facts (Marc: "a 'full detail' of the run").
  const row = panel.locator('button.fame-run').first();
  await expect(row).toContainText('312 pts');
  await expect(row).toContainText('▸');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.locator('.fame-score').first()).toHaveText('312 pts');
  await expect(panel).toContainText('Out of tiles on the plane');
  await expect(panel).toContainText('121 placements');
  await expect(panel).toContainText('❋ NEW BEST');

  // TOTALS is the original flat ledger: three worlds, the daily, perks.
  await tabs.nth(2).click();
  await expect(panel).toContainText('WORLDS');
  await expect(panel).toContainText('THE DAILY');
  await expect(panel).toContainText('PERKS FOUND');

  // BACK lands on MORE, the panel it was opened from — not on the door.
  await page.locator('#fame-back').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#more-panel')).toBeVisible();

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

  // One wire: the SETTINGS switch reads the same flag as ON. Through the
  // MENU tab since 2026-08-25 — the switchboard is its own screen now.
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await page.locator('#to-settings').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  const soundRow = page.locator('.flag', { hasText: 'Sound' }).locator('.flag-toggle');
  await expect(soundRow).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-back').click();
  await page.locator('#help-panel').click();

  // Sticky: the choice survives a reload.
  await page.reload();
  await begin(page);
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');

  expect(errors).toEqual([]);
});

/**
 * HOW TO PLAY opens the TUTORIAL, not the menu (2026-08-20).
 *
 * MENU took the tab bar's first seat the same day it was built, which aimed
 * the front door's only tutorial door at an atlas of zeroes and three
 * navigation buttons — with the actual lesson one tap to the right, four days
 * before the stranger test. The stranger test is the one v1.0 gate, so this
 * is pinned rather than trusted. Behind MORE since 2026-08-25, which is one
 * tap further and makes the pinning matter more, not less.
 */
test('HOW TO PLAY opens on the tutorial, and the in-run ? opens on MENU', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  await openMore(page);
  await page.locator('#more-help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  // The visible panel body is START's — the first lesson, not the atlas.
  const shown = page.locator('.help-panel-body:not([hidden])');
  await expect(shown).toContainText('THE BOARD');
  await expect(shown).not.toContainText('YOUR WORLD ·');
  await page.locator('#help-back').click();
  await expect(page.locator('#help-panel')).toBeHidden();
  // Back on MORE, where it was opened from.
  await expect(page.locator('#more-panel')).toBeVisible();
  await page.locator('#more-back').click();

  // Mid-run the default stands: ? opens onto MENU, which is what it is for.
  await page.locator('#front-door-begin').click();
  await page.locator('#event-card-dismiss').click();
  await page.locator('#help').click();
  await expect(page.locator('.help-panel-body:not([hidden])')).toContainText('YOUR WORLD ·');

  expect(errors).toEqual([]);
});

/**
 * BACK UP / RESTORE, end to end through real localStorage (2026-08-21).
 *
 * This is the door out of a device that the platform is entitled to wipe —
 * Safari evicts a non-persisted origin after about a week, in-app browsers
 * discard storage wholesale, phones get replaced. A backup that silently
 * restores nothing is worse than none, because it fails at the one moment it
 * was kept for. So this exercises the actual round trip, not the codec:
 * write a world, back it up, wipe the device, put it back.
 */
test('a backup survives a wipe and puts the same world back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  // A device with something on it: a world seed and a purse worth keeping.
  await page.evaluate(() => {
    // A COMPLETE world: `decodeWorld` requires both key lists, and a world
    // it refuses is replaced by a fresh one on the next boot — which is the
    // contract, and which would quietly make this test back up the wrong
    // world if the fixture were half a world.
    localStorage.setItem(
      'tiles.world.v1',
      JSON.stringify({ worldSeed: 4242, revealed: ['0,0'], territories: [] }),
    );
    localStorage.setItem('tiles.progress.v1', JSON.stringify({ relics: 412, bought: {}, met: [] }));
  });
  await page.reload();

  // The backup itself, taken through the module the button uses. (The button
  // hands the file to the share sheet or a download, neither of which a
  // headless browser can be asked about — what matters here is that what it
  // produces genuinely restores.)
  const backup = await page.evaluate(() => {
    const keys: Record<string, string> = {};
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tiles.')) keys[key] = localStorage.getItem(key) ?? '';
    }
    return JSON.stringify({ format: 1, sha: 'test', at: '2026-08-21T00:00:00.000Z', keys });
  });
  expect(backup).toContain('4242');

  // RESET ALL, for real, through the UI — the wipe this is insurance against.
  await openMore(page);
  const reset = page.locator('#more-reset');
  await expect(reset).toBeVisible();
  await reset.click();
  await reset.click();
  await expect(page.locator('#front-door-begin')).toBeVisible();
  // Wait for the SESSION the wipe starts, not merely for the door to exist
  // (2026-08-27). The wipe used to reload, and this assertion waited for the
  // new page by waiting for the door to come back; in place the door never
  // left, so it passed instantly and read storage mid-swap. A virgin device
  // is what RESET ALL is FOR, and this line is the first moment it is true —
  // the mode line is written by the session that starts after the wipe.
  await expect(page.locator('#front-door-mode')).toContainText('A fresh world');
  // Not null — the wipe starts a session, and boot mints a fresh world
  // immediately. What matters is that it is a DIFFERENT world, and that the
  // purse is gone.
  const wiped = await page.evaluate(() => ({
    world: localStorage.getItem('tiles.world.v1'),
    progress: localStorage.getItem('tiles.progress.v1'),
  }));
  expect(wiped.world ?? '').not.toContain('4242');
  expect(wiped.progress ?? '').not.toContain('412');

  // Put it back the way the button does, then prove the world came with it.
  await page.evaluate((raw: string) => {
    const parsed = JSON.parse(raw) as { keys: Record<string, string> };
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tiles.')) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(parsed.keys)) localStorage.setItem(key, value);
  }, backup);
  await page.reload();

  const restored = await page.evaluate(() => ({
    world: localStorage.getItem('tiles.world.v1'),
    progress: localStorage.getItem('tiles.progress.v1'),
  }));
  expect(restored.world).toContain('4242');
  expect(restored.progress).toContain('412');

  expect(errors).toEqual([]);
});

/**
 * The board's chrome belongs to the board (Marc, on the phone, 2026-08-27:
 * "i can see the ♪ sound, here/fit inside the home screen (not in play mode
 * only anymore)").
 *
 * `#camera` was raised to z-index 3 to clear the toast, which TIES it with
 * the front door — and a tie is broken by document order, where #game-shell
 * comes last. So the ?, ♪ and FIT buttons painted straight through the door
 * they were supposed to be behind. `inert` was no help: it takes a control
 * out of the tab order and out of hit-testing, and does nothing whatsoever
 * about paint.
 *
 * Pinned by what a THUMB would find, not only by the style: the point where
 * the camera sits has to belong to the door.
 */
test('the board’s camera chrome stays off the front door', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  const camera = page.locator('#camera');
  await expect(camera).toBeHidden();

  // Whatever is under that corner is the door's, not the board's.
  const owner = await page.evaluate(() => {
    const box = document.getElementById('board')?.getBoundingClientRect();
    if (box === undefined) return 'no board';
    // The camera's own corner: 8px in from bottom-right of #board.
    const el = document.elementFromPoint(box.right - 30, box.bottom - 30);
    return el?.closest('#camera') !== null && el?.closest('#camera') !== undefined
      ? 'camera'
      : 'not camera';
  });
  expect(owner).toBe('not camera');

  // And it comes back the moment the board is actually in play.
  await begin(page);
  await expect(camera).toBeVisible();
  await expect(page.locator('#camera-toggle')).toBeVisible();
  await expect(page.locator('#sound-toggle')).toBeVisible();

  // A held card covers the board too — and it is INSIDE the shell, so it
  // inerts `#board` rather than `#game-shell`. The camera was painting over
  // the card for the same z-index reason it painted over the door.
  await page.locator('#board').click({ position: { x: 180, y: 240 } });
  const card = page.locator('#event-card');
  if (await card.isVisible()) {
    await expect(camera).toBeHidden();
    await page.locator('#event-card-dismiss').click();
    await expect(card).toBeHidden();
    await expect(camera).toBeVisible();
  }

  // So does the manual, which inerts the shell from outside it.
  await page.locator('#help').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await expect(camera).toBeHidden();

  expect(errors).toEqual([]);
});

/**
 * A panel that covers the game actually covers it (2026-08-21).
 *
 * "Modal" was a paint job: `inert` appeared once in the whole codebase and
 * only to clear it, so the hall of fame sat over the front door with BEGIN
 * and RESET ALL still clickable behind it. This is a hit-testing bug, which
 * is exactly the class the unit suite cannot see — happy-dom has no layout.
 */
test('a panel over the front door makes it unreachable, not just invisible', async ({ page }) => {
  const errors = watchErrors(page);

  // Seeded BEFORE boot, in the shape `decodeEntry` actually accepts — a run
  // entry needs `arc` and `highlights` as well as the counts, and an entry
  // it refuses leaves the hall of fame hidden and this test green for the
  // wrong reason.
  await page.addInitScript(() => {
    localStorage.setItem(
      'tiles.timeline.v1',
      JSON.stringify([
        {
          at: 1755600000000,
          kind: 'run',
          slot: 1,
          worldSeed: 42,
          score: 312,
          reach: 14,
          arc: '▁▅█',
          highlights: [],
        },
      ]),
    );
  });
  await page.goto('/');

  const begin = page.locator('#front-door-begin');
  await expect(begin).toBeVisible();
  await openMore(page);

  // The door must be INERT, not merely painted over. A full-screen panel
  // already swallows a mouse click by layout — I checked, by disabling the
  // inert pass and watching a click-based assertion pass anyway — so the
  // thing that was actually broken is the KEYBOARD: BEGIN and RESET ALL
  // stayed tabbable and focusable behind the panel.
  await expect(page.locator('#front-door')).toBeVisible();
  expect(await begin.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);

  // Focus refuses to land there while it is inert — the property that makes
  // the panel modal rather than opaque.
  await begin.evaluate((el: HTMLElement) => {
    el.focus();
  });
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('front-door-begin');

  // Two deep (2026-08-25): the hall of fame opens over MORE, and MORE goes
  // inert in its turn while keeping the door inert underneath it. This is
  // the case the old hand-rolled panels could not have got right — each one
  // cleared what it found rather than restoring what it changed.
  await page.locator('#more-fame').click();
  await expect(page.locator('#fame-panel')).toBeVisible();
  expect(await page.locator('#more-fame').evaluate((el) => el.closest('[inert]') !== null)).toBe(
    true,
  );

  // Escape from ANYWHERE, not only with focus inside the panel — which is
  // all the old panel-scoped handler could manage, and tabbing out of it
  // used to strand you on a door you could not use. One press, ONE panel:
  // the hall of fame closes and MORE is live again underneath it.
  await page.keyboard.press('Escape');
  await expect(page.locator('#fame-panel')).toBeHidden();
  await expect(page.locator('#more-panel')).toBeVisible();
  expect(await page.locator('#more-fame').evaluate((el) => el.closest('[inert]') !== null)).toBe(
    false,
  );
  // The door is still inert under MORE — closing the top panel must not have
  // handed back what the one below it took.
  expect(await begin.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#more-panel')).toBeHidden();

  // And with both gone, the door works again.
  await begin.click();
  await expect(page.locator('#front-door')).toBeHidden();

  expect(errors).toEqual([]);
});
