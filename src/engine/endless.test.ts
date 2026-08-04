import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { newRun, reduce } from './reduce';
import { canPlaceNow, harvestValue, legalPlacements, ripeClusterAt, ripeClusters } from './rules';
import type { Cell, GameState } from './state';

/**
 * The endless world, P1 (`ideas/endless-world.md`): one unbounded plane grown
 * from a seed tile. These tests pin the STRUCTURE — growth, local harvest, the
 * distance multiplier, and the actions that stop existing. Whether the economy
 * works is `sim.test.ts`'s question, not this file's.
 */

const ENDLESS: Tuning = { ...TUNING, world: 'endless' };

const tile = (colour: 'green' | 'yellow' | 'red' | 'blue'): Cell => ({ kind: 'tile', colour });
const STONE: Cell = { kind: 'stone' };

/**
 * A ripe two-tile pocket: a same-coloured domino walled in by stone. Each half
 * touches all six sides (ripe) and matches exactly one neighbour (the other
 * half), so its worth is pinned at 1 — handy for arithmetic done by hand.
 */
function domino(cells: Record<HexKey, Cell>, q: number, r: number): [HexKey, HexKey] {
  const a = key(q, r);
  const b = key(q + 1, r);
  cells[a] = tile('green');
  cells[b] = tile('green');
  for (const k of [...neighbourKeys(q, r), ...neighbourKeys(q + 1, r)]) {
    if (k !== a && k !== b) cells[k] = STONE;
  }
  return [a, b];
}

const stateWith = (cells: Record<HexKey, Cell>): GameState => ({
  ...newRun(1, ENDLESS),
  cells,
});

describe('the grown plane', () => {
  it('starts as one seed tile and the six empties around it, nothing else', () => {
    const state = newRun(7, ENDLESS);
    expect(Object.keys(state.cells)).toHaveLength(7);
    expect(state.cells[key(0, 0)]?.kind).toBe('tile');
    for (const n of neighbourKeys(0, 0)) expect(state.cells[n]?.kind).toBe('empty');
  });

  it('materialises new ground around every placement, so no tile borders the void', () => {
    let state = newRun(7, ENDLESS);
    state = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    expect(state.cells[key(1, 0)]?.kind).toBe('tile');
    for (const n of neighbourKeys(1, 0)) expect(state.cells[n]).toBeDefined();
    // The frontier grew: there is strictly more legal ground than before.
    expect(legalPlacements(state.cells).length).toBeGreaterThan(6 - 1);
  });

  it('never ripens the seed tile by the void — six real neighbours are required', () => {
    // On a bounded radius-1 map the rim ripens against the map edge. Here the
    // same shape must NOT be ripe, because the plane keeps going.
    let state = newRun(7, ENDLESS);
    for (const n of neighbourKeys(0, 0)) state = reduce(state, { type: 'PLACE', hex: n });
    // The seed is now surrounded by six tiles: ripe. Its neighbours are not —
    // their outward sides are freshly grown empty ground.
    expect(ripeClusterAt(state.cells, key(0, 0)).length).toBeGreaterThan(0);
    for (const n of neighbourKeys(0, 0)) expect(ripeClusterAt(state.cells, n)).toEqual([]);
  });
});

describe('local harvest', () => {
  it('finds two separated pockets as two clusters', () => {
    const cells: Record<HexKey, Cell> = {};
    const [a1] = domino(cells, 0, 0);
    const [b1] = domino(cells, 8, 0);

    expect(ripeClusters(cells)).toHaveLength(2);
    expect(ripeClusterAt(cells, a1)).toHaveLength(2);
    expect(ripeClusterAt(cells, b1)).toHaveLength(2);
  });

  it('prices and pops only the tapped cluster; the other pocket stays', () => {
    const cells: Record<HexKey, Cell> = {};
    const [a1, a2] = domino(cells, 0, 0);
    const [b1] = domino(cells, 8, 0);

    const state = stateWith(cells);
    const value = harvestValue(state, a1);
    expect(value.count).toBe(2);
    expect([...value.keys].sort()).toEqual([a1, a2].sort());

    const after = reduce(state, { type: 'HARVEST', choice: 'points', at: a1 });
    expect(after.cells[a1]?.kind).toBe('stone');
    expect(after.cells[a2]?.kind).toBe('stone');
    expect(after.cells[b1]?.kind).toBe('tile');
  });

  it('pays the same pocket more the farther from home it sits', () => {
    // Identical dominoes: worth 1 + 1, size bonus 2. Near home the multiplier
    // is 1; at mean distance 8.5 with distanceStep 4 it is 3. Same work, three
    // times the points — the whole reason to migrate outward.
    const near: Record<HexKey, Cell> = {};
    const far: Record<HexKey, Cell> = {};
    const [n1] = domino(near, 0, 0);
    const [f1] = domino(far, 8, 0);

    const nearPay = harvestValue(stateWith(near), n1).points;
    const farPay = harvestValue(stateWith(far), f1).points;
    expect(nearPay).toBe(2 * 2 * 1);
    expect(farPay).toBe(2 * 2 * 3);
  });

  it('does nothing without a target, and nothing on an unripe target', () => {
    const cells: Record<HexKey, Cell> = {};
    domino(cells, 0, 0);
    const state = stateWith(cells);

    expect(reduce(state, { type: 'HARVEST', choice: 'points' })).toBe(state);
    expect(reduce(state, { type: 'HARVEST', choice: 'points', at: key(4, 4) })).toBe(state);
  });
});

describe('what stops existing', () => {
  it('has no LEAVE — the world is the map', () => {
    const cells: Record<HexKey, Cell> = {};
    const [a1] = domino(cells, 0, 0);
    let state = stateWith(cells);
    state = reduce(state, { type: 'HARVEST', choice: 'tiles', at: a1 });

    // Harvested, which is what unlocks LEAVE on a bounded map. Still a no-op.
    expect(reduce(state, { type: 'LEAVE' })).toBe(state);
    expect(state.mapNumber).toBe(1);
  });

  it('still dies broke, and only broke', () => {
    // Place carelessly, cash every pocket as points (never tiles), and the cost
    // curve does the rest. A run that refuses survival income must end.
    let state = newRun(11, ENDLESS);
    let guard = 0;
    while (state.phase === 'placing' && guard++ < 5000) {
      if (canPlaceNow(state)) {
        const spot = legalPlacements(state.cells)[0];
        if (spot === undefined) break;
        state = reduce(state, { type: 'PLACE', hex: spot });
        continue;
      }
      const pocket = ripeClusters(state.cells)[0];
      if (pocket?.[0] === undefined) break;
      state = reduce(state, { type: 'HARVEST', choice: 'points', at: pocket[0] });
    }
    expect(state.phase).toBe('ended');
    expect(state.death).toBe('broke');
  });
});
