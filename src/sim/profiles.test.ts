import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { EMPTY_PROGRESS, PERKS, UPGRADES, applyProgress, type Progress } from '@meta/progress';
import { chooser, farm, greedy, timid, tourist, bank20 } from './policy';
import { playMany } from './run';
import { summarise } from './report';

/**
 * Player profiles and the progression ladder (2026-08-20, Marc's launch
 * ask: "test for balance and different profiles of players").
 *
 * `sim.test.ts` guards the economy's SHAPE with strategy probes; this file
 * guards it for KINDS OF HANDS — the caricatures most likely to hold a
 * stranger's first link — and across the shop ladder a device climbs over
 * weeks. Same contract as its sibling: small seed counts on purpose (these
 * pin structure, not numbers — `pnpm sim` is for numbers), wide margins so
 * a legitimate rebalance does not trip them, and every assertion states a
 * claim a designer would want to KNOW broke.
 */

const SEEDS = 6;
const stats = (policy: typeof timid, tuning: Tuning = TUNING): ReturnType<typeof summarise> =>
  summarise(policy.name, playMany(policy, SEEDS, { tuning }));

describe('player profiles — the economy holds for every kind of hands', () => {
  // The termination clause is already pinned for every registered policy in
  // sim.test.ts (the profiles joined POLICIES); everything here is about
  // what KIND of run each profile gets.

  it('makes timidity survivable: the cautious first-timer gets a long run', () => {
    // Marc's own Gate B experience, scripted: mostly-tiles, pop-everything-
    // small. If this line dies fast, a stranger's careful first run is a
    // punishment and the teaching pack is teaching the wrong game. At 200
    // seeds timid lives 97 placements over 31 harvests — a real expedition,
    // not a stay of execution. (Its margin over greedy is only ~25%, which
    // was itself a finding: the caches keep even a greedy line alive for a
    // while, so caution buys length but not an epoch — pinned loosely here
    // so a rebalance that KILLS the careful line is what trips it.)
    const cautious = stats(timid);
    expect(cautious.medianPlacements).toBeGreaterThan(60);
    expect(cautious.medianHarvests).toBeGreaterThanOrEqual(10);
  });

  it('makes greed fail faster than packing, but legibly — a lesson, not a wall', () => {
    // Popping everything as points the moment it ripens must end the run
    // sooner than a packer's (78 vs 114 placements at 200 seeds) yet still
    // put a number on the end screen: a zero-score death reads as a broken
    // game, not a mistake. Compared against `farm` rather than `timid` —
    // the packer's margin is wide enough to hold at six seeds.
    const child = stats(greedy);
    const packer = stats(farm);
    expect(child.tilesShare).toBe(0);
    expect(child.medianPlacements).toBeLessThan(packer.medianPlacements * 0.9);
    expect(child.bestPoints).toBeGreaterThan(0);
  });

  it('pays the wanderer in distance, which is the score-vs-feel ruling as a pin', () => {
    // Walking out every turn must out-REACH the nester by a distance (22 vs
    // 10 at 200 seeds) — the plane has to be worth crossing for the player
    // whose score is the horizon. The wanderer's run is SHORT (a chain
    // encloses nothing, so nothing ever ripens — the beeline lesson from
    // P1, still true) and that is the honest shape: reach is what the
    // walk buys, not length and not points.
    const walker = stats(tourist);
    const nester = stats(timid);
    expect(walker.medianReach).toBeGreaterThan(nester.medianReach);
    expect(walker.medianPoints).toBeLessThan(nester.medianPoints * 2);
  });

  it('lets the veteran probe out-score every naive profile', () => {
    // `chooser` prices every pocket both ways — the player who has
    // understood the game. If a caricature matches it, understanding the
    // game is worth nothing and the depth is decoration. At 200 seeds the
    // veteran holds 1402 against 1034/880/582; the greedy and wandering
    // margins are wide enough to pin outright, the timid one is pinned at
    // "keeps up" so six noisy seeds cannot cry wolf.
    const veteran = stats(chooser);
    expect(veteran.medianPoints).toBeGreaterThan(stats(greedy).medianPoints);
    expect(veteran.medianPoints).toBeGreaterThan(stats(tourist).medianPoints);
    expect(veteran.medianPoints).toBeGreaterThanOrEqual(stats(timid).medianPoints * 0.7);
  });
});

describe('balance across the progression ladder', () => {
  const MAXED: Progress = {
    ...EMPTY_PROGRESS,
    bought: Object.fromEntries(UPGRADES.map((u) => [u.id, u.levels])),
  };

  it('keeps run one a real game — the lean start is lean, not cruel', () => {
    // A fresh device plays bare TUNING. Competent play on it must still be
    // a substantial run: the 2026-08-18 rebalance chose a lean start that
    // the caches fund outward, and the debrief called it fun — this pin is
    // what "lean did not read as punishing" looks like to the harness.
    const fresh = stats(bank20);
    expect(fresh.medianPlacements).toBeGreaterThan(60);
    expect(fresh.medianPoints).toBeGreaterThan(0);
  });

  it('makes the maxed shop worth its relics: the ladder pays in points and reach', () => {
    // Every upgrade at its cap, played by the same hands. If the fully
    // bought ladder does not clearly beat run one, weeks of banked relics
    // bought nothing and the roguelite is a lie.
    const fresh = stats(bank20);
    const maxed = stats(bank20, applyProgress(TUNING, MAXED));
    expect(maxed.medianPoints).toBeGreaterThan(fresh.medianPoints);
    expect(maxed.medianReach).toBeGreaterThanOrEqual(fresh.medianReach);
    expect(maxed.medianPlacements).toBeGreaterThan(fresh.medianPlacements);
  });

  it('lets every perk be worn without breaking a run', () => {
    // One perk at a time, each over real seeds: a perk may bend the
    // economy (that is what a perk is for) but must never stall it, cap
    // it, or reduce it to a non-game. Guards the dials' interactions the
    // per-perk unit tests cannot see.
    for (const perk of PERKS) {
      const worn: Progress = { ...EMPTY_PROGRESS, found: [perk.id], equipped: [perk.id] };
      const s = summarise(perk.id, playMany(farm, 4, { tuning: applyProgress(TUNING, worn) }));
      expect({ perk: perk.id, stalled: s.stalled, capped: s.capped }).toEqual({
        perk: perk.id,
        stalled: 0,
        capped: 0,
      });
      expect(s.medianPlacements).toBeGreaterThan(20);
    }
  });
});
