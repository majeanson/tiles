import { TUNING, type Tuning } from '../src/content/tuning';
import { POLICIES, policyByName } from '../src/sim/policy';
import { summarise, table } from '../src/sim/report';
import { playMany } from '../src/sim/run';

/**
 * The balance harness, from a terminal.
 *
 *   pnpm sim                          every policy, 200 seeds
 *   pnpm sim --seeds 1000             more confidence, still seconds
 *   pnpm sim --policy farm,hoard      just the comparison you care about
 *   pnpm sim --set costRisesEvery=60  the same runs under a different economy
 *   pnpm sim --set ripeTilesMatch=false
 *   pnpm sim --endless                the SHIPPED endless economy — what
 *                                     ?ff=world.endless actually plays, with
 *                                     destinations and rarity on. `--set
 *                                     world=endless` is the bare plane instead.
 *
 * `--set` is the whole reason tuning is data rather than an import: answering
 * "what does this number do" should cost one command, not an edit and a rebuild.
 */

type Args = {
  seeds: number;
  policies: string[];
  tuning: Tuning;
  changed: string[];
};

/**
 * Apply one `key=value`, typed by what the default value already is.
 *
 * Reading the expected type off `TUNING` rather than off a schema means a new
 * dial is settable the moment it is declared, with no second place to update.
 */
function withSetting(tuning: Tuning, setting: string): Tuning {
  const eq = setting.indexOf('=');
  if (eq < 0) throw new Error(`--set wants key=value, got "${setting}"`);

  const name = setting.slice(0, eq);
  const raw = setting.slice(eq + 1);
  if (!(name in tuning)) throw new Error(`--set: no such tuning key "${name}"`);

  if (typeof tuning[name as keyof Tuning] === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error(`${name} wants true or false`);
    return { ...tuning, [name]: raw === 'true' };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} wants a number, got "${raw}"`);
  return { ...tuning, [name]: value };
}

function parseArgs(argv: readonly string[]): Args {
  // There is one economy now (2026-08-16), so there is no base to select —
  // `--set` overrides apply to it directly.
  const args: Args = {
    seeds: 200,
    policies: [],
    tuning: TUNING,
    changed: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) continue;

    if (flag === '--seeds') {
      args.seeds = Number(value);
      i++;
    } else if (flag === '--policy') {
      args.policies = value.split(',');
      i++;
    } else if (flag === '--set') {
      args.tuning = withSetting(args.tuning, value);
      args.changed.push(value);
      i++;
    }
  }

  if (!Number.isFinite(args.seeds) || args.seeds < 1) throw new Error('--seeds must be positive');
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tuning = args.tuning;

  const chosen =
    args.policies.length === 0
      ? POLICIES
      : args.policies.map((name) => {
          const policy = policyByName(name);
          if (policy === undefined) throw new Error(`no such policy "${name}"`);
          return policy;
        });

  console.log(
    `${args.seeds} seeds per policy` +
      (args.changed.length === 0 ? ' at default tuning' : ` with ${args.changed.join(' ')}`),
  );
  console.log();

  const summaries = chosen.map((policy) =>
    summarise(policy.name, playMany(policy, args.seeds, { tuning })),
  );
  console.log(table(summaries));

  console.log();
  console.log('arc = where the biggest harvest landed, as a fraction of the run');
  console.log('stalled/capped are bugs, not results — both should be 0');

  // A stall is a deadlock the gates would otherwise never surface, so it fails
  // the command rather than printing quietly among the numbers.
  const stuck = summaries.filter((s) => s.stalled > 0 || s.capped > 0);
  if (stuck.length > 0) {
    console.error(`\nFAIL: ${stuck.map((s) => s.policy).join(', ')} did not finish cleanly`);
    process.exitCode = 1;
  }
}

main();
