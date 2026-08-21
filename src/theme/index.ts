import { PLACEHOLDER } from './themes/placeholder';
import { TORCHLIT } from './themes/torchlit';
import type { Theme, ThemeId } from './tokens';

/**
 * The registry.
 *
 * Adding a direction is one file and one line here. Nothing else in the codebase
 * names a theme — the renderer takes one as an argument, the chrome reads its
 * tokens through CSS variables, and `main.ts` resolves the id at the edge exactly
 * the way it already resolves feature flags and the seed.
 *
 * **Two directions, not four (2026-08-19, `WORKPLAN.md` Stage 1).** `cold-survey`
 * and `rot-bloom` were the two directions Gate E did not choose — carried since
 * 2026-08-15 so the choice could be re-argued by looking rather than by memory,
 * which it was, repeatedly, and the answer never moved. They are deleted, not
 * archived: `git log` is the archive, and a losing direction sitting in the
 * bundle forever is a maintenance tax on a decision that is not coming back.
 * `PLACEHOLDER` stays — it is `resolveTheme`'s own fallback and the greyscale
 * test's control, not a direction competing to be chosen.
 */
export const THEMES: readonly Theme[] = [PLACEHOLDER, TORCHLIT];

/**
 * **Torchlit is the direction, chosen 2026-08-15 when Gate E opened.**
 *
 * For eleven sessions this line read `placeholder`, because Gate E is "no art
 * direction until A–D pass" and shipping one early would have been deciding
 * it. A, C and D are signed; B is structurally fixed and waiting only on a
 * human's logged pops (LOG.md, Session 11). The gate opened; this is the
 * decision it was holding.
 *
 * Torchlit wins on fit rather than taste, and the fit is not a coincidence —
 * the game grew toward it. Its own note says "the map is endless because the
 * darkness is", and the map became endless. Its light-pool was written to do
 * the fog-of-war job, and fog memory now needs exactly that: known ground
 * lit, remembered ground dim, destinations glowing through the dark. Its
 * register is the one the rarity system already speaks in — magic and unique
 * are Diablo's words, and Diablo is what the direction is named after.
 *
 * Reversible in principle, not in a tap any more (2026-08-20, the fresh-eyes
 * review, correcting this paragraph's own claim): the two losing directions
 * were deleted 2026-08-19 — see `THEMES` above — so `?theme=` switches only
 * between torchlit and the placeholder now, and reversing the DECISION would
 * mean resurrecting a direction from git history first. A default is still a
 * decision, not a cage; the cage just has fewer doors than this line used to
 * say.
 */
export const DEFAULT_THEME_ID: ThemeId = 'torchlit';

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

/*  removed 2026-08-21 — unused; callers map THEMES themselves. */

/**
 * Unknown ids fall back rather than throw: a stale bookmark, a typo on a phone
 * keyboard, or a direction deleted since the link was shared should all still
 * load a playable game.
 */
export function resolveTheme(id: string | null | undefined): Theme {
  if (typeof id !== 'string') return themeOrDefault(DEFAULT_THEME_ID);
  return themeOrDefault(id);
}

function themeOrDefault(id: string): Theme {
  const found = BY_ID.get(id);
  if (found !== undefined) return found;
  // The registry is never empty — PLACEHOLDER is a static import — but the type
  // system cannot know that, and a non-null assertion here would be the one place
  // this file lies about what it knows.
  return BY_ID.get(DEFAULT_THEME_ID) ?? PLACEHOLDER;
}

/**
 * `?theme=torchlit`.
 *
 * Same reasoning as `?ff=` and `?seed=`: testing happens on the deployed site
 * from a phone, where the address bar is the only console there is. Switching art
 * direction has to be something you can do standing up, outdoors, without a
 * laptop — that is the whole test the gate is waiting on.
 */
export function parseThemeId(search: string): ThemeId | null {
  const raw = new URLSearchParams(search).get('theme');
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export * from './assets';
export * from './css';
export * from './tokens';
