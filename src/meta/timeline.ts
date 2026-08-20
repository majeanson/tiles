import type { WorldMemory } from './world';

/**
 * The hall of fame's timeline (designed 2026-08-20 through Marc's own
 * prompts — the session the door's comments promised when the button
 * shipped). The door's first screen stated only what storage already knew;
 * this is the first thing the hall of fame keeps FOR ITSELF, and it breaks
 * the door's "nothing new is kept" birth rule on purpose: nothing existing
 * can be unrolled into a history (every other store is bests, unions and
 * running sums — `runs: 42` cannot become 42 entries), so a history has to
 * be kept as it happens or not at all.
 *
 * The contract, from the design session:
 *   - Every finished home run appends one tick; milestone runs carry their
 *     ✦ highlights on the same entry. Dailies join the store but render on
 *     their own tab. Crossings and settlings are their own entries — a
 *     world-scale moment is not a run.
 *   - Append-only, kept forever, never compacted. Entries are dated,
 *     self-describing events so a future backend (the leaderboard's own
 *     later session) could ingest the array unchanged.
 *   - A clean start: nothing retro-seeded. `prehistory` states what the
 *     device did before the record began, computed live from the aggregate
 *     stores rather than stored again.
 *
 * Pure by construction, like `daily.ts`: no `Date`, no storage — the shell
 * hands in `Date.now()` and strings, so everything here is testable to the
 * millisecond it is given.
 *
 * One honest limitation, accepted in design: highlight detection diffs the
 * world memory the page BOOTED with against the memory the run ends with,
 * so a run resumed after a mid-run reload will not badge moments from
 * before the reload — the facts themselves are safe in `WorldMemory`; only
 * the ✦ on this row goes quiet. And a note on forward-compat: an OLDER
 * build's read-modify-write would silently drop entry kinds it refuses;
 * single-device, single-build in practice, so noted rather than coded for.
 */

/** One ✦ moment a run produced. `n` counts repeats (two territories). */
export type HighlightKind =
  'best-score' | 'best-reach' | 'shrine' | 'perk' | 'goal' | 'territory' | 'camp';

export type Highlight = { readonly kind: HighlightKind; readonly n?: number };

/**
 * The run's end screen, kept (2026-08-20, Marc: "a 'full detail' of the
 * run" behind every hall-of-fame row). The same facts `summariseRun`
 * (ui/view.ts) put on the screen the night it happened — including the
 * epitaph SENTENCE, stored finished so the diary needs no engine to
 * retell it. Optional on the entry: rows from before it existed stay
 * valid and open with what they have.
 */
export type RunDetail = {
  readonly placements: number;
  /** Pops taken, and tiles popped across them. */
  readonly harvests: number;
  readonly popped: number;
  /** The biggest single pop's points, and where it landed (0..1 of the run). */
  readonly bigPop: number;
  readonly bigPopAt: number;
  /** Destinations claimed on the board, and bounties collected. */
  readonly claims: number;
  readonly quests: number;
  /** Relics the run carried out. */
  readonly relics: number;
  /** The end screen's own cause-of-death sentence. */
  readonly epitaph: string;
};

/** A finished home-world run: the timeline's tick. */
export type RunEntry = {
  /** Epoch ms, shell-supplied; displayed as a date, never sorted by. */
  readonly at: number;
  readonly kind: 'run';
  /** Which of the three world slots it was played in. */
  readonly slot: number;
  /** Which world that slot held at the time — a slot is reused after a
   *  crossing, so the seed is what keeps a per-world split possible later. */
  readonly worldSeed: number;
  readonly score: number;
  readonly reach: number;
  /** `arcSparkline` blocks; '' when the run never popped. */
  readonly arc: string;
  readonly highlights: readonly Highlight[];
  readonly detail?: RunDetail;
};

/** A finished daily try. Same store, its own tab. */
export type DailyEntry = {
  readonly at: number;
  readonly kind: 'daily';
  /** 'YYYY-MM-DD' — the daily's identity. */
  readonly date: string;
  readonly score: number;
  readonly reach: number;
  readonly arc: string;
  /** Which confessed try this was. */
  readonly try: number;
  /** A new personal best for that date. */
  readonly best: boolean;
};

/** A world-scale event that is not a run: leaving, or arriving. */
export type WorldEventEntry = {
  readonly at: number;
  readonly kind: 'world';
  readonly event: 'crossed' | 'settled';
  readonly slot: number;
  /** Crossed: the world left behind. Settled: the world gained. */
  readonly worldSeed: number;
  /** Crossed: the dowry in relics. */
  readonly n?: number;
};

export type TimelineEntry = RunEntry | DailyEntry | WorldEventEntry;
export type Timeline = readonly TimelineEntry[];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const HIGHLIGHT_KINDS: readonly string[] = [
  'best-score',
  'best-reach',
  'shrine',
  'perk',
  'goal',
  'territory',
  'camp',
];

const decodeHighlights = (v: unknown): readonly Highlight[] | null => {
  if (!Array.isArray(v)) return null;
  const out: Highlight[] = [];
  for (const h of v) {
    if (!isRecord(h)) return null;
    const kind = h['kind'];
    if (typeof kind !== 'string' || !HIGHLIGHT_KINDS.includes(kind)) return null;
    const n = h['n'];
    if (n !== undefined && !isCount(n)) return null;
    out.push(
      n === undefined ? { kind: kind as HighlightKind } : { kind: kind as HighlightKind, n },
    );
  }
  return out;
};

/** The optional end-screen block: absent on pre-detail rows, and decoded
 *  LENIENTLY — a malformed detail is dropped alone rather than costing the
 *  tick it rides on, because the row's own facts are the record and the
 *  detail is the record's footnote. */
const decodeDetail = (v: unknown): RunDetail | undefined => {
  if (!isRecord(v)) return undefined;
  const { placements, harvests, popped, bigPop, bigPopAt, claims, quests, relics, epitaph } = v;
  if (!isCount(placements) || !isCount(harvests) || !isCount(popped)) return undefined;
  if (!isCount(bigPop) || !isCount(bigPopAt) || !isCount(claims)) return undefined;
  if (!isCount(quests) || !isCount(relics) || typeof epitaph !== 'string') return undefined;
  return { placements, harvests, popped, bigPop, bigPopAt, claims, quests, relics, epitaph };
};

/** One stored entry, refused WHOLE if any field is missing or mistyped —
 *  a half-true row in a diary is worse than a missing one. */
const decodeEntry = (v: unknown): TimelineEntry | null => {
  if (!isRecord(v)) return null;
  if (!isCount(v['at'])) return null;
  const at = v['at'];

  if (v['kind'] === 'run') {
    const { slot, worldSeed, score, reach, arc } = v;
    const highlights = decodeHighlights(v['highlights']);
    if (!isCount(slot) || !isCount(worldSeed) || !isCount(score) || !isCount(reach)) return null;
    if (typeof arc !== 'string' || highlights === null) return null;
    const detail = decodeDetail(v['detail']);
    return {
      at,
      kind: 'run',
      slot,
      worldSeed,
      score,
      reach,
      arc,
      highlights,
      ...(detail === undefined ? {} : { detail }),
    };
  }

  if (v['kind'] === 'daily') {
    const { date, score, reach, arc } = v;
    const tryN = v['try'];
    const best = v['best'];
    if (typeof date !== 'string' || !isCount(score) || !isCount(reach)) return null;
    if (typeof arc !== 'string' || !isCount(tryN) || typeof best !== 'boolean') return null;
    return { at, kind: 'daily', date, score, reach, arc, try: tryN, best };
  }

  if (v['kind'] === 'world') {
    const { event, slot, worldSeed } = v;
    const n = v['n'];
    if (event !== 'crossed' && event !== 'settled') return null;
    if (!isCount(slot) || !isCount(worldSeed)) return null;
    if (n !== undefined && !isCount(n)) return null;
    return n === undefined
      ? { at, kind: 'world', event, slot, worldSeed }
      : { at, kind: 'world', event, slot, worldSeed, n };
  }

  return null;
};

/**
 * Untrusted input, like every stored thing — but a diary is refused by the
 * ENTRY, not by the book: one corrupt row must not cost the whole record,
 * so survivors are kept in stored order and the broken row alone is gone.
 */
export function decodeTimeline(raw: string | null): Timeline {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(decodeEntry).filter((e): e is TimelineEntry => e !== null);
}

export const encodeTimeline = (t: Timeline): string => JSON.stringify(t);

/** Append-only is the whole contract; the trivial body is the point. */
export const appendEntry = (t: Timeline, e: TimelineEntry): Timeline => [...t, e];

/**
 * What a run did that is worth a ✦, read as the diff between the world
 * memory the page booted with and the memory the run ended with — one call
 * at the one place runs end, instead of event calls sprinkled through the
 * codebase. Perks live device-wide in `Progress`, so their counts arrive
 * as numbers rather than as world fields.
 */
export function runHighlights(
  before: WorldMemory,
  after: WorldMemory,
  opts: {
    readonly points: number;
    readonly perksBefore: number;
    readonly perksAfter: number;
    readonly campStart: boolean;
  },
): readonly Highlight[] {
  const out: Highlight[] = [];
  const counted = (kind: HighlightKind, n: number): void => {
    if (n === 1) out.push({ kind });
    else if (n > 1) out.push({ kind, n });
  };

  if (opts.points > before.bestPoints && opts.points > 0) out.push({ kind: 'best-score' });
  if (after.farthestReach > before.farthestReach) out.push({ kind: 'best-reach' });
  counted('shrine', after.shrines.length - before.shrines.length);
  counted('perk', opts.perksAfter - opts.perksBefore);
  counted('goal', after.goalsMet.length - before.goalsMet.length);
  counted('territory', after.territories.length - before.territories.length);
  if (opts.campStart) out.push({ kind: 'camp' });
  return out;
}

/** The TIMELINE tab's data: home runs, one slot's or all (`null`). The
 *  caller reverses for newest-first — stored order IS the chronology. */
export const runsOf = (t: Timeline, slot: number | null): readonly RunEntry[] =>
  t.filter((e): e is RunEntry => e.kind === 'run' && (slot === null || e.slot === slot));

/** The world-scale entries, same filter contract as `runsOf`. */
export const worldEventsOf = (t: Timeline, slot: number | null): readonly WorldEventEntry[] =>
  t.filter((e): e is WorldEventEntry => e.kind === 'world' && (slot === null || e.slot === slot));

/** The TIMELINE tab's whole stream: runs and world events interleaved in
 *  stored order — a crossing sits between the run before it and the world
 *  after it, which is the story as it happened. */
export const streamOf = (
  t: Timeline,
  slot: number | null,
): readonly (RunEntry | WorldEventEntry)[] =>
  t.filter(
    (e): e is RunEntry | WorldEventEntry =>
      (e.kind === 'run' || e.kind === 'world') && (slot === null || e.slot === slot),
  );

/** The DAILY tab's data. */
export const dailiesOf = (t: Timeline): readonly DailyEntry[] =>
  t.filter((e): e is DailyEntry => e.kind === 'daily');

/**
 * What the device did BEFORE the record began — the clean start's one
 * honest sentence, computed live rather than stored. `deviceRuns` is the
 * record book's device-wide count (it survives crossings, which summing
 * `WorldMemory.runs` would not); `dailyTries` is the DailyBook's summed
 * tries. Each minus what the timeline already holds, clamped at zero so a
 * deleted-elsewhere aggregate can never claim negative history.
 */
export function prehistory(
  t: Timeline,
  deviceRuns: number,
  dailyTries: number,
): { readonly runs: number; readonly dailies: number } {
  return {
    runs: Math.max(0, deviceRuns - runsOf(t, null).length),
    dailies: Math.max(0, dailyTries - dailiesOf(t).length),
  };
}
