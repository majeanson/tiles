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
  ripeKeys,
  scoreOf,
  withinBeaconHorizon,
  worthOf,
} from '@engine/rules';
import type {
  GameState,
  HarvestChoice,
  LandmarkReward,
  PointsSplit,
  Rarity,
  Spend,
} from '@engine/state';
import {
  destinationAt,
  destinationsWithin,
  elevationBandAt,
  findAt,
  findsWithin,
  terrainAt,
} from '@engine/world';
import {
  brightness,
  COLOUR_MARK,
  CONCEPT_MARK,
  LANDMARK_GLYPH,
  type Light,
  type Theme,
} from '@theme/tokens';
import type { BoardView, CellKind, CellView } from '@render/Renderer';
import { LUCK_CORE } from './glossary';

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

/*
 * `resolveHarvestTarget` lived here until 2026-08-21 — the rule for which
 * pocket the harvest buttons price: a tapped ripe tile targets its own
 * cluster, and with no tap (or a stale one, since popped) the biggest pocket
 * is the default, so the buttons are never dead while anything is ripe.
 *
 * It was exported and called by nobody. `renderContext` owns that rule now,
 * and owns it BECAUSE it has already walked the ripe set once for the render:
 * a standalone helper would re-walk the whole board to answer the same
 * question, which is the exact cost the context exists to stop paying. So it
 * is superseded rather than merely unused, and the rule belongs where the
 * data already is.
 */

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
          map.set(k, previewWorth(state.cells, k, tile, state.tuning, home, state.luck));
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
      lensed: spotlight !== null && cell.kind === 'tile' && cell.colour === spotlight,
      worth: worthOf(state.cells, k, state.tuning, home, state.luck),
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
    // A reborn landmark wears its NEW face in the fog too (2026-08-20): a
    // woken shrine rolled into a cache this run must not still read ◈ on
    // the map — the map is a promise about what walking there pays.
    const reborn = state.rearmed[k];
    const dest =
      reborn !== undefined
        ? { reward: reborn, colour: null }
        : destinationAt(state.rootSeed, q, r, state.tuning);
    const nativeHere = dest === null && !ground.wall ? (heldFieldAt(q, r) ?? ground.native) : null;
    cells.push({
      key: k,
      q,
      r,
      kind: dest !== null ? 'landmark' : ground.wall ? 'wall' : 'empty',
      colour: dest?.colour ?? null,
      landmark: dest?.reward ?? null,
      claimed: dest !== null && reborn === undefined && state.claimed.includes(k),
      beacon: false,
      shimmer: false,
      remembered: true,
      rarity: null,
      native: nativeHere,
      // MAP light, not torch light (Marc, 2026-08-20, with a screenshot:
      // "we still cant see grounds clearly in the fog, its too dark"): the
      // torch's distance falloff was multiplying INTO the fog's own alpha,
      // so remembered ground more than a few hexes from the live structure
      // was doubly dark — black on black. Memory is a map the player is
      // reading, not ground the torch is lighting; it draws at full light
      // and lets `fog.alpha` and `fog.veil` alone say "not this run".
      light: 1,
      band: band(q, r),
      ripe: false,
      targeted: false,
      // The lens reaches into memory (Marc, 2026-08-20: "it highlights the
      // whole known biome"): with a colour spotlit — a card long-pressed,
      // or known fog ground tapped — every remembered patch NOT of that
      // colour steps back, so the known extent of one colour's ground
      // reads as a single shape through the fog.
      dimmed: spotlight !== null && (dest?.colour ?? nativeHere) !== spotlight,
      // The lens's positive half reaches memory too (Marc, Day 2: "the
      // lit shape is subtle"): matching fog draws brighter and edged in
      // its own colour, not merely un-dimmed.
      lensed: spotlight !== null && (dest?.colour ?? nativeHere) === spotlight,
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
    // The beacon wears the reborn face too (2026-08-20) — a woken shrine
    // rolled into a site this run glows as the ★ walking there will pay.
    const reborn = state.rearmed[key(d.q, d.r)];
    cells.push({
      key: key(d.q, d.r),
      q: d.q,
      r: d.r,
      kind: 'landmark',
      colour: reborn !== undefined ? null : d.colour,
      landmark: reborn ?? d.reward,
      claimed: reborn === undefined && state.claimed.includes(key(d.q, d.r)),
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
      lensed: false,
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
    // Widened by the home offset (2026-08-21): `findsWithin` scans a disc
    // around world ORIGIN, and `ctx.reach` is measured from HOME, so a camp
    // run asked for a disc that did not contain its own ground and the
    // purchased perk shimmered nothing. The ground filter below is what
    // actually decides what draws, so a wider scan costs blocks, not truth.
    const scan = ctx.reach + sense + 1 + distance(homeOf(state), ORIGIN_HEX);
    for (const f of findsCached(state.rootSeed, scan, state.tuning)) {
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
        lensed: false,
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

  /**
   * How many cards the hand DEALS, which is not always how many it is
   * holding: stashing into an empty slot takes the card out of the draft and
   * nothing puts one back until the next placement. The hand is laid out from
   * this rather than from `draft.length`, so its shape does not change under
   * a thumb for the two taps in between (Marc, 2026-08-27).
   */
  readonly draftWidth: number;

  /** Whether the stash exists at all (`tuning.holdSlots > 0`). */
  readonly canHold: boolean;
  /** How many slots the stash has — 1, or 2 once that shrine is woken. */
  readonly holdSlots: number;
  /** The stashed tiles, oldest first. Shorter than `holdSlots` when there is
   *  room left; empty while the stash sits unused. */
  readonly held: readonly { readonly colour: Colour; readonly rarity: Rarity }[];

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
    /**
     * Where the run's POP points came from, counted three ways (2026-08-27,
     * Marc: "in our stats end run we could see our points distribution").
     * Every scoring harvest's own `split`, summed. `null` when the run banked
     * nothing from pops, and when a run saved before today is finished — its
     * harvests carry no splits and inventing zeroes would be a lie shaped
     * like data.
     */
    readonly points: PointsSplit | null;
    /** Points paid by claiming sites outright — see `log.sitePoints`. */
    readonly sitePoints: number;
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
    draftWidth: Math.max(0, state.tuning.draftWidth),

    canHold: state.tuning.holdSlots > 0,
    holdSlots: Math.max(0, state.tuning.holdSlots),
    held: state.held.map((t) => ({ colour: t.colour, rarity: t.rarity })),

    colours,
    spotlight: colours.find((c) => c.colour === spotlight) ?? null,

    ripeCount: ctx.ripe.size,
    pocketsReady: ctx.pocketCount,
    harvestTiles: value.tiles,
    // Through scoreOf, not raw (2026-08-25, Marc with two screenshots: "what
    // it says as points is not what it does" — the button promised 13974 and
    // the pop banked 4890). harvestValue's points are PRE-scale; the reducer
    // banks scoreOf(points), which applies pointsPerPop under the single
    // payout. The receipt and the manual both went through scoreOf since
    // 2026-08-21; the button was the one reader left on the raw figure. Under
    // the old fork economy scoreOf is the identity, so this is one honest
    // number for both.
    harvestPoints: scoreOf(value.points, state.tuning),
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
  const points = emptySplit();
  let anySplit = false;
  for (const h of state.log.harvests) {
    // Same fix as `recordRun` (2026-08-21): a burn and a treasure are
    // sacrifices, not a payout taken one way rather than the other, and
    // `else` was filing both as points.
    if (h.choice === 'burn' || h.choice === 'treasure') continue;
    if (h.choice === 'tiles') tilesTaken++;
    else pointsTaken++;
    if (h.points > biggestHarvest) {
      biggestHarvest = h.points;
      biggestPlacement = h.at;
    }
    if (h.split !== undefined) {
      anySplit = true;
      addSplit(points, h.split);
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
    points: anySplit ? points : null,
    sitePoints: state.log.sitePoints ?? 0,
  };
}

/** A zeroed split, to fold every harvest's own into. */
function emptySplit(): Mutable<PointsSplit> {
  return {
    total: 0,
    byColour: { green: 0, yellow: 0, red: 0, blue: 0 },
    byRarity: { common: 0, magic: 0, unique: 0 },
    bySource: {
      matches: 0,
      power: 0,
      rare: 0,
      native: 0,
      pocket: 0,
      distance: 0,
      bounty: 0,
    },
  };
}

/**
 * Add one harvest's split into the running total, in place.
 *
 * Summing whole points rather than re-deriving from worth is what keeps the
 * run's three axes agreeing with each other: each harvest already settled its
 * own rounding against its own banked points (`pointsSplit`), so the sums
 * inherit that and cannot drift.
 */
function addSplit(into: Mutable<PointsSplit>, from: PointsSplit): void {
  into.total += from.total;
  for (const c of COLOURS) into.byColour[c] += from.byColour[c];
  for (const r of ['common', 'magic', 'unique'] as const) into.byRarity[r] += from.byRarity[r];
  for (const k of Object.keys(into.bySource) as (keyof PointsSplit['bySource'])[]) {
    into.bySource[k] += from.bySource[k];
  }
}

/** Writable mirror of `PointsSplit`, for the fold above and nowhere else. */
type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends object ? { -readonly [J in keyof T[K]]: T[K][J] } : T[K];
};

/**
 * Gate D's question, answered in words (2026-08-26): where the run's biggest
 * pop landed, as one sentence under the arc — the facts grid has printed
 * "BIGGEST POP n at 43%" since 2026-08-20, and a percentage is a fact
 * half-shown. Earned, not constant: null until the run popped at least three
 * times, because a shape needs more than two points to have one.
 */
export function arcNote(summary: NonNullable<HudView['summary']>): string | null {
  if (summary.harvests < 3 || summary.biggestHarvest <= 0) return null;
  if (summary.biggestAt >= 2 / 3) {
    return 'The run built to it — your biggest pop landed in the final stretch.';
  }
  if (summary.biggestAt >= 1 / 3) {
    return 'Your biggest pop came mid-run; the tail never topped it.';
  }
  return 'Your biggest pop came early — everything after grew in its shadow.';
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
    const worth = worthOf(state.cells, k, t, home, state.luck);
    entry.count++;
    entry.worth += worth;
    entry.bonus += worth - worthOf(state.cells, k, plain, home, state.luck);
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
  // No standing default any more (Marc, 2026-08-26: "remove place tiles
  // surround one on all six sides text"). The teaching cards own that
  // sentence's job now — RIPE fires at the first surround — and a line that
  // sat there being true the whole run was spending a row on it. The guide
  // still speaks when it has something situational to say: the runway
  // alarm and the pocket-ready calls above.
  return null;
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
  // Everything here measures from HOME (2026-08-21). It used to measure the
  // candidates from world ORIGIN while the horizon below was built from a
  // home-anchored `reach` — two rulers in one function. On a camp run that
  // reported an adjacent cache as "glows 16 out", and scanned a disc around
  // origin that did not contain the player at all, so the beacons actually
  // drawn were never candidates and the candidates were never drawn.
  const home = homeOf(state);
  let best: { reward: LandmarkReward; dist: number; at: HexKey } | null = null;
  const consider = (q: number, r: number, reward: LandmarkReward): void => {
    const dist = distance({ q, r }, home);
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
  // The scan is a disc around origin, so a home away from origin needs it
  // widened by that offset before the home-anchored horizon can filter it —
  // exactly what `beaconsFor` already does, and what this did not.
  const scan = horizon + distance(home, ORIGIN_HEX);
  for (const d of destinationsCached(state.rootSeed, scan, state.tuning)) {
    if (distance({ q: d.q, r: d.r }, home) > horizon) continue;
    if (state.cells[key(d.q, d.r)] === undefined) consider(d.q, d.r, d.reward);
  }
  return best;
}

/** What `nearestUnclaimed` found, in words — "a cache of 40 tiles", and so on. */
function nameDestination(
  reward: LandmarkReward,
  at: HexKey,
  t: Tuning,
  home: { q: number; r: number },
): string {
  return reward === 'cache'
    ? // Priced from HOME, like the payment and the two banners (2026-08-21).
      `a cache of ${cachePaysAt(at, t, home)} tiles`
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
  return `${capitalize(nameDestination(reward, at, state.tuning, homeOf(state)))} glows ${dist} out`;
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
  // "0 past your edge" is a sentence only a computer would say (Marc's
  // phone, 2026-08-26) — a destination the run drew level with but never
  // touched gets its own words.
  const name = capitalize(nameDestination(reward, at, state.tuning, homeOf(state)));
  if (beyond === 0) return `${name} still glows right at your edge.`;
  return `${name} still glows ${beyond} past your edge.`;
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
 *
 * A POOL per cause since 2026-08-26: the diary shows every run's last line in
 * a column, and two sentences were carrying all of them — a museum of runs
 * reading as one stamp. Every sentence still says WHY, with the same facts
 * (the placements, the final cost); only the framing varies. The pick is a
 * pure hash of the run's own facts, never a die roll, because the same ended
 * run must speak the same sentence every time it is re-rendered.
 */
const BROKE_EPITAPHS: readonly ((placements: number, cost: number) => string)[] = [
  (p, cost) =>
    `Out of tiles on the plane, after ${p} placements. They cost ${cost} each by the end.`,
  (p, cost) =>
    `The purse ran dry after ${p} placements — ${cost} a tile at the end, and nothing left to pay it.`,
  (p, cost) =>
    `${p} placements, and the last tile went down alone. The next would have cost ${cost}.`,
  (p, cost) => `The expedition spent itself: ${p} placements, the price risen to ${cost}.`,
  (p, cost) => `No tiles left after ${p} placements. The plane was charging ${cost} each by then.`,
  (p, cost) =>
    `The torch carried ${p} placements out. At ${cost} a tile, the dark had the last one.`,
  (p, cost) =>
    `Every tile spent — ${p} placements, with the cost at ${cost} and the purse at nothing.`,
  (p, cost) =>
    `${p} placements, then the hand came up empty. Tiles were ${cost} apiece at the end.`,
];

const WALLED_EPITAPHS: readonly ((placements: number) => string)[] = [
  (p) => `Walled in after ${p} placements — nowhere left to build, nothing left to pop.`,
  (p) => `The stone closed in at ${p} placements. Every open hex was spoken for.`,
  (p) => `${p} placements, and the walls had the last word.`,
  (p) => `Nowhere left to stand after ${p} placements — the plane walled the run in.`,
  (p) => `The run built itself into a corner: ${p} placements, and no ground a tile could take.`,
  (p) => `Stone on every side after ${p} placements. The way out never opened.`,
];

/** The deterministic pick: the world and the run's length, hashed, never rolled. */
function epitaphIndex(state: GameState, poolSize: number): number {
  return (Math.imul(state.rootSeed ^ state.placements, 2654435761) >>> 0) % poolSize;
}

export function epitaphFor(state: GameState): string {
  if (state.death === 'spent') {
    // Unreachable in the shipped economy (`runLength: 0`), kept for the day
    // a clock returns — one sentence is honest cover for a door nobody
    // walks through.
    const unripe = Object.values(state.cells).filter((c) => c.kind === 'tile').length;
    return (
      `The expedition is over — ${state.placements} placements spent. ` +
      (unripe > 0
        ? `${unripe} tile${unripe === 1 ? '' : 's'} left standing, never popped.`
        : `Everything you built was popped.`)
    );
  }
  if (state.death === 'walled') {
    return WALLED_EPITAPHS[epitaphIndex(state, WALLED_EPITAPHS.length)]!(state.placements);
  }
  const cost = costOf(state.placements, state.tuning);
  return BROKE_EPITAPHS[epitaphIndex(state, BROKE_EPITAPHS.length)]!(state.placements, cost);
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
  // A reborn landmark (2026-08-20) is a landmark, not ground: the tap
  // should describe the cache or site standing there, never turn the lens.
  if (state.rearmed[hex] !== undefined) return null;
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

/**
 * The last-gasp rule, one clause for its three doors (the toast, the manual,
 * the COST tap note) — the same cannot-drift contract RELIC_LESSON (in
 * `game.ts`) and `colourLesson` keep for their own multi-door words.
 */
export const LAST_GASP_RULE =
  'You may place while ANY tiles remain — the difference is forgiven at zero, and it cannot chain: only a pop can lift you back above zero.';

/** A rare tile's power, in one line, or null for an ordinary one. */
export function rarityLine(rarity: Rarity | undefined): string | null {
  if (rarity === 'magic') {
    return 'MAGIC — wild: it matches every neighbouring tile, whatever the colour, and they match it back.';
  }
  if (rarity === 'unique') {
    return 'UNIQUE — wild and heavy: every match it is part of counts DOUBLE, for both sides.';
  }
  return null;
}

/**
 * The pocket you just tapped, priced and explained — size, worth, what each
 * button would pay, and any rare tiles inside it. The buttons already carry
 * the numbers; this says where those numbers come FROM, which is the part a
 * player has to learn once and then never again.
 */
export function pocketNote(state: GameState, at: HexKey): string {
  const t = state.tuning;
  const value = harvestValue(state, at);
  const home = homeOf(state);
  const worth = value.keys.reduce((n, k) => n + worthOf(state.cells, k, t, home, state.luck), 0);
  const multiplier = harvestMultiplier(state, value.keys);

  // Rare tiles inside the pocket, and what each kind does — a ripe rare
  // tile cannot be tapped for its own explanation, because tapping it
  // prices the pocket, so the pocket has to carry the explanation.
  const rarities = new Set<Rarity>();
  for (const k of value.keys) {
    const cell = state.cells[k];
    if (cell?.kind === 'tile' && cell.rarity !== undefined) rarities.add(cell.rarity);
  }
  const rares = value.keys.filter((k) => {
    const cell = state.cells[k];
    return cell?.kind === 'tile' && cell.rarity !== undefined;
  }).length;

  // Written for the SINGLE payout (2026-08-21). These lines predate it:
  // they read "POP for tiles" and "POP for pts" as if the two were a fork
  // to choose between, and the points button has been hidden since the
  // payout became one thing. A pop pays both, so the note prices both.
  const pocketBonus = Math.min(value.count, t.harvestSizeCap > 0 ? t.harvestSizeCap : value.count);
  const lines = [
    `POCKET OF ${value.count} — total worth ${worth}.`,
    `POP pays +${value.tiles} tiles and ${scoreOf(value.points, t)} pts.`,
    `The score: worth ${worth} × pocket ${pocketBonus} × distance ${multiplier}${value.questPays ? ` × bounty ${t.questBonus}` : ''}.`,
  ];
  // The pocket bar (2026-08-18): the priced pocket's count against the size
  // bonus's cap — "POCKET 14/20" — once it is within reach of mattering.
  // Always showing "1/20" is noise nobody reads twice; 2+ is the point a
  // pocket has started becoming a decision rather than a single tile.
  if (t.harvestSizeCap > 0 && value.count >= 2) {
    lines.push(`POCKET ${value.count}/${t.harvestSizeCap}`);
  }
  if (value.treasure !== null)
    lines.push(`POP for treasure: a ${value.treasure.toUpperCase()} tile.`);
  if (value.questPays)
    // Every pop scores under the single payout, so the bounty rides on any
    // of them — this rider named a button that no longer exists.
    lines.push(
      `${LANDMARK_GLYPH.site} This pocket collects the bounty: ×${t.questBonus} on its score.`,
    );
  if (rares > 0) {
    lines.push(`${rares} rare tile${rares === 1 ? '' : 's'} in here will be spent by popping it.`);
  }
  return lines.join('\n');
}

/**
 * What a harvest just did, with its arithmetic shown.
 *
 * The pop is the loudest thing that happens in a run and it used to leave
 * only a number moving in the stat row. Saying the sum out loud at the
 * moment it pays is the cheapest teaching in the game: two or three of
 * these and the formula stops being a thing to read in the manual.
 */
export function harvestNote(
  before: GameState,
  choice: HarvestChoice,
  value: ReturnType<typeof harvestValue>,
): string {
  const t = before.tuning;
  const homeBefore = homeOf(before);
  const worth = value.keys.reduce(
    (n, k) => n + worthOf(before.cells, k, t, homeBefore, before.luck),
    0,
  );
  const multiplier = harvestMultiplier(before, value.keys);
  const head = `POPPED ${value.count} — total worth ${worth}`;

  // The bounty answers EVERY pop while it is live (Marc, Day 2: "when we
  // pop, the ×3 applied or not — success or not — with points or +0"):
  // collected says so with its number, missed says so with the recipe.
  // Silent only while no ★ has set one — and on the two pops that score
  // nothing, TREASURE and BURN, which forfeit the bounty and leave it
  // standing rather than missing it. The multiplier is read from the
  // STANDING bounty, never from tuning: the quest carries its own bonus,
  // and it is the one the engine multiplies by.
  const bounty =
    before.quest === null || choice === 'treasure' || choice === 'burn'
      ? ''
      : value.questPays
        ? `\n${LANDMARK_GLYPH.site} Bounty ×${before.quest.bonus} — COLLECTED.`
        : `\n${LANDMARK_GLYPH.site} Bounty ×${before.quest.bonus} — missed (+0). Pop ${before.quest.need}+ tiles within ${before.quest.radius} of the ${LANDMARK_GLYPH.site}.`;

  if (choice === 'tiles') {
    // The true gain, matching `reduce.ts`'s own arithmetic exactly (flat
    // per pop plus a little per tile, then rounded and capped) — the old
    // line here printed the pocket's tile count, which is a different
    // number that only coincidentally looked plausible.
    const perPop =
      t.luckPerPop > 0 || t.luckPerTile !== 1
        ? t.luckPerPop + value.count * t.luckPerTile
        : value.count;
    const gained = Math.min(t.luckCap, Math.round(before.luck + perPop)) - before.luck;
    // The odds claim is only true when luck actually moves the draft's
    // rare-tile chances — in the shipped economy it does not, and saying
    // so anyway was the other half of this line lying.
    const odds =
      t.luckMagicPerPop + t.luckUniquePerPop > 0 ? ' Your rare-tile odds just rose.' : '';
    const luck = `\nLuck +${gained}.${odds}`;
    // The depth grade, shown only when it actually paid something — the
    // arithmetic on screen has to sum to the number on screen.
    const rings = Math.floor(value.count * t.popTilesPerRing * (multiplier - 1));
    const depth = rings > 0 ? `, +${rings} for the depth` : '';
    // Under the single payout the pop SCORES too — say the number here
    // rather than leaving it to the stat row (the bounty line below
    // needs a points figure to be about).
    // Through `scoreOf`, not a second copy of the arithmetic (2026-08-21):
    // this line used to spell `floor(points * pointsPerPop)` itself, and
    // would have gone on printing the zero the engine stopped banking the
    // day a scoring pop gained its floor of one.
    const scored =
      t.singlePayout && t.pointsPerPop > 0 ? `\n+${scoreOf(value.points, t)} pts.` : '';
    return `${head}\n+${value.tiles} tiles: ${t.tilesPerPop} per tile, +1 more per ${t.worthPerExtraTile} worth${depth}.${scored}${luck}${bounty}`;
  }
  if (choice === 'treasure') {
    return `${head}\nA ${String(value.treasure).toUpperCase()} tile goes to your stash — no tiles, no points.`;
  }

  const counted = t.harvestSizeCap > 0 ? Math.min(value.count, t.harvestSizeCap) : value.count;
  const capped =
    t.harvestSizeCap > 0 && value.count > t.harvestSizeCap
      ? ` (the size bonus stops at ${t.harvestSizeCap})`
      : '';
  return (
    `${head}\n+${value.points} pts = worth ${worth} × pocket ${counted}${capped} × distance ${multiplier}` +
    (value.questPays ? ` × BOUNTY ${t.questBonus}` : '') +
    bounty
  );
}

/**
 * One line of a set: a mark, and the sentence beside it.
 *
 * The four-grounds card (2026-08-27) proved the shape — a swatch in the
 * ground's own fill, the ground's own sentence beside it — and this is that
 * shape given a name so the manual and the other set-teaching cards can wear
 * it too. A row carries EITHER a `colour` (drawn as the swatch) or a `glyph`
 * from the game's own registry, or neither, in which case the mark column is
 * still reserved so the sentences line up.
 *
 * No row invents a symbol. `COLOUR_MARK` and `LANDMARK_GLYPH` are the whole
 * vocabulary (`theme/tokens.ts` states the rule), and a spend like REDRAW has
 * never had a mark in this game — so it gets none here rather than a new one.
 */
export type TipRow = {
  readonly text: string;
  /** A ground, drawn as its own swatch. */
  readonly colour?: Colour;
  /** A glyph from the registry, for a row that is not a ground. */
  readonly glyph?: string;
  /**
   * The ground's REAL baked tile, as a data URL (2026-08-27, Marc: "can we
   * have visuals with real tiles or examples in the how to play and hand and
   * such? so we have a visual with real in game assets").
   *
   * The same canvas `bakeSurface` hands the draft card — texture, gradient,
   * inset and all — so the square beside a colour's name stops being an
   * approximation of the tile and becomes the tile. Optional because a caller
   * without a canvas (a bare test, the gallery) has nothing to bake with, and
   * the flat `colour` swatch is still a correct, if plainer, mark.
   */
  readonly art?: string;
};

/** A card that teaches a set: the lead, and the rows under it. */
export type SetLesson = { readonly text: string; readonly rows: readonly TipRow[] };

/**
 * The purse fold's first-contact card (Marc, 2026-08-20), built from the
 * LIVE tuning like every explanation in the game: only rows whose dials
 * are on get named, the rates are the run's own numbers, and the one fact
 * the fold's prices never say leads the close — luck is use-it-or-lose-it.
 *
 * ROWS since 2026-08-27 (Marc: "make sure the luck is for spending card is
 * explained with new lines, not a whole paragraph — similar to the 4 tiles
 * explained"). It was one sentence with the four ground names parenthesised
 * inside a semicolon list inside a clause: every spend the fold offers,
 * collapsed into prose you had to parse to use. The buttons are a LIST, so
 * the card is a list — one row per button, each quoting its own button face
 * and its own price, and the four steers wearing the ground colours the
 * buttons are bordered with.
 */
export function purseLesson(t: Tuning, theme: Theme): SetLesson {
  // Named as the BUTTONS are named (2026-08-27, Marc: "first luck drawer
  // expand we should explain all actions" — a second time, because the
  // first answer did not land). The card used to say "a fresh hand
  // (REROLL)" over a button reading REDRAW, and "a hand drawn toward a
  // colour you name (STEER)" over four buttons wearing the ground's own
  // names, with the word STEER nowhere on screen. It explained all the
  // actions in a vocabulary that matched none of them, which is the same
  // as explaining none. Every row below now quotes its own button face.
  const n = theme.terrainNames;
  const rows: TipRow[] = [
    ...(t.luckRerollCost > 0
      ? [{ text: `REDRAW · ${t.luckRerollCost} — throw this hand away for a new one.` }]
      : []),
    // One row per BUTTON, in the order the fold draws them (`spendsFor`):
    // redraw, the four grounds, forge, tithe. The steers were a parenthesised
    // list inside somebody else's sentence; they are four buttons on screen,
    // so they are four lines here, each wearing its ground's own colour.
    ...(t.luckSteerCost > 0
      ? COLOURS.map((colour): TipRow => ({
          colour,
          text:
            `${COLOUR_MARK[colour]} ${n[colour]} · ${t.luckSteerCost} — a hand leaning ` +
            `${n[colour]}, and the next ${t.colourBiasDraws} draws with it.`,
        }))
      : []),
    ...(t.luckForgeCost > 0
      ? [{ text: `FORGE · ${t.luckForgeCost} — turn the card you have selected UNIQUE.` }]
      : []),
    ...(t.titheRate > 0
      ? [
          {
            text:
              `SACRIFICE LUCK — the WHOLE purse traded for relics at ` +
              `${Math.round(t.titheRate * 100)}%, better than dying on it.`,
          },
        ]
      : []),
  ];
  // One paragraph, then the list — the use-it-or-lose-it fact is the REASON
  // to read the rows, so it goes above them rather than below (2026-08-27:
  // as its own trailing paragraph it sat between the intro and the list and
  // read like a footer that had slid up the card).
  // "You CAN lose it all" is Marc's own phrasing (2026-08-20: "explain all
  // and that you can lose it all too") and is pinned by name — the rows
  // print their prices, and this is the one thing a price cannot say.
  const lost =
    t.luckToRelics > 0
      ? `the run's end pays back only ${Math.round(t.luckToRelics * 100)}% of whatever is left, so a full purse you die on is mostly gone`
      : 'whatever is left when the run ends is lost outright';
  return {
    text:
      `${CONCEPT_MARK.luck}  LUCK IS FOR SPENDING\n` +
      `Every button under your hand is priced in luck — and you CAN lose it all: ${lost}. Spend it.`,
    rows,
  };
}

/**
 * One stat, explained in this run's own numbers — the tap-a-symbol
 * contract, kept by the stat row. Sticky, like every explanation you asked
 * for by hand: you are reading it deliberately, and a timer would be a
 * race against your own eyes.
 */
export function statNote(id: string, hud: HudView, t: Tuning): string {
  switch (id) {
    case 'tiles':
      return 'TILES — what keeps you alive. Every placement spends them; pops, caches and territories pay them back. At zero with nothing ripe to pop, the run ends.';
    case 'points':
      return 'POINTS — the score. A pocket popped for points pays its worth × its size × its distance from home.';
    case 'luck':
      // Shares its opening clause with the LUCK teach card
      // (`glossary.ts`'s `LUCK_CORE`, read by `game.ts`'s `glossaryEntry`)
      // and appends the one thing that clause never says: the live rate.
      return (
        `${LUCK_CORE} The row under your hand spends it` +
        (t.luckToRelics > 0
          ? `; whatever is left when the run ends comes home as relics, at ${Math.round(t.luckToRelics * 100)}%.`
          : '.')
      );
    case 'map':
      return `REACH — how far from home you have built. Every ${t.distanceStep} hexes out raises the distance multiplier by 1, so the same pocket scores more the deeper it pops.`;
    case 'cost': {
      const curve =
        t.costGrace > 0
          ? `It stays ${t.baseCost} for the first ${t.costGrace} placements, then rises +1 every ${t.costRisesEvery} placed`
          : `It rises +1 every ${t.costRisesEvery} placed`;
      return `COST — the next placement's price: ${hud.cost}. ${curve}, and it never comes back down — the clock that ends every run. ${LAST_GASP_RULE}`;
    }
    case 'left':
      return 'LEFT — placements remaining in the expedition. At zero it ends; anything already ripe can still be popped.';
    default:
      return '';
  }
}

/**
 * One colour's personality as a whole sentence, in the theme's own words
 * and the live tuning's numbers — the text the colour's first-contact
 * toast, the selected card's second tap and a tapped placed tile all
 * share, so the three doors cannot drift apart. Null while that colour's
 * power dial is zeroed: a personality that is off must not be taught.
 */
export function colourLesson(colour: Colour, t: Tuning, theme: Theme): string | null {
  const n = theme.terrainNames[colour];
  /**
   * "NAME — PERSONALITY", except where a direction has already named the
   * ground after its personality — torchlit calls red ASH and blue TIDE,
   * so the line read "ASH — ASH." and "TIDE — TIDE." (2026-08-27). Invisible
   * for three days because each colour was taught alone; the moment all four
   * stood on one card, two of them stuttered. A direction is free to name
   * its ground anything, so this is a rule rather than a rewording.
   */
  const head = (word: string): string => (n === word ? `${n}.` : `${n} — ${word}.`);
  switch (colour) {
    case 'green':
      return t.greenCrowdBonus > 0
        ? `${head('CROWDS')} Wants one big mob of its own colour: +${t.greenCrowdBonus} worth per ${n} neighbour past the first.`
        : null;
    case 'yellow':
      return t.yellowCompanyBonus > 0
        ? `${head('COMPANY')} Scores in messy mixed ground: +${t.yellowCompanyBonus} worth per ${t.yellowCompanyAll ? 'differently-coloured neighbour' : 'different colour beside it'}.`
        : null;
    case 'red':
      return t.redAshMatches
        ? `${head('ASH')} Stone${t.redAshWalls ? ' and walls' : ''} count as matches for it: it feeds on the spent ground everyone else abandons.`
        : null;
    case 'blue':
      return t.blueTideEvery > 0
        ? `${head('TIDE')} Worth little at home, a lot on the frontier: +1 worth per ${t.blueTideEvery} hexes from home.`
        : null;
  }
}

/**
 * The colour's power, in one clause, with its numbers read from the live
 * tuning — same no-staleness contract as the manual. Empty string when the
 * personalities are off (the bounded game), so the tip stays honest there.
 */
export function powerOf(colour: Colour, t: Tuning): string {
  switch (colour) {
    case 'green':
      return t.greenCrowdBonus > 0
        ? ` · crowds: +${t.greenCrowdBonus} worth per green neighbour past the first`
        : '';
    case 'yellow':
      return t.yellowCompanyBonus > 0
        ? ` · company: +${t.yellowCompanyBonus} worth per ${t.yellowCompanyAll ? 'differently-coloured neighbour' : 'different colour beside it'}`
        : '';
    case 'red':
      return t.redAshMatches
        ? ` · ash: stone${t.redAshWalls ? ' and walls' : ''} beside red count as matches`
        : '';
    case 'blue':
      return t.blueTideEvery > 0 ? ` · tide: +1 worth per ${t.blueTideEvery} hexes from home` : '';
  }
}

/**
 * What `describeHexOf` needs beyond the state itself — the session facts
 * `#describe` used to read off `Game`'s own instance fields. Not
 * `RenderContext`: that bundle is board-render data derivable from `state`
 * alone, and every field here is something only the SESSION knows (the
 * theme in play, whether this run is a detour, how many shrines it has
 * claimed this run, and the two shrine-ledger/crossing hooks the shell
 * owns) — `state` rides along inside it so the whole call is `(ctx, hex)`.
 */
export type DescribeContext = {
  readonly state: GameState;
  readonly theme: Theme;
  readonly detour: boolean;
  /** Shrines claimed THIS run, so the tap names the right unlock. */
  readonly shrinesClaimed: number;
  /** What the next shrine will unlock, by how many this run has claimed. */
  readonly unlockLabel?: (nth: number) => string | null;
  /** Ground this world remembers from earlier runs — keys only. */
  readonly memory?: readonly HexKey[];
  /** The crossing's dowry, present exactly when the crossing is offered. */
  readonly crossingDowry?: () => number;
};

/**
 * What that hex is, in one sentence, in the direction's own words and this
 * run's own numbers. Covers the things a player can tap and not understand:
 * the five destination glyphs (reached or still glowing in the dark), wall,
 * stone, native ground, a tile not yet ripe, and ground this world only
 * remembers.
 */
export function describeHexOf(ctx: DescribeContext, hex: HexKey): string {
  const { state } = ctx;
  const t = state.tuning;
  const name = (c: Colour): string => ctx.theme.terrainNames[c];
  const cell = state.cells[hex];

  const destination = (reward: LandmarkReward, colour: Colour | null, claimed: boolean): string => {
    if (reward === 'cache') {
      return claimed
        ? `${LANDMARK_GLYPH.cache} CACHE — already claimed. It gave its tiles.`
        : `${LANDMARK_GLYPH.cache} CACHE — build a tile touching it to claim ${cachePaysAt(hex, t, homeOf(state))} tiles on the spot.`;
    }
    if (reward === 'site') {
      return claimed
        ? `${LANDMARK_GLYPH.site} SITE — already claimed.`
        : `${LANDMARK_GLYPH.site} SITE — claim it for ${t.sitePays} pts × its distance, and it opens a bounty worth ×${t.questBonus}.`;
    }
    if (reward === 'shrine') {
      // A detour has no ledger to narrate (fresh-eyes finding 5): say what
      // shrines ARE, not what the home world would have unlocked.
      if (ctx.detour) {
        return claimed
          ? `${LANDMARK_GLYPH.shrine} SHRINE — woken. On your own world, this switches a system on for good.`
          : `${LANDMARK_GLYPH.shrine} SHRINE — touch it with a tile. On your own world, waking one switches a system on for good.`;
      }
      const next = ctx.unlockLabel?.(ctx.shrinesClaimed) ?? null;
      if (claimed)
        return `${LANDMARK_GLYPH.shrine} SHRINE — woken. It switched a system on for this world.`;
      // Fully awake with the crossing available: the shrine's remaining
      // gift is the way onward, and its tap explanation says so.
      if (next === null && ctx.crossingDowry !== undefined) {
        return `${LANDMARK_GLYPH.shrine} SHRINE — this world is fully awake, so reaching it offers the crossing: a NEW WORLD, with ${ctx.crossingDowry()} relics carried for what you leave.`;
      }
      return `${LANDMARK_GLYPH.shrine} SHRINE — claim it to unlock ${next ?? 'a system'} for this world, permanently.`;
    }
    if (reward === 'find') {
      // Mysterious but honest: what a find gives is the one thing the
      // board never says out loud.
      return claimed
        ? `${LANDMARK_GLYPH.find} A hidden find — spent. It gave what it had.`
        : `${LANDMARK_GLYPH.find} Something is here. Touch it with a tile.`;
    }
    const owns = colour === null ? 'a colour' : name(colour);
    return claimed
      ? `${LANDMARK_GLYPH.territory} TERRITORY — yours. The ground within ${t.territoryRadius} hexes is native to ${owns}.`
      : `${LANDMARK_GLYPH.territory} TERRITORY — claim it and the ground within ${t.territoryRadius} hexes becomes native to ${owns}, for good.`;
  };

  if (cell === undefined) {
    // Not on the board: a destination glowing through the dark, a find's
    // shimmer, or ground this world remembers from an earlier run.
    const { q, r } = parse(hex);
    const remembered = ctx.memory?.includes(hex) ?? false;
    // A reborn landmark (2026-08-20): this run rolled a spent shrine or
    // find into a fresh cache or site, and the tap answers for what
    // walking there PAYS — the world's memory of what used to stand
    // here is the diary's business, not the map's.
    const reborn = state.rearmed[hex];
    if (reborn !== undefined) {
      return `${destination(reborn, null, false)} Build your chain out to it.`;
    }
    const dest = destinationAt(state.rootSeed, q, r, t);
    if (dest !== null) {
      // Named only where the world has actually SHOWN it (Marc,
      // 2026-08-19: memory shows what it saw): ground this world
      // remembers, or a beacon inside the live horizon — via the ONE
      // predicate `beaconsFor` draws by, because the simplify pass caught
      // this copy already drifted (it still measured from the origin, so
      // a camp run's tap answers disagreed with its own drawn beacons).
      if (remembered || withinBeaconHorizon(state, hex)) {
        const claimed = state.claimed.includes(hex);
        return claimed
          ? destination(dest.reward, dest.colour, true)
          : `${destination(dest.reward, dest.colour, false)} Build your chain out to it.`;
      }
    }
    // Only a hex the shimmer is actually drawing gets this answer — with
    // no sense, or out of range, a hidden find stays exactly that, and
    // tap-scanning remembered ground must not become a divining rod.
    if (
      t.findSense > 0 &&
      findAt(state.rootSeed, q, r, t) !== null &&
      // Not one the board is already drawing (2026-08-21): the render
      // skips a find that has been revealed, so saying "something
      // shimmers here" over a hex whose landmark is on screen — possibly
      // a find already claimed — describes a light nobody can see.
      state.cells[hex] === undefined
    ) {
      const near = Object.keys(state.cells).some(
        (k) => distance(parse(k), { q, r }) <= t.findSense,
      );
      if (near) return 'Something shimmers here. Grow your ground to it.';
    }
    return remembered
      ? 'Remembered from an earlier run — this run has not grown here yet.'
      : 'Dark ground — nothing any run has seen yet. Grow toward it.';
  }

  switch (cell.kind) {
    case 'landmark':
      return destination(cell.reward, cell.colour ?? null, cell.claimed);
    case 'wall': {
      // WALLBREAKER rewrites this sentence while it is worn — a rule the
      // perk breaks must not go on being stated as a rule.
      const standing =
        t.wallBuildCostMult > 0
          ? `${CONCEPT_MARK.wall} Wall — you can build on it, at ${t.wallBuildCostMult}× the placement cost.`
          : `${CONCEPT_MARK.wall} Wall — cannot be built on.`;
      return t.redAshWalls
        ? `${standing} It surrounds (so it helps things ripen) but never matches, except for ${name('red')}, which counts it as one.`
        : `${standing} It surrounds (so it helps things ripen) but never matches.`;
    }
    case 'stone':
      return `${CONCEPT_MARK.stone} Spent ground — a popped tile. It surrounds but never matches, except for ${name('red')}, which feeds on it.`;
    case 'tile': {
      const worth = worthOf(state.cells, hex, t, homeOf(state), state.luck);
      const power = rarityLine(cell.rarity);
      // The colour's personality rides along (2026-08-19, "the colors are
      // not explained") — a tapped tile is the cheapest place to learn
      // what its colour wants, right where it is wanting it.
      const personality = colourLesson(cell.colour, t, ctx.theme);
      return (
        `${name(cell.colour)} tile, worth ${worth}. It ripens when all six sides are covered.` +
        (personality === null ? '' : `\n${personality}`) +
        (power === null ? '' : `\n${power}`)
      );
    }
    case 'empty':
      return cell.native === undefined
        ? 'Open ground — you can build here once something of yours touches it.'
        : `Ground native to ${name(cell.native)} — a ${name(cell.native)} tile here is worth one more.`;
  }
}
