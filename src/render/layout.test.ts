import { describe, expect, it } from 'vitest';
import { disc, type Hex } from '@engine/hex';
import { corners, fitLayout, place } from './layout';

/** Bounding box of every drawn hex, corners included. */
function drawnBounds(cells: readonly Hex[], l: ReturnType<typeof fitLayout>) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const { x, y } = place(c, l);
    const pts = corners(x, y, l.size);
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]!);
      maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!);
      maxY = Math.max(maxY, pts[i + 1]!);
    }
  }
  return { minX, maxX, minY, maxY };
}

describe('fitLayout', () => {
  const PORTRAIT = { w: 390, h: 620 }; // phone width, board area under the HUD

  it('keeps every drawn corner inside the box — edge tiles must never clip', () => {
    for (const cells of [disc(2), disc(4), disc(6)]) {
      const l = fitLayout(cells, PORTRAIT.w, PORTRAIT.h, 8);
      const b = drawnBounds(cells, l);
      expect(b.minX).toBeGreaterThanOrEqual(-0.001);
      expect(b.minY).toBeGreaterThanOrEqual(-0.001);
      expect(b.maxX).toBeLessThanOrEqual(PORTRAIT.w + 0.001);
      expect(b.maxY).toBeLessThanOrEqual(PORTRAIT.h + 0.001);
    }
  });

  it('touches at least one pair of edges — it fits, it does not merely shrink', () => {
    const cells = disc(4);
    const l = fitLayout(cells, PORTRAIT.w, PORTRAIT.h, 0);
    const b = drawnBounds(cells, l);
    const fillsWidth = Math.abs(b.maxX - b.minX - PORTRAIT.w) < 0.01;
    const fillsHeight = Math.abs(b.maxY - b.minY - PORTRAIT.h) < 0.01;
    expect(fillsWidth || fillsHeight).toBe(true);
  });

  it('centres the board in the box', () => {
    const cells = disc(3);
    const l = fitLayout(cells, PORTRAIT.w, PORTRAIT.h, 12);
    const b = drawnBounds(cells, l);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(PORTRAIT.w / 2, 6);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(PORTRAIT.h / 2, 6);
  });

  it('respects padding on all four sides', () => {
    const cells = disc(4);
    const pad = 20;
    const b = drawnBounds(cells, fitLayout(cells, 400, 800, pad));
    expect(b.minX).toBeGreaterThanOrEqual(pad - 0.001);
    expect(b.minY).toBeGreaterThanOrEqual(pad - 0.001);
    expect(b.maxX).toBeLessThanOrEqual(400 - pad + 0.001);
    expect(b.maxY).toBeLessThanOrEqual(800 - pad + 0.001);
  });

  it('shrinks as the region grows, and grows with the viewport', () => {
    const box = { w: 390, h: 620 };
    const small = fitLayout(disc(2), box.w, box.h, 8).size;
    const large = fitLayout(disc(6), box.w, box.h, 8).size;
    expect(large).toBeLessThan(small);

    const wide = fitLayout(disc(4), box.w * 2, box.h * 2, 8).size;
    expect(wide).toBeGreaterThan(fitLayout(disc(4), box.w, box.h, 8).size);
  });

  it('handles degenerate inputs without producing NaN', () => {
    const empty = fitLayout([], 390, 620, 8);
    expect(empty.size).toBe(0);
    expect(Number.isFinite(empty.originX)).toBe(true);

    const single = fitLayout([{ q: 0, r: 0 }], 390, 620, 8);
    expect(single.size).toBeGreaterThan(0);
    expect(Number.isFinite(single.originX)).toBe(true);

    const squashed = fitLayout(disc(3), 10, 10, 20); // padding exceeds the box
    expect(squashed.size).toBe(0);
    expect(Number.isFinite(squashed.originY)).toBe(true);
  });
});

describe('corners', () => {
  it('returns six points, all one size from the centre', () => {
    const pts = corners(100, 50, 24);
    expect(pts).toHaveLength(12);
    for (let i = 0; i < 12; i += 2) {
      expect(Math.hypot(pts[i]! - 100, pts[i + 1]! - 50)).toBeCloseTo(24, 10);
    }
  });

  it('is pointy-top — the first corner sits directly above the centre', () => {
    const [x0, y0] = corners(0, 0, 10);
    expect(x0).toBeCloseTo(0, 10);
    expect(y0).toBeCloseTo(-10, 10);
  });

  it('tiles flush with its neighbours', () => {
    // Two adjacent hexes must share an edge: their centres are √3·size apart.
    const l = { size: 20, originX: 0, originY: 0 };
    const a = place({ q: 0, r: 0 }, l);
    const b = place({ q: 1, r: 0 }, l);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(Math.sqrt(3) * 20, 10);
  });
});
