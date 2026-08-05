import { COLOURS, type Colour, type Tuning } from '@content/tuning';

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

export function terrainAt(seed: number, q: number, r: number, t: Tuning): Terrain {
  // Arrival ground is clean: the origin and its ring hold no walls and favour
  // no colour, so every run starts with the same fair, placeable clearing.
  if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 1) return OPEN;

  if (hashAt(seed ^ 0x51ab3e21, q, r) < t.worldWalls) return { wall: true, native: null };

  // Native fields are coarse: one roll per block of `fieldSize` hexes, so the
  // ground reads as regions rather than static. The same roll picks whether a
  // block is native and to which colour, spending its low bits on the which.
  const size = Math.max(1, t.fieldSize);
  const roll = hashAt(seed ^ 0x7f4a7c15, Math.floor(q / size), Math.floor(r / size));
  if (roll >= t.fieldChance) return OPEN;

  const colour = COLOURS[Math.floor((roll / t.fieldChance) * COLOURS.length) % COLOURS.length];
  return colour === undefined ? OPEN : { wall: false, native: colour };
}
