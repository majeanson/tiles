import { Texture } from 'pixi.js';
import type { AssetId, Depth, Orientation, Pattern, Surface } from '@theme/tokens';
import { bakeSurface } from './bake';

/**
 * Baked surfaces, cached as Pixi textures.
 *
 * `bake.ts` paints one hex onto a canvas; this remembers it. Every cell of a
 * kind then becomes a sprite sharing one texture, so a full board is eight
 * textures and sixty-one sprites rather than sixty-one gradients redrawn every
 * frame.
 *
 * Baking rather than shading is a deliberate trade. It means no shader to write
 * and no shader to port, patterns described in the same units the design document
 * uses, and a cache invalidated by exactly one thing: the hex getting bigger or
 * smaller. It costs a rebake on rotation, which happens once.
 */

/**
 * The bookkeeping half of a texture cache, split from Texture creation the
 * same way baking was split from this file: a Map from key to value, prefix
 * eviction, and a disposal contract. Split because the leak modes live HERE —
 * an eviction that forgets to dispose, a key that never matches its keep
 * prefix — and happy-dom has no 2D canvas, so with the Texture creation
 * inline none of this ever executed under test (the bake returned null and
 * the cache stayed empty forever). With the baker and the disposer injected,
 * the bookkeeping is testable with plain values.
 */
export class BakedCache<T> {
  readonly #cache = new Map<string, T>();
  readonly #dispose: (value: T) => void;

  constructor(dispose: (value: T) => void) {
    this.#dispose = dispose;
  }

  /** The cached value for `key`, baking on a miss. A null bake is not cached. */
  get(key: string, bake: () => T | null): T | null {
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;

    const made = bake();
    if (made === null) return null;
    this.#cache.set(key, made);
    return made;
  }

  get size(): number {
    return this.#cache.size;
  }

  /** Drop and dispose every entry whose key does not start with `keep`. */
  evictExcept(keep: string): void {
    for (const [key, value] of this.#cache) {
      if (key.startsWith(keep)) continue;
      this.#dispose(value);
      this.#cache.delete(key);
    }
  }

  /** Drop and dispose everything. The cache stays usable. */
  clear(): void {
    for (const value of this.#cache.values()) this.#dispose(value);
    this.#cache.clear();
  }
}

/**
 * A native field's ghost, as the cache needs it (2026-08-20): `id` is the
 * asset slot being ghosted, kept apart from `bake.ts`'s own `Ghost` (which
 * only needs the drawable image and the alpha to paint) because the cache
 * key has to tell two colours ghosting the SAME `theme.empty` surface apart,
 * and `id` is the one field of the three that does that.
 */
export type FieldGhost = {
  readonly id: AssetId;
  readonly image: CanvasImageSource;
  readonly alpha: number;
};

/**
 * The ghost half of a cache key, exported for its own guard test — the same
 * discipline Stage 3's `surfaceKey`/`patternKey` set: a field this omitted
 * would hand two different colours' ghosted ground the same cached texture,
 * because `theme.empty` (the `surface` half of the key) is identical for
 * all four.
 */
export function ghostKey(ghost: FieldGhost | null): string {
  return ghost === null ? 'none' : `${ghost.id}:${ghost.alpha}`;
}

export class SurfaceTextures {
  readonly #cache = new BakedCache<Texture>((texture) => {
    texture.destroy(true);
  });

  /**
   * How this direction lights a cell (2026-08-25). Held once rather than passed
   * per `get`: a cache instance belongs to one renderer, a renderer belongs to
   * one theme, and a theme has exactly one answer — so `depth` cannot vary
   * across the keys in this map and has no business being part of them.
   */
  readonly #depth: Depth;

  constructor(depth: Depth) {
    this.#depth = depth;
  }

  /**
   * A hex of `surface`, sized for a cell of circumradius `size` CSS pixels —
   * or, with `ghost` (2026-08-20), that same hex with a native field's
   * terrain PNG ghosted over it, from `theme/tokens.ts`'s `fieldGround`.
   * One cache either way: `ghostKey` extends the key exactly as far as the
   * new input goes, so the two never collide and a plain surface never
   * shares a texture with its own ghosted version.
   *
   * `size` is rounded before it reaches the key: a resize that moves the board by
   * a third of a pixel must not throw away every texture on the board.
   */
  get(
    surface: Surface,
    size: number,
    orientation: Orientation,
    ghost: FieldGhost | null = null,
  ): Texture | null {
    if (size <= 0) return null;

    const px = Math.max(4, Math.round(size));
    const key = `${orientation}:${px}:${surfaceKey(surface)}:${ghostKey(ghost)}`;
    return this.#cache.get(key, () => {
      const canvas = bakeSurface(surface, px, orientation, this.#depth, ghost);
      return canvas === null ? null : Texture.from(canvas);
    });
  }

  /**
   * Drop textures baked for sizes nobody is drawing at any more.
   *
   * Called after a resize settles. Without it, dragging a desktop window from
   * narrow to wide leaves a texture for every intermediate width on the GPU.
   */
  evictExcept(size: number, orientation: Orientation): void {
    this.#cache.evictExcept(`${orientation}:${Math.max(4, Math.round(size))}:`);
  }

  /**
   * Drop every baked texture but stay usable — the WebGL context-loss path
   * (2026-08-19): after a restore, every cached texture is stale GPU state,
   * and the next draw re-bakes on demand exactly like a first frame.
   */
  clear(): void {
    this.#cache.clear();
  }

  destroy(): void {
    this.#cache.clear();
  }
}

/**
 * Everything that changes the pixels, and nothing that does not.
 *
 * Exported for its test: a key that forgets a field would quietly hand two
 * different surfaces the same cached texture, which looks like a rendering
 * bug and is actually a one-character omission here.
 */
export function surfaceKey(s: Surface): string {
  return [
    s.fill,
    s.fillTo ?? 'x',
    s.inset,
    s.alpha,
    patternKey(s.pattern),
    patternKey(s.overlay),
    s.scorch ? 1 : 0,
  ].join('|');
}

function patternKey(p: Pattern): string {
  switch (p.kind) {
    case 'none':
      return 'n';
    case 'hatch':
      return `h${p.angleDeg},${p.ink},${p.alpha},${p.bar},${p.gap}`;
    case 'dots':
      return `d${p.ink},${p.alpha},${p.radius},${p.pitch}`;
    case 'glyphs':
      return `g${p.shape},${p.ink},${p.alpha},${p.size},${p.pitch}`;
    case 'bands':
      return `b${p.angleDeg},${p.a},${p.b},${p.width}`;
  }
}
