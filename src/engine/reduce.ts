import { COLOUR_WEIGHTS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from './hex';
import { rngNext, rngWeighted, streamsFrom, type RngStream, type RngStreams } from './rng';
import {
  cachePaysAt,
  canAfford,
  canPlaceAt,
  distanceMultiplierAt,
  harvestValue,
  homeOf,
  isExhausted,
  outOfTime,
  payPlacement,
  placementCostAt,
  pointsSplit,
  reachOf,
  ripeKeys,
  scoreOf,
} from './rules';
import type {
  Action,
  Cell,
  DeathCause,
  GameState,
  HarvestChoice,
  Quest,
  Rarity,
  Spend,
  Tile,
} from './state';
import { destinationAt, findAt, terrainAt } from './world';

/**
 * The engine. `reduce(state, action) -> state`, and nothing else.
 *
 * Illegal actions RETURN THE STATE UNCHANGED rather than throwing. The UI is
 * responsible for not offering them; the engine is responsible for not trusting
 * the UI. A thrown error here would be a crash in the player's hand for what is
 * usually a double-tap.
 */

/** The draft's odds right now: base chances plus what luck has earned. */
export function rarityOdds(t: Tuning, luck: number): { magic: number; unique: number } {
  return {
    magic: t.magicChance + luck * t.luckMagicPerPop,
    unique: t.uniqueChance + luck * t.luckUniquePerPop,
  };
}

type Rolled = { readonly tiles: RngStream; readonly loot: RngStream };

/**
 * Tile ids come from the stream cursor, which only ever increases. That makes
 * them unique for the whole run without a counter in state, and it makes an
 * action log readable — the id says which roll produced the tile.
 *
 * Rarity rolls on the LOOT stream, not the tiles stream, so a game with the
 * system switched off draws the exact colour sequence it always drew — and it
 * rolls only when the odds are nonzero, so the loot cursor stays put too.
 */
/**
 * The draw weights, with the last pop's colour running hot.
 *
 * Steering the draft is what makes popping early worth doing on its own
 * terms: a pocket cashed is a colour requested. Weights are built fresh per
 * draw rather than stored, so the bias is always exactly what state says.
 */
function weightsFor(t: Tuning, bias: GameState['bias']): readonly (readonly [Colour, number])[] {
  if (bias === null || bias.left <= 0 || t.colourBiasWeight <= 0) return COLOUR_WEIGHTS;
  return COLOUR_WEIGHTS.map(([colour, weight]) =>
    colour === bias.colour ? [colour, weight + t.colourBiasWeight] : [colour, weight],
  );
}

function rollTile(
  tiles: RngStream,
  loot: RngStream,
  t: Tuning,
  luck: number,
  bias: GameState['bias'] = null,
): Rolled & { tile: Tile } {
  const [colour, nextTiles] = rngWeighted(tiles, weightsFor(t, bias));

  const odds = rarityOdds(t, luck);
  let rarity: Rarity = 'common';
  let nextLoot = loot;
  if (odds.magic + odds.unique > 0) {
    const [v, advanced] = rngNext(loot);
    nextLoot = advanced;
    rarity = v < odds.unique ? 'unique' : v < odds.unique + odds.magic ? 'magic' : 'common';
  }

  return { tile: { id: `t${tiles.cursor}`, colour, rarity }, tiles: nextTiles, loot: nextLoot };
}

function rollDraft(
  tiles: RngStream,
  loot: RngStream,
  t: Tuning,
  luck: number,
  bias: GameState['bias'] = null,
): Rolled & { draft: Tile[]; bias: GameState['bias'] } {
  const draft: Tile[] = [];
  let cur: Rolled = { tiles, loot };
  // The bias is spent by DRAWING, one draw at a time, so a wide draft burns
  // it faster than a narrow one — the steering is a number of tiles, not a
  // number of turns.
  let left = bias;
  for (let i = 0; i < t.draftWidth; i++) {
    const rolled = rollTile(cur.tiles, cur.loot, t, luck, left);
    draft.push(rolled.tile);
    cur = rolled;
    if (left !== null) {
      left = left.left > 1 ? { colour: left.colour, left: left.left - 1 } : null;
    }
  }
  return { draft, bias: left, ...cur };
}

/** A tile cell, with the optional facts written only when they are true. */
function tileCell(colour: Colour, onNative: boolean, rarity: Rarity): Cell {
  const cell: { kind: 'tile'; colour: Colour; onNative?: boolean; rarity?: Rarity } = {
    kind: 'tile',
    colour,
  };
  if (onNative) cell.onNative = true;
  if (rarity !== 'common') cell.rarity = rarity;
  return cell;
}

/**
 * A claimed territory, as the field it unfurls: ground within `territoryRadius`
 * of one is native to its colour. Derived from the board on demand — claiming
 * is rare and reveals touch six cells, so nothing is worth caching.
 */
type Field = { readonly q: number; readonly r: number; readonly colour: Colour };

/**
 * Every territory whose field is live: the ones claimed on this board, plus
 * the ones this WORLD already held when the run began (P4a). The remembered
 * ones are read from the terrain function rather than the board, because
 * their ground can be revealed before the landmark itself is — and a field
 * that switched on late would make the same hex mean two different things
 * depending on which way you walked into it.
 */
function claimedFields(state: {
  cells: Readonly<Record<HexKey, Cell>>;
  claimed: readonly HexKey[];
  rootSeed: number;
  tuning: Tuning;
}): Field[] {
  const out: Field[] = [];
  const seen = new Set<HexKey>();

  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind === 'landmark' && cell.reward === 'territory' && cell.claimed) {
      if (cell.colour !== undefined) {
        out.push({ ...parse(k), colour: cell.colour });
        seen.add(k);
      }
    }
  }

  for (const k of state.claimed) {
    if (seen.has(k)) continue;
    const { q, r } = parse(k);
    const dest = destinationAt(state.rootSeed, q, r, state.tuning);
    if (dest?.reward === 'territory' && dest.colour !== null) {
      out.push({ q, r, colour: dest.colour });
    }
  }
  return out;
}

/**
 * Growth reveals ground: the cell the terrain function says has always been
 * there, consulted exactly once and baked into the board. Destinations outrank
 * walls — a landmark is the reason to walk that way, so the ground yields.
 * Open ground remembers which colour it is native to, and ground inside a
 * claimed territory's field is native to the territory's colour first.
 */
function revealCell(
  rootSeed: number,
  k: HexKey,
  t: Tuning,
  fields: readonly Field[],
  claimed: ReadonlySet<HexKey> = new Set(),
  claimedFinds: ReadonlySet<HexKey> = new Set(),
  rearmed: Readonly<Record<HexKey, 'cache' | 'site'>> = {},
): Cell {
  const { q, r } = parse(k);

  // A spent one-time landmark, reborn (Marc, 2026-08-20): the shell rolled
  // this hex a fresh face for THIS run — a cache or a site where a woken
  // shrine or a claimed find used to sit — and the reveal simply obeys the
  // map, the same trust `claimed` already gets. Unclaimed, so reaching it
  // pays like any cache or site does.
  const reborn = rearmed[k];
  if (reborn !== undefined) return { kind: 'landmark', reward: reborn, claimed: false };

  const dest = destinationAt(rootSeed, q, r, t);
  if (dest !== null) {
    // A territory this world already holds arrives already yours: no second
    // payout, and its field is live. Caches and sites re-arm every run —
    // known ground stays worth walking, which is P4a's whole bet.
    const was = claimed.has(k);
    return dest.colour === null
      ? { kind: 'landmark', reward: dest.reward, claimed: false }
      : { kind: 'landmark', reward: dest.reward, claimed: was, colour: dest.colour };
  }

  // A hidden find, met the only way one can be: growth touched its ground.
  // The SAME ride as a territory (2026-08-18, closing the find re-farm): one
  // this world already has in `claimedFinds` arrives already spent, so
  // walking back to it pays no relics a second time — a find does not
  // re-arm. Whether it still has a PERK to give is the shell's question
  // regardless (`findLabel` refuses a hex already in the world's list), but
  // this is what stops the engine paying the same claim twice.
  if (findAt(rootSeed, q, r, t) !== null) {
    return { kind: 'landmark', reward: 'find', claimed: claimedFinds.has(k) };
  }

  const ground = terrainAt(rootSeed, q, r, t);
  if (ground.wall) return { kind: 'wall' };

  const hex = { q, r };
  const field = fields.find((f) => distance(hex, f) <= t.territoryRadius);
  const native = field?.colour ?? ground.native;
  return native === null ? { kind: 'empty' } : { kind: 'empty', native };
}

/**
 * The endless world is GROWN, not generated: the seed tile and its six empty
 * neighbours are the entire starting board, and every placement materialises
 * the ground around itself (see `place`). The invariant that buys is that no
 * tile ever borders an absent cell — so "absent counts as solid", which the
 * bounded game leans on for its rims, simply never comes up, and every rule
 * function works on both worlds unchanged.
 */
function openWorld(
  rootSeed: number,
  rng: RngStreams,
  t: Tuning,
  claimed: readonly HexKey[],
  claimedFinds: readonly HexKey[],
  origin: { q: number; r: number },
  rearmed: Readonly<Record<HexKey, 'cache' | 'site'>>,
): { cells: Record<HexKey, Cell>; draft: Tile[]; rng: RngStreams } {
  const seeded = rollTile(rng.tiles, rng.loot, t, 0);
  const cells: Record<HexKey, Cell> = {
    [key(origin.q, origin.r)]: tileCell(seeded.tile.colour, false, seeded.tile.rarity),
  };
  const held = new Set(claimed);
  const heldFinds = new Set(claimedFinds);
  const fields = claimedFields({ cells, claimed, rootSeed, tuning: t });
  for (const n of neighbourKeys(origin.q, origin.r)) {
    cells[n] = revealCell(rootSeed, n, t, fields, held, heldFinds, rearmed);
  }

  const { draft, tiles, loot } = rollDraft(seeded.tiles, seeded.loot, t, 0);
  return { cells, draft, rng: { ...rng, tiles, loot } };
}

/**
 * Tiles a world's held territories add to a run's purse (P4b), capped. Pure
 * and exported so the UI can say WHY the starting number is not 30 — a perk
 * nobody can see is indistinguishable from a bug.
 */
export const startingPerk = (t: Tuning, territories: number): number =>
  t.territoryTiles <= 0 ? 0 : Math.min(t.territoryTilesCap, territories * t.territoryTiles);

/**
 * Start a run. `claimed` is the world's standing territories (P4a) and
 * `claimedFinds` its standing hidden finds (2026-08-18) — plain data, so the
 * engine still knows nothing about storage and a run remains reproducible
 * from seed + tuning + these two lists. Kept separate rather than one list:
 * `claimed.length` feeds `startingPerk` below, and a find is not a
 * territory.
 *
 * `wakeAt` is the where-you-wake PROTOTYPE's own argument (2026-08-18,
 * harness only — no UI ever passes it): grow the plane from this hex
 * instead of true origin, and measure every distance-based reward from it
 * (`rules.ts`'s `homeOf`). Null means exactly what it always meant: origin.
 */
export function newRun(
  rootSeed: number,
  tuning: Tuning = TUNING,
  claimed: readonly HexKey[] = [],
  claimedFinds: readonly HexKey[] = [],
  wakeAt: HexKey | null = null,
  // Spent one-time landmarks reborn for this run (Marc, 2026-08-20) — see
  // `GameState.rearmed`. Plain data, the `claimed` contract's fourth rider.
  rearmed: Readonly<Record<HexKey, 'cache' | 'site'>> = {},
): GameState {
  const streams = streamsFrom(rootSeed);
  const origin = wakeAt !== null ? parse(wakeAt) : { q: 0, r: 0 };
  const opened = openWorld(rootSeed, streams, tuning, claimed, claimedFinds, origin, rearmed);

  return {
    version: 1,
    rootSeed,
    rng: opened.rng,
    tuning,
    phase: 'placing',
    death: null,
    // Territory perks (P4b): a world you have conquered starts you richer,
    // bounded so conquest can never buy its way past the clock.
    tiles: tuning.startingTiles + startingPerk(tuning, claimed.length),
    points: 0,
    placements: 0,
    luck: 0,
    relics: 0,
    usedSecondWind: false,
    cells: opened.cells,
    draft: opened.draft,
    selected: 0,
    held: [],
    quest: null,
    bias: null,
    lastPlaced: null,
    wakeAt,
    claimed,
    claimedFinds,
    rearmed,
    log: { harvests: [], popped: 0, questsDone: 0 },
  };
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SELECT':
      return selectDraft(state, action.index);
    case 'PLACE':
      return place(state, action.hex);
    case 'HARVEST':
      return harvest(state, action.choice, action.at);
    case 'HOLD':
      return hold(state, action.slot);
    case 'SPEND':
      return spendLuck(state, action.on, action.colour);
  }
}

/**
 * What one spend costs, or 0 where that shop does not exist.
 *
 * TITHE has no fixed price — it takes the WHOLE purse, whatever that is —
 * so this returns `titheMin`, the floor below which the row refuses, purely
 * as the informational number a caller expecting "a cost" can still use;
 * `spendLuck` never reads it for tithe's own arithmetic.
 */
export function spendCost(t: Tuning, on: Spend): number {
  if (on === 'reroll') return t.luckRerollCost;
  if (on === 'steer') return t.luckSteerCost;
  if (on === 'forge') return t.luckForgeCost;
  return t.titheMin;
}

/** Whether the purse can pay for it right now. The UI asks before offering. */
export function canSpend(state: GameState, on: Spend): boolean {
  if (on === 'tithe') {
    const t = state.tuning;
    return (
      t.titheRate > 0 && t.titheMin > 0 && state.phase === 'placing' && state.luck >= t.titheMin
    );
  }
  const cost = spendCost(state.tuning, on);
  if (cost <= 0 || state.phase !== 'placing' || state.luck < cost) return false;
  // Forging needs something in hand to forge.
  return on !== 'forge' || state.draft[state.selected] !== undefined;
}

/**
 * Spend luck.
 *
 * Popping early has to buy something, and after Marc played it, the answer is
 * not better odds sitting in a bar — it is these purchases. Steering
 * redraws the hand under the named colour rather than merely biasing later
 * draws, because a bet you cannot see is not a decision you can make. TITHE
 * (2026-08-18) is the odd one out: it does not touch the draft at all, only
 * the purse — the whole thing, converted at once, so hoarding it becomes a
 * decision made in the moment rather than only at the end of the run.
 */
function spendLuck(state: GameState, on: Spend, colour?: Colour): GameState {
  if (!canSpend(state, on)) return state;
  if (on === 'steer' && colour === undefined) return state;
  const t = state.tuning;

  if (on === 'tithe') {
    return { ...state, luck: 0, relics: state.relics + Math.floor(state.luck * t.titheRate) };
  }

  const luck = state.luck - spendCost(t, on);

  if (on === 'forge') {
    const card = state.draft[state.selected];
    if (card === undefined || card.rarity === 'unique') return state;
    const draft: readonly Tile[] = state.draft.map((tile, i) =>
      i === state.selected ? { ...tile, rarity: 'unique' as const } : tile,
    );
    return { ...state, luck, draft };
  }

  const bias =
    on === 'steer' && colour !== undefined ? { colour, left: t.colourBiasDraws } : state.bias;
  const rolled = rollDraft(state.rng.tiles, state.rng.loot, t, luck, bias);
  return {
    ...state,
    luck,
    draft: rolled.draft,
    selected: 0,
    bias: rolled.bias,
    rng: { ...state.rng, tiles: rolled.tiles, loot: rolled.loot },
  };
}

/**
 * Swap the selected card with the stash. An empty slot takes the card and
 * the draft shrinks until its next reroll; a full stash trades in place. The
 * held tiles survive rerolls — that is what holding is FOR — and the stash
 * is a place rather than a mode: one action, both directions.
 *
 * With more than one slot (2026-08-21) the only new question is WHICH tile a
 * full stash gives back. `slot` answers it directly when the UI taps a
 * particular stash card; without one, the rule is the OLDEST (Marc's call
 * from the option set): the thing you saved most recently is the thing you
 * were most deliberately saving, so it is the one that stays.
 */
function hold(state: GameState, slot?: number): GameState {
  if (state.phase !== 'placing') return state;
  const slots = state.tuning.holdSlots;
  if (slots <= 0) return state;

  const tile = state.draft[state.selected];
  if (tile === undefined) return state;

  // A named slot that holds nothing is a tap on an empty card, which means
  // the same thing as the default: put this tile away.
  const named = slot !== undefined && slot >= 0 && slot < state.held.length ? slot : undefined;

  if (named === undefined && state.held.length < slots) {
    const draft = state.draft.filter((_, i) => i !== state.selected);
    return { ...state, held: [...state.held, tile], draft, selected: 0 };
  }

  // Trade: the chosen tile (or the oldest) goes back into the hand where the
  // selected card was, and the selected card takes its place in the stash —
  // appended, so it becomes the newest and the ordering stays honest.
  const index = named ?? 0;
  const returning = state.held[index];
  if (returning === undefined) return state;
  const draft = state.draft.map((d, i) => (i === state.selected ? returning : d));
  const held = [...state.held.filter((_, i) => i !== index), tile];
  return { ...state, held, draft };
}

function selectDraft(state: GameState, index: number): GameState {
  if (state.phase !== 'placing') return state;
  // `-1` is the explicit EMPTY HAND (Marc, 2026-08-20: "we can always
  // unselect a selected tile by tapping it again" — the UI sends -1 on that
  // second tap): previews clear and nothing places until a card is picked
  // up again. Legal by construction: every consumer reads `draft[selected]`
  // and treats `undefined` as "no tile in hand".
  if (index === -1) return state.selected === -1 ? state : { ...state, selected: -1 };
  if (index < 0 || index >= state.draft.length) return state;
  // Re-selecting what is already selected is not a change. Returning a fresh
  // object for it would make "did that action do anything?" unanswerable by
  // identity, which is exactly how the harness first deadlocked — and the
  // sim's policies still lead every placement with a SELECT, selected or not.
  if (index === state.selected) return state;
  return { ...state, selected: index };
}

function place(state: GameState, hex: HexKey): GameState {
  if (state.phase !== 'placing') return state;

  const t = state.tuning;
  const tile = state.draft[state.selected];
  if (tile === undefined) return state;
  if (!canPlaceAt(state.cells, hex, t)) return state;
  if (!canAfford(state.tiles)) return state;
  if (outOfTime(state)) return state;

  // A tile on its own native ground carries that fact from the cell it covers.
  // A wall being built over (WALLBREAKER) is native to nothing.
  const ground = state.cells[hex];
  const onNative = ground?.kind === 'empty' && ground.native === tile.colour;

  const cells: Record<HexKey, Cell> = {
    ...state.cells,
    [hex]: tileCell(tile.colour, onNative, tile.rarity),
  };

  // The perk dials price this exact hex: a wall costs its multiple, a hex
  // beside stone costs its discount. Both are `costOf` untouched wherever the
  // dials are zero, which is every economy that never equipped the perk.
  let tiles = payPlacement(state.tiles, placementCostAt(state.cells, hex, state.placements, t));
  let points = state.points;
  // Sites pay points OUTSIDE any harvest, which is why they are counted
  // separately — see `log.sitePoints`.
  let sitePoints = state.log.sitePoints ?? 0;
  let relics = state.relics;
  let quest: Quest | null = state.quest;

  {
    // The plane grows under your feet: placing a tile reveals the
    // ground around it, which keeps the invariant that no tile ever borders an
    // absent cell. What it reveals is the terrain function's answer — walls
    // and landmarks included, which is how the plane gets to say no and where.
    const { q, r } = parse(hex);
    const fields = claimedFields(state);
    const held = new Set(state.claimed);
    const heldFinds = new Set(state.claimedFinds);
    for (const n of neighbourKeys(q, r)) {
      cells[n] ??= revealCell(state.rootSeed, n, t, fields, held, heldFinds, state.rearmed);
    }

    // Reaching a destination: the tile you just placed touching an unclaimed
    // landmark claims it, once, on the spot. A cache pays after the placement
    // cost, so it can be the thing that saves a run at zero.
    for (const n of neighbourKeys(q, r)) {
      const c = cells[n];
      if (c?.kind !== 'landmark' || c.claimed) continue;
      cells[n] = { ...c, claimed: true };

      // Reaching anywhere NEW pays the meta a little, whatever it was: the
      // exploring half of Marc's three relic sources, and the only one that
      // asks you to give up nothing. Reborn ground is not new (Marc's
      // ruling, 2026-08-20): a spent shrine re-rolled into a cache pays its
      // tiles, a reborn site its points — the RUN economy is the reward,
      // and relics stay about ground never reached before.
      if (state.rearmed[n] === undefined) relics += t.claimRelics;

      // Graded by distance since 2026-08-18: the walk that found a cache is
      // priced into what it holds. `cachePaysAt` so the UI says the same.
      // `homeOf(state)` rather than true origin — the where-you-wake
      // prototype's whole question, answered here as everywhere else.
      if (c.reward === 'cache') tiles += cachePaysAt(n, t, homeOf(state));
      if (c.reward === 'site') {
        const paid = t.sitePays * distanceMultiplierAt(n, t, homeOf(state));
        points += paid;
        sitePoints += paid;
        // A site also opens its bounty, if quests are on and none is in play.
        // One at a time: a second goal is not twice the goal, it is none.
        if (t.questNeed > 0 && quest === null) {
          quest = { at: n, need: t.questNeed, radius: t.questRadius, bonus: t.questBonus };
        }
      }
      // A shrine pays nothing here on purpose: what it grants outlives the
      // run, so the engine only marks it reached and the shell reads that
      // when the world is written.
      if (c.reward === 'territory' && c.colour !== undefined) {
        // The claim unfurls: already-revealed open ground inside the radius
        // becomes the territory's field now; ground revealed later gets the
        // same answer from `claimedFields` at reveal time.
        const centre = parse(n);
        for (const [ck, cell] of Object.entries(cells)) {
          if (cell.kind !== 'empty') continue;
          if (distance(parse(ck), centre) > t.territoryRadius) continue;
          cells[ck] = { kind: 'empty', native: c.colour };
        }
      }
    }
  }

  const {
    draft,
    tiles: tilesStream,
    loot,
    bias,
  } = rollDraft(state.rng.tiles, state.rng.loot, t, state.luck, state.bias);

  return endIfStuck({
    ...state,
    cells,
    placements: state.placements + 1,
    lastPlaced: hex,
    tiles,
    points,
    relics,
    quest,
    bias,
    draft,
    selected: 0,
    log: { ...state.log, sitePoints },
    rng: { ...state.rng, tiles: tilesStream, loot },
  });
}

function harvest(state: GameState, choice: HarvestChoice, at?: HexKey): GameState {
  if (state.phase !== 'placing') return state;

  const t = state.tuning;
  const { keys, count, tiles, points, questPays, treasure } = harvestValue(state, at);
  if (keys.length === 0) return state;
  // Burning is only a thing where the sacrifice has a price — either one.
  if (choice === 'burn' && t.burnLuck <= 0 && t.burnRelics <= 0) return state;
  // Treasure is refused rather than downgraded when the pocket is too small:
  // a button that quietly pays something else is worse than a button that
  // does nothing. The UI only offers it when `treasure` is non-null.
  if (choice === 'treasure' && treasure === null) return state;

  // Popped tiles become stone: still surrounding, no longer matching. On a
  // bounded map that is the reason to leave; on the endless plane it is the
  // reason to keep moving outward — the wake behind you is spent ground.
  const cells: Record<HexKey, Cell> = { ...state.cells };
  for (const k of keys) cells[k] = { kind: 'stone' };

  // Treasure goes to the stash, which is where a tile you are saving for the
  // right moment belongs. With the hand put down (`selected: -1`,
  // 2026-08-20) there is no colour to forge the treasure FROM — the old
  // `?? 'green'` fallback was unreachable defensive code that the empty hand
  // turned into a silent wrong answer, so an empty-handed treasure pop
  // simply keeps the stash.
  //
  // With two slots (2026-08-21) it fills a free one; only a FULL stash still
  // displaces, and it displaces the oldest — the same rule HOLD follows, so
  // there is one answer to "which tile leaves" rather than two.
  const treasureSource = state.draft[state.selected];
  const won: Tile | null =
    choice === 'treasure' && treasure !== null && treasureSource !== undefined
      ? { id: `x${state.placements}`, colour: treasureSource.colour, rarity: treasure }
      : null;
  const stashed: readonly Tile[] =
    won === null
      ? state.held
      : state.held.length < t.holdSlots
        ? [...state.held, won]
        : [...state.held.slice(1), won];

  // Under the single payout there is no fork left to take: a pop pays TILES
  // and scores automatically, and only BURN and TREASURE trade that away.
  // `tiles` and `points` become the same instruction — the two names survive
  // so every saved run, replay and policy written before the pivot still
  // means what it meant.
  const pops = t.singlePayout ? choice !== 'treasure' && choice !== 'burn' : choice === 'tiles';
  const scores = t.singlePayout ? pops : choice === 'points';
  // One source for this arithmetic since 2026-08-21 — see , which
  // also carries the floor that stops a scoring pop banking zero.
  const scored = scoreOf(points, t);
  const split = scores ? pointsSplit(state, keys, scored) : undefined;

  // The bounty is collected by the pop that SCORES the pocket — its multiplier
  // is already inside `points`, so a pop that banks no points must not consume
  // it. `scores` is that question already answered, under either economy: it
  // means POINTS under the old fork, and every non-treasure non-burn pop under
  // the single payout. Spelling the rule out a second time is what broke it
  // twice — first `choice === 'points'` left bounties uncollectable when the
  // fork was removed, then `choice !== 'burn'` let a TREASURE pop clear the
  // bounty and pay nothing for it (Day 2). One expression, one answer.
  const collected = questPays && scores;

  // Luck arrives mostly as a FLAT amount per pop, so three small pockets beat
  // one big one at buying better draws while the big one beats them at tiles
  // and score. That is the whole reason to ever pop early — see `luckPerPop`.
  // Burning trades the tiles away for several times as much of it.
  const perPop =
    t.luckPerPop > 0 || t.luckPerTile !== 1 ? t.luckPerPop + count * t.luckPerTile : count;
  const luckGained = choice === 'burn' ? count * t.burnLuck : pops ? perPop : 0;
  // The sacrifice, repriced: a burn gives up the tiles AND the score and pays
  // the between-runs currency instead. That is the fork — is this run for the
  // record book, or for the next run?
  const relicsGained = choice === 'burn' ? count * t.burnRelics : 0;

  // A pocket cashed is a colour requested: the plane sends more of what you
  // just popped, so cashing a green pocket is how you get the green to build
  // the next one. Burning steers too — it is still a pop, just a spent one.
  const popped = new Map<Colour, number>();
  for (const k of keys) {
    const cell = state.cells[k];
    if (cell?.kind === 'tile') popped.set(cell.colour, (popped.get(cell.colour) ?? 0) + 1);
  }
  let steer: Colour | null = null;
  let most = 0;
  for (const [colour, n] of popped) {
    if (n > most) {
      most = n;
      steer = colour;
    }
  }
  const bias =
    t.colourBiasDraws > 0 && steer !== null
      ? { colour: steer, left: t.colourBiasDraws }
      : state.bias;

  return endIfStuck({
    ...state,
    cells,
    held: stashed,
    tiles: pops ? state.tiles + tiles : state.tiles,
    points: scores ? state.points + scored : state.points,
    // Cashing a pocket for survival is what raises the draft's rarity odds —
    // each popped tile is a point of luck, capped so it converges rather than
    // compounds — and burning one trades the tiles away for several times as
    // much of it.
    luck: Math.min(state.tuning.luckCap, Math.round(state.luck + luckGained)),
    relics: state.relics + relicsGained,
    quest: collected ? null : state.quest,
    bias,
    log: {
      ...state.log,
      popped: state.log.popped + count,
      questsDone: state.log.questsDone + (collected ? 1 : 0),
      harvests: [
        ...state.log.harvests,
        {
          at: state.placements,
          count,
          choice,
          tiles: pops ? tiles : 0,
          points: scores ? scored : 0,
          // Taken apart HERE, where the tiles are still tiles — one line
          // down they are stone and the question can no longer be asked.
          // Only for a pop that actually banks something: a burn, a
          // treasure and a tiles-only harvest have no points to distribute.
          ...(split === undefined ? {} : { split }),
        },
      ],
    },
  });
}

/**
 * The run ends when there is nothing left you can do.
 *
 * Ripe tiles waiting to be harvested are NOT an end — you can always cash out,
 * which keeps a stuck board from being a silent loss. Neither is a full map, so
 * long as you may still leave it. On a bounded map what kills you is the cost
 * curve, every time; the endless world's terrain added a second, rarer death —
 * a frontier that is all wall, with nothing ripe left to cash, has no move at
 * any price no matter how rich you are.
 */
function endIfStuck(state: GameState): GameState {
  const solvent = canAfford(state.tiles);
  const timeUp = outOfTime(state);

  // Whatever ended the run — money or the clock — you always get to cash what
  // is already ripe. Dying with a finished pocket unpopped because the timer
  // ticked between the placement and the tap would be a cheat, not a
  // decision. What the clock takes is the pockets you did NOT finish.
  if (ripeKeys(state.cells).length > 0) return state;

  if (timeUp) return ending(state, 'spent');
  if (!solvent) return ending(state, 'broke');
  // Under WALLBREAKER a frontier of walls is still a frontier, so the tuning
  // rides along and `walled` keeps meaning "no move at any price".
  if (isExhausted(state.cells, state.tuning)) return ending(state, 'walled');
  return state;
}

/**
 * The run, ended — and paid for what it was.
 *
 * Points as the FINAL state (Marc, 2026-08-15): an expedition is worth
 * something for having gone far and reached things, not only for what it
 * cashed on the way. Applied here, once, so `state.points` is the whole
 * score by the time anything reads it — the end screen, the record book and
 * the share link all say the same number without one of them doing arithmetic
 * the others do not know about.
 */
function ending(state: GameState, death: DeathCause): GameState {
  const t = state.tuning;

  // SECOND WIND (Marc's perk, 2026-08-15, with his own amendment: "with half
  // chance to still die"). A reprieve you might not get — the run refills
  // instead of ending, once, and only if the coin says so. The gamble is the
  // whole point: a guaranteed floor changes how much risk is correct, a coin
  // flip changes whether you dare find out.
  if (t.secondWindTiles > 0 && !state.usedSecondWind && death === 'broke') {
    const [roll, luckStream] = rngNext(state.rng.loot);
    const survived = roll < t.secondWindChance;
    const next: GameState = {
      ...state,
      usedSecondWind: true,
      rng: { ...state.rng, loot: luckStream },
    };
    if (survived) return { ...next, tiles: t.secondWindTiles };
    // The coin was spent and lost. The run still ends, below.
    return endingBonus(next, death);
  }

  return endingBonus(state, death);
}

/**
 * The end-of-run payout's arithmetic alone, with no `death` and no `phase` —
 * split out (2026-08-28) so the crossing can pay it too. A crossing is the
 * only way a run ends without ever calling `ending`, and before this its
 * unspent luck and reach/claim bonus simply never happened: a player who
 * walked to the shrine rich crossed poor, uncounted, exactly as if the run
 * had scored nothing. `shell/keeper.ts`'s `cross` calls this directly, pure
 * function to pure function, rather than re-deriving the same two numbers.
 */
export function endingPayout(state: GameState): {
  readonly relics: number;
  readonly points: number;
} {
  const t = state.tuning;
  // Unspent luck is worth something on the way out — hoarding the purse is a
  // real alternative to spending it, which is the third of Marc's three relic
  // sources.
  const relics = state.relics + Math.floor(state.luck * t.luckToRelics);

  if (t.endReachBonus <= 0 && t.endClaimBonus <= 0) {
    return { relics, points: state.points };
  }

  // reachOf measures from homeOf(state) — true origin in every shipped run,
  // the wake hex under camps — so REACH itself cannot be a free gift of
  // spawning far away.
  const reach = reachOf(state);
  let claims = 0;
  for (const cell of Object.values(state.cells)) {
    if (cell.kind === 'landmark' && cell.claimed) claims++;
  }

  return { relics, points: state.points + reach * t.endReachBonus + claims * t.endClaimBonus };
}

/** The end-of-run payout, split out so Second Wind can reach it either way. */
function endingBonus(state: GameState, death: DeathCause): GameState {
  const { relics, points } = endingPayout(state);
  return { ...state, phase: 'ended', death, relics, points };
}
