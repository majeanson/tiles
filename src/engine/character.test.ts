import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, TUNING, type Tuning } from '@content/tuning';
import { disc, key, neighbourKeys } from './hex';
import { newRun, reduce } from './reduce';
import { previewWorth, worthOf } from './rules';
import { biomeAt, terrainAt } from './world';
import type { HexKey } from './hex';
import type { Cell } from './state';

/**
 * Session 8: character. Colour personalities (green crowds, yellow company,
 * red ash, blue tide), biomes as one colour's country, and the hold slot.
 * These pin the arithmetic and the swap; whether any of it makes a placement
 * FEEL like a decision is the phone's question, written in LOG.md.
 */

/** The personalities alone, on the bounded base so nothing else interferes. */
const CHAR: Tuning = {
  ...TUNING,
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
    expect(worthOf(cells, centre, TUNING)).toBe(3);
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
    expect(worthOf(cells, centre, TUNING)).toBe(0);

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
    expect(worthOf(cells, centre, TUNING)).toBe(0);

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
    expect(worthOf(cells, far, TUNING)).toBe(0);
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
      expect(biomeAt(5, h.q, h.r, ENDLESS_TUNING)).toBe(biomeAt(5, h.q, h.r, ENDLESS_TUNING));
      expect(biomeAt(5, h.q, h.r, TUNING)).toBeNull();
    }
  });

  it('colours every field inside a biome with the biome colour', () => {
    let checked = 0;
    for (const h of disc(60)) {
      const biome = biomeAt(9, h.q, h.r, ENDLESS_TUNING);
      if (biome === null) continue;
      const ground = terrainAt(9, h.q, h.r, ENDLESS_TUNING);
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
      const biome = biomeAt(3, h.q, h.r, ENDLESS_TUNING);
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
    const state = newRun(4, ENDLESS_TUNING);
    const first = state.draft[0]!;

    const held = reduce(state, { type: 'HOLD' });
    expect(held.held?.id).toBe(first.id);
    expect(held.draft).toHaveLength(state.draft.length - 1);
    expect(held.selected).toBe(0);
  });

  it('trades with a full stash in place', () => {
    const state = reduce(newRun(4, ENDLESS_TUNING), { type: 'HOLD' });
    const stashed = state.held!;
    const facing = state.draft[0]!;

    const swapped = reduce(state, { type: 'HOLD' });
    expect(swapped.held?.id).toBe(facing.id);
    expect(swapped.draft[0]?.id).toBe(stashed.id);
    expect(swapped.draft).toHaveLength(state.draft.length);
  });

  it('keeps the stash through a placement and its reroll', () => {
    const state = reduce(newRun(4, ENDLESS_TUNING), { type: 'HOLD' });
    const stashed = state.held!;

    const placed = reduce(state, { type: 'PLACE', hex: key(1, 0) });
    expect(placed.placements).toBe(1);
    expect(placed.draft).toHaveLength(state.tuning.draftWidth);
    expect(placed.held?.id).toBe(stashed.id);
  });

  it('does not exist in the bounded game', () => {
    const state = newRun(4, TUNING);
    expect(reduce(state, { type: 'HOLD' })).toBe(state);
  });
});
