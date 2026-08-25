import { describe, expect, it } from 'vitest';
import { disc, type Hex } from '@engine/hex';
import type { Orientation } from '@theme/tokens';
import { corners, fitLayout, hexAt, place, zoomLayout, type Layout, zoomCeiling } from './layout';

/**
 * The geometry, both ways up.
 *
 * Orientation became a theme decision this session — every art direction handed
 * down asks for flat-top hexes, the placeholder is pointy-top, and the engine has
 * no opinion because axial coordinates mean the same thing either way. Which
 * makes this file's job bigger than it was: every claim below has to hold for
 * BOTH projections, or switching art direction silently breaks tapping.
 *
 * So the suite is parameterised rather than duplicated. A rule that holds for one
 * orientation and not the other is a bug in exactly one of two functions, and
 * running the same assertions against both is what finds it.
 */

const BOTH: readonly Orientation[] = ['pointy', 'flat'];

/** Bounding box of every drawn hex, corners included. */
function drawnBounds(cells: readonly Hex[], l: Layout) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const { x, y } = place(c, l);
    const pts = corners(x, y, l.size, l.orientation);
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]!);
      maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!);
      maxY = Math.max(maxY, pts[i + 1]!);
    }
  }
  return { minX, maxX, minY, maxY };
}

describe.each(BOTH)('fitLayout (%s-top)', (orientation) => {
  const PORTRAIT = { w: 390, h: 620 }; // phone width, board area under the HUD
  const fit = (cells: readonly Hex[], w: number, h: number, pad = 0): Layout =>
    fitLayout(cells, w, h, pad, orientation);

  it('keeps every drawn corner inside the box — edge tiles must never clip', () => {
    for (const cells of [disc(2), disc(4), disc(6)]) {
      const b = drawnBounds(cells, fit(cells, PORTRAIT.w, PORTRAIT.h, 8));
      expect(b.minX).toBeGreaterThanOrEqual(-0.001);
      expect(b.minY).toBeGreaterThanOrEqual(-0.001);
      expect(b.maxX).toBeLessThanOrEqual(PORTRAIT.w + 0.001);
      expect(b.maxY).toBeLessThanOrEqual(PORTRAIT.h + 0.001);
    }
  });

  it('touches at least one pair of edges — it fits, it does not merely shrink', () => {
    const cells = disc(4);
    const b = drawnBounds(cells, fit(cells, PORTRAIT.w, PORTRAIT.h));
    const fillsWidth = Math.abs(b.maxX - b.minX - PORTRAIT.w) < 0.01;
    const fillsHeight = Math.abs(b.maxY - b.minY - PORTRAIT.h) < 0.01;
    expect(fillsWidth || fillsHeight).toBe(true);
  });

  it('centres the board in the box', () => {
    const cells = disc(3);
    const b = drawnBounds(cells, fit(cells, PORTRAIT.w, PORTRAIT.h, 12));
    expect((b.minX + b.maxX) / 2).toBeCloseTo(PORTRAIT.w / 2, 6);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(PORTRAIT.h / 2, 6);
  });

  it('respects padding on all four sides', () => {
    const cells = disc(4);
    const pad = 20;
    const b = drawnBounds(cells, fit(cells, 400, 800, pad));
    expect(b.minX).toBeGreaterThanOrEqual(pad - 0.001);
    expect(b.minY).toBeGreaterThanOrEqual(pad - 0.001);
    expect(b.maxX).toBeLessThanOrEqual(400 - pad + 0.001);
    expect(b.maxY).toBeLessThanOrEqual(800 - pad + 0.001);
  });

  it('shrinks as the region grows, and grows with the viewport', () => {
    const box = { w: 390, h: 620 };
    const small = fit(disc(2), box.w, box.h, 8).size;
    const large = fit(disc(6), box.w, box.h, 8).size;
    expect(large).toBeLessThan(small);

    const wide = fit(disc(4), box.w * 2, box.h * 2, 8).size;
    expect(wide).toBeGreaterThan(fit(disc(4), box.w, box.h, 8).size);
  });

  /**
   * The cap (2026-08-25). FIT frames only the played structure now, and a
   * three-tile opening board fitted to a phone screen with no ceiling is a hex
   * ninety pixels wide. `maxSize` states the ceiling in the same pixels-a-hex
   * currency as `zoomCeiling`'s `maxHexPx`, and the board must stay CENTRED at
   * the capped size — a cap applied after the origin math would anchor a small
   * board to a corner sized for a bigger one.
   */
  it('caps the fitted hex size, and stays centred at the cap', () => {
    const uncapped = fitLayout(disc(1), PORTRAIT.w, PORTRAIT.h, 8, orientation);
    expect(uncapped.size).toBeGreaterThan(34); // the case the cap exists for

    const capped = fitLayout(disc(1), PORTRAIT.w, PORTRAIT.h, 8, orientation, 34);
    expect(capped.size).toBe(34);
    const b = drawnBounds(disc(1), capped);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(PORTRAIT.w / 2, 6);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(PORTRAIT.h / 2, 6);
  });

  it('leaves a board already smaller than the cap alone', () => {
    const plain = fitLayout(disc(6), PORTRAIT.w, PORTRAIT.h, 8, orientation);
    const capped = fitLayout(disc(6), PORTRAIT.w, PORTRAIT.h, 8, orientation, 34);
    expect(plain.size).toBeLessThan(34);
    expect(capped).toEqual(plain);
  });

  it('handles degenerate inputs without producing NaN', () => {
    const empty = fit([], 390, 620, 8);
    expect(empty.size).toBe(0);
    expect(Number.isFinite(empty.originX)).toBe(true);
    expect(empty.orientation).toBe(orientation);

    const single = fit([{ q: 0, r: 0 }], 390, 620, 8);
    expect(single.size).toBeGreaterThan(0);
    expect(Number.isFinite(single.originX)).toBe(true);

    const squashed = fit(disc(3), 10, 10, 20); // padding exceeds the box
    expect(squashed.size).toBe(0);
    expect(Number.isFinite(squashed.originY)).toBe(true);
  });
});

describe.each(BOTH)('corners (%s-top)', (orientation) => {
  it('returns six points, all one size from the centre', () => {
    const pts = corners(100, 50, 24, orientation);
    expect(pts).toHaveLength(12);
    for (let i = 0; i < 12; i += 2) {
      expect(Math.hypot(pts[i]! - 100, pts[i + 1]! - 50)).toBeCloseTo(24, 10);
    }
  });

  it('tiles flush with its neighbours in every direction', () => {
    // Adjacent hexes share an edge, so every one of the six neighbours sits
    // exactly √3·size away. This is the claim that catches a projection whose
    // rows are right but whose columns are not.
    const l: Layout = { size: 20, originX: 0, originY: 0, orientation };
    const a = place({ q: 0, r: 0 }, l);
    for (const [dq, dr] of [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ] as const) {
      const b = place({ q: dq, r: dr }, l);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(Math.sqrt(3) * 20, 10);
    }
  });
});

describe('corners, oriented', () => {
  it('puts a corner directly above the centre when pointy-top', () => {
    const [x0, y0] = corners(0, 0, 10, 'pointy');
    expect(x0).toBeCloseTo(0, 10);
    expect(y0).toBeCloseTo(-10, 10);
  });

  it('puts a corner directly right of the centre when flat-top', () => {
    const [x0, y0] = corners(0, 0, 10, 'flat');
    expect(x0).toBeCloseTo(10, 10);
    expect(y0).toBeCloseTo(0, 10);
  });

  it('defaults to pointy-top, which is what shipped', () => {
    expect(corners(0, 0, 10)).toEqual(corners(0, 0, 10, 'pointy'));
  });

  /**
   * The art directions specify 46px-wide flat-top hexes 39.84px tall. That is a
   * width of 2·size and a height of √3·size — the transpose of pointy-top — and
   * getting it backwards produces a board that looks almost right and tiles with
   * gaps. Pinned against the document's own numbers.
   */
  it('matches the aspect ratio the art direction specifies', () => {
    const size = 23; // half of the document's 46px width
    const span = (pts: number[], offset: 0 | 1): number => {
      const vals = pts.filter((_, i) => i % 2 === offset);
      return Math.max(...vals) - Math.min(...vals);
    };
    const flat = corners(0, 0, size, 'flat');
    expect(span(flat, 0)).toBeCloseTo(46, 6);
    expect(span(flat, 1)).toBeCloseTo(39.837, 2);
  });
});

/**
 * Placing a tile is the only verb the game has, so a tap that lands one hex off
 * is not a rough edge — it is the game not working. These check the inverse of
 * `place` exactly, including the corners where naive rounding goes wrong.
 */
describe.each(BOTH)('hexAt (%s-top)', (orientation) => {
  const l = fitLayout(disc(4), 390, 600, 10, orientation);

  it('inverts place for every cell on a full board', () => {
    for (const cell of disc(4)) {
      const { x, y } = place(cell, l);
      expect(hexAt(x, y, l)).toEqual(cell);
    }
  });

  // The case axial rounding gets wrong: near a corner, three hexes meet and the
  // nearest centre is not the hex you are standing in.
  it('stays correct near the corners, where axial rounding fails', () => {
    const offset = orientation === 'pointy' ? -90 : 0;
    for (const cell of disc(3)) {
      const { x, y } = place(cell, l);
      // 80% of the way to each corner is inside the hex but past the midpoint
      // of the edge, which is where independent q/r rounding breaks down.
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i + offset);
        const px = x + Math.cos(angle) * l.size * 0.8;
        const py = y + Math.sin(angle) * l.size * 0.8;
        expect(hexAt(px, py, l)).toEqual(cell);
      }
    }
  });

  it('survives a degenerate layout rather than dividing by zero', () => {
    expect(hexAt(10, 10, { size: 0, originX: 0, originY: 0, orientation })).toEqual({
      q: 0,
      r: 0,
    });
  });
});

describe('the camera', () => {
  const base = { size: 20, originX: 160, originY: 240, orientation: 'pointy' } as const;

  it('is the identity at zoom 1', () => {
    expect(zoomLayout(base, 1, 160, 240)).toEqual(base);
  });

  it('keeps the hex under the anchor under the anchor', () => {
    // The whole point of anchoring: leaning closer must not move what you
    // are looking at. True for any anchor, checked at centre and off-centre.
    for (const [ax, ay] of [
      [160, 240],
      [40, 300],
    ] as const) {
      const before = hexAt(ax, ay, base);
      for (const zoom of [1.35, 2, 3.7]) {
        expect(hexAt(ax, ay, zoomLayout(base, zoom, ax, ay))).toEqual(before);
      }
    }
  });

  it('scales cell size linearly', () => {
    expect(zoomLayout(base, 2.5, 0, 0).size).toBeCloseTo(50);
  });
});

describe('the zoom ceiling', () => {
  /**
   * Marc, on a phone (2026-08-15): "there is a point on mobile where the map
   * grows and i cant zoom in to see numbers anymore, there is a max zoom in
   * and its not enough."
   *
   * The cap was a flat 4× FIT, and fit shrinks as the world grows — so the
   * bigger the board, the LESS the camera could lean in. These pin the fix:
   * the ceiling is stated in pixels a hex, so it rises to meet the board.
   */
  const FLOOR = 4;
  const MAX_PX = 34;

  it('leaves a small board exactly as generous as it was', () => {
    // A board fitted at 40px a hex is already comfortable; 4× is the old range.
    expect(zoomCeiling(40, FLOOR, MAX_PX)).toBe(FLOOR);
  });

  it('RISES as the board grows, which is the whole bug', () => {
    const small = zoomCeiling(40, FLOOR, MAX_PX);
    const grown = zoomCeiling(5, FLOOR, MAX_PX);
    expect(grown).toBeGreaterThan(small);
  });

  it('always reaches a hex you can read a number on', () => {
    // The worth numbers are drawn from size 12 up, so every fitted size must
    // be able to zoom past that — which is precisely what 4× failed to do.
    for (const fitSize of [40, 20, 10, 5, 2, 0.5]) {
      const reached = fitSize * zoomCeiling(fitSize, FLOOR, MAX_PX);
      expect(reached).toBeGreaterThanOrEqual(MAX_PX);
    }
  });

  it('reproduces the phone: a late run could not read its own board', () => {
    // Reach 16 plus an 8-hex beacon horizon was ~49 hexes across a 390px
    // screen, which fitted at about 4.6px a hex. (The beacon disc left the
    // fitted extent on 2026-08-25 — FIT frames the structure now — but a
    // deep structure still shrinks fit toward this size, so the number
    // stays a fair regression case even though its arithmetic is history.)
    const late = 4.6;
    expect(late * FLOOR).toBeLessThan(20); // the old cap: numbers unreadable
    expect(late * zoomCeiling(late, FLOOR, MAX_PX)).toBeCloseTo(MAX_PX);
  });

  it('states a floor rather than dividing by zero on an empty board', () => {
    expect(zoomCeiling(0, FLOOR, MAX_PX)).toBe(FLOOR);
    expect(zoomCeiling(-1, FLOOR, MAX_PX)).toBe(FLOOR);
    expect(zoomCeiling(Number.NaN, FLOOR, MAX_PX)).toBe(FLOOR);
  });
});
