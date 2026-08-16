// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { THEMES } from '@theme/index';
import { surface, type Surface } from '@theme/tokens';
import { bakeSurface } from './bake';
import { surfaceKey, SurfaceTextures } from './surfaces';

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

describe('the colour symbols', () => {
  /**
   * The glyph pattern is a new texture kind, and the cache keys every texture
   * by what changes its pixels. A key that ignored the SHAPE would hand every
   * colour whichever symbol happened to be baked first — four fields that all
   * said the same thing, which is worse than the dots it replaced.
   *
   * happy-dom has no 2D context, so the shapes themselves are a phone
   * question. This pins the part that can silently be wrong everywhere.
   */
  const field = (shape: 'circle' | 'triangle' | 'square' | 'diamond'): Surface =>
    surface(0x101010, {
      pattern: { kind: 'glyphs', shape, ink: 0xffffff, alpha: 0.4, size: 2.1, pitch: 9 },
    });

  it('caches each shape separately, so no two colours share a texture', () => {
    const keys = new Set(
      (['circle', 'triangle', 'square', 'diamond'] as const).map((shape) =>
        surfaceKey(field(shape)),
      ),
    );
    expect(keys.size).toBe(4);
  });

  it('still shares a texture between two fields that really are identical', () => {
    expect(surfaceKey(field('triangle'))).toBe(surfaceKey(field('triangle')));
  });

  it('degrades to the flat fill where there is no canvas, like every pattern', () => {
    expect(bakeSurface(field('square'), 24, 'pointy')).toBeNull();
  });
});
