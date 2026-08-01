import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { key } from './hex';
import { radiusFor } from './map';
import { canLeave, newRun, reduce } from './reduce';
import { costOf, isExhausted, legalPlacements, ripeKeys } from './rules';
import type { Action, GameState } from './state';

const tuned = (over: Partial<Tuning>): Tuning => ({ ...TUNING, ...over });

/** A pocket-sized map, so a test can fill one in six moves instead of sixty. */
const TINY = tuned({ mapBaseRadius: 1, mapMaxRadius: 1 });

/** Place into legal cells until the map is full, the run ends, or we give up. */
function fill(state: GameState, limit = 500): GameState {
  let s = state;
  for (let i = 0; i < limit && s.phase === 'placing'; i++) {
    const spot = legalPlacements(s.cells)[0];
    if (spot === undefined) return s;
    s = reduce(s, { type: 'PLACE', hex: spot });
  }
  return s;
}

/** Fill, cash in, and hand back a state that is allowed to move on. */
function harvested(state: GameState): GameState {
  return reduce(fill(state), { type: 'HARVEST', choice: 'points' });
}

describe('starting a run', () => {
  it('is placeable, with a seed tile and a full draft', () => {
    const s = newRun(42);
    expect(s.draft).toHaveLength(TUNING.draftWidth);
    expect(s.tiles).toBe(TUNING.startingTiles);
    expect(s.cells[key(0, 0)]?.kind).toBe('tile');
    expect(s.phase).toBe('placing');
    expect(s.death).toBeNull();
  });

  it('is deterministic from its seed', () => {
    expect(newRun(7)).toEqual(newRun(7));
    expect(newRun(7).draft).not.toEqual(newRun(8).draft);
  });

  // Save files, replays and the harness all rest on this.
  it('round-trips through JSON', () => {
    const s = fill(newRun(3), 5);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  // A run is reproducible from its seed AND its tuning, so the tuning travels
  // with the state rather than being read from a module at score time.
  it('carries the economy it is being played under', () => {
    const thin = tuned({ startingTiles: 5 });
    expect(newRun(1, thin).tiles).toBe(5);
    expect(newRun(1, thin).tuning).toEqual(thin);
    expect(newRun(1).tiles).toBe(TUNING.startingTiles);
  });
});

describe('placing', () => {
  it('spends the cost and advances the dial', () => {
    const a = newRun(5);
    const b = reduce(a, { type: 'PLACE', hex: key(1, 0) });
    expect(b.placements).toBe(1);
    expect(b.tiles).toBe(a.tiles - costOf(0, a.tuning));
    expect(b.cells[key(1, 0)]?.kind).toBe('tile');
  });

  // The engine must not trust the UI: illegal actions are rejected, not thrown.
  it('returns the same state for every illegal action', () => {
    const s = newRun(9);
    const illegal: Action[] = [
      { type: 'PLACE', hex: key(0, 0) }, // occupied
      { type: 'PLACE', hex: key(9, 9) }, // off map
      { type: 'PLACE', hex: key(2, 0) }, // touches nothing
      { type: 'SELECT', index: 99 },
      { type: 'SELECT', index: -1 },
      { type: 'HARVEST', choice: 'tiles' }, // nothing ripe
      { type: 'LEAVE' }, // nothing harvested here yet
    ];
    for (const action of illegal) expect(reduce(s, action)).toBe(s);
  });

  it('never lets the budget go negative', () => {
    let s = newRun(13);
    for (let i = 0; i < 400 && s.phase === 'placing'; i++) {
      const spot = legalPlacements(s.cells)[0];
      s =
        spot === undefined
          ? reduce(s, { type: 'HARVEST', choice: 'tiles' })
          : reduce(s, { type: 'PLACE', hex: spot });
      expect(s.tiles).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('harvesting', () => {
  it('turns ripe tiles to stone and pays only the chosen currency', () => {
    const full = fill(newRun(11, TINY));
    expect(ripeKeys(full.cells).length).toBeGreaterThan(0);

    const taken = reduce(full, { type: 'HARVEST', choice: 'points' });
    expect(taken.points).toBeGreaterThan(0);
    expect(taken.tiles).toBe(full.tiles); // points chosen, so no tiles
    expect(ripeKeys(taken.cells)).toEqual([]); // stone is never ripe again
    expect(Object.values(taken.cells).every((c) => c.kind !== 'tile')).toBe(true);
  });

  it('pays tiles instead when tiles are asked for', () => {
    const full = fill(newRun(11, TINY));
    const taken = reduce(full, { type: 'HARVEST', choice: 'tiles' });
    expect(taken.tiles).toBeGreaterThan(full.tiles);
    expect(taken.points).toBe(0);
  });

  // Gate D asks whether the run's biggest number came near the end, which a
  // total cannot answer. Each harvest is recorded with the clock reading.
  it('records each harvest against the run clock', () => {
    const taken = harvested(newRun(11, TINY));
    expect(taken.log.harvests).toHaveLength(1);
    expect(taken.log.harvests[0]).toMatchObject({
      mapNumber: 1,
      at: taken.placements,
      choice: 'points',
    });
    expect(taken.log.popped).toBe(taken.log.harvests[0]?.count);
  });
});

describe('leaving a map', () => {
  // Without this condition leaving is free and unlimited, and the map
  // multiplier is free with it: skip to map 40 touching nothing, then farm.
  it('is refused until you have harvested here', () => {
    const s = newRun(21, TINY);
    expect(canLeave(s)).toBe(false);
    expect(canLeave(fill(s))).toBe(false); // a full board is not enough
    expect(canLeave(harvested(s))).toBe(true);
  });

  it('needs harvesting again on the new map, not once per run', () => {
    const next = reduce(harvested(newRun(21, TINY)), { type: 'LEAVE' });
    expect(next.mapNumber).toBe(2);
    expect(canLeave(next)).toBe(false);
  });

  it('hands you a fresh board but keeps the run', () => {
    const before = harvested(newRun(21, TINY));
    const after = reduce(before, { type: 'LEAVE' });

    expect(after.tiles).toBe(before.tiles);
    expect(after.points).toBe(before.points);
    expect(after.placements).toBe(before.placements); // the dial never resets
    expect(after.log.placementsAtMapStart).toBe(before.placements);

    // One tile on bare ground, and room to build again.
    const kinds = Object.values(after.cells).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'tile')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'stone')).toHaveLength(0);
    expect(isExhausted(after.cells)).toBe(false);
  });

  it('grows the map with depth, up to a cap that still fits a phone', () => {
    expect(radiusFor(1, TUNING)).toBe(TUNING.mapBaseRadius);
    expect(radiusFor(1 + TUNING.mapGrowsEvery, TUNING)).toBe(TUNING.mapBaseRadius + 1);
    expect(radiusFor(999, TUNING)).toBe(TUNING.mapMaxRadius);

    const deep = radiusFor(1 + TUNING.mapGrowsEvery, TUNING);
    expect(Object.keys(newRun(1).cells).length).toBeLessThan(
      3 * deep * (deep + 1) + 1, // cells in a disc of the deeper radius
    );
  });
});

describe('the end of a run', () => {
  it('names the cause, and only ever this one', () => {
    let s = newRun(31, tuned({ startingTiles: 4, mapBaseRadius: 2, mapMaxRadius: 2 }));
    for (let i = 0; i < 50 && s.phase === 'placing'; i++) {
      const spot = legalPlacements(s.cells)[0];
      s =
        spot === undefined
          ? reduce(s, { type: 'HARVEST', choice: 'points' })
          : reduce(s, { type: 'PLACE', hex: spot });
    }
    expect(s.phase).toBe('ended');
    expect(s.death).toBe('broke');
  });

  // Being out of room is never fatal — you can always cash out what is ripe.
  it('does not end while something is still ripe to cash in', () => {
    const full = fill(newRun(11, tuned({ ...TINY, startingTiles: 6 })));
    expect(full.tiles).toBe(0);
    expect(ripeKeys(full.cells).length).toBeGreaterThan(0);
    expect(full.phase).toBe('placing');

    expect(reduce(full, { type: 'HARVEST', choice: 'points' }).phase).toBe('ended');
  });

  it('accepts nothing once it has ended', () => {
    const dead = reduce(fill(newRun(11, tuned({ ...TINY, startingTiles: 6 }))), {
      type: 'HARVEST',
      choice: 'points',
    });
    expect(dead.phase).toBe('ended');
    for (const action of [
      { type: 'PLACE', hex: key(1, 0) },
      { type: 'SELECT', index: 1 },
      { type: 'HARVEST', choice: 'tiles' },
      { type: 'LEAVE' },
    ] satisfies Action[]) {
      expect(reduce(dead, action)).toBe(dead);
    }
  });
});
