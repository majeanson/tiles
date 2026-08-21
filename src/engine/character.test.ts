import { describe, expect, it } from 'vitest';
import { BARE_TUNING, TUNING, type Tuning } from '@content/tuning';
import { disc, key, neighbourKeys } from './hex';
import { newRun, reduce, startingPerk } from './reduce';
import { previewWorth, scoreOf, treasureFor, worthOf } from './rules';
import { biomeAt, terrainAt } from './world';
import type { HexKey } from './hex';
import type { Cell, GameState } from './state';

/**
 * Session 8: character. Colour personalities (green crowds, yellow company,
 * red ash, blue tide), biomes as one colour's country, and the hold slot.
 * These pin the arithmetic and the swap; whether any of it makes a placement
 * FEEL like a decision is the phone's question, written in LOG.md.
 */

/** The personalities alone, on the bare skeleton so nothing else interferes. */
const CHAR: Tuning = {
  ...BARE_TUNING,
  greenCrowdBonus: 1,
  yellowCompanyBonus: 1,
  redAshMatches: true,
  blueTideEvery: 6,
};

const tile = (colour: 'green' | 'yellow' | 'red' | 'blue'): Cell => ({ kind: 'tile', colour });

describe('colour personalities', () => {
  it('green crowds: +1 per green neighbour past the first', () => {
    const centre = key(0, 0);
    const cells: Record<HexKey, Cell> = { [centre]: tile('green') };
    neighbourKeys(0, 0)
      .slice(0, 3)
      .forEach((k) => (cells[k] = tile('green')));

    expect(worthOf(cells, centre, CHAR)).toBe(3 + 2);
    expect(worthOf(cells, centre, BARE_TUNING)).toBe(3);
  });

  it('yellow company: +1 per different colour among the neighbours', () => {
    const centre = key(0, 0);
    const cells: Record<HexKey, Cell> = { [centre]: tile('yellow') };
    const around = neighbourKeys(0, 0);
    cells[around[0]!] = tile('red');
    cells[around[1]!] = tile('blue');
    cells[around[2]!] = tile('green');

    // No matches at all — three strangers — and still worth three.
    expect(worthOf(cells, centre, CHAR)).toBe(3);
    expect(worthOf(cells, centre, BARE_TUNING)).toBe(0);

    // A yellow friend joins: one real match on top of the company.
    cells[around[3]!] = tile('yellow');
    expect(worthOf(cells, centre, CHAR)).toBe(4);
  });

  it('red ash: stone counts as a match, for red alone', () => {
    const centre = key(0, 0);
    const cells: Record<HexKey, Cell> = { [centre]: tile('red') };
    const around = neighbourKeys(0, 0);
    cells[around[0]!] = { kind: 'stone' };
    cells[around[1]!] = { kind: 'stone' };

    expect(worthOf(cells, centre, CHAR)).toBe(2);
    expect(worthOf(cells, centre, BARE_TUNING)).toBe(0);

    cells[centre] = tile('blue');
    expect(worthOf(cells, centre, CHAR)).toBe(0);
  });

  it('red ash reaches walls only under the redAshWalls experiment', () => {
    const centre = key(0, 0);
    const cells: Record<HexKey, Cell> = { [centre]: tile('red') };
    const around = neighbourKeys(0, 0);
    cells[around[0]!] = { kind: 'wall' };
    cells[around[1]!] = { kind: 'stone' };

    expect(worthOf(cells, centre, CHAR)).toBe(1);
    expect(worthOf(cells, centre, { ...CHAR, redAshWalls: true })).toBe(2);
  });

  it('yellow company counts every stranger under yellowCompanyAll', () => {
    const centre = key(0, 0);
    const cells: Record<HexKey, Cell> = { [centre]: tile('yellow') };
    const around = neighbourKeys(0, 0);
    cells[around[0]!] = tile('red');
    cells[around[1]!] = tile('red');
    cells[around[2]!] = tile('blue');

    // Distinct colours: two (red, blue). Every stranger: three.
    expect(worthOf(cells, centre, CHAR)).toBe(2);
    expect(worthOf(cells, centre, { ...CHAR, yellowCompanyAll: true })).toBe(3);
  });

  it('blue tide: +1 worth per six hexes from home', () => {
    const far = key(12, 0);
    const cells: Record<HexKey, Cell> = { [far]: tile('blue'), [key(0, 0)]: tile('blue') };

    expect(worthOf(cells, far, CHAR)).toBe(2);
    expect(worthOf(cells, key(0, 0), CHAR)).toBe(0);
    expect(worthOf(cells, far, BARE_TUNING)).toBe(0);
  });

  it('promises exactly what it pays, for every personality', () => {
    // The preview fast path and worthOf share one tally; prove it stays true
    // by previewing each colour on the same spot and then checking the placed
    // board answers the same number.
    const spot = key(7, 0);
    const cells: Record<HexKey, Cell> = { [spot]: { kind: 'empty' } };
    const around = neighbourKeys(7, 0);
    cells[around[0]!] = tile('green');
    cells[around[1]!] = tile('green');
    cells[around[2]!] = { kind: 'stone' };

    for (const colour of ['green', 'yellow', 'red', 'blue'] as const) {
      const promised = previewWorth(cells, spot, { colour, rarity: 'common' }, CHAR);
      const placed = { ...cells, [spot]: tile(colour) };
      expect(worthOf(placed, spot, CHAR)).toBe(promised);
    }
  });
});

describe('biomes', () => {
  it('is a pure lookup, and off in the bounded game', () => {
    for (const h of disc(30)) {
      expect(biomeAt(5, h.q, h.r, TUNING)).toBe(biomeAt(5, h.q, h.r, TUNING));
      expect(biomeAt(5, h.q, h.r, BARE_TUNING)).toBeNull();
    }
  });

  it('colours every field inside a biome with the biome colour', () => {
    let checked = 0;
    for (const h of disc(60)) {
      const biome = biomeAt(9, h.q, h.r, TUNING);
      if (biome === null) continue;
      const ground = terrainAt(9, h.q, h.r, TUNING);
      if (ground.native === null) continue;
      expect(ground.native).toBe(biome);
      checked++;
    }
    // The claim is empty if the disc never crossed a biome's fields.
    expect(checked).toBeGreaterThan(20);
  });

  it('covers a real fraction of the plane and uses more than one colour', () => {
    const seen = new Set<string>();
    let inBiome = 0;
    const all = disc(60);
    for (const h of all) {
      const biome = biomeAt(3, h.q, h.r, TUNING);
      if (biome !== null) {
        inBiome++;
        seen.add(biome);
      }
    }
    expect(inBiome / all.length).toBeGreaterThan(0.3);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the hold slot', () => {
  it('takes the selected card into an empty stash, and the draft shrinks', () => {
    const state = newRun(4, TUNING);
    const first = state.draft[0]!;

    const held = reduce(state, { type: 'HOLD' });
    expect(held.held.at(-1)?.id).toBe(first.id);
    expect(held.draft).toHaveLength(state.draft.length - 1);
    expect(held.selected).toBe(0);
  });

  it('trades with a full stash in place', () => {
    const state = reduce(newRun(4, TUNING), { type: 'HOLD' });
    const stashed = state.held.at(-1)!;
    const facing = state.draft[0]!;

    const swapped = reduce(state, { type: 'HOLD' });
    expect(swapped.held.at(-1)?.id).toBe(facing.id);
    expect(swapped.draft[0]?.id).toBe(stashed.id);
    expect(swapped.draft).toHaveLength(state.draft.length);
  });

  it('keeps the stash through a placement and its reroll', () => {
    const state = reduce(newRun(4, TUNING), { type: 'HOLD' });
    const stashed = state.held.at(-1)!;

    const placed = reduce(state, { type: 'PLACE', hex: key(1, 0) });
    expect(placed.placements).toBe(1);
    expect(placed.draft).toHaveLength(state.tuning.draftWidth);
    expect(placed.held.at(-1)?.id).toBe(stashed.id);
  });

  it('does not exist in the bounded game', () => {
    const state = newRun(4, BARE_TUNING);
    expect(reduce(state, { type: 'HOLD' })).toBe(state);
  });
});

/**
 * M3's roguelite spine: perks that a conquered world pays forward, and the
 * third payout that turns a big pocket into a chosen power.
 */
describe('territory perks', () => {
  it('pays per territory, capped, and nothing when switched off', () => {
    const t = TUNING;
    expect(startingPerk(t, 0)).toBe(0);
    expect(startingPerk(t, 2)).toBe(2 * t.territoryTiles);
    expect(startingPerk(t, 99)).toBe(t.territoryTilesCap);
    expect(startingPerk({ ...t, territoryTiles: 0 }, 5)).toBe(0);
  });

  it('reaches the purse a run actually starts with', () => {
    const plain = newRun(3, TUNING);
    const held = newRun(3, TUNING, ['9,9', '12,4']);
    expect(held.tiles - plain.tiles).toBe(startingPerk(TUNING, 2));
  });
});

describe('the treasure payout', () => {
  const T = { ...TUNING, worldWalls: 0 };

  /** A ripe green row of `size`, walled in stone, on a bare board. */
  const pocket = (state: GameState, size: number): GameState => {
    const cells: Record<HexKey, Cell> = {};
    const members = new Set<HexKey>();
    for (let i = 0; i < size; i++) members.add(key(i, 0));
    for (const k of members) cells[k] = { kind: 'tile', colour: 'green' };
    for (let i = 0; i < size; i++) {
      for (const n of neighbourKeys(i, 0)) if (!members.has(n)) cells[n] = { kind: 'stone' };
    }
    // Open ground two rows out: it touches the stone rim and no member, so the
    // pocket stays ripe AND the run stays alive. Without it the pop is also
    // the end of the expedition, and the ending bonus lands on the points this
    // test is asserting are untouched.
    cells[key(2, 2)] = { kind: 'empty' };
    return { ...state, cells };
  };

  it('offers nothing below the threshold, magic above it, unique at the cap', () => {
    expect(treasureFor(T.treasureNeed - 1, T)).toBeNull();
    expect(treasureFor(T.treasureNeed, T)).toBe('magic');
    expect(treasureFor(T.treasureUnique, T)).toBe('unique');
    // Unbuilt is the honest default: no threshold, no option.
    expect(treasureFor(50, { ...T, treasureNeed: 0 })).toBeNull();
  });

  it('hands the tile to the stash and forfeits both currencies', () => {
    const state = pocket(newRun(5, T), T.treasureNeed);
    const before = { tiles: state.tiles, points: state.points };

    const after = reduce(state, { type: 'HARVEST', choice: 'treasure', at: key(0, 0) });
    expect(after.held.at(-1)?.rarity).toBe('magic');
    expect(after.tiles).toBe(before.tiles);
    expect(after.points).toBe(before.points);
    // And the pocket is spent, exactly like any other harvest.
    expect(after.cells[key(0, 0)]?.kind).toBe('stone');
  });

  it('refuses a pocket too small rather than quietly paying something else', () => {
    const state = pocket(newRun(5, T), T.treasureNeed - 1);
    expect(reduce(state, { type: 'HARVEST', choice: 'treasure', at: key(0, 0) })).toBe(state);
  });

  it('never offers treasure with nowhere to put it — OPEN HAND (holdSlots 0)', () => {
    // Without this guard the reducer writes the tile into `state.held`
    // anyway, and with no stash to show it in it vanishes: a silent total
    // loss of the whole pocket.
    const noHold = { ...T, holdSlots: 0 };
    expect(treasureFor(50, noHold)).toBeNull();
    const state = pocket(newRun(5, noHold), T.treasureNeed);
    expect(reduce(state, { type: 'HARVEST', choice: 'treasure', at: key(0, 0) })).toBe(state);
  });
});

describe('the second stash slot (2026-08-21)', () => {
  // The world's SECOND shrine has always promised "A second stash slot", and
  // until today granted nothing: `applyUnlocks` raised `holdSlots` to 2 while
  // `held` was a single tile and every reader tested it as a boolean. It is
  // the second of five rungs, so nearly every returning player walked to it
  // and received a reward that did not exist.
  const TWO: Tuning = { ...TUNING, holdSlots: 2 };

  it('fills the free slot before it trades anything', () => {
    const state = newRun(4, TWO);
    const first = state.draft[0]!;

    const one = reduce(state, { type: 'HOLD' });
    expect(one.held.map((t) => t.id)).toEqual([first.id]);
    // The draft shrinks until its next reroll — nothing came back.
    expect(one.draft).toHaveLength(state.draft.length - 1);

    const second = one.draft[0]!;
    const two = reduce(one, { type: 'HOLD' });
    expect(two.held.map((t) => t.id)).toEqual([first.id, second.id]);
    expect(two.draft).toHaveLength(one.draft.length - 1);
  });

  it('trades the OLDEST when both slots are full', () => {
    // Marc's call from the option set: the tile you saved most recently is
    // the one you were most deliberately saving, so it is the one that stays.
    let state = reduce(reduce(newRun(4, TWO), { type: 'HOLD' }), { type: 'HOLD' });
    const [oldest, newest] = [state.held[0]!, state.held[1]!];
    const facing = state.draft[state.selected]!;

    state = reduce(state, { type: 'HOLD' });
    // The oldest came back into the hand, where the played card was.
    expect(state.draft[0]?.id).toBe(oldest.id);
    // And the stash holds the survivor plus the newcomer, oldest first.
    expect(state.held.map((t) => t.id)).toEqual([newest.id, facing.id]);
  });

  it('reaches a NAMED slot directly, so two cards are two buttons', () => {
    const state = reduce(reduce(newRun(4, TWO), { type: 'HOLD' }), { type: 'HOLD' });
    const [oldest, newest] = [state.held[0]!, state.held[1]!];
    const facing = state.draft[state.selected]!;

    // Slot 1 is the NEWER tile — tapping its card must return that one, not
    // the one the default rule would have picked.
    const after = reduce(state, { type: 'HOLD', slot: 1 });
    expect(after.draft[0]?.id).toBe(newest.id);
    expect(after.held.map((t) => t.id)).toEqual([oldest.id, facing.id]);
  });

  it('never grows past the slots the world has woken', () => {
    let state = newRun(4, TUNING); // one slot
    state = reduce(state, { type: 'HOLD' });
    state = reduce(state, { type: 'HOLD' });
    state = reduce(state, { type: 'HOLD' });
    expect(state.held).toHaveLength(1);
    expect(TUNING.holdSlots).toBe(1);
  });
});

describe('a scoring pop never scores zero (2026-08-21)', () => {
  it('floors at one point, and leaves every larger pocket alone', () => {
    // `floor(worth × pointsPerPop)` lands on zero for a small pocket, so a
    // stranger's FIRST pop could spend six tiles and be congratulated with
    // "+0 pts" at the moment the loop is being taught.
    expect(scoreOf(1, TUNING)).toBe(1);
    expect(scoreOf(2, TUNING)).toBe(1);
    // Untouched wherever the arithmetic already answered a point or more.
    expect(scoreOf(100, TUNING)).toBe(Math.floor(100 * TUNING.pointsPerPop));
    expect(scoreOf(1000, TUNING)).toBe(Math.floor(1000 * TUNING.pointsPerPop));
    // A pocket genuinely worth nothing still scores nothing — the floor is
    // for rounding, not a gift.
    expect(scoreOf(0, TUNING)).toBe(0);
  });
});
