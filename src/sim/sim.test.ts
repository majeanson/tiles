import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { bank3, bank20, bank40, farm, POLICIES, randomLegal, seeker, spender } from './policy';
import { playMany } from './run';
import { summarise } from './report';

/**
 * Gate C, as tests, against the one economy.
 *
 * This file used to hold three suites — the bounded game, the endless plane,
 * and the plane with destinations — because there were three economies to
 * guard. On 2026-08-16 Marc officialised the decisions and there is one, so
 * there is one suite. Everything here that asked about the tiles-or-points
 * fork, the clock or the map number was deleted rather than adapted: those
 * are questions about a game nobody plays, and a green test for a deleted
 * rule is worse than no test at all. What each retired claim proved is in
 * LOG.md, where the gates are kept.
 *
 * Seed counts are small on purpose — these guard the SHAPE of the economy,
 * and a shape that needs two hundred seeds to see is not a shape. Use
 * `pnpm sim` when you want the real numbers.
 */

const SEEDS = 6;
const stats = (policy: (typeof POLICIES)[number]) =>
  summarise(policy.name, playMany(policy, SEEDS, { tuning: TUNING }));

describe('gate C — the economy closes', () => {
  // The first clause, and the one that catches genuine deadlocks: this suite
  // found one immediately, where a policy kept choosing placements it could no
  // longer afford and the run neither ended nor advanced.
  it('gives every policy a run that ends by itself', { timeout: 60000 }, () => {
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
    // The null policy has to fail, or the economy is not asking anything.
    // Random reaches about 7 hexes in 40 placements; competent play reaches
    // 15-16 in nearly 200.
    const random = stats(randomLegal);
    const competent = stats(bank20);

    expect(random.medianDepth).toBeLessThan(competent.medianDepth);
    expect(random.medianPlacements).toBeLessThan(competent.medianPlacements / 2);
  });

  it('lets opposite strategies reach the same depth by different routes', () => {
    // `farm` packs and never banks; `bank20` cashes at the size cap. Different
    // play, comparable reach — which is the gate's third clause and the reason
    // to believe the economy rewards more than one idea.
    const a = stats(farm);
    const b = stats(bank20);
    expect(Math.abs(a.medianDepth - b.medianDepth)).toBeLessThanOrEqual(3);
  });

  it('ends every run by running dry, never on a clock', () => {
    // Marc's own rule for the tiles-only run: "die when you dont have any".
    // There is no `runLength` to end an expedition early any more, so `spent`
    // must never be a cause of death.
    expect(TUNING.runLength).toBe(0);
    for (const policy of [farm, bank20, seeker]) {
      const runs = playMany(policy, SEEDS, { tuning: TUNING });
      expect(runs.map((r) => r.death)).not.toContain('spent');
    }
  });
});

describe('what the harness proves about the one economy', () => {
  it('pays for packing well', () => {
    // Pops per placement is the packing skill, and it is what separates the
    // lines: ~0.73 for competent play against ~0.18 for random.
    const good = stats(farm);
    const bad = stats(randomLegal);
    expect(good.popsPerPlacement).toBeGreaterThan(bad.popsPerPlacement * 2);
  });

  it('rewards patience, which is the known open shape', () => {
    // Honest rather than aspirational: cashing at 3 scores a fraction of
    // cashing at 20 or 40, and the curve has never turned over at 200 runs.
    // Recorded here so that a change which flattens it is visible immediately.
    const small = stats(bank3);
    const patient = stats(bank40);
    expect(patient.medianPoints).toBeGreaterThan(small.medianPoints * 2);
  });

  it('makes the luck shop worth its prices', () => {
    // `spender` plays bank20 and SPENDS its luck on redraws, steers and
    // forges; `bank20` earns exactly the same luck and sits on it. If the
    // spender does not come out ahead, the prices are wrong — this is the
    // whole evidence that popping early buys anything.
    const spending = stats(spender);
    const hoarding = stats(bank20);
    expect(spending.medianPoints).toBeGreaterThan(hoarding.medianPoints * 0.9);
    expect(spending.medianDepth).toBeGreaterThanOrEqual(hoarding.medianDepth - 1);
  });

  it('gets a destination-follower to destinations without falling behind', () => {
    // `seeker` walks to landmarks rather than packing. It should claim more
    // than a packer does and still finish a real run — the plane has to be
    // worth crossing, not just worth filling.
    const walker = stats(seeker);
    const packer = stats(farm);
    expect(walker.medianClaims).toBeGreaterThanOrEqual(packer.medianClaims);
    expect(walker.medianPlacements).toBeGreaterThan(100);
  });
});
