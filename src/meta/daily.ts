/**
 * The daily seed (`ideas/daily.md`: decided 2026-08-18 on Marc's option
 * sets, built 2026-08-19 when he called it): one shared fresh world per
 * LOCAL date, played strictly plain — no upgrades, no perk, no unlocks — so
 * every score ever posted sits on ONE ladder, and a daily link doubles as
 * the cleanest possible first-run invitation. No backend anywhere in this:
 * the date IS the seed, the share text IS the leaderboard, and retries are
 * counted and confessed rather than pretend-enforced.
 *
 * Pure by construction — dates are civil-calendar integer math (no `Date`),
 * so the shell hands strings in and everything here is testable to the day.
 */

/**
 * Daily #1's date — LAUNCH DAY (Marc's ruling, 2026-08-20: the first daily
 * strangers ever see and share is #1; "#6 for a game announced that
 * morning" reads wrong, and the renumbering window closes forever the
 * moment one stranger posts a line). Set to the planned tag date — if the
 * launch moves, move this WITH the tag commit, and never after.
 * Changing it after launch renumbers every share; do not.
 */
export const DAILY_EPOCH = '2026-08-25';

/**
 * The first date the daily can PLAY — the day it shipped. Split from the
 * numbering epoch above (2026-08-20) so launch week's own rehearsals still
 * have a daily to open: dates between here and the epoch are playable but
 * pre-calendar — `dailyName` prints their DATE instead of a #N that would
 * read as zero or negative.
 */
export const DAILY_FIRST = '2026-08-19';

/** The exact shape a daily date must have. Garbage in a URL is not a daily. */
export function isDailyDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= (lengths[m - 1] ?? 0);
}

/**
 * Days since the civil epoch (Howard Hinnant's `days_from_civil`), pure
 * integer math — the difference of two of these is exact calendar days with
 * no timezones, no DST, and no `Date.parse` anywhere near the engine rules.
 */
function daysFromCivil(date: string): number {
  const [y0, m, d] = date.split('-').map(Number) as [number, number, number];
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse (`civil_from_days`), for walking a streak backwards. */
function civilFromDays(z0: number): string {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y + 1 : y;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${pad(m)}-${pad(d)}`;
}

/** The day before, for the streak walk. */
export const previousDate = (date: string): string => civilFromDays(daysFromCivil(date) - 1);

/** "Ashwake #47": 1 on the epoch date, counting local calendar days.
 *  Zero or negative for the pre-launch rehearsal dates — display goes
 *  through `dailyName`, which prints those as their date instead. */
export const dailyNumber = (date: string): number =>
  daysFromCivil(date) - daysFromCivil(DAILY_EPOCH) + 1;

/** The daily's display name: "#12" once the calendar has begun, the bare
 *  date for the rehearsal days before it. One function for the badge, the
 *  share line and the hall of fame, so no surface invents "#0". */
export const dailyName = (date: string): string => {
  const n = dailyNumber(date);
  return n >= 1 ? `#${n}` : date;
};

/**
 * The world every phone opens on one date: a hash of the date string into
 * the 31-bit space every other seed lives in. Any decent avalanche does —
 * what matters is that it is pinned by test, because changing it silently
 * would hand every player a different "same" daily.
 */
export function dailySeed(date: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < date.length; i++) {
    h = Math.imul(h ^ date.charCodeAt(i), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return (h ^ (h >>> 13)) & 0x7fffffff;
}

/** One date's standing: the best score, and how many tries it took so far. */
export type DailyRecord = {
  readonly best: number;
  readonly tries: number;
};

/** Keyed by date string. The whole ladder a device keeps. */
export type DailyBook = Readonly<Record<string, DailyRecord>>;

export function decodeDailyBook(raw: string | null): DailyBook {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const out: Record<string, DailyRecord> = {};
  for (const [date, value] of Object.entries(parsed)) {
    if (!isDailyDate(date)) continue;
    if (typeof value !== 'object' || value === null) continue;
    const { best, tries } = value as { best?: unknown; tries?: unknown };
    if (typeof best !== 'number' || !Number.isFinite(best)) continue;
    if (typeof tries !== 'number' || !Number.isFinite(tries) || tries < 1) continue;
    out[date] = { best: Math.max(0, Math.floor(best)), tries: Math.floor(tries) };
  }
  return out;
}

export const encodeDailyBook = (book: DailyBook): string => JSON.stringify(book);

/** Fold one finished daily in. Pure — the caller stores the result. */
export function recordDaily(
  book: DailyBook,
  date: string,
  points: number,
): {
  readonly book: DailyBook;
  readonly record: DailyRecord;
  readonly isNewBest: boolean;
  readonly previousBest: number;
} {
  const before = book[date] ?? { best: 0, tries: 0 };
  const record: DailyRecord = {
    best: Math.max(before.best, points),
    tries: before.tries + 1,
  };
  return {
    book: { ...book, [date]: record },
    record,
    isNewBest: points > before.best && points > 0,
    previousBest: before.best,
  };
}

/**
 * Consecutive played days ending at `today` — or at yesterday, so a streak
 * is not broken by the morning you simply have not played yet.
 */
export function dailyStreak(book: DailyBook, today: string): number {
  let date = today in book ? today : previousDate(today);
  let run = 0;
  while (date in book) {
    run++;
    date = previousDate(date);
  }
  return run;
}

const BLOCKS = '▁▂▃▄▅▆▇█';

/**
 * The run's arc as block characters — the same harvest log the end screen's
 * chart draws, compressed to fit a group chat. At most `maxBars` bars,
 * sampled evenly when a run popped more than that; empty when it never did.
 */
export function arcSparkline(
  harvests: readonly { readonly points: number }[],
  maxBars = 12,
): string {
  const pts = harvests.map((h) => Math.max(0, h.points));
  if (pts.length === 0) return '';
  const sampled =
    pts.length <= maxBars
      ? pts
      : Array.from({ length: maxBars }, (_, i) => pts[Math.floor((i * pts.length) / maxBars)] ?? 0);
  const top = Math.max(...sampled, 1);
  return sampled
    .map((p) => BLOCKS[Math.min(BLOCKS.length - 1, Math.floor((p / top) * BLOCKS.length))] ?? '▁')
    .join('');
}

/**
 * The standing on one date, as the one string every door prints — the front
 * door's button and the end screen's badge used to build it separately, with
 * the pluralisation copied. The streak rider is the front door's own.
 */
export function dailyBadge(book: DailyBook, date: string): string {
  const record = book[date];
  return (
    `DAILY ${dailyName(date)}` +
    (record === undefined
      ? ''
      : ` · best ${record.best} · ${record.tries} ${record.tries === 1 ? 'try' : 'tries'}`)
  );
}

/**
 * A date the daily will actually PLAY: well-formed, and not before the
 * daily EXISTED (`DAILY_FIRST`) — the floor lives here beside the constant
 * it reads, so the test file can pin "a pre-first date is not a daily"
 * where the number is. Deliberately the FIRST date and not the numbering
 * epoch: launch week's rehearsal dailies play, they just print their date.
 */
export const isPlayableDaily = (date: string): boolean =>
  isDailyDate(date) && daysFromCivil(date) >= daysFromCivil(DAILY_FIRST);

/** "1st", "2nd", "3rd", "4th"… for the share text's confessed retries. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const ones = n % 10;
  return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}
