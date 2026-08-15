import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, TUNING, type Tuning } from '@content/tuning';
import {
  bank15,
  bank20,
  bank3,
  bank40,
  bank80,
  blind,
  chooser,
  farm,
  hoard,
  POLICIES,
  randomLegal,
  rush,
  seeker,
  survivor,
  trickle,
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
   *
   * And the optimum MOVES with the economy: under the launch tuning (40 tiles,
   * curve at 100) it sat near a 40-pocket; the 2026-08-04 re-target (30/70)
   * pulled it to ~15, with 40 already past the cliff on half the seeds. A dial
   * that answers to tuning is a live decision, not a solved one.
   */
  it('gives harvest timing an interior optimum — with a cliff past it', () => {
    expect(endless(bank15).medianPoints).toBeGreaterThan(endless(bank3).medianPoints * 3);
    expect(endless(bank15).medianPoints).toBeGreaterThan(endless(bank80).medianPoints);
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
    expect(endless(bank15).medianPoints).toBeGreaterThan(endless(hoard).medianPoints);
  });

  /**
   * P2's answer: terrain enriches without breaking. Native ground raises the
   * worth ceiling and walls cheapen ripening, so the same strategy on the same
   * seeds scores MORE on textured ground than on the bare plane — while the
   * timing structure above (optimum, cliff, dead exploits) holds either way.
   */
  it('pays more on textured ground than on the bare plane', () => {
    const bare: Tuning = { ...ENDLESS, worldWalls: 0, fieldChance: 0 };
    const textured = endless(bank15).medianPoints;
    const flat = summarise('bank15', playMany(bank15, SEEDS, { tuning: bare })).medianPoints;
    expect(textured).toBeGreaterThan(flat);
  });
});

/**
 * P3b: the SHIPPED endless economy — what `?ff=world.endless` actually plays,
 * destinations and rarity on (`ENDLESS_TUNING`, `pnpm sim --endless`).
 *
 * What the harness can say: nothing stalls, the timing structure survives the
 * new systems, and a compass-following line is competitive while actually
 * claiming destinations. What it cannot say — whether a human WALKS toward a
 * glow, and whether the odds ever flip a points-harvest to tiles — are the two
 * written questions, and they wait on a phone.
 */
describe('the endless world with destinations and rarity — P3b', () => {
  /**
   * More seeds than the other suites on purpose. The Session 8+ powers raised
   * the bank-40 line's variance — roughly half its seeds die on the cliff and
   * half treble the field — so at 6 seeds the MEDIAN lands on whichever side
   * the coin fell. Twelve is the smallest count where the optimum shows
   * through the variance on consecutive seeds; the real table is 40.
   */
  const P3B_SEEDS = 12;

  const summaries = new Map<string, ReturnType<typeof summarise>>();
  const shipped = (policy: (typeof POLICIES)[number]) => {
    let s = summaries.get(policy.name);
    if (s === undefined) {
      s = summarise(policy.name, playMany(policy, P3B_SEEDS, { tuning: ENDLESS_TUNING }));
      summaries.set(policy.name, s);
    }
    return s;
  };

  it('still gives every policy a run that ends by itself', { timeout: 60000 }, () => {
    for (const policy of POLICIES) {
      const s = shipped(policy);
      expect({ policy: policy.name, stalled: s.stalled, capped: s.capped }).toEqual({
        policy: policy.name,
        stalled: 0,
        capped: 0,
      });
    }
  });

  /**
   * The timing decision, under M1's economy: an interior optimum AT THE CAP.
   *
   * The old cliff (bank80 scored zero, dying with its fortune unpopped) was a
   * casualty of the hard clock — a known ending makes one giant cash-in
   * arithmetic rather than a gamble, and bank80 promptly scored 150k. The cap
   * on the size bonus replaces it with a gentler, fairer discipline: past 20
   * a pocket earns worth but no more multiplier, so cashing at the cap beats
   * hoarding. Hoarding is no longer suicide; it is merely worse, which is
   * what a real optimum looks like. See LOG.md, Session 11.
   */
  it('puts the optimum at the size cap, not beyond it', () => {
    const cap = shipped(bank20).medianPoints;
    expect(cap).toBeGreaterThan(shipped(bank3).medianPoints * 3);
    expect(cap).toBeGreaterThanOrEqual(shipped(bank40).medianPoints);
    expect(cap).toBeGreaterThanOrEqual(shipped(bank80).medianPoints);
  });

  /**
   * Gate B's structural evidence, pinned so a future tuning cannot quietly
   * undo it. Before M1 every policy took tiles 94-98% of the time and no
   * content setting moved it, because an economy that ends in bankruptcy
   * makes the marginal harvest a survival harvest by definition. With the
   * hard clock, cache-funded survival and the size cap, lines that harvest as
   * they go now mix. The gate's own verdict still belongs to a human's log —
   * this only proves the choice is available to make.
   */
  it('offers both payouts to a player who harvests as they go', () => {
    for (const policy of [rush, trickle]) {
      const share = shipped(policy).tilesShare;
      expect(share).not.toBeNull();
      expect(share!).toBeLessThanOrEqual(0.7);
      expect(share!).toBeGreaterThanOrEqual(0.3);
    }
  });

  /**
   * Gate D's subject, measured: the run's biggest number lands late. The clock
   * is what guarantees it — a run that ends on a known schedule saves its
   * biggest pocket for the end rather than dribbling value out.
   */
  it('peaks near the end', () => {
    for (const policy of [bank20, chooser, seeker]) {
      expect(shipped(policy).arc).toBeGreaterThanOrEqual(0.55);
    }
  });

  /**
   * The compass is not decoration: a line that drifts toward destinations
   * reaches them — and now that caches fund survival, it reaches MORE of them
   * than anyone else while scoring in the same league.
   */
  it('lets a destination-follower keep pace while actually arriving', () => {
    expect(shipped(seeker).medianClaims).toBeGreaterThanOrEqual(3);
    expect(shipped(seeker).medianPoints * 3).toBeGreaterThan(shipped(bank20).medianPoints);
  });

  it('keeps the never-score line worthless', () => {
    expect(shipped(survivor).medianPoints).toBeLessThan(shipped(bank20).medianPoints / 10);
  });

  it('ends every run on the clock or before it', () => {
    for (const policy of POLICIES) {
      expect(shipped(policy).medianPlacements).toBeLessThanOrEqual(ENDLESS_TUNING.runLength);
    }
  });
});
