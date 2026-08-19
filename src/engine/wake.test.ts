import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { key, neighbourKeys } from './hex';
import { newRun, reduce } from './reduce';
import { cachePaysAt, distanceMultiplierAt, harvestMultiplier, homeOf } from './rules';

/**
 * The where-you-wake PROTOTYPE (2026-08-18, harness only — see LOG.md's
 * addendum for the verdict). `wakeAt` is unreachable from any UI; these pin
 * only the engine support: growing the plane from a hex other than true
 * origin, and measuring every distance-based reward from it.
 */

const T = { ...TUNING, worldWalls: 0, magicChance: 0, uniqueChance: 0, destinationChance: 0 };

describe('the where-you-wake prototype', () => {
  it('is off by default: newRun with no wakeAt grows from true origin, as always', () => {
    const state = newRun(5, T);
    expect(state.wakeAt).toBeNull();
    expect(state.cells[key(0, 0)]).toMatchObject({ kind: 'tile' });
    expect(homeOf(state)).toEqual({ q: 0, r: 0 });
  });

  it('grows the seed tile — and its clearing — at the wake hex instead', () => {
    const wake = key(20, 0);
    const state = newRun(5, T, [], [], wake);
    expect(state.wakeAt).toBe(wake);
    expect(state.cells[wake]).toMatchObject({ kind: 'tile' });
    for (const n of neighbourKeys(20, 0)) {
      expect(state.cells[n]).toBeDefined();
    }
    // True origin was never touched — the plane only exists where it has
    // been grown, and this run grew nothing there.
    expect(state.cells[key(0, 0)]).toBeUndefined();
  });

  it('measures homeOf from the wake hex', () => {
    const wake = key(20, 0);
    const state = newRun(5, T, [], [], wake);
    expect(homeOf(state)).toEqual({ q: 20, r: 0 });
  });

  it('prices the distance multiplier and caches from the wake hex, not true origin', () => {
    // A hex far from true origin (29) but close to a wake hex at (20, 0).
    const target = key(29, 0);
    const wakenState = newRun(5, T, [], [], key(20, 0));

    const atOrigin = distanceMultiplierAt(target, T);
    const atWake = distanceMultiplierAt(target, T, homeOf(wakenState));
    expect(atWake).toBeLessThan(atOrigin);

    const graded = { ...T, cachePaysPerRing: 5 };
    expect(cachePaysAt(target, graded, homeOf(wakenState))).toBeLessThan(
      cachePaysAt(target, graded),
    );
  });

  it('prices a harvest’s multiplier from the wake hex, not true origin', () => {
    const wake = key(30, 0);
    let state = newRun(5, T, [], [], wake);
    state = reduce(state, { type: 'PLACE', hex: key(31, 0) });

    const pops = [key(31, 0)];
    // Distance from the wake hex is 1; from true origin it would be 31.
    expect(harvestMultiplier(state, pops)).toBe(1 + Math.floor(1 / state.tuning.distanceStep));
  });

  it('ends a run reporting REACH — and the reach bonus — from the wake hex', () => {
    const wake = key(50, 0);
    const bonused = { ...T, endReachBonus: 10, endClaimBonus: 0 };
    let state = newRun(5, bonused, [], [], wake);

    // One placement out from the wake hex.
    state = reduce(state, { type: 'PLACE', hex: key(51, 0) });
    // Exactly enough tiles for one more placement, which spends the last of
    // them: with nothing ripe, that ends the run 'broke'.
    state = { ...state, tiles: 1 };
    state = reduce(state, { type: 'PLACE', hex: key(52, 0) });

    expect(state.phase).toBe('ended');
    expect(state.death).toBe('broke');
    // Reach is 2 from the wake hex (two placements out), not 52 from origin.
    expect(state.points).toBe(2 * bonused.endReachBonus);
  });
});
