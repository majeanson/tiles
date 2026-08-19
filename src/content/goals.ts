/**
 * The survey: five world-scale goals (2026-08-18), each paying relics ONCE
 * per world the moment it is first met.
 *
 * Shrines and territories already answer "why explore" at the scale of one
 * landmark; the survey answers it one scale up — a legible ledger of what
 * this WORLD has proven, not merely what one run did. Detection and payout
 * live in `src/meta/goals.ts` (which needs `WorldMemory` and `Progress`,
 * neither of which `content/` may import — content/ imports nothing but its
 * own types, see eslint.config.js); this file carries every number,
 * including the threshold each goal is measured against, per the project's
 * own rule that a balance number under `src/engine/` — or, here, under
 * `src/meta/` — is a bug. A plain number needs no import, so `target` lives
 * here even though the comparison it feeds does not. `shrinesAll` and
 * `perksAll` are the two exceptions: they are measured in `meta/goals.ts`
 * against `UNLOCKS.length`/`PERKS.length` directly (their real source of
 * truth), rather than a count duplicated here that could drift from either
 * pool's actual size — `target` is omitted for both.
 *
 * Amounts are modest beside a single shop upgrade (20-50 relics apiece,
 * `src/meta/progress.ts`) on purpose: these are milestones that fire once a
 * world, not the grind a run is played for, so a goal should feel like a
 * bonus rung on the ladder rather than a second currency to farm.
 */

export type GoalId = 'reach20' | 'territories4' | 'known40' | 'shrinesAll' | 'perksAll';

export type Goal = {
  readonly id: GoalId;
  readonly label: string;
  readonly reward: number;
  /** What `label` already says in words. Omitted where the real target is a pool size (see above). */
  readonly target?: number;
};

export const GOALS: readonly Goal[] = [
  { id: 'reach20', label: 'Reach 20 hexes from home', reward: 40, target: 20 },
  { id: 'territories4', label: 'Hold 4 territories', reward: 45, target: 4 },
  { id: 'known40', label: 'Know 40% of the world', reward: 50, target: 0.4 },
  { id: 'shrinesAll', label: 'Wake every shrine', reward: 35 },
  { id: 'perksAll', label: 'Find every perk', reward: 60 },
];

/**
 * The crossing (Marc, 2026-08-19: "a shrine you can reach that asks you —
 * go to new world? — with a bonus that carries on"). Once a world is fully
 * awake, every FURTHER shrine reached offers passage to a fresh world; what
 * carries is relics, scaled by the world being left behind, so finishing a
 * world thoroughly pays better than rushing its exit. A finished world with
 * four territories pays 40 + 60 = 100 relics — two or three shop levels,
 * a real dowry beside the goals above without dwarfing them. Balance
 * numbers, so they live here; the offer itself is shell work (`main.ts`),
 * because leaving a world outlives any run.
 */
export const CROSSING = {
  baseRelics: 40,
  relicsPerTerritory: 15,
};
