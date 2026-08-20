import { describe, expect, it } from 'vitest';
import {
  DAILY_EPOCH,
  DAILY_FIRST,
  dailyName,
  arcSparkline,
  dailyBadge,
  dailyNumber,
  dailySeed,
  dailyStreak,
  decodeDailyBook,
  decodeDailyRun,
  dailyRunFor,
  encodeDailyRun,
  encodeDailyBook,
  isDailyDate,
  isPlayableDaily,
  ordinal,
  previousDate,
  recordDaily,
} from './daily';

/**
 * The daily seed (`ideas/daily.md`). The one hard promise is SAMENESS: every
 * phone that types the same date gets the same world and the same number —
 * so the hash and the day count are pinned by value, not just by shape.
 * Changing either silently would hand every player a different "same" daily.
 */

describe('the date, the number, the seed', () => {
  it('accepts real dates and refuses shaped garbage', () => {
    expect(isDailyDate('2026-08-20')).toBe(true);
    expect(isDailyDate('2028-02-29')).toBe(true); // leap year
    expect(isDailyDate('2026-02-29')).toBe(false); // not one
    expect(isDailyDate('2026-13-01')).toBe(false);
    expect(isDailyDate('2026-08-32')).toBe(false);
    expect(isDailyDate('yesterday')).toBe(false);
    expect(isDailyDate('2026-8-2')).toBe(false);
  });

  it('numbers the epoch date #1 and counts real calendar days', () => {
    // The epoch is LAUNCH DAY (Marc's ruling, 2026-08-20): 2026-08-25 is
    // #1, and the rehearsal week before it counts down through zero.
    expect(DAILY_EPOCH).toBe('2026-08-25');
    expect(dailyNumber(DAILY_EPOCH)).toBe(1);
    expect(dailyNumber('2026-08-26')).toBe(2);
    expect(dailyNumber('2026-09-25')).toBe(32);
    // Across a year boundary and a leap February, still exact: 365 days to
    // 2027-08-25 (#366), then 366 more through 2028's February 29th (#732).
    expect(dailyNumber('2027-08-25')).toBe(366);
    expect(dailyNumber('2028-08-25')).toBe(732);
  });

  it('names launch-week rehearsal dates by their DATE, never #0 or worse', () => {
    expect(dailyName(DAILY_EPOCH)).toBe('#1');
    expect(dailyName('2026-08-26')).toBe('#2');
    expect(dailyName('2026-08-20')).toBe('2026-08-20');
    expect(dailyName(DAILY_FIRST)).toBe(DAILY_FIRST);
  });

  it('walks one day back correctly across month and year seams', () => {
    expect(previousDate('2026-08-20')).toBe('2026-08-19');
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(previousDate('2028-03-01')).toBe('2028-02-29');
    expect(previousDate('2026-01-01')).toBe('2025-12-31');
  });

  it('seeds deterministically, in the 31-bit space, and differently by date', () => {
    const a = dailySeed('2026-08-20');
    expect(a).toBe(dailySeed('2026-08-20'));
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0x7fffffff);

    const seeds = new Set(
      ['2026-08-20', '2026-08-21', '2026-08-22', '2026-09-20', '2027-08-20'].map(dailySeed),
    );
    expect(seeds.size).toBe(5);
  });
});

describe('the ladder a device keeps', () => {
  it('counts tries and keeps the best, per date', () => {
    const first = recordDaily({}, '2026-08-20', 900);
    expect(first.record).toEqual({ best: 900, tries: 1 });
    expect(first.isNewBest).toBe(true);

    const worse = recordDaily(first.book, '2026-08-20', 400);
    expect(worse.record).toEqual({ best: 900, tries: 2 });
    expect(worse.isNewBest).toBe(false);
    expect(worse.previousBest).toBe(900);

    const better = recordDaily(worse.book, '2026-08-20', 1200);
    expect(better.record).toEqual({ best: 1200, tries: 3 });
    expect(better.isNewBest).toBe(true);
  });

  it('round-trips, and refuses entries that are not whole', () => {
    const { book } = recordDaily(recordDaily({}, '2026-08-20', 900).book, '2026-08-21', 100);
    expect(decodeDailyBook(encodeDailyBook(book))).toEqual(book);

    expect(decodeDailyBook(null)).toEqual({});
    expect(decodeDailyBook('not json')).toEqual({});
    expect(
      decodeDailyBook('{"2026-08-20":{"best":5,"tries":0},"garbage":{"best":1,"tries":1}}'),
    ).toEqual({});
    expect(decodeDailyBook('{"2026-08-20":{"best":"lots","tries":1}}')).toEqual({});
  });

  it('measures a streak back from today, forgiving the not-yet-played morning', () => {
    let book = recordDaily({}, '2026-08-18', 10).book;
    book = recordDaily(book, '2026-08-19', 10).book;
    book = recordDaily(book, '2026-08-20', 10).book;

    expect(dailyStreak(book, '2026-08-20')).toBe(3);
    // The next morning, unplayed: the streak stands rather than reading 0.
    expect(dailyStreak(book, '2026-08-21')).toBe(3);
    // A missed whole day breaks it.
    expect(dailyStreak(book, '2026-08-22')).toBe(0);
    expect(dailyStreak({}, '2026-08-20')).toBe(0);
  });
});

describe('the share line', () => {
  it('draws the arc as blocks, tallest pop full height', () => {
    const line = arcSparkline([{ points: 10 }, { points: 40 }, { points: 80 }]);
    expect(line).toHaveLength(3);
    expect(line.endsWith('█')).toBe(true);
    expect(arcSparkline([])).toBe('');
  });

  it('samples long runs down to the bar budget', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ points: i + 1 }));
    expect(arcSparkline(many, 12)).toHaveLength(12);
  });

  it('confesses the retry in words', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(22)).toBe('22nd');
  });
});

describe('the badge and the playability rule (the simplify pass, 2026-08-19)', () => {
  it('prints one badge for every door, pluralised honestly', () => {
    expect(dailyBadge({}, '2026-08-26')).toBe('DAILY #2');
    const once = recordDaily({}, '2026-08-26', 900).book;
    expect(dailyBadge(once, '2026-08-26')).toBe('DAILY #2 · best 900 · 1 try');
    const twice = recordDaily(once, '2026-08-26', 400).book;
    expect(dailyBadge(twice, '2026-08-26')).toBe('DAILY #2 · best 900 · 2 tries');
    // A rehearsal-week badge names the date, not a #0 (Marc's ruling).
    expect(dailyBadge({}, '2026-08-20')).toBe('DAILY 2026-08-20');
  });

  it('refuses a date before the daily EXISTED, plays the rehearsal week', () => {
    expect(isPlayableDaily(DAILY_EPOCH)).toBe(true);
    expect(isPlayableDaily(DAILY_FIRST)).toBe(true);
    expect(isPlayableDaily('2026-08-20')).toBe(true);
    expect(isPlayableDaily('2026-08-18')).toBe(false);
    expect(isPlayableDaily('not a date')).toBe(false);
  });
});

describe('the daily put down and picked up (Day 2)', () => {
  it('hands the board back for its own date, and for no other', () => {
    const raw = encodeDailyRun({ date: '2026-08-26', run: '{"rootSeed":7}' });
    const kept = decodeDailyRun(raw);
    expect(kept).toEqual({ date: '2026-08-26', run: '{"rootSeed":7}' });

    // The whole rule: yesterday's abandoned board never opens on today's
    // shared world, because every phone playing a date must agree.
    expect(dailyRunFor(kept, '2026-08-26')).toBe('{"rootSeed":7}');
    expect(dailyRunFor(kept, '2026-08-27')).toBeNull();
    expect(dailyRunFor(null, '2026-08-26')).toBeNull();
  });

  it('reads nothing back from anything it did not write', () => {
    expect(decodeDailyRun(null)).toBeNull();
    expect(decodeDailyRun('not json')).toBeNull();
    expect(decodeDailyRun('[]')).toBeNull();
    expect(decodeDailyRun('{}')).toBeNull();
    // A date that is not a date, and an empty board, are both refusals —
    // the same tolerance decodeRun keeps, for the same reason.
    expect(decodeDailyRun('{"date":"nope","run":"{}"}')).toBeNull();
    expect(decodeDailyRun('{"date":"2026-08-26","run":""}')).toBeNull();
    expect(decodeDailyRun('{"date":"2026-08-26"}')).toBeNull();
  });
});
