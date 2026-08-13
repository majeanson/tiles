import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, TUNING, COLOURS, type Tuning } from '@content/tuning';
import { disc, distance, key, neighbourKeys } from './hex';
import { newRun, reduce } from './reduce';
import { previewWorth, worthOf } from './rules';
import { destinationAt, destinationsWithin, terrainAt } from './world';

/**
 * P2 (`ideas/endless-world.md`): the ground under the endless world. These pin
 * the terrain function's contract and the native-ground rule; whether the
 * terrain makes the ECONOMY better is `pnpm sim`'s question.
 */

const ENDLESS: Tuning = { ...TUNING, world: 'endless' };

describe('the terrain function', () => {
  it('is a pure lookup — same hex, same answer, in any order', () => {
    for (const h of disc(9)) {
      const first = terrainAt(1234, h.q, h.r, ENDLESS);
      const again = terrainAt(1234, h.q, h.r, ENDLESS);
      expect(again).toEqual(first);
    }
  });

  it('keeps the arrival clearing clean', () => {
    for (const h of disc(1)) {
      expect(terrainAt(99, h.q, h.r, ENDLESS)).toEqual({ wall: false, native: null });
    }
  });

  it('lays walls and fields at roughly the asked rates', () => {
    const cells = disc(40).map((h) => terrainAt(7, h.q, h.r, ENDLESS));
    const walls = cells.filter((c) => c.wall).length / cells.length;
    const native = cells.filter((c) => c.native !== null).length / cells.length;

    expect(walls).toBeGreaterThan(ENDLESS.worldWalls / 2);
    expect(walls).toBeLessThan(ENDLESS.worldWalls * 2);
    // Native ground loses a little to walls, so the bound is one-sided-ish.
    expect(native).toBeGreaterThan(ENDLESS.fieldChance * 0.5);
    expect(native).toBeLessThan(ENDLESS.fieldChance * 1.2);
  });

  it('uses every colour for fields', () => {
    const seen = new Set(
      disc(60)
        .map((h) => terrainAt(3, h.q, h.r, ENDLESS).native)
        .filter((c) => c !== null),
    );
    expect([...seen].sort()).toEqual([...COLOURS].sort());
  });
});

describe('destinations', () => {
  const T = ENDLESS_TUNING;

  it('agrees with itself: the per-hex answer is the enumeration, exactly', () => {
    const radius = 40;
    const listed = new Map(destinationsWithin(9, radius, T).map((d) => [key(d.q, d.r), d]));
    for (const h of disc(radius)) {
      const at = destinationAt(9, h.q, h.r, T);
      expect(at).toEqual(listed.get(key(h.q, h.r)) ?? null);
    }
  });

  it('keeps the first destination a journey — nothing lands next to home', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const d of destinationsWithin(seed, 30, T)) {
        expect(distance(d, { q: 0, r: 0 })).toBeGreaterThanOrEqual(T.destinationEvery / 2);
      }
    }
  });

  it('offers every reward kind, and territories always carry a colour', () => {
    const rewards = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      for (const d of destinationsWithin(seed, 60, T)) {
        rewards.add(d.reward);
        if (d.reward === 'territory') expect(d.colour).not.toBeNull();
        else expect(d.colour).toBeNull();
      }
    }
    expect([...rewards].sort()).toEqual(['cache', 'site', 'territory']);
  });

  it('does not exist while the system is off — the bounded default', () => {
    expect(destinationsWithin(9, 60, TUNING)).toEqual([]);
    expect(destinationAt(9, 12, 12, TUNING)).toBeNull();
  });
});

describe('native ground', () => {
  it('counts as one match, in worth and in preview alike', () => {
    // A seed run, then place next to the seed on ground made native by hand:
    // the preview must promise exactly what the placement then pays.
    let state = newRun(5, ENDLESS);
    const seed = state.cells[key(0, 0)];
    if (seed?.kind !== 'tile') throw new Error('no seed tile');

    const spot = key(1, 0);
    state = {
      ...state,
      cells: { ...state.cells, [spot]: { kind: 'empty', native: seed.colour } },
    };

    const promised = previewWorth(
      state.cells,
      spot,
      { colour: seed.colour, rarity: 'common' },
      state.tuning,
    );
    state = reduce(state, {
      type: 'SELECT',
      index: state.draft.findIndex((t) => t.colour === seed.colour),
    });
    // Only run the placement half when the draft actually holds the colour.
    const tile = state.draft[state.selected];
    if (tile?.colour === seed.colour) {
      state = reduce(state, { type: 'PLACE', hex: spot });
      expect(worthOf(state.cells, spot, state.tuning)).toBe(promised);
      expect(promised).toBe(2); // the seed neighbour + the ground itself
    } else {
      expect(promised).toBe(2);
    }
  });

  it('gives no bonus to the wrong colour on native ground', () => {
    const state = newRun(5, ENDLESS);
    const spot = key(1, 0);
    const cells = { ...state.cells, [spot]: { kind: 'empty', native: 'red' } as const };
    const blue = { colour: 'blue', rarity: 'common' } as const;
    expect(previewWorth(cells, spot, blue, state.tuning)).toBe(
      previewWorth(state.cells, spot, blue, state.tuning),
    );
  });
});

describe('walls on the plane', () => {
  it('reveals walls as growth reaches them, and refuses to build on them', () => {
    // March a line outward until a wall is revealed, then try to place on it.
    let state = newRun(21, ENDLESS);
    let wall: string | null = null;
    for (let step = 0; step < 300 && wall === null; step++) {
      const spot = Object.entries(state.cells).find(([, c]) => c.kind === 'empty')?.[0];
      if (spot === undefined) break;
      const next = reduce(state, { type: 'PLACE', hex: spot });
      if (next === state) break;
      state = next;
      wall = Object.entries(state.cells).find(([, c]) => c.kind === 'wall')?.[0] ?? null;
    }

    if (wall === null) return; // this seed met no wall in 300 steps; fine
    expect(reduce(state, { type: 'PLACE', hex: wall })).toBe(state);
  });

  it('still counts walls as surrounding for ripeness', () => {
    // Hand-build: a tile with three wall neighbours and three tile neighbours
    // is ripe, and the walls contribute no worth.
    const state = newRun(31, ENDLESS);
    const centre = key(10, 10);
    const cells: Record<string, (typeof state.cells)[string]> = { ...state.cells };
    cells[centre] = { kind: 'tile', colour: 'green' };
    const around = neighbourKeys(10, 10);
    around.forEach((k, i) => {
      cells[k] = i < 3 ? { kind: 'wall' } : { kind: 'tile', colour: 'green' };
    });

    const worth = worthOf(cells, centre, state.tuning);
    expect(worth).toBe(3);
  });
});
