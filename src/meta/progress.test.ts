import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import {
  EMPTY_PROGRESS,
  UPGRADES,
  applyProgress,
  buy,
  decodeProgress,
  encodeProgress,
  equip,
  levelOf,
  priceOf,
  slotsOf,
  type Progress,
  type UpgradeId,
} from './progress';

/**
 * The roguelite layer (2026-08-15). Relics buy permanent upgrades that carry
 * into every world, spent on the end screen. These pin the shop's arithmetic
 * and its refusals; whether the prices are right is a question for play.
 */

const upgrade = (id: UpgradeId) => {
  const found = UPGRADES.find((u) => u.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

const withRelics = (relics: number): Progress => ({ ...EMPTY_PROGRESS, relics });

describe('the shop', () => {
  it('charges, and charges more for each level after', () => {
    const purse = upgrade('tiles');
    let progress = withRelics(1000);

    expect(priceOf(progress, purse)).toBe(purse.cost);
    progress = buy(progress, purse);
    expect(progress.relics).toBe(1000 - purse.cost);
    expect(levelOf(progress, 'tiles')).toBe(1);

    // Second level costs double, so the boring upgrades stop being the
    // obvious purchase before the interesting half of the shop is unreachable.
    expect(priceOf(progress, purse)).toBe(purse.cost * 2);
  });

  it('refuses what cannot be paid for, and changes nothing', () => {
    const broke = withRelics(1);
    expect(buy(broke, upgrade('rootbound'))).toBe(broke);
  });

  it('stops at the last level', () => {
    let progress = withRelics(100_000);
    const purse = upgrade('tiles');
    for (let i = 0; i < purse.levels; i++) progress = buy(progress, purse);

    expect(levelOf(progress, 'tiles')).toBe(purse.levels);
    expect(priceOf(progress, purse)).toBeNull();
    expect(buy(progress, purse)).toBe(progress);
  });
});

describe('perks and slots', () => {
  it('equips a perk the moment it is bought, so the relics visibly did something', () => {
    const progress = buy(withRelics(1000), upgrade('rootbound'));
    expect(progress.equipped).toEqual(['rootbound']);
  });

  it('carries one perk until the second slot is bought', () => {
    let progress = buy(withRelics(1000), upgrade('rootbound'));
    progress = buy(progress, upgrade('secondwind'));

    expect(slotsOf(progress)).toBe(1);
    expect(progress.equipped).toEqual(['rootbound']);

    // Owned but not worn: the choice is which one, which is what makes the
    // slot worth 400 relics.
    expect(levelOf(progress, 'secondwind')).toBe(1);
    expect(equip(progress, 'secondwind').equipped).toEqual(['secondwind']);
  });

  it('carries both once the slot is bought', () => {
    let progress = buy(withRelics(2000), upgrade('rootbound'));
    progress = buy(progress, upgrade('secondwind'));
    progress = buy(progress, upgrade('slot'));

    expect(slotsOf(progress)).toBe(2);
    expect(equip(progress, 'secondwind').equipped).toEqual(['rootbound', 'secondwind']);
  });

  it('will not equip what is not owned', () => {
    const progress = withRelics(1000);
    expect(equip(progress, 'rootbound')).toBe(progress);
  });

  it('unequips on a second tap', () => {
    const progress = buy(withRelics(1000), upgrade('rootbound'));
    expect(equip(progress, 'rootbound').equipped).toEqual([]);
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

  it('only switches a perk on when it is EQUIPPED, not merely owned', () => {
    let progress = buy(withRelics(1000), upgrade('rootbound'));
    progress = buy(progress, upgrade('secondwind'));

    const worn = applyProgress(TUNING, progress);
    expect(worn.rootboundOnly).toBe(true);
    expect(worn.secondWindTiles).toBe(0);

    const swapped = applyProgress(TUNING, equip(progress, 'secondwind'));
    expect(swapped.rootboundOnly).toBe(false);
    expect(swapped.secondWindChance).toBe(0.5);
  });
});

describe('storage', () => {
  it('round-trips', () => {
    let progress = buy(withRelics(1000), upgrade('rootbound'));
    progress = buy(progress, upgrade('tiles'));
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

  it('refuses to wear more perks than there are slots', () => {
    const decoded = decodeProgress(
      '{"relics":0,"bought":{"rootbound":1,"secondwind":1},"equipped":["rootbound","secondwind"]}',
    );
    expect(decoded.equipped).toEqual(['rootbound']);
  });
});

describe('the shop climbs back to what the rebalance took', () => {
  /**
   * Marc, 2026-08-16: tone the early game down "so after a few runs with
   * bought relics item its back to what it is now". The floor came down —
   * fewer starting tiles, thinner destinations, poorer caches — so the shop
   * has to be able to put all three back, or the toning down is just a nerf.
   */
  const maxed = (id: UpgradeId): Progress => ({
    relics: 0,
    bought: { [id]: UPGRADES.find((u) => u.id === id)?.levels ?? 0 },
    equipped: [],
  });

  it('returns a ring-2 cache to the 26 tiles caches paid before', () => {
    // Cache value is graded by distance since 2026-08-18, so the restoration
    // moved outward with it: maxed base 18, plus two rings' bonus, is the
    // pre-rebalance 26. The doorstep cache stays a snack on purpose.
    const t = applyProgress(TUNING, maxed('world'));
    expect(t.cachePays).toBe(18);
    expect(t.cachePays + 2 * t.cachePaysPerRing).toBe(26);
  });

  it('returns the cost curve to the 30 it climbed at before', () => {
    // STEADY PACE exists so the 2026-08-18 steepening (30 -> 22) is a ladder
    // rather than a nerf: +2 a level, four levels, the old curve exactly.
    expect(applyProgress(TUNING, EMPTY_PROGRESS).costRisesEvery).toBe(22);
    expect(applyProgress(TUNING, maxed('pace')).costRisesEvery).toBe(30);
  });

  it('puts destination density back past where it was', () => {
    // 0.70 was the density before the rebalance; maxed RICHER WORLDS exceeds it.
    expect(applyProgress(TUNING, maxed('world')).destinationChance).toBeGreaterThan(0.7);
  });

  it('puts the purse back past 30, which was the old start', () => {
    expect(applyProgress(TUNING, maxed('tiles')).startingTiles).toBeGreaterThan(30);
  });

  it('starts every player below all of it, which is the point', () => {
    const fresh = applyProgress(TUNING, EMPTY_PROGRESS);
    expect(fresh.startingTiles).toBeLessThan(30);
    expect(fresh.cachePays).toBeLessThan(26);
    expect(fresh.destinationChance).toBeLessThan(0.7);
    expect(fresh.costRisesEvery).toBeLessThan(30);
  });
});
