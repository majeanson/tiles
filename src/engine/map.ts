import type { Tuning } from '@content/tuning';
import { disc, key, type Hex, type HexKey } from './hex';
import { rngChance, type RngStream } from './rng';
import type { Cell } from './state';

/**
 * Where a map comes from.
 *
 * Deliberately boring for run one: a disc that grows with depth. The design says
 * map TYPES — wall patterns, odd shapes — are unlock 5, and inventing variety
 * before the plain case is proven fun is how v1 ended up with twenty nouns.
 *
 * What this file does own is that a map's shape is a function of depth and a
 * seed and nothing else, which is what lets the harness replay a run.
 */

/** Radius by depth, capped so the board still fits a phone held in one hand. */
export function radiusFor(mapNumber: number, t: Tuning): number {
  const grown = t.mapBaseRadius + Math.floor((mapNumber - 1) / t.mapGrowsEvery);
  return Math.min(t.mapMaxRadius, grown);
}

/** The cells a map of this depth is cut from, before anything is placed. */
export const shapeFor = (mapNumber: number, t: Tuning): Hex[] => disc(radiusFor(mapNumber, t));

/**
 * A fresh map: empty ground, some of it wall.
 *
 * The centre is never wall — rule 2 needs something to touch, and the run's seed
 * tile goes there. Walls fall by an independent coin flip per cell rather than
 * by a pattern, because a pattern is art direction and Gate E is shut. At the
 * default density of zero this still consumes randomness, which keeps a stream's
 * cursor comparable across a sweep that varies the density.
 */
export function generateMap(
  stream: RngStream,
  mapNumber: number,
  t: Tuning,
): [Record<HexKey, Cell>, RngStream] {
  const cells: Record<HexKey, Cell> = {};
  const centre = key(0, 0);
  let cur = stream;

  for (const h of shapeFor(mapNumber, t)) {
    const k = key(h.q, h.r);
    const [wall, next] = rngChance(cur, t.wallDensity);
    cur = next;
    cells[k] = wall && k !== centre ? { kind: 'wall' } : { kind: 'empty' };
  }

  return [cells, cur];
}
