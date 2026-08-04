import { COLOUR_WEIGHTS, TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, parse, type HexKey } from './hex';
import { generateMap } from './map';
import { rngWeighted, streamsFrom, type RngStream, type RngStreams } from './rng';
import { canAfford, canPlaceAt, costOf, harvestValue, payPlacement, ripeKeys } from './rules';
import type { Action, Cell, GameState, HarvestChoice, Tile } from './state';

/**
 * The engine. `reduce(state, action) -> state`, and nothing else.
 *
 * Illegal actions RETURN THE STATE UNCHANGED rather than throwing. The UI is
 * responsible for not offering them; the engine is responsible for not trusting
 * the UI. A thrown error here would be a crash in the player's hand for what is
 * usually a double-tap.
 */

/**
 * Tile ids come from the stream cursor, which only ever increases. That makes
 * them unique for the whole run without a counter in state, and it makes an
 * action log readable — the id says which roll produced the tile.
 */
function rollTile(stream: RngStream): [Tile, RngStream] {
  const [colour, next] = rngWeighted(stream, COLOUR_WEIGHTS);
  return [{ id: `t${stream.cursor}`, colour }, next];
}

function rollDraft(stream: RngStream, width: number): [Tile[], RngStream] {
  const out: Tile[] = [];
  let cur = stream;
  for (let i = 0; i < width; i++) {
    const [tile, next] = rollTile(cur);
    out.push(tile);
    cur = next;
  }
  return [out, cur];
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
): { cells: Record<HexKey, Cell>; draft: Tile[]; rng: RngStreams } {
  const [cells, region] = generateMap(rng.region, mapNumber, t);

  const [seed, afterSeed] = rollTile(rng.tiles);
  cells[key(0, 0)] = { kind: 'tile', colour: seed.colour };

  const [draft, tiles] = rollDraft(afterSeed, t.draftWidth);
  return { cells, draft, rng: { ...rng, region, tiles } };
}

/**
 * The endless world is GROWN, not generated: the seed tile and its six empty
 * neighbours are the entire starting board, and every placement materialises
 * the empty ground around itself (see `place`). The invariant that buys is
 * that no tile ever borders an absent cell — so "absent counts as solid",
 * which the bounded game leans on for its rims, simply never comes up, and
 * every rule function works on both worlds unchanged.
 */
function openWorld(
  rng: RngStreams,
  t: Tuning,
): { cells: Record<HexKey, Cell>; draft: Tile[]; rng: RngStreams } {
  const [seed, afterSeed] = rollTile(rng.tiles);
  const cells: Record<HexKey, Cell> = { [key(0, 0)]: { kind: 'tile', colour: seed.colour } };
  for (const n of neighbourKeys(0, 0)) cells[n] = { kind: 'empty' };

  const [draft, tiles] = rollDraft(afterSeed, t.draftWidth);
  return { cells, draft, rng: { ...rng, tiles } };
}

export function newRun(rootSeed: number, tuning: Tuning = TUNING): GameState {
  const streams = streamsFrom(rootSeed);
  const opened =
    tuning.world === 'endless' ? openWorld(streams, tuning) : openMap(streams, 1, tuning);

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

  const tile = state.draft[state.selected];
  if (tile === undefined) return state;
  if (!canPlaceAt(state.cells, hex)) return state;
  if (!canAfford(state.tiles)) return state;

  const cells: Record<HexKey, Cell> = {
    ...state.cells,
    [hex]: { kind: 'tile', colour: tile.colour },
  };

  // The endless plane grows under your feet: placing a tile materialises the
  // empty ground around it, which keeps the invariant that no tile ever
  // borders an absent cell. The frontier this creates is also why the endless
  // world can never be exhausted — only unaffordable.
  if (state.tuning.world === 'endless') {
    const { q, r } = parse(hex);
    for (const n of neighbourKeys(q, r)) cells[n] ??= { kind: 'empty' };
  }

  const [draft, tilesStream] = rollDraft(state.rng.tiles, state.tuning.draftWidth);

  return endIfStuck({
    ...state,
    cells,
    placements: state.placements + 1,
    tiles: payPlacement(state.tiles, costOf(state.placements, state.tuning)),
    draft,
    selected: 0,
    rng: { ...state.rng, tiles: tilesStream },
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
  const opened = openMap(state.rng, mapNumber, state.tuning);

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
 * long as you may still leave it. What kills you is the cost curve, every time.
 */
function endIfStuck(state: GameState): GameState {
  if (canAfford(state.tiles)) return state;
  if (ripeKeys(state.cells).length > 0) return state;
  return { ...state, phase: 'ended', death: 'broke' };
}
