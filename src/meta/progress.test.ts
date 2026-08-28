import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { PERK_DIALS } from '@content/goals';
import {
  EMPTY_PROGRESS,
  PERKS,
  TEACH_IDS,
  UPGRADES,
  applyProgress,
  buy,
  decodeProgress,
  encodeProgress,
  equip,
  grantFind,
  hasMet,
  levelOf,
  meet,
  priceOf,
  slotsOf,
  withWorldPerks,
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

  /**
   * Every perk explains itself in full (2026-08-27, Marc: "what you gain what
   * you lose style"), and this holds the CLASS rather than the five sentences
   * — the same shape `theme.test.ts` uses on the palette. A sixth perk added
   * later gets the same card or fails here; there is no version of this that
   * ships explained-for-four-of-five, which is the failure mode a hand-written
   * card set actually has.
   */
  it('gives every perk all three lines of its card', () => {
    for (const perk of PERKS) {
      for (const [field, line] of [
        ['gain', perk.gain],
        ['lose', perk.lose],
        ['play', perk.play],
      ] as const) {
        // A whole sentence, not a fragment: these are read as prose beside a
        // reserved mark column, and a dangling clause reads as a bug there.
        expect(`${perk.name}.${field}: ${line}`).toMatch(/: \S.*[.]$/);
      }
      // The cost line is never quietly dropped for the perks that have no
      // cost — "Nothing" is the answer, said out loud.
      expect(perk.lose.length).toBeGreaterThan(0);
      // `play` is advice, so it must not simply restate the dial `gain`
      // already gave.
      expect(perk.play).not.toBe(perk.gain);
    }
  });

  /**
   * The card reads the live dials, like `note` always has. Without this a
   * number could be retuned in `src/content/` and the explanation would go on
   * quoting the old one — the exact staleness `POLISH.md` caught the manual
   * in, one layer down.
   */
  it('quotes the dials rather than hardcoding them', () => {
    const perk = (id: PerkId): (typeof PERKS)[number] => PERKS.find((p) => p.id === id)!;
    expect(perk('stonewalker').gain).toContain(String(PERK_DIALS.stoneDiscount));
    expect(perk('wallbreaker').lose).toContain(String(PERK_DIALS.wallBuildCostMult));
    expect(perk('openhand').gain).toContain(String(PERK_DIALS.openHandDraft));
    expect(perk('secondwind').gain).toContain(String(PERK_DIALS.secondWindTiles));
    expect(perk('secondwind').gain).toContain(`${Math.round(PERK_DIALS.secondWindChance * 100)}%`);
  });

  /**
   * ROOTBOUND's cost is the sharpest edge in the game — `rules.ts` returns a
   * hard 0 for anything off native ground, not a reduction — and the whole
   * reason the card grew a LOSE line. If the sentence ever softens to "less",
   * a player will grow a pocket across two colours and lose all of it.
   */
  it('says ROOTBOUND pays NOTHING off native ground, not less', () => {
    const rootbound = PERKS.find((p) => p.id === 'rootbound')!;
    // Both halves: the word, and the correction that stops it being read as a
    // discount. "Not less" is doing real work in that sentence.
    expect(rootbound.lose).toMatch(/NOTHING/);
    expect(rootbound.lose).toMatch(/not less/i);
    expect(rootbound.play).toMatch(/zero/i);
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
  it('round-trips the three fields the device blob still carries', () => {
    const progress = meet(buy(withRelics(1000), upgrade('tiles')), 'relic');
    expect(decodeProgress(encodeProgress(progress))).toEqual(progress);
  });

  /**
   * The one door everything leaves through (2026-08-26). `found`/`equipped`
   * exist on the in-memory COMPOSITE the shell builds with `withWorldPerks`,
   * and a composite written back whole would smuggle THIS world's shelf into
   * the device blob every OTHER world then reads. So the encoder strips them
   * - that strip is the whole no-leak guarantee, and it is pinned here.
   */
  it('never writes a perk into the device blob, even handed a composite', () => {
    const composite = withWorldPerks(withRelics(40), ['stonewalker', 'openhand'], 'stonewalker');
    const raw = encodeProgress(composite);
    expect(raw).not.toContain('stonewalker');
    expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual(['bought', 'met', 'relics']);
    const back = decodeProgress(raw);
    expect(back.found).toEqual([]);
    expect(back.equipped).toEqual([]);
    expect(back.relics).toBe(40);
  });

  it('folds a world shelf onto the device purse, and wears at most the one', () => {
    const base = buy(withRelics(1000), upgrade('tiles'));
    const composite = withWorldPerks(base, ['stonewalker', 'openhand'], 'openhand');
    expect(composite.relics).toBe(base.relics);
    expect(composite.bought).toEqual(base.bought);
    expect(composite.found).toEqual(['stonewalker', 'openhand']);
    expect(composite.equipped).toEqual(['openhand']);
    // A world wearing nothing is an EMPTY slot, not a slot holding null.
    expect(withWorldPerks(base, ['stonewalker'], null).equipped).toEqual([]);
  });

  it('starts empty on nothing, on rubbish, and on the wrong shape', () => {
    expect(decodeProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(decodeProgress('not json')).toEqual(EMPTY_PROGRESS);
    expect(decodeProgress('[1,2,3]')).toEqual(EMPTY_PROGRESS);
  });

  it('reads a damaged blob as damaged, not as a new device', () => {
    // `{"relics":"lots"}` used to return EMPTY_PROGRESS, which threw away the
    // player's found perks over a malformed number (2026-08-20). It is a real
    // progress blob with an unreadable purse, and it decodes as one: purse
    // zero, and — having no `met` field — the veteran ledger every
    // pre-teaching blob gets, rather than a stranger's empty one.
    const damaged = decodeProgress('{"relics":"lots","bought":{}}');
    expect(damaged.relics).toBe(0);
    expect(damaged.bought).toEqual({});
    expect(damaged.met).toEqual([...TEACH_IDS]);
  });

  it('drops upgrades it has never heard of rather than carrying them', () => {
    const decoded = decodeProgress('{"relics":10,"bought":{"wings":3,"tiles":2},"equipped":[]}');
    expect(decoded.bought).toEqual({ tiles: 2 });
    expect(decoded.relics).toBe(10);
  });

  /**
   * The per-world split's one-way door (2026-08-26, Marc: full reset, every
   * world hunts its perks fresh). A stored `found`/`equipped` — from the
   * device-wide era OR from the bought-perks era before it, where perks
   * lived in `bought` beside the upgrades — is IGNORED, not migrated: the
   * device-wide pool it fed no longer exists. The matching half of the reset
   * lives in `decodeWorld`, which forgets a pre-split world's claimed
   * find-hexes so every perk is out there to walk to again.
   */
  it('ignores a stored shelf rather than migrating it', () => {
    const decoded = decodeProgress(
      '{"relics":50,"bought":{"tiles":2},"found":["stonewalker"],"equipped":["stonewalker"]}',
    );
    expect(decoded.found).toEqual([]);
    expect(decoded.equipped).toEqual([]);
    // Everything the blob holds that is still the DEVICE's survives intact.
    expect(decoded.relics).toBe(50);
    expect(decoded.bought).toEqual({ tiles: 2 });
  });

  it('ignores a bought-era perk purchase too, and keeps the upgrades beside it', () => {
    const decoded = decodeProgress(
      '{"relics":50,"bought":{"rootbound":1,"secondwind":1,"tiles":2},"equipped":["rootbound"]}',
    );
    expect(decoded.found).toEqual([]);
    expect(decoded.equipped).toEqual([]);
    expect(decoded.bought).toEqual({ tiles: 2 });
  });

  /** The refund outlives the perk migration: it is relics, and relics are
   *  still the device's own. */
  it('refunds the deleted second slot at its exact price', () => {
    const decoded = decodeProgress('{"relics":25,"bought":{"slot":1},"equipped":[]}');
    expect(decoded.relics).toBe(425);
    expect(decoded.bought).toEqual({});
  });

  it('refunds the slot even in a blob whose shelf it is dropping', () => {
    const decoded = decodeProgress(
      '{"relics":0,"bought":{"rootbound":1,"secondwind":1,"slot":1},"equipped":["rootbound","secondwind"]}',
    );
    expect(decoded.relics).toBe(400);
    expect(decoded.found).toEqual([]);
    expect(decoded.equipped).toEqual([]);
  });
});

describe('teaching, drop by drop (2026-08-19)', () => {
  /**
   * The `met` ledger: concepts this DEVICE has been taught, once each
   * (`ideas/teaching.md`). The decode rules are the whole contract — a
   * pre-teaching save means a veteran, not a stranger, and must decode as
   * having met everything; only a genuinely fresh device gets the drip.
   */
  it('meets a concept once, and a second meeting changes nothing', () => {
    const once = meet(EMPTY_PROGRESS, 'ripe');
    expect(once.met).toEqual(['ripe']);
    expect(hasMet(once, 'ripe')).toBe(true);
    expect(hasMet(once, 'pop')).toBe(false);
    // Idempotent — the same object back, the contract every write here keeps.
    expect(meet(once, 'ripe')).toBe(once);
  });

  it('decodes a pre-teaching blob as having met everything', () => {
    // No `met` field at all: a save from before the ledger existed. The
    // device has played; it is not a stranger; nothing is re-taught.
    const veteran = decodeProgress('{"relics":10,"bought":{"tiles":2}}');
    expect([...veteran.met].sort()).toEqual([...TEACH_IDS].sort());
  });

  it('starts a fresh device with everything unmet', () => {
    expect(decodeProgress(null).met).toEqual([]);
    expect(EMPTY_PROGRESS.met).toEqual([]);
  });

  it('keeps only moments this build knows, deduplicated', () => {
    const decoded = decodeProgress(
      '{"relics":0,"bought":{},"met":["ripe","ripe","banana","pop",7]}',
    );
    expect(decoded.met).toEqual(['ripe', 'pop']);
  });

  it('round-trips the ledger with the rest of the purse', () => {
    const taught = meet(meet(withRelics(50), 'ripe'), 'luck');
    expect(decodeProgress(encodeProgress(taught))).toEqual(taught);
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

describe('salvage, not surrender (2026-08-20)', () => {
  it('keeps the purse and the shelf when an unrelated field is malformed', () => {
    // Both of these used to return EMPTY_PROGRESS — throwing away relics AND
    // every level bought — because one field was the wrong shape. Since the
    // per-world split (2026-08-26) the shelf is no longer this blob's to
    // salvage; the purse and the levels still are, and they are what a
    // malformed neighbour must not cost.
    const badBought = decodeProgress(
      JSON.stringify({ relics: 250, bought: 'not an object', met: [] }),
    );
    expect(badBought.relics).toBe(250);
    expect(badBought.bought).toEqual({});

    const badRelics = decodeProgress(
      JSON.stringify({ relics: 'lots', bought: { tiles: 3 }, met: [] }),
    );
    expect(levelOf(badRelics, 'tiles')).toBe(3);
    // An unreadable purse is zero, not a reason to forget the levels.
    expect(badRelics.relics).toBe(0);
  });
});
