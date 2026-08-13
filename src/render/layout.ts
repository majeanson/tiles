import type { Hex } from '@engine/hex';
import type { Orientation } from '@theme/tokens';

/**
 * Fitting a board to a viewport.
 *
 * Pure geometry, deliberately kept out of the Pixi code: it is the part most
 * likely to be wrong on a phone, and it is the only part that can be tested
 * without a canvas. Regions are generated at varying sizes and shapes, so the
 * board is scaled to fit rather than drawn at a fixed hex size.
 *
 * **Orientation lives here, not in the engine.** Axial coordinates mean the same
 * thing either way up and `DIRECTIONS` still names the same six neighbours — only
 * the projection to pixels differs. So which way up the hexes sit is a rendering
 * decision a theme can hold, and swapping it cannot change the game. Every art
 * direction handed down so far asks for flat-top; the placeholder is pointy-top
 * because that is what shipped. Both are exact, and both are tested.
 */

export type Layout = {
  /**
   * Hex "size" — centre to corner, i.e. the circumradius.
   * Pointy-top is √3·size wide and 2·size tall; flat-top is the transpose.
   */
  readonly size: number;
  readonly originX: number;
  readonly originY: number;
  readonly orientation: Orientation;
};

const SQRT3 = Math.sqrt(3);

/** Half-extent of a single hex at size 1, as [x, y]. */
const halfExtent = (o: Orientation): readonly [number, number] =>
  o === 'pointy' ? [SQRT3 / 2, 1] : [1, SQRT3 / 2];

/**
 * Axial to pixel, at size 1.
 *
 * The pointy-top case is the same mapping as `engine/hex.ts`'s `toPixel`, which
 * that file keeps for its own tests; it is restated rather than imported so the
 * two orientations sit side by side and can be read against each other.
 */
function project(q: number, r: number, o: Orientation): { x: number; y: number } {
  return o === 'pointy'
    ? { x: SQRT3 * q + (SQRT3 / 2) * r, y: 1.5 * r }
    : { x: 1.5 * q, y: SQRT3 * (r + q / 2) };
}

/** Where a cell's centre lands on screen. */
export const place = (h: Hex, l: Layout): { x: number; y: number } => {
  const p = project(h.q, h.r, l.orientation);
  return { x: p.x * l.size + l.originX, y: p.y * l.size + l.originY };
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

  const q = l.orientation === 'pointy' ? (SQRT3 / 3) * px - py / 3 : (2 / 3) * px;
  const r = l.orientation === 'pointy' ? (2 / 3) * py : -px / 3 + (SQRT3 / 3) * py;
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

/**
 * A layout zoomed by `zoom` about a fixed screen point.
 *
 * Pure camera maths, kept beside the fit it modifies: the anchor is the one
 * point whose hex does not move when the zoom changes, which is what makes a
 * zoom button feel like leaning closer instead of the board jumping. Panning
 * is NOT here — a pan is a plain translation the renderer applies to its
 * containers, because translating never changes what a cell looks like.
 */
export function zoomLayout(l: Layout, zoom: number, anchorX: number, anchorY: number): Layout {
  return {
    size: l.size * zoom,
    originX: anchorX + (l.originX - anchorX) * zoom,
    originY: anchorY + (l.originY - anchorY) * zoom,
    orientation: l.orientation,
  };
}

/**
 * The six corners of a hex, as a flat [x, y, …] list.
 *
 * Pointy-top puts a corner at the top; flat-top puts a corner at the right. Both
 * wind clockwise in screen space, which matters only because Pixi's `poly` is
 * happier with a consistent winding.
 */
export function corners(cx: number, cy: number, size: number, o: Orientation = 'pointy'): number[] {
  const offset = o === 'pointy' ? -90 : 0;
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i + offset);
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
  orientation: Orientation = 'pointy',
): Layout {
  if (cells.length === 0) {
    return { size: 0, originX: width / 2, originY: height / 2, orientation };
  }

  // Measure at size 1, then scale — the mapping is linear in size.
  const [halfW, halfH] = halfExtent(orientation);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const p = project(c.q, c.r, orientation);
    if (p.x - halfW < minX) minX = p.x - halfW;
    if (p.x + halfW > maxX) maxX = p.x + halfW;
    if (p.y - halfH < minY) minY = p.y - halfH;
    if (p.y + halfH > maxY) maxY = p.y + halfH;
  }

  const availW = Math.max(0, width - padding * 2);
  const availH = Math.max(0, height - padding * 2);
  const size = Math.min(availW / (maxX - minX), availH / (maxY - minY));

  // Centre the scaled extent in the box.
  return {
    size,
    originX: padding + availW / 2 - ((minX + maxX) / 2) * size,
    originY: padding + availH / 2 - ((minY + maxY) / 2) * size,
    orientation,
  };
}
