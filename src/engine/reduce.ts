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
  payPlacement,
  ripeKeys,
} from './rules';
import type { Action, Cell, GameState, HarvestChoice, Rarity, Tile } from './state';
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
function rollTile(
  tiles: RngStream,
  loot: RngStream,
  t: Tuning,
  luck: number,
): Rolled & { tile: Tile } {
  const [colour, nextTiles] = rngWeighted(tiles, COLOUR_WEIGHTS);

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
): Rolled & { draft: Tile[] } {
  const draft: Tile[] = [];
  let cur: Rolled = { tiles, loot };
  for (let i = 0; i < t.draftWidth; i++) {
    const rolled = rollTile(cur.tiles, cur.loot, t, luck);
    draft.push(rolled.tile);
    cur = rolled;
  }
  return { draft, ...cur };
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

function claimedFields(cells: Readonly<Record<HexKey, Cell>>): Field[] {
  const out: Field[] = [];
  for (const [k, cell] of Object.entries(cells)) {
    if (cell.kind === 'landmark' && cell.reward === 'territory' && cell.claimed) {
      if (cell.colour !== undefined) out.push({ ...parse(k), colour: cell.colour });
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
function revealCell(rootSeed: number, k: HexKey, t: Tuning, fields: readonly Field[]): Cell {
  const { q, r } = parse(k);

  const dest = destinationAt(rootSeed, q, r, t);
  if (dest !== null) {
    return dest.colour === null
      ? { kind: 'landmark', reward: dest.reward, claimed: false }
      : { kind: 'landmark', reward: dest.reward, claimed: false, colour: dest.colour };
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
): { cells: Record<HexKey, Cell>; draft: Tile[]; rng: RngStreams } {
  const seeded = rollTile(rng.tiles, rng.loot, t, 0);
  const cells: Record<HexKey, Cell> = {
    [key(0, 0)]: tileCell(seeded.tile.colour, false, seeded.tile.rarity),
  };
  for (const n of neighbourKeys(0, 0)) cells[n] = revealCell(rootSeed, n, t, []);

  const { draft, tiles, loot } = rollDraft(seeded.tiles, seeded.loot, t, 0);
  return { cells, draft, rng: { ...rng, tiles, loot } };
}

export function newRun(rootSeed: number, tuning: Tuning = TUNING): GameState {
  const streams = streamsFrom(rootSeed);
  const opened =
    tuning.world === 'endless'
      ? openWorld(rootSeed, streams, tuning)
      : openMap(streams, 1, tuning, 0);

  return {
    version: 1,
    rootSeed,
    rng: opened.rng,
    tuning,
    phase: 'placing',
    death: null,
    tiles: tuning.startingTiles,
    points: 0,
    placements: 0,
    mapNumber: 1,
    luck: 0,
    cells: opened.cells,
    draft: opened.draft,
    selected: 0,
    log: { harvests: [], popped: 0, placementsAtMapStart: 0 },
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
    case 'LEAVE':
      return leave(state);
  }
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

  // A tile on its own native ground carries that fact from the cell it covers.
  const ground = state.cells[hex];
  const onNative = ground?.kind === 'empty' && ground.native === tile.colour;

  const cells: Record<HexKey, Cell> = {
    ...state.cells,
    [hex]: tileCell(tile.colour, onNative, tile.rarity),
  };

  let tiles = payPlacement(state.tiles, costOf(state.placements, t));
  let points = state.points;

  if (t.world === 'endless') {
    // The endless plane grows under your feet: placing a tile reveals the
    // ground around it, which keeps the invariant that no tile ever borders an
    // absent cell. What it reveals is the terrain function's answer — walls
    // and landmarks included, which is how the plane gets to say no and where.
    const { q, r } = parse(hex);
    const fields = claimedFields(state.cells);
    for (const n of neighbourKeys(q, r)) cells[n] ??= revealCell(state.rootSeed, n, t, fields);

    // Reaching a destination: the tile you just placed touching an unclaimed
    // landmark claims it, once, on the spot. A cache pays after the placement
    // cost, so it can be the thing that saves a run at zero.
    for (const n of neighbourKeys(q, r)) {
      const c = cells[n];
      if (c?.kind !== 'landmark' || c.claimed) continue;
      cells[n] = { ...c, claimed: true };

      if (c.reward === 'cache') tiles += t.cachePays;
      if (c.reward === 'site') points += t.sitePays * distanceMultiplierAt(n, t);
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
  } = rollDraft(state.rng.tiles, state.rng.loot, t, state.luck);

  return endIfStuck({
    ...state,
    cells,
    placements: state.placements + 1,
    tiles,
    points,
    draft,
    selected: 0,
    rng: { ...state.rng, tiles: tilesStream, loot },
  });
}

function harvest(state: GameState, choice: HarvestChoice, at?: HexKey): GameState {
  if (state.phase !== 'placing') return state;

  const { keys, count, tiles, points } = harvestValue(state, at);
  if (keys.length === 0) return state;

  // Popped tiles become stone: still surrounding, no longer matching. On a
  // bounded map that is the reason to leave; on the endless plane it is the
  // reason to keep moving outward — the wake behind you is spent ground.
  const cells: Record<HexKey, Cell> = { ...state.cells };
  for (const k of keys) cells[k] = { kind: 'stone' };

  return endIfStuck({
    ...state,
    cells,
    tiles: choice === 'tiles' ? state.tiles + tiles : state.tiles,
    points: choice === 'points' ? state.points + points : state.points,
    // Cashing a pocket as SURVIVAL is what raises the draft's rarity odds —
    // each popped tile is a point of luck, capped so it converges rather than
    // compounds. The points side already had its excitement; now tiles do.
    luck: choice === 'tiles' ? Math.min(state.tuning.luckCap, state.luck + count) : state.luck,
    log: {
      ...state.log,
      popped: state.log.popped + count,
      harvests: [
        ...state.log.harvests,
        { mapNumber: state.mapNumber, at: state.placements, count, choice, tiles, points },
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
  const solvent = canAfford(state.tiles);
  // The bounded game can only die broke, so money alone settles it there.
  if (solvent && state.tuning.world !== 'endless') return state;

  if (ripeKeys(state.cells).length > 0) return state;
  if (!solvent) return { ...state, phase: 'ended', death: 'broke' };
  if (isExhausted(state.cells)) return { ...state, phase: 'ended', death: 'walled' };
  return state;
}
