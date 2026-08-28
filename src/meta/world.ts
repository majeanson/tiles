import { distance, parse, type HexKey } from '@engine/hex';
import { rngNext, stream } from '@engine/rng';
import { homeOf } from '@engine/rules';
import type { GameState } from '@engine/state';
import { REARM, type GoalId } from '@content/goals';
import { PERKS, type PerkId } from './progress';

// (The module's own ORIGIN constant went with `mergeRun`'s origin-anchored
// reach on 2026-08-21 — `homeOf(state)` is the anchor now, and nothing else
// here measures distance.)

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
  /**
   * The survey (2026-08-18): world-scale goal ids this world has already
   * been paid for. Detection lives in `src/meta/goals.ts`; this is only the
   * ledger of what has already been claimed, so a goal met a second time
   * (its underlying fact stays true forever — reach 20 does not un-happen)
   * never pays relics again.
   */
  readonly goalsMet: readonly GoalId[];
  /**
   * The perks this world's finds have granted, and the one being worn HERE
   * (2026-08-26, Marc's phone ruling: "uniques are per world, not shared" —
   * a shrine promising a fourth draft card beside an Open Hand found in
   * another world was the bug). They live on the world so they travel with
   * it and die with it; the device blob (`meta/progress.ts`) no longer
   * carries either field.
   *
   * **Amended 2026-08-28.** This used to end "...and a crossing or a settle
   * starts the hunt fresh" — true for a SETTLE (a shared seed's geography,
   * played as somebody else's fresh build) but not, on the evidence, for a
   * crossing: Marc walked out of a fully-awake world with 75 relics and
   * without the two perks he had found in it, and called the trade "not
   * worth it". A crossing now carries both fields whole into the new world's
   * memory (`newWorld`'s `carry` argument, seeded at `shell/keeper.ts`'s
   * `cross` — see LOG.md 2026-08-28); a NEW WORLD or a SETTLE still starts
   * every perk unfound, exactly as before.
   */
  readonly perks: readonly PerkId[];
  readonly worn: PerkId | null;
  /** What the world has seen. The atlas line reads these. */
  readonly runs: number;
  readonly bestPoints: number;
  readonly farthestReach: number;
};

/**
 * `carry` is the crossing's own seam (2026-08-28): a departing world's perk
 * shelf, threaded straight into the fresh one at the moment it is minted —
 * see `shell/store.ts`'s `createWorld` and `shell/keeper.ts`'s `cross`. Every
 * other caller (a fresh boot, NEW WORLD, SETTLE) omits it, and the shelf
 * starts empty exactly as it always has. `finds` is never carried — a find
 * is a fact about GEOGRAPHY, and the new world's is unrelated to the old
 * one's, so its hunt is un-claimed everywhere even for a perk already held.
 */
export const newWorld = (
  worldSeed: number,
  carry?: { readonly perks: readonly PerkId[]; readonly worn: PerkId | null },
): WorldMemory => ({
  worldSeed,
  revealed: [],
  territories: [],
  shrines: [],
  finds: [],
  goalsMet: [],
  perks: carry?.perks ?? [],
  worn: carry?.worn ?? null,
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
  // Camps (waypoints, 2026-08-19 — `ideas/waypoints.md`, anchor decided by
  // Marc: every camp restarts the climb). APPENDED, per this ledger's own
  // rule above: the four woken rungs stay woken and nobody moves backward —
  // a fully-awake world simply has one more shrine worth walking to, which
  // also serves his "stretch the ledger a bit". The unlock is not a tuning
  // dial: it gates the BEGIN AT CAMP button in the door's WORLDS panel
  // (main.ts), and the
  // engine's own `wakeAt` does the rest.
  { id: 'camp', label: 'Camps — later runs may begin at your farthest territory' },
];

/** The unlocks a world has earned, in ledger order. */
export const unlockedBy = (world: WorldMemory): readonly string[] =>
  UNLOCKS.slice(0, world.shrines.length).map((u) => u.id);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const keys = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((k) => typeof k === 'string') ? v : null;

/**
 * The same, but keeping the good entries instead of refusing the array.
 *
 * Still null for a non-array — a `revealed` that is not a list is a shape
 * this module never wrote, and guessing at it would be inventing a world.
 * But a list with one bad element is a list with one bad element, and the
 * hexes either side of it are ground somebody actually walked.
 */
const keyList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : null;

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

  // SALVAGED element-wise, not rejected wholesale (2026-08-20). These used
  // to require every entry to be a string or the whole world decoded as
  // null — and the caller's answer to null is to mint a fresh world OVER
  // the old blob on the same tick, so one bad element meant a silently
  // deleted world. A truncated write from an iOS kill mid-`setItem` is
  // exactly that shape. `decodeTimeline` has always refused per entry; this
  // is the same tolerance, applied to the one store that cannot be regrown.
  const revealed = keyList(parsed['revealed']);
  const territories = keyList(parsed['territories']);
  if (revealed === null || territories === null) return null;
  // Shrines arrived after the first worlds existed: an older world has none,
  // which is true rather than corrupt. Finds and goalsMet the same, since
  // 2026-08-18 (goalsMet is untyped `string[]` here on purpose — a stray or
  // retired id costs nothing, since `newlyMetGoals` only ever checks
  // membership against the CURRENT `GOALS` table).
  const shrines = keys(parsed['shrines']) ?? [];
  const goalsMet = (keys(parsed['goalsMet']) ?? []) as GoalId[];

  // The per-world perk era's one-way door (2026-08-26, Marc: full reset).
  // A blob WITHOUT a `perks` field is a pre-split world whose finds fed a
  // device-wide pool that no longer exists — so its claimed find-hexes are
  // FORGOTTEN along with the pool, and every perk is out there to hunt
  // again. A blob WITH the field is this era's and keeps both, salvaged to
  // ids this build knows; `worn` is clamped to the perks actually held.
  const preSplit = !('perks' in parsed);
  const finds = preSplit ? [] : (keys(parsed['finds']) ?? []);
  const knownPerks = new Set<string>(PERKS.map((p) => p.id));
  const perks = (keys(parsed['perks']) ?? []).filter((id): id is PerkId => knownPerks.has(id));
  const wornRaw = parsed['worn'];
  const worn =
    typeof wornRaw === 'string' && perks.includes(wornRaw as PerkId) ? (wornRaw as PerkId) : null;

  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    worldSeed: parsed['worldSeed'],
    revealed,
    territories,
    shrines,
    finds,
    goalsMet,
    perks,
    worn,
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
  const home = homeOf(state);
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
      // From where the run STARTED, not from world origin (2026-08-21).
      // `reachOf` has always measured from `homeOf(state)`, and this copy
      // did not — so a camp run, which begins at the world's farthest
      // territory, banked a "farthest" equal to how far that territory is
      // from origin no matter how little it walked. The goal that reads
      // this ("Reach 20 hexes from home", 25 relics) could therefore be
      // minted by waking at ring 20 and placing one tile.
      //
      // FARTHEST is a record of the longest expedition, then, not of the
      // map's extent — which is what both its label and the goal already
      // claimed. `Math.max` against the stored value means no world's
      // existing record moves backward.
      reach = Math.max(reach, distance(parse(k), home));
    }
  }

  return {
    worldSeed: world.worldSeed,
    revealed: [...revealed],
    territories: [...territories],
    shrines: [...shrines],
    finds: [...finds],
    // The survey's own ledger is not this function's business — goals are
    // detected and paid by `src/meta/goals.ts`, outside the engine's own
    // facts, so it only ever rides through unchanged here. The perk shelf
    // the same, since 2026-08-26: grants and wears are the shell's writes.
    goalsMet: world.goalsMet,
    perks: world.perks,
    worn: world.worn,
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

/**
 * Spent one-time landmarks, reborn for the NEXT run (Marc, 2026-08-20:
 * "shrines and hidden finds should transform into either points or cache
 * (randomized) per new run"). Rolled here in the shell's territory — the
 * engine just obeys the map (`GameState.rearmed`) — from a pure hash of
 * (worldSeed, hex, the world's run count), so the mix REROLLS each time a
 * run finishes and yet every reveal, resume and replay of one run agrees.
 *
 * The one exception is deliberate: on a FULLY AWAKE world the shrines stay
 * shrines — they are the crossing's doors (Marc's own design), and a world
 * with every shrine transformed would have no way onward. Claimed finds
 * transform regardless; a find's gift was always once-ever.
 *
 * The numbers live in `content/goals.ts` (`REARM`): `chance` zeroes the
 * whole system, `cacheShare` splits the roll.
 */
export function rearmedSpent(world: WorldMemory): Record<HexKey, 'cache' | 'site'> {
  const out: Record<HexKey, 'cache' | 'site'> = {};
  if (!(REARM.chance > 0)) return out;

  const shrines = world.shrines.length >= UNLOCKS.length ? [] : world.shrines;
  for (const k of [...shrines, ...world.finds]) {
    const { q, r } = parse(k);
    const mixed = stream(
      (world.worldSeed ^ (q * 0x9e3779b9) ^ (r * 0x85ebca6b) ^ (world.runs * 0xc2b2ae35)) | 0,
    );
    const [gate, next] = rngNext(mixed);
    if (gate >= REARM.chance) continue;
    const [pick] = rngNext(next);
    out[k] = pick < REARM.cacheShare ? 'cache' : 'site';
  }
  return out;
}
