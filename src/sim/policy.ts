import { distance, key, parse, type HexKey } from '@engine/hex';
import { canLeave } from '@engine/reduce';
import { rngInt, rngPick, type RngStream } from '@engine/rng';
import {
  canPlaceNow,
  isExhausted,
  legalPlacements,
  previewWorth,
  ripeClusters,
  ripeKeys,
} from '@engine/rules';
import type { Action, GameState } from '@engine/state';
import { destinationsWithin } from '@engine/world';

/**
 * Scripted players.
 *
 * A policy is a pure function from a board to a move. That is the whole point:
 * the engine already runs headless at full speed, so the only thing standing
 * between us and Gate C ("the economy closes") is someone to press the buttons
 * a hundred thousand times.
 *
 * These are not AI and are not meant to play well. They are meant to be
 * LEGIBLE — each one is a single strategy stated in one sentence, so that when
 * two of them land in the same place we can say why.
 *
 * A move is a list of actions rather than one, because choosing a tile and
 * placing it is a single decision that happens to be two reducer steps.
 */
export type Move = readonly Action[];

export type Policy = {
  readonly name: string;
  /** The strategy, in one sentence. If it needs two, it is two policies. */
  readonly note: string;
  decide(state: GameState, stream: RngStream): [Move, RngStream];
};

/**
 * Every (draft index, hex) pair the rules currently allow.
 *
 * Empty when the run cannot afford a placement, so that every policy below
 * falls through to harvesting without having to remember to check. Forgetting
 * that check is what deadlocked this harness on its first run: the board still
 * offered sixty legal-looking hexes, and none of them could be paid for.
 */
function options(state: GameState): { index: number; hex: string; worth: number }[] {
  if (!canPlaceNow(state)) return [];
  const spots = legalPlacements(state.cells);
  const out: { index: number; hex: string; worth: number }[] = [];
  for (let index = 0; index < state.draft.length; index++) {
    const tile = state.draft[index];
    if (tile === undefined) continue;
    for (const hex of spots) {
      out.push({ index, hex, worth: previewWorth(state.cells, hex, tile, state.tuning) });
    }
  }
  return out;
}

const placeMove = (index: number, hex: string): Move => [
  { type: 'SELECT', index },
  { type: 'PLACE', hex },
];

/** The best-packing placement available, ties broken by board order. */
function bestPlacement(state: GameState): Move | null {
  let best: { index: number; hex: string; worth: number } | null = null;
  for (const o of options(state)) {
    if (best === null || o.worth > best.worth) best = o;
  }
  return best === null ? null : placeMove(best.index, best.hex);
}

/**
 * The harvests on offer, one move per pocket.
 *
 * On a bounded board a harvest is the whole board, so there is at most one. On
 * the endless plane every connected ripe cluster is its own harvest with its
 * own price, and WHICH pocket is part of the decision — so each gets a move.
 */
function harvestMoves(state: GameState, choice: 'tiles' | 'points'): Move[] {
  if (state.tuning.world !== 'endless') {
    return ripeKeys(state.cells).length > 0 ? [[{ type: 'HARVEST', choice }]] : [];
  }
  return ripeClusters(state.cells).map((pocket) => [{ type: 'HARVEST', choice, at: pocket[0]! }]);
}

/** How big the biggest single harvest available is. Zero when nothing is ripe. */
function biggestHarvestSize(state: GameState): number {
  if (state.tuning.world !== 'endless') return ripeKeys(state.cells).length;
  return ripeClusters(state.cells).reduce((n, pocket) => Math.max(n, pocket.length), 0);
}

/** The biggest harvest available: the whole board, or the largest pocket. */
function biggestHarvest(state: GameState, choice: 'tiles' | 'points'): Move | null {
  if (state.tuning.world !== 'endless') {
    return ripeKeys(state.cells).length > 0 ? [{ type: 'HARVEST', choice }] : null;
  }
  let best: HexKey[] | null = null;
  for (const pocket of ripeClusters(state.cells)) {
    if (best === null || pocket.length > best.length) best = pocket;
  }
  return best?.[0] === undefined ? null : [{ type: 'HARVEST', choice, at: best[0] }];
}

/** The smallest harvest available — what you cash when protecting a big one. */
function smallestHarvest(state: GameState, choice: 'tiles' | 'points'): Move | null {
  if (state.tuning.world !== 'endless') {
    return ripeKeys(state.cells).length > 0 ? [{ type: 'HARVEST', choice }] : null;
  }
  let least: HexKey[] | null = null;
  for (const pocket of ripeClusters(state.cells)) {
    if (least === null || pocket.length < least.length) least = pocket;
  }
  return least?.[0] === undefined ? null : [{ type: 'HARVEST', choice, at: least[0] }];
}

/** How far from home the run has built, in hexes. The endless world's depth. */
function reachOf(state: GameState): number {
  let reach = 0;
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind !== 'tile' && cell.kind !== 'stone') continue;
    reach = Math.max(reach, distance(parse(k), { q: 0, r: 0 }));
  }
  return reach;
}

/**
 * The legal spot farthest from home, carrying whichever draft tile does the
 * most work there. How a policy walks outward on purpose.
 */
function farthestPlacement(state: GameState): Move | null {
  let best: { index: number; hex: string; dist: number; worth: number } | null = null;
  for (const o of options(state)) {
    const dist = distance(parse(o.hex), { q: 0, r: 0 });
    if (best === null || dist > best.dist || (dist === best.dist && o.worth > best.worth)) {
      best = { ...o, dist };
    }
  }
  return best === null ? null : placeMove(best.index, best.hex);
}

/**
 * Take tiles when the run is in danger, points when it is not.
 *
 * The threshold is expressed in PLACEMENTS of runway rather than in tiles,
 * because the cost of a placement climbs all run — "ten tiles left" means
 * something different on map one and map eight.
 */
function cashChoice(state: GameState, runway: number): 'tiles' | 'points' {
  const cost = state.tuning.baseCost + Math.floor(state.placements / state.tuning.costRisesEvery);
  return state.tiles < cost * runway ? 'tiles' : 'points';
}

/**
 * The null policy, and the one Gate C names: uniformly random among legal moves.
 *
 * It exists to fail. If random play survives to any depth, the economy is not
 * making the player do anything, and no amount of tuning the other policies
 * would have told us that.
 */
export const randomLegal: Policy = {
  name: 'random-legal',
  note: 'Picks uniformly among every legal move. Must die early or the game is not asking anything.',
  decide(state, stream) {
    const moves: Move[] = options(state).map((o) => placeMove(o.index, o.hex));
    moves.push(...harvestMoves(state, 'tiles'), ...harvestMoves(state, 'points'));
    if (canLeave(state)) moves.push([{ type: 'LEAVE' }]);
    if (moves.length === 0) return [[], stream];
    return rngPick(stream, moves);
  },
};

/**
 * Fill the map completely, cash it in, then move on.
 *
 * The design's "farmer": near-perfect ripening and a long run, but every
 * placement spent here makes every later placement dearer, so they should
 * arrive at deep maps expensive and die rich and shallow.
 */
export const farm: Policy = {
  name: 'farm',
  note: 'Packs until it cannot place, then cashes everything it can. Long runs, expensive placements.',
  decide(state, stream) {
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    const cash = biggestHarvest(state, cashChoice(state, 8));
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
};

/**
 * Harvest the instant anything ripens, then leave.
 *
 * The design's "rusher": terrible efficiency, but they reach high map
 * multipliers while placements are still cheap. If farm and rush score
 * comparably by these opposite routes, Gate C's third clause is met.
 */
export const rush: Policy = {
  name: 'rush',
  note: 'Chases the multiplier first: leaves at once on bounded maps, sprints outward then farms on the plane.',
  decide(state, stream) {
    if (state.tuning.world === 'endless') {
      // The beeline probe from ideas/endless-world.md: walk three multiplier
      // steps out, THEN build. A pure beeline can never ripen anything — an arm
      // encloses nothing — so the sprint has to stop somewhere to pay at all.
      if (biggestHarvestSize(state) >= 3) {
        return [biggestHarvest(state, cashChoice(state, 4)) ?? [], stream];
      }
      const sprinting = reachOf(state) < state.tuning.distanceStep * 3;
      const place = sprinting ? farthestPlacement(state) : bestPlacement(state);
      if (place !== null) return [place, stream];
      return [biggestHarvest(state, cashChoice(state, 4)) ?? [], stream];
    }

    if (canLeave(state)) return [[{ type: 'LEAVE' }], stream];
    if (ripeKeys(state.cells).length > 0) {
      return [[{ type: 'HARVEST', choice: cashChoice(state, 4) }], stream];
    }
    const place = bestPlacement(state);
    return [place ?? [], stream];
  },
};

/**
 * Bank everything, harvest once, never early.
 *
 * This is the line DESIGN.md is afraid of. Points go with the SQUARE of harvest
 * size, so one huge harvest should beat several small ones, and if hoard simply
 * wins then rule 5's timing decision is fake and `ripeTilesMatch` needs turning
 * off. That comparison is the harness's first real job.
 */
export const hoard: Policy = {
  name: 'hoard',
  note: 'Never harvests until the map is full, then takes points. The suspected dominant line.',
  decide(state, stream) {
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    const cash = biggestHarvest(state, 'points');
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
};

/**
 * Harvest every time a few tiles are ripe, and stay for the whole map.
 *
 * hoard's opposite number on the one axis that matters: WHEN, holding where and
 * how long fixed. If these two score the same, harvest timing does not matter.
 */
export const trickle: Policy = {
  name: 'trickle',
  note: 'Cashes any harvest of three or more the moment it exists, but packs like a farmer otherwise.',
  decide(state, stream) {
    if (biggestHarvestSize(state) >= 3) {
      return [biggestHarvest(state, cashChoice(state, 8)) ?? [], stream];
    }
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    const cash = biggestHarvest(state, cashChoice(state, 8));
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
};

/**
 * The giant-cluster probe from `ideas/endless-world.md`: if banking survives on
 * the endless plane, it survives HERE — sustain on small pockets taken as
 * tiles, protect the biggest one, and cash it as points once it reaches the
 * threshold. The threshold IS the timing decision, so it comes in sizes: if
 * bigger is simply always better, local harvest did not fix rule 5's fake
 * timing, it only moved it. An interior optimum is the signature of a real
 * decision.
 */
const bankAt = (threshold: number): Policy => ({
  name: `bank${threshold}`,
  note: `Feeds on small harvests as tiles, and cashes the biggest as points once it reaches ${threshold}.`,
  decide(state, stream) {
    if (biggestHarvestSize(state) >= threshold) {
      return [biggestHarvest(state, 'points') ?? [], stream];
    }
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    const cash = smallestHarvest(state, 'tiles');
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
});

export const bank3 = bankAt(3);
export const bank15 = bankAt(15);
export const bank40 = bankAt(40);
/** The overshoot: a pocket this size is never built before the money runs out. */
export const bank80 = bankAt(80);

/**
 * The nearest destination not yet claimed, revealed or still over the horizon.
 * What a destination-aware policy walks toward. Null when the system is off.
 */
function nearestDestination(state: GameState): { q: number; r: number } | null {
  if (state.tuning.world !== 'endless') return null;
  const horizon = reachOf(state) + state.tuning.beaconHorizon;

  let best: { q: number; r: number; dist: number } | null = null;
  for (const d of destinationsWithin(state.rootSeed, horizon, state.tuning)) {
    const cell = state.cells[key(d.q, d.r)];
    if (cell?.kind === 'landmark' && cell.claimed) continue;
    const dist = distance(d, { q: 0, r: 0 });
    if (best === null || dist < best.dist) best = { ...d, dist };
  }
  return best;
}

/**
 * The best-packing placement, drifting toward `goal` on near-ties: among the
 * spots within one worth of the best, the one that closes the most ground.
 *
 * The drift is deliberately this weak because the first cut was not: a seeker
 * that simply walked at the beacon starved at 66 placements with one harvest —
 * an arm encloses nothing, the same lesson the beeline exploit taught in P1.
 * Following a destination has to be a lean on ordinary play, not a replacement
 * for it, and that is true for the human too.
 */
function placementToward(state: GameState, goal: { q: number; r: number }): Move | null {
  let bestWorth = -1;
  for (const o of options(state)) bestWorth = Math.max(bestWorth, o.worth);
  if (bestWorth < 0) return null;

  let best: { index: number; hex: string; gap: number; worth: number } | null = null;
  for (const o of options(state)) {
    if (o.worth < bestWorth - 1) continue;
    const gap = distance(parse(o.hex), goal);
    if (best === null || gap < best.gap || (gap === best.gap && o.worth > best.worth)) {
      best = { ...o, gap };
    }
  }
  return best === null ? null : placeMove(best.index, best.hex);
}

/**
 * P3b's question given hands: leans toward the nearest destination while
 * playing bank15's line — feed on small pockets as tiles, cash the big one as
 * points. If seeker cannot at least keep up with bank15, the destinations are
 * decoration and the harness has said so before any human is asked to care.
 */
export const seeker: Policy = {
  name: 'seeker',
  note: 'Banks a 15-pocket while drifting placement toward the nearest destination.',
  decide(state, stream) {
    if (biggestHarvestSize(state) >= 15) {
      return [biggestHarvest(state, 'points') ?? [], stream];
    }
    const goal = nearestDestination(state);
    const place = goal === null ? bestPlacement(state) : placementToward(state, goal);
    if (place !== null) return [place, stream];
    const cash = smallestHarvest(state, 'tiles');
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
};

/**
 * A farmer who never scores. Survival is worth nothing on its own, so this
 * should live a long time and finish near zero — the control that proves points
 * and tiles are not secretly the same currency.
 */
export const survivor: Policy = {
  name: 'survivor',
  note: 'Always takes tiles, never points. Should live longest and score nothing.',
  decide(state, stream) {
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    const cash = biggestHarvest(state, 'tiles');
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
};

/**
 * Places without looking at colour at all.
 *
 * The floor for skill expression: everything else here packs deliberately, and
 * the gap between this and `farm` is what "how well the player packs" is worth
 * in points. If that gap is small, the game has no skill in it.
 */
export const blind: Policy = {
  name: 'blind',
  note: 'Places in the first legal spot, ignoring colour. The no-skill floor to measure against.',
  decide(state, stream) {
    const first = canPlaceNow(state) ? legalPlacements(state.cells)[0] : undefined;
    if (first !== undefined) {
      const [index, next] = rngInt(stream, state.draft.length);
      return [placeMove(index, first), next];
    }
    const cash = biggestHarvest(state, cashChoice(state, 8));
    if (cash !== null) return [cash, stream];
    return [canLeave(state) ? [{ type: 'LEAVE' }] : [], stream];
  },
};

export const POLICIES: readonly Policy[] = [
  randomLegal,
  blind,
  rush,
  farm,
  hoard,
  trickle,
  bank3,
  bank15,
  bank40,
  bank80,
  seeker,
  survivor,
];

export const policyByName = (name: string): Policy | undefined =>
  POLICIES.find((p) => p.name === name);

/** Exported for the runner's stall check; `isExhausted` is the interesting half. */
export const stuckOnMap = (state: GameState): boolean =>
  isExhausted(state.cells) && ripeKeys(state.cells).length === 0;
