import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, TUNING, type Tuning } from '@content/tuning';
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

const QUEST: Tuning = { ...ENDLESS_TUNING, worldWalls: 0, magicChance: 0, uniqueChance: 0 };

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
    expect(after.points).toBe(priced.points);
    expect(after.quest).toBeNull();
    expect(after.log.questsDone).toBe(1);
  });

  it('is NOT collected by taking the same pocket as tiles — the decision', () => {
    const site = key(3, 0);
    const { state, at } = pocketAt(withQuest(site), 1, 0, QUEST.questNeed);

    const after = reduce(state, { type: 'HARVEST', choice: 'tiles', at });
    expect(after.quest).not.toBeNull();
    expect(after.log.questsDone).toBe(0);
    // And the tiles paid are exactly the ordinary tiles — no double dip.
    expect(after.tiles - state.tiles).toBe(harvestValue(state, at).tiles);
  });

  it('refuses a pocket that is too small or too far', () => {
    const site = key(3, 0);
    const small = pocketAt(withQuest(site), 1, 0, QUEST.questNeed - 1);
    expect(harvestValue(small.state, small.at).questPays).toBe(false);

    const far = pocketAt(withQuest(site), 40, 0, QUEST.questNeed);
    expect(harvestValue(far.state, far.at).questPays).toBe(false);
  });

  it('does not exist in the bounded game', () => {
    const state = newRun(5, TUNING);
    expect(state.quest).toBeNull();
    expect(TUNING.questNeed).toBe(0);
  });
});
