import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  disc,
  distance,
  key,
  keyOf,
  neighbourKeys,
  neighbours,
  parse,
  toPixel,
  type Hex,
} from './hex.js';

describe('keys', () => {
  it('round-trips, including negatives and zero', () => {
    for (const h of [
      { q: 0, r: 0 },
      { q: 3, r: -7 },
      { q: -12, r: 4 },
      { q: -1, r: -1 },
    ] satisfies Hex[]) {
      expect(parse(keyOf(h))).toEqual(h);
    }
  });

  it('never collides for distinct coordinates', () => {
    const seen = new Set<string>();
    for (const h of disc(6)) seen.add(keyOf(h));
    expect(seen.size).toBe(disc(6).length);
  });

  it('does not confuse -1,1 with 1,-1', () => {
    expect(key(-1, 1)).not.toBe(key(1, -1));
  });
});

describe('DIRECTIONS', () => {
  // Pinned deliberately: ring-order rules read this as a sequence, so a
  // "harmless" reorder would change the game rather than fail a build.
  it('is east-then-counter-clockwise, in this exact order', () => {
    expect(DIRECTIONS).toEqual([
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ]);
  });

  it('is six distinct unit steps that cancel out', () => {
    expect(new Set(DIRECTIONS.map(([q, r]) => key(q, r))).size).toBe(6);
    for (const [q, r] of DIRECTIONS) {
      expect(distance({ q: 0, r: 0 }, { q, r })).toBe(1);
    }
    const sum = DIRECTIONS.reduce((a, [q, r]) => ({ q: a.q + q, r: a.r + r }), { q: 0, r: 0 });
    expect(sum).toEqual({ q: 0, r: 0 });
  });
});

describe('neighbours', () => {
  it('returns six cells, all exactly one step away', () => {
    const ns = neighbours(4, -2);
    expect(ns).toHaveLength(6);
    for (const n of ns) expect(distance({ q: 4, r: -2 }, n)).toBe(1);
  });

  it('is symmetric — enclosure detection depends on this', () => {
    for (const centre of disc(3)) {
      for (const n of neighbours(centre.q, centre.r)) {
        expect(neighbourKeys(n.q, n.r)).toContain(keyOf(centre));
      }
    }
  });

  it('agrees with neighbourKeys', () => {
    expect(neighbours(2, 3).map(keyOf)).toEqual(neighbourKeys(2, 3));
  });
});

describe('distance', () => {
  it('is zero to itself and symmetric', () => {
    for (const a of disc(4)) {
      expect(distance(a, a)).toBe(0);
      for (const b of disc(4)) expect(distance(a, b)).toBe(distance(b, a));
    }
  });

  it('satisfies the triangle inequality', () => {
    const cells = disc(3);
    for (const a of cells) {
      for (const b of cells) {
        for (const c of cells) {
          expect(distance(a, c)).toBeLessThanOrEqual(distance(a, b) + distance(b, c));
        }
      }
    }
  });

  it('counts steps, not coordinate deltas', () => {
    // (2,-2) is two moves NE, not four.
    expect(distance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
    expect(distance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
  });
});

describe('disc', () => {
  it('has the centred-hexagonal count for each radius', () => {
    const cases = [
      [0, 1],
      [1, 7],
      [2, 19],
      [3, 37],
      [4, 61],
    ] as const;
    for (const [radius, size] of cases) expect(disc(radius)).toHaveLength(size);
  });

  it('contains exactly the cells within the radius', () => {
    for (const h of disc(4)) expect(distance({ q: 0, r: 0 }, h)).toBeLessThanOrEqual(4);
  });
});

describe('toPixel', () => {
  // The single test that catches an orientation mismatch: whatever the
  // convention, all six neighbours must be the same distance from the centre.
  it('places all six neighbours equidistant from the centre', () => {
    const size = 24;
    const centre = toPixel(0, 0, size);
    const lengths = neighbours(0, 0).map((n) => {
      const p = toPixel(n.q, n.r, size);
      return Math.hypot(p.x - centre.x, p.y - centre.y);
    });
    for (const l of lengths) expect(l).toBeCloseTo(size * Math.sqrt(3), 10);
  });

  it('scales linearly with size and puts the origin at 0,0', () => {
    expect(toPixel(0, 0, 30)).toEqual({ x: 0, y: 0 });
    const a = toPixel(3, -1, 10);
    const b = toPixel(3, -1, 20);
    expect(b.x).toBeCloseTo(a.x * 2, 10);
    expect(b.y).toBeCloseTo(a.y * 2, 10);
  });
});
