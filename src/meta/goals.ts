import { GOALS, type GoalId } from '@content/goals';
import { PERKS, type Progress } from './progress';
import { knownFraction, UNLOCKS, type WorldMemory } from './world';

/**
 * The survey's detection half (2026-08-18). Payout and the ledger write live
 * in the shell (`src/main.ts`, where `mergeRun`/`rememberRun` already run);
 * this module only answers "is this goal true right now", so the shell, the
 * settings ledger and the tests all read the same one question.
 *
 * Two of the five goals (`shrinesAll`, `perksAll`) measure against pool
 * sizes `content/goals.ts` cannot import (content/ imports nothing) — read
 * here instead, from `UNLOCKS.length` and `PERKS.length`, their real source
 * of truth.
 */

const REACH_TARGET = 20;
const TERRITORY_TARGET = 4;
const KNOWN_TARGET = 0.4;

export function isGoalMet(id: GoalId, world: WorldMemory, progress: Progress): boolean {
  switch (id) {
    case 'reach20':
      return world.farthestReach >= REACH_TARGET;
    case 'territories4':
      return world.territories.length >= TERRITORY_TARGET;
    case 'known40':
      return knownFraction(world) >= KNOWN_TARGET;
    case 'shrinesAll':
      return world.shrines.length >= UNLOCKS.length;
    case 'perksAll':
      return progress.found.length >= PERKS.length;
  }
}

/** Every goal true right now, in ledger order — met or not paid makes no difference here. */
export const metGoalIds = (world: WorldMemory, progress: Progress): readonly GoalId[] =>
  GOALS.filter((g) => isGoalMet(g.id, world, progress)).map((g) => g.id);

/**
 * Goals true right now that this world has not been PAID for yet — what the
 * shell owes relics for, once, the moment it sees this list is non-empty.
 */
export function newlyMetGoals(world: WorldMemory, progress: Progress): readonly GoalId[] {
  const already = new Set(world.goalsMet);
  return metGoalIds(world, progress).filter((id) => !already.has(id));
}
