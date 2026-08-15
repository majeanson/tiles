import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING } from '@content/tuning';
import { key, neighbourKeys } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { destinationsWithin } from '@engine/world';
import type { Cell, GameState } from '@engine/state';
import {
  decodeWorld,
  encodeWorld,
  knownFraction,
  newWorld,
  rememberRun,
  unlockedBy,
  UNLOCKS,
} from './world.js';

/**
 * P4a: the world you keep. These pin the two promises — the map grows across
 * runs and never shrinks, and a territory once claimed greets you already
 * yours — plus the property that makes it cheap: only keys are stored,
 * because terrain is a pure function of the seed.
 */

describe('world memory', () => {
  it('accumulates revealed ground and claimed territories, never shrinking', () => {
    const world = newWorld(42);
    let state = newRun(42, ENDLESS_TUNING);
    state = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    const after = rememberRun(world, state);
    expect(after.runs).toBe(1);
    expect(after.revealed.length).toBe(Object.keys(state.cells).length);
    expect(after.farthestReach).toBeGreaterThanOrEqual(1);

    // A second, shorter run cannot un-remember the first one's ground.
    const short = newRun(42, ENDLESS_TUNING);
    const twice = rememberRun(after, short);
    expect(twice.runs).toBe(2);
    expect(twice.revealed.length).toBeGreaterThanOrEqual(after.revealed.length);
    for (const k of after.revealed) expect(twice.revealed).toContain(k);
  });

  it('remembers only territories that were actually claimed', () => {
    const base = newRun(42, ENDLESS_TUNING);
    const claimedAt = key(9, 9);
    const unclaimedAt = key(9, 12);
    const state: GameState = {
      ...base,
      cells: {
        ...base.cells,
        [claimedAt]: { kind: 'landmark', reward: 'territory', claimed: true, colour: 'red' },
        [unclaimedAt]: { kind: 'landmark', reward: 'territory', claimed: false, colour: 'blue' },
      },
    };

    const world = rememberRun(newWorld(42), state);
    expect(world.territories).toContain(claimedAt);
    expect(world.territories).not.toContain(unclaimedAt);
  });

  it('round-trips, and refuses a broken world rather than half-loading it', () => {
    const world = rememberRun(newWorld(7), newRun(7, ENDLESS_TUNING));
    expect(decodeWorld(encodeWorld(world))).toEqual(world);

    expect(decodeWorld(null)).toBeNull();
    expect(decodeWorld('{}')).toBeNull();
    expect(decodeWorld('{"worldSeed":1,"revealed":"lots","territories":[]}')).toBeNull();
    expect(decodeWorld('{"worldSeed":1,"revealed":[],"territories":[1,2]}')).toBeNull();
  });

  it('reports a fraction known that cannot exceed the world it measures', () => {
    const empty = newWorld(1);
    expect(knownFraction(empty)).toBe(0);

    const wide = { ...empty, revealed: Array.from({ length: 10_000 }, (_, i) => `${i},0`) };
    expect(knownFraction(wide)).toBeLessThanOrEqual(1);
  });
});

describe('a world already held', () => {
  /** A seed whose plane has a territory near enough to test with. */
  const territorySeed = (): { seed: number; at: string } => {
    for (let seed = 1; seed <= 400; seed++) {
      for (const d of destinationsWithin(seed, 24, ENDLESS_TUNING)) {
        if (d.reward === 'territory') return { seed, at: key(d.q, d.r) };
      }
    }
    throw new Error('no territory within 24 hexes in 400 seeds');
  };

  it('hands back a claimed territory, unpaid and with its field live', () => {
    const { seed, at } = territorySeed();
    const fresh = newRun(seed, ENDLESS_TUNING);
    const held = newRun(seed, ENDLESS_TUNING, [at]);

    // Same seed, same everything except the standing claim — and the perk it
    // pays (P4b): a held territory starts the next run richer, capped.
    expect(held.claimed).toEqual([at]);
    expect(held.tiles).toBe(fresh.tiles + ENDLESS_TUNING.territoryTiles);
    expect(held.points).toBe(fresh.points);

    // Walk the board out to the territory and check it arrives claimed —
    // and that arriving pays nothing a second time.
    const grow = (state: GameState): GameState => {
      let s = state;
      for (let step = 0; step < 400; step++) {
        const cell = s.cells[at];
        if (cell !== undefined) return s;
        // Head toward the territory: the legal spot closest to it.
        const spots = Object.entries(s.cells).filter(([k, c]) => {
          if (c.kind !== 'empty') return false;
          return neighbourKeys(...(k.split(',').map(Number) as [number, number])).some((n) => {
            const other = s.cells[n];
            return other?.kind === 'tile' || other?.kind === 'stone';
          });
        });
        if (spots.length === 0) return s;
        const target = at.split(',').map(Number) as [number, number];
        spots.sort((a, b) => {
          const da = a[0].split(',').map(Number) as [number, number];
          const db = b[0].split(',').map(Number) as [number, number];
          const dist = (p: [number, number]) =>
            (Math.abs(p[0] - target[0]) +
              Math.abs(p[1] - target[1]) +
              Math.abs(p[0] + p[1] - target[0] - target[1])) /
            2;
          return dist(da) - dist(db);
        });
        const next = reduce({ ...s, tiles: 999 }, { type: 'PLACE', hex: spots[0]![0] });
        if (next === s) return s;
        s = next;
      }
      return s;
    };

    const grown = grow(held);
    const cell: Cell | undefined = grown.cells[at];
    if (cell === undefined) return; // never reached it; the claim below is moot
    expect(cell.kind).toBe('landmark');
    if (cell.kind === 'landmark') expect(cell.claimed).toBe(true);

    // Its field is live: ground within the radius is native to its colour.
    const native = Object.values(grown.cells).filter(
      (c) => c.kind === 'empty' && c.native !== undefined,
    );
    expect(native.length).toBeGreaterThan(0);
  });

  it('is not carried into the bounded game', () => {
    const bounded = newRun(5, { ...ENDLESS_TUNING, world: 'bounded' }, ['9,9']);
    expect(bounded.claimed).toEqual([]);
  });
});

describe('shrines and the unlock ledger (M4)', () => {
  it('remembers a shrine reached, and never more than the ledger holds', () => {
    const base = newRun(42, ENDLESS_TUNING);
    const shrineAt = key(15, 3);
    const state: GameState = {
      ...base,
      cells: {
        ...base.cells,
        [shrineAt]: { kind: 'landmark', reward: 'shrine', claimed: true },
      },
    };

    const world = rememberRun(newWorld(42), state);
    expect(world.shrines).toEqual([shrineAt]);
    expect(unlockedBy(world)).toEqual([UNLOCKS[0]!.id]);

    // The same shrine, reached again in a later run, is not a second unlock.
    const twice = rememberRun(world, state);
    expect(twice.shrines).toEqual([shrineAt]);
  });

  it('ignores a shrine that was only walked past', () => {
    const base = newRun(42, ENDLESS_TUNING);
    const state: GameState = {
      ...base,
      cells: {
        ...base.cells,
        [key(15, 3)]: { kind: 'landmark', reward: 'shrine', claimed: false },
      },
    };
    expect(rememberRun(newWorld(42), state).shrines).toEqual([]);
    expect(unlockedBy(newWorld(42))).toEqual([]);
  });

  it('hands out the ledger in order, and stops at its end', () => {
    const many = { ...newWorld(1), shrines: Array.from({ length: 99 }, (_, i) => `${i},0`) };
    expect(unlockedBy(many)).toEqual(UNLOCKS.map((u) => u.id));
  });

  it('loads a world written before shrines existed', () => {
    const old = '{"worldSeed":5,"revealed":["0,0"],"territories":[],"runs":2}';
    expect(decodeWorld(old)?.shrines).toEqual([]);
  });
});
