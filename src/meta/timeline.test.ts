import { describe, expect, it } from 'vitest';
import {
  appendEntry,
  dailiesOf,
  decodeTimeline,
  encodeTimeline,
  prehistory,
  runHighlights,
  runsOf,
  streamOf,
  worldEventsOf,
  type DailyEntry,
  type RunEntry,
  type Timeline,
  type WorldEventEntry,
} from './timeline';
import { newWorld, type WorldMemory } from './world';

const run = (over: Partial<RunEntry> = {}): RunEntry => ({
  at: 1000,
  kind: 'run',
  slot: 1,
  worldSeed: 42,
  score: 312,
  reach: 14,
  arc: '▁▂▅▇█',
  highlights: [],
  ...over,
});

const daily = (over: Partial<DailyEntry> = {}): DailyEntry => ({
  at: 2000,
  kind: 'daily',
  date: '2026-08-20',
  score: 240,
  reach: 9,
  arc: '▁▃▇',
  try: 2,
  best: true,
  ...over,
});

const crossed = (over: Partial<WorldEventEntry> = {}): WorldEventEntry => ({
  at: 3000,
  kind: 'world',
  event: 'crossed',
  slot: 1,
  worldSeed: 42,
  n: 34,
  ...over,
});

describe('decodeTimeline', () => {
  it('reads nothing from nothing', () => {
    expect(decodeTimeline(null)).toEqual([]);
  });

  it('refuses garbage and non-arrays whole', () => {
    expect(decodeTimeline('not json')).toEqual([]);
    expect(decodeTimeline('{"kind":"run"}')).toEqual([]);
    expect(decodeTimeline('7')).toEqual([]);
  });

  it('round-trips every entry kind', () => {
    const t: Timeline = [
      run({ highlights: [{ kind: 'shrine' }, { kind: 'territory', n: 2 }] }),
      daily(),
      crossed(),
    ];
    expect(decodeTimeline(encodeTimeline(t))).toEqual(t);
  });

  it('refuses a corrupt entry whole while its neighbours survive', () => {
    const good = run();
    const alsoGood = daily();
    const raw = JSON.stringify([good, { ...run(), score: 'lots' }, alsoGood]);
    expect(decodeTimeline(raw)).toEqual([good, alsoGood]);
  });

  it('refuses an unknown kind, an unknown highlight, and a missing field', () => {
    expect(decodeTimeline(JSON.stringify([{ ...run(), kind: 'saga' }]))).toEqual([]);
    expect(
      decodeTimeline(JSON.stringify([run({ highlights: [{ kind: 'dragon' } as never] })])),
    ).toEqual([]);
    const missing = { ...daily() } as Record<string, unknown>;
    delete missing['try'];
    expect(decodeTimeline(JSON.stringify([missing]))).toEqual([]);
  });

  it('keeps stored order — the chronology is the array, not the clock', () => {
    const later = run({ at: 9000, score: 1 });
    const earlier = run({ at: 100, score: 2 });
    expect(decodeTimeline(encodeTimeline([later, earlier]))).toEqual([later, earlier]);
  });

  it('round-trips the full run detail, and tolerates rows from before it existed', () => {
    // RunDetail (2026-08-20, Marc: "a 'full detail' of the run"): kept on
    // new ticks, absent on old ones — both shapes are the diary.
    const detailed = run({
      detail: {
        placements: 121,
        harvests: 28,
        popped: 96,
        bigPop: 412,
        bigPopAt: 0.78,
        claims: 3,
        quests: 1,
        relics: 5,
        epitaph: 'Out of tiles on the plane, after 121 placements. They cost 6 each by the end.',
      },
    });
    const bare = run();
    expect(decodeTimeline(encodeTimeline([detailed, bare]))).toEqual([detailed, bare]);
  });

  it('drops a malformed detail alone — the tick it rides on survives', () => {
    // The detail is the record's footnote, not the record: leniency here is
    // the opposite call from the per-entry refusal above, on purpose.
    const raw = JSON.stringify([{ ...run(), detail: { placements: 'many' } }]);
    expect(decodeTimeline(raw)).toEqual([run()]);
  });
});

describe('appendEntry', () => {
  it('appends without touching what came before', () => {
    const t: Timeline = [run()];
    const grown = appendEntry(t, daily());
    expect(grown).toHaveLength(2);
    expect(grown[1]).toEqual(daily());
    expect(t).toHaveLength(1);
  });
});

describe('runHighlights', () => {
  const before: WorldMemory = {
    ...newWorld(42),
    bestPoints: 100,
    farthestReach: 10,
    shrines: ['0,1'],
    territories: ['1,0'],
    goalsMet: ['reach20'] as WorldMemory['goalsMet'],
  };
  const opts = { points: 0, perksBefore: 1, perksAfter: 1, campStart: false };

  it('finds nothing on a run that changed nothing', () => {
    expect(runHighlights(before, before, opts)).toEqual([]);
  });

  it('badges a new best score only when points beat the world best and are real', () => {
    expect(runHighlights(before, before, { ...opts, points: 101 })).toEqual([
      { kind: 'best-score' },
    ]);
    expect(runHighlights(before, before, { ...opts, points: 100 })).toEqual([]);
    const virgin = newWorld(1);
    expect(runHighlights(virgin, virgin, { ...opts, points: 0 })).toEqual([]);
  });

  it('badges reach, shrines, perks, goals, territories and camp, counting repeats', () => {
    const after: WorldMemory = {
      ...before,
      farthestReach: 12,
      shrines: [...before.shrines, '0,2'],
      territories: [...before.territories, '2,0', '3,0'],
      goalsMet: [...before.goalsMet, 'territories4'] as WorldMemory['goalsMet'],
    };
    expect(
      runHighlights(before, after, { points: 0, perksBefore: 1, perksAfter: 2, campStart: true }),
    ).toEqual([
      { kind: 'best-reach' },
      { kind: 'shrine' },
      { kind: 'perk' },
      { kind: 'goal' },
      { kind: 'territory', n: 2 },
      { kind: 'camp' },
    ]);
  });
});

describe('the filters', () => {
  const t: Timeline = [
    run({ slot: 1 }),
    daily(),
    run({ slot: 2 }),
    crossed({ slot: 2 }),
    run({ slot: 1, at: 5000 }),
  ];

  it('runsOf filters by slot, and null means all', () => {
    expect(runsOf(t, 1)).toHaveLength(2);
    expect(runsOf(t, 2)).toHaveLength(1);
    expect(runsOf(t, 3)).toHaveLength(0);
    expect(runsOf(t, null)).toHaveLength(3);
  });

  it('worldEventsOf keeps the same slot contract', () => {
    expect(worldEventsOf(t, 2)).toEqual([crossed({ slot: 2 })]);
    expect(worldEventsOf(t, 1)).toHaveLength(0);
    expect(worldEventsOf(t, null)).toHaveLength(1);
  });

  it('streamOf interleaves runs and world events in stored order, never dailies', () => {
    expect(streamOf(t, null).map((e) => e.kind)).toEqual(['run', 'run', 'world', 'run']);
    expect(streamOf(t, 2)).toEqual([run({ slot: 2 }), crossed({ slot: 2 })]);
  });

  it('dailiesOf holds only dailies; the others exclude them', () => {
    expect(dailiesOf(t)).toEqual([daily()]);
    expect(runsOf(t, null).some((e) => e.kind !== 'run')).toBe(false);
  });
});

describe('prehistory', () => {
  it('states what the aggregates know that the timeline does not', () => {
    const t: Timeline = [run(), run(), run(), run(), run(), daily()];
    expect(prehistory(t, 42, 17)).toEqual({ runs: 37, dailies: 16 });
  });

  it('clamps at zero rather than claiming negative history', () => {
    const t: Timeline = [run(), daily()];
    expect(prehistory(t, 0, 0)).toEqual({ runs: 0, dailies: 0 });
  });

  it('counts dailies by tries, not dates', () => {
    expect(prehistory([], 0, 5)).toEqual({ runs: 0, dailies: 5 });
  });
});
