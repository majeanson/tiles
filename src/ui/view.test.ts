import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { key } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { legalPlacements, ripeKeys } from '@engine/rules';
import type { GameState } from '@engine/state';
import { toBoardView, toHudView } from './view';

/**
 * The selector is where the UI could start disagreeing with the engine — a
 * preview that promises 4 and a placement that pays 3. Everything shown is
 * derived from the same rules the reducer uses, and these check that it stays
 * that way without needing a canvas or a phone.
 */

const tuned = (over: Partial<Tuning>): Tuning => ({ ...TUNING, ...over });
const TINY = tuned({ mapBaseRadius: 1, mapMaxRadius: 1 });

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
    const s = newRun(1);
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

  it('reports stone as stone, so the player can see why a map is spent', () => {
    const spent = reduce(fill(newRun(11, TINY)), { type: 'HARVEST', choice: 'points' });
    const kinds = toBoardView(spent).cells.map((c) => c.kind);
    expect(kinds).toContain('stone');
    expect(kinds).not.toContain('tile');
  });
});

describe('the hud', () => {
  it('reports the run in the engine own numbers', () => {
    const s = reduce(newRun(5), { type: 'PLACE', hex: key(1, 0) });
    const hud = toHudView(s);
    expect(hud.tiles).toBe(s.tiles);
    expect(hud.points).toBe(s.points);
    expect(hud.mapNumber).toBe(s.mapNumber);
    expect(hud.placements).toBe(1);
  });

  // Both payouts are on screen at all times: the choice is only a choice if you
  // can see what you are giving up.
  it('prices both payouts before either is taken', () => {
    const full = fill(newRun(11, TINY));
    const hud = toHudView(full);
    expect(hud.canHarvest).toBe(true);
    expect(hud.harvestTiles).toBeGreaterThan(0);
    expect(hud.harvestPoints).toBeGreaterThan(0);

    expect(reduce(full, { type: 'HARVEST', choice: 'tiles' }).tiles).toBe(
      full.tiles + hud.harvestTiles,
    );
    expect(reduce(full, { type: 'HARVEST', choice: 'points' }).points).toBe(
      full.points + hud.harvestPoints,
    );
  });

  // A dead control teaches nothing. This one states the rule at the only moment
  // the player cares about it.
  it('explains why leaving is refused instead of just greying out', () => {
    const fresh = toHudView(newRun(21, TINY));
    expect(fresh.canLeave).toBe(false);
    expect(fresh.leaveHint).toMatch(/harvest/i);

    const cashed = toHudView(reduce(fill(newRun(21, TINY)), { type: 'HARVEST', choice: 'points' }));
    expect(cashed.canLeave).toBe(true);
  });

  // Gate D: the end screen names the cause of death in one sentence.
  it('writes an epitaph only once the run is over', () => {
    const alive = toHudView(newRun(1));
    expect(alive.ended).toBe(false);
    expect(alive.epitaph).toBeNull();

    const dead = reduce(fill(newRun(11, tuned({ ...TINY, startingTiles: 6 }))), {
      type: 'HARVEST',
      choice: 'points',
    });
    const hud = toHudView(dead);
    expect(hud.ended).toBe(true);
    expect(hud.epitaph).toMatch(/out of tiles/i);
    expect(hud.epitaph).toContain(String(dead.placements));
  });
});
