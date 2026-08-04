import type { Colour, Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from './hex';
import type { Cell, GameState } from './state';

/**
 * The six rules, as functions. Nothing here decides anything — the reducer does
 * that. These are the questions the reducer and the renderer both need answered,
 * kept in one place so the UI can never disagree with the engine about what is
 * legal or what something is worth.
 *
 * Anything whose answer depends on balance takes a `Tuning` rather than reading
 * one, so the harness can ask the same question of twenty different economies.
 */

export type Cells = Readonly<Record<HexKey, Cell>>;

/** Cost of the next placement. Rises with every tile ever placed this run. */
export const costOf = (placements: number, t: Tuning): number =>
  t.baseCost + Math.floor(placements / t.costRisesEvery);

/**
 * You may place while you hold any tiles at all, even fewer than the cost.
 *
 * This is DESIGN.md's "at zero: one last tile, one last harvest", and it is one
 * rule rather than a special case: paying more than you have simply floors you
 * at zero, so the grace can only ever happen once. It exists so a run cannot end
 * mid-arrangement with the board one tile short of a payout — dying to the cost
 * curve should feel like running out of road, not like being cut off.
 */
export const canAfford = (tiles: number): boolean => tiles > 0;

export const payPlacement = (tiles: number, cost: number): number => Math.max(0, tiles - cost);

/**
 * Solid = it surrounds you. Off-map counts, which is why map rims ripen cheaply.
 * Empty ground is the only thing that is not solid.
 */
export function isSolid(cells: Cells, k: HexKey): boolean {
  const cell = cells[k];
  return cell === undefined || cell.kind !== 'empty';
}

/** Growth spreads from tiles and stone, not from walls or the void. */
function isBuilt(cells: Cells, k: HexKey): boolean {
  const cell = cells[k];
  return cell !== undefined && (cell.kind === 'tile' || cell.kind === 'stone');
}

export function canPlaceAt(cells: Cells, k: HexKey): boolean {
  if (cells[k]?.kind !== 'empty') return false;
  const { q, r } = parse(k);
  return neighbourKeys(q, r).some((n) => isBuilt(cells, n));
}

export function legalPlacements(cells: Cells): HexKey[] {
  return Object.keys(cells).filter((k) => canPlaceAt(cells, k));
}

/** No room left. Not death by itself — you can still harvest, or leave. */
export const isExhausted = (cells: Cells): boolean =>
  !Object.keys(cells).some((k) => canPlaceAt(cells, k));

/**
 * Can this run place a tile anywhere at all, right now?
 *
 * Room and money are separate failures that look identical on the board, and
 * both the UI and the scripted policies need to tell them apart — a board full
 * of legal-looking hexes you cannot afford is how the harness first deadlocked.
 */
export const canPlaceNow = (state: GameState): boolean =>
  state.phase === 'placing' && canAfford(state.tiles) && !isExhausted(state.cells);

/** Ripe: a live tile touched on all six sides. */
export function isRipe(cells: Cells, k: HexKey): boolean {
  if (cells[k]?.kind !== 'tile') return false;
  const { q, r } = parse(k);
  return neighbourKeys(q, r).every((n) => isSolid(cells, n));
}

export const ripeKeys = (cells: Cells): HexKey[] =>
  Object.keys(cells).filter((k) => isRipe(cells, k));

/**
 * The connected ripe cluster containing `at` — ripe tiles reachable from it
 * through other ripe tiles. Empty when `at` is not ripe.
 *
 * This is what a harvest POPS in the endless world: one pocket, not the board.
 * Connectivity runs through ripe tiles only, so two pockets separated by a
 * still-growing tile are two separate harvests with two separate prices — which
 * is exactly the timing decision rule 5 was always supposed to be.
 */
export function ripeClusterAt(cells: Cells, at: HexKey): HexKey[] {
  if (!isRipe(cells, at)) return [];
  const seen = new Set<HexKey>([at]);
  const queue: HexKey[] = [at];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]!;
    const { q, r } = parse(k);
    for (const n of neighbourKeys(q, r)) {
      if (!seen.has(n) && isRipe(cells, n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return [...seen];
}

/**
 * Every ripe cluster on the board, each once, in board order. What a policy —
 * or eventually a renderer — needs to enumerate the harvests on offer.
 */
export function ripeClusters(cells: Cells): HexKey[][] {
  const seen = new Set<HexKey>();
  const out: HexKey[][] = [];
  for (const k of ripeKeys(cells)) {
    if (seen.has(k)) continue;
    const cluster = ripeClusterAt(cells, k);
    for (const member of cluster) seen.add(member);
    out.push(cluster);
  }
  return out;
}

/**
 * Worth: how many of the six neighbours are LIVE TILES of the same colour.
 * Stone and walls surround but never match — the asymmetry the whole design
 * turns on.
 *
 * When `ripeTilesMatch` is off, a neighbour that is already ripe stops counting
 * too, so a tile left sitting ripe stops feeding its neighbours and waiting has
 * a price. See the `Tuning` field for why that dial exists.
 *
 * Note there is no recursion risk: ripeness depends only on whether neighbours
 * are solid, never on anyone's worth.
 */
export function worthOf(cells: Cells, k: HexKey, t: Tuning): number {
  const cell = cells[k];
  if (cell?.kind !== 'tile') return 0;
  const { q, r } = parse(k);
  return neighbourKeys(q, r).filter((n) => {
    const other = cells[n];
    if (other?.kind !== 'tile' || other.colour !== cell.colour) return false;
    return t.ripeTilesMatch || !isRipe(cells, n);
  }).length;
}

const ORIGIN: { q: number; r: number } = { q: 0, r: 0 };

/**
 * The points multiplier a harvest of exactly these tiles earns.
 *
 * Bounded world: the map number, stepped by LEAVE — depth is paid for by rule 7.
 * Endless world: how far from home the pocket sits, `1 + floor(mean distance /
 * distanceStep)` — depth is paid for by every placement of the journey out. The
 * mean rather than the farthest tile, so a long cluster cannot borrow its tip's
 * multiplier for its whole body.
 */
export function harvestMultiplier(state: GameState, pops: readonly HexKey[]): number {
  if (state.tuning.world !== 'endless') return state.mapNumber;
  if (pops.length === 0) return 1;
  const sum = pops.reduce((n, k) => n + distance(parse(k), ORIGIN), 0);
  return 1 + Math.floor(sum / pops.length / state.tuning.distanceStep);
}

/**
 * What a harvest would pay, right now.
 *
 * Tiles are LINEAR in harvest size. Points get a bonus per extra tile in the
 * harvest, and `harvestSizeBonus` sets how big — at 1 they are the quadratic
 * `sumWorth * count` the design started from, at 0 they are linear too. That
 * difference is the whole reason the choice stays live: a small harvest favours
 * tiles, a large one favours points, and harvest size changes every time.
 *
 * `at` picks the cluster being priced, and only the endless world reads it —
 * see the HARVEST action. `keys` is the exact set that would pop, so the
 * reducer stones precisely what was priced and can never disagree with it.
 */
export function harvestValue(
  state: GameState,
  at?: HexKey,
): {
  keys: HexKey[];
  count: number;
  tiles: number;
  points: number;
} {
  const t = state.tuning;
  const pops =
    t.world === 'endless'
      ? at === undefined
        ? []
        : ripeClusterAt(state.cells, at)
      : ripeKeys(state.cells);
  let tiles = 0;
  let sumWorth = 0;
  for (const k of pops) {
    const worth = worthOf(state.cells, k, t);
    sumWorth += worth;
    tiles += t.tilesPerPop + Math.floor(worth / t.worthPerExtraTile);
  }

  const sizeBonus = 1 + t.harvestSizeBonus * Math.max(0, pops.length - 1);
  return {
    keys: pops,
    count: pops.length,
    tiles,
    points: Math.floor(sumWorth * sizeBonus * harvestMultiplier(state, pops)),
  };
}

/**
 * What a tile would be worth if placed here — shown on every legal hex before
 * committing. Not a convenience: placing raises the worth of up to six
 * neighbours at once, and seeing that tick up is the moment-to-moment feedback
 * that replaces v1's score-on-placement.
 *
 * Computed against the board as it WOULD be, not as it is, because placing a
 * tile can ripen its own neighbours, and under `ripeTilesMatch: false` that
 * changes the answer. A preview that disagrees with the outcome is worse than
 * no preview.
 */
export function previewWorth(cells: Cells, k: HexKey, colour: Colour, t: Tuning): number {
  // Fast path: with ripe neighbours still paying, worth does not depend on
  // ripeness at all, so there is nothing the hypothetical board would change.
  // Worth taking — the harness asks this a few hundred times per placement, and
  // the slow path copies the whole board to answer it.
  if (t.ripeTilesMatch) {
    const { q, r } = parse(k);
    return neighbourKeys(q, r).filter((n) => {
      const other = cells[n];
      return other?.kind === 'tile' && other.colour === colour;
    }).length;
  }
  return worthOf({ ...cells, [k]: { kind: 'tile', colour } }, k, t);
}

/** Build a `cells` record from a list of coordinates, all empty. */
export function blankMap(coords: readonly { q: number; r: number }[]): Record<HexKey, Cell> {
  const out: Record<HexKey, Cell> = {};
  for (const c of coords) out[key(c.q, c.r)] = { kind: 'empty' };
  return out;
}
