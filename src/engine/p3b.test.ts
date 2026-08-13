import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { newRun, rarityOdds, reduce } from './reduce';
import { distanceMultiplierAt, previewWorth, worthOf } from './rules';
import type { Cell, GameState, LandmarkReward } from './state';

/**
 * P3b (`ideas/endless-world.md`): destinations and rarity, as structure.
 *
 * These pin the mechanics — a landmark is claimed once and pays what it says,
 * a territory unfurls a field, rarity rolls on its own stream, luck accrues on
 * tiles-harvests. Whether a human WALKS toward a destination, or ever picks a
 * tiles-harvest for the odds, are the two written questions — a phone answers
 * those, not this file.
 */

const ENDLESS = ENDLESS_TUNING;

/**
 * An endless run with rarity off and no walls, so the hand-built landmark
 * walks below cannot be interrupted by a hash wall on one seed and not another.
 */
const CALM: Tuning = { ...ENDLESS, magicChance: 0, uniqueChance: 0, worldWalls: 0 };

/** Plant a landmark next to the arrival clearing and build up to it. */
function withLandmark(
  reward: LandmarkReward,
  tuning: Tuning = CALM,
): { state: GameState; landmark: HexKey } {
  const landmark = key(2, 0);
  const base = newRun(11, tuning);
  const planted: GameState = {
    ...base,
    cells: {
      ...base.cells,
      [landmark]:
        reward === 'territory'
          ? { kind: 'landmark', reward, claimed: false, colour: 'red' }
          : { kind: 'landmark', reward, claimed: false },
    },
  };
  return { state: planted, landmark };
}

describe('reaching a destination', () => {
  it('claims a cache on touch and pays its tiles after the placement cost', () => {
    const { state, landmark } = withLandmark('cache');
    const before = state.tiles;
    const next = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    expect(next.cells[landmark]).toMatchObject({ kind: 'landmark', claimed: true });
    expect(next.tiles).toBe(before - 1 + state.tuning.cachePays);
  });

  it('pays a site through the distance multiplier at its hex', () => {
    const { state, landmark } = withLandmark('site');
    const next = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    expect(next.points).toBe(state.tuning.sitePays * distanceMultiplierAt(landmark, state.tuning));
  });

  it('pays exactly once — a claimed landmark is spent', () => {
    const { state } = withLandmark('cache');
    const once = reduce(state, { type: 'PLACE', hex: key(1, 0) });
    const spentAt = once.tiles;

    // A second tile against the same landmark pays nothing but the cost.
    const again = reduce(once, { type: 'PLACE', hex: key(2, -1) });
    expect(again.placements).toBe(once.placements + 1);
    expect(again.tiles).toBe(spentAt - 1);
  });

  it('unfurls a territory into a native field, now and for later reveals', () => {
    const { state, landmark } = withLandmark('territory');
    const next = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    expect(next.cells[landmark]).toMatchObject({ claimed: true, colour: 'red' });
    // Already-revealed open ground inside the radius turned native on the spot…
    const inside = Object.entries(next.cells).filter(
      ([, c]) => c.kind === 'empty' && c.native === 'red',
    );
    expect(inside.length).toBeGreaterThan(0);
    // …and ground revealed afterwards gets the same answer at reveal time:
    // grow toward the far side of the territory and check the fresh cells.
    let grown = next;
    for (const hex of [key(1, -1), key(2, -1)]) {
      if (grown.cells[hex]?.kind === 'empty') grown = reduce(grown, { type: 'PLACE', hex });
    }
    const fresh = Object.entries(grown.cells).filter(
      ([k, c]) => next.cells[k] === undefined && c.kind === 'empty' && c.native === 'red',
    );
    expect(fresh.length).toBeGreaterThan(0);
  });

  it('treats a landmark as solid ground: unbuildable, surrounding, never matching', () => {
    const { state, landmark } = withLandmark('cache');
    // Not a legal placement.
    expect(reduce(state, { type: 'PLACE', hex: landmark })).toBe(state);

    // It surrounds for ripeness and contributes no worth, like a wall.
    const centre = key(10, 10);
    const cells: Record<HexKey, Cell> = { ...state.cells };
    cells[centre] = { kind: 'tile', colour: 'green' };
    neighbourKeys(10, 10).forEach((k, i) => {
      cells[k] =
        i === 0 ? { kind: 'landmark', reward: 'cache', claimed: false } : { kind: 'stone' };
    });
    expect(worthOf(cells, centre, state.tuning)).toBe(0);
  });
});

describe('rarity in the draft', () => {
  it('rolls every drawn tile magic at certainty odds', () => {
    const state = newRun(3, { ...ENDLESS, magicChance: 1, uniqueChance: 0 });
    for (const tile of state.draft) expect(tile.rarity).toBe('magic');
  });

  it('draws no rarity at all in the bounded game — same colours, untouched stream', () => {
    const state = newRun(3, TUNING);
    for (const tile of state.draft) expect(tile.rarity).toBe('common');
    expect(state.rng.loot.cursor).toBe(0);
  });

  it('lets a magic tile match every colour, both ways', () => {
    const t = TUNING;
    const a = key(0, 0);
    const b = key(1, 0);
    const cells: Record<HexKey, Cell> = {
      [a]: { kind: 'tile', colour: 'green', rarity: 'magic' },
      [b]: { kind: 'tile', colour: 'red' },
    };
    expect(worthOf(cells, a, t)).toBe(1);
    expect(worthOf(cells, b, t)).toBe(1);
  });

  it('counts a unique tile double, both ways, and in the preview', () => {
    const t = TUNING;
    const a = key(0, 0);
    const b = key(1, 0);
    const cells: Record<HexKey, Cell> = {
      [a]: { kind: 'tile', colour: 'green', rarity: 'unique' },
      [b]: { kind: 'tile', colour: 'green' },
    };
    expect(worthOf(cells, a, t)).toBe(2);
    expect(worthOf(cells, b, t)).toBe(2);

    const spot = key(0, 1);
    const open: Record<HexKey, Cell> = { ...cells, [spot]: { kind: 'empty' } };
    expect(previewWorth(open, spot, { colour: 'green', rarity: 'unique' }, t)).toBe(4);
  });
});

describe('luck', () => {
  /** A ripe two-tile green pocket walled in stone, away from the clearing. */
  function pocket(state: GameState): { state: GameState; at: HexKey } {
    const a = key(10, 10);
    const b = key(11, 10);
    const cells: Record<HexKey, Cell> = { ...state.cells };
    cells[a] = { kind: 'tile', colour: 'green' };
    cells[b] = { kind: 'tile', colour: 'green' };
    for (const k of [...neighbourKeys(10, 10), ...neighbourKeys(11, 10)]) {
      if (k !== a && k !== b) cells[k] = { kind: 'stone' };
    }
    return { state: { ...state, cells }, at: a };
  }

  it('accrues on tiles-harvests, not on points-harvests, and caps', () => {
    const { state, at } = pocket(newRun(5, CALM));

    const asPoints = reduce(state, { type: 'HARVEST', choice: 'points', at });
    expect(asPoints.luck).toBe(0);

    const asTiles = reduce(state, { type: 'HARVEST', choice: 'tiles', at });
    expect(asTiles.luck).toBe(2);

    const capped = reduce(
      { ...state, luck: state.tuning.luckCap },
      { type: 'HARVEST', choice: 'tiles', at },
    );
    expect(capped.luck).toBe(state.tuning.luckCap);
  });

  it('raises the odds the draft actually rolls with', () => {
    const base = rarityOdds(ENDLESS, 0);
    const lucky = rarityOdds(ENDLESS, ENDLESS.luckCap);
    expect(lucky.magic).toBeGreaterThan(base.magic);
    expect(lucky.unique).toBeGreaterThan(base.unique);
  });
});
