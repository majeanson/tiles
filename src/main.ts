import { decodeFeatures, parseOverrides, withOverrides, type FeatureSet } from '@meta/features';
import { PixiRenderer } from '@render/PixiRenderer';
import { Game, type Elements } from '@ui/game';

const FEATURE_STORAGE_KEY = 'tiles.features.v1';

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

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

async function main(): Promise<void> {
  const features = resolveFeatures();
  const seed = resolveSeed();

  const stamp = document.getElementById('stamp');
  if (stamp !== null) {
    const on = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
    stamp.textContent = [`${__BUILD_SHA__.slice(0, 7)}`, `seed ${seed}`, ...on].join(' · ');
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

  const renderer = new PixiRenderer();
  await renderer.mount(elements.board);

  new Game(renderer, elements, seed).start();
}

void main();
