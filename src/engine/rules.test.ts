import { describe, expect, it } from 'vitest';
import { BARE_TUNING, type Tuning } from '@content/tuning';
import { disc, key } from './hex';
import { newRun } from './reduce';
import {
  blankMap,
  canAfford,
  canPlaceAt,
  costOf,
  harvestValue,
  isExhausted,
  isRipe,
  payPlacement,
  previewWorth,
  ripeKeys,
  worthOf,
} from './rules';
import type { Cell, GameState } from './state';

/**
 * A centre and its six neighbours, on a map of the given radius.
 *
 * Radius matters: at radius 1 the neighbours are themselves ripe, because their
 * own outward sides are off-map and off-map counts as solid. Pass radius 2 to
 * leave an empty rim, so the centre is the ONLY ripe cell.
 */
function ring(
  centre: Cell,
  neighbours: readonly (Cell | undefined)[],
  radius = 1,
): Record<string, Cell> {
  const cells = blankMap(disc(radius));
  cells[key(0, 0)] = centre;
  const around = [key(1, 0), key(1, -1), key(0, -1), key(-1, 0), key(-1, 1), key(0, 1)];
  around.forEach((k, i) => {
    const cell = neighbours[i];
    if (cell !== undefined) cells[k] = cell;
  });
  return cells;
}

const tile = (colour: 'green' | 'yellow' | 'red' | 'blue'): Cell => ({ kind: 'tile', colour });
const STONE: Cell = { kind: 'stone' };
const WALL: Cell = { kind: 'wall' };
const SIX = <T>(c: T) => [c, c, c, c, c, c] as const;

const T = BARE_TUNING;
const tuned = (over: Partial<Tuning>): Tuning => ({ ...BARE_TUNING, ...over });

describe('cost', () => {
  it('starts at base and rises with every tile ever placed', () => {
    expect(costOf(0, T)).toBe(T.baseCost);
    expect(costOf(T.costRisesEvery - 1, T)).toBe(T.baseCost);
    expect(costOf(T.costRisesEvery, T)).toBe(T.baseCost + 1);
    expect(costOf(T.costRisesEvery * 3, T)).toBe(T.baseCost + 3);
  });

  it('never decreases — the dial does not reset', () => {
    let last = 0;
    for (let p = 0; p < 500; p++) {
      const c = costOf(p, T);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  // "At zero: one last tile, one last harvest." Paying more than you hold floors
  // you at zero rather than being refused, so the grace can only ever happen once.
  it('lets you spend your last tiles on one placement you cannot afford', () => {
    expect(canAfford(1)).toBe(true);
    expect(canAfford(0)).toBe(false);
    expect(payPlacement(2, 5)).toBe(0);
    expect(payPlacement(9, 4)).toBe(5);
  });
});

describe('ripeness', () => {
  it('needs all six sides, and stone and walls count', () => {
    expect(isRipe(ring(tile('green'), SIX(tile('green'))), key(0, 0))).toBe(true);
    expect(isRipe(ring(tile('green'), SIX(STONE)), key(0, 0))).toBe(true);
    expect(isRipe(ring(tile('green'), SIX(WALL)), key(0, 0))).toBe(true);
  });

  it('is false with a single empty side', () => {
    const cells = ring(tile('green'), SIX(tile('green')));
    cells[key(1, 0)] = { kind: 'empty' };
    expect(isRipe(cells, key(0, 0))).toBe(false);
  });

  // Load-bearing: off-map counts as solid, which is why map rims ripen cheapest.
  it('counts the map edge — a lone tile on a one-cell map is ripe', () => {
    expect(isRipe({ [key(0, 0)]: tile('green') }, key(0, 0))).toBe(true);
  });

  // Follows from the edge rule, and is easy to forget when reasoning about
  // harvests: fill a map completely and EVERY tile on it ripens at once.
  it('ripens every tile of a filled map, not just the enclosed ones', () => {
    expect(ripeKeys(ring(tile('green'), SIX(tile('green'))))).toHaveLength(7);
    expect(ripeKeys(ring(tile('green'), SIX(tile('green')), 2))).toEqual([key(0, 0)]);
  });

  it('is never true for stone, walls or empty ground', () => {
    for (const c of [STONE, WALL, { kind: 'empty' } as Cell]) {
      expect(isRipe(ring(c, SIX(WALL)), key(0, 0))).toBe(false);
    }
  });
});

describe('worth', () => {
  it('counts same-coloured live neighbours only', () => {
    expect(worthOf(ring(tile('green'), SIX(tile('green'))), key(0, 0), T)).toBe(6);
    expect(worthOf(ring(tile('green'), SIX(tile('red'))), key(0, 0), T)).toBe(0);
  });

  // The asymmetry the whole design turns on: stone surrounds but never matches,
  // which is what makes each successive harvest cheaper and pushes you onward.
  it('ignores stone and walls even though they make a tile ripe', () => {
    const cells = ring(tile('green'), SIX(STONE));
    expect(isRipe(cells, key(0, 0))).toBe(true);
    expect(worthOf(cells, key(0, 0), T)).toBe(0);
  });

  it('counts partial matches', () => {
    const cells = ring(tile('green'), [
      tile('green'),
      tile('green'),
      tile('red'),
      STONE,
      WALL,
      tile('green'),
    ]);
    expect(worthOf(cells, key(0, 0), T)).toBe(3);
  });
});

// The dial against DESIGN.md's "what is fragile". With it off, a neighbour that
// is already sitting ripe stops paying you, so banking a harvest has a price.
describe('the ripeTilesMatch dial', () => {
  const OFF = tuned({ ripeTilesMatch: false });

  it('changes nothing while no neighbour is ripe', () => {
    const cells = ring(tile('green'), SIX(tile('green')), 2);
    expect(worthOf(cells, key(0, 0), T)).toBe(6);
    expect(worthOf(cells, key(0, 0), OFF)).toBe(6);
  });

  it('stops ripe neighbours paying, so waiting costs worth', () => {
    // Radius 1: every one of the six neighbours is ripe against the map edge.
    const cells = ring(tile('green'), SIX(tile('green')));
    expect(worthOf(cells, key(0, 0), T)).toBe(6);
    expect(worthOf(cells, key(0, 0), OFF)).toBe(0);
  });
});

describe('placement legality', () => {
  it('requires empty ground touching a tile or stone', () => {
    const cells = blankMap(disc(1));
    cells[key(0, 0)] = tile('green');
    expect(canPlaceAt(cells, key(1, 0))).toBe(true);
    expect(canPlaceAt(cells, key(0, 0))).toBe(false); // occupied
  });

  it('does not let walls seed growth', () => {
    const cells = blankMap(disc(2));
    cells[key(0, 0)] = WALL;
    expect(canPlaceAt(cells, key(1, 0))).toBe(false);
  });

  it('lets stone seed growth — a harvested map is still buildable', () => {
    const cells = blankMap(disc(2));
    cells[key(0, 0)] = STONE;
    expect(canPlaceAt(cells, key(1, 0))).toBe(true);
  });

  it('never offers a cell off the map', () => {
    const cells = blankMap(disc(1));
    cells[key(0, 0)] = tile('green');
    expect(canPlaceAt(cells, key(9, 9))).toBe(false);
  });

  it('calls a filled map exhausted, and an open one not', () => {
    expect(isExhausted(ring(tile('green'), SIX(tile('green'))))).toBe(true);
    expect(isExhausted(ring(tile('green'), SIX(tile('green')), 2))).toBe(false);
  });
});

// The preview is computed against the board as it WOULD be, because placing can
// ripen a neighbour and under `ripeTilesMatch: false` that changes the answer.
// A preview that disagrees with the outcome is worse than no preview.
describe('placement preview', () => {
  it('reports what the tile will actually be worth', () => {
    const cells = ring({ kind: 'empty' }, SIX(tile('green')), 2);
    expect(previewWorth(cells, key(0, 0), { colour: 'green', rarity: 'common' }, T)).toBe(6);
    expect(previewWorth(cells, key(0, 0), { colour: 'red', rarity: 'common' }, T)).toBe(0);
  });

  it('accounts for neighbours that the placement itself ripens', () => {
    // Filling the last hole of a radius-1 map ripens all six neighbours at once.
    const cells = ring({ kind: 'empty' }, SIX(tile('green')));
    expect(previewWorth(cells, key(0, 0), { colour: 'green', rarity: 'common' }, T)).toBe(6);
    expect(
      previewWorth(
        cells,
        key(0, 0),
        { colour: 'green', rarity: 'common' },
        tuned({ ripeTilesMatch: false }),
      ),
    ).toBe(0);
  });
});

/**
 * A harvest is LOCAL: it takes the connected ripe pocket you name. Naming one
 * used to be optional, back when a bounded harvest popped the whole board —
 * that went with the bounded world on 2026-08-16, so every price here asks
 * about a specific pocket.
 */
describe('harvest value', () => {
  const stateWith = (cells: Record<string, Cell>): GameState => ({
    ...newRun(1, BARE_TUNING),
    cells,
  });

  /** Empty rim, so only the centre ripens: one pop, worth 6. */
  const ONE = ring(tile('green'), SIX(tile('green')), 2);
  /** No rim at all, so all seven cells ripen: centre worth 6, each rim tile 3. */
  const SEVEN = ring(tile('green'), SIX(tile('green')));

  it('pays one pop what the rules say', () => {
    const one = harvestValue(stateWith(ONE), key(0, 0));
    expect(one.count).toBe(1);
    expect(one.tiles).toBe(T.tilesPerPop + Math.floor(6 / T.worthPerExtraTile));
    expect(one.points).toBe(6 * 1 * 1);
  });

  // The load-bearing claim of the harvest choice: the two payouts sit on
  // different curves, so which one wins moves with harvest size. Seven times the
  // pops pays about four times the tiles but nearly thirty times the points.
  it('pays tiles linearly and points quadratically in harvest size', () => {
    const one = harvestValue(stateWith(ONE), key(0, 0));
    const many = harvestValue(stateWith(SEVEN), key(0, 0));

    expect(many.count).toBe(7);
    expect(many.tiles / one.tiles).toBeLessThan(many.count);
    expect(many.points / one.points).toBeGreaterThan(many.count);
  });

  it('pays nothing when nothing is ripe', () => {
    const cells = blankMap(disc(2));
    cells[key(0, 0)] = tile('green');
    expect(harvestValue(stateWith(cells))).toEqual({
      keys: [],
      count: 0,
      tiles: 0,
      points: 0,
      questPays: false,
      treasure: null,
    });
  });
});
