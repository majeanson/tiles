import { COLOURS, type Colour } from '@content/tuning';
import { distance, key, parse, type HexKey } from '@engine/hex';
import { canLeave, rarityOdds } from '@engine/reduce';
import {
  canPlaceAt,
  canPlaceNow,
  costOf,
  harvestValue,
  isRipe,
  legalPlacements,
  placementsLeft,
  previewWorth,
  ripeClusterAt,
  ripeClusters,
  ripeKeys,
  worthOf,
} from '@engine/rules';
import type { GameState, LandmarkReward, Rarity } from '@engine/state';
import { destinationAt, destinationsWithin, terrainAt } from '@engine/world';
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

export function toBoardView(
  state: GameState,
  harvestAt: HexKey | null = null,
  spotlight: Colour | null = null,
  memory: readonly HexKey[] = [],
): BoardView {
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
      remembered: false,
      ripe: isRipe(state.cells, k),
      targeted: targeted.has(k),
      // The colour lens: with a chip active, every OTHER colour's tiles step
      // back so one colour's holdings read as a single shape on the board.
      dimmed: spotlight !== null && cell.kind === 'tile' && cell.colour !== spotlight,
      worth: worthOf(state.cells, k, state.tuning),
      legal,
      preview:
        legal && selected !== undefined
          ? previewWorth(state.cells, k, selected, state.tuning)
          : null,
    };
  });

  // Ground this WORLD remembers from earlier runs (P4a), drawn faint under
  // everything: terrain re-derived from the same pure hash that made it, so
  // only the keys had to be kept. It is scenery and a map, never playable —
  // this run still has to grow its own way out there.
  const onBoard = new Set(Object.keys(state.cells));
  for (const k of memory) {
    if (onBoard.has(k)) continue;
    const { q, r } = parse(k);
    const ground = terrainAt(state.rootSeed, q, r, state.tuning);
    const dest = destinationAt(state.rootSeed, q, r, state.tuning);
    cells.push({
      key: k,
      q,
      r,
      kind: dest !== null ? 'landmark' : ground.wall ? 'wall' : 'empty',
      colour: dest?.colour ?? null,
      landmark: dest?.reward ?? null,
      claimed: dest !== null && state.claimed.includes(k),
      beacon: false,
      remembered: true,
      rarity: null,
      native: dest === null ? ground.native : null,
      ripe: false,
      targeted: false,
      dimmed: false,
      worth: 0,
      legal: false,
      preview: null,
    });
  }

  // Destinations the board has not grown to yet, glowing through ground that
  // is not drawn: the endless world's somewhere-to-go. The horizon moves with
  // reach, so the next glow appears at the rim as you push toward the last.
  for (const d of beaconsFor(state)) {
    if (onBoard.has(key(d.q, d.r))) continue;
    cells.push({
      key: key(d.q, d.r),
      q: d.q,
      r: d.r,
      kind: 'landmark',
      colour: d.colour,
      landmark: d.reward,
      claimed: state.claimed.includes(key(d.q, d.r)),
      beacon: true,
      remembered: false,
      rarity: null,
      native: null,
      ripe: false,
      targeted: false,
      dimmed: false,
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
  /**
   * Placements the clock still allows, or null where there is no clock. The
   * number that makes leftover tiles worthless, so it is on screen from the
   * first second rather than sprung at the end.
   */
  readonly left: number | null;
  /**
   * True when the purse already holds more tiles than the clock can spend —
   * so a tiles-harvest buys literally nothing and points are the only thing
   * left to want. Marc found this state on the board with 202 tiles and 167
   * placements left: the mechanism was working exactly as designed and the
   * game never said a word about it.
   */
  readonly tilesSpare: boolean;

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

  /**
   * The colour lens: each colour's standing holdings on the board, in the
   * exact unit the points formula sums — worth. What the chips print, and
   * what the active chip expands into a calculation.
   */
  readonly colours: readonly ColourPotential[];
  /** The chip currently held down, with its numbers. Null when none. */
  readonly spotlight: ColourPotential | null;

  readonly ripeCount: number;
  /** What harvesting right now would pay, each way. Both are always shown. */
  readonly harvestTiles: number;
  readonly harvestPoints: number;
  /** The pocket those prices are FOR, on the plane. Null on bounded maps. */
  readonly harvestAt: HexKey | null;

  /**
   * True when taking the priced pocket as POINTS collects the standing
   * bounty. The points button wears it, because a reason to press a button
   * belongs on the button.
   */
  readonly questPays: boolean;
  /** The bounty in play, as one sentence. Null when there is none. */
  readonly questLine: string | null;

  /**
   * The rare tile the priced pocket would yield as TREASURE, or null when it
   * is too small or the third payout is not unlocked. The button only exists
   * when this does.
   */
  readonly harvestTreasure: Rarity | null;
  /** Luck a BURN would pay for the priced pocket; 0 where burning is off. */
  readonly harvestBurn: number;
  /**
   * True when a pop pays tiles and scores with no choice to make — the
   * tiles-only run. The points button stops existing rather than sitting
   * there meaning the same thing as its neighbour.
   */
  readonly singlePayout: boolean;

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
  /**
   * The run, summarised for its end screen — Gate D's arc made visible.
   * `biggestAt` is where the run's biggest harvest landed as a fraction of
   * its length: near 1 is an arc, near 0.5 is a plateau, and the player
   * seeing that number is the gate's own question asked of every run.
   * Null while the run lives.
   */
  readonly summary: {
    readonly biggestHarvest: number;
    readonly biggestAt: number;
    readonly claims: number;
    readonly quests: number;
    readonly luck: number;
    /** Gate B's subject, for this run: how the harvests were cashed. */
    readonly harvests: number;
    readonly tilesTaken: number;
    readonly pointsTaken: number;
  } | null;
};

export function toHudView(
  state: GameState,
  harvestAt: HexKey | null = null,
  spotlight: Colour | null = null,
): HudView {
  const endless = state.tuning.world === 'endless';
  const target = resolveHarvestTarget(state, harvestAt);
  const value = endless ? harvestValue(state, target ?? undefined) : harvestValue(state);
  const leaving = canLeave(state);
  const best = bestDraftIndex(state);
  const colours = colourPotentials(state);

  return {
    tiles: state.tiles,
    points: state.points,
    mapNumber: state.mapNumber,
    depthLabel: endless ? 'REACH' : 'MAP',
    depthValue: endless ? reachOf(state) : state.mapNumber,
    cost: costOf(state.placements, state.tuning),
    placements: state.placements,
    left: placementsLeft(state),
    tilesSpare: tilesSpareIn(state),

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

    colours,
    spotlight: colours.find((c) => c.colour === spotlight) ?? null,

    ripeCount: ripeKeys(state.cells).length,
    harvestTiles: value.tiles,
    harvestPoints: value.points,
    harvestAt: target,

    questPays: value.questPays,
    questLine: questLineFor(state),
    harvestTreasure: value.treasure,
    harvestBurn: state.tuning.burnLuck > 0 ? value.count * state.tuning.burnLuck : 0,
    singlePayout: state.tuning.singlePayout,

    canHarvest: state.phase === 'placing' && value.count > 0,
    canLeave: leaving,
    leaveHint: leaving ? 'Move on' : 'Harvest here first',

    guide: guideFor(state),
    hint: hintFor(state),
    odds: oddsFor(state),

    ended: state.phase === 'ended',
    epitaph: state.phase === 'ended' ? epitaphFor(state) : null,
    summary: state.phase === 'ended' ? summariseRun(state) : null,
  };
}

/** The end screen's numbers, from the log the engine already keeps. */
function summariseRun(state: GameState): NonNullable<HudView['summary']> {
  let biggestHarvest = 0;
  let biggestPlacement = 0;
  let tilesTaken = 0;
  let pointsTaken = 0;
  for (const h of state.log.harvests) {
    if (h.choice === 'tiles') tilesTaken++;
    else pointsTaken++;
    if (h.points > biggestHarvest) {
      biggestHarvest = h.points;
      biggestPlacement = h.at;
    }
  }

  let claims = 0;
  for (const cell of Object.values(state.cells)) {
    if (cell.kind === 'landmark' && cell.claimed) claims++;
  }

  return {
    biggestHarvest,
    biggestAt: state.placements === 0 ? 0 : biggestPlacement / state.placements,
    claims,
    quests: state.log.questsDone,
    luck: state.luck,
    harvests: state.log.harvests.length,
    tilesTaken,
    pointsTaken,
  };
}

/**
 * One colour's holdings, counted in the unit the points formula sums.
 *
 * `worth` is the truthful "potential points by colour": a points harvest
 * pays summed worth × pocket size × the multiplier, and worth is the only
 * term a colour owns. The split into ripe and still-growing says how much of
 * that potential is cashable right now versus still being set up.
 */
export type ColourPotential = {
  readonly colour: Colour;
  /** Live tiles of this colour on the board. */
  readonly count: number;
  /** Their summed worth — the colour's standing investment. */
  readonly worth: number;
  /**
   * How much of that worth the colour's own POWER earned — crowds, company,
   * ash or tide — versus plain matching. Measured, not estimated: the same
   * board is re-tallied with the personalities switched off and the
   * difference is the power's take. This is what makes each colour's tip its
   * own; the payout formula itself is one channel for everyone, by design.
   */
  readonly bonus: number;
  readonly ripeCount: number;
  /** The worth already sitting ripe, cashable in the next pop. */
  readonly ripeWorth: number;
};

function colourPotentials(state: GameState): ColourPotential[] {
  const t = state.tuning;
  const plain = {
    ...t,
    greenCrowdBonus: 0,
    yellowCompanyBonus: 0,
    redAshMatches: false,
    blueTideEvery: 0,
  };

  const acc = new Map<
    Colour,
    { count: number; worth: number; bonus: number; ripeCount: number; ripeWorth: number }
  >(COLOURS.map((c) => [c, { count: 0, worth: 0, bonus: 0, ripeCount: 0, ripeWorth: 0 }]));
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind !== 'tile') continue;
    const entry = acc.get(cell.colour);
    if (entry === undefined) continue;
    const worth = worthOf(state.cells, k, t);
    entry.count++;
    entry.worth += worth;
    entry.bonus += worth - worthOf(state.cells, k, plain);
    if (isRipe(state.cells, k)) {
      entry.ripeCount++;
      entry.ripeWorth += worth;
    }
  }
  return COLOURS.map((colour) => ({ colour, ...acc.get(colour)! }));
}

/** The standing bounty, as one sentence with its distance from home. */
function questLineFor(state: GameState): string | null {
  const quest = state.quest;
  if (quest === null) return null;
  const out = distance(parse(quest.at), { q: 0, r: 0 });
  return `BOUNTY ${out} out: pop ${quest.need}+ within ${quest.radius} of it as pts → ×${quest.bonus}`;
}

/**
 * The one-clause "what now". Danger first, then the bounty being collectable
 * right now, then the harvest moment, then the default loop. Deliberately
 * never more than a sentence: this is the line a player reads to reorient,
 * not a tutorial.
 *
 * "Low on tiles" is measured in RUNWAY, not in a flat tile count: how many
 * more placements the purse buys at today's cost, against how many the board
 * needs to ripen anything. Marc's first debrief said survival always felt
 * forced; a warning that fires while three comfortable placements remain is
 * a warning that teaches fear rather than danger. See `RUNWAY_ALARM`.
 */
function guideFor(state: GameState): string | null {
  if (state.phase !== 'placing') return null;

  const ripe = ripeKeys(state.cells).length > 0;
  if (runwayOf(state) <= RUNWAY_ALARM) {
    return ripe
      ? 'Low on tiles — cash a pocket as tiles'
      : 'Low on tiles — ripen something to cash in';
  }
  if (ripe) {
    const value = harvestValue(state, resolveHarvestTarget(state, null) ?? undefined);
    if (value.questPays) return 'BOUNTY READY — take this pocket as pts';
    // More tiles than the clock can spend: the survival button is dead and
    // saying so is the whole job of this line.
    if (tilesSpareIn(state)) return 'More tiles than you can spend — take PTS from here on';
    return state.tuning.world === 'endless'
      ? 'Pocket ready — tap it, then take tiles or pts'
      : 'Ripe — harvest, or keep building it bigger';
  }
  return 'Place tiles — surround one on all six sides to ripen it';
}

/**
 * Placements the purse still buys at today's cost. The honest unit for
 * danger: ten tiles is a fortune at cost 1 and a death sentence at cost 5.
 */
export const runwayOf = (state: GameState): number =>
  Math.floor(state.tiles / Math.max(1, costOf(state.placements, state.tuning)));

/**
 * Does the purse already hold more than the clock can ever spend?
 *
 * The remaining placements cost at least `cost` each — more later, as the
 * curve climbs — so `left × cost` is the CHEAPEST the rest of the expedition
 * can possibly be. Holding more than that means a tiles-harvest buys nothing
 * at all, and the game should say so rather than leave a dead button looking
 * exactly like a live one.
 */
function tilesSpareIn(state: GameState): boolean {
  const left = placementsLeft(state);
  if (left === null) return false;
  return state.tiles > left * costOf(state.placements, state.tuning);
}

/**
 * Runway at which the guide line starts saying "low".
 *
 * Six placements is about one pocket's worth of building — the point at
 * which you genuinely cannot start something new and finish it. The old
 * threshold (three times the cost, i.e. three placements) fired so late it
 * was useless as a warning, while the FEELING of scarcity ran the whole
 * game; this fires when scarcity is real and stays quiet when it is not.
 */
const RUNWAY_ALARM = 6;

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
  if (state.death === 'spent') {
    const unripe = Object.values(state.cells).filter((c) => c.kind === 'tile').length;
    return (
      `The expedition is over — ${state.placements} placements spent. ` +
      (unripe > 0
        ? `${unripe} tile${unripe === 1 ? '' : 's'} left standing, never cashed.`
        : `Everything you built was cashed.`)
    );
  }
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
