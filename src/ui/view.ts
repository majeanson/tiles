import { COLOURS, type Colour, type Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from '@engine/hex';
import { canSpend, rarityOdds, spendCost } from '@engine/reduce';
import {
  cachePaysAt,
  canPlaceNow,
  costOf,
  harvestMultiplier,
  harvestValue,
  homeOf,
  isRipe,
  legalPlacements,
  placementsLeft,
  previewWorth,
  reachOf,
  ripeClusters,
  ripeKeys,
  worthOf,
} from '@engine/rules';
import type { GameState, LandmarkReward, Rarity, Spend } from '@engine/state';
import {
  destinationAt,
  destinationsWithin,
  elevationBandAt,
  findsWithin,
  terrainAt,
} from '@engine/world';
import { brightness, type Light } from '@theme/tokens';
import type { BoardView, CellKind, CellView } from '@render/Renderer';

/** A direction that wants no falloff at all — and every test that has no theme. */
const NO_FALLOFF: Light = { radius: Infinity, fade: 1, floor: 1 };

const ORIGIN_HEX = { q: 0, r: 0 };

/**
 * How far `structureDistances` below is willing to walk before it stops
 * caring exactly how far a hex is. `brightness()` clamps to `floor` for any
 * distance at or past `light.radius + light.fade`, and the largest such sum
 * among the shipped themes is cold survey's 24 (torchlit 15, rot bloom 18) —
 * so a sentinel exactly there can never read differently from the true
 * distance for a theme that exists today, and it keeps the flood fill from
 * paying for a halo no theme's curve can see past. A render-precision
 * constant, not a balance number: this file has no theme to read one from,
 * by design — bump it if a future direction's `radius + fade` exceeds it.
 */
const STRUCTURE_LIGHT_CAP = 24;

/**
 * The light the structure carries (2026-08-18/19): distance from every hex
 * within `STRUCTURE_LIGHT_CAP` steps to the nearest BUILT cell — a tile or a
 * stone, the structure actually placed — rather than to the one hex last
 * placed. `torchlit.ts`'s header recorded this as the direction's best idea
 * and unbuilt; this is it built.
 *
 * One multi-source BFS: every built cell seeds the frontier at distance 0,
 * which then expands outward across the raw hex lattice a ring at a time —
 * not only cells the board has drawn, because a beacon or a remembered hex
 * sitting past the grown ground still needs an honest distance. O(cells
 * reached), computed once per render.
 */
function structureDistances(cells: GameState['cells']): ReadonlyMap<HexKey, number> {
  const dist = new Map<HexKey, number>();
  const queue: HexKey[] = [];
  for (const [k, cell] of Object.entries(cells)) {
    if (cell.kind === 'tile' || cell.kind === 'stone') {
      dist.set(k, 0);
      queue.push(k);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]!;
    const d = dist.get(k)!;
    if (d >= STRUCTURE_LIGHT_CAP) continue;
    const { q, r } = parse(k);
    for (const n of neighbourKeys(q, r)) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** `structureDistances`' answer for one hex, or the cap once past its reach. */
function structureDistanceAt(dist: ReadonlyMap<HexKey, number>, q: number, r: number): number {
  return dist.get(key(q, r)) ?? STRUCTURE_LIGHT_CAP;
}

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
  if (asked !== null && isRipe(state.cells, asked)) return asked;

  let best: HexKey[] | null = null;
  for (const pocket of ripeClusters(state.cells)) {
    if (best === null || pocket.length > best.length) best = pocket;
  }
  return best?.[0] ?? null;
}

/**
 * Everything both selectors need that costs a pass over the board, computed
 * ONCE per render and threaded through explicitly.
 *
 * Before this existed a single render resolved the harvest target three
 * times, walked the ripe set five, measured reach three and re-derived every
 * draft preview the board had already computed — each of them a full board
 * pass, each per tap, on a board that only grows. An explicit context (not a
 * module cache — the one last-value cache below is the exception, and it
 * predates this) keeps the selectors pure and keeps "computed once" a fact
 * the call shape enforces rather than a discipline.
 *
 * Nothing here DECIDES anything: every field is exactly what the old
 * per-selector derivations produced, checked by the invariant tests staying
 * green with their displayed values unchanged.
 */
export type RenderContext = {
  /** Every ripe key, in board order — one ripeness pass for the render. */
  readonly ripe: ReadonlySet<HexKey>;
  /** The pocket a harvest would pop: the tapped ripe tile's, or the biggest. */
  readonly target: HexKey | null;
  /** The exact cells `target` pops — the board's outline. */
  readonly targetCluster: ReadonlySet<HexKey>;
  /** What popping `target` pays. The buttons' numbers. */
  readonly value: ReturnType<typeof harvestValue>;
  /**
   * What popping the DEFAULT (biggest) pocket pays. The guide line prices
   * this one deliberately — its words must not change because a different
   * pocket happens to be tapped. Same object as `value` when they coincide.
   */
  readonly defaultValue: ReturnType<typeof harvestValue>;
  /** Hexes a tile may go right now. Empty exactly when `canPlaceNow` is not. */
  readonly legal: ReadonlySet<HexKey>;
  /**
   * `previewWorth` per draft card per legal hex — what the board prints for
   * the selected card and what BEST is judged on, derived once so the two
   * can never disagree.
   */
  readonly previews: readonly ReadonlyMap<HexKey, number>[];
  /** How far from home the run has built — REACH, and the beacon horizon. */
  readonly reach: number;
  /**
   * How many SEPARATE ripe pockets exist right now — not ripe tiles, pockets:
   * a POP · N READY count needs the number of decisions on the board, and a
   * 12-tile pocket is one decision same as a 2-tile one. Free from the same
   * clustering pass that already finds `target`.
   */
  readonly pocketCount: number;
  /**
   * Every drawn cell, parsed once. The KEEN NOSE shimmer loop is the one
   * consumer today (an O(cells × finds) distance scan per render), but this
   * is the same "computed once, threaded through" shape as the rest of the
   * context rather than a re-parse living inside `toBoardView`.
   */
  readonly ground: readonly { readonly q: number; readonly r: number }[];
  /**
   * The light the structure carries: every reached hex's distance to the
   * nearest BUILT cell (tile or stone), from one multi-source BFS run once
   * per render. See `structureDistances`.
   */
  readonly structureDist: ReadonlyMap<HexKey, number>;
};

export function renderContext(state: GameState, asked: HexKey | null = null): RenderContext {
  // One ripeness pass; the pockets are walked over the SET, which cannot
  // change the answer (`ripeClusterAt` walks ripe neighbours the same way)
  // and saves re-asking `isRipe` once per neighbour per cluster.
  const ripe = new Set(ripeKeys(state.cells));
  const pockets: HexKey[][] = [];
  {
    const seen = new Set<HexKey>();
    for (const k of ripe) {
      if (seen.has(k)) continue;
      const cluster: HexKey[] = [k];
      seen.add(k);
      for (let i = 0; i < cluster.length; i++) {
        const { q, r } = parse(cluster[i]!);
        for (const n of neighbourKeys(q, r)) {
          if (ripe.has(n) && !seen.has(n)) {
            seen.add(n);
            cluster.push(n);
          }
        }
      }
      pockets.push(cluster);
    }
  }

  let biggest: HexKey[] | null = null;
  for (const pocket of pockets) {
    if (biggest === null || pocket.length > biggest.length) biggest = pocket;
  }
  const defaultTarget = biggest?.[0] ?? null;
  const target = asked !== null && ripe.has(asked) ? asked : defaultTarget;
  const targetCluster = new Set(
    target === null ? [] : (pockets.find((p) => p.includes(target)) ?? []),
  );

  const value = harvestValue(state, target ?? undefined);
  const defaultValue =
    target === defaultTarget ? value : harvestValue(state, defaultTarget ?? undefined);

  const placeable = canPlaceNow(state);
  // The tuning rides along so WALLBREAKER's wall placements light up and
  // preview like any legal hex — legality has one owner, and this is it.
  const legal = new Set(placeable ? legalPlacements(state.cells, state.tuning) : []);
  const home = homeOf(state);
  const previews = placeable
    ? state.draft.map((tile) => {
        const map = new Map<HexKey, number>();
        for (const k of legal) {
          map.set(k, previewWorth(state.cells, k, tile, state.tuning, home));
        }
        return map;
      })
    : [];

  return {
    ripe,
    target,
    targetCluster,
    value,
    defaultValue,
    legal,
    previews,
    reach: reachOf(state),
    pocketCount: pockets.length,
    ground: Object.keys(state.cells).map(parse),
    structureDist: structureDistances(state.cells),
  };
}

export function toBoardView(
  state: GameState,
  harvestAt: HexKey | null = null,
  spotlight: Colour | null = null,
  memory: readonly HexKey[] = [],
  light: Light = NO_FALLOFF,
  // The per-render derivations, shareable with `toHudView`. Callers that
  // render both (the game loop) build one and pass it twice; everyone else
  // gets a fresh one for free.
  ctx: RenderContext = renderContext(state, harvestAt),
): BoardView {
  // The light the structure carries (2026-08-18/19): the real source is now
  // every BUILT cell, not one hex — `ctx.structureDist` is that answer, one
  // multi-source BFS shared by the whole render. `lastPlaced` (or the origin
  // before anything is built) keeps a small bonus pool on top: full
  // brightness within the theme's own radius of it, exactly the old
  // single-torch formula. `Math.max` of the two means the spot you are
  // working RIGHT NOW still reads a touch warmer than the rest of the
  // structure, and neither source can ever make a cell darker than the
  // other already had it — nothing regresses past what today's torch drew.
  //
  // Defensive on purpose: a save written before `lastPlaced` existed decodes
  // it as absent, and `undefined` walks straight past an `=== null` guard
  // into `parse`. `decodeRun` fills it as well — both, because this one cost
  // Marc a black screen on the first frame of a resumed run.
  const torch = typeof state.lastPlaced === 'string' ? parse(state.lastPlaced) : ORIGIN_HEX;
  const lit = (q: number, r: number): number =>
    Math.max(
      brightness(light, structureDistanceAt(ctx.structureDist, q, r)),
      brightness(light, distance({ q, r }, torch)),
    );
  const band = (q: number, r: number): number =>
    elevationBandAt(state.rootSeed, q, r, state.tuning);
  // The hearth marker (2026-08-19): the origin cell, always a `tile` or a
  // `stone` (the run's own seed tile, possibly since popped) and so always a
  // member of `state.cells` — it can never be memory, a beacon or a shimmer,
  // which is why only the loop below ever sets this `true`.
  const home = homeOf(state);
  const homeKey = key(home.q, home.r);
  const previews = ctx.previews[state.selected];
  // The tile actually in hand — the ghost used to draw as one fixed tint no
  // matter what you were holding. `?? null` covers the edge a full stash
  // swap can leave for one render: `selected` unchanged, `draft` shorter.
  const heldColour = state.draft[state.selected]?.colour ?? null;

  const cells: CellView[] = Object.entries(state.cells).map(([k, cell]) => {
    const { q, r } = parse(k);
    const legal = ctx.legal.has(k);

    return {
      key: k,
      q,
      r,
      kind: cell.kind satisfies CellKind,
      colour: cell.kind === 'tile' || cell.kind === 'landmark' ? (cell.colour ?? null) : null,
      landmark: cell.kind === 'landmark' ? cell.reward : null,
      claimed: cell.kind === 'landmark' && cell.claimed,
      beacon: false,
      shimmer: false,
      rarity: cell.kind === 'tile' ? (cell.rarity ?? null) : null,
      native: cell.kind === 'empty' ? (cell.native ?? null) : null,
      remembered: false,
      ripe: ctx.ripe.has(k),
      targeted: ctx.targetCluster.has(k),
      // The colour lens: with a chip active, every OTHER colour's tiles step
      // back so one colour's holdings read as a single shape on the board.
      dimmed: spotlight !== null && cell.kind === 'tile' && cell.colour !== spotlight,
      worth: worthOf(state.cells, k, state.tuning, home),
      home: k === homeKey,
      light: lit(q, r),
      band: band(q, r),
      legal,
      preview: legal ? (previews?.get(k) ?? null) : null,
      previewColour: legal ? heldColour : null,
    };
  });

  // Ground this WORLD remembers from earlier runs (P4a), drawn faint under
  // everything: terrain re-derived from the same pure hash that made it, so
  // only the keys had to be kept. It is scenery and a map, never playable —
  // this run still has to grow its own way out there.
  //
  // Held territories unfurl their FIELDS in memory too (Marc, 2026-08-20:
  // "i still dont see clearly the territories" — the live reveal has
  // painted a held territory's field since P4a via the engine's
  // `claimedFields`, but this reconstruction read native ground off the
  // bare terrain hash, so a remembered territory was one ◈ standing in
  // plain ground with no footprint around it).
  const heldFields: { q: number; r: number; colour: Colour }[] = [];
  for (const ck of state.claimed) {
    const { q, r } = parse(ck);
    const held = destinationAt(state.rootSeed, q, r, state.tuning);
    if (held?.reward === 'territory' && held.colour !== null) {
      heldFields.push({ q, r, colour: held.colour });
    }
  }
  const heldFieldAt = (q: number, r: number): Colour | null => {
    for (const f of heldFields) {
      if (distance({ q, r }, f) <= state.tuning.territoryRadius) return f.colour;
    }
    return null;
  };

  const onBoard = new Set(Object.keys(state.cells));
  for (const k of memory) {
    if (onBoard.has(k)) continue;
    const { q, r } = parse(k);
    const ground = terrainAt(state.rootSeed, q, r, state.tuning);
    const dest = destinationAt(state.rootSeed, q, r, state.tuning);
    const nativeHere = dest === null && !ground.wall ? (heldFieldAt(q, r) ?? ground.native) : null;
    cells.push({
      key: k,
      q,
      r,
      kind: dest !== null ? 'landmark' : ground.wall ? 'wall' : 'empty',
      colour: dest?.colour ?? null,
      landmark: dest?.reward ?? null,
      claimed: dest !== null && state.claimed.includes(k),
      beacon: false,
      shimmer: false,
      remembered: true,
      rarity: null,
      native: nativeHere,
      light: lit(q, r),
      band: band(q, r),
      ripe: false,
      targeted: false,
      // The lens reaches into memory (Marc, 2026-08-20: "it highlights the
      // whole known biome"): with a colour spotlit — a card long-pressed,
      // or known fog ground tapped — every remembered patch NOT of that
      // colour steps back, so the known extent of one colour's ground
      // reads as a single shape through the fog.
      dimmed: spotlight !== null && (dest?.colour ?? nativeHere) !== spotlight,
      worth: 0,
      home: false,
      legal: false,
      preview: null,
      previewColour: null,
    });
  }

  // Destinations the board has not grown to yet, glowing through ground that
  // is not drawn: the endless world's somewhere-to-go. The horizon moves with
  // reach, so the next glow appears at the rim as you push toward the last.
  for (const d of beaconsFor(state, ctx.reach)) {
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
      shimmer: false,
      remembered: false,
      rarity: null,
      native: null,
      light: lit(d.q, d.r),
      band: band(d.q, d.r),
      ripe: false,
      targeted: false,
      dimmed: false,
      worth: 0,
      home: false,
      legal: false,
      preview: null,
      previewColour: null,
    });
  }

  // The shimmer (`findSense` > 0, sold as KEEN NOSE): a hidden find within
  // sense range of ANY cell of this run's board glows dimly — no glyph, no
  // kind, no atlas entry. This loop is the ONE consumer of `findsWithin`;
  // nothing else may draw an unrevealed find, because a find that shows
  // through the dark is a destination with extra steps. `findsCached` and
  // `ctx.ground` mirror `destinationsCached` and its beacon caller — before
  // this the scan ran uncached (O(blocks²) every render) over a ground list
  // re-parsed from scratch every render too, at O(cells) — real cost once
  // reach grows past a couple dozen.
  if (state.tuning.findSense > 0) {
    const sense = state.tuning.findSense;
    for (const f of findsCached(state.rootSeed, ctx.reach + sense + 1, state.tuning)) {
      const k = key(f.q, f.r);
      if (onBoard.has(k)) continue;
      if (!ctx.ground.some((h) => distance(h, f) <= sense)) continue;
      cells.push({
        key: k,
        q: f.q,
        r: f.r,
        kind: 'landmark',
        colour: null,
        landmark: null,
        claimed: false,
        beacon: false,
        shimmer: true,
        remembered: false,
        rarity: null,
        native: null,
        light: lit(f.q, f.r),
        band: band(f.q, f.r),
        ripe: false,
        targeted: false,
        dimmed: false,
        worth: 0,
        home: false,
        legal: false,
        preview: null,
        previewColour: null,
      });
    }
  }

  return { cells, targetHex: ctx.target };
}

/**
 * The last `destinationsWithin` answer, keyed on everything it depends on.
 *
 * The scan is O(blocks²) in the horizon and pure in (seed, horizon, tuning) —
 * and two selectors (beacons and the hint line) ask the identical question
 * every render, so at reach 18 the board was paying ~400 block hashes per
 * frame for one answer. The horizon only moves when reach does; this cache
 * makes the second ask (and most first asks) free.
 */
let lastDestinations: {
  seed: number;
  horizon: number;
  tuning: unknown;
  out: ReturnType<typeof destinationsWithin>;
} | null = null;

function destinationsCached(
  seed: number,
  horizon: number,
  tuning: GameState['tuning'],
): ReturnType<typeof destinationsWithin> {
  if (
    lastDestinations !== null &&
    lastDestinations.seed === seed &&
    lastDestinations.horizon === horizon &&
    lastDestinations.tuning === tuning
  ) {
    return lastDestinations.out;
  }
  const out = destinationsWithin(seed, horizon, tuning);
  lastDestinations = { seed, horizon, tuning, out };
  return out;
}

/**
 * The last `findsWithin` answer, keyed on everything it depends on — the
 * same last-value cache shape as `destinationsCached`, for the same reason:
 * the shimmer loop asks this once a render and the horizon only moves when
 * reach does, so most asks are free.
 */
let lastFinds: {
  seed: number;
  horizon: number;
  tuning: unknown;
  out: ReturnType<typeof findsWithin>;
} | null = null;

function findsCached(
  seed: number,
  horizon: number,
  tuning: GameState['tuning'],
): ReturnType<typeof findsWithin> {
  if (
    lastFinds !== null &&
    lastFinds.seed === seed &&
    lastFinds.horizon === horizon &&
    lastFinds.tuning === tuning
  ) {
    return lastFinds.out;
  }
  const out = findsWithin(seed, horizon, tuning);
  lastFinds = { seed, horizon, tuning, out };
  return out;
}

/**
 * Destinations within the beacon horizon that growth has not revealed yet.
 * The horizon is a disc around HOME (camps, 2026-08-19): `destinationsWithin`
 * scans a disc around the world origin — geography is world-anchored — so a
 * camp run scans wide enough to contain its own disc and then filters by
 * distance from where it actually woke. Home IS the origin in every run
 * without a camp, where the wider scan collapses to exactly the old one.
 */
function beaconsFor(
  state: GameState,
  reach: number,
): { q: number; r: number; reward: LandmarkReward; colour: Colour | null }[] {
  const home = homeOf(state);
  const horizon = reach + state.tuning.beaconHorizon;
  const scan = horizon + distance(home, { q: 0, r: 0 });
  return destinationsCached(state.rootSeed, scan, state.tuning).filter(
    (d) =>
      state.cells[key(d.q, d.r)] === undefined && distance({ q: d.q, r: d.r }, home) <= horizon,
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
  /** Depth is REACH: how far from home this run has built. */
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

  /**
   * False where the score is hidden until the run ends — points are the
   * between-runs payout, not a number to play against, so the HUD slot goes
   * to LUCK instead. The end screen always shows the score regardless.
   */
  readonly showPoints: boolean;

  /**
   * The luck purse and what it can buy. Empty where luck has no prices, which
   * is every game but the tiles-only one. A spend you cannot afford is still
   * LISTED — a shop with its expensive things hidden teaches you nothing.
   */
  readonly luck: number;
  readonly spends: readonly SpendView[];

  /**
   * Relics carried out of this run so far, and whether burning is what pays
   * them. The between-runs currency: shown on the end screen, and named on
   * the burn button so the sacrifice says what it buys.
   */
  readonly relics: number;
  readonly burnPaysRelics: boolean;

  /**
   * `colour` is the engine's `Colour`, not a string: the chrome looks up the
   * direction's name for it (`CRYPT`) and its CSS variable, and both of those are
   * exhaustive maps that a stray string would silently miss.
   */
  // The BEST marker used to ride here (the card whose strongest placement
  // pays most). Removed on Marc's call, 2026-08-19: the previews on the
  // board already print every card's numbers where they land, and the badge
  // was one more word on an already-worded card.
  readonly draft: readonly {
    readonly id: string;
    readonly colour: Colour;
    readonly rarity: Rarity;
    readonly selected: boolean;
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
  /**
   * Separate ripe pockets, not ripe tiles — POP · N READY counts decisions,
   * and a big pocket is still one decision.
   */
  readonly pocketsReady: number;
  /** What harvesting right now would pay, each way. Both are always shown. */
  readonly harvestTiles: number;
  readonly harvestPoints: number;
  /**
   * The priced pocket's distance multiplier — depth, in the one unit the
   * player already reads the board in. Where points are hidden mid-run
   * (`hidePoints`), this is what POP shows in place of the points figure it
   * used to leak regardless of the setting meant to hide it.
   */
  readonly harvestDepth: number;
  /** The pocket those prices are FOR, on the plane. Null on bounded maps. */
  readonly harvestAt: HexKey | null;

  /**
   * True when taking the priced pocket as POINTS collects the standing
   * bounty. The points button wears it, because a reason to press a button
   * belongs on the button.
   */
  readonly questPays: boolean;

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
   * What-still-glows (2026-08-18): the nearest unreached destination and how
   * far past the run's own edge it sits, for the end screen's run face.
   * Null while the run lives, and null when there is nothing left to name.
   */
  readonly glowBeyondEdge: string | null;
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
  // Shareable with `toBoardView` — see the parameter there.
  ctx: RenderContext = renderContext(state, harvestAt),
): HudView {
  const target = ctx.target;
  const value = ctx.value;
  const colours = colourPotentials(state);

  return {
    tiles: state.tiles,
    points: state.points,
    depthValue: ctx.reach,
    cost: costOf(state.placements, state.tuning),
    placements: state.placements,
    left: placementsLeft(state),
    tilesSpare: tilesSpareIn(state),

    showPoints: !state.tuning.hidePoints,
    luck: state.luck,
    spends: spendsFor(state),

    draft: state.draft.map((tile, i) => ({
      id: tile.id,
      colour: tile.colour,
      rarity: tile.rarity,
      selected: i === state.selected,
    })),

    canHold: state.tuning.holdSlots > 0,
    held: state.held === null ? null : { colour: state.held.colour, rarity: state.held.rarity },

    colours,
    spotlight: colours.find((c) => c.colour === spotlight) ?? null,

    ripeCount: ctx.ripe.size,
    pocketsReady: ctx.pocketCount,
    harvestTiles: value.tiles,
    harvestPoints: value.points,
    harvestDepth: harvestMultiplier(state, value.keys),
    harvestAt: target,

    questPays: value.questPays,
    harvestTreasure: value.treasure,
    // The sacrifice pays RELICS now: the between-runs currency, and the only
    // thing on this screen that is not about staying alive.
    harvestBurn:
      state.tuning.burnRelics > 0
        ? value.count * state.tuning.burnRelics
        : state.tuning.burnLuck > 0
          ? value.count * state.tuning.burnLuck
          : 0,
    burnPaysRelics: state.tuning.burnRelics > 0,
    relics: state.relics,
    singlePayout: state.tuning.singlePayout,

    canHarvest: state.phase === 'placing' && value.count > 0,

    guide: guideFor(state, ctx),
    hint: hintFor(state, ctx.reach),
    odds: oddsFor(state),

    ended: state.phase === 'ended',
    epitaph: state.phase === 'ended' ? epitaphFor(state) : null,
    glowBeyondEdge: state.phase === 'ended' ? whatGlows(state, ctx.reach) : null,
    summary: state.phase === 'ended' ? summariseRun(state) : null,
  };
}

/**
 * One purchase in the luck shop: what it is called, what it costs, and
 * whether the purse can pay for it right now.
 *
 * Steering is listed once per colour rather than offered as a mode, because a
 * mode is a second tap and a state to be in; four labelled buttons are four
 * things you can do. Each wears the world's own word for its colour.
 */
export type SpendView = {
  readonly on: Spend;
  readonly colour: Colour | null;
  readonly cost: number;
  readonly affordable: boolean;
  /**
   * TITHE only (2026-08-18): what the WHOLE purse converts into right now —
   * `cost` for every other spend is a fixed price, but a tithe's price IS
   * the purse, so this is the number the row actually needs to print.
   */
  readonly relics?: number;
};

/** The shop, in the order it reads: cheapest first, forge — then tithe, the exit from the purse. */
function spendsFor(state: GameState): readonly SpendView[] {
  const t = state.tuning;
  const rows: SpendView[] = [];
  if (t.luckRerollCost > 0) {
    rows.push({
      on: 'reroll',
      colour: null,
      cost: spendCost(t, 'reroll'),
      affordable: canSpend(state, 'reroll'),
    });
  }
  if (t.luckSteerCost > 0) {
    for (const colour of COLOURS) {
      rows.push({
        on: 'steer',
        colour,
        cost: spendCost(t, 'steer'),
        affordable: canSpend(state, 'steer'),
      });
    }
  }
  if (t.luckForgeCost > 0) {
    rows.push({
      on: 'forge',
      colour: null,
      cost: spendCost(t, 'forge'),
      affordable: canSpend(state, 'forge'),
    });
  }
  if (t.titheRate > 0 && t.titheMin > 0) {
    rows.push({
      on: 'tithe',
      colour: null,
      cost: state.luck,
      affordable: canSpend(state, 'tithe'),
      relics: Math.floor(state.luck * t.titheRate),
    });
  }
  return rows;
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
  const home = homeOf(state);
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind !== 'tile') continue;
    const entry = acc.get(cell.colour);
    if (entry === undefined) continue;
    const worth = worthOf(state.cells, k, t, home);
    entry.count++;
    entry.worth += worth;
    entry.bonus += worth - worthOf(state.cells, k, plain, home);
    if (isRipe(state.cells, k)) {
      entry.ripeCount++;
      entry.ripeWorth += worth;
    }
  }
  return COLOURS.map((colour) => ({ colour, ...acc.get(colour)! }));
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
function guideFor(state: GameState, ctx: RenderContext): string | null {
  if (state.phase !== 'placing') return null;

  const ripe = ctx.ripe.size > 0;
  const single = state.tuning.singlePayout;
  if (runwayOf(state) <= RUNWAY_ALARM) {
    if (ripe)
      return single ? 'Low on tiles — POP a pocket now' : 'Low on tiles — POP a pocket for tiles';
    return 'Low on tiles — ripen something to POP';
  }
  if (ripe) {
    // The DEFAULT pocket, deliberately — this line's words must not change
    // because a different pocket happens to be tapped. See `defaultValue`.
    const value = ctx.defaultValue;
    if (value.questPays) return 'BOUNTY READY — POP this pocket as pts';
    // More tiles than the clock can spend: the survival button is dead and
    // saying so is the whole job of this line.
    if (tilesSpareIn(state)) return 'More tiles than you can spend — POP for PTS from here on';
    // POP · N pockets ready: how many separate decisions are sitting on the
    // board right now, not how many tiles — a 12-tile pocket is one of them,
    // same as a 2-tile one. Singular wording stays where there is only one.
    const pockets = ctx.pocketCount > 1 ? `${ctx.pocketCount} pockets ready` : 'Pocket ready';
    return single
      ? `${pockets} — tap one to price it, then POP or sacrifice it`
      : `${pockets} — tap one, then POP for tiles or pts`;
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
 * The nearest unclaimed destination — revealed or beacon — found once and
 * shared by `hintFor` (the live signpost) and `whatGlows` (the end screen's
 * what-still-glows line, 2026-08-18) so the two can never name a different
 * destination or disagree on distance. NEVER a find: this is what a player
 * may be TOLD about, and a find is the one landmark that stays a secret.
 */
function nearestUnclaimed(
  state: GameState,
  reach: number,
): { reward: LandmarkReward; dist: number; at: HexKey } | null {
  let best: { reward: LandmarkReward; dist: number; at: HexKey } | null = null;
  const consider = (q: number, r: number, reward: LandmarkReward): void => {
    const dist = distance({ q, r }, { q: 0, r: 0 });
    if (best === null || dist < best.dist) best = { reward, dist, at: key(q, r) };
  };

  for (const [k, cell] of Object.entries(state.cells)) {
    // A find is never advertised, not even revealed: the hint line is a
    // signpost, and a signpost to a hidden thing is a beacon in words.
    if (cell.kind === 'landmark' && !cell.claimed && cell.reward !== 'find') {
      const { q, r } = parse(k);
      consider(q, r, cell.reward);
    }
  }
  const horizon = reach + state.tuning.beaconHorizon;
  for (const d of destinationsCached(state.rootSeed, horizon, state.tuning)) {
    if (state.cells[key(d.q, d.r)] === undefined) consider(d.q, d.r, d.reward);
  }
  return best;
}

/** What `nearestUnclaimed` found, in words — "a cache of 40 tiles", and so on. */
function nameDestination(reward: LandmarkReward, at: HexKey, t: Tuning): string {
  return reward === 'cache'
    ? `a cache of ${cachePaysAt(at, t)} tiles`
    : reward === 'site'
      ? 'a scoring site'
      : reward === 'shrine'
        ? 'a shrine'
        : 'a territory to claim';
}

const capitalize = (s: string): string => `${s[0]!.toUpperCase()}${s.slice(1)}`;

/**
 * The nearest unclaimed destination — revealed or beacon — named and priced
 * in the one unit the player already reads the board in: hexes out.
 */
function hintFor(state: GameState, reach: number): string | null {
  const best = nearestUnclaimed(state, reach);
  if (best === null) return null;
  const { reward, dist, at } = best;
  return `${capitalize(nameDestination(reward, at, state.tuning))} glows ${dist} out`;
}

/**
 * What-still-glows (2026-08-18): the end screen's own version of the
 * signpost, in the run's own edge — how far PAST where the run actually got
 * to, not how far from home, which is what "still glows" means once the run
 * is over. Reuses `hintFor`'s language and its never-a-find rule exactly;
 * the only thing that changes is the distance the sentence reports.
 */
export function whatGlows(state: GameState, reach: number): string | null {
  const best = nearestUnclaimed(state, reach);
  if (best === null) return null;
  const { reward, dist, at } = best;
  const beyond = Math.max(0, dist - reach);
  return `${capitalize(nameDestination(reward, at, state.tuning))} still glows ${beyond} past your edge.`;
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

/**
 * Gate D wants the end screen to name the cause of death in one sentence. The
 * sentence's job is to say WHY it happened — the cost of a placement having
 * climbed past what the board could pay back is the whole arc of a run, and it
 * should be the last thing the player reads.
 *
 * Exported since 2026-08-20: the hall of fame's diary stores this sentence
 * FINISHED on each run's tick (`RunDetail.epitaph`), so a reopened row says
 * exactly what the screen said — one source of words, kept, not re-derived.
 */
export function epitaphFor(state: GameState): string {
  if (state.death === 'spent') {
    const unripe = Object.values(state.cells).filter((c) => c.kind === 'tile').length;
    return (
      `The expedition is over — ${state.placements} placements spent. ` +
      (unripe > 0
        ? `${unripe} tile${unripe === 1 ? '' : 's'} left standing, never popped.`
        : `Everything you built was popped.`)
    );
  }
  if (state.death === 'walled') {
    return `Walled in after ${state.placements} placements — nowhere left to build, nothing left to pop.`;
  }
  const cost = costOf(state.placements, state.tuning);
  const where = 'on the plane';
  return (
    `Out of tiles ${where}, after ${state.placements} placements. ` +
    `They cost ${cost} each by the end.`
  );
}

/**
 * The native colour the FOG shows at a remembered hex — the tap's answer,
 * exported so `game.ts`'s fog lens (Marc, 2026-08-20: "on clicking a tile
 * in the fog that we know the biome it highlights the whole known biome")
 * names exactly the colour `toBoardView`'s memory pass painted there:
 * a held territory's unfurled field first, the terrain's own native
 * ground otherwise, nothing on walls and landmarks. Null is "the fog
 * knows no colour here", and the lens has nothing to hold.
 */
export function rememberedNativeAt(state: GameState, hex: HexKey): Colour | null {
  const { q, r } = parse(hex);
  const ground = terrainAt(state.rootSeed, q, r, state.tuning);
  if (ground.wall) return null;
  if (destinationAt(state.rootSeed, q, r, state.tuning) !== null) return null;
  for (const ck of state.claimed) {
    const centre = parse(ck);
    const held = destinationAt(state.rootSeed, centre.q, centre.r, state.tuning);
    if (
      held?.reward === 'territory' &&
      held.colour !== null &&
      distance({ q, r }, centre) <= state.tuning.territoryRadius
    ) {
      return held.colour;
    }
  }
  return ground.native;
}
