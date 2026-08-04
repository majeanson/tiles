import type { RunResult } from './run';

/**
 * Turning a pile of runs into the three or four numbers a decision needs.
 *
 * Medians rather than means throughout. A run's score is roughly the square of
 * how well it went, so a handful of lucky seeds drag a mean somewhere no real
 * player lives — and the question "where does this policy usually end up" is
 * exactly the question a median answers.
 */

export type Summary = {
  readonly policy: string;
  readonly runs: number;

  /** Anything but `died` is a harness bug or a design hole, so it leads. */
  readonly stalled: number;
  readonly capped: number;

  readonly medianPoints: number;
  readonly bestPoints: number;
  readonly medianDepth: number;
  readonly deepest: number;
  /** Hexes from home — the endless world's depth axis. See `RunResult.reach`. */
  readonly medianReach: number;
  readonly medianPlacements: number;
  readonly medianHarvests: number;

  /** Pops per placement — the geometry term in the income equation. */
  readonly popsPerPlacement: number;
  /** Where the run's biggest harvest landed, as a fraction of its length. */
  readonly arc: number;
};

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function summarise(policy: string, runs: readonly RunResult[]): Summary {
  const placements = runs.reduce((n, r) => n + r.placements, 0);
  const popped = runs.reduce((n, r) => n + r.popped, 0);

  return {
    policy,
    runs: runs.length,
    stalled: runs.filter((r) => r.outcome === 'stalled').length,
    capped: runs.filter((r) => r.outcome === 'capped').length,
    medianPoints: median(runs.map((r) => r.points)),
    bestPoints: runs.reduce((n, r) => Math.max(n, r.points), 0),
    medianDepth: median(runs.map((r) => r.mapNumber)),
    deepest: runs.reduce((n, r) => Math.max(n, r.mapNumber), 0),
    medianReach: median(runs.map((r) => r.reach)),
    medianPlacements: median(runs.map((r) => r.placements)),
    medianHarvests: median(runs.map((r) => r.harvests)),
    popsPerPlacement: placements === 0 ? 0 : popped / placements,
    arc: median(runs.map((r) => r.bestHarvestAt)),
  };
}

const COLUMNS: readonly (readonly [string, (s: Summary) => string])[] = [
  ['policy', (s) => s.policy],
  ['runs', (s) => String(s.runs)],
  ['points', (s) => String(Math.round(s.medianPoints))],
  ['best', (s) => String(Math.round(s.bestPoints))],
  ['depth', (s) => s.medianDepth.toFixed(1)],
  ['max', (s) => String(s.deepest)],
  ['reach', (s) => String(Math.round(s.medianReach))],
  ['places', (s) => String(Math.round(s.medianPlacements))],
  ['harvests', (s) => String(Math.round(s.medianHarvests))],
  ['pops/place', (s) => s.popsPerPlacement.toFixed(2)],
  ['arc', (s) => s.arc.toFixed(2)],
  ['stalled', (s) => String(s.stalled)],
  ['capped', (s) => String(s.capped)],
];

/** A fixed-width table. The harness's output is read far more often than run. */
export function table(summaries: readonly Summary[]): string {
  const header = COLUMNS.map(([h]) => h);
  const rows = summaries.map((s) => COLUMNS.map(([, get]) => get(s)));

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: readonly string[]): string =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');

  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}
