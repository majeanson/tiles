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
  // The gradual dial: density climbs from nothing at home to the full chance
  // over `destinationRampBlocks` blocks, so the near world is sparse and the
  // horizon is where the lights are. Off (0) leaves the chance flat.
  const ramp =
    t.destinationRampBlocks > 0 ? Math.min(1, hexDistance(bq, br) / t.destinationRampBlocks) : 1;
  const chance = t.destinationChance * ramp;
  if (roll >= chance) return null;

  const spot = hashAt(seed ^ 0x6b79a3d1, bq, br);
  const q = bq * size + Math.floor((spot * size * size) % size);
  const r = br * size + Math.floor(spot * size);
  if (hexDistance(q, r) < size / 2) return null;

  // 40% cache, 35% site, 17% territory, 8% shrine near home — caches carry
  // survival so they lead close in, and shrines are rare because an unlock
  // you meet every run is not an unlock. Reward kinds ride the presence roll.
  //
  // Deep water (2026-08-18): past `deepWaterRampBlocks` blocks the cache
  // share has tilted all the way to `cacheShareFar`, and site/territory
  // thicken to fill what cache gave up — each SCALED, so they keep their
  // near-water ratio to one another and to shrine, whose share is always
  // the remainder rather than a fourth scaled number (float-drift-proof: the
  // three thresholds below always sum to exactly 1). `> 0` is the whole
  // gate: an old save's `deepWaterRampBlocks` decodes as `undefined`, which
  // fails it and reproduces the original fixed split untouched.
  const NEAR_CACHE_SHARE = 0.4;
  const NEAR_SITE_SHARE = 0.35;
  const NEAR_TERRITORY_SHARE = 0.17;
  let cacheShare = NEAR_CACHE_SHARE;
  let siteShare = NEAR_SITE_SHARE;
  let territoryShare = NEAR_TERRITORY_SHARE;
  if (t.deepWaterRampBlocks > 0) {
    const deepRamp = Math.min(1, hexDistance(bq, br) / t.deepWaterRampBlocks);
    cacheShare = NEAR_CACHE_SHARE + (t.cacheShareFar - NEAR_CACHE_SHARE) * deepRamp;
    const scale = (1 - cacheShare) / (1 - NEAR_CACHE_SHARE);
    siteShare = NEAR_SITE_SHARE * scale;
    territoryShare = NEAR_TERRITORY_SHARE * scale;
  }

  const kind = roll / chance;
  const reward: LandmarkReward =
    kind < cacheShare
      ? 'cache'
      : kind < cacheShare + siteShare
        ? 'site'
        : kind < cacheShare + siteShare + territoryShare
          ? 'territory'
          : 'shrine';

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
 * A hidden find: the landmark that is never advertised.
 *
 * Carries no reward field because the reward is not the engine's business —
 * reaching one grants a PERK, which outlives the run, so the engine only
 * marks it reached and the shell reads that (the shrine contract, exactly).
 */
export type Find = { readonly q: number; readonly r: number };

/**
 * The one hidden find a block of the plane holds, if it holds one.
 *
 * Mirrors `blockDestination` on its OWN salts and its own block scale, so
 * switching finds on cannot move a single existing destination — worlds
 * already explored keep every landmark exactly where it was. Two rules of its
 * own: nothing within a block-width of home (a find is deep-world by design,
 * where a shrine merely thins near it), and where `destinationAt` claims the
 * same hex the destination wins and the find does not exist — deterministic
 * precedence, decided here so `findAt` and `findsWithin` cannot disagree.
 */
export function blockFind(seed: number, bq: number, br: number, t: Tuning): Find | null {
  const size = Math.max(1, t.findEvery);
  // `undefined <= 0` is false, not true — a save written before these dials
  // existed decodes them as `undefined`, and the old `<= 0` guard let that
  // slip through into `blockFind` running on NaN. Written as "not > 0" so
  // absent and zero both read as off.
  if (!(t.findEvery > 0) || !(t.findChance > 0)) return null;

  const roll = hashAt(seed ^ 0x5f356495, bq, br);
  if (roll >= t.findChance) return null;

  const spot = hashAt(seed ^ 0x3c6ef372, bq, br);
  const q = bq * size + Math.floor((spot * size * size) % size);
  const r = br * size + Math.floor(spot * size);
  if (hexDistance(q, r) < size) return null;

  if (destinationAt(seed, q, r, t) !== null) return null;
  return { q, r };
}

/** The hidden find standing at exactly this hex, if any. What reveal consults. */
export function findAt(seed: number, q: number, r: number, t: Tuning): Find | null {
  const size = Math.max(1, t.findEvery);
  const f = blockFind(seed, Math.floor(q / size), Math.floor(r / size), t);
  return f !== null && f.q === q && f.r === r ? f : null;
}

/**
 * Every hidden find within `radius` of home. NOT a beacon feed: the one
 * consumer is the shimmer (`findSense` > 0), and nothing else may draw an
 * unrevealed find — a find that shows through the dark is a destination with
 * extra steps, and the whole design is that you stumble on it.
 */
export function findsWithin(seed: number, radius: number, t: Tuning): Find[] {
  if (!(t.findEvery > 0) || !(t.findChance > 0)) return [];
  const size = Math.max(1, t.findEvery);
  const blocks = Math.ceil(radius / size);

  const out: Find[] = [];
  for (let bq = -blocks - 1; bq <= blocks; bq++) {
    for (let br = -blocks - 1; br <= blocks; br++) {
      const f = blockFind(seed, bq, br, t);
      if (f !== null && hexDistance(f.q, f.r) <= radius) out.push(f);
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

/**
 * How high this hex sits, 0..1 — pure, like everything else out here.
 *
 * Marc, 2026-08-16, asking what to do about visuals: "real terrains? 3d like
 * topography?" This is the honest version of topography for a board that has
 * to stay readable under a thumb in portrait. Height is a FUNCTION of the
 * world seed, so it costs nothing to store, arrives already consistent for
 * every run on this world, and can be drawn as bevel and shadow rather than
 * as geometry that would occlude the numbers.
 *
 * Purely cosmetic, and that is Marc's call rather than an omission: the
 * economy took four sessions to settle and a look must not be allowed to move
 * it. `elevationEvery` 0 flattens the world entirely.
 *
 * Two octaves, coarse plus fine, because one block-hash gives plateaus with
 * visible square seams — the second octave at a third the scale breaks the
 * blocks up into something that reads as land.
 */
export function elevationAt(seed: number, q: number, r: number, t: Tuning): number {
  if (t.elevationEvery <= 0) return 0;
  const coarse = Math.max(1, t.elevationEvery);
  const fine = Math.max(1, Math.round(coarse / 3));

  const a = hashAt(seed ^ 0x2f6a5c11, Math.floor(q / coarse), Math.floor(r / coarse));
  const b = hashAt(seed ^ 0x7d3e1b95, Math.floor(q / fine), Math.floor(r / fine));
  return a * 0.65 + b * 0.35;
}

/**
 * Height rounded to `elevationBands` steps.
 *
 * Bands rather than a continuum: a contour map reads as terrain where a smooth
 * gradient reads as a stain, and banding is what lets one hex be visibly
 * higher than the one beside it at the size a phone draws them.
 */
export function elevationBandAt(seed: number, q: number, r: number, t: Tuning): number {
  if (t.elevationEvery <= 0 || t.elevationBands <= 1) return 0;
  const raw = elevationAt(seed, q, r, t);
  return Math.min(t.elevationBands - 1, Math.floor(raw * t.elevationBands));
}
