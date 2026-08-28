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

// Tightened 2026-08-20 with every other relic faucet (Marc: "make sure its
// harder overall to get relics") — same ~35% cut as the per-run sources,
// so a milestone still feels like a bonus rung, just not a free one.
export const GOALS: readonly Goal[] = [
  { id: 'reach20', label: 'Reach 20 hexes from home', reward: 25, target: 20 },
  { id: 'territories4', label: 'Hold 4 territories', reward: 30, target: 4 },
  { id: 'known40', label: 'Know 40% of the world', reward: 35, target: 0.4 },
  { id: 'shrinesAll', label: 'Wake every shrine', reward: 25 },
  { id: 'perksAll', label: 'Find every perk', reward: 40 },
];

/**
 * The crossing (Marc, 2026-08-19: "a shrine you can reach that asks you —
 * go to new world? — with a bonus that carries on"). Once a world is fully
 * awake, every FURTHER shrine reached offers passage to a fresh world; what
 * carries is relics, scaled by the world being left behind, so finishing a
 * world thoroughly pays better than rushing its exit. A finished world with
 * four territories pays 25 + 40 = 65 relics — one or two shop levels, a
 * real dowry beside the goals above without dwarfing them (tightened
 * 2026-08-20 with every other faucet, from 40 + 15/territory). Balance
 * numbers, so they live here; the offer itself is shell work (`main.ts`),
 * because leaving a world outlives any run.
 */
export const CROSSING = {
  baseRelics: 25,
  relicsPerTerritory: 10,
};

/**
 * Spent one-time landmarks, reborn (Marc, 2026-08-20: "shrines and hidden
 * finds should transform into either points or cache (randomized) per new
 * run"): a woken shrine or a claimed find re-arms each NEW run as a cache
 * or a site, rolled per run so a veteran world's map keeps changing faces.
 * `chance` is the dial that zeroes the system (the standing contract);
 * `cacheShare` splits the roll — the rest are sites. One deliberate
 * exception lives in `meta/world.ts`: on a FULLY AWAKE world the shrines
 * stay shrines, because they are the crossing's doors and transforming
 * them would delete Marc's own way onward.
 */
export const REARM = {
  chance: 1,
  cacheShare: 0.5,
};

/**
 * What one level of each shop upgrade is worth, and what each found perk
 * sets its dial to (2026-08-21).
 *
 * They live HERE for the reason everything in this folder does — they are
 * balance numbers — but the reason they were MOVED is drift. Every one of
 * them was written twice in `meta/progress.ts`: once in the shop's prose
 * ("+5 tiles to start every run", "cost 1 less", "at double cost", "Draft
 * five tiles") and again, two hundred-odd lines away, in `applyProgress`,
 * where the dial is actually set. Nothing tied the two together and no test
 * read the prose, so tuning any of them made the shop lie to the player
 * about what they were buying. The notes interpolate these now, so the
 * sentence cannot survive the number changing under it.
 */
export const UPGRADE_STEPS = {
  /** DEEPER PURSE: starting tiles per level. */
  tiles: 5,
  /** KEENER EYE: added chance per level, per rarity. */
  magic: 0.02,
  unique: 0.005,
  /** RICHER WORLDS: destination chance, and tiles per cache, per level. */
  destination: 0.08,
  cache: 3,
  /** STEADY PACE: placements added to the cost step, per level. */
  pace: 2,
  /** KEEN NOSE: hexes of shimmer, per level. */
  sense: 2,
};

/** What a worn perk sets, for the shelf's prose and `applyProgress` alike. */
export const PERK_DIALS = {
  /** SECOND WIND: the refill, and the odds of getting it. */
  secondWindTiles: 20,
  secondWindChance: 0.5,
  /** STONEWALKER: tiles knocked off a placement beside stone. */
  stoneDiscount: 1,
  /** WALLBREAKER: what building on a wall multiplies the cost by. */
  wallBuildCostMult: 2,
  /** OPEN HAND: the wider draft it trades the stash for. */
  openHandDraft: 5,
  /**
   * ROOTBOUND, repriced 2026-08-27 (Marc, after a 52k high: "i had rootbound
   * and instantly doubled my points basically... odds in some way linked to
   * your luck instead of always double and always 0" — then, on the fork:
   * "change how it works and tone it down with luck").
   *
   * It used to be a flat x2 on your own ground and a hard zero off it, from
   * the first placement of the run. That is the perk that doubled a score
   * before it had been earned. Now the two ends are where the perk BEGINS,
   * and full luck is what walks them to where the perk used to start:
   *
   *   native   1.35 -> 2     as luck fills
   *   stray    0.5  -> 0     as luck fills
   *
   * So the sharpest edge in the game is still there and is now something you
   * bank rather than something you are handed — which also gives luck a third
   * thing to be worth, against rerolling and against the rare odds it buys.
   */
  rootboundNative: 1.35,
  rootboundNativeMax: 2,
  rootboundStray: 0.5,
};
