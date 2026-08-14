import type { Colour } from '@content/tuning';
import { distance, key, parse, type HexKey } from '@engine/hex';
import { canLeave, rarityOdds } from '@engine/reduce';
import {
  canPlaceAt,
  canPlaceNow,
  costOf,
  harvestValue,
  isRipe,
  legalPlacements,
  previewWorth,
  ripeClusterAt,
  ripeClusters,
  ripeKeys,
  worthOf,
} from '@engine/rules';
import type { GameState, LandmarkReward, Rarity } from '@engine/state';
import { destinationsWithin } from '@engine/world';
import type { BoardView, CellKind, CellView } from '@render/Renderer';

/**
 * State to screen, as one pure function.
 *
 * Everything the player is shown is derived here, so the UI cannot invent a
 * number the engine disagrees with — the classic version of that bug is a
 * preview that says 4 and a placement that pays 3. It is also the only reason
 * any of this is testable: the interesting question is "does the board show the
 * right thing", and answering it needs no canvas and no phone.
 */

/**
 * The pocket the harvest buttons are pricing, on the endless world.
 *
 * A tapped ripe tile targets its own cluster; with no tap (or a stale one that
 * has since been popped) the biggest pocket is the default, so the buttons are
 * never dead while anything is ripe. `null` on bounded maps, where a harvest
 * is the whole board and there is nothing to single out.
 */
export function resolveHarvestTarget(state: GameState, asked: HexKey | null): HexKey | null {
  if (state.tuning.world !== 'endless') return null;
  if (asked !== null && isRipe(state.cells, asked)) return asked;

  let best: HexKey[] | null = null;
  for (const pocket of ripeClusters(state.cells)) {
    if (best === null || pocket.length > best.length) best = pocket;
  }
  return best?.[0] ?? null;
}

export function toBoardView(state: GameState, harvestAt: HexKey | null = null): BoardView {
  const selected = state.draft[state.selected];
  const placeable = canPlaceNow(state);

  const target = resolveHarvestTarget(state, harvestAt);
  const targeted = new Set(target === null ? [] : ripeClusterAt(state.cells, target));

  const cells: CellView[] = Object.entries(state.cells).map(([k, cell]) => {
    const { q, r } = parse(k);
    const legal = placeable && canPlaceAt(state.cells, k);

    return {
      key: k,
      q,
      r,
      kind: cell.kind satisfies CellKind,
      colour: cell.kind === 'tile' || cell.kind === 'landmark' ? (cell.colour ?? null) : null,
      landmark: cell.kind === 'landmark' ? cell.reward : null,
      claimed: cell.kind === 'landmark' && cell.claimed,
      beacon: false,
      rarity: cell.kind === 'tile' ? (cell.rarity ?? null) : null,
      native: cell.kind === 'empty' ? (cell.native ?? null) : null,
      ripe: isRipe(state.cells, k),
      targeted: targeted.has(k),
      worth: worthOf(state.cells, k, state.tuning),
      legal,
      preview:
        legal && selected !== undefined
          ? previewWorth(state.cells, k, selected, state.tuning)
          : null,
    };
  });

  // Destinations the board has not grown to yet, glowing through ground that
  // is not drawn: the endless world's somewhere-to-go. The horizon moves with
  // reach, so the next glow appears at the rim as you push toward the last.
  for (const d of beaconsFor(state)) {
    cells.push({
      key: key(d.q, d.r),
      q: d.q,
      r: d.r,
      kind: 'landmark',
      colour: d.colour,
      landmark: d.reward,
      claimed: false,
      beacon: true,
      rarity: null,
      native: null,
      ripe: false,
      targeted: false,
      worth: 0,
      legal: false,
      preview: null,
    });
  }

  return { cells };
}

/** Destinations within the beacon horizon that growth has not revealed yet. */
function beaconsFor(
  state: GameState,
): { q: number; r: number; reward: LandmarkReward; colour: Colour | null }[] {
  if (state.tuning.world !== 'endless') return [];
  const horizon = reachOf(state) + state.tuning.beaconHorizon;
  return destinationsWithin(state.rootSeed, horizon, state.tuning).filter(
    (d) => state.cells[key(d.q, d.r)] === undefined,
  );
}

/**
 * Everything outside the board: the run's numbers, and which buttons are live.
 *
 * The disabled reasons are text rather than booleans because a control that is
 * simply dead teaches nothing. "Harvest here first" is the rule being explained
 * at the only moment the player cares about it, which is the whole tutorial
 * budget this game gets.
 */
export type HudView = {
  readonly tiles: number;
  readonly points: number;
  readonly mapNumber: number;
  /**
   * The third stat is depth, and depth means a different thing per world:
   * MAP <n> on bounded maps, REACH <hexes from home> on the plane.
   */
  readonly depthLabel: string;
  readonly depthValue: number;
  readonly cost: number;
  readonly placements: number;

  /** Bounded only. The plane has no LEAVE, so the button has no reason to exist. */
  readonly showLeave: boolean;

  /**
   * `colour` is the engine's `Colour`, not a string: the chrome looks up the
   * direction's name for it (`CRYPT`) and its CSS variable, and both of those are
   * exhaustive maps that a stray string would silently miss.
   */
  readonly draft: readonly {
    readonly id: string;
    readonly colour: Colour;
    readonly rarity: Rarity;
    readonly selected: boolean;
    /**
     * The card whose best placement pays the most right now. The UI taking a
     * decision off the player's plate: you still choose, but you never have
     * to audit three cards to find out which one is worth looking at.
     */
    readonly best: boolean;
  }[];

  /** Whether the stash exists at all (`tuning.holdSlots > 0`). */
  readonly canHold: boolean;
  /** The stashed tile, or null while the stash sits empty. */
  readonly held: { readonly colour: Colour; readonly rarity: Rarity } | null;

  readonly ripeCount: number;
  /** What harvesting right now would pay, each way. Both are always shown. */
  readonly harvestTiles: number;
  readonly harvestPoints: number;
  /** The pocket those prices are FOR, on the plane. Null on bounded maps. */
  readonly harvestAt: HexKey | null;

  readonly canHarvest: boolean;
  readonly canLeave: boolean;
  readonly leaveHint: string;

  /**
   * What to do right now, in one clause — the reorientation line. Always
   * present while the run lives, so a player coming back mid-run reads one
   * sentence instead of re-deriving the state of the board.
   */
  readonly guide: string | null;
  /**
   * The nearest unclaimed destination, as one short sentence — the endless
   * world's answer to "where do I go?". Null when there is nothing to say,
   * which includes the whole bounded game.
   */
  readonly hint: string | null;
  /**
   * The draft's current rarity odds, spelled out — Marc asked for the odds to
   * be visible, and luck raising them is only a reward if you can watch it.
   */
  readonly odds: string | null;

  readonly ended: boolean;
  /** Gate D: the cause of death, in one sentence. */
  readonly epitaph: string | null;
};

export function toHudView(state: GameState, harvestAt: HexKey | null = null): HudView {
  const endless = state.tuning.world === 'endless';
  const target = resolveHarvestTarget(state, harvestAt);
  const value = endless ? harvestValue(state, target ?? undefined) : harvestValue(state);
  const leaving = canLeave(state);
  const best = bestDraftIndex(state);

  return {
    tiles: state.tiles,
    points: state.points,
    mapNumber: state.mapNumber,
    depthLabel: endless ? 'REACH' : 'MAP',
    depthValue: endless ? reachOf(state) : state.mapNumber,
    cost: costOf(state.placements, state.tuning),
    placements: state.placements,

    showLeave: !endless,

    draft: state.draft.map((tile, i) => ({
      id: tile.id,
      colour: tile.colour,
      rarity: tile.rarity,
      selected: i === state.selected,
      best: i === best,
    })),

    canHold: state.tuning.holdSlots > 0,
    held: state.held === null ? null : { colour: state.held.colour, rarity: state.held.rarity },

    ripeCount: ripeKeys(state.cells).length,
    harvestTiles: value.tiles,
    harvestPoints: value.points,
    harvestAt: target,

    canHarvest: state.phase === 'placing' && value.count > 0,
    canLeave: leaving,
    leaveHint: leaving ? 'Move on' : 'Harvest here first',

    guide: guideFor(state),
    hint: hintFor(state),
    odds: oddsFor(state),

    ended: state.phase === 'ended',
    epitaph: state.phase === 'ended' ? epitaphFor(state) : null,
  };
}

/**
 * The one-clause "what now". Danger first, then the harvest moment, then the
 * default loop. Deliberately never more than a sentence: this is the line a
 * player reads to reorient, not a tutorial.
 */
function guideFor(state: GameState): string | null {
  if (state.phase !== 'placing') return null;

  const ripe = ripeKeys(state.cells).length > 0;
  const cost = costOf(state.placements, state.tuning);
  if (state.tiles <= cost * 3) {
    return ripe
      ? 'Low on tiles — cash a pocket as tiles'
      : 'Low on tiles — ripen something to cash in';
  }
  if (ripe) {
    return state.tuning.world === 'endless'
      ? 'Pocket ready — tap it, then take tiles or pts'
      : 'Ripe — harvest, or keep building it bigger';
  }
  return 'Place tiles — surround one on all six sides to ripen it';
}

/**
 * The nearest unclaimed destination — revealed or beacon — named and priced
 * in the one unit the player already reads the board in: hexes out.
 */
function hintFor(state: GameState): string | null {
  if (state.tuning.world !== 'endless') return null;

  let best: { reward: LandmarkReward; dist: number } | null = null;
  const consider = (q: number, r: number, reward: LandmarkReward): void => {
    const dist = distance({ q, r }, { q: 0, r: 0 });
    if (best === null || dist < best.dist) best = { reward, dist };
  };

  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind === 'landmark' && !cell.claimed) {
      const { q, r } = parse(k);
      consider(q, r, cell.reward);
    }
  }
  const horizon = reachOf(state) + state.tuning.beaconHorizon;
  for (const d of destinationsWithin(state.rootSeed, horizon, state.tuning)) {
    if (state.cells[key(d.q, d.r)] === undefined) consider(d.q, d.r, d.reward);
  }

  if (best === null) return null;
  const { reward, dist } = best as { reward: LandmarkReward; dist: number };
  const named =
    reward === 'cache'
      ? `a cache of ${state.tuning.cachePays} tiles`
      : reward === 'site'
        ? 'a scoring site'
        : 'a territory to claim';
  return `${named[0]!.toUpperCase()}${named.slice(1)} glows ${dist} out`;
}

/**
 * Which draft card's best placement pays the most, or null when nothing pays
 * anything — a marker on every draw would be noise, and a tie at zero is not
 * a recommendation. Derived from the same previews the board shows, so the
 * marked card and the lit-up hexes can never disagree.
 */
function bestDraftIndex(state: GameState): number | null {
  if (!canPlaceNow(state)) return null;
  const spots = legalPlacements(state.cells);

  let best: { index: number; worth: number } | null = null;
  state.draft.forEach((tile, index) => {
    for (const k of spots) {
      const worth = previewWorth(state.cells, k, tile, state.tuning);
      if (best === null || worth > best.worth) best = { index, worth };
    }
  });
  return best !== null && (best as { worth: number }).worth > 0
    ? (best as { index: number }).index
    : null;
}

/** "magic 6% · unique 1.2%", or null while the rarity system is off. */
function oddsFor(state: GameState): string | null {
  const odds = rarityOdds(state.tuning, state.luck);
  if (odds.magic + odds.unique <= 0) return null;
  const pct = (v: number): string => {
    const p = v * 100;
    return `${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10}%`;
  };
  return `magic ${pct(odds.magic)} · unique ${pct(odds.unique)}`;
}

/** Hexes from home the run has built — the plane's depth, drawn in the HUD. */
function reachOf(state: GameState): number {
  let reach = 0;
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind !== 'tile' && cell.kind !== 'stone') continue;
    reach = Math.max(reach, distance(parse(k), { q: 0, r: 0 }));
  }
  return reach;
}

/**
 * Gate D wants the end screen to name the cause of death in one sentence. The
 * sentence's job is to say WHY it happened — the cost of a placement having
 * climbed past what the board could pay back is the whole arc of a run, and it
 * should be the last thing the player reads.
 */
function epitaphFor(state: GameState): string {
  if (state.death === 'walled') {
    return `Walled in after ${state.placements} placements — nowhere left to build, nothing left to pop.`;
  }
  const cost = costOf(state.placements, state.tuning);
  const where = state.tuning.world === 'endless' ? 'on the plane' : `on map ${state.mapNumber}`;
  return (
    `Out of tiles ${where}, after ${state.placements} placements. ` +
    `They cost ${cost} each by the end.`
  );
}
