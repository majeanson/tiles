import { toPixel, type Hex } from '@engine/hex';

/**
 * Fitting a board to a viewport.
 *
 * Pure geometry, deliberately kept out of the Pixi code: it is the part most
 * likely to be wrong on a phone, and it is the only part that can be tested
 * without a canvas. Regions are generated at varying sizes and shapes, so the
 * board is scaled to fit rather than drawn at a fixed hex size.
 */

export type Layout = {
  /** Hex "size" — centre to corner. Pointy-top width is √3·size, height 2·size. */
  readonly size: number;
  readonly originX: number;
  readonly originY: number;
};

/** Where a cell's centre lands on screen. */
export const place = (h: Hex, l: Layout): { x: number; y: number } => {
  const p = toPixel(h.q, h.r, l.size);
  return { x: p.x + l.originX, y: p.y + l.originY };
};

/**
 * Which hex contains a screen point — the inverse of `place`.
 *
 * Rounding in CUBE space rather than axial is the part that is easy to get
 * wrong: rounding q and r independently picks the wrong hex in the triangular
 * slivers near each corner, which on a phone reads as taps landing on the tile
 * next to the one you touched. Rounding all three cube coordinates and
 * repairing whichever moved furthest is exact everywhere.
 */
export function hexAt(x: number, y: number, l: Layout): Hex {
  if (l.size <= 0) return { q: 0, r: 0 };

  const px = (x - l.originX) / l.size;
  const py = (y - l.originY) / l.size;

  const q = (Math.sqrt(3) / 3) * px - py / 3;
  const r = (2 / 3) * py;
  const s = -q - r;

  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;

  // `Math.round(-0.2)` is -0, and -0 is not 0 to anything that compares by
  // Object.is. Harmless in a hex key, which stringifies both to "0", and not
  // harmless at all in a Set or a === against a coordinate computed the other
  // way — so it is normalised once, here, rather than guarded against later.
  return { q: rq === 0 ? 0 : rq, r: rr === 0 ? 0 : rr };
}

/** The six corners of a pointy-top hex, clockwise from the top. */
export function corners(cx: number, cy: number, size: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
  }
  return pts;
}

/**
 * Scale and centre `cells` inside a `width × height` box.
 *
 * `padding` is in pixels and applied on every side. The board is fitted by its
 * full extent — cell centres plus the half-hex that sticks out past the outermost
 * ones — so edge tiles are never clipped, which is exactly the bug you get from
 * fitting centres alone and only notice on a narrow phone.
 */
export function fitLayout(
  cells: readonly Hex[],
  width: number,
  height: number,
  padding = 0,
): Layout {
  if (cells.length === 0) return { size: 0, originX: width / 2, originY: height / 2 };

  // Measure at size 1, then scale — the mapping is linear in size.
  const HALF_W = Math.sqrt(3) / 2;
  const HALF_H = 1;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const p = toPixel(c.q, c.r, 1);
    if (p.x - HALF_W < minX) minX = p.x - HALF_W;
    if (p.x + HALF_W > maxX) maxX = p.x + HALF_W;
    if (p.y - HALF_H < minY) minY = p.y - HALF_H;
    if (p.y + HALF_H > maxY) maxY = p.y + HALF_H;
  }

  const availW = Math.max(0, width - padding * 2);
  const availH = Math.max(0, height - padding * 2);
  const size = Math.min(availW / (maxX - minX), availH / (maxY - minY));

  // Centre the scaled extent in the box.
  return {
    size,
    originX: padding + availW / 2 - ((minX + maxX) / 2) * size,
    originY: padding + availH / 2 - ((minY + maxY) / 2) * size,
  };
}
