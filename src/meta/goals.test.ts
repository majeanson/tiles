import { describe, expect, it } from 'vitest';
import { GOALS } from '@content/goals';
import { EMPTY_PROGRESS, PERKS, type Progress } from './progress';
import { decodeWorld, encodeWorld, newWorld, UNLOCKS, type WorldMemory } from './world';
import { isGoalMet, metGoalIds, newlyMetGoals } from './goals';

/**
 * The survey (2026-08-18): five world-scale goals, each paying relics once
 * per world. Detection lives in `isGoalMet`; the shell pays via
 * `newlyMetGoals`, once, comparing against `WorldMemory.goalsMet`.
 */

const worldWith = (over: Partial<WorldMemory>): WorldMemory => ({ ...newWorld(1), ...over });

describe('the survey — detection', () => {
  it('reach20: true at and past 20, false short of it', () => {
    expect(isGoalMet('reach20', worldWith({ farthestReach: 19 }), EMPTY_PROGRESS)).toBe(false);
    expect(isGoalMet('reach20', worldWith({ farthestReach: 20 }), EMPTY_PROGRESS)).toBe(true);
    expect(isGoalMet('reach20', worldWith({ farthestReach: 30 }), EMPTY_PROGRESS)).toBe(true);
  });

  it('territories4: counts held territories', () => {
    const three = ['a', 'b', 'c'] as const;
    const four = ['a', 'b', 'c', 'd'] as const;
    expect(isGoalMet('territories4', worldWith({ territories: three }), EMPTY_PROGRESS)).toBe(
      false,
    );
    expect(isGoalMet('territories4', worldWith({ territories: four }), EMPTY_PROGRESS)).toBe(true);
  });

  it('known40: reads knownFraction against the 40% line', () => {
    // knownFraction is revealed / (a disc sized by max(10, farthestReach)) —
    // a world that has revealed nearly every hex of its own small disc
    // clears 40% easily.
    const revealed = Array.from({ length: 200 }, (_, i) => `${i},0`);
    expect(
      isGoalMet('known40', worldWith({ farthestReach: 0, revealed: [] }), EMPTY_PROGRESS),
    ).toBe(false);
    expect(isGoalMet('known40', worldWith({ farthestReach: 0, revealed }), EMPTY_PROGRESS)).toBe(
      true,
    );
  });

  it('shrinesAll: needs every shrine in the ledger, no more, no fewer', () => {
    const short = UNLOCKS.slice(0, UNLOCKS.length - 1).map((_, i) => `s${i}`);
    const full = UNLOCKS.map((_, i) => `s${i}`);
    expect(isGoalMet('shrinesAll', worldWith({ shrines: short }), EMPTY_PROGRESS)).toBe(false);
    expect(isGoalMet('shrinesAll', worldWith({ shrines: full }), EMPTY_PROGRESS)).toBe(true);
  });

  it('perksAll: reads Progress, not the world — perks carry across worlds', () => {
    const some: Progress = {
      ...EMPTY_PROGRESS,
      found: PERKS.slice(0, PERKS.length - 1).map((p) => p.id),
    };
    const all: Progress = { ...EMPTY_PROGRESS, found: PERKS.map((p) => p.id) };
    expect(isGoalMet('perksAll', newWorld(1), some)).toBe(false);
    expect(isGoalMet('perksAll', newWorld(1), all)).toBe(true);
  });
});

describe('the survey — once-only payout', () => {
  it('lists a goal as newly met the first time it becomes true', () => {
    const world = worldWith({ farthestReach: 20 });
    expect(newlyMetGoals(world, EMPTY_PROGRESS)).toContain('reach20');
  });

  it('never lists a goal already paid for this world, even though it stays true', () => {
    const world = worldWith({ farthestReach: 20, goalsMet: ['reach20'] });
    expect(newlyMetGoals(world, EMPTY_PROGRESS)).not.toContain('reach20');
    // metGoalIds (the raw "is it true" list) still names it — only the
    // NEWLY-met list is once-only.
    expect(metGoalIds(world, EMPTY_PROGRESS)).toContain('reach20');
  });

  it('lists every goal met at once, the run that clears several together', () => {
    const world = worldWith({
      farthestReach: 25,
      territories: ['a', 'b', 'c', 'd'],
    });
    const newly = newlyMetGoals(world, EMPTY_PROGRESS);
    expect(newly).toContain('reach20');
    expect(newly).toContain('territories4');
  });
});

describe('the survey — old worlds', () => {
  it('decodes a world written before goalsMet existed as having met nothing', () => {
    const stale = JSON.stringify({ worldSeed: 1, revealed: [], territories: [] });
    const world = decodeWorld(stale);
    expect(world?.goalsMet).toEqual([]);
  });

  it('round-trips a world that has met goals', () => {
    const world = worldWith({ goalsMet: ['reach20', 'perksAll'] });
    expect(decodeWorld(encodeWorld(world))).toEqual(world);
  });
});

describe('the survey — content', () => {
  it('prices every goal well under a maxed shop upgrade, never at zero', () => {
    for (const goal of GOALS) {
      expect(goal.reward).toBeGreaterThan(0);
      expect(goal.reward).toBeLessThanOrEqual(60);
    }
  });
});
