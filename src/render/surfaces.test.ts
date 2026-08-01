// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { THEMES } from '@theme/index';
import { surface } from '@theme/tokens';
import { bakeSurface } from './bake';
import { SurfaceTextures } from './surfaces';

/**
 * The baker, where it fails.
 *
 * happy-dom has no 2D canvas context, so nothing here can check that a hatch
 * looks like a hatch — that is a phone, in portrait, against the deployed site,
 * the same as every other visual claim this project makes. What it CAN pin is
 * the degradation path, which is the part that turns a missing capability into a
 * white screen if it is wrong.
 *
 * `getContext('2d')` returning null is not a synthetic case. A browser with
 * canvas disabled, a lost GPU context, and a headless test runner all give the
 * same answer, and the first frame of a run is the worst possible moment to
 * throw.
 */

describe('bakeSurface, with no canvas context available', () => {
  it('returns null rather than throwing, for every theme', () => {
    for (const theme of THEMES) {
      expect(bakeSurface(theme.terrain.green, 23, theme.orientation)).toBeNull();
      expect(bakeSurface(theme.wall, 23, theme.orientation)).toBeNull();
      expect(bakeSurface(theme.ghost, 23, theme.orientation)).toBeNull();
    }
  });

  it('survives a degenerate size', () => {
    expect(() => bakeSurface(surface(0x112233), 0, 'flat')).not.toThrow();
    expect(() => bakeSurface(surface(0x112233), -5, 'pointy')).not.toThrow();
  });
});

describe('SurfaceTextures', () => {
  it('refuses a non-positive size without touching the cache', () => {
    const textures = new SurfaceTextures();
    expect(textures.get(surface(0x112233), 0, 'flat')).toBeNull();
    expect(textures.get(surface(0x112233), -1, 'flat')).toBeNull();
    textures.destroy();
  });

  it('reports null all the way up when baking cannot happen', () => {
    // The renderer's contract: a null texture means "draw no sprite for this
    // cell", not "crash". Everything else on the board still draws.
    const textures = new SurfaceTextures();
    expect(textures.get(surface(0x445566), 23, 'pointy')).toBeNull();
    textures.destroy();
  });

  it('evicts and destroys without a live cache', () => {
    const textures = new SurfaceTextures();
    expect(() => {
      textures.evictExcept(23, 'flat');
      textures.destroy();
    }).not.toThrow();
  });
});
