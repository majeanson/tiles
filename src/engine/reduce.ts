import { COLOUR_WEIGHTS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from './hex';
import { generateMap } from './map';
import { rngNext, rngWeighted, streamsFrom, type RngStream, type RngStreams } from './rng';
import {
  canAfford,
  canPlaceAt,
  costOf,
  distanceMultiplierAt,
  harvestValue,
  isExhausted,
  outOfTime,
  payPlacement,
  ripeKeys,
} from './rules';
import type {
  Action,
  Cell,
  DeathCause,
  GameState,
  HarvestChoice,
  Quest,
  Rarity,
  Tile,
} from './state';
import { destinationAt, terrainAt } from './world';

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
 * Lay out a map and drop the run's first tile in the middle of it.
 *
 * The seed tile is free. Rule 2 needs something to touch, and charging for the
 * privilege of being allowed to start would make arriving on a deep map with a
 * thin budget a death sentence rather than a gamble.
 */
function openMap(
  rng: RngStreams,
  mapNumber: number,
  t: Tuning,
  luck: number,
): { cells: Record<HexKey, Cell>; draft: Tile[]; rng: RngStreams } {
  const [cells, region] = generateMap(rng.region, mapNumber, t);

  const seeded = rollTile(rng.tiles, rng.loot, t, luck);
  cells[key(0, 0)] = tileCell(seeded.tile.colour, false, seeded.tile.rarity);

  const { draft, tiles, loot } = rollDraft(seeded.tiles, seeded.loot, t, luck);
  return { cells, draft, rng: { ...rng, region, tiles, loot } };
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
): Cell {
  const { q, r } = parse(k);

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
): { cells: Record<HexKey, Cell>; draft: Tile[]; rng: RngStreams } {
  const seeded = rollTile(rng.tiles, rng.loot, t, 0);
  const cells: Record<HexKey, Cell> = {
    [key(0, 0)]: tileCell(seeded.tile.colour, false, seeded.tile.rarity),
  };
  const held = new Set(claimed);
  const fields = claimedFields({ cells, claimed, rootSeed, tuning: t });
  for (const n of neighbourKeys(0, 0)) cells[n] = revealCell(rootSeed, n, t, fields, held);

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
 * Start a run. `claimed` is the world's standing territories (P4a) — plain
 * data, so the engine still knows nothing about storage and a run remains
 * reproducible from seed + tuning + this list.
 */
export function newRun(
  rootSeed: number,
  tuning: Tuning = TUNING,
  claimed: readonly HexKey[] = [],
): GameState {
  const streams = streamsFrom(rootSeed);
  const opened =
    tuning.world === 'endless'
      ? openWorld(rootSeed, streams, tuning, claimed)
      : openMap(streams, 1, tuning, 0);

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
    mapNumber: 1,
    luck: 0,
    cells: opened.cells,
    draft: opened.draft,
    selected: 0,
    held: null,
    quest: null,
    bias: null,
    claimed: tuning.world === 'endless' ? claimed : [],
    log: { harvests: [], popped: 0, placementsAtMapStart: 0, questsDone: 0 },
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
      return hold(state);
    case 'LEAVE':
      return leave(state);
  }
}

/**
 * Swap the selected card with the stash. An empty stash takes the card and
 * the draft shrinks until its next reroll; a full one trades in place. The
 * held tile survives rerolls — that is what holding is FOR — and the stash
 * is a place rather than a mode: one action, both directions.
 */
function hold(state: GameState): GameState {
  if (state.phase !== 'placing') return state;
  if (state.tuning.holdSlots <= 0) return state;

  const tile = state.draft[state.selected];
  if (tile === undefined) return state;

  if (state.held === null) {
    const draft = state.draft.filter((_, i) => i !== state.selected);
    return { ...state, held: tile, draft, selected: 0 };
  }
  const draft = state.draft.map((d, i) => (i === state.selected ? state.held! : d));
  return { ...state, held: tile, draft };
}

function selectDraft(state: GameState, index: number): GameState {
  if (state.phase !== 'placing') return state;
  if (index < 0 || index >= state.draft.length) return state;
  // Re-selecting what is already selected is not a change. Returning a fresh
  // object for it would make "did that action do anything?" unanswerable by
  // identity, which is exactly how the harness first deadlocked.
  if (index === state.selected) return state;
  return { ...state, selected: index };
}

function place(state: GameState, hex: HexKey): GameState {
  if (state.phase !== 'placing') return state;

  const t = state.tuning;
  const tile = state.draft[state.selected];
  if (tile === undefined) return state;
  if (!canPlaceAt(state.cells, hex)) return state;
  if (!canAfford(state.tiles)) return state;
  if (outOfTime(state)) return state;

  // A tile on its own native ground carries that fact from the cell it covers.
  const ground = state.cells[hex];
  const onNative = ground?.kind === 'empty' && ground.native === tile.colour;

  const cells: Record<HexKey, Cell> = {
    ...state.cells,
    [hex]: tileCell(tile.colour, onNative, tile.rarity),
  };

  let tiles = payPlacement(state.tiles, costOf(state.placements, t));
  let points = state.points;
  let quest: Quest | null = state.quest;

  if (t.world === 'endless') {
    // The endless plane grows under your feet: placing a tile reveals the
    // ground around it, which keeps the invariant that no tile ever borders an
    // absent cell. What it reveals is the terrain function's answer — walls
    // and landmarks included, which is how the plane gets to say no and where.
    const { q, r } = parse(hex);
    const fields = claimedFields(state);
    const held = new Set(state.claimed);
    for (const n of neighbourKeys(q, r)) {
      cells[n] ??= revealCell(state.rootSeed, n, t, fields, held);
    }

    // Reaching a destination: the tile you just placed touching an unclaimed
    // landmark claims it, once, on the spot. A cache pays after the placement
    // cost, so it can be the thing that saves a run at zero.
    for (const n of neighbourKeys(q, r)) {
      const c = cells[n];
      if (c?.kind !== 'landmark' || c.claimed) continue;
      cells[n] = { ...c, claimed: true };

      if (c.reward === 'cache') tiles += t.cachePays;
      if (c.reward === 'site') {
        points += t.sitePays * distanceMultiplierAt(n, t);
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
    tiles,
    points,
    quest,
    bias,
    draft,
    selected: 0,
    rng: { ...state.rng, tiles: tilesStream, loot },
  });
}

function harvest(state: GameState, choice: HarvestChoice, at?: HexKey): GameState {
  if (state.phase !== 'placing') return state;

  const t = state.tuning;
  const { keys, count, tiles, points, questPays, treasure } = harvestValue(state, at);
  if (keys.length === 0) return state;
  // Burning is only a thing where the sacrifice exists.
  if (choice === 'burn' && t.burnLuck <= 0) return state;
  // Treasure is refused rather than downgraded when the pocket is too small:
  // a button that quietly pays something else is worse than a button that
  // does nothing. The UI only offers it when `treasure` is non-null.
  if (choice === 'treasure' && treasure === null) return state;

  // The bounty is collected by PRESSING POINTS on a qualifying pocket — its
  // multiplier is already inside `points`. Taking the same pocket as tiles
  // leaves the bounty standing, which is the decision it exists to create.
  const collected = questPays && choice === 'points';

  // Popped tiles become stone: still surrounding, no longer matching. On a
  // bounded map that is the reason to leave; on the endless plane it is the
  // reason to keep moving outward — the wake behind you is spent ground.
  const cells: Record<HexKey, Cell> = { ...state.cells };
  for (const k of keys) cells[k] = { kind: 'stone' };

  // Treasure goes to the stash, which is where a tile you are saving for the
  // right moment belongs. It displaces whatever was held — taking a second
  // treasure while holding one is a choice about which rare tile you want.
  const stashed: Tile | null =
    choice === 'treasure' && treasure !== null
      ? {
          id: `x${state.placements}`,
          colour: state.draft[state.selected]?.colour ?? 'green',
          rarity: treasure,
        }
      : state.held;

  // Under the single payout there is no fork left to take: a pop pays TILES
  // and scores automatically, and only BURN and TREASURE trade that away.
  // `tiles` and `points` become the same instruction — the two names survive
  // so every saved run, replay and policy written before the pivot still
  // means what it meant.
  const pops = t.singlePayout ? choice !== 'treasure' && choice !== 'burn' : choice === 'tiles';
  const scores = t.singlePayout ? pops : choice === 'points';
  const scored = t.singlePayout ? Math.floor(points * t.pointsPerPop) : points;

  // Luck arrives mostly as a FLAT amount per pop, so three small pockets beat
  // one big one at buying better draws while the big one beats them at tiles
  // and score. That is the whole reason to ever pop early — see `luckPerPop`.
  // Burning trades the tiles away for several times as much of it.
  const perPop =
    t.luckPerPop > 0 || t.luckPerTile !== 1 ? t.luckPerPop + count * t.luckPerTile : count;
  const luckGained = choice === 'burn' ? count * t.burnLuck : pops ? perPop : 0;

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
    quest: collected ? null : state.quest,
    bias,
    log: {
      ...state.log,
      popped: state.log.popped + count,
      questsDone: state.log.questsDone + (collected ? 1 : 0),
      harvests: [
        ...state.log.harvests,
        {
          mapNumber: state.mapNumber,
          at: state.placements,
          count,
          choice,
          tiles: pops ? tiles : 0,
          points: scores ? scored : 0,
        },
      ],
    },
  });
}

/**
 * You may leave a map once you have harvested on it.
 *
 * Without that condition leaving is free and unlimited, and the map multiplier
 * becomes free with it: skip to map 40 touching nothing, then farm at 40x. The
 * condition prices depth in the only currency the game has — you must build
 * something up to ripeness and cash it in before you are allowed to move on —
 * and it does so as one sentence rather than as another number to tune.
 */
export const canLeave = (state: GameState): boolean =>
  state.tuning.world !== 'endless' &&
  state.phase === 'placing' &&
  state.log.harvests.some((h) => h.mapNumber === state.mapNumber);

function leave(state: GameState): GameState {
  if (!canLeave(state)) return state;

  const mapNumber = state.mapNumber + 1;
  const opened = openMap(state.rng, mapNumber, state.tuning, state.luck);

  return endIfStuck({
    ...state,
    mapNumber,
    cells: opened.cells,
    draft: opened.draft,
    selected: 0,
    rng: opened.rng,
    log: { ...state.log, placementsAtMapStart: state.placements },
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
  const t = state.tuning;
  const solvent = canAfford(state.tiles);
  const timeUp = outOfTime(state);

  // The bounded game has no clock and can only die broke, so money alone
  // settles it there.
  if (solvent && !timeUp && t.world !== 'endless') return state;

  // Whatever ended the run — money or the clock — you always get to cash what
  // is already ripe. Dying with a finished pocket unpopped because the timer
  // ticked between the placement and the tap would be a cheat, not a
  // decision. What the clock takes is the pockets you did NOT finish.
  if (ripeKeys(state.cells).length > 0) return state;

  if (timeUp) return ending(state, 'spent');
  if (!solvent) return ending(state, 'broke');
  if (isExhausted(state.cells)) return ending(state, 'walled');
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
  if (t.endReachBonus <= 0 && t.endClaimBonus <= 0) {
    return { ...state, phase: 'ended', death };
  }

  let reach = 0;
  let claims = 0;
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind === 'landmark' && cell.claimed) claims++;
    if (cell.kind !== 'tile' && cell.kind !== 'stone') continue;
    reach = Math.max(reach, distance(parse(k), { q: 0, r: 0 }));
  }

  return {
    ...state,
    phase: 'ended',
    death,
    points: state.points + reach * t.endReachBonus + claims * t.endClaimBonus,
  };
}
