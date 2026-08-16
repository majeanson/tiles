import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { key } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { legalPlacements, ripeKeys } from '@engine/rules';
import type { GameState } from '@engine/state';
import { destinationsWithin } from '@engine/world';
import { toBoardView, toHudView } from './view';

/**
 * The selector is where the UI could start disagreeing with the engine — a
 * preview that promises 4 and a placement that pays 3. Everything shown is
 * derived from the same rules the reducer uses, and these check that it stays
 * that way without needing a canvas or a phone.
 */

const tuned = (over: Partial<Tuning>): Tuning => ({ ...TUNING, ...over });
/** No terrain in the way, so a view test is about the view. */
const TINY = tuned({ worldWalls: 0, destinationChance: 0 });

function fill(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 500 && s.phase === 'placing'; i++) {
    const spot = legalPlacements(s.cells)[0];
    if (spot === undefined) return s;
    s = reduce(s, { type: 'PLACE', hex: spot });
  }
  return s;
}

describe('the board view', () => {
  it('shows every cell of the map exactly once', () => {
    const s = newRun(1, TINY);
    const view = toBoardView(s);
    expect(view.cells).toHaveLength(Object.keys(s.cells).length);
    expect(new Set(view.cells.map((c) => c.key)).size).toBe(view.cells.length);
  });

  it('marks exactly the cells the rules would accept', () => {
    const s = newRun(1);
    const legal = toBoardView(s)
      .cells.filter((c) => c.legal)
      .map((c) => c.key);
    expect(legal.sort()).toEqual(legalPlacements(s.cells).sort());
  });

  // Money and room are different failures that look identical on the board. A
  // hex you cannot pay for must not invite a tap.
  it('offers nothing once the tiles run out', () => {
    const broke = fill(newRun(1, tuned({ startingTiles: 3 })));
    expect(broke.tiles).toBe(0);
    expect(toBoardView(broke).cells.some((c) => c.legal)).toBe(false);
  });

  /**
   * The load-bearing one. The number on an empty hex before you tap it must be
   * the number the tile is worth after you do — that preview IS the game's
   * moment-to-moment feedback, and a preview that lies is worse than none.
   */
  it('previews exactly what placing there will pay', () => {
    const s = newRun(4);
    for (const cell of toBoardView(s).cells) {
      if (!cell.legal || cell.preview === null) continue;
      const after = reduce(s, { type: 'PLACE', hex: cell.key });
      const placed = toBoardView(after).cells.find((c) => c.key === cell.key);
      expect(placed?.worth).toBe(cell.preview);
    }
  });

  it('follows the selected tile rather than a fixed colour', () => {
    // Seeded so the draft holds at least two different colours; without that
    // there is nothing for switching selection to change.
    const s = newRun(4);
    const first = s.draft[0];
    const other = s.draft.findIndex((t) => t.colour !== first?.colour);
    expect(other).toBeGreaterThan(0);

    const previews = (index: number): (number | null)[] =>
      toBoardView(reduce(s, { type: 'SELECT', index }))
        .cells.filter((c) => c.legal)
        .map((c) => c.preview);

    expect(previews(other)).not.toEqual(previews(0));
  });

  it('flags ripe tiles with their worth', () => {
    const full = fill(newRun(11, TINY));
    const ripe = toBoardView(full).cells.filter((c) => c.ripe);
    expect(ripe.map((c) => c.key).sort()).toEqual(ripeKeys(full.cells).sort());
    expect(ripe.every((c) => c.kind === 'tile' && c.colour !== null)).toBe(true);
  });

  it('reports stone as stone, so the player can see their own wake', () => {
    const full = fill(newRun(11, TINY));
    const at = ripeKeys(full.cells)[0];
    if (at === undefined) throw new Error('nothing ripened');
    const spent = reduce(full, { type: 'HARVEST', choice: 'tiles', at });
    expect(toBoardView(spent).cells.map((c) => c.kind)).toContain('stone');
  });
});

describe('the hud', () => {
  it('reports the run in the engine own numbers', () => {
    const s = reduce(newRun(5), { type: 'PLACE', hex: key(1, 0) });
    const hud = toHudView(s);
    expect(hud.tiles).toBe(s.tiles);
    expect(hud.points).toBe(s.points);
    expect(hud.placements).toBe(1);
  });

  // Gate D: the end screen names the cause of death in one sentence.
  it('writes an epitaph only once the run is over', () => {
    const alive = toHudView(newRun(1));
    expect(alive.ended).toBe(false);
    expect(alive.epitaph).toBeNull();

    const broke = fill({ ...newRun(11, TINY), tiles: 2 });
    const dead = broke;
    const hud = toHudView(dead);
    expect(hud.ended).toBe(true);
    expect(hud.epitaph).toMatch(/out of tiles/i);
    expect(hud.epitaph).toContain(String(dead.placements));
  });
});

/**
 * P3b on screen: the somewhere-to-go has to be VISIBLE to be a question. The
 * beacon set is exactly the destinations inside the horizon that growth has
 * not reached, the hint names the nearest one, and the odds line surfaces the
 * loot system only where it exists.
 */
describe('destinations and rarity in the view', () => {
  // A seed whose nearest destination sits inside the starting horizon, found
  // once rather than assumed, so the assertions below are about the VIEW.
  const seeded = (): { seed: number; state: GameState } => {
    for (let seed = 1; seed <= 200; seed++) {
      if (destinationsWithin(seed, TUNING.beaconHorizon, TUNING).length > 0) {
        return { seed, state: newRun(seed, TUNING) };
      }
    }
    throw new Error('no seed with a close destination in 200 tries');
  };

  it('draws unrevealed destinations as beacons, and only those', () => {
    const { seed, state } = seeded();
    const horizon = TUNING.beaconHorizon;
    const expected = destinationsWithin(seed, horizon, TUNING)
      .map((d) => key(d.q, d.r))
      .sort();

    const beacons = toBoardView(state).cells.filter((c) => c.beacon);
    expect(beacons.map((c) => c.key).sort()).toEqual(expected);
    for (const b of beacons) {
      expect(b.kind).toBe('landmark');
      expect(b.legal).toBe(false);
    }
  });

  it('says where to go, in words, with a distance', () => {
    const hud = toHudView(seeded().state);
    expect(hud.hint).toMatch(/glows \d+ out/);
  });

  it('shows the odds, and says nothing where there is no rarity to have', () => {
    expect(toHudView(newRun(1, TUNING)).odds).toMatch(/magic .+ unique/);
    const plain = tuned({ magicChance: 0, uniqueChance: 0 });
    expect(toHudView(newRun(1, plain)).odds).toBeNull();
  });
});
