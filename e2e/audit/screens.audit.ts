/**
 * Every screen this game has, in every skin, on three device histories.
 *
 * The audit `STATUS.md` has been owed since the fields were built: "nothing
 * visual is tested by this repository". The smoke spec proved a board draws a
 * picture rather than a flat rectangle, which is the floor. This is the
 * ceiling — it walks the front door, all six panels, the manual's five tabs,
 * the board, the purse and the end screen, screenshots each at 390×844 in
 * portrait, and measures the live DOM for contrast, tap targets, overflow and
 * clipped text on every one.
 *
 * Three histories, because most of these screens are empty on a virgin phone
 * and the empty version is not the one that breaks: the shop with no purse,
 * the hall of fame with no rows and the atlas with no ground all look fine.
 * `pnpm fixtures` plays them (see `scripts/fixtures.ts`) — a device five runs
 * in, and a device three hundred runs in with every shrine woken, every perk
 * found, 6,145 relics and a 302-row diary.
 *
 * Not part of `pnpm test:e2e`: it is a `.audit.ts`, which Playwright's default
 * `testMatch` does not pick up, and it runs from its own config.
 *
 *   pnpm audit:screens              → audit-shots/ and audit-shots/report.md
 *   pnpm audit:screens --grep daylight
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { AUDIT_IN_PAGE, type Finding } from './audit';

/** A real phone in portrait — the only device this game targets. */
const VIEWPORT = { width: 390, height: 844 };

/** The three skins a player can actually choose. `placeholder` is
 *  `resolveTheme`'s fallback and the greyscale test's control, not a skin. */
const SKINS = ['torchlit', 'torchlit-bright', 'daylight'] as const;

const SHOTS = 'audit-shots';

type Bag = Record<string, string>;
type Fixtures = { states: Record<string, Bag>; summary: Record<string, unknown> };

const FIXTURE_PATH = join(process.cwd(), 'e2e', 'fixtures', 'states.json');
if (!existsSync(FIXTURE_PATH)) {
  throw new Error(`no fixtures at ${FIXTURE_PATH} — run \`pnpm fixtures\` first`);
}
const FIXTURES = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixtures;

/** Everything found across the whole sweep, written out at the end. */
const REPORT: { screen: string; skin: string; state: string; finding: Finding }[] = [];

/**
 * Put a device's whole history on the page before its first line of script
 * runs, and pin the skin.
 *
 * `addInitScript` rather than an `evaluate` after `goto`: the shell resolves
 * the slot, the world, the theme and the run at the top of `startSession`, so
 * anything written after the first frame is a history the game has already
 * decided it does not have.
 */
async function seed(page: Page, state: string, skin: string): Promise<void> {
  const bag = FIXTURES.states[state];
  if (bag === undefined) throw new Error(`no fixture state named ${state}`);
  await page.addInitScript(
    ([entries, theme]) => {
      try {
        localStorage.clear();
        for (const [k, v] of entries) localStorage.setItem(k, v);
        localStorage.setItem('tiles.theme.v2', theme);
      } catch {
        // A context that refuses storage would shoot a virgin device for
        // every state, which is a silent lie. Fail loudly instead.
        throw new Error('audit: this browser context refuses localStorage');
      }
    },
    [Object.entries(bag), skin] as const,
  );
}

/**
 * Shoot one screen and measure it.
 *
 * Full page rather than the viewport: a panel that scrolls is a panel whose
 * bottom half nobody has ever looked at, and the bottom half is where the
 * long lists live on the very-played device.
 */
async function capture(page: Page, name: string, skin: string, state: string): Promise<void> {
  const dir = join(SHOTS, skin);
  mkdirSync(dir, { recursive: true });
  // Let a fade or a camera flight land: the router transitions scenes, and a
  // shot taken mid-fade is a shot of nothing anyone sees.
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(dir, `${state}-${name}.png`), fullPage: false });
  for (const finding of await page.evaluate(AUDIT_IN_PAGE)) {
    REPORT.push({ screen: name, skin, state, finding });
  }
}

/** Open a panel by its door and wait for it, or say it was not there. */
async function openPanel(page: Page, door: string, panel: string): Promise<boolean> {
  const button = page.locator(door);
  if (!(await button.isVisible().catch(() => false))) return false;
  await button.click();
  await expect(page.locator(panel)).toBeVisible();
  return true;
}

/** Through the front door, past the first-contact card a virgin device meets. */
async function begin(page: Page): Promise<void> {
  await page.locator('#front-door-begin').click();
  await expect(page.locator('#front-door')).toBeHidden();
  await expect(page.locator('#board canvas')).toBeVisible();
  const card = page.locator('#event-card');
  if (await card.isVisible().catch(() => false)) {
    await page.locator('#event-card-dismiss').click();
    await expect(card).toBeHidden();
  }
}

/** Every tab of a tabbed panel, shot one at a time. */
async function eachTab(page: Page, prefix: string, skin: string, state: string): Promise<void> {
  const tabs = page.locator('.help-tab:visible');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    const label = ((await tab.textContent()) ?? String(i)).trim().toLowerCase();
    await tab.click();
    await capture(page, `${prefix}-${label}`, skin, state);
  }
}

for (const skin of SKINS) {
  for (const state of ['fresh', 'played', 'veryPlayed'] as const) {
    test(`${skin} · ${state} · the menus`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(VIEWPORT);
      await seed(page, state, skin);
      await page.goto('/');
      await expect(page.locator('#front-door-begin')).toBeVisible();

      await capture(page, 'door', skin, state);

      if (await openPanel(page, '#front-door-worlds', '#worlds-panel')) {
        await capture(page, 'worlds', skin, state);
        await page.locator('#worlds-back').click();
      }

      await openPanel(page, '#front-door-more', '#more-panel');
      await capture(page, 'more', skin, state);

      if (await openPanel(page, '#more-settings', '#settings-panel')) {
        await capture(page, 'settings', skin, state);
        await page.locator('#settings-back').click();
      }

      if (await openPanel(page, '#more-fame', '#fame-panel')) {
        await eachTab(page, 'fame', skin, state);
        await page.locator('#fame-back').click();
      }

      if (await openPanel(page, '#more-help', '#help-panel')) {
        await capture(page, 'manual-menu', skin, state);
        await eachTab(page, 'manual', skin, state);
        await page.locator('#help-back').click();
      }

      await page.locator('#more-back').click();

      if (await openPanel(page, '#front-door-shop', '#shop-panel')) {
        await capture(page, 'shop', skin, state);
        await page.locator('#shop-back').click();
      }

      // The daily's own door — a different set of buttons and a different
      // sentence, and the one home screen a shared link never shows.
      if (
        await page
          .locator('#front-door-daily')
          .isVisible()
          .catch(() => false)
      ) {
        await page.locator('#front-door-daily').click();
        await expect(page.locator('#front-door-begin')).toContainText('DAILY');
        await capture(page, 'door-daily', skin, state);
      }
    });

    test(`${skin} · ${state} · in play`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(VIEWPORT);
      await seed(page, state, skin);
      await page.goto('/');
      await begin(page);

      await capture(page, 'board', skin, state);

      // FIT, so the whole grown structure is in frame — the very-played
      // device's board is 165 placements wide and HERE shows a corner of it.
      await page.locator('#camera-toggle').click();
      await capture(page, 'board-fit', skin, state);
      await page.locator('#camera-toggle').click();

      const purse = page.locator('#purse-toggle');
      if (await purse.isVisible().catch(() => false)) {
        await purse.click();
        await capture(page, 'purse', skin, state);
        await purse.click();
      }

      await page.locator('#help').click();
      await expect(page.locator('#help-panel')).toBeVisible();
      await capture(page, 'play-menu', skin, state);
      await eachTab(page, 'play-manual', skin, state);
      await page.locator('#help-back').click();
    });
  }

  test(`${skin} · the end screen`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(VIEWPORT);
    await seed(page, 'ended', skin);
    await page.goto('/');
    await begin(page);
    const end = page.locator('#end');
    await expect(end).toBeVisible();
    await capture(page, 'end', skin, 'ended');

    // The breakdown is the half of the end screen nobody sees by default.
    const breakdown = page.locator('.end-breakdown summary');
    if (await breakdown.isVisible().catch(() => false)) {
      await breakdown.click();
      await capture(page, 'end-details', skin, 'ended');
    }
  });
}

/**
 * The report, written once every worker has finished.
 *
 * Sorted worst-first within each kind, because a sweep this wide produces a
 * list nobody reads top to bottom — the point is the first ten lines.
 */
test.afterAll(() => {
  mkdirSync(SHOTS, { recursive: true });
  const rows = REPORT.slice().sort((a, b) => {
    if (a.finding.kind !== b.finding.kind) return a.finding.kind.localeCompare(b.finding.kind);
    return a.finding.value - b.finding.value;
  });
  const lines = rows.map(
    (r) =>
      `| ${r.finding.kind} | ${r.skin} | ${r.state} | ${r.screen} | \`${r.finding.where}\` | ` +
      `${r.finding.text.replace(/\|/g, '\\|')} | ${r.finding.value} (bar ${r.finding.bar}) | ` +
      `${r.finding.detail} |`,
  );
  // A count per kind first: the table is long, and the shape of the list is
  // the thing worth reading before any single row of it.
  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.finding.kind, (tally.get(r.finding.kind) ?? 0) + 1);
  const summary = [...tally].map(([kind, n]) => `- **${kind}** — ${n}`).join('\n');

  writeFileSync(
    join(SHOTS, 'report.md'),
    `# Screen audit — ${new Date().toISOString().slice(0, 10)}\n\n` +
      `${SKINS.length} skins × {fresh, played, veryPlayed} at ${VIEWPORT.width}×${VIEWPORT.height}. ` +
      `Shots in \`${SHOTS}/<skin>/\`.\n\n${summary}\n\n` +
      `| kind | skin | state | screen | where | text | measured | detail |\n` +
      `| --- | --- | --- | --- | --- | --- | --- | --- |\n${lines.join('\n')}\n`,
  );
});
