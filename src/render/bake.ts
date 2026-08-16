import { hex, rgba, type Orientation, type Pattern, type Surface } from '@theme/tokens';
import { corners } from './layout';

/**
 * A described surface, painted onto a plain canvas.
 *
 * A theme says "diagonal hatch, black, 16%, two on five" and this draws exactly
 * that, clipped to one hex. It is the whole procedural art pipeline, and it is
 * about a hundred and fifty lines because the vocabulary is deliberately closed:
 * four pattern kinds, chosen because that is precisely what the three art
 * directions between them ask for.
 *
 * **No Pixi in this file, on purpose.** The board wraps these canvases in
 * textures (`surfaces.ts`) and the style gallery appends them to the DOM
 * directly. Keeping the baking separate from the caching means the gallery does
 * not ship a renderer it never uses — it was pulling in the whole of Pixi to draw
 * eight hexes — and it means the interesting half, what a crypt hatch actually
 * is, can be read without knowing anything about GPUs.
 *
 * When real art lands in a slot none of this runs: `AssetBook` hands over a
 * loaded bitmap and the procedural path is skipped. This is the floor, not the
 * ceiling.
 */

/** Baked above the on-screen size so a hex edge is not soft on a retina phone. */
export const OVERSAMPLE = 2;

/**
 * One hex of `surface`, on a plain canvas, with no Pixi anywhere near it.
 *
 * Exported because the style gallery draws the same surfaces the board does, and
 * a gallery that reimplemented them would be a gallery that lies. `size` is the
 * circumradius in CSS pixels; the canvas comes back oversampled.
 */
export function bakeSurface(
  surface: Surface,
  size: number,
  orientation: Orientation,
): HTMLCanvasElement | null {
  const halfW = orientation === 'pointy' ? (Math.sqrt(3) / 2) * size : size;
  const halfH = orientation === 'pointy' ? size : (Math.sqrt(3) / 2) * size;

  const w = Math.ceil(halfW * 2 * OVERSAMPLE);
  const h = Math.ceil(halfH * 2 * OVERSAMPLE);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  // The inset is applied to the hex we clip to, not to the sprite, so the gutter
  // between cells belongs to the surface rather than to the board. A theme that
  // wants tiles flush with a 2px seam and a theme that wants counters on a table
  // differ by one number here.
  const drawn = size * OVERSAMPLE * (1 - surface.inset);
  ctx.beginPath();
  const pts = corners(w / 2, h / 2, drawn, orientation);
  ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
  ctx.closePath();
  ctx.clip();

  paintFill(ctx, surface, w, h);
  paintPattern(ctx, surface.pattern, w, h);

  return canvas;
}

function paintFill(ctx: CanvasRenderingContext2D, surface: Surface, w: number, h: number): void {
  if (surface.fillTo === null) {
    ctx.fillStyle = hex(surface.fill);
  } else {
    // Top-to-bottom. Every direction handed down describes light coming from
    // above, and a gradient that runs the other way reads as a hole.
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, hex(surface.fill));
    gradient.addColorStop(1, hex(surface.fillTo));
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, w, h);
}

function paintPattern(ctx: CanvasRenderingContext2D, pattern: Pattern, w: number, h: number): void {
  if (pattern.kind === 'none') return;

  const tile = patternTile(pattern);
  if (tile === null) return;

  const fill = ctx.createPattern(tile.canvas, 'repeat');
  if (fill === null) return;

  // Stripes are authored as vertical bars and rotated into place, because a
  // rotated pattern transform is exact at any angle and a hand-drawn diagonal is
  // not. `setTransform` is the only way to rotate a CanvasPattern; where it is
  // missing the pattern simply lands unrotated, which is a texture that reads
  // slightly wrong rather than a board that does not draw.
  const angle = 'angleDeg' in pattern ? pattern.angleDeg : 0;
  if (angle !== 0 && typeof DOMMatrix === 'function' && typeof fill.setTransform === 'function') {
    fill.setTransform(new DOMMatrix().rotate(angle));
  }

  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
}

type PatternTile = { readonly canvas: HTMLCanvasElement };

function patternTile(pattern: Pattern): PatternTile | null {
  switch (pattern.kind) {
    case 'none':
      return null;

    case 'hatch': {
      // Authored in the design document's units and scaled by the same factor as
      // the hex, so a 2-on-5 hatch stays 2-on-5 relative to the tile at any size.
      const bar = Math.max(1, Math.round(pattern.bar * OVERSAMPLE));
      const pitch = Math.max(bar + 1, Math.round((pattern.bar + pattern.gap) * OVERSAMPLE));
      const canvas = tileCanvas(pitch, pitch);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return null;
      ctx.fillStyle = rgba(pattern.ink, pattern.alpha);
      ctx.fillRect(0, 0, bar, pitch);
      return { canvas };
    }

    case 'dots': {
      const pitch = Math.max(2, Math.round(pattern.pitch * OVERSAMPLE));
      const radius = Math.max(0.5, pattern.radius * OVERSAMPLE);
      const canvas = tileCanvas(pitch, pitch);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return null;
      ctx.fillStyle = rgba(pattern.ink, pattern.alpha);
      ctx.beginPath();
      ctx.arc(pitch / 2, pitch / 2, radius, 0, Math.PI * 2);
      ctx.fill();
      return { canvas };
    }

    /**
     * A repeating symbol: the second channel that says which colour this
     * ground belongs to without depending on hue. Drawn as flat silhouettes
     * with no stroke and no detail, because at the size a field is painted
     * only the outline survives — and the outline is the whole information.
     *
     * The grid is offset row by row (the odd row starts half a pitch over),
     * so a field reads as a texture rather than as graph paper.
     */
    case 'glyphs': {
      const pitch = Math.max(4, Math.round(pattern.pitch * OVERSAMPLE));
      const size = Math.max(1, pattern.size * OVERSAMPLE);
      const canvas = tileCanvas(pitch * 2, pitch * 2);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return null;
      ctx.fillStyle = rgba(pattern.ink, pattern.alpha);

      const draw = (cx: number, cy: number): void => {
        ctx.beginPath();
        switch (pattern.shape) {
          case 'circle':
            ctx.arc(cx, cy, size, 0, Math.PI * 2);
            break;
          case 'square':
            ctx.rect(cx - size, cy - size, size * 2, size * 2);
            break;
          case 'triangle':
            ctx.moveTo(cx, cy - size);
            ctx.lineTo(cx + size, cy + size);
            ctx.lineTo(cx - size, cy + size);
            ctx.closePath();
            break;
          case 'diamond':
            ctx.moveTo(cx, cy - size);
            ctx.lineTo(cx + size, cy);
            ctx.lineTo(cx, cy + size);
            ctx.lineTo(cx - size, cy);
            ctx.closePath();
            break;
        }
        ctx.fill();
      };

      draw(pitch / 2, pitch / 2);
      draw(pitch + pitch / 2, pitch / 2);
      draw(0, pitch + pitch / 2);
      draw(pitch, pitch + pitch / 2);
      draw(pitch * 2, pitch + pitch / 2);
      return { canvas };
    }

    case 'bands': {
      const width = Math.max(1, Math.round(pattern.width * OVERSAMPLE));
      const canvas = tileCanvas(width * 2, width * 2);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return null;
      ctx.fillStyle = hex(pattern.a);
      ctx.fillRect(0, 0, width, width * 2);
      ctx.fillStyle = hex(pattern.b);
      ctx.fillRect(width, 0, width, width * 2);
      return { canvas };
    }
  }
}

function tileCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
