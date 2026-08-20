import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { newRun, reduce } from './reduce';
import { harvestValue } from './rules';
import type { Cell, GameState } from './state';

/**
 * Quests (M1, Gate B's structural fix). The bounty must be collectable ONLY
 * by pressing points on a qualifying pocket — that is the whole reason it
 * exists, and the property that keeps it one scoring channel rather than the
 * second one that killed v1.
 */

const QUEST: Tuning = { ...TUNING, worldWalls: 0, magicChance: 0, uniqueChance: 0 };

/**
 * A ripe pocket of `size` green tiles in a row, walled in stone — built on a
 * BARE board rather than over the run's own, because the arrival clearing's
 * empty ground would leave the row unripe and the test would be measuring
 * the wrong thing.
 */
function pocketAt(
  state: GameState,
  q: number,
  r: number,
  size: number,
): { state: GameState; at: HexKey } {
  const cells: Record<HexKey, Cell> = {};
  const members = new Set<HexKey>();
  for (let i = 0; i < size; i++) members.add(key(q + i, r));
  for (const k of members) cells[k] = { kind: 'tile', colour: 'green' };
  for (let i = 0; i < size; i++) {
    for (const n of neighbourKeys(q + i, r)) {
      if (!members.has(n)) cells[n] = { kind: 'stone' };
    }
  }
  // Open ground clear of the pocket, so cashing it is a harvest rather than
  // also the end of the expedition — the ending bonus would otherwise land on
  // top of every score these tests assert.
  cells[key(q + 2, r + 2)] = { kind: 'empty' };
  return { state: { ...state, cells }, at: key(q, r) };
}

/** A run with a site already claimed at `site`, so its bounty is standing. */
function withQuest(site: HexKey, t: Tuning = QUEST): GameState {
  const base = newRun(5, t);
  return {
    ...base,
    quest: { at: site, need: t.questNeed, radius: t.questRadius, bonus: t.questBonus },
  };
}

describe('the bounty', () => {
  it('is opened by claiming a site, once, and named in state', () => {
    const site = key(2, 0);
    const base = newRun(11, QUEST);
    const planted: GameState = {
      ...base,
      cells: { ...base.cells, [site]: { kind: 'landmark', reward: 'site', claimed: false } },
    };

    const after = reduce(planted, { type: 'PLACE', hex: key(1, 0) });
    expect(after.quest).not.toBeNull();
    expect(after.quest?.at).toBe(site);
    expect(after.quest?.need).toBe(QUEST.questNeed);

    // A second site does not open a second bounty — one goal at a time.
    const second = key(2, -2);
    const more: GameState = {
      ...after,
      cells: { ...after.cells, [second]: { kind: 'landmark', reward: 'site', claimed: false } },
    };
    const later = reduce(more, { type: 'PLACE', hex: key(2, -1) });
    expect(later.quest?.at).toBe(site);
  });

  it('multiplies a qualifying pocket taken as POINTS, and clears', () => {
    const site = key(3, 0);
    const { state, at } = pocketAt(withQuest(site), 1, 0, QUEST.questNeed);

    const priced = harvestValue(state, at);
    expect(priced.questPays).toBe(true);

    const plain = harvestValue({ ...state, quest: null }, at);
    expect(priced.points).toBe(plain.points * QUEST.questBonus);

    const after = reduce(state, { type: 'HARVEST', choice: 'points', at });
    expect(after.points).toBe(Math.floor(priced.points * QUEST.pointsPerPop));
    expect(after.quest).toBeNull();
    expect(after.log.questsDone).toBe(1);
  });

  /**
   * This used to be the decision the bounty existed to create: taking a
   * qualifying pocket as TILES left the bounty standing, so you chose between
   * survival and the multiplier. The single payout removed the fork — every
   * pop pays tiles and scores — so the bounty now rides on the pop, and what
   * is left to pin is that a SACRIFICE still forfeits it. Cashing a pocket for
   * relics scores nothing, so there is nothing for the multiplier to multiply.
   */
  it('is forfeited by sacrificing the pocket, which scores nothing', () => {
    const site = key(3, 0);
    const { state, at } = pocketAt(withQuest(site), 1, 0, QUEST.questNeed);

    const burned = reduce(state, { type: 'HARVEST', choice: 'burn', at });
    expect(burned.quest).not.toBeNull();
    expect(burned.log.questsDone).toBe(0);
    expect(burned.points).toBe(state.points);
  });

  it('is collected by the pop that scores it, whichever name was pressed', () => {
    const site = key(3, 0);
    const { state, at } = pocketAt(withQuest(site), 1, 0, QUEST.questNeed);

    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at });
    expect(popped.quest).toBeNull();
    expect(popped.log.questsDone).toBe(1);
    // And it still pays the tiles a pop always pays — the bounty is on top.
    expect(popped.tiles - state.tiles).toBe(harvestValue(state, at).tiles);
  });

  /**
   * The other half of "the pop that SCORES it collects it" (Day 2). TREASURE
   * trades the whole payout away for the rare tile — it banks no points — so
   * it must leave the bounty standing, exactly as a burn does. It did not:
   * `collected` was spelled `choice !== 'burn'` while `scores` excluded
   * treasure too, so a qualifying pocket taken as treasure cleared the bounty
   * and paid nothing for it. Both now read the one answer.
   */
  it('is forfeited by taking the pocket as TREASURE, which scores nothing', () => {
    const site = key(3, 0);
    // One pocket that qualifies for both, so the choice is the only variable.
    const both: Tuning = { ...QUEST, treasureNeed: QUEST.questNeed };
    const { state, at } = pocketAt(withQuest(site, both), 1, 0, QUEST.questNeed);
    expect(harvestValue(state, at).questPays).toBe(true);
    expect(harvestValue(state, at).treasure).not.toBeNull();

    const taken = reduce(state, { type: 'HARVEST', choice: 'treasure', at });
    expect(taken.points).toBe(state.points);
    expect(taken.quest).not.toBeNull();
    expect(taken.log.questsDone).toBe(0);
  });

  it('refuses a pocket that is too small or too far', () => {
    const site = key(3, 0);
    const small = pocketAt(withQuest(site), 1, 0, QUEST.questNeed - 1);
    expect(harvestValue(small.state, small.at).questPays).toBe(false);

    const far = pocketAt(withQuest(site), 40, 0, QUEST.questNeed);
    expect(harvestValue(far.state, far.at).questPays).toBe(false);
  });

  it('starts every run with no bounty standing — a site has to open one', () => {
    const state = newRun(5, TUNING);
    expect(state.quest).toBeNull();
    expect(TUNING.questNeed).toBeGreaterThan(0);
  });
});
