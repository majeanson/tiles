import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, TILESONLY_TUNING } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { newRun, reduce } from './reduce';
import { harvestValue } from './rules';
import type { Cell, GameState } from './state';

/**
 * The tiles-only run (2026-08-15). One currency, no clock, score as a
 * by-product, and a pocket you may burn instead of take. These pin the
 * mechanics; whether it is a better game than the shipped one is a question
 * for a phone, and the flag exists so both can be played back to back.
 */

const T = { ...TILESONLY_TUNING, worldWalls: 0, magicChance: 0, uniqueChance: 0 };
const ENDLESS = { ...ENDLESS_TUNING, worldWalls: 0 };

/**
 * A ripe green row of `size` on a bare board, walled in stone.
 *
 * `openGround` decides whether the run can continue afterwards: with it, the
 * board still has somewhere to build and popping is just a pop; without it,
 * the pop is also the end of the expedition — which is the only way to see
 * the ending bonus, and the reason both shapes are needed here.
 */
function pocket(state: GameState, size: number, openGround = true): GameState {
  const cells: Record<HexKey, Cell> = {};
  const members = new Set<HexKey>();
  for (let i = 0; i < size; i++) members.add(key(i, 0));
  for (const k of members) cells[k] = { kind: 'tile', colour: 'green' };
  for (let i = 0; i < size; i++) {
    for (const n of neighbourKeys(i, 0)) if (!members.has(n)) cells[n] = { kind: 'stone' };
  }
  // Two rows out: touches the stone rim, touches no member, so the pocket
  // stays ripe and the run stays alive.
  if (openGround) cells[key(2, 2)] = { kind: 'empty' };
  return { ...state, cells };
}

describe('one payout', () => {
  it('pays tiles AND scores, whichever button was pressed', () => {
    const state = pocket(newRun(5, T), 6);
    const value = harvestValue(state, key(0, 0));
    expect(value.count).toBe(6);

    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    expect(popped.phase).toBe('placing');
    expect(popped.tiles).toBe(state.tiles + value.tiles);
    expect(popped.points).toBe(Math.floor(value.points * T.pointsPerPop));

    // 'points' is the same instruction now — older saves and policies keep
    // meaning something rather than silently doing nothing.
    const same = reduce(state, { type: 'HARVEST', choice: 'points', at: key(0, 0) });
    expect(same.tiles).toBe(popped.tiles);
    expect(same.points).toBe(popped.points);
  });

  it('still forks in the shipped endless game', () => {
    const state = pocket(newRun(5, ENDLESS), 6);
    const asTiles = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    const asPoints = reduce(state, { type: 'HARVEST', choice: 'points', at: key(0, 0) });
    expect(asTiles.points).toBe(0);
    expect(asPoints.tiles).toBe(state.tiles);
  });
});

describe('burning a pocket', () => {
  it('pays luck instead of tiles and points', () => {
    const state = pocket(newRun(5, T), 6);
    const burned = reduce(state, { type: 'HARVEST', choice: 'burn', at: key(0, 0) });

    expect(burned.tiles).toBe(state.tiles);
    expect(burned.points).toBe(state.points);
    expect(burned.luck).toBe(6 * T.burnLuck);
    expect(burned.cells[key(0, 0)]?.kind).toBe('stone');
  });

  it('beats a plain pop for luck, which is the whole trade', () => {
    const state = pocket(newRun(5, T), 6);
    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    const burned = reduce(state, { type: 'HARVEST', choice: 'burn', at: key(0, 0) });
    expect(burned.luck).toBeGreaterThan(popped.luck);
  });

  it('does not exist where the sacrifice is switched off', () => {
    const state = pocket(newRun(5, ENDLESS), 6);
    expect(reduce(state, { type: 'HARVEST', choice: 'burn', at: key(0, 0) })).toBe(state);
  });
});

describe('the run itself', () => {
  it('has no clock at all — the purse is the whole limit', () => {
    expect(T.runLength).toBe(0);
    expect(newRun(5, T).tuning.runLength).toBe(0);
  });

  it('pays for the expedition when it ends: how far, and what it reached', () => {
    // No open ground, so this pop is also the ending.
    const base = pocket(newRun(5, T), 6, false);
    const state: GameState = {
      ...base,
      points: 0,
      cells: { ...base.cells, [key(12, 0)]: { kind: 'stone' } },
    };

    const value = harvestValue(state, key(0, 0));
    const ended = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    expect(ended.phase).toBe('ended');
    expect(ended.points).toBe(Math.floor(value.points * T.pointsPerPop) + 12 * T.endReachBonus);
  });

  it('adds nothing at the end where the bonus is switched off', () => {
    const base = pocket(newRun(5, ENDLESS), 6, false);
    const ended = reduce(base, { type: 'HARVEST', choice: 'points', at: key(0, 0) });
    expect(ended.phase).toBe('ended');
    expect(ended.points).toBe(harvestValue(base, key(0, 0)).points);
  });
});
