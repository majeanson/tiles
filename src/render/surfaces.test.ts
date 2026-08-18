// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { THEMES } from '@theme/index';
import { surface, type Surface } from '@theme/tokens';
import { bakeSurface } from './bake';
import { BakedCache, surfaceKey, SurfaceTextures } from './surfaces';

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

describe('the cache bookkeeping, with a fake baker', () => {
  /**
   * The half of the texture cache that could silently leak, finally under
   * test. happy-dom has no 2D canvas, so with the Texture creation inline
   * every earlier test only ever exercised the null path — the bake failed,
   * the cache stayed empty, and the eviction had nothing to evict. With the
   * baker and the disposer injected, hits, misses and eviction are checkable
   * with plain objects.
   */
  const build = (): {
    cache: BakedCache<{ id: string }>;
    disposed: string[];
    bake: (id: string) => () => { id: string };
    bakes: number[];
  } => {
    const disposed: string[] = [];
    const bakes = [0];
    const cache = new BakedCache<{ id: string }>((v) => disposed.push(v.id));
    const bake = (id: string) => (): { id: string } => {
      bakes[0]!++;
      return { id };
    };
    return { cache, disposed, bake, bakes };
  };

  it('bakes once per key and hands the same value back after', () => {
    const { cache, bake, bakes } = build();
    const first = cache.get('12:a', bake('a'));
    const again = cache.get('12:a', bake('a'));
    expect(again).toBe(first);
    expect(bakes[0]).toBe(1);
    expect(cache.size).toBe(1);
  });

  it('keeps different keys apart — no two surfaces may share by accident', () => {
    const { cache, bake } = build();
    const a = cache.get('12:a', bake('a'));
    const b = cache.get('12:b', bake('b'));
    expect(a).not.toBe(b);
    expect(cache.size).toBe(2);
  });

  it('does not cache a failed bake, and asks again next time', () => {
    const { cache, bakes } = build();
    const failing = (): null => {
      bakes[0]!++;
      return null;
    };
    expect(cache.get('12:a', failing)).toBeNull();
    expect(cache.get('12:a', failing)).toBeNull();
    expect(bakes[0]).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('evicts everything outside the keep prefix, disposing as it goes', () => {
    const { cache, disposed, bake } = build();
    cache.get('12:a', bake('a'));
    cache.get('12:b', bake('b'));
    cache.get('34:a', bake('stale-a'));
    cache.get('34:b', bake('stale-b'));

    cache.evictExcept('12:');
    expect(cache.size).toBe(2);
    expect(disposed.sort()).toEqual(['stale-a', 'stale-b']);

    // The kept entries are still hits, not rebakes.
    const { bakes } = build();
    expect(cache.get('12:a', bake('a'))).toEqual({ id: 'a' });
    expect(bakes[0]).toBe(0);
  });

  it('clears whole, disposes everything, and stays usable', () => {
    const { cache, disposed, bake } = build();
    cache.get('12:a', bake('a'));
    cache.get('34:b', bake('b'));
    cache.clear();
    expect(cache.size).toBe(0);
    expect(disposed.sort()).toEqual(['a', 'b']);

    expect(cache.get('12:a', bake('a2'))).toEqual({ id: 'a2' });
    expect(cache.size).toBe(1);
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
