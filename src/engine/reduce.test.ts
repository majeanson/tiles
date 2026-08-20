import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { newRun, reduce } from './reduce';
import { costOf, isRipe, legalPlacements, ripeKeys } from './rules';
import type { Action, Cell, GameState } from './state';

/**
 * The reducer, on the one world.
 *
 * This file used to be mostly about bounded maps — filling a disc, cashing it,
 * LEAVING for the next one. All of that went on 2026-08-16 when Marc
 * officialised the decisions: there is one plane, one economy, and no flag
 * that changes which game is being played. What survives here is what was
 * never about the map: what a run starts as, what a placement costs, what the
 * reducer refuses, and how a run ends.
 */

const tuned = (over: Partial<Tuning>): Tuning => ({ ...TUNING, ...over });

/** No terrain, so a test is about the reducer rather than about the world. */
const PLAIN = tuned({ worldWalls: 0, destinationChance: 0, magicChance: 0, uniqueChance: 0 });

/** Ring the seed tile so it ripens: the smallest pocket the plane can make. */
function ripenTheSeed(state: GameState): GameState {
  let s = state;
  for (const n of neighbourKeys(0, 0)) {
    if (s.cells[n]?.kind === 'empty') s = reduce(s, { type: 'PLACE', hex: n });
  }
  return s;
}

/** Place into the first legal cell, `times` over, or until the run ends. */
function place(state: GameState, times: number): GameState {
  let s = state;
  for (let i = 0; i < times && s.phase === 'placing'; i++) {
    const spot = legalPlacements(s.cells)[0];
    if (spot === undefined) return s;
    s = reduce(s, { type: 'PLACE', hex: spot });
  }
  return s;
}

describe('starting a run', () => {
  it('is placeable, with a seed tile and a full draft', () => {
    const state = newRun(1, PLAIN);
    expect(state.phase).toBe('placing');
    expect(state.cells[key(0, 0)]?.kind).toBe('tile');
    expect(state.draft).toHaveLength(PLAIN.draftWidth);
    expect(legalPlacements(state.cells).length).toBeGreaterThan(0);
  });

  it('is deterministic from its seed', () => {
    expect(newRun(7, PLAIN)).toEqual(newRun(7, PLAIN));
    expect(newRun(7, PLAIN)).not.toEqual(newRun(8, PLAIN));
  });

  it('round-trips through JSON', () => {
    const state = place(newRun(3, PLAIN), 4);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('carries the economy it is being played under', () => {
    // A run is reproducible from seed AND tuning: a replay that did not record
    // the second would silently re-score itself after any balance change.
    const rich = tuned({ startingTiles: 999 });
    expect(newRun(1, rich).tuning.startingTiles).toBe(999);
    expect(newRun(1, rich).tiles).toBeGreaterThanOrEqual(999);
  });
});

describe('placing', () => {
  it('spends the cost and advances the dial', () => {
    const state = newRun(2, PLAIN);
    const spot = legalPlacements(state.cells)[0]!;
    const after = reduce(state, { type: 'PLACE', hex: spot });

    expect(after.placements).toBe(1);
    expect(after.tiles).toBe(state.tiles - costOf(0, PLAIN));
    expect(after.cells[spot]?.kind).toBe('tile');
  });

  it('returns the same state for every illegal action', () => {
    const state = newRun(2, PLAIN);
    const occupied = key(0, 0);
    const detached = key(20, 20);

    for (const action of [
      { type: 'PLACE', hex: occupied },
      { type: 'PLACE', hex: detached },
      { type: 'SELECT', index: 99 },
      { type: 'SELECT', index: -2 },
      { type: 'HARVEST', choice: 'tiles' },
    ] satisfies Action[]) {
      expect(reduce(state, action)).toBe(state);
    }
  });

  it('reveals a reborn landmark where the map says, whatever the hash thought', () => {
    // Spent shrines and finds, reborn (2026-08-20): the shell hands a map
    // of hex → new face and the reveal obeys it, unclaimed — so walking
    // back pays like any cache or site. The claim mechanics themselves are
    // the ordinary landmark path, already pinned; the new wiring is the
    // override winning the reveal.
    const ring = key(1, 0);
    const state = newRun(2, PLAIN, [], [], null, { [ring]: 'cache', [key(0, 1)]: 'site' });
    expect(state.cells[ring]).toEqual({ kind: 'landmark', reward: 'cache', claimed: false });
    expect(state.cells[key(0, 1)]).toEqual({ kind: 'landmark', reward: 'site', claimed: false });
    expect(state.rearmed[ring]).toBe('cache');
  });

  it('puts the card down on SELECT -1, and nothing places while the hand is empty', () => {
    // The empty hand (2026-08-20): the UI sends -1 when the selected card is
    // tapped again. Placement waits for a card to be picked back up.
    const state = newRun(2, PLAIN);
    const down = reduce(state, { type: 'SELECT', index: -1 });
    expect(down.selected).toBe(-1);
    expect(reduce(down, { type: 'SELECT', index: -1 })).toBe(down);

    const spot = legalPlacements(state.cells)[0]!;
    expect(reduce(down, { type: 'PLACE', hex: spot })).toBe(down);

    const up = reduce(down, { type: 'SELECT', index: 1 });
    expect(up.selected).toBe(1);
    expect(reduce(up, { type: 'PLACE', hex: spot }).placements).toBe(1);
  });

  it('never lets the budget go negative', () => {
    // DESIGN.md's "at zero: one last tile, one last harvest" — paying more
    // than you hold floors you at zero rather than going below it.
    const broke = { ...newRun(5, PLAIN), tiles: 1 };
    const after = reduce(broke, { type: 'PLACE', hex: legalPlacements(broke.cells)[0]! });
    expect(after.tiles).toBe(0);
  });
});

describe('harvesting', () => {
  it('turns ripe tiles to stone and pays', () => {
    const ripe = ripenTheSeed(newRun(4, PLAIN));
    expect(isRipe(ripe.cells, key(0, 0))).toBe(true);

    const popped = reduce(ripe, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    expect(popped.cells[key(0, 0)]?.kind).toBe('stone');
    expect(popped.tiles).toBeGreaterThan(ripe.tiles);
    expect(ripeKeys(popped.cells)).not.toContain(key(0, 0));
  });

  it('records each harvest against the run clock', () => {
    const ripe = ripenTheSeed(newRun(4, PLAIN));
    const popped = reduce(ripe, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    expect(popped.log.harvests).toHaveLength(1);
    expect(popped.log.harvests[0]?.at).toBe(ripe.placements);
    expect(popped.log.harvests[0]?.count).toBeGreaterThan(0);
  });

  it('pops one pocket, not the board', () => {
    // Two pockets far apart: cashing one must leave the other standing. This
    // is the whole of why timing is a decision on the plane.
    const base = newRun(6, PLAIN);
    const far = key(9, 0);
    const cells: Record<HexKey, Cell> = { ...base.cells, [far]: { kind: 'tile', colour: 'green' } };
    for (const n of neighbourKeys(9, 0)) cells[n] = { kind: 'stone' };

    const both = ripenTheSeed({ ...base, cells });
    expect(isRipe(both.cells, far)).toBe(true);

    const popped = reduce(both, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    expect(popped.cells[far]?.kind).toBe('tile');
  });
});

describe('the end of a run', () => {
  it('ends broke, and names it', () => {
    const poor = place({ ...newRun(11, PLAIN), tiles: 2 }, 6);
    expect(poor.phase).toBe('ended');
    expect(poor.death).toBe('broke');
  });

  it('does not end while something is still ripe to cash in', () => {
    // Dying with a finished pocket unpopped would be a cheat rather than a
    // decision: you always get to cash what is already ripe.
    const ripe = ripenTheSeed(newRun(4, PLAIN));
    const skint = place({ ...ripe, tiles: 1 }, 3);
    expect(skint.phase).toBe('placing');
    expect(ripeKeys(skint.cells).length).toBeGreaterThan(0);
  });

  it('accepts nothing once it has ended', () => {
    const dead = place({ ...newRun(11, PLAIN), tiles: 2 }, 8);
    expect(dead.phase).toBe('ended');

    for (const action of [
      { type: 'PLACE', hex: key(1, 0) },
      { type: 'SELECT', index: 1 },
      { type: 'HARVEST', choice: 'tiles' },
      { type: 'SPEND', on: 'reroll' },
    ] satisfies Action[]) {
      expect(reduce(dead, action)).toBe(dead);
    }
  });
});
