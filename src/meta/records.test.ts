import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { newRun } from '@engine/reduce';
import type { GameState, HarvestRecord } from '@engine/state';
import { decodeRecords, encodeRecords, gateB, gateD, recordRun, EMPTY } from './records.js';

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

  it('reads Gate B exactly as the ledger states it', () => {
    // 70% is the line: at seven of ten the gate still passes, at eight it fails.
    const at = (tiles: number, points: number) =>
      gateB({ ...EMPTY, tilesHarvests: tiles, pointsHarvests: points });

    expect(at(7, 3).passing).toBe(true);
    expect(at(8, 2).passing).toBe(false);
    expect(at(2, 8).passing).toBe(false); // symmetric — either side can dominate
    expect(at(0, 0).tilesShare).toBeNull();

    // And the gate wants twenty pops before it speaks.
    expect(at(5, 5).enough).toBe(false);
    expect(at(10, 10).enough).toBe(true);
  });

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
