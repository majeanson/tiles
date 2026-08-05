import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import {
  bank15,
  bank3,
  bank40,
  bank80,
  blind,
  farm,
  hoard,
  POLICIES,
  randomLegal,
  rush,
  survivor,
} from './policy';
import { playMany } from './run';
import { summarise } from './report';

/**
 * Gate C, as tests.
 *
 * The gate says the economy closes when no scripted policy runs forever,
 * `random-legal` dies early, and two policies reach comparable depth by
 * different routes. Those are checkable, so they are checked here rather than
 * being re-eyeballed off a table every time a number moves.
 *
 * Seed counts are small on purpose — these guard the SHAPE of the economy, and
 * a shape that needs two hundred seeds to see is not a shape. Use `pnpm sim`
 * when you want the real numbers.
 */

const SEEDS = 6;
const stats = (policy: (typeof POLICIES)[number]) =>
  summarise(policy.name, playMany(policy, SEEDS, { tuning: TUNING }));

describe('gate C — the economy closes', () => {
  // The first clause, and the one that catches genuine deadlocks: this suite
  // found one immediately, where a policy kept choosing placements it could no
  // longer afford and the run neither ended nor advanced.
  it('gives every policy a run that ends by itself', () => {
    for (const policy of POLICIES) {
      const s = stats(policy);
      expect({ policy: policy.name, stalled: s.stalled, capped: s.capped }).toEqual({
        policy: policy.name,
        stalled: 0,
        capped: 0,
      });
    }
  });

  it('kills random play early', () => {
    const random = stats(randomLegal);
    const skilled = stats(farm);
    expect(random.medianDepth).toBeLessThanOrEqual(2);
    expect(random.medianDepth).toBeLessThan(skilled.medianDepth);
  });

  // Rush and farm are opposite strategies — forty placements against three
  // hundred — and land on the same map. Depth is reachable by more than one
  // route, which is the gate's third clause.
  it('lets opposite strategies reach the same depth', () => {
    const quick = stats(rush);
    const slow = stats(farm);
    expect(Math.abs(quick.medianDepth - slow.medianDepth)).toBeLessThanOrEqual(1);
    expect(quick.medianPlacements * 3).toBeLessThan(slow.medianPlacements);
  });
});

describe('what the harness proved about the design', () => {
  // Gate B territory: if tiles and points were secretly the same currency, a
  // policy that only ever banks tiles would still score. It scores nothing, and
  // one that only ever banks points dies on the first map. The mixture is what
  // survives, so the payout choice is load-bearing rather than decorative.
  it('makes the tiles-or-points choice load-bearing', () => {
    const onlyTiles = stats(survivor);
    const onlyPoints = stats(hoard);
    const mixed = stats(farm);

    expect(onlyTiles.medianPoints).toBe(0);
    expect(onlyTiles.medianDepth).toBeGreaterThan(mixed.medianDepth);

    expect(onlyPoints.medianDepth).toBe(1);
    expect(mixed.medianPoints).toBeGreaterThan(onlyPoints.medianPoints);
  });

  // Placing with an eye on colour beats placing anywhere legal by more than an
  // order of magnitude. Without this the board would be a formality.
  it('pays for packing well', () => {
    expect(stats(farm).medianPoints).toBeGreaterThan(stats(blind).medianPoints * 10);
  });

  /**
   * DESIGN.md's "what is fragile", now answered: banking every pop until the map
   * is finished beats harvesting as you go, and NOT only because points scale
   * with harvest size. `trickle` and `farm` differ in nothing but when they cash
   * in, and farm wins even with the size bonus turned off entirely, because
   * popped tiles become stone and stone never matches — an early harvest poisons
   * the worth of everything placed next to it afterwards.
   *
   * So rule 5's timing decision is fake ON THE BOUNDED MAP, and stays pinned as
   * fake here. The endless world below is the structural fix being auditioned —
   * see `ideas/endless-world.md`, and the suite after this one for what changed.
   */
  it('has no reason to harvest early — the known open problem', () => {
    const late = summarise('farm', playMany(farm, SEEDS, { tuning: TUNING }));
    const early = summarise('trickle', playMany(trickleAt(), SEEDS, { tuning: TUNING }));
    expect(late.medianPoints).toBeGreaterThan(early.medianPoints * 3);

    const flat = { ...TUNING, harvestSizeBonus: 0 };
    const lateFlat = summarise('farm', playMany(farm, SEEDS, { tuning: flat }));
    const earlyFlat = summarise('trickle', playMany(trickleAt(), SEEDS, { tuning: flat }));
    expect(lateFlat.medianPoints).toBeGreaterThan(earlyFlat.medianPoints);
  });
});

function trickleAt() {
  const found = POLICIES.find((p) => p.name === 'trickle');
  if (found === undefined) throw new Error('trickle policy missing');
  return found;
}

/**
 * P1 of `ideas/endless-world.md`, answered.
 *
 * The question written down before building: does local cluster harvest on an
 * unbounded plane, with a distance multiplier, make harvest TIMING a real
 * decision? The `bank<N>` policies differ only in how big they let their best
 * pocket grow before cashing it, which makes N the timing dial in isolation.
 */
describe('the endless world — P1', () => {
  const ENDLESS: Tuning = { ...TUNING, world: 'endless' };

  // Endless runs are longer than bounded ones and the frontier scan is dearer,
  // so each policy is played once and the claims below share the result.
  const summaries = new Map<string, ReturnType<typeof summarise>>();
  const endless = (policy: (typeof POLICIES)[number]) => {
    let s = summaries.get(policy.name);
    if (s === undefined) {
      s = summarise(policy.name, playMany(policy, SEEDS, { tuning: ENDLESS }));
      summaries.set(policy.name, s);
    }
    return s;
  };

  it('gives every policy a run that ends by itself there too', { timeout: 30000 }, () => {
    for (const policy of POLICIES) {
      const s = endless(policy);
      expect({ policy: policy.name, stalled: s.stalled, capped: s.capped }).toEqual({
        policy: policy.name,
        stalled: 0,
        capped: 0,
      });
    }
  });

  /**
   * The answer: timing has an interior optimum with a cliff past it.
   *
   * Banking bigger pays quadratically — up to the pocket size the cost curve
   * lets you sustain. Past that, the pocket is never finished and the run dies
   * with its fortune unpopped, scoring zero. Cash too small and you leave a
   * multiple on the table; wait too long and you lose everything. The bounded
   * game had neither slope nor cliff: banking everything was free, and the full
   * map handed you the cash-in moment. Here WHEN is yours to misjudge.
   */
  it('gives harvest timing an interior optimum — with a cliff past it', () => {
    expect(endless(bank15).medianPoints).toBeGreaterThan(endless(bank3).medianPoints * 3);
    expect(endless(bank40).medianPoints).toBeGreaterThan(endless(bank15).medianPoints);
    expect(endless(bank80).medianPoints).toBe(0);
  });

  /**
   * The bounded exploit's exact line — bank until something FORCES a cash-in —
   * stops existing, because the only forced stop left is bankruptcy and at
   * bankruptcy survival always wins the payout choice. `farm` still plays that
   * line, and now scores nothing instead of 43× everything.
   */
  it('no longer pays banking-until-forced at all', () => {
    expect(endless(farm).medianPoints).toBe(0);
  });

  it('keeps the payout choice load-bearing on the plane', () => {
    expect(endless(survivor).medianPoints).toBe(0);
    expect(endless(bank40).medianPoints).toBeGreaterThan(endless(hoard).medianPoints);
  });

  /**
   * P2's answer: terrain enriches without breaking. Native ground raises the
   * worth ceiling and walls cheapen ripening, so the same strategy on the same
   * seeds scores MORE on textured ground than on the bare plane — while the
   * timing structure above (optimum, cliff, dead exploits) holds either way.
   */
  it('pays more on textured ground than on the bare plane', () => {
    const bare: Tuning = { ...ENDLESS, worldWalls: 0, fieldChance: 0 };
    const textured = endless(bank40).medianPoints;
    const flat = summarise('bank40', playMany(bank40, SEEDS, { tuning: bare })).medianPoints;
    expect(textured).toBeGreaterThan(flat);
  });
});
