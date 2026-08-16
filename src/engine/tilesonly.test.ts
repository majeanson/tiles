import { describe, expect, it } from 'vitest';
import { TUNING } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from './hex';
import { canSpend, newRun, rarityOdds, reduce } from './reduce';
import { costOf, harvestValue, worthOf } from './rules';
import type { Cell, GameState } from './state';

/**
 * The tiles-only run (2026-08-15). One currency, no clock, score as a
 * by-product, and a pocket you may burn instead of take. These pin the
 * mechanics; whether it is a better game than the shipped one is a question
 * for a phone, and the flag exists so both can be played back to back.
 */

const T = { ...TUNING, worldWalls: 0, magicChance: 0, uniqueChance: 0 };
/** The same economy with one system switched off, per test. */
const without = (over: Partial<typeof TUNING>) => ({ ...T, ...over });

/**
 * A ripe green row of `size` on a bare board, walled in stone.
 *
 * `openGround` decides whether the run can continue afterwards: with it, the
 * board still has somewhere to build and popping is just a pop; without it,
 * the pop is also the end of the expedition — which is the only way to see
 * the ending bonus, and the reason both shapes are needed here.
 */
function pocket(state: GameState, size: number, openGround = true): GameState {
  const cells: Record<HexKey, Cell> = {};
  const members = new Set<HexKey>();
  for (let i = 0; i < size; i++) members.add(key(i, 0));
  for (const k of members) cells[k] = { kind: 'tile', colour: 'green' };
  for (let i = 0; i < size; i++) {
    for (const n of neighbourKeys(i, 0)) if (!members.has(n)) cells[n] = { kind: 'stone' };
  }
  // Two rows out: touches the stone rim, touches no member, so the pocket
  // stays ripe and the run stays alive.
  if (openGround) cells[key(2, 2)] = { kind: 'empty' };
  return { ...state, cells };
}

describe('one payout', () => {
  it('pays tiles AND scores, whichever button was pressed', () => {
    const state = pocket(newRun(5, T), 6);
    const value = harvestValue(state, key(0, 0));
    expect(value.count).toBe(6);

    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    expect(popped.phase).toBe('placing');
    expect(popped.tiles).toBe(state.tiles + value.tiles);
    expect(popped.points).toBe(Math.floor(value.points * T.pointsPerPop));

    // 'points' is the same instruction now — older saves and policies keep
    // meaning something rather than silently doing nothing.
    const same = reduce(state, { type: 'HARVEST', choice: 'points', at: key(0, 0) });
    expect(same.tiles).toBe(popped.tiles);
    expect(same.points).toBe(popped.points);
  });

  it('still forks where the single payout is switched off', () => {
    const forked = without({ singlePayout: false, pointsPerPop: 0 });
    const state = pocket(newRun(5, forked), 6);
    const asTiles = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    const asPoints = reduce(state, { type: 'HARVEST', choice: 'points', at: key(0, 0) });
    expect(asTiles.points).toBe(0);
    expect(asPoints.tiles).toBe(state.tiles);
  });
});

describe('burning a pocket', () => {
  /**
   * Repriced, twice. Burning paid LUCK until Marc played it and never once
   * used it: a burn paid `burnLuck` a tile where popping the same pocket paid
   * comparable luck AND the tiles AND the score, so it was strictly dominated
   * the moment luck went flat-per-pop. It now pays RELICS — the between-runs
   * currency — which is the version he asked for: give up the thing keeping
   * you alive and the score, and buy the next run instead.
   */
  it('pays RELICS and nothing else — no tiles, no score, no luck', () => {
    expect(T.burnLuck).toBe(0);
    const state = pocket(newRun(5, T), 6);
    const burned = reduce(state, { type: 'HARVEST', choice: 'burn', at: key(0, 0) });

    expect(burned.relics).toBe(6 * T.burnRelics);
    expect(burned.tiles).toBe(state.tiles);
    expect(burned.points).toBe(state.points);
    expect(burned.luck).toBe(state.luck);
    expect(burned.cells[key(0, 0)]?.kind).toBe('stone');
  });

  it('is the fork: the same pocket popped pays tiles and score, and no relics', () => {
    const state = pocket(newRun(5, T), 6);
    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    expect(popped.relics).toBe(0);
    expect(popped.tiles).toBeGreaterThan(state.tiles);
    expect(popped.points).toBeGreaterThan(state.points);
  });

  it('still works wherever a price is set, so the option can come back', () => {
    const priced = { ...T, burnLuck: 3 };
    const state = pocket(newRun(5, priced), 6);
    const burned = reduce(state, { type: 'HARVEST', choice: 'burn', at: key(0, 0) });

    expect(burned.tiles).toBe(state.tiles);
    expect(burned.points).toBe(state.points);
    expect(burned.luck).toBe(6 * 3);
    expect(burned.cells[key(0, 0)]?.kind).toBe('stone');
  });

  it('does not exist where the sacrifice is switched off', () => {
    const state = pocket(newRun(5, without({ burnRelics: 0, burnLuck: 0 })), 6);
    expect(reduce(state, { type: 'HARVEST', choice: 'burn', at: key(0, 0) })).toBe(state);
  });
});

describe('luck as a purse', () => {
  /**
   * The flaw Marc found by playing: luck was a bar that filled. `luckCap` was
   * 150 and a pop paid 9, so a hundred-and-forty-pop run was maxed out inside
   * fifteen pops and popping early bought nothing for the other nine tenths.
   * Now luck buys nothing passively and is spent on three things.
   */
  it('no longer raises the odds by itself — it is a currency, not a stat', () => {
    expect(T.luckMagicPerPop).toBe(0);
    expect(T.luckUniquePerPop).toBe(0);
    expect(rarityOdds(T, 0)).toEqual(rarityOdds(T, 900));
  });

  it('pays for a fresh hand', () => {
    const rich: GameState = { ...newRun(5, T), luck: 100 };
    const rerolled = reduce(rich, { type: 'SPEND', on: 'reroll' });

    expect(rerolled.luck).toBe(100 - T.luckRerollCost);
    expect(rerolled.draft.map((t) => t.id)).not.toEqual(rich.draft.map((t) => t.id));
    expect(rerolled.selected).toBe(0);
  });

  it('pays for a hand of a colour you name, and keeps it leaning', () => {
    const rich: GameState = { ...newRun(5, T), luck: 100 };
    const steered = reduce(rich, { type: 'SPEND', on: 'steer', colour: 'blue' });

    expect(steered.luck).toBe(100 - T.luckSteerCost);
    // Steering redraws immediately, so some of the bias is already spent on
    // the hand in front of you — that is what makes it a purchase and not a bet.
    expect(steered.bias === null || steered.bias.colour === 'blue').toBe(true);
    expect(steered.draft.map((t) => t.id)).not.toEqual(rich.draft.map((t) => t.id));
  });

  it('pays to forge the selected card unique', () => {
    const rich: GameState = { ...newRun(5, T), luck: 100 };
    const forged = reduce(rich, { type: 'SPEND', on: 'forge' });

    expect(forged.luck).toBe(100 - T.luckForgeCost);
    expect(forged.draft[forged.selected]?.rarity).toBe('unique');
    // Only the selected card, and the colours are untouched.
    expect(forged.draft.map((t) => t.colour)).toEqual(rich.draft.map((t) => t.colour));
  });

  it('refuses what the purse cannot pay for, and charges nothing', () => {
    const broke: GameState = { ...newRun(5, T), luck: 1 };
    expect(reduce(broke, { type: 'SPEND', on: 'forge' })).toBe(broke);
    expect(reduce(broke, { type: 'SPEND', on: 'reroll' })).toBe(broke);
    expect(canSpend(broke, 'reroll')).toBe(false);
  });

  it('has no shop at all where the prices are zero', () => {
    const shopless = without({ luckRerollCost: 0, luckSteerCost: 0, luckForgeCost: 0 });
    const state: GameState = { ...newRun(5, shopless), luck: 500 };
    expect(reduce(state, { type: 'SPEND', on: 'reroll' })).toBe(state);
    expect(canSpend(state, 'forge')).toBe(false);
  });
});

describe('the run itself', () => {
  it('has no clock at all — the purse is the whole limit', () => {
    expect(T.runLength).toBe(0);
    expect(newRun(5, T).tuning.runLength).toBe(0);
  });

  it('pays for the expedition when it ends: how far, and what it reached', () => {
    // No open ground, so this pop is also the ending.
    const base = pocket(newRun(5, T), 6, false);
    const state: GameState = {
      ...base,
      points: 0,
      cells: { ...base.cells, [key(12, 0)]: { kind: 'stone' } },
    };

    const value = harvestValue(state, key(0, 0));
    const ended = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    expect(ended.phase).toBe('ended');
    expect(ended.points).toBe(Math.floor(value.points * T.pointsPerPop) + 12 * T.endReachBonus);
  });

  it('adds nothing at the end where the bonus is switched off', () => {
    const flat = without({ endReachBonus: 0, endClaimBonus: 0 });
    const base = pocket(newRun(5, flat), 6, false);
    const ended = reduce(base, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    expect(ended.phase).toBe('ended');
    expect(ended.points).toBe(Math.floor(harvestValue(base, key(0, 0)).points * flat.pointsPerPop));
  });
});

describe('why you would ever pop early', () => {
  it('pays luck mostly per POP, so small and often beats one monster', () => {
    // Three 4-pockets against one 12-pocket: same tiles popped, more luck.
    const small = pocket(newRun(5, T), 4);
    const big = pocket(newRun(5, T), 12);

    const afterSmall = reduce(small, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    const afterBig = reduce(big, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    const luckFromThreeSmall = (afterSmall.luck - small.luck) * 3;
    const luckFromOneBig = afterBig.luck - big.luck;
    expect(luckFromThreeSmall).toBeGreaterThan(luckFromOneBig);

    // And the monster still wins on tiles and score, which is the trade.
    expect(afterBig.tiles - big.tiles).toBeGreaterThan(afterSmall.tiles - small.tiles);
    expect(afterBig.points).toBeGreaterThan(afterSmall.points);
  });

  it('steers the next draws toward the colour it popped', () => {
    const state = pocket(newRun(5, T), 5);
    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    expect(popped.bias?.colour).toBe('green');
    expect(popped.bias?.left).toBe(T.colourBiasDraws);
  });

  it('spends the steering one DRAW at a time, then forgets it', () => {
    const state = pocket(newRun(5, T), 5);
    let s = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    const drawn = T.draftWidth;
    expect(s.bias?.left).toBe(T.colourBiasDraws);

    // Each placement rerolls the whole draft, so it burns `draftWidth` draws.
    // `(2,2)` is the open ground the fixture leaves touching the stone rim.
    s = { ...s, tiles: 999 };
    const after = reduce(s, { type: 'PLACE', hex: key(2, 2) });
    expect(after.placements).toBe(1);
    expect(after.bias === null || after.bias.left === T.colourBiasDraws - drawn).toBe(true);
  });

  it('does not steer where the bias is switched off', () => {
    const straight = without({ colourBiasDraws: 0 });
    const state = pocket(newRun(5, straight), 5);
    const popped = reduce(state, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });
    expect(popped.bias).toBeNull();
  });
});

describe('the perks Marc picked', () => {
  /**
   * ROOTBOUND and SECOND WIND, chosen out of a brainstorm of sixteen. The
   * four big rule-breakers he was not convinced by are in ideas/uniques.md,
   * unbuilt — these are the two that exist.
   */
  const ROOTBOUND = { ...T, rootboundOnly: true };

  it('rootbound: ground that is not yours pays NOTHING, however well packed', () => {
    // A green tile among green neighbours, on ground native to nobody.
    const cells: Record<HexKey, Cell> = {
      [key(0, 0)]: { kind: 'tile', colour: 'green' },
      [key(1, 0)]: { kind: 'tile', colour: 'green' },
      [key(0, 1)]: { kind: 'tile', colour: 'green' },
    };
    const base: GameState = { ...newRun(5, T), cells };
    const rooted: GameState = { ...newRun(5, ROOTBOUND), cells };

    expect(worthOf(base.cells, key(0, 0), T)).toBeGreaterThan(0);
    expect(worthOf(rooted.cells, key(0, 0), ROOTBOUND)).toBe(0);
  });

  it('rootbound: your own ground pays double', () => {
    const cells: Record<HexKey, Cell> = {
      [key(0, 0)]: { kind: 'tile', colour: 'green', onNative: true },
      [key(1, 0)]: { kind: 'tile', colour: 'green', onNative: true },
    };
    const plain = worthOf(cells, key(0, 0), T);
    const rooted = worthOf(cells, key(0, 0), ROOTBOUND);
    expect(rooted).toBe(plain * 2);
  });

  it('second wind: a coin flip, not a floor — and only ever once', () => {
    const WIND = { ...T, secondWindTiles: 20, secondWindChance: 0.5 };
    // Exactly enough for one placement, and nothing ripe afterwards: the
    // placement itself is what makes the run broke.
    const dying: GameState = {
      ...newRun(5, WIND),
      tiles: costOf(0, WIND),
      cells: { [key(0, 0)]: { kind: 'tile', colour: 'green' }, [key(1, 0)]: { kind: 'empty' } },
    };

    // Across many seeds the coin must land both ways, or it is not a coin.
    const outcomes = new Set<boolean>();
    for (let seed = 1; seed <= 40; seed++) {
      const ended = reduce(
        { ...dying, rootSeed: seed, rng: newRun(seed, WIND).rng },
        { type: 'PLACE', hex: key(1, 0) },
      );
      outcomes.add(ended.phase === 'ended');
    }
    expect(outcomes.has(true)).toBe(true);
    expect(outcomes.has(false)).toBe(true);
  });

  it('second wind: spent whether the coin was won or lost', () => {
    const WIND = { ...T, secondWindTiles: 20, secondWindChance: 1 };
    const dying: GameState = {
      ...newRun(5, WIND),
      tiles: costOf(0, WIND),
      cells: { [key(0, 0)]: { kind: 'tile', colour: 'green' }, [key(1, 0)]: { kind: 'empty' } },
    };
    const saved = reduce(dying, { type: 'PLACE', hex: key(1, 0) });
    expect(saved.usedSecondWind).toBe(true);
    expect(saved.tiles).toBe(20);
  });

  it('does not exist unless the perk is worn', () => {
    expect(T.rootboundOnly).toBe(false);
    expect(T.secondWindTiles).toBe(0);
  });
});

describe('relics', () => {
  it('are paid for reaching somewhere new, and are not points', () => {
    expect(T.claimRelics).toBeGreaterThan(0);
    expect(newRun(5, T).relics).toBe(0);
  });

  it('bank a share of unspent luck when the run ends', () => {
    const base = pocket(newRun(5, T), 6, false);
    const rich: GameState = { ...base, luck: 200 };
    const ended = reduce(rich, { type: 'HARVEST', choice: 'tiles', at: key(0, 0) });

    expect(ended.phase).toBe('ended');
    expect(ended.relics).toBe(Math.floor(ended.luck * T.luckToRelics));
  });
});
