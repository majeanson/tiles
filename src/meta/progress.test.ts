import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import {
  EMPTY_PROGRESS,
  PERKS,
  UPGRADES,
  applyProgress,
  buy,
  decodeProgress,
  encodeProgress,
  equip,
  grantFind,
  levelOf,
  priceOf,
  slotsOf,
  type PerkId,
  type Progress,
  type UpgradeId,
} from './progress';

/**
 * The roguelite layer (2026-08-15, reshaped 2026-08-18). Relics buy boring
 * permanent upgrades; PERKS are found in the world, never bought, and exactly
 * one is carried. These pin the shop's arithmetic, the grant's determinism
 * and the migration from the bought-perks era; whether the prices are right
 * is a question for play.
 */

const upgrade = (id: UpgradeId) => {
  const found = UPGRADES.find((u) => u.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

const withRelics = (relics: number): Progress => ({ ...EMPTY_PROGRESS, relics });
const withPerks = (found: PerkId[], equipped: PerkId[] = []): Progress => ({
  ...EMPTY_PROGRESS,
  found,
  equipped,
});

describe('the shop', () => {
  it('charges, and charges more for each level after', () => {
    const purse = upgrade('tiles');
    let progress = withRelics(1000);

    expect(priceOf(progress, purse)).toBe(purse.cost);
    progress = buy(progress, purse);
    expect(progress.relics).toBe(1000 - purse.cost);
    expect(levelOf(progress, 'tiles')).toBe(1);

    // Second level costs double, so the boring upgrades stop being the
    // obvious purchase before the shop's expensive half is unreachable.
    expect(priceOf(progress, purse)).toBe(purse.cost * 2);
  });

  it('refuses what cannot be paid for, and changes nothing', () => {
    const broke = withRelics(1);
    expect(buy(broke, upgrade('world'))).toBe(broke);
  });

  it('stops at the last level', () => {
    let progress = withRelics(100_000);
    const purse = upgrade('tiles');
    for (let i = 0; i < purse.levels; i++) progress = buy(progress, purse);

    expect(levelOf(progress, 'tiles')).toBe(purse.levels);
    expect(priceOf(progress, purse)).toBeNull();
    expect(buy(progress, purse)).toBe(progress);
  });

  it('sells no perks — the shelf is filled by walking, not buying', () => {
    const forSale = new Set<string>(UPGRADES.map((u) => u.id));
    for (const perk of PERKS) expect(forSale.has(perk.id)).toBe(false);
  });
});

describe('perks: found, and one worn', () => {
  it('carries exactly one perk, with the second slot gone for good', () => {
    expect(slotsOf()).toBe(1);
  });

  it('equips a found perk, replacing whatever was worn', () => {
    const progress = withPerks(['rootbound', 'stonewalker'], ['rootbound']);
    expect(equip(progress, 'stonewalker').equipped).toEqual(['stonewalker']);
  });

  it('will not equip what has not been found', () => {
    const progress = withPerks(['rootbound']);
    expect(equip(progress, 'wallbreaker')).toBe(progress);
  });

  it('unequips on a second tap', () => {
    const progress = withPerks(['rootbound'], ['rootbound']);
    expect(equip(progress, 'rootbound').equipped).toEqual([]);
  });
});

describe('the grant a hidden find makes', () => {
  it('is deterministic in (world, hex) — a replay of the walk grants the same perk', () => {
    const a = grantFind(EMPTY_PROGRESS, 77, '12,-3');
    const b = grantFind(EMPTY_PROGRESS, 77, '12,-3');
    expect(a?.perk.id).toBe(b?.perk.id);

    // A different hex on the same world may grant differently — pin only that
    // the pick actually reads its inputs, across a handful of hexes.
    const picks = new Set(
      ['12,-3', '4,9', '-8,2', '20,20', '3,-14'].map(
        (k) => grantFind(EMPTY_PROGRESS, 77, k)?.perk.id,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('grants only what is not yet owned', () => {
    const owned: PerkId[] = ['rootbound', 'secondwind', 'stonewalker', 'wallbreaker'];
    for (let hex = 0; hex < 20; hex++) {
      const granted = grantFind(withPerks(owned), 5, `${hex},0`);
      expect(granted?.perk.id).toBe('openhand');
    }
  });

  it('grants nothing when everything is owned — the vault can be empty', () => {
    const all = withPerks(PERKS.map((p) => p.id));
    expect(grantFind(all, 5, '9,9')).toBeNull();
  });

  it('auto-equips into an empty slot, and never over a worn perk', () => {
    const bare = grantFind(EMPTY_PROGRESS, 77, '12,-3');
    expect(bare?.progress.equipped).toEqual([bare?.perk.id]);

    const wearing = grantFind(withPerks(['rootbound'], ['rootbound']), 77, '12,-3');
    expect(wearing?.progress.equipped).toEqual(['rootbound']);
    expect(wearing?.progress.found).toContain(wearing?.perk.id);
  });
});

describe('what the upgrades do to a run', () => {
  it('leaves the economy alone when nothing has been bought', () => {
    expect(applyProgress(TUNING, EMPTY_PROGRESS)).toEqual({
      ...TUNING,
      rootboundOnly: false,
      secondWindTiles: 0,
      secondWindChance: 0,
    });
  });

  it('deepens the purse, five tiles a level', () => {
    let progress = withRelics(1000);
    progress = buy(progress, upgrade('tiles'));
    progress = buy(progress, upgrade('tiles'));

    const t = applyProgress(TUNING, progress);
    expect(t.startingTiles).toBe(TUNING.startingTiles + 10);
  });

  it('sharpens the nose two hexes a level, and never out to the beacons', () => {
    const maxed: Progress = { ...EMPTY_PROGRESS, bought: { sense: 3 } };
    const t = applyProgress(TUNING, maxed);
    expect(t.findSense).toBe(6);
    // A shimmer that reaches the beacon horizon is a beacon with extra steps.
    expect(t.findSense).toBeLessThan(TUNING.beaconHorizon);
  });

  it('only switches a perk on when it is WORN, not merely found', () => {
    const owned = withPerks(['rootbound', 'secondwind'], ['rootbound']);
    const worn = applyProgress(TUNING, owned);
    expect(worn.rootboundOnly).toBe(true);
    expect(worn.secondWindTiles).toBe(0);

    const swapped = applyProgress(TUNING, equip(owned, 'secondwind'));
    expect(swapped.rootboundOnly).toBe(false);
    expect(swapped.secondWindChance).toBe(0.5);
  });

  it('maps each found perk to its dials', () => {
    const dial = (id: PerkId) => applyProgress(TUNING, withPerks([id], [id]));
    expect(dial('stonewalker').stoneDiscount).toBe(1);
    expect(dial('wallbreaker').wallBuildCostMult).toBe(2);
    expect(dial('openhand').draftWidth).toBe(5);
    expect(dial('openhand').holdSlots).toBe(0);
    // And none of them leaks into the others' dials.
    expect(dial('stonewalker').wallBuildCostMult).toBe(TUNING.wallBuildCostMult);
    expect(dial('wallbreaker').stoneDiscount).toBe(TUNING.stoneDiscount);
  });
});

describe('storage', () => {
  it('round-trips', () => {
    let progress = buy(withRelics(1000), upgrade('tiles'));
    progress = { ...progress, found: ['stonewalker'], equipped: ['stonewalker'] };
    expect(decodeProgress(encodeProgress(progress))).toEqual(progress);
  });

  it('starts empty on nothing, on rubbish, and on the wrong shape', () => {
    expect(decodeProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(decodeProgress('not json')).toEqual(EMPTY_PROGRESS);
    expect(decodeProgress('[1,2,3]')).toEqual(EMPTY_PROGRESS);
    expect(decodeProgress('{"relics":"lots","bought":{}}')).toEqual(EMPTY_PROGRESS);
  });

  it('drops upgrades it has never heard of rather than carrying them', () => {
    const decoded = decodeProgress('{"relics":10,"bought":{"wings":3,"tiles":2},"equipped":[]}');
    expect(decoded.bought).toEqual({ tiles: 2 });
    expect(decoded.relics).toBe(10);
  });

  /**
   * The bought-perks era (before 2026-08-18): perks lived in `bought` beside
   * the upgrades, and 400 relics bought a second slot. Anyone who paid keeps
   * what they paid for — perks stay owned, the deleted slot comes back as its
   * exact price — and the one slot that exists now decides what stays worn.
   */
  it('keeps bought perks as found ones', () => {
    const decoded = decodeProgress(
      '{"relics":50,"bought":{"rootbound":1,"secondwind":1,"tiles":2},"equipped":["rootbound"]}',
    );
    expect([...decoded.found].sort()).toEqual(['rootbound', 'secondwind']);
    expect(decoded.bought).toEqual({ tiles: 2 });
    expect(decoded.equipped).toEqual(['rootbound']);
  });

  it('refunds the deleted second slot at its exact price', () => {
    const decoded = decodeProgress('{"relics":25,"bought":{"slot":1},"equipped":[]}');
    expect(decoded.relics).toBe(425);
    expect(decoded.bought).toEqual({});
  });

  it('clamps a two-perk loadout to the one slot there is', () => {
    const decoded = decodeProgress(
      '{"relics":0,"bought":{"rootbound":1,"secondwind":1,"slot":1},"equipped":["rootbound","secondwind"]}',
    );
    expect(decoded.equipped).toEqual(['rootbound']);
    expect(decoded.relics).toBe(400);
  });

  it('refuses to wear what is not owned', () => {
    const decoded = decodeProgress(
      '{"relics":0,"bought":{},"found":["stonewalker"],"equipped":["wallbreaker"]}',
    );
    expect(decoded.equipped).toEqual([]);
    expect(decoded.found).toEqual(['stonewalker']);
  });
});

describe('the shop climbs back to what the rebalance took', () => {
  /**
   * Marc, 2026-08-16: tone the early game down "so after a few runs with
   * bought relics item its back to what it is now". The floor came down —
   * fewer starting tiles, thinner destinations, poorer caches — so the shop
   * has to be able to put all three back, or the toning down is just a nerf.
   *
   * Named once rather than repeated as bare literals across the assertions
   * below. `cachePaysBase` is a maxed RICHER WORLDS' base cache payout;
   * `cachePays` is what a ring-2 cache reaches from it (base plus two rings'
   * bonus) and is also the pre-2026-08-18 flat payout that graded formula
   * restores — the doorstep cache stays a snack on purpose. `baseCostRisesEvery`
   * is TODAY's climb rate (what a fresh shop, nothing bought, plays under);
   * `maxedCostRisesEvery` and `startingTiles` are what the 2026-08-16/18
   * rebalances moved those two numbers DOWN from, and STEADY PACE's job is to
   * buy the climb rate back up to its old value.
   */
  const PRE_REBALANCE = {
    cachePaysBase: 18,
    cachePays: 26,
    baseCostRisesEvery: 22,
    maxedCostRisesEvery: 30,
    startingTiles: 30,
  };

  const maxed = (id: UpgradeId): Progress => ({
    ...EMPTY_PROGRESS,
    bought: { [id]: UPGRADES.find((u) => u.id === id)?.levels ?? 0 },
  });

  it('returns a ring-2 cache to the tiles caches paid before', () => {
    // Cache value is graded by distance since 2026-08-18, so the restoration
    // moved outward with it: maxed base, plus two rings' bonus, is the
    // pre-rebalance total. The doorstep cache stays a snack on purpose.
    const t = applyProgress(TUNING, maxed('world'));
    expect(t.cachePays).toBe(PRE_REBALANCE.cachePaysBase);
    expect(t.cachePays + 2 * t.cachePaysPerRing).toBe(PRE_REBALANCE.cachePays);
  });

  it('returns the cost curve to what it climbed at before', () => {
    // STEADY PACE exists so the 2026-08-18 steepening is a ladder rather
    // than a nerf: +2 a level, four levels, the old curve exactly.
    expect(applyProgress(TUNING, EMPTY_PROGRESS).costRisesEvery).toBe(
      PRE_REBALANCE.baseCostRisesEvery,
    );
    expect(applyProgress(TUNING, maxed('pace')).costRisesEvery).toBe(
      PRE_REBALANCE.maxedCostRisesEvery,
    );
  });

  it('puts destination density back past where it was', () => {
    // 0.70 was the density before the rebalance; maxed RICHER WORLDS exceeds it.
    expect(applyProgress(TUNING, maxed('world')).destinationChance).toBeGreaterThan(0.7);
  });

  it('puts the purse back past the old start', () => {
    expect(applyProgress(TUNING, maxed('tiles')).startingTiles).toBeGreaterThan(
      PRE_REBALANCE.startingTiles,
    );
  });

  it('starts every player below all of it, which is the point', () => {
    const fresh = applyProgress(TUNING, EMPTY_PROGRESS);
    expect(fresh.startingTiles).toBeLessThan(PRE_REBALANCE.startingTiles);
    expect(fresh.cachePays).toBeLessThan(PRE_REBALANCE.cachePays);
    expect(fresh.destinationChance).toBeLessThan(0.7);
    expect(fresh.costRisesEvery).toBeLessThan(PRE_REBALANCE.maxedCostRisesEvery);
  });
});
