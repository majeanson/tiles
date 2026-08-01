import { COLD_SURVEY } from './themes/cold-survey';
import { PLACEHOLDER } from './themes/placeholder';
import { ROT_BLOOM } from './themes/rot-bloom';
import { TORCHLIT } from './themes/torchlit';
import type { Theme, ThemeId } from './tokens';

/**
 * The registry.
 *
 * Adding a direction is one file and one line here. Nothing else in the codebase
 * names a theme — the renderer takes one as an argument, the chrome reads its
 * tokens through CSS variables, and `main.ts` resolves the id at the edge exactly
 * the way it already resolves feature flags and the seed.
 */
export const THEMES: readonly Theme[] = [PLACEHOLDER, COLD_SURVEY, ROT_BLOOM, TORCHLIT];

/**
 * **The placeholder is the default, and that is a rule rather than an oversight.**
 *
 * Gate E is shut: no art direction until gates A–D pass (CLAUDE.md, LOG.md). The
 * three directions below it are loaded, switchable and testable so the decision
 * can be made from real play on a real phone instead of from a document — but
 * shipping one as the default would be deciding it, which is not this session's
 * to decide. Flip this line when the gate opens, not before.
 */
export const DEFAULT_THEME_ID: ThemeId = 'placeholder';

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export const themeIds = (): readonly ThemeId[] => THEMES.map((t) => t.id);

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
