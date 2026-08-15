import { COLOURS, ENDLESS_TUNING, type Colour, type Tuning } from '../src/content/tuning';
import { distance, parse } from '../src/engine/hex';
import { newRun, reduce } from '../src/engine/reduce';
import { stream, type RngStream } from '../src/engine/rng';
import { harvestValue, worthOf } from '../src/engine/rules';
import { policyByName, type Policy } from '../src/sim/policy';

/**
 * The colour-balance report: how each colour actually performs across a run.
 *
 *   pnpm exec tsx scripts/colours.ts
 *
 * Plays the shipped endless economy with a spread of policies and, at every
 * harvest, credits each popped tile's worth to its colour — splitting out how
 * much its POWER earned (the same board re-tallied with powers off) and when
 * in the run it happened (thirds by placement count). Placement counts show
 * which colours the preview steers a competent player toward; pop worth shows
 * which colours actually pay. The question this answers: is any colour a dead
 * card, and does any colour own an era of the run?
 */

const SEEDS = 30;
const POLICY_NAMES = ['bank40', 'bank15', 'seeker', 'rush'];

type Phase = 0 | 1 | 2;

type Tally = {
  placed: number;
  popped: number;
  worth: number;
  power: number;
  /** worth landed in each third of the run. */
  phaseWorth: [number, number, number];
  phasePopped: [number, number, number];
};

const blank = (): Tally => ({
  placed: 0,
  popped: 0,
  worth: 0,
  power: 0,
  phaseWorth: [0, 0, 0],
  phasePopped: [0, 0, 0],
});

/** `--set key=value` overrides, same idea as sim.ts, so ideas can be A/B'd. */
function tuningFromArgs(argv: readonly string[]): Tuning {
  let t: Tuning = ENDLESS_TUNING;
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] !== '--set') continue;
    const setting = argv[i + 1]!;
    const eq = setting.indexOf('=');
    const name = setting.slice(0, eq) as keyof Tuning;
    const raw = setting.slice(eq + 1);
    if (!(name in t)) throw new Error(`no such tuning key "${name}"`);
    const value: unknown =
      typeof t[name] === 'boolean' ? raw === 'true' : name === 'world' ? raw : Number(raw);
    t = { ...t, [name]: value };
  }
  return t;
}

const T = tuningFromArgs(process.argv.slice(2));
const PLAIN: Tuning = {
  ...T,
  greenCrowdBonus: 0,
  yellowCompanyBonus: 0,
  redAshMatches: false,
  blueTideEvery: 0,
};

type PopRecord = {
  colour: Colour;
  worth: number;
  power: number;
  at: number;
  dist: number;
};

/** One instrumented run: the sim loop with a listener on every harvest. */
function playInstrumented(
  policy: Policy,
  seed: number,
): { pops: PopRecord[]; placed: Map<Colour, number>; placements: number } {
  let state = newRun(seed, T);
  let dice: RngStream = stream((seed ^ 0x51ed270b) | 0);
  const pops: PopRecord[] = [];
  const placed = new Map<Colour, number>(COLOURS.map((c) => [c, 0]));

  for (let steps = 0; state.phase === 'placing' && steps < 20000; steps++) {
    const [move, nextDice] = policy.decide(state, dice);
    dice = nextDice;
    if (move.length === 0) break;

    for (const action of move) {
      if (action.type === 'PLACE') {
        const tile = state.draft[state.selected];
        if (tile !== undefined) placed.set(tile.colour, (placed.get(tile.colour) ?? 0) + 1);
      }
      if (action.type === 'HARVEST') {
        const { keys } = harvestValue(state, action.at);
        for (const k of keys) {
          const cell = state.cells[k];
          if (cell?.kind !== 'tile') continue;
          const worth = worthOf(state.cells, k, T);
          pops.push({
            colour: cell.colour,
            worth,
            power: worth - worthOf(state.cells, k, PLAIN),
            at: state.placements,
            dist: distance(parse(k), { q: 0, r: 0 }),
          });
        }
      }
      const next = reduce(state, action);
      if (next === state && action.type !== 'SELECT') break;
      state = next;
    }
  }

  return { pops, placed, placements: state.placements };
}

function main(): void {
  const tallies = new Map<Colour, Tally>(COLOURS.map((c) => [c, blank()]));
  let totalWorth = 0;

  for (const name of POLICY_NAMES) {
    const policy = policyByName(name);
    if (policy === undefined) throw new Error(`no such policy ${name}`);

    for (let seed = 1; seed <= SEEDS; seed++) {
      const { pops, placed, placements } = playInstrumented(policy, seed);
      for (const [colour, n] of placed) tallies.get(colour)!.placed += n;
      for (const p of pops) {
        const t = tallies.get(p.colour)!;
        const phase: Phase = Math.min(2, Math.floor((p.at / Math.max(1, placements)) * 3)) as Phase;
        t.popped++;
        t.worth += p.worth;
        t.power += p.power;
        t.phaseWorth[phase] += p.worth;
        t.phasePopped[phase]++;
        totalWorth += p.worth;
      }
    }
  }

  const pct = (v: number, of: number): string =>
    of === 0 ? '—' : `${Math.round((v / of) * 100)}%`;
  const avg = (v: number, of: number): string => (of === 0 ? '—' : (v / of).toFixed(2));

  console.log(`${POLICY_NAMES.join(', ')} · ${SEEDS} seeds each · shipped endless economy\n`);
  console.log(
    'colour  placed  popped  worth-share  avg-worth  power-share  early-avg  mid-avg  late-avg',
  );
  for (const colour of COLOURS) {
    const t = tallies.get(colour)!;
    console.log(
      [
        colour.padEnd(6),
        String(t.placed).padStart(6),
        String(t.popped).padStart(6),
        pct(t.worth, totalWorth).padStart(11),
        avg(t.worth, t.popped).padStart(9),
        pct(t.power, t.worth).padStart(11),
        avg(t.phaseWorth[0], t.phasePopped[0]).padStart(9),
        avg(t.phaseWorth[1], t.phasePopped[1]).padStart(7),
        avg(t.phaseWorth[2], t.phasePopped[2]).padStart(8),
      ].join('  '),
    );
  }
  console.log(
    '\nworth-share = of all worth popped; power-share = of the colour’s worth, earned by its power',
  );
  console.log('early/mid/late = average worth per popped tile in each third of the run');
}

main();
