import { describe, expect, it } from 'vitest';
import { decodeRun, encodeRun } from '@meta/save';
import { TUNING, type Tuning } from '@content/tuning';
import { key, parse } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { harvestMultiplier, harvestValue, legalPlacements, ripeKeys } from '@engine/rules';
import type { GameState } from '@engine/state';
import { destinationsWithin, findAt } from '@engine/world';
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

  // POP · N READY counts decisions on the board, not tiles — a 12-tile
  // pocket and a 2-tile one are each one thing to choose between.
  it('counts ripe POCKETS, not ripe tiles', () => {
    const full = fill(newRun(11, TINY));
    const hud = toHudView(full);
    expect(hud.pocketsReady).toBeGreaterThan(0);
    expect(hud.pocketsReady).toBeLessThanOrEqual(hud.ripeCount);
  });

  // The number the single-payout POP button prints in place of the points
  // figure it used to leak regardless of `hidePoints` — it has to be the
  // SAME multiplier the reducer would actually pay, not a restatement.
  it('prices the depth of the pocket the harvest buttons are pointing at', () => {
    const full = fill(newRun(11, TINY));
    const hud = toHudView(full);
    expect(hud.harvestAt).not.toBeNull();
    if (hud.harvestAt === null) return;
    const value = harvestValue(full, hud.harvestAt);
    expect(hud.harvestDepth).toBe(harvestMultiplier(full, value.keys));
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

  // What-still-glows (2026-08-18): the end screen's own version of the
  // signpost — same nearest destination, same words, but the distance is
  // past the run's OWN edge rather than from home, which is what "still
  // glows" means once the run is over. Null while the run lives.
  it('names the nearest unreached destination past the run’s edge, only when the run has ended', () => {
    const { state } = seeded();
    const live = toHudView(state);
    expect(live.glowBeyondEdge).toBeNull();

    const ended: GameState = { ...state, phase: 'ended', death: 'broke' };
    const hud = toHudView(ended);
    expect(hud.glowBeyondEdge).toMatch(/still glows \d+ past your edge\./);
  });

  it('shows the odds, and says nothing where there is no rarity to have', () => {
    expect(toHudView(newRun(1, TUNING)).odds).toMatch(/magic .+ unique/);
    const plain = tuned({ magicChance: 0, uniqueChance: 0 });
    expect(toHudView(newRun(1, plain)).odds).toBeNull();
  });
});

describe('the torch', () => {
  /**
   * Marc, 2026-08-16: "whats our next steps for visuals?" — and then chose
   * real light and dark first, with one rule attached: DIM, NEVER HIDDEN.
   * The falloff curve itself is tested in `theme/tokens.test.ts`; what is
   * checked here is that the board hands the renderer the right distances,
   * from the right place, and never hands it a hex it cannot read.
   */
  const LIGHT = { radius: 2, fade: 8, floor: 0.4 };

  it('centres the light on the last thing you built', () => {
    const start = newRun(5, TINY);
    const spot = legalPlacements(start.cells)[0];
    if (spot === undefined) throw new Error('nowhere to build');
    const after = reduce(start, { type: 'PLACE', hex: spot });
    expect(after.lastPlaced).toBe(spot);

    const at = (key: string, view: ReturnType<typeof toBoardView>): number =>
      view.cells.find((c) => c.key === key)?.light ?? -1;

    const view = toBoardView(after, null, null, [], LIGHT);
    expect(at(spot, view)).toBe(1);
  });

  it('opens a fresh run lit, rather than dark until you earn a frame', () => {
    const view = toBoardView(newRun(5, TINY), null, null, [], LIGHT);
    expect(view.cells.find((c) => c.key === key(0, 0))?.light).toBe(1);
  });

  it('dims with distance, and never past the floor', () => {
    // Grow the plane first: a fresh run has revealed only the clearing, and a
    // torch cannot be shown falling off across ground that does not exist yet.
    const grown = fill(newRun(5, TINY));
    const torch = grown.lastPlaced === null ? { q: 0, r: 0 } : parse(grown.lastPlaced);
    const far = toBoardView(grown, null, null, [], LIGHT).cells.filter(
      (c) =>
        Math.max(
          Math.abs(c.q - torch.q),
          Math.abs(c.r - torch.r),
          Math.abs(torch.q - c.q + torch.r - c.r),
        ) > 4,
    );
    expect(far.length).toBeGreaterThan(0);
    for (const cell of far) {
      expect(cell.light).toBeLessThan(1);
      expect(cell.light).toBeGreaterThanOrEqual(LIGHT.floor);
    }
  });

  it('never dims anything to nothing, however far out the board runs', () => {
    // The rule Marc set, as a test: atmosphere may not cost a player
    // information, so there is no distance at which a hex stops being legible.
    const view = toBoardView(newRun(5, TINY), null, null, [], LIGHT);
    for (const cell of view.cells) expect(cell.light).toBeGreaterThan(0);
  });

  it('is flat where a direction asks for no falloff', () => {
    const view = toBoardView(newRun(5, TINY));
    for (const cell of view.cells) expect(cell.light).toBe(1);
  });
});

describe('a run saved before the torch existed', () => {
  /**
   * The black screen of 2026-08-16, from the side that actually broke.
   *
   * `lastPlaced` shipped without a fill in `decodeRun`, so every saved run
   * decoded with it absent — and absent is not null. The guard meant to catch
   * "no torch yet" let it through to `parse`, which threw on the first frame
   * and took the whole render with it. `save.test.ts` pins the decoding;
   * this pins that the board survives it either way.
   */
  it('still draws, with the torch back at the origin', () => {
    const raw = JSON.parse(encodeRun(newRun(4, TINY))) as Record<string, unknown>;
    delete raw['lastPlaced'];
    const older = decodeRun(JSON.stringify(raw));
    expect(older).not.toBeNull();
    if (older === null) return;

    const view = toBoardView(older, null, null, [], { radius: 2, fade: 8, floor: 0.4 });
    expect(view.cells.length).toBeGreaterThan(0);
    expect(view.cells.find((c) => c.key === key(0, 0))?.light).toBe(1);
  });

  it('survives a state whose field is missing outright, not merely null', () => {
    // Belt and braces: even if a future decoder forgets to fill it, the view
    // must not be the thing that dies. This is the guard that was missing.
    const raw = JSON.parse(encodeRun(newRun(4, TINY))) as Record<string, unknown>;
    delete raw['lastPlaced'];
    expect(() => toBoardView(raw as unknown as GameState)).not.toThrow();
  });
});

describe('what a previewed cell still says about itself', () => {
  /**
   * Marc, 2026-08-16: "when were hovering a red, we cant see the red terrain
   * underneath." The ghost surface REPLACED the ground, so the native field —
   * the colour and the symbol saying whose ground this is — vanished at
   * exactly the moment you were deciding whether to use it. The ghost was
   * hiding the reason for its own number.
   *
   * The fix is in the renderer, which draws the ghost over the ground rather
   * than instead of it, and whether that reads is a phone question. What is
   * checkable here is the contract underneath it: a cell being previewed must
   * still REPORT its native colour, or there would be nothing for the renderer
   * to draw through.
   */
  it('keeps its native colour while the preview is on it', () => {
    // Grow past the clearing: the origin and its ring are forced open ground,
    // so a fresh run has no native field revealed to preview onto yet.
    const state = fill(newRun(5, tuned({ worldWalls: 0, fieldChance: 1, fieldSize: 2 })));
    const view = toBoardView(state);

    const previewed = view.cells.filter((c) => c.legal && c.preview !== null && c.preview > 0);
    const native = view.cells.filter((c) => c.kind === 'empty' && c.native !== null);
    expect(native.length).toBeGreaterThan(0);

    // Every previewed cell still carries whatever the ground under it is.
    for (const cell of previewed) {
      expect(cell).toHaveProperty('native');
      expect(cell.kind).toBe('empty');
    }
  });

  it('reports preview and native on the same cell, so both can be drawn', () => {
    // The case Marc hit: ground native to a colour, with a tile in hand that
    // pays there. Both facts have to survive to the renderer at once.
    // Grow past the clearing: the origin and its ring are forced open ground,
    // so a fresh run has no native field revealed to preview onto yet.
    const state = fill(newRun(5, tuned({ worldWalls: 0, fieldChance: 1, fieldSize: 2 })));
    const both = toBoardView(state).cells.filter(
      (c) => c.native !== null && c.preview !== null && c.preview > 0,
    );
    for (const cell of both) {
      expect(cell.native).not.toBeNull();
      expect(cell.preview).toBeGreaterThan(0);
    }
  });
});

describe('the shimmer', () => {
  /**
   * Hidden finds never beacon. The one thing `findSense` (KEEN NOSE) buys is
   * this: an unrevealed find within sense range of the board's ground draws
   * as a dim glow that says SOMETHING is there — landmark null, no glyph for
   * the renderer to print, nothing to tap into an action.
   */
  const SENSED = tuned({
    findEvery: 2,
    findChance: 1,
    findSense: 3,
    worldWalls: 0,
    destinationChance: 0,
  });

  it('draws nothing at all while the sense is zero', () => {
    const blind = { ...SENSED, findSense: 0 };
    const view = toBoardView(newRun(5, blind));
    expect(view.cells.some((c) => c.shimmer)).toBe(false);
  });

  it('glows over near finds, wordlessly, and only over finds', () => {
    const state = newRun(5, SENSED);
    const shimmers = toBoardView(state).cells.filter((c) => c.shimmer);
    expect(shimmers.length).toBeGreaterThan(0);

    for (const cell of shimmers) {
      // The whole message is "something is near": no glyph, no kind, no tap.
      expect(cell.landmark).toBeNull();
      expect(cell.legal).toBe(false);
      expect(cell.beacon).toBe(false);
      // Every shimmer stands over a real find, off the board, in range.
      expect(findAt(state.rootSeed, cell.q, cell.r, SENSED)).not.toBeNull();
      expect(state.cells[cell.key]).toBeUndefined();
      const near = Object.keys(state.cells).some(
        (k) => distanceTo(parse(k), cell) <= SENSED.findSense,
      );
      expect(near).toBe(true);
    }
  });

  it('never glows past the sense range', () => {
    const state = newRun(5, SENSED);
    for (const cell of toBoardView(state).cells.filter((c) => c.shimmer)) {
      const nearest = Math.min(...Object.keys(state.cells).map((k) => distanceTo(parse(k), cell)));
      expect(nearest).toBeLessThanOrEqual(SENSED.findSense);
    }
  });

  const distanceTo = (a: { q: number; r: number }, b: { q: number; r: number }): number =>
    Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
});
