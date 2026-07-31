import { disc, keyOf } from '@engine/hex';
import { decodeFeatures, parseOverrides, withOverrides, type FeatureSet } from '@meta/features';
import { PixiRenderer } from '@render/PixiRenderer';
import type { BoardView } from '@render/Renderer';

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

/** Session 0 has no engine state yet: draw the empty grid a region is cut from. */
function placeholderBoard(): BoardView {
  return {
    cells: disc(4).map((h) => ({ key: keyOf(h), q: h.q, r: h.r, kind: 'empty' as const })),
  };
}

async function main(): Promise<void> {
  const features = resolveFeatures();

  const stamp = document.getElementById('stamp');
  if (stamp !== null) {
    const on = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
    stamp.textContent = `${__BUILD_SHA__.slice(0, 7)}${on.length > 0 ? ` · ${on.join(' ')}` : ''}`;
  }

  const host = document.getElementById('board');
  if (host === null) throw new Error('#board missing from index.html');

  const renderer = new PixiRenderer();
  await renderer.mount(host);
  renderer.draw(placeholderBoard());
}

void main();
