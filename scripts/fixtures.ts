/**
 * The device histories the screen audit is shot against.
 *
 * A screenshot of a menu is only worth looking at if the menu has something
 * in it, and every interesting surface this game owns — the shop's purse,
 * the atlas line, the hall of fame, the perk shelf, the unlock ledger — is
 * empty on a virgin device. So the audit needs a PLAYED device and a very
 * played one, and the honest way to get those is to play: this walks real
 * runs through the real reducer with a harness policy, and folds each one
 * into the world, the record book, the purse and the diary exactly the way
 * `shell/keeper.ts` does when a run ends.
 *
 * Fabricated JSON would have been ten minutes' work and worthless — a
 * territory at a hex the generator never put a landmark on, a shrine count
 * the unlock ledger disagrees with, a `revealed` list that is not a
 * connected map. Every fact in the output was produced by the game.
 *
 *   pnpm fixtures        → e2e/fixtures/states.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GOALS } from '@content/goals';
import { TUNING, type Tuning } from '@content/tuning';
import { newRun, reduce } from '@engine/reduce';
import { stream, type RngStream } from '@engine/rng';
import { reachOf } from '@engine/rules';
import type { GameState } from '@engine/state';
import { arcSparkline } from '@meta/daily';
import { newlyMetGoals } from '@meta/goals';
import {
  applyProgress,
  buy,
  grantFind,
  withWorldPerks,
  EMPTY_PROGRESS,
  encodeProgress,
  TEACH_IDS,
  UPGRADES,
  type Progress,
  type UpgradeId,
} from '@meta/progress';
import { encodeRecords, recordRun, type RecordBook } from '@meta/records';
import { encodeRun } from '@meta/save';
import { encodeTimeline, runHighlights, type RunDetail, type TimelineEntry } from '@meta/timeline';
import {
  encodeWorld,
  newWorld,
  rearmedSpent,
  rememberRun,
  unlockedBy,
  UNLOCKS,
  type WorldMemory,
} from '@meta/world';
import { POLICIES } from '@sim/policy';
import { epitaphFor } from '@ui/view';

/** One device's whole localStorage, as the audit will replay it. */
type Bag = Record<string, string>;

/**
 * `applyUnlocks`, copied from `shell/session.ts`.
 *
 * Copied rather than imported because the original lives inside the DOM
 * session module, and the shell needs a browser. Four lines; if a shrine
 * ever unlocks something else, this copy is the one place to follow.
 */
function applyUnlocks(base: Tuning, unlocked: readonly string[]): Tuning {
  let t = base;
  if (unlocked.includes('draft')) t = { ...t, draftWidth: t.draftWidth + 1 };
  if (unlocked.includes('hold')) t = { ...t, holdSlots: t.holdSlots + 1 };
  if (unlocked.includes('luck')) {
    t = { ...t, magicChance: t.magicChance * 2, uniqueChance: t.uniqueChance * 2 };
  }
  if (unlocked.includes('reach')) t = { ...t, beaconHorizon: t.beaconHorizon * 2 };
  return t;
}

/** The end screen's own facts, as `keeper.ts` stores them — minus the board
 *  thumbnail, which needs a canvas and is not what this fixture is for. */
function detailOf(state: GameState): RunDetail {
  let bigPop = 0;
  let bigPopAt = 0;
  for (const h of state.log.harvests) {
    if (h.points > bigPop) {
      bigPop = h.points;
      bigPopAt = h.at;
    }
  }
  let claims = 0;
  for (const cell of Object.values(state.cells)) {
    if (cell.kind === 'landmark' && cell.claimed) claims++;
  }
  return {
    placements: state.placements,
    harvests: state.log.harvests.length,
    popped: state.log.popped,
    bigPop,
    bigPopAt: state.placements === 0 ? 0 : bigPopAt / state.placements,
    claims,
    quests: state.log.questsDone,
    relics: state.relics,
    // The game's own sentence, not one invented here. `epitaphFor` is pure
    // and exported, and a diary row that retells a run in words the end
    // screen would never have used is a fixture lying about the product.
    epitaph: epitaphFor(state),
  };
}

const mark = (s: GameState): string =>
  `${s.placements}/${s.log.harvests.length}/${s.points}/${s.tiles}`;

/** One run, played to its end (or to the step cap) — `sim/run.ts`'s loop,
 *  re-stated here because that one cannot be handed a world's memory. */
function playOne(
  policy: (typeof POLICIES)[number],
  from: GameState,
  seed: number,
  stopAt: number | null,
): GameState {
  let state = from;
  let dice: RngStream = stream((seed ^ 0x51ed270b) | 0);
  let steps = 0;
  while (state.phase === 'placing' && steps < 20_000) {
    if (stopAt !== null && state.placements >= stopAt) break;
    const [move, next] = policy.decide(state, dice);
    dice = next;
    if (move.length === 0) break;
    const before = mark(state);
    for (const action of move) {
      state = reduce(state, action);
      steps++;
    }
    if (mark(state) === before) break;
  }
  return state;
}

type History = {
  world: WorldMemory;
  progress: Progress;
  book: RecordBook;
  timeline: TimelineEntry[];
  /** The last run played, kept whole so the audit can resume onto its end. */
  last: GameState | null;
  /** A board mid-run, saved at the moment a player would put the phone down:
   *  the in-game shots want a lived-in board, not a first frame. */
  midRun: GameState | null;
};

/**
 * Play `runs` runs into one world, banking each the way the keeper does.
 *
 * The ORDER mirrors `keeper.ts`: relics bank, the world remembers, finds
 * grant perks, goals pay, records update, the diary ticks.
 *
 * **Every run rotates the policy, and that is not decoration.** A world's
 * geography is a pure function of its seed, so one policy replayed against
 * one world is the SAME run every time: the first draft of this played 26
 * runs into a world and folded in exactly the ground the first run had
 * already revealed — 99 hexes, no territories, no shrines, run 26 identical
 * to run 1. A device history is made of a person playing differently, so the
 * harness has to as well. Camp starts do the same job at world scale: a run
 * that wakes at a held territory explores in a direction origin never
 * reaches, which is how the far shrines are ever found.
 */
function live(
  worldSeed: number,
  runs: number,
  opts: { readonly camp: boolean; readonly ladder: readonly UpgradeId[] },
): History {
  let world = newWorld(worldSeed);
  let progress: Progress = { ...EMPTY_PROGRESS, met: [...TEACH_IDS] };
  let book: RecordBook = {};
  const timeline: TimelineEntry[] = [];
  let last: GameState | null = null;
  let midRun: GameState | null = null;
  // One day per run, walking forward to now, so the diary reads as a history
  // rather than as thirty rows stamped the same second.
  let at = Date.now() - runs * 86_400_000;

  for (let i = 0; i < runs; i++) {
    const policy = POLICIES[i % POLICIES.length];
    if (policy === undefined) throw new Error('fixtures: the policy table is empty');
    const composite = withWorldPerks(progress, world.perks, world.worn);
    const tuning = applyProgress(applyUnlocks(TUNING, unlockedBy(world)), composite);
    const before = world;
    const perksBefore = world.perks.length;
    // Every third run wakes at a territory the world already holds, which is
    // the game's own BEGIN AT CAMP and the only way ground far from origin
    // ever gets walked.
    const camp =
      opts.camp && i % 3 === 2 && world.territories.length > 0
        ? (world.territories[i % world.territories.length] ?? null)
        : null;
    const opening = newRun(
      worldSeed,
      tuning,
      world.territories,
      world.finds,
      camp,
      rearmedSpent(world),
    );

    const state = playOne(policy, opening, worldSeed + i * 7919, null);

    // The last world's last run, stopped seven-tenths of the way through:
    // the same seed and the same policy, so the half-board is genuinely a
    // prefix of the run the diary above it records.
    if (i === runs - 1 && state.placements > 3) {
      const half = playOne(
        policy,
        opening,
        worldSeed + i * 7919,
        Math.max(1, Math.floor(state.placements * 0.7)),
      );
      if (half.phase === 'placing' && half.placements > 0) midRun = half;
    }

    progress = { ...progress, relics: progress.relics + state.relics };
    world = rememberRun(world, state);

    // A hidden find grants one unowned perk, deterministic in (world, hex).
    for (const hex of world.finds) {
      if (before.finds.includes(hex)) continue;
      const granted = grantFind(withWorldPerks(progress, world.perks, world.worn), worldSeed, hex);
      if (granted === null) continue;
      world = {
        ...world,
        perks: [...granted.progress.found],
        worn: granted.progress.equipped[0] ?? null,
      };
    }

    const newly = newlyMetGoals(world, withWorldPerks(progress, world.perks, world.worn));
    if (newly.length > 0) {
      const reward = newly.reduce((n, id) => n + (GOALS.find((g) => g.id === id)?.reward ?? 0), 0);
      progress = { ...progress, relics: progress.relics + reward };
      world = { ...world, goalsMet: [...world.goalsMet, ...newly] };
    }

    book = recordRun(book, state);
    timeline.push({
      at,
      kind: 'run',
      slot: 1,
      worldSeed,
      score: state.points,
      reach: reachOf(state),
      arc: arcSparkline(state.log.harvests),
      highlights: runHighlights(before, world, {
        points: state.points,
        perksBefore,
        perksAfter: world.perks.length,
        campStart: state.wakeAt !== null,
      }),
      detail: detailOf(state),
    });

    if (before.shrines.length < UNLOCKS.length && world.shrines.length >= UNLOCKS.length) {
      timeline.push({ at: at + 1, kind: 'world', event: 'awake', slot: 1, worldSeed });
    }
    if (before.goalsMet.length < GOALS.length && world.goalsMet.length >= GOALS.length) {
      timeline.push({ at: at + 2, kind: 'world', event: 'surveyed', slot: 1, worldSeed });
    }

    // Shopping between runs, not all at the end: the levels a device holds
    // are the ones it could afford as it went, and buying early changes the
    // economy every later run is played under — which is the whole point of
    // the shop and would be missing from a purse spent in one go at the
    // finish.
    progress = shop(progress, opts.ladder);

    at += 86_400_000;
    last = state;
  }

  return { world, progress, book, timeline, last, midRun };
}

/** Spend the purse down the shop ladder, in the order given, skipping
 *  anything the purse cannot reach — `buy` returns the same object when it
 *  refuses, which is what "skip" means here. */
function shop(progress: Progress, wanted: readonly UpgradeId[]): Progress {
  let out = progress;
  for (const id of wanted) {
    const upgrade = UPGRADES.find((u) => u.id === id);
    if (upgrade === undefined) continue;
    out = buy(out, upgrade);
  }
  return out;
}

/** One history, rendered as the keys the shell actually reads. */
function bagOf(h: History, resume: 'mid' | 'ended' | null): Bag {
  const bag: Bag = {
    'tiles.slot.v1': '1',
    'tiles.progress.v1': encodeProgress(h.progress),
    'tiles.shop.s1.v1': JSON.stringify(h.progress.bought),
    'tiles.world.v1': encodeWorld(h.world),
    'tiles.records.v2': encodeRecords(h.book),
    'tiles.timeline.v1': encodeTimeline(h.timeline),
    // The install nudge has fired already on a device with this much history;
    // an audit shot of a menu should not be a shot of that card.
    'tiles.installnudge.v1': '1',
  };
  if (resume === 'mid' && h.midRun !== null) bag['tiles.run.v1'] = encodeRun(h.midRun);
  if (resume === 'ended' && h.last !== null) bag['tiles.run.v1'] = encodeRun(h.last);
  return bag;
}

function describe(h: History): Record<string, number | string> {
  return {
    runs: h.world.runs,
    relics: h.progress.relics,
    revealed: h.world.revealed.length,
    territories: h.world.territories.length,
    shrines: `${h.world.shrines.length}/${UNLOCKS.length}`,
    finds: h.world.finds.length,
    perks: h.world.perks.length,
    worn: h.world.worn ?? '-',
    goals: `${h.world.goalsMet.length}/${GOALS.length}`,
    bestPoints: h.world.bestPoints,
    farthest: h.world.farthestReach,
    diary: h.timeline.length,
    levels: Object.values(h.progress.bought).reduce((a, b) => a + b, 0),
    midRunPlacements: h.midRun?.placements ?? 0,
  };
}

/**
 * What a player buys, in the order they buy it. Offered after every run and
 * taken only where the purse reaches, so an early world holds one or two
 * levels and a long-lived one holds the ladder.
 */
const LADDER: readonly UpgradeId[] = [
  'tiles',
  'pace',
  'tiles',
  'odds',
  'tiles',
  'world',
  'pace',
  'tiles',
  'sense',
  'odds',
  'tiles',
  'world',
  'pace',
  'odds',
  'tiles',
  'sense',
  'tiles',
  'world',
  'pace',
  'odds',
  'tiles',
  'sense',
  'world',
  'odds',
];

// Two histories. `played` is a few evenings — a purse worth opening the shop
// for, a world with ground on it, a diary with rows, and not one shrine yet.
// `veryPlayed` is a world walked out: every shrine woken, every perk found,
// the survey complete, the ladder bought. Both are what a UI audit needs at
// once — the screen with nothing in it, and the screen with everything.
const played = live(20260828, 5, { camp: false, ladder: LADDER });
const deep = live(770077, 300, { camp: true, ladder: LADDER });

const out = {
  generatedAt: new Date().toISOString(),
  summary: { played: describe(played), veryPlayed: describe(deep) },
  states: {
    fresh: {} as Bag,
    played: bagOf(played, 'mid'),
    veryPlayed: bagOf(deep, 'mid'),
    // The end screen has no door of its own: an ended run left in storage is
    // what the shell resumes onto, which is the only way to shoot it without
    // playing a whole run inside the browser.
    ended: bagOf(deep, 'ended'),
  },
};

mkdirSync(fileURLToPath(new URL('../e2e/fixtures', import.meta.url)), { recursive: true });
const target = fileURLToPath(new URL('../e2e/fixtures/states.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log('played     ', out.summary.played);
console.log('veryPlayed ', out.summary.veryPlayed);
console.log(`-> ${target}`);
