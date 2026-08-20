// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { THEMES } from '@theme/index';
import { surface, type Surface } from '@theme/tokens';
import { bakeSurface } from './bake';
import { BakedCache, ghostKey, surfaceKey, SurfaceTextures } from './surfaces';

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

describe('overlay and scorch (2026-08-19, WORKPLAN Stage 3)', () => {
  /**
   * The same failure mode the glyph-shape test above guards, one layer up:
   * `surface()`'s defaults mean two surfaces that only differ in their
   * SECOND pattern, or in whether they carry a scorch, still look identical
   * to any check that forgets those fields — and would then silently share
   * a baked texture.
   */
  it('keeps a surface apart from itself plus an overlay', () => {
    const plain = surface(0x334455, {
      pattern: { kind: 'dots', ink: 0, alpha: 0.2, radius: 1, pitch: 5 },
    });
    const overlaid: Surface = {
      ...plain,
      overlay: { kind: 'hatch', angleDeg: 25, ink: 0, alpha: 0.1, bar: 1, gap: 9 },
    };
    expect(surfaceKey(plain)).not.toBe(surfaceKey(overlaid));
  });

  it('keeps a scorched surface apart from an identical unscorched one', () => {
    const plain = surface(0x334455);
    const scorched: Surface = { ...plain, scorch: true };
    expect(surfaceKey(plain)).not.toBe(surfaceKey(scorched));
  });
});

describe('the field ghost (2026-08-20, native fields wearing the terrain slot’s own PNG)', () => {
  /**
   * `theme.empty` is the SAME `Surface` for every colour, so `surfaceKey`
   * alone cannot tell two colours' ghosted ground apart — that is exactly
   * the job `ghostKey` exists to do, extending `SurfaceTextures.get`'s key
   * the same way Stage 3 extended it for `overlay` and `scorch` above. A
   * fake image stands in for a loaded one; `ghostKey` never looks past
   * `id`/`alpha`, so its identity does not matter to this file.
   */
  const image = {} as CanvasImageSource;

  it('keeps a plain surface apart from its own ghosted version', () => {
    expect(ghostKey(null)).not.toBe(ghostKey({ id: 'terrain.green', image, alpha: 0.3 }));
  });

  it('keeps two colours ghosting the identical surface apart', () => {
    expect(ghostKey({ id: 'terrain.green', image, alpha: 0.3 })).not.toBe(
      ghostKey({ id: 'terrain.blue', image, alpha: 0.3 }),
    );
  });

  it('keeps the same asset apart at two different ghost alphas — a future retune stays safe', () => {
    expect(ghostKey({ id: 'terrain.green', image, alpha: 0.3 })).not.toBe(
      ghostKey({ id: 'terrain.green', image, alpha: 0.5 }),
    );
  });

  it('still agrees with itself — the kept half of the guard', () => {
    expect(ghostKey({ id: 'terrain.green', image, alpha: 0.3 })).toBe(
      ghostKey({ id: 'terrain.green', image, alpha: 0.3 }),
    );
  });

  it('SurfaceTextures.get accepts a ghost and still degrades to null with no canvas, like every other bake', () => {
    const textures = new SurfaceTextures();
    expect(
      textures.get(surface(0x151310), 23, 'flat', { id: 'terrain.green', image, alpha: 0.3 }),
    ).toBeNull();
    textures.destroy();
  });

  it('bakeSurface with a ghost still returns null with no canvas context, and never throws on a degenerate size', () => {
    expect(bakeSurface(surface(0x151310), 23, 'flat', { image, alpha: 0.3 })).toBeNull();
    expect(() => bakeSurface(surface(0x151310), 0, 'flat', { image, alpha: 0.3 })).not.toThrow();
  });
});
