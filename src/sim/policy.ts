import { canLeave } from '@engine/reduce';
import { rngInt, rngPick, type RngStream } from '@engine/rng';
import { canPlaceNow, isExhausted, legalPlacements, previewWorth, ripeKeys } from '@engine/rules';
import type { Action, GameState } from '@engine/state';

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
      out.push({ index, hex, worth: previewWorth(state.cells, hex, tile.colour, state.tuning) });
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
    if (ripeKeys(state.cells).length > 0) {
      moves.push([{ type: 'HARVEST', choice: 'tiles' }], [{ type: 'HARVEST', choice: 'points' }]);
    }
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
  note: 'Packs every map full before harvesting. Long runs, expensive placements, shallow depth.',
  decide(state, stream) {
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    if (ripeKeys(state.cells).length > 0) {
      return [[{ type: 'HARVEST', choice: cashChoice(state, 8) }], stream];
    }
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
  note: 'Harvests the moment anything ripens and leaves at once. Poor value per map, high multipliers.',
  decide(state, stream) {
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
    if (ripeKeys(state.cells).length > 0) return [[{ type: 'HARVEST', choice: 'points' }], stream];
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
  note: 'Harvests as soon as three tiles are ripe, but works the map to exhaustion like a farmer.',
  decide(state, stream) {
    if (ripeKeys(state.cells).length >= 3) {
      return [[{ type: 'HARVEST', choice: cashChoice(state, 8) }], stream];
    }
    const place = bestPlacement(state);
    if (place !== null) return [place, stream];
    if (ripeKeys(state.cells).length > 0) {
      return [[{ type: 'HARVEST', choice: cashChoice(state, 8) }], stream];
    }
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
    if (ripeKeys(state.cells).length > 0) return [[{ type: 'HARVEST', choice: 'tiles' }], stream];
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
    if (ripeKeys(state.cells).length > 0) {
      return [[{ type: 'HARVEST', choice: cashChoice(state, 8) }], stream];
    }
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
  survivor,
];

export const policyByName = (name: string): Policy | undefined =>
  POLICIES.find((p) => p.name === name);

/** Exported for the runner's stall check; `isExhausted` is the interesting half. */
export const stuckOnMap = (state: GameState): boolean =>
  isExhausted(state.cells) && ripeKeys(state.cells).length === 0;
