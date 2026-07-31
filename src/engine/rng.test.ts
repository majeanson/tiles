import { describe, expect, it } from 'vitest';
import {
  rngChance,
  rngInt,
  rngNext,
  rngPick,
  rngWeighted,
  stream,
  streamsFrom,
  type RngStream,
} from './rng.js';

/** Pull n values, threading the stream the way engine code must. */
function take(s: RngStream, n: number): number[] {
  const out: number[] = [];
  let cur = s;
  for (let i = 0; i < n; i++) {
    const [v, next] = rngNext(cur);
    out.push(v);
    cur = next;
  }
  return out;
}

describe('determinism', () => {
  it('gives the same sequence for the same seed, every time', () => {
    expect(take(stream(12345), 50)).toEqual(take(stream(12345), 50));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(stream(1), 20)).not.toEqual(take(stream(2), 20));
  });

  it('never mutates the stream it is given', () => {
    const s = stream(99);
    const before = { ...s };
    rngNext(s);
    rngInt(s, 10);
    rngPick(s, ['a', 'b', 'c']);
    rngWeighted(s, [
      ['x', 1],
      ['y', 1],
    ]);
    expect(s).toEqual(before);
  });

  it('advances the cursor by exactly one per draw', () => {
    const [, a] = rngNext(stream(7));
    expect(a.cursor).toBe(1);
    const [, b] = rngNext(a);
    expect(b.cursor).toBe(2);
    expect(b.seed).toBe(a.seed);
  });

  it('is addressable — the same cursor always yields the same value', () => {
    const seq = take(stream(4242), 10);
    for (let i = 0; i < 10; i++) {
      const [v] = rngNext({ seed: stream(4242).seed, cursor: i });
      expect(v).toBe(seq[i]);
    }
  });

  it('survives a JSON round trip, which is the whole point', () => {
    let s = stream(2026);
    for (let i = 0; i < 5; i++) [, s] = rngNext(s);
    const revived = JSON.parse(JSON.stringify(s)) as RngStream;
    expect(take(revived, 10)).toEqual(take(s, 10));
  });
});

describe('distribution', () => {
  it('stays inside [0, 1)', () => {
    for (const v of take(stream(31337), 5000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('fills all ten deciles roughly evenly', () => {
    const buckets = new Array<number>(10).fill(0);
    for (const v of take(stream(8675309), 20_000)) buckets[Math.floor(v * 10)]!++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(1600); // expected 2000, ±20%
      expect(count).toBeLessThan(2400);
    }
  });
});

describe('rngInt', () => {
  it('stays in [0, n) and reaches both ends', () => {
    let s = stream(555);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const [v, next] = rngInt(s, 6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
      s = next;
    }
    expect(seen.size).toBe(6);
  });
});

describe('rngPick', () => {
  it('only ever returns members of the array', () => {
    const xs = ['woodland', 'meadow', 'hamlet', 'water'];
    let s = stream(11);
    for (let i = 0; i < 500; i++) {
      const [v, next] = rngPick(s, xs);
      expect(xs).toContain(v);
      s = next;
    }
  });

  it('throws rather than returning undefined on an empty array', () => {
    expect(() => rngPick(stream(1), [])).toThrow();
  });
});

describe('rngChance', () => {
  it('fires at roughly the requested rate', () => {
    let s = stream(24);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) {
      const [hit, next] = rngChance(s, 0.25);
      if (hit) hits++;
      s = next;
    }
    expect(hits).toBeGreaterThan(2300);
    expect(hits).toBeLessThan(2700);
  });

  it('is total at p=1 and never at p=0', () => {
    let s = stream(3);
    for (let i = 0; i < 200; i++) {
      const [always, a] = rngChance(s, 1);
      const [never, b] = rngChance(a, 0);
      expect(always).toBe(true);
      expect(never).toBe(false);
      s = b;
    }
  });
});

describe('rngWeighted', () => {
  const table = [
    ['common', 55],
    ['magic', 30],
    ['rare', 12],
    ['unique', 3],
  ] as const;

  it('respects the weights', () => {
    const counts = new Map<string, number>();
    let s = stream(777);
    for (let i = 0; i < 20_000; i++) {
      const [v, next] = rngWeighted(s, table);
      counts.set(v, (counts.get(v) ?? 0) + 1);
      s = next;
    }
    expect(counts.get('common')! / 20_000).toBeCloseTo(0.55, 1);
    expect(counts.get('magic')! / 20_000).toBeCloseTo(0.3, 1);
    expect(counts.get('rare')! / 20_000).toBeCloseTo(0.12, 1);
    expect(counts.get('unique')! / 20_000).toBeCloseTo(0.03, 1);
  });

  it('never picks a zero-weight entry', () => {
    let s = stream(4);
    for (let i = 0; i < 2000; i++) {
      const [v, next] = rngWeighted(s, [
        ['yes', 1],
        ['never', 0],
      ]);
      expect(v).toBe('yes');
      s = next;
    }
  });

  it('rejects impossible tables instead of guessing', () => {
    expect(() =>
      rngWeighted(stream(1), [
        ['a', 0],
        ['b', 0],
      ]),
    ).toThrow();
    expect(() => rngWeighted(stream(1), [['a', -1]])).toThrow();
    expect(() => rngWeighted(stream(1), [])).toThrow();
  });
});

describe('streamsFrom', () => {
  it('is reproducible from the root seed', () => {
    expect(streamsFrom(1234)).toEqual(streamsFrom(1234));
  });

  it('gives each concern a different sequence, so one cannot perturb another', () => {
    const s = streamsFrom(2026);
    const region = take(s.region, 20);
    const tiles = take(s.tiles, 20);
    const loot = take(s.loot, 20);
    expect(region).not.toEqual(tiles);
    expect(tiles).not.toEqual(loot);
    expect(region).not.toEqual(loot);
  });

  it('starts every stream at cursor zero', () => {
    for (const s of Object.values(streamsFrom(5))) expect(s.cursor).toBe(0);
  });
});
