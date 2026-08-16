import { TUNING, type Tuning } from '@content/tuning';
import { distance, parse } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { stream, type RngStream } from '@engine/rng';
import type { DeathCause, GameState } from '@engine/state';
import type { Policy } from './policy';

/**
 * Playing a whole run without a screen.
 *
 * Gate C's first clause is "no scripted policy runs forever", so this is written
 * to distrust its policies. A run that neither dies nor progresses is reported
 * as a stall rather than hanging the process, because a deadlock discovered as a
 * data point is a finding and one discovered as a frozen terminal is an evening.
 */

export type Outcome =
  /** Reached a real end state. The only healthy outcome. */
  | 'died'
  /** The policy had no move, or its move changed nothing. A deadlock. */
  | 'stalled'
  /** Still going at the step cap. Either a very good run or a slow loop. */
  | 'capped';

export type RunResult = {
  readonly policy: string;
  readonly seed: number;
  readonly outcome: Outcome;
  readonly death: DeathCause | null;

  readonly points: number;
  /** How deep the run got. Depth is the axis Gate C compares policies on. */
  /**
   * How far from home the run built, in hexes — the endless world's depth. On a
   * bounded map it is just the last map's used radius, and mostly noise.
   */
  readonly reach: number;
  readonly placements: number;
  readonly harvests: number;
  readonly popped: number;
  /** Destinations reached this run. Zero everywhere the system is off. */
  readonly claims: number;
  /** Bounties collected. Gate B's manufactured reason to take points. */
  readonly quests: number;
  /** Harvests taken each way — Gate B's subject, per run. */
  readonly tilesTaken: number;
  readonly pointsTaken: number;

  /**
   * The biggest single harvest, and how far through the run it landed as a
   * fraction of total placements. Gate D wants the run's biggest number near the
   * end; a fraction near 1 is an arc, near 0.5 is a plateau.
   */
  readonly bestHarvest: number;
  readonly bestHarvestAt: number;

  /** Reducer steps taken. Cheap proxy for how long a human would sit there. */
  readonly steps: number;
};

export type RunOptions = {
  readonly tuning?: Tuning;
  /** Hard stop. Generous enough that hitting it is itself a finding. */
  readonly maxSteps?: number;
};

/**
 * Everything about a run that can only go one way. If none of these moved, the
 * move was a no-op no matter what it did to the state object.
 */
const progress = (s: GameState): string =>
  `${s.placements}/${s.log.harvests.length}/${s.points}/${s.tiles}`;

function summarise(
  state: GameState,
  policy: string,
  seed: number,
  outcome: Outcome,
  steps: number,
): RunResult {
  let bestHarvest = 0;
  let bestHarvestAt = 0;
  let tilesTaken = 0;
  let pointsTaken = 0;
  for (const h of state.log.harvests) {
    if (h.choice === 'tiles') tilesTaken++;
    else pointsTaken++;
    if (h.points > bestHarvest) {
      bestHarvest = h.points;
      bestHarvestAt = h.at;
    }
  }

  let reach = 0;
  let claims = 0;
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind === 'landmark' && cell.claimed) claims++;
    if (cell.kind !== 'tile' && cell.kind !== 'stone') continue;
    reach = Math.max(reach, distance(parse(k), { q: 0, r: 0 }));
  }

  return {
    policy,
    seed,
    outcome,
    death: state.death,
    points: state.points,
    reach,
    placements: state.placements,
    harvests: state.log.harvests.length,
    popped: state.log.popped,
    claims,
    quests: state.log.questsDone,
    tilesTaken,
    pointsTaken,
    bestHarvest,
    bestHarvestAt: state.placements === 0 ? 0 : bestHarvestAt / state.placements,
    steps,
  };
}

export function playRun(policy: Policy, seed: number, options: RunOptions = {}): RunResult {
  const maxSteps = options.maxSteps ?? 20000;
  const tuning = options.tuning ?? TUNING;

  let state = newRun(seed, tuning);
  // The policy's own randomness, on a stream of its own, so that varying the
  // policy cannot shift the tiles the game deals. Same reason the engine's
  // streams are separate.
  let dice: RngStream = stream((seed ^ 0x51ed270b) | 0);
  let steps = 0;

  while (state.phase === 'placing') {
    if (steps >= maxSteps) return summarise(state, policy.name, seed, 'capped', steps);

    const [move, nextDice] = policy.decide(state, dice);
    dice = nextDice;
    if (move.length === 0) return summarise(state, policy.name, seed, 'stalled', steps);

    const before = progress(state);
    for (const action of move) {
      state = reduce(state, action);
      steps++;
    }
    // The move advanced nothing the game measures. Left alone this spins
    // forever, so it is an outcome rather than a hang. Note this asks whether
    // the RUN moved, not whether the state object changed — a policy that only
    // ever reselects a draft tile is looping, however many new objects it makes.
    if (progress(state) === before) return summarise(state, policy.name, seed, 'stalled', steps);
  }

  return summarise(state, policy.name, seed, 'died', steps);
}

/** One policy over many seeds. Seeds are consecutive so a sweep is reproducible. */
export function playMany(
  policy: Policy,
  seeds: number,
  options: RunOptions = {},
): readonly RunResult[] {
  const out: RunResult[] = [];
  for (let i = 0; i < seeds; i++) out.push(playRun(policy, i + 1, options));
  return out;
}
