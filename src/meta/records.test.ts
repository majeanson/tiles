import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { newRun } from '@engine/reduce';
import type { GameState, HarvestRecord } from '@engine/state';
import { decodeRecords, encodeRecords, gateD, recordRun } from './records.js';

/**
 * The record book is how Gates B and D stop being memories. These pin the
 * counting and the two verdicts — including that the gates read the same
 * thresholds the ledger states, so nobody can quietly move the bar.
 */

const harvest = (choice: 'tiles' | 'points', points: number, at: number): HarvestRecord => ({
  at,
  count: 4,
  choice,
  tiles: 4,
  points,
});

const ran = (harvests: HarvestRecord[], placements = 100, points = 0): GameState => ({
  ...newRun(1, TUNING),
  phase: 'ended',
  placements,
  points,
  log: { harvests, popped: 0, questsDone: 0 },
});

describe('the record book', () => {
  it('counts choices, runs and the best across runs', () => {
    let book = recordRun({}, ran([harvest('tiles', 0, 10), harvest('points', 50, 90)], 100, 50));
    book = recordRun(book, ran([harvest('points', 80, 50)], 100, 80));

    const r = book['endless']!;
    expect(r.runs).toBe(2);
    expect(r.bestPoints).toBe(80);
    expect(r.tilesHarvests).toBe(1);
    expect(r.pointsHarvests).toBe(2);
  });

  it('keeps worlds apart', () => {
    const book = recordRun({}, ran([harvest('tiles', 0, 1)]));
    expect(book['bounded']).toBeUndefined();
    expect(book['endless']?.runs).toBe(1);
  });

  // gateB's tests left with gateB (2026-08-18): singlePayout — the gate's own
  // prescribed fallback — removed the fork it measured. See records.ts.

  it('reads Gate D as the arc landing late', () => {
    // Biggest harvest at 90% of a run is an arc; at 30% it is a plateau.
    const late = recordRun({}, ran([harvest('points', 100, 90)], 100, 100))['endless']!;
    expect(gateD(late).arc).toBeCloseTo(0.9);
    expect(gateD(late).passing).toBe(true);

    const early = recordRun({}, ran([harvest('points', 100, 30)], 100, 100))['endless']!;
    expect(gateD(early).passing).toBe(false);

    // A run that never scored says nothing about the arc rather than zero.
    const scoreless = recordRun({}, ran([harvest('tiles', 0, 50)]))['endless']!;
    expect(gateD(scoreless).arc).toBeNull();
  });

  it('round-trips, and refuses junk without losing the good entries', () => {
    const book = recordRun({}, ran([harvest('tiles', 0, 1)]));
    expect(decodeRecords(encodeRecords(book))).toEqual(book);

    expect(decodeRecords(null)).toEqual({});
    expect(decodeRecords('not json')).toEqual({});
    expect(decodeRecords('{"endless":{"runs":"many"}}')).toEqual({});
    expect(decodeRecords('{"endless":{"runs":1},"junk":5}')).toEqual({});
  });
});

describe('the harvest tally counts payouts, not sacrifices (2026-08-21)', () => {
  it('files a burn and a treasure as neither tiles nor points', () => {
    // `else points++` under the shipped single payout — where an ordinary
    // pop is `'tiles'` — filed every BURN and every TREASURE as a POINTS
    // harvest, inflating the tally on any device that had ever burned a
    // pocket. This is the third spelling of the same two-way-test-for-a
    // -four-way-choice mistake; it is pinned now.
    const base = newRun(3, TUNING);
    const state: GameState = {
      ...base,
      placements: 10,
      log: {
        ...base.log,
        harvests: [
          { at: 1, count: 3, choice: 'tiles', tiles: 4, points: 10 },
          { at: 2, count: 3, choice: 'points', tiles: 0, points: 20 },
          { at: 3, count: 3, choice: 'burn', tiles: 0, points: 0 },
          { at: 4, count: 3, choice: 'treasure', tiles: 0, points: 0 },
        ],
      },
    };

    const book = recordRun({}, state);
    const held = book[Object.keys(book)[0]!]!;
    expect(held.tilesHarvests).toBe(1);
    expect(held.pointsHarvests).toBe(1);
  });
});
