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
  /**
   * Shrines reached, and therefore systems switched on for this world (M4).
   * Stored as the hex so a shrine cannot be claimed twice, and mapped to what
   * it grants by `UNLOCKS` — geography IS the unlock ledger.
   */
  readonly shrines: readonly HexKey[];
  /**
   * Hidden finds claimed, ever (2026-08-18, closing the find re-farm). The
   * same ride as `territories`: fed back to `newRun` so a find in this list
   * reveals already claimed and pays no relics a second time, and read
   * directly by the shell's `findLabel` hook so it refuses to grant a perk
   * for a hex already here — the perk grant lives outside the engine, so the
   * engine's "already claimed" alone cannot stop it being asked for twice.
   */
  readonly finds: readonly HexKey[];
  /** What the world has seen. The atlas line reads these. */
  readonly runs: number;
  readonly bestPoints: number;
  readonly farthestReach: number;
};

export const newWorld = (worldSeed: number): WorldMemory => ({
  worldSeed,
  revealed: [],
  territories: [],
  shrines: [],
  finds: [],
  runs: 0,
  bestPoints: 0,
  farthestReach: 0,
});

/**
 * What the Nth shrine you reach switches on, in order (M4).
 *
 * The unlock ledger `DESIGN.md` has carried since the first design pass, now
 * addressed as places rather than as a table: each entry is a system that
 * exists and is off, and the way to turn it on is to walk to it. Order is
 * fixed rather than random so a world's progression is a story you can tell
 * someone, and short rather than endless — four shrines is a world's worth of
 * reasons to go and look.
 *
 * The ledger shipped with five entries; the first, 'the treasure payout', was
 * retired 2026-08-18 — `applyUnlocks` (`src/main.ts`) never read it, because
 * treasure had already shipped on for everyone in `TUNING` by the time the
 * ledger was written. A shrine wired to nothing is worse than no shrine, so
 * the entry is gone rather than fixed to gate what it can no longer gate.
 * Worlds that had already claimed a shrine or more keep their count; every
 * position after the first shifts down one, so those shrines now unlock a
 * REAL system one slot earlier than before — a one-time generosity, not a
 * bug, and nobody's progress moves backward.
 */
export const UNLOCKS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'draft', label: 'A fourth draft card' },
  { id: 'hold', label: 'A second stash slot' },
  { id: 'luck', label: 'Twice the rare-tile odds' },
  { id: 'reach', label: 'Destinations glow from twice as far' },
];

/** The unlocks a world has earned, in ledger order. */
export const unlockedBy = (world: WorldMemory): readonly string[] =>
  UNLOCKS.slice(0, world.shrines.length).map((u) => u.id);

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
  // Shrines arrived after the first worlds existed: an older world has none,
  // which is true rather than corrupt. Finds the same, since (2026-08-18).
  const shrines = keys(parsed['shrines']) ?? [];
  const finds = keys(parsed['finds']) ?? [];

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    worldSeed: parsed['worldSeed'],
    revealed,
    territories,
    shrines,
    finds,
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
  return { ...mergeRun(world, state), runs: world.runs + 1 };
}

/**
 * Everything `rememberRun` folds in EXCEPT the run count — so a run in
 * progress can keep the world current after every action.
 *
 * Split out because waiting for the end of a run was wrong twice over: a
 * shrine woken at placement 40 did not appear in the atlas until the
 * expedition finished (Marc: "it still shows 0 of 5 found"), and a player who
 * simply closed the tab lost the territory they had just claimed. Ground and
 * claims are facts the moment they happen; only "how many runs" waits for a
 * run to be over.
 */
export function mergeRun(world: WorldMemory, state: GameState): WorldMemory {
  const revealed = new Set(world.revealed);
  const territories = new Set(world.territories);
  const shrines = new Set(world.shrines);
  const finds = new Set(world.finds);
  let reach = 0;

  for (const [k, cell] of Object.entries(state.cells)) {
    revealed.add(k);
    if (cell.kind === 'landmark' && cell.claimed) {
      if (cell.reward === 'territory') territories.add(k);
      // A shrine reached is a system switched on for good — but only up to
      // the ledger's length, so a world cannot bank unlocks it has no use for.
      if (cell.reward === 'shrine' && shrines.size < UNLOCKS.length) shrines.add(k);
      // A find claimed, the same ride as a territory: remembered so it
      // reveals already spent and cannot be walked into twice for a perk.
      if (cell.reward === 'find') finds.add(k);
    }
    if (cell.kind === 'tile' || cell.kind === 'stone') {
      reach = Math.max(reach, distance(parse(k), ORIGIN));
    }
  }

  return {
    worldSeed: world.worldSeed,
    revealed: [...revealed],
    territories: [...territories],
    shrines: [...shrines],
    finds: [...finds],
    // The run count is rememberRun's alone — this function runs after EVERY
    // action, and when it bumped the count too (2026-08-18) the atlas called
    // each tap a run. That is what the docblock's "EXCEPT" always meant.
    runs: world.runs,
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
