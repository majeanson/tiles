import { distance, parse, type HexKey } from '@engine/hex';
import type { GameState } from '@engine/state';

const ORIGIN = { q: 0, r: 0 };

/**
 * The world you keep (P4a of `ideas/persistent-world.md`).
 *
 * One world per device: a seed rolled once and never rerolled, the ground you
 * have ever revealed, and the territories you have ever claimed. Everything
 * else resets — tiles, stone, caches, sites — so each run is a fresh
 * expedition into a place you know better than last time.
 *
 * Only KEYS are stored. Terrain is a pure function of `(worldSeed, hex)`, so
 * remembering that a hex was seen is enough to redraw exactly what was there;
 * storing the terrain itself would be storing a derivable, and it would go
 * stale the moment a tuning number moved.
 *
 * Lives in `meta/` because the engine may not know about storage: memory
 * reaches the reducer as plain data on `newRun`, which keeps a run
 * reproducible from seed + tuning + memory and keeps replays honest.
 */

export type WorldMemory = {
  readonly worldSeed: number;
  /** Every hex the player has ever had on their board, across all runs. */
  readonly revealed: readonly HexKey[];
  /** Territory landmarks claimed for good. They greet you already yours. */
  readonly territories: readonly HexKey[];
  /** What the world has seen. The atlas line reads these. */
  readonly runs: number;
  readonly bestPoints: number;
  readonly farthestReach: number;
};

export const newWorld = (worldSeed: number): WorldMemory => ({
  worldSeed,
  revealed: [],
  territories: [],
  runs: 0,
  bestPoints: 0,
  farthestReach: 0,
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const keys = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((k) => typeof k === 'string') ? v : null;

/** Untrusted input, like every stored thing. A broken world is no world. */
export function decodeWorld(raw: string | null): WorldMemory | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (typeof parsed['worldSeed'] !== 'number') return null;

  const revealed = keys(parsed['revealed']);
  const territories = keys(parsed['territories']);
  if (revealed === null || territories === null) return null;

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    worldSeed: parsed['worldSeed'],
    revealed,
    territories,
    runs: num(parsed['runs']),
    bestPoints: num(parsed['bestPoints']),
    farthestReach: num(parsed['farthestReach']),
  };
}

export const encodeWorld = (world: WorldMemory): string => JSON.stringify(world);

/**
 * Fold a finished (or abandoned) run into the world. Pure; the caller stores.
 *
 * Revealed ground accumulates by union — the map only ever grows. Territories
 * likewise, and only the CLAIMED ones: a territory you walked past but never
 * touched is still out there waiting, which is the point of it being a place.
 */
export function rememberRun(world: WorldMemory, state: GameState): WorldMemory {
  const revealed = new Set(world.revealed);
  const territories = new Set(world.territories);
  let reach = 0;

  for (const [k, cell] of Object.entries(state.cells)) {
    revealed.add(k);
    if (cell.kind === 'landmark' && cell.reward === 'territory' && cell.claimed) {
      territories.add(k);
    }
    if (cell.kind === 'tile' || cell.kind === 'stone') {
      reach = Math.max(reach, distance(parse(k), ORIGIN));
    }
  }

  return {
    worldSeed: world.worldSeed,
    revealed: [...revealed],
    territories: [...territories],
    runs: world.runs + 1,
    bestPoints: Math.max(world.bestPoints, state.points),
    farthestReach: Math.max(world.farthestReach, reach),
  };
}

/**
 * How much of the world is known, as a fraction of a disc the size of the
 * farthest thing ever reached (minimum ten, so run one is not "100% of a
 * one-hex world"). Honest rather than flattering: the plane is infinite, so
 * any percentage is a story about YOUR world, and this is the least
 * misleading story available.
 */
export function knownFraction(world: WorldMemory): number {
  const radius = Math.max(10, world.farthestReach);
  const disc = 3 * radius * (radius + 1) + 1;
  return Math.min(1, world.revealed.length / disc);
}
