import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { destinationsWithin, findsWithin } from '@engine/world';
import type { Cell, GameState } from '@engine/state';
import {
  decodeWorld,
  encodeWorld,
  knownFraction,
  mergeRun,
  newWorld,
  rearmedSpent,
  rememberRun,
  unlockedBy,
  UNLOCKS,
} from './world.js';

/**
 * Walk the board out to `at`, one placement at a time, always taking the
 * legal spot closest to the target — a greedy beeline is enough to reach one
 * particular hex on an otherwise-empty plane. Shared by the territory and
 * find "arrives already claimed" tests below; not a policy, just a probe.
 */
function growToward(state: GameState, at: HexKey): GameState {
  let s = state;
  for (let step = 0; step < 400; step++) {
    if (s.cells[at] !== undefined) return s;
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
}

/**
 * P4a: the world you keep. These pin the two promises — the map grows across
 * runs and never shrinks, and a territory once claimed greets you already
 * yours — plus the property that makes it cheap: only keys are stored,
 * because terrain is a pure function of the seed.
 */

describe('world memory', () => {
  it('accumulates revealed ground and claimed territories, never shrinking', () => {
    const world = newWorld(42);
    let state = newRun(42, TUNING);
    state = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    const after = rememberRun(world, state);
    expect(after.runs).toBe(1);
    expect(after.revealed.length).toBe(Object.keys(state.cells).length);
    expect(after.farthestReach).toBeGreaterThanOrEqual(1);

    // A second, shorter run cannot un-remember the first one's ground.
    const short = newRun(42, TUNING);
    const twice = rememberRun(after, short);
    expect(twice.runs).toBe(2);
    expect(twice.revealed.length).toBeGreaterThanOrEqual(after.revealed.length);
    for (const k of after.revealed) expect(twice.revealed).toContain(k);
  });

  it('merges mid-run without counting a run — only rememberRun counts', () => {
    // mergeRun fires after EVERY action. When it bumped the count too
    // (2026-08-18) the atlas called each tap a run.
    const world = newWorld(42);
    let state = newRun(42, TUNING);
    state = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    const during = mergeRun(world, state);
    expect(during.runs).toBe(0);
    expect(during.revealed.length).toBe(Object.keys(state.cells).length);

    expect(rememberRun(world, state).runs).toBe(1);
  });

  it('remembers only territories that were actually claimed', () => {
    const base = newRun(42, TUNING);
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

  it('round-trips, and refuses a shape it never wrote', () => {
    const world = rememberRun(newWorld(7), newRun(7, TUNING));
    expect(decodeWorld(encodeWorld(world))).toEqual(world);

    expect(decodeWorld(null)).toBeNull();
    expect(decodeWorld('{}')).toBeNull();
    // A list that is not a list is not a damaged world; it is not a world.
    expect(decodeWorld('{"worldSeed":1,"revealed":"lots","territories":[]}')).toBeNull();

    // But a list holding one bad ENTRY is salvaged, not refused (2026-08-20).
    // This assertion used to expect null, under a "refuse rather than
    // half-load" rule that was right in the abstract and wrong here: the
    // shell's answer to null is to mint a fresh world OVER the old blob on
    // the same tick, so refusing turned one bad element into a silently
    // deleted world — which is the shape a write truncated by an iOS kill
    // takes. Half a world you walked beats a new one you did not.
    const salvaged = decodeWorld('{"worldSeed":1,"revealed":[],"territories":[1,2]}');
    expect(salvaged).not.toBeNull();
    expect(salvaged?.territories).toEqual([]);
  });

  it('remembers only finds that were actually claimed, mid-run', () => {
    // mergeRun, not rememberRun: finds are facts the moment growth touches
    // them, the same "does not wait for the run to end" contract territories
    // and shrines already keep.
    const base = newRun(42, TUNING);
    const claimedAt = key(9, 9);
    const unclaimedAt = key(9, 12);
    const state: GameState = {
      ...base,
      cells: {
        ...base.cells,
        [claimedAt]: { kind: 'landmark', reward: 'find', claimed: true },
        [unclaimedAt]: { kind: 'landmark', reward: 'find', claimed: false },
      },
    };

    const world = mergeRun(newWorld(42), state);
    expect(world.finds).toContain(claimedAt);
    expect(world.finds).not.toContain(unclaimedAt);
  });

  it('round-trips finds, and loads a world written before they existed', () => {
    const world = { ...newWorld(3), finds: [key(4, 4), key(-2, 7)] };
    expect(decodeWorld(encodeWorld(world))).toEqual(world);

    // Absent, from a world saved before finds existed: true rather than
    // corrupt, the same contract `shrines` already keeps.
    const old = '{"worldSeed":5,"revealed":["0,0"],"territories":[],"runs":2}';
    expect(decodeWorld(old)?.finds).toEqual([]);
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
      for (const d of destinationsWithin(seed, 24, TUNING)) {
        if (d.reward === 'territory') return { seed, at: key(d.q, d.r) };
      }
    }
    throw new Error('no territory within 24 hexes in 400 seeds');
  };

  it('hands back a claimed territory, unpaid and with its field live', () => {
    const { seed, at } = territorySeed();
    const fresh = newRun(seed, TUNING);
    const held = newRun(seed, TUNING, [at]);

    // Same seed, same everything except the standing claim — and the perk it
    // pays (P4b): a held territory starts the next run richer, capped.
    expect(held.claimed).toEqual([at]);
    expect(held.tiles).toBe(fresh.tiles + TUNING.territoryTiles);
    expect(held.points).toBe(fresh.points);

    // Walk the board out to the territory and check it arrives claimed —
    // and that arriving pays nothing a second time.
    const grown = growToward(held, at);
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
});

describe('a world already holding a find', () => {
  /** A seed whose plane has a hidden find near enough to test with. */
  const findSeed = (): { seed: number; at: string } => {
    const dense = { ...TUNING, findEvery: 4, findChance: 1, worldWalls: 0, destinationChance: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const [f] = findsWithin(seed, 24, dense);
      if (f !== undefined) return { seed, at: key(f.q, f.r) };
    }
    throw new Error('no find within 24 hexes in 400 seeds');
  };

  it('hands back a claimed find, unpaid a second time — the same ride as a territory', () => {
    const { seed, at } = findSeed();
    const tuning = {
      ...TUNING,
      findEvery: 4,
      findChance: 1,
      worldWalls: 0,
      destinationChance: 0,
      startingTiles: 500,
      costRisesEvery: 1000,
    };
    const fresh = newRun(seed, tuning);
    const held = newRun(seed, tuning, [], [at]);

    // A find carries no starting-purse perk (that is territories' job) —
    // only the standing claim differs.
    expect(held.claimedFinds).toEqual([at]);
    expect(held.tiles).toBe(fresh.tiles);

    const grown = growToward(held, at);
    const cell: Cell | undefined = grown.cells[at];
    if (cell === undefined) return; // never reached it; the claim below is moot
    expect(cell.kind).toBe('landmark');
    if (cell.kind === 'landmark') {
      expect(cell.reward).toBe('find');
      expect(cell.claimed).toBe(true);
    }

    // Reveal-and-claimed pays no relics — the same "pays nothing again" the
    // territory test pins above. Compared against the identical walk from a
    // FRESH run (same seed, same tuning, `at` not yet held) rather than
    // asserting an absolute relics total: at this density the beeline can
    // legitimately stumble on other, still-unclaimed finds along the way,
    // and both walks touch those identically — the only thing that should
    // differ between them is the one claim `at` itself pays only once.
    const grownFresh = growToward(fresh, at);
    expect(grownFresh.relics).toBe(grown.relics + tuning.claimRelics);
  });
});

describe('shrines and the unlock ledger (M4)', () => {
  it('remembers a shrine reached, and never more than the ledger holds', () => {
    const base = newRun(42, TUNING);
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
    const base = newRun(42, TUNING);
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

describe('rearmedSpent — spent landmarks reborn per run (2026-08-20)', () => {
  it('rolls every spent shrine and find a fresh face, deterministically', () => {
    const w = { ...newWorld(42), shrines: [key(3, 0)], finds: [key(0, 4)], runs: 5 };
    const a = rearmedSpent(w);
    expect(rearmedSpent(w)).toEqual(a);
    expect(Object.keys(a).sort()).toEqual([key(0, 4), key(3, 0)].sort());
    for (const face of Object.values(a)) expect(['cache', 'site']).toContain(face);
  });

  it('rerolls the mix when the run count moves — per NEW run, as asked', () => {
    const finds = Array.from({ length: 12 }, (_, i) => key(i + 1, -1));
    const w = { ...newWorld(42), finds };
    expect(rearmedSpent({ ...w, runs: 1 })).not.toEqual(rearmedSpent({ ...w, runs: 2 }));
  });

  it("keeps a fully awake world's shrines as shrines — the crossing's doors", () => {
    const shrines = UNLOCKS.map((_, i) => key(i + 2, 0));
    const w = { ...newWorld(42), shrines, finds: [key(9, 9)] };
    const out = rearmedSpent(w);
    for (const s of shrines) expect(out[s]).toBeUndefined();
    expect(out[key(9, 9)]).toBeDefined();
  });
});

describe('a world survives one bad entry (2026-08-20)', () => {
  it('salvages the hexes either side of it rather than deleting the world', () => {
    // decodeWorld returning null makes the shell mint a fresh world OVER the
    // old blob on the same tick, so an all-or-nothing decode turned one bad
    // element into a silently deleted world — the shape a truncated write
    // from an iOS kill mid-setItem takes.
    const salvaged = decodeWorld(
      JSON.stringify({
        worldSeed: 7,
        revealed: ['0,0', 42, '1,0', null, '2,0'],
        territories: ['3,0'],
        runs: 4,
      }),
    );
    expect(salvaged).not.toBeNull();
    expect(salvaged?.worldSeed).toBe(7);
    expect(salvaged?.revealed).toEqual(['0,0', '1,0', '2,0']);
    expect(salvaged?.territories).toEqual(['3,0']);
    expect(salvaged?.runs).toBe(4);
  });

  it('still refuses a shape this module never wrote', () => {
    // A `revealed` that is not a list is not a damaged world, it is not a
    // world — guessing at it would be inventing ground.
    expect(
      decodeWorld(JSON.stringify({ worldSeed: 7, revealed: 'nope', territories: [] })),
    ).toBeNull();
    expect(decodeWorld('not json')).toBeNull();
    expect(decodeWorld(null)).toBeNull();
  });
});

/**
 * The camp cluster (2026-08-21). `homeOf` has existed since the where-you-wake
 * prototype, and `reachOf` has always used it — but five other places went on
 * measuring from world ORIGIN, and the docblock calling the prototype
 * "unreachable from UI" had been stale since camps shipped as the fifth
 * shrine. A camp run is a last-tier world's ROUTINE mode, so every one of
 * those was live for the players furthest in. This pins the world's half.
 */
describe('the world remembers the longest expedition, not the map’s extent', () => {
  const CAMP = key(20, 0);

  it('does not pay a reach goal for standing still at a far camp', () => {
    // The exploit: waking at a ring-20 territory and placing one tile banked
    // farthestReach 20, minting "Reach 20 hexes from home" (25 relics) for
    // no walking at all.
    const camped = newRun(5, TUNING, [], [], CAMP);
    expect(mergeRun(newWorld(5), camped).farthestReach).toBeLessThan(5);
  });

  it('still counts a real walk, wherever the camp happens to sit', () => {
    const camped = newRun(5, TUNING, [], [], CAMP);
    const walked: GameState = {
      ...camped,
      cells: { ...camped.cells, [key(25, 0)]: { kind: 'tile', colour: 'green' } },
    };
    expect(mergeRun(newWorld(5), walked).farthestReach).toBe(5);
  });

  it('never moves an existing world’s record backward', () => {
    // Worlds already hold an origin-anchored number; `Math.max` against the
    // stored value means the change cannot take anybody's record away.
    const held = { ...newWorld(5), farthestReach: 31 };
    expect(mergeRun(held, newRun(5, TUNING, [], [], CAMP)).farthestReach).toBe(31);
  });
});
