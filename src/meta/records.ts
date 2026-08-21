import type { GameState } from '@engine/state';

/**
 * What the runs add up to.
 *
 * Gate B's condition is "across 20 logged pops, no option is taken more than
 * ~70% of the time" — a claim about a HUMAN's play, which means it can only
 * ever be settled by counting a human's actual harvests. So the game counts
 * them: every finished run folds its harvest choices into a per-world record,
 * and the end screen prints the standing split against the gate's own line.
 * The gate stops being a memory of how a session felt and becomes a number on
 * the screen that decided it.
 *
 * Kept at the edge like every other stored thing: the engine reports, the
 * shell keeps. Corrupt or partial storage degrades to a fresh record rather
 * than throwing — a lost tally must never cost a run.
 */

export type Records = {
  readonly runs: number;
  readonly bestPoints: number;
  /** Harvests taken as tiles, and as points. Gate B's whole subject. */
  readonly tilesHarvests: number;
  readonly pointsHarvests: number;
  /**
   * Where the biggest harvest landed, summed as fractions of run length,
   * over runs that scored at all. Gate D's subject: the mean is the arc.
   */
  readonly arcSum: number;
  readonly arcRuns: number;
};

export const EMPTY: Records = {
  runs: 0,
  bestPoints: 0,
  tilesHarvests: 0,
  pointsHarvests: 0,
  arcSum: 0,
  arcRuns: 0,
};

export type RecordBook = Readonly<Record<string, Records>>;

/**
 * The one shelf the book keeps records on.
 *
 * Records used to be kept per WORLD KIND, back when there were two. There is
 * one game now (2026-08-16), and the book keeps its keyed shape only so a
 * device that already has records under 'endless' goes on reading them
 * instead of starting again at zero.
 */
export const ONLY_WORLD = 'endless';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Read a stored book, keeping only entries that are whole. */
export function decodeRecords(raw: string | null): RecordBook {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};

  const out: Record<string, Records> = {};
  for (const [world, value] of Object.entries(parsed)) {
    if (!isRecord(value)) continue;
    const entry: Record<string, number> = {};
    let ok = true;
    for (const key of Object.keys(EMPTY)) {
      const v = value[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      entry[key] = v;
    }
    if (ok) out[world] = entry as unknown as Records;
  }
  return out;
}

export const encodeRecords = (book: RecordBook): string => JSON.stringify(book);

/** Fold one finished run into the book. Pure — the caller stores the result. */
export function recordRun(book: RecordBook, state: GameState): RecordBook {
  // One world now (2026-08-16), so one shelf. The book keeps its shape so a
  // device that has records under the old keys still reads them.
  const world = ONLY_WORLD;
  const before = book[world] ?? EMPTY;

  let tiles = 0;
  let points = 0;
  let biggest = 0;
  let biggestAt = 0;
  for (const h of state.log.harvests) {
    // The two SACRIFICES are neither (2026-08-21). This read `else points++`,
    // which under the shipped single payout — where an ordinary pop is
    // `'tiles'` — quietly filed every BURN and every TREASURE as a points
    // harvest, inflating the tally on any device that has ever burned a
    // pocket. It is the third spelling of the `collected`/`scores` mistake
    // this codebase has made: a two-way test standing in for a four-way
    // choice. Named explicitly now, so a fifth choice cannot join a branch
    // by default.
    if (h.choice === 'burn' || h.choice === 'treasure') continue;
    if (h.choice === 'tiles') tiles++;
    else points++;
    if (h.points > biggest) {
      biggest = h.points;
      biggestAt = h.at;
    }
  }

  const scored = biggest > 0 && state.placements > 0;
  return {
    ...book,
    [world]: {
      runs: before.runs + 1,
      bestPoints: Math.max(before.bestPoints, state.points),
      tilesHarvests: before.tilesHarvests + tiles,
      pointsHarvests: before.pointsHarvests + points,
      arcSum: before.arcSum + (scored ? biggestAt / state.placements : 0),
      arcRuns: before.arcRuns + (scored ? 1 : 0),
    },
  };
}

/*
 * `gateB()` lived here until 2026-08-18. The gate asked whether tiles-or-
 * points was a real choice; `singlePayout` — the gate's own prescribed
 * fallback, shipped after the fork failed twice in human hands — removed the
 * fork it measured, so the instrument was measuring a deleted decision and
 * its end-screen line had already been suppressed. Retired with the gate;
 * the harvest tallies above stay recorded because storage formats outlive
 * questions. The successor question (is pop-vs-burn-vs-wait a real decision?)
 * is Marc's to answer on the phone — see LOG.md, 2026-08-18.
 */

/** Gate D, evaluated: the mean arc, and whether it lands near the end. */
export function gateD(r: Records): { arc: number | null; passing: boolean } {
  if (r.arcRuns === 0) return { arc: null, passing: false };
  const arc = r.arcSum / r.arcRuns;
  return { arc, passing: arc >= 0.6 };
}
