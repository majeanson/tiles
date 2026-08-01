import { Texture } from 'pixi.js';
import type { Orientation, Pattern, Surface } from '@theme/tokens';
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

type CacheKey = string;

export class SurfaceTextures {
  readonly #cache = new Map<CacheKey, Texture>();

  /**
   * A hex of `surface`, sized for a cell of circumradius `size` CSS pixels.
   *
   * `size` is rounded before it reaches the key: a resize that moves the board by
   * a third of a pixel must not throw away every texture on the board.
   */
  get(surface: Surface, size: number, orientation: Orientation): Texture | null {
    if (size <= 0) return null;

    const px = Math.max(4, Math.round(size));
    const key = `${orientation}:${px}:${surfaceKey(surface)}`;

    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;

    const canvas = bakeSurface(surface, px, orientation);
    if (canvas === null) return null;

    const texture = Texture.from(canvas);
    this.#cache.set(key, texture);
    return texture;
  }

  /**
   * Drop textures baked for sizes nobody is drawing at any more.
   *
   * Called after a resize settles. Without it, dragging a desktop window from
   * narrow to wide leaves a texture for every intermediate width on the GPU.
   */
  evictExcept(size: number, orientation: Orientation): void {
    const keep = `${orientation}:${Math.max(4, Math.round(size))}:`;
    for (const [key, texture] of this.#cache) {
      if (key.startsWith(keep)) continue;
      texture.destroy(true);
      this.#cache.delete(key);
    }
  }

  destroy(): void {
    for (const texture of this.#cache.values()) texture.destroy(true);
    this.#cache.clear();
  }
}

/** Everything that changes the pixels, and nothing that does not. */
function surfaceKey(s: Surface): string {
  return [s.fill, s.fillTo ?? 'x', s.inset, s.alpha, patternKey(s.pattern)].join('|');
}

function patternKey(p: Pattern): string {
  switch (p.kind) {
    case 'none':
      return 'n';
    case 'hatch':
      return `h${p.angleDeg},${p.ink},${p.alpha},${p.bar},${p.gap}`;
    case 'dots':
      return `d${p.ink},${p.alpha},${p.radius},${p.pitch}`;
    case 'bands':
      return `b${p.angleDeg},${p.a},${p.b},${p.width}`;
  }
}
