import {
  decodeFeatures,
  isEnabled,
  parseOverrides,
  withOverrides,
  type FeatureSet,
} from '@meta/features';
import { AssetBook } from '@render/assets';
import { PixiRenderer } from '@render/PixiRenderer';
import { applyTheme } from '@theme/apply';
import { DEFAULT_THEME_ID, parseThemeId, resolveTheme, THEMES } from '@theme/index';
import type { Theme } from '@theme/tokens';
import { Game, type Elements } from '@ui/game';

const FEATURE_STORAGE_KEY = 'tiles.features.v1';
const THEME_STORAGE_KEY = 'tiles.theme.v1';

/**
 * Flags are resolved once, here at the edge, and passed downward as data. The
 * URL override wins over storage so a system can be flipped from the address
 * bar on a phone — which is the only debugging surface that exists when testing
 * against the deployed site.
 */
function resolveFeatures(): FeatureSet {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(FEATURE_STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. Defaults are a fine game.
  }
  return withOverrides(decodeFeatures(stored), parseOverrides(location.search));
}

/**
 * `?theme=torchlit` beats what you picked last time, which beats the default.
 *
 * Same shape as the feature flags and for the same reason: the art direction is
 * not settled, the test environment is a phone against production, and the
 * address bar is the console. A link to a specific direction is a thing you can
 * send someone.
 */
function resolveThemeId(): string {
  const asked = parseThemeId(location.search);
  if (asked !== null) return asked;

  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function rememberTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Nothing to do and nothing worth telling the player about.
  }
}

/**
 * `?seed=123` replays an exact run.
 *
 * The engine is deterministic precisely so that "it did something odd on my
 * phone" can become "run this seed", and that is worth nothing unless the seed
 * can be set from the address bar and read back off the screen.
 */
function resolveSeed(): number {
  const asked = new URLSearchParams(location.search).get('seed');
  if (asked !== null) {
    const parsed = Number(asked);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return Date.now() & 0x7fffffff;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

/**
 * The picker: one button per direction, reloading into it.
 *
 * A reload rather than a live swap, deliberately. Switching theme changes the
 * hex orientation, every baked texture, the webfont and the browser chrome
 * colour; a reload gets all of that right for free and costs a quarter of a
 * second, whereas a live swap is a pile of invalidation code guarding a
 * decision that will be made once and then deleted.
 */
function mountThemePicker(host: HTMLElement, current: Theme): void {
  host.hidden = false;
  host.replaceChildren(
    ...THEMES.map((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.textContent = theme.name;
      button.title = theme.note;
      button.setAttribute('aria-pressed', String(theme.id === current.id));
      button.addEventListener('click', () => {
        rememberTheme(theme.id);
        const url = new URL(location.href);
        url.searchParams.set('theme', theme.id);
        location.href = url.toString();
      });
      return button;
    }),
  );
}

async function main(): Promise<void> {
  const features = resolveFeatures();
  const seed = resolveSeed();
  const theme = resolveTheme(resolveThemeId());

  // Before anything is drawn: the chrome takes its colours from the same theme
  // the board will, so there is never a frame of placeholder around themed art.
  applyTheme(theme, document.documentElement);

  const stamp = document.getElementById('stamp');
  if (stamp !== null) {
    const on = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
    stamp.textContent = [`${__BUILD_SHA__.slice(0, 7)}`, `seed ${seed}`, theme.id, ...on].join(
      ' · ',
    );
  }

  const elements: Elements = {
    board: required('board'),
    stats: required('stats'),
    draft: required('draft'),
    harvestTiles: required<HTMLButtonElement>('harvest-tiles'),
    harvestPoints: required<HTMLButtonElement>('harvest-points'),
    leave: required<HTMLButtonElement>('leave'),
    end: required('end'),
  };

  if (isEnabled(features, 'ui.themePicker')) {
    mountThemePicker(required('themes'), theme);
  }

  const renderer = new PixiRenderer(theme, AssetBook.empty(), prefersReducedMotion());
  await renderer.mount(elements.board);

  new Game(renderer, elements, seed, theme).start();

  // Art loads AFTER the first playable frame, never before it. Every slot is
  // empty today and the procedural surfaces are a complete board; a bitmap that
  // arrives late simply replaces one, and a bitmap that never arrives costs
  // nothing. The game must never wait on a picture.
  void AssetBook.load(theme.id).then((assets) => {
    if (assets.size > 0) renderer.useAssets(assets);
  });
}

void main();
