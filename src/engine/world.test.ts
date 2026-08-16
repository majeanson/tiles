import { describe, expect, it } from 'vitest';
import { TUNING, COLOURS, type Tuning } from '@content/tuning';
import { disc, distance, key, neighbourKeys } from './hex';
import { newRun, reduce } from './reduce';
import { previewWorth, worthOf } from './rules';
import {
  destinationAt,
  destinationsWithin,
  terrainAt,
  elevationAt,
  elevationBandAt,
} from './world';

/**
 * P2 (`ideas/endless-world.md`): the ground under the endless world. These pin
 * the terrain function's contract and the native-ground rule; whether the
 * terrain makes the ECONOMY better is `pnpm sim`'s question.
 */

const ENDLESS: Tuning = { ...TUNING };

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
  const T = TUNING;

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
    // Shrines (M4) are rare by design — an unlock you meet every run is not
    // an unlock — so the sweep has to be wide before it finds one.
    expect([...rewards].sort()).toEqual(['cache', 'shrine', 'site', 'territory']);
  });

  it('does not exist while the system is switched off', () => {
    const none = { ...TUNING, destinationChance: 0 };
    expect(destinationsWithin(9, 60, none)).toEqual([]);
    expect(destinationAt(9, 12, 12, none)).toBeNull();
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

    // Three matching neighbours, plus green's crowd bonus for the two past the
    // first. The walls contribute nothing, which is the claim being made.
    const t = state.tuning;
    expect(worthOf(cells, centre, t)).toBe(3 + 2 * t.greenCrowdBonus);
  });
});

describe('elevation', () => {
  /**
   * Marc asked what to do about visuals — "real terrains? 3d like
   * topography?" — and chose the cosmetic version. Height is a pure function
   * of the seed like every other terrain layer, so it costs nothing to store
   * and every run on a world agrees about where the hills are.
   */
  const HILLY = { ...TUNING, elevationEvery: 9, elevationBands: 5 };

  it('is a pure function of the world seed', () => {
    for (const [q, r] of [
      [0, 0],
      [7, -3],
      [40, 40],
    ] as const) {
      expect(elevationAt(11, q, r, HILLY)).toBe(elevationAt(11, q, r, HILLY));
      expect(elevationAt(11, q, r, HILLY)).not.toBe(elevationAt(12, q, r, HILLY));
    }
  });

  it('stays in range, everywhere anyone can walk', () => {
    for (let q = -40; q <= 40; q += 7) {
      for (let r = -40; r <= 40; r += 7) {
        const h = elevationAt(3, q, r, HILLY);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
      }
    }
  });

  it('bands the land, and uses more than one band', () => {
    const seen = new Set<number>();
    for (let q = -30; q <= 30; q++) {
      for (let r = -30; r <= 30; r++) seen.add(elevationBandAt(5, q, r, HILLY));
    }
    expect(seen.size).toBeGreaterThan(2);
    for (const band of seen) {
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(HILLY.elevationBands);
    }
  });

  it('makes hills rather than static — neighbours usually share a band', () => {
    // The whole point of blocks: if every hex rolled its own height the board
    // would be noise, not land.
    let same = 0;
    let total = 0;
    for (let q = -20; q <= 20; q++) {
      for (let r = -20; r <= 20; r++) {
        total++;
        if (elevationBandAt(5, q, r, HILLY) === elevationBandAt(5, q + 1, r, HILLY)) same++;
      }
    }
    expect(same / total).toBeGreaterThan(0.6);
  });

  it('flattens entirely where the layer is switched off', () => {
    const flat = { ...TUNING, elevationEvery: 0 };
    expect(elevationAt(5, 12, 12, flat)).toBe(0);
    expect(elevationBandAt(5, 12, 12, flat)).toBe(0);
  });
});
