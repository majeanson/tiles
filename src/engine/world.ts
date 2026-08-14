import { COLOURS, type Colour, type Tuning } from '@content/tuning';
import type { LandmarkReward } from './state';

/**
 * The ground under the endless world, as a pure function.
 *
 * `terrainAt(seed, q, r, t)` answers what has always been at a hex, for any
 * hex, without storing anything — which is the whole trick that makes an
 * unbounded plane free in a pure engine. The reducer consults it exactly once
 * per cell, at the moment growth reveals that cell, and bakes the answer into
 * the board; nothing ever asks twice, so nothing can ever disagree.
 *
 * Deliberately not an `RngStream`: streams exist for sequences, where each draw
 * advances a cursor. Terrain is a lookup, keyed by position — the same hex must
 * give the same answer whether it is revealed first or four-hundredth.
 */

export type Terrain = {
  readonly wall: boolean;
  /** The colour this ground is native to, if any. Walls are native to nothing. */
  readonly native: Colour | null;
};

const OPEN: Terrain = { wall: false, native: null };

/**
 * One 32-bit hash of (seed, x, y), uniform in [0, 1). The finalizer is
 * mulberry32's, the same mixing the run's streams trust, applied to a position
 * instead of a cursor.
 */
function hashAt(seed: number, x: number, y: number): number {
  let h = (seed ^ (x * 0x9e3779b1) ^ (y * 0x85ebca77)) | 0;
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

export type Destination = {
  readonly q: number;
  readonly r: number;
  readonly reward: LandmarkReward;
  /** Set on territories: the colour of the field a claim unfurls. */
  readonly colour: Colour | null;
};

const hexDistance = (q: number, r: number): number =>
  Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));

/**
 * The one destination a block of the plane holds, if it holds one.
 *
 * Same trick as native fields, one scale up: the plane is tiled into blocks of
 * `destinationEvery` hexes, each block rolls once for whether-and-where, and
 * the answer is a pure function of `(worldSeed, block)` — so a destination is
 * exactly as permanent as the ground it stands on. The reward mix rides the
 * same roll's remainder; a second hash places it inside the block so position
 * and kind cannot correlate. Blocks whose pick lands within a block-width of
 * home are empty: the first destination is always a journey, never a spawn gift.
 */
export function blockDestination(
  seed: number,
  bq: number,
  br: number,
  t: Tuning,
): Destination | null {
  const size = Math.max(1, t.destinationEvery);
  if (t.destinationEvery <= 0 || t.destinationChance <= 0) return null;

  const roll = hashAt(seed ^ 0x2c9277b5, bq, br);
  if (roll >= t.destinationChance) return null;

  const spot = hashAt(seed ^ 0x6b79a3d1, bq, br);
  const q = bq * size + Math.floor((spot * size * size) % size);
  const r = br * size + Math.floor(spot * size);
  if (hexDistance(q, r) < size / 2) return null;

  // 40% cache, 40% site, 20% territory — enough territories to matter, not so
  // many that the plane is pre-conquered. Reward kinds ride the presence roll.
  const kind = roll / t.destinationChance;
  const reward: LandmarkReward = kind < 0.4 ? 'cache' : kind < 0.8 ? 'site' : 'territory';

  const colour =
    reward === 'territory'
      ? (COLOURS[Math.floor(hashAt(seed ^ 0x1f83d9ab, q, r) * COLOURS.length) % COLOURS.length] ??
        null)
      : null;
  return { q, r, reward, colour };
}

/** The destination standing at exactly this hex, if any. What reveal consults. */
export function destinationAt(seed: number, q: number, r: number, t: Tuning): Destination | null {
  const size = Math.max(1, t.destinationEvery);
  const d = blockDestination(seed, Math.floor(q / size), Math.floor(r / size), t);
  return d !== null && d.q === q && d.r === r ? d : null;
}

/**
 * Every destination within `radius` of home. The view calls this to draw
 * beacons for destinations the board has not grown to yet — the glow through
 * the not-yet-drawn ground that makes "where do I push next" a real question.
 */
export function destinationsWithin(seed: number, radius: number, t: Tuning): Destination[] {
  if (t.destinationEvery <= 0 || t.destinationChance <= 0) return [];
  const size = Math.max(1, t.destinationEvery);
  const blocks = Math.ceil(radius / size);

  const out: Destination[] = [];
  for (let bq = -blocks - 1; bq <= blocks; bq++) {
    for (let br = -blocks - 1; br <= blocks; br++) {
      const d = blockDestination(seed, bq, br, t);
      if (d !== null && hexDistance(d.q, d.r) <= radius) out.push(d);
    }
  }
  return out;
}

/**
 * The biome a hex sits in: one colour's country, or none. A pure hash at the
 * broadest scale the plane has — destinations are blocks, fields are patches,
 * biomes are regions — so "where am I" has an answer bigger than one screen.
 */
export function biomeAt(seed: number, q: number, r: number, t: Tuning): Colour | null {
  if (t.biomeEvery <= 0 || t.biomeChance <= 0) return null;
  const size = Math.max(1, t.biomeEvery);
  const roll = hashAt(seed ^ 0x4a1c9d37, Math.floor(q / size), Math.floor(r / size));
  if (roll >= t.biomeChance) return null;
  return COLOURS[Math.floor((roll / t.biomeChance) * COLOURS.length) % COLOURS.length] ?? null;
}

export function terrainAt(seed: number, q: number, r: number, t: Tuning): Terrain {
  // Arrival ground is clean: the origin and its ring hold no walls and favour
  // no colour, so every run starts with the same fair, placeable clearing.
  if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 1) return OPEN;

  if (hashAt(seed ^ 0x51ab3e21, q, r) < t.worldWalls) return { wall: true, native: null };

  // Native fields are coarse: one roll per block of `fieldSize` hexes, so the
  // ground reads as regions rather than static. The same roll picks whether a
  // block is native and to which colour, spending its low bits on the which —
  // unless a biome claims this ground, in which case every field in it wears
  // the biome's colour and the region reads as one colour's country.
  const size = Math.max(1, t.fieldSize);
  const roll = hashAt(seed ^ 0x7f4a7c15, Math.floor(q / size), Math.floor(r / size));
  if (roll >= t.fieldChance) return OPEN;

  const biome = biomeAt(seed, q, r, t);
  const colour =
    biome ?? COLOURS[Math.floor((roll / t.fieldChance) * COLOURS.length) % COLOURS.length];
  return colour === undefined ? OPEN : { wall: false, native: colour };
}
