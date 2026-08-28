import { COLOURS, type Colour, type Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from './hex';
import type { Cell, GameState, PointsSplit, PointSource, Rarity, Tile } from './state';

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

/**
 * Cost of the next placement: flat through the grace, then rising with every
 * tile ever placed this run. The knee is the whole shape of a run — see
 * `costGrace` in `content/tuning.ts` for why it is not a straight line.
 */
export const costOf = (placements: number, t: Tuning): number =>
  t.baseCost + Math.floor(Math.max(0, placements - t.costGrace) / t.costRisesEvery);

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

/**
 * Where a tile may go. Empty ground beside built ground, always — and, under
 * WALLBREAKER (`wallBuildCostMult` > 0), a wall beside built ground too: the
 * placement replaces it, at a multiple of the normal cost that
 * `placementCostAt` prices. The tuning is optional so every caller that never
 * heard of the perk keeps rule 7 exactly as written; old saves decode the
 * dial as `undefined`, which the `> 0` guard reads as "walls say no".
 */
export function canPlaceAt(cells: Cells, k: HexKey, t?: Tuning): boolean {
  const kind = cells[k]?.kind;
  const buildable = kind === 'empty' || (kind === 'wall' && (t?.wallBuildCostMult ?? 0) > 0);
  if (!buildable) return false;
  const { q, r } = parse(k);
  return neighbourKeys(q, r).some((n) => isBuilt(cells, n));
}

export function legalPlacements(cells: Cells, t?: Tuning): HexKey[] {
  return Object.keys(cells).filter((k) => canPlaceAt(cells, k, t));
}

/** No room left. Not death by itself — you can still harvest, or leave. */
export const isExhausted = (cells: Cells, t?: Tuning): boolean =>
  !Object.keys(cells).some((k) => canPlaceAt(cells, k, t));

/**
 * The hard clock, spent. Placements left is `runLength - placements`; at zero
 * the run may still harvest what is ripe, but may not build again.
 */
export const outOfTime = (state: GameState): boolean =>
  state.tuning.runLength > 0 && state.placements >= state.tuning.runLength;

/** Placements the clock still allows, or null where there is no clock. */
export const placementsLeft = (state: GameState): number | null =>
  state.tuning.runLength > 0 ? Math.max(0, state.tuning.runLength - state.placements) : null;

/**
 * Can this run place a tile anywhere at all, right now?
 *
 * Room, money and TIME are separate failures that look identical on the board,
 * and both the UI and the scripted policies need to tell them apart — a board
 * full of legal-looking hexes you cannot afford is how the harness first
 * deadlocked.
 */
export const canPlaceNow = (state: GameState): boolean =>
  state.phase === 'placing' &&
  canAfford(state.tiles) &&
  !outOfTime(state) &&
  !isExhausted(state.cells, state.tuning);

/**
 * What placing at exactly this hex costs, with the perk dials applied: a wall
 * costs `wallBuildCostMult` times the normal price (WALLBREAKER — the only
 * way a wall is ever a legal target), and a hex with stone beside it costs
 * `stoneDiscount` less (STONEWALKER), floored at free. One function so the
 * reducer, the tests and any surface that ever explains the price agree by
 * construction. The HUD's COST stat deliberately keeps showing the base cost —
 * the discount is situational and the manual explains it instead.
 */
export function placementCostAt(cells: Cells, k: HexKey, placements: number, t: Tuning): number {
  let cost = costOf(placements, t);
  if (cells[k]?.kind === 'wall' && t.wallBuildCostMult > 0) cost *= t.wallBuildCostMult;
  if (t.stoneDiscount > 0) {
    const { q, r } = parse(k);
    if (neighbourKeys(q, r).some((n) => cells[n]?.kind === 'stone')) {
      cost = Math.max(0, cost - t.stoneDiscount);
    }
  }
  return cost;
}

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

/** Wild tiles — magic and above — match every neighbouring tile. */
const isWild = (rarity: Rarity | undefined): boolean => rarity === 'magic' || rarity === 'unique';

/**
 * What one neighbouring tile contributes to a tile's worth: 0 for no match, 1
 * for a match, 2 when either side is UNIQUE (heavy — its matches count double,
 * both ways). A match is same colour, or either side being wild. Symmetric on
 * purpose: a magic tile raises its neighbours exactly as it is raised by them,
 * so placing one visibly lifts the whole pocket — the design's core feedback,
 * amplified rather than special-cased.
 */
function matchValue(
  colour: Tile['colour'],
  rarity: Rarity | undefined,
  other: Extract<Cell, { kind: 'tile' }>,
): number {
  if (other.colour !== colour && !isWild(rarity) && !isWild(other.rarity)) return 0;
  return rarity === 'unique' || other.rarity === 'unique' ? 2 : 1;
}

/**
 * The whole worth computation, shared by `worthOf` and the preview's fast
 * path so the number promised and the number paid come from one place.
 *
 * Matches per `matchValue`, plus the colour personalities (Session 8): green
 * crowds, yellow company, red ash, blue tide — each a bonus in the same worth
 * unit, so a personality is exactly as visible in the preview as a match is.
 * `counts` is the ripeness filter: `worthOf` honours `ripeTilesMatch`, the
 * preview fast path runs only when ripeness cannot matter.
 */
function tallyWorth(
  cells: Cells,
  k: HexKey,
  colour: Colour,
  rarity: Rarity | undefined,
  onNative: boolean,
  t: Tuning,
  home: { q: number; r: number },
  luck: number,
  counts: (n: HexKey) => boolean,
): number {
  const { q, r } = parse(k);
  let worth = 0;
  let greens = 0;
  let strangers = 0;
  const company = new Set<Colour>();

  for (const n of neighbourKeys(q, r)) {
    const other = cells[n];
    if (other?.kind === 'tile') {
      if (!counts(n)) continue;
      worth += matchValue(colour, rarity, other);
      if (other.colour === 'green') greens++;
      if (other.colour !== colour) {
        company.add(other.colour);
        strangers++;
      }
    } else if (
      colour === 'red' &&
      t.redAshMatches &&
      (other?.kind === 'stone' || (t.redAshWalls && other?.kind === 'wall'))
    ) {
      // Ash: red reads the wake as kin — and, under `redAshWalls`, the walls
      // too, so red has soil before the first harvest exists. A heavy red
      // doubles it like any match.
      worth += rarity === 'unique' ? 2 : 1;
    }
  }

  if (colour === 'green' && greens > 1) worth += (greens - 1) * t.greenCrowdBonus;
  // Company counts distinct colours by default (cap 3); `yellowCompanyAll`
  // counts every differently-coloured neighbour instead (cap 6).
  if (colour === 'yellow') {
    worth += (t.yellowCompanyAll ? strangers : company.size) * t.yellowCompanyBonus;
  }
  if (colour === 'blue' && t.blueTideEvery > 0) {
    // Measured from HOME, not the world origin (the origin audit,
    // 2026-08-19): under the where-you-wake prototype a far spawn inherited
    // six free tide-worth per blue tile just by standing where it woke —
    // the exact exploit that failed the prototype. Home IS the origin in
    // every shipped run, so nothing moves until a wake hex exists.
    worth += Math.floor(distance({ q, r }, home) / t.blueTideEvery);
  }

  // Native ground counts as one match — the endless world's rule 4 addendum.
  // Baked into the tile at placement, so worth never has to ask the terrain.
  // A heavy tile's ground match counts double like every other match it makes.
  const native = onNative ? (rarity === 'unique' ? 2 : 1) : 0;

  // ROOTBOUND (perk): your own ground pays MORE and ground that is not yours
  // pays LESS, by how much your luck says. Not a bonus on top of the normal
  // game but a different game: where you may build well is decided by the
  // terrain before you draw a card. Rounded, because worth is an integer
  // everywhere else and a preview promising 4.05 is a preview nobody trusts.
  if (t.rootboundOnly) {
    const grip = rootboundGrip(t, luck);
    return Math.round(onNative ? (worth + native) * grip.native : worth * grip.stray);
  }

  return worth + native;
}

/**
 * Worth: what the six neighbours pay this tile — one per matching LIVE TILE,
 * with wild and heavy rarities read by `matchValue` and the colour
 * personalities added by `tallyWorth`. Stone and walls surround but never
 * match — the asymmetry the whole design turns on — with red's ash bonus the
 * one deliberate, tuned exception.
 *
 * When `ripeTilesMatch` is off, a neighbour that is already ripe stops counting
 * too, so a tile left sitting ripe stops feeding its neighbours and waiting has
 * a price. See the `Tuning` field for why that dial exists.
 *
 * Note there is no recursion risk: ripeness depends only on whether neighbours
 * are solid, never on anyone's worth.
 */
export function worthOf(
  cells: Cells,
  k: HexKey,
  t: Tuning,
  home: { q: number; r: number } = ORIGIN,
  luck = 0,
): number {
  const cell = cells[k];
  if (cell?.kind !== 'tile') return 0;
  return tallyWorth(
    cells,
    k,
    cell.colour,
    cell.rarity,
    cell.onNative === true,
    t,
    home,
    luck,
    (n) => (t.ripeTilesMatch ? true : !isRipe(cells, n)),
  );
}

/**
 * ROOTBOUND's grip, at this much luck (2026-08-27).
 *
 * Both ends walk with the purse: native from `rootboundNative` up to
 * `rootboundNativeMax`, stray from `rootboundStray` down to nothing, linearly
 * in luck against `luckCap`. The perk's whole character is that it is a
 * DIFFERENT game rather than a bonus, and this keeps that while taking away
 * the part Marc reported on 2026-08-27 — that the different game arrived
 * whole on the first placement and doubled a score before it was earned.
 *
 * A zero dial means "as this perk shipped": a save written before today
 * carries `rootboundOnly: true` with no grip beside it, and reading that as
 * a multiplier of zero would score a whole reloaded run at nothing. Same
 * `> 0` guard every perk dial in `Tuning` is documented to want.
 */
export function rootboundGrip(t: Tuning, luck: number): { native: number; stray: number } {
  const max = t.rootboundNativeMax > 0 ? t.rootboundNativeMax : 2;
  const base = t.rootboundNative > 0 ? t.rootboundNative : max;
  const stray = t.rootboundStray > 0 ? t.rootboundStray : 0;
  const filled = t.luckCap > 0 ? Math.min(1, Math.max(0, luck) / t.luckCap) : 0;
  return { native: base + filled * (max - base), stray: stray * (1 - filled) };
}

const ORIGIN: { q: number; r: number } = { q: 0, r: 0 };

/**
 * "Home" for every distance-based reward: the where-you-wake prototype's own
 * hex (`state.wakeAt`) if one was set, else true origin. Guarded the same
 * way `lastPlaced` is read in `ui/view.ts` (`typeof === 'string'`, not
 * `!== null`) — an old save decodes an unknown field as `undefined`, and
 * `undefined !== null` is true, which would walk straight into
 * `parse(undefined)`. The prototype is harness-only and unreachable from
 * UI: `wakeAt` is null on every save that exists today, so this returns
 * `ORIGIN` in the shipped game, always.
 */
export const homeOf = (state: Pick<GameState, 'wakeAt'>): { q: number; r: number } =>
  typeof state.wakeAt === 'string' ? parse(state.wakeAt) : ORIGIN;

/**
 * How far from home the run has built — the plane's depth, REACH on the HUD.
 * ONE helper (the simplify pass, 2026-08-19): this loop existed as six
 * private copies across view, game, main, reduce and both sim files, and the
 * origin audit had to edit them in lockstep — the next home-anchored change
 * would have missed one. Pure state derivation, no balance number, so it
 * lives beside `homeOf`, which is the anchor it exists to respect.
 */
export function reachOf(state: Pick<GameState, 'wakeAt' | 'cells'>): number {
  const home = homeOf(state);
  let reach = 0;
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind !== 'tile' && cell.kind !== 'stone') continue;
    reach = Math.max(reach, distance(parse(k), home));
  }
  return reach;
}

/**
 * Whether a hex sits inside the live beacon horizon: within
 * `reach + beaconHorizon` of HOME — the one rule `beaconsFor` draws by and
 * the tap-the-dark explanation answers by. The simplify pass found the two
 * had already drifted (the tap still measured from the origin, so a camp
 * run's tap answers disagreed with its own drawn beacons); one predicate
 * ends the species.
 */
export const withinBeaconHorizon = (
  state: Pick<GameState, 'wakeAt' | 'cells' | 'tuning'>,
  k: HexKey,
): boolean => distance(parse(k), homeOf(state)) <= reachOf(state) + state.tuning.beaconHorizon;

/**
 * Rule 6's multiplier at a single hex: 1 + floor(distance from home /
 * distanceStep). What a bonus-points site pays through, so a farther site is
 * worth the longer walk by the same arithmetic as any harvest out there.
 *
 * `origin` defaults to true origin for every caller that has no state to
 * hand (the UI, mostly) — the where-you-wake prototype is the only caller
 * that ever passes anything else, via `homeOf`.
 */
/**
 * What a pocket's worth becomes as SCORE — the one place that arithmetic
 * lives (2026-08-21).
 *
 * It was written twice: once in `harvest` and once in the pop receipt's own
 * `Math.floor(value.points * t.pointsPerPop)`. That is the same shape as the
 * `collected`/`scores` drift and the shop's two economy sentences — a rule
 * spelled in two places, agreeing right up until one of them is changed. It
 * was changed the same day, when a scoring pop gained a floor of one point,
 * and the receipt would have gone on printing the zero the engine no longer
 * banks.
 *
 * The floor: a pop that scores at all scores at least 1. Only ever reached
 * by a pocket whose whole worth lands under a single point.
 */
export function scoreOf(points: number, t: Tuning): number {
  if (!t.singlePayout) return points;
  const scaled = Math.floor(points * t.pointsPerPop);
  return points > 0 ? Math.max(1, scaled) : scaled;
}

export const distanceMultiplierAt = (
  k: HexKey,
  t: Tuning,
  origin: { q: number; r: number } = ORIGIN,
): number => 1 + Math.floor(distance(parse(k), origin) / t.distanceStep);

/**
 * What a cache at this hex hands over: the base, plus the per-ring grade when
 * the gradual dial is on. One function so the payment, the claim announcement
 * and the tap description can never disagree about the number.
 */
export const cachePaysAt = (
  k: HexKey,
  t: Tuning,
  origin: { q: number; r: number } = ORIGIN,
): number =>
  t.cachePays +
  (t.cachePaysPerRing > 0 ? t.cachePaysPerRing * (distanceMultiplierAt(k, t, origin) - 1) : 0);

/**
 * The points multiplier a harvest of exactly these tiles earns.
 *
 * How far from home the pocket sits: `1 + floor(mean distance / distanceStep)`.
 * Depth is paid for by every placement of the journey out. The MEAN rather than
 * the farthest tile, so a long cluster cannot borrow its tip's multiplier for
 * its whole body. Measured from `homeOf(state)` — the wake hex under the
 * prototype, true origin everywhere else — so a far spawn cannot inherit a
 * free multiplier just by starting there.
 */
export function harvestMultiplier(state: GameState, pops: readonly HexKey[]): number {
  if (pops.length === 0) return 1;
  const home = homeOf(state);
  const sum = pops.reduce((n, k) => n + distance(parse(k), home), 0);
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
/**
 * Does this exact set of pops collect the standing bounty?
 *
 * Big enough, near enough, and — decided at the call site — taken as POINTS.
 * Distance is measured from the pocket's mean to the site, the same
 * "no borrowing the tip's reach" rule the multiplier uses.
 */
export function questMet(state: GameState, pops: readonly HexKey[]): boolean {
  const quest = state.quest;
  if (quest === null || pops.length < quest.need) return false;
  const site = parse(quest.at);
  const mean = pops.reduce((n, k) => n + distance(parse(k), site), 0) / pops.length;
  return mean <= quest.radius;
}

export function harvestValue(
  state: GameState,
  at?: HexKey,
): {
  keys: HexKey[];
  count: number;
  tiles: number;
  points: number;
  /** True when taking THIS pocket as points collects the bounty. */
  questPays: boolean;
  /** The rare tile this pocket would yield as treasure, if big enough. */
  treasure: Rarity | null;
} {
  const t = state.tuning;
  // A harvest is always LOCAL: one connected pocket, named by `at`. No target
  // means no harvest — which is a rule rather than an edge case, because
  // which pocket you cash is half the decision.
  const pops = at === undefined ? [] : ripeClusterAt(state.cells, at);
  const home = homeOf(state);
  let tiles = 0;
  let sumWorth = 0;
  for (const k of pops) {
    const worth = worthOf(state.cells, k, t, home, state.luck);
    sumWorth += worth;
    tiles += t.tilesPerPop + Math.floor(worth / t.worthPerExtraTile);
  }

  const counted = t.harvestSizeCap > 0 ? Math.min(pops.length, t.harvestSizeCap) : pops.length;
  const sizeBonus = 1 + t.harvestSizeBonus * Math.max(0, counted - 1);
  const mult = harvestMultiplier(state, pops);
  // The gradual dial: a pocket cashed farther out pays extra tiles per pop per
  // ring, so survival income grows with depth instead of being flat everywhere.
  if (t.popTilesPerRing > 0) tiles += Math.floor(pops.length * t.popTilesPerRing * (mult - 1));
  // The bounty multiplies the one scoring channel rather than adding another.
  // It is priced into the button so the reason to press it is on the button.
  const questPays = pops.length > 0 && questMet(state, pops);
  const bounty = questPays ? (state.quest?.bonus ?? 1) : 1;

  return {
    keys: pops,
    count: pops.length,
    tiles,
    points: Math.floor(sumWorth * sizeBonus * mult * bounty),
    questPays,
    treasure: treasureFor(pops.length, t),
  };
}

/**
 * One tile's worth, taken apart into the four rules that built it.
 *
 * Measured, never estimated — the same technique `colourPotentials` uses for
 * the live board: re-tally with one rule switched off and take the
 * difference. The peeling ORDER is the definition, because each step is a
 * difference against the step before it:
 *
 *   1. plain matching, with no personality, no rarity and no ground
 *   2. + the colour's own power   -> `power`
 *   3. + this tile's own rarity   -> `rare`
 *   4. + the ground it stands on  -> `native`
 *
 * A neighbour's rarity is deliberately left alone at step 3: what is being
 * asked is what THIS tile's magic or unique earned, and a wild neighbour
 * lifting this tile is that neighbour's doing, counted under its own row.
 *
 * The four sum to the tile's real worth by construction, with one exception —
 * ROOTBOUND rounds — so the caller reconciles. See `pointsSplit`.
 */
export function worthParts(
  cells: Cells,
  k: HexKey,
  t: Tuning,
  home: { q: number; r: number },
  luck: number,
): { matches: number; power: number; rare: number; native: number; total: number } {
  const cell = cells[k];
  if (cell?.kind !== 'tile') return { matches: 0, power: 0, rare: 0, native: 0, total: 0 };

  const { colour, rarity } = cell;
  const onNative = cell.onNative === true;
  const counts = (n: HexKey): boolean => (t.ripeTilesMatch ? true : !isRipe(cells, n));
  // The personalities off, exactly as `colourPotentials` switches them off.
  const dull: Tuning = {
    ...t,
    greenCrowdBonus: 0,
    yellowCompanyBonus: 0,
    redAshMatches: false,
    blueTideEvery: 0,
  };
  const tally = (u: Tuning, r: Rarity | undefined, ground: boolean): number =>
    tallyWorth(cells, k, colour, r, ground, u, home, luck, counts);

  const bare = tally(dull, 'common', false);
  const withPower = tally(t, 'common', false);
  const withRare = tally(t, rarity, false);
  const total = tally(t, rarity, onNative);

  return {
    matches: bare,
    power: withPower - bare,
    rare: withRare - withPower,
    native: total - withRare,
    total,
  };
}

/**
 * Where a scoring harvest's points came from, counted three ways.
 *
 * Called once, from the reducer, at the only moment the answer exists: a line
 * later the tiles are stone. Never from `harvestValue`, which prices every
 * pocket on every render — this walks the board four times per popped tile
 * and has no business on that path.
 *
 * The arithmetic mirrors `harvestValue`'s own, peeled in the order the
 * formula applies its factors:
 *
 *   sumWorth                                    the tiles themselves
 *   x sizeBonus   -> `pocket`                   harvesting many at once
 *   x mult        -> `distance`                 cashing it far from home
 *   x bounty      -> `bounty`                   a bounty collected
 *
 * Then the whole thing is rescaled to the points ACTUALLY banked, so the two
 * floors between `points` and `scored` — `Math.floor` and `scoreOf`'s
 * minimum of one — land inside the breakdown rather than beside it. Rounding
 * remainders go to the largest row, so all three axes total exactly.
 */
export function pointsSplit(
  state: GameState,
  keys: readonly HexKey[],
  scored: number,
): PointsSplit | undefined {
  if (scored <= 0 || keys.length === 0) return undefined;

  const t = state.tuning;
  const home = homeOf(state);
  const colours: Record<Colour, number> = { green: 0, yellow: 0, red: 0, blue: 0 };
  const rarities: Record<'common' | 'magic' | 'unique', number> = {
    common: 0,
    magic: 0,
    unique: 0,
  };
  const sources: Record<PointSource, number> = {
    matches: 0,
    power: 0,
    rare: 0,
    native: 0,
    pocket: 0,
    distance: 0,
    bounty: 0,
  };

  let sumWorth = 0;
  for (const k of keys) {
    const cell = state.cells[k];
    if (cell?.kind !== 'tile') continue;
    const parts = worthParts(state.cells, k, t, home, state.luck);
    sumWorth += parts.total;
    colours[cell.colour] += parts.total;
    rarities[cell.rarity ?? 'common'] += parts.total;
    sources.matches += parts.matches;
    sources.power += parts.power;
    sources.rare += parts.rare;
    // ROOTBOUND rounds its multiplier, so the four parts can miss the tile's
    // real worth by a point. The ground gets the remainder: it is the last
    // rule applied and the one the multiplier is applied ON TOP of.
    sources.native += parts.total - parts.matches - parts.power - parts.rare;
  }
  if (sumWorth <= 0) return undefined;

  const counted = t.harvestSizeCap > 0 ? Math.min(keys.length, t.harvestSizeCap) : keys.length;
  const sizeBonus = 1 + t.harvestSizeBonus * Math.max(0, counted - 1);
  const mult = harvestMultiplier(state, keys);
  const bounty = questMet(state, keys) ? (state.quest?.bonus ?? 1) : 1;

  sources.pocket = sumWorth * (sizeBonus - 1);
  sources.distance = sumWorth * sizeBonus * (mult - 1);
  sources.bounty = sumWorth * sizeBonus * mult * (bounty - 1);

  // Everything above is in WORTH; the run banks POINTS. One scale factor
  // carries both floors, and it is the same factor for all three axes, which
  // is what keeps them agreeing with each other and with the run's total.
  const raw = sumWorth * sizeBonus * mult * bounty;
  const scale = scored / raw;
  const amplified = (n: number): number => n * sizeBonus * mult * bounty * scale;

  return {
    total: scored,
    byColour: settle(
      COLOURS.map((c) => [c, amplified(colours[c])]),
      scored,
    ),
    byRarity: settle(
      (['common', 'magic', 'unique'] as const).map((r) => [r, amplified(rarities[r])]),
      scored,
    ),
    // Every source row is already in the same WORTH units, including the
    // three multiplier rows — each was written as the slice of `raw` that
    // its own factor added, so the seven of them sum to `raw` and one scale
    // is the whole conversion. Amplifying the four tile rows on top of that
    // (the first version of this) counted the multipliers twice and made the
    // source column nearly double the colour column.
    bySource: settle(
      (Object.keys(sources) as PointSource[]).map((k) => [k, sources[k] * scale]),
      scored,
    ),
  };
}

/**
 * Round a set of shares to whole points that still add up to `total`.
 *
 * Floor everything, then hand the leftover out one point at a time, largest
 * remainder first — the standard apportionment, chosen because the naive
 * `Math.round` per row loses or invents points and an end screen whose
 * columns do not match its headline is worse than no end screen.
 */
function settle<K extends string>(shares: readonly (readonly [K, number])[], total: number) {
  const floored = shares.map(([k, v]) => [k, Math.floor(v), v - Math.floor(v)] as const);
  let left = total - floored.reduce((n, [, v]) => n + v, 0);
  const order = [...floored].sort((a, b) => b[2] - a[2]);
  const extra = new Map<K, number>();
  for (const [k] of order) {
    if (left <= 0) break;
    extra.set(k, 1);
    left--;
  }
  const out = {} as Record<K, number>;
  for (const [k, v] of floored) out[k] = v + (extra.get(k) ?? 0);
  return out;
}

/**
 * The rare tile a pocket this size would yield as TREASURE, or null when the
 * pocket is too small (or the option is not built). Pure, so the button can
 * promise exactly what the reducer will hand over.
 */
export function treasureFor(count: number, t: Tuning): Rarity | null {
  // OPEN HAND sets `holdSlots` to 0 — with nowhere for the tile to land,
  // treasure would write into `state.held` and vanish behind a hidden
  // stash, a silent total loss of the whole pocket. No stash, no offer.
  if (!(t.holdSlots > 0)) return null;
  if (t.treasureNeed <= 0 || count < t.treasureNeed) return null;
  return t.treasureUnique > 0 && count >= t.treasureUnique ? 'unique' : 'magic';
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
export function previewWorth(
  cells: Cells,
  k: HexKey,
  tile: Pick<Tile, 'colour' | 'rarity'>,
  t: Tuning,
  home: { q: number; r: number } = ORIGIN,
  luck = 0,
): number {
  const { colour, rarity } = tile;
  const ground = cells[k];
  const onNative = ground?.kind === 'empty' && ground.native === colour;

  // Fast path: with ripe neighbours still paying, worth does not depend on
  // ripeness at all, so there is nothing the hypothetical board would change.
  // Worth taking — the harness asks this a few hundred times per placement, and
  // the slow path copies the whole board to answer it.
  if (t.ripeTilesMatch) {
    return tallyWorth(cells, k, colour, rarity, onNative, t, home, luck, () => true);
  }
  return worthOf({ ...cells, [k]: { kind: 'tile', colour, onNative, rarity } }, k, t, home, luck);
}

/** Build a `cells` record from a list of coordinates, all empty. */
export function blankMap(coords: readonly { q: number; r: number }[]): Record<HexKey, Cell> {
  const out: Record<HexKey, Cell> = {};
  for (const c of coords) out[key(c.q, c.r)] = { kind: 'empty' };
  return out;
}
