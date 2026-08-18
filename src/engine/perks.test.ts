import { describe, expect, it } from 'vitest';
import { BARE_TUNING, TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { newRun, reduce } from './reduce';
import {
  canPlaceAt,
  isExhausted,
  legalPlacements,
  placementCostAt,
  previewWorth,
  worthOf,
} from './rules';
import type { Cell, GameState } from './state';

/**
 * The found perks' engine halves (2026-08-18, `ideas/uniques.md` resolved):
 * STONEWALKER discounts placements beside stone, WALLBREAKER lets walls be
 * built on at a multiple. Both dials are zero in every shipped tuning and set
 * only by `applyProgress` while the perk is worn — what these pin is that the
 * dials do exactly what the perk's one sentence says, and nothing when zero.
 */

const tuned = (over: Partial<Tuning>): Tuning => ({ ...BARE_TUNING, ...over });
const QUIET: Partial<Tuning> = { worldWalls: 0, destinationChance: 0 };

/** A run with a stone planted beside the first legal spot. */
function withStoneBeside(t: Tuning): { state: GameState; spot: HexKey } {
  const spot = key(1, 0);
  const base = newRun(11, t);
  const cells: Record<HexKey, Cell> = { ...base.cells, [key(2, 0)]: { kind: 'stone' } };
  return { state: { ...base, cells }, spot };
}

describe('stonewalker — placements beside stone cost less', () => {
  it('discounts the cost when a neighbour is stone, and floors at free', () => {
    const t = tuned({ ...QUIET, stoneDiscount: 1 });
    const { state, spot } = withStoneBeside(t);

    // baseCost 1, one stone neighbour, discount 1: the placement is free.
    expect(placementCostAt(state.cells, spot, state.placements, t)).toBe(0);
    const next = reduce(state, { type: 'PLACE', hex: spot });
    expect(next.tiles).toBe(state.tiles);

    // A deeper discount cannot go below free.
    const deep = tuned({ ...QUIET, stoneDiscount: 5 });
    expect(placementCostAt(state.cells, spot, 0, deep)).toBe(0);
  });

  it('keeps the arithmetic above the floor: cost minus the discount', () => {
    const t = tuned({ ...QUIET, baseCost: 3, stoneDiscount: 1 });
    const { state, spot } = withStoneBeside(t);
    expect(placementCostAt(state.cells, spot, 0, t)).toBe(2);
    const next = reduce(state, { type: 'PLACE', hex: spot });
    expect(next.tiles).toBe(state.tiles - 2);
  });

  it('charges the full price away from stone, and always at discount zero', () => {
    const t = tuned({ ...QUIET, stoneDiscount: 1 });
    const { state } = withStoneBeside(t);
    // key(0, 1) touches the seed tile but not the stone at key(2, 0).
    expect(placementCostAt(state.cells, key(0, 1), 0, t)).toBe(t.baseCost);

    const off = tuned(QUIET);
    const plain = withStoneBeside(off);
    expect(placementCostAt(plain.state.cells, key(1, 0), 0, off)).toBe(off.baseCost);
  });
});

describe('wallbreaker — walls can be built on, at a multiple', () => {
  /** A wall beside the seed tile, with a matching tile beyond it. */
  function withWall(t: Tuning): { state: GameState; wall: HexKey } {
    const wall = key(1, 0);
    const base = newRun(11, t);
    const seed = base.cells[key(0, 0)];
    if (seed?.kind !== 'tile') throw new Error('no seed tile');
    const cells: Record<HexKey, Cell> = {
      ...base.cells,
      [wall]: { kind: 'wall' },
      [key(2, 0)]: { kind: 'tile', colour: seed.colour },
    };
    return { state: { ...base, cells }, wall };
  }

  it('keeps rule 7 exactly where the dial is zero', () => {
    const off = tuned(QUIET);
    const { state, wall } = withWall(off);
    expect(canPlaceAt(state.cells, wall, off)).toBe(false);
    expect(canPlaceAt(state.cells, wall)).toBe(false);
    expect(reduce(state, { type: 'PLACE', hex: wall })).toBe(state);
  });

  it('permits the wall, prices it at the multiple, and replaces it with the tile', () => {
    const t = tuned({ ...QUIET, wallBuildCostMult: 2 });
    const { state, wall } = withWall(t);

    expect(canPlaceAt(state.cells, wall, t)).toBe(true);
    expect(legalPlacements(state.cells, t)).toContain(wall);
    expect(placementCostAt(state.cells, wall, 0, t)).toBe(t.baseCost * 2);

    const next = reduce(state, { type: 'PLACE', hex: wall });
    expect(next.cells[wall]?.kind).toBe('tile');
    expect(next.tiles).toBe(state.tiles - t.baseCost * 2);
  });

  it('previews on a wall exactly what the placement then pays — the invariant', () => {
    const t = tuned({ ...QUIET, wallBuildCostMult: 2 });
    const { state, wall } = withWall(t);
    const seed = state.cells[key(0, 0)];
    if (seed?.kind !== 'tile') throw new Error('no seed tile');

    // The wall is REPLACED, so worth is computed as if the cell were the
    // tile: two matching neighbours either side of it.
    const promised = previewWorth(state.cells, wall, { colour: seed.colour, rarity: 'common' }, t);
    expect(promised).toBe(2);

    const index = state.draft.findIndex((d) => d.colour === seed.colour);
    if (index < 0) return; // this seed's draft holds no matching colour; the promise above stands
    const placed = reduce(reduce(state, { type: 'SELECT', index }), { type: 'PLACE', hex: wall });
    expect(worthOf(placed.cells, wall, t)).toBe(promised);
  });

  it('turns a walled-in frontier back into a frontier', () => {
    // A lone tile ringed by walls: exhausted under rule 7, buildable under
    // the perk — which is what retires the `walled` death for that run.
    const cells: Record<HexKey, Cell> = { [key(0, 0)]: { kind: 'tile', colour: 'green' } };
    for (const n of neighbourKeys(0, 0)) cells[n] = { kind: 'wall' };

    expect(isExhausted(cells)).toBe(true);
    expect(isExhausted(cells, tuned({ ...QUIET, wallBuildCostMult: 2 }))).toBe(false);
  });
});

describe('open hand — five cards, no stash', () => {
  it('deals the width the dial asks for', () => {
    // Open Hand is draftWidth 5 with holdSlots 0, set by applyProgress; the
    // engine's half is only that the dials are honoured, which they already
    // were — pinned here so the perk cannot rot silently.
    const state = newRun(3, { ...TUNING, draftWidth: 5, holdSlots: 0 });
    expect(state.draft).toHaveLength(5);
    expect(reduce(state, { type: 'HOLD' })).toBe(state);
  });
});
