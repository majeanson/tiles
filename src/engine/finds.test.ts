import { describe, expect, it } from 'vitest';
import { TUNING, type Tuning } from '@content/tuning';
import { disc, distance, key, parse, type HexKey } from './hex';
import { newRun, reduce } from './reduce';
import { legalPlacements } from './rules';
import type { GameState } from './state';
import { destinationAt, findAt, findsWithin } from './world';

/**
 * Hidden finds (2026-08-18, resolving `ideas/uniques.md`): a rare landmark on
 * its own hash layer that grants a perk when growth stumbles onto it. These
 * pin the structure — its own salts so destinations never move, deep-world by
 * construction, destination precedence, reveal and claim on the shrine
 * contract. Whether stumbling onto one changes how a player grows their
 * ground is the written question, and it belongs to the phone.
 */

const T = TUNING;
const tuned = (over: Partial<Tuning>): Tuning => ({ ...TUNING, ...over });

/**
 * Dense finds, quiet world, deep purse: a test about the find layer must not
 * die broke three hexes from home before the first find is reachable.
 */
const DENSE = tuned({
  findEvery: 4,
  findChance: 1,
  worldWalls: 0,
  destinationChance: 0,
  startingTiles: 500,
  costRisesEvery: 1000,
});

describe('the find layer', () => {
  it('agrees with itself: the per-hex answer is the enumeration, exactly', () => {
    const radius = 40;
    const listed = new Map(findsWithin(9, radius, T).map((f) => [key(f.q, f.r), f]));
    for (const h of disc(radius)) {
      const at = findAt(9, h.q, h.r, T);
      expect(at).toEqual(listed.get(key(h.q, h.r)) ?? null);
    }
  });

  it('is deep-world by design — nothing within a block-width of home', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const f of findsWithin(seed, 40, T)) {
        expect(distance(f, { q: 0, r: 0 })).toBeGreaterThanOrEqual(T.findEvery);
      }
    }
  });

  it('yields where a destination claims the same hex — precedence, not a coin flip', () => {
    // Both layers dense enough to collide somewhere in twenty worlds.
    const crowded = tuned({ findEvery: 6, findChance: 1 });
    let finds = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const h of disc(40)) {
        if (destinationAt(seed, h.q, h.r, crowded) !== null) {
          expect(findAt(seed, h.q, h.r, crowded)).toBeNull();
        }
      }
      finds += findsWithin(seed, 40, crowded).length;
    }
    expect(finds).toBeGreaterThan(0);
  });

  it('moves no destination — the layers hash on different salts', () => {
    // The load-bearing claim for shipped worlds: switching finds ON leaves
    // every destination exactly where it was.
    const off = tuned({ findChance: 0 });
    for (let seed = 1; seed <= 10; seed++) {
      expect(destinationsKeys(seed, T)).toEqual(destinationsKeys(seed, off));
    }
    function destinationsKeys(seed: number, t: Tuning): string[] {
      return disc(30)
        .map((h) => destinationAt(seed, h.q, h.r, t))
        .filter((d) => d !== null)
        .map((d) => key(d.q, d.r));
    }
  });

  it('does not exist while the system is switched off', () => {
    const none = tuned({ findChance: 0 });
    expect(findsWithin(9, 60, none)).toEqual([]);
    expect(findAt(9, 12, 12, none)).toBeNull();
  });

  it('is rarer than a shrine, which was the brief', () => {
    // Shrines are 8% of destinations. Counted over many worlds at radius 30,
    // finds must come up less often — the rarest thing out there.
    let shrines = 0;
    let finds = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const h of disc(30)) {
        if (destinationAt(seed, h.q, h.r, T)?.reward === 'shrine') shrines++;
        if (findAt(seed, h.q, h.r, T) !== null) finds++;
      }
    }
    expect(finds).toBeGreaterThan(0);
    expect(finds).toBeLessThan(shrines);
  });
});

describe('reveal and claim', () => {
  it('reveals a find as a landmark when growth touches its ground', () => {
    let state = newRun(3, DENSE);
    for (let step = 0; step < 200; step++) {
      const spot = legalPlacements(state.cells)[0];
      if (spot === undefined || state.phase !== 'placing') break;
      const next = reduce(state, { type: 'PLACE', hex: spot });
      if (next === state) break;
      state = next;
      if (Object.values(state.cells).some((c) => c.kind === 'landmark')) break;
    }

    const revealed = Object.entries(state.cells).filter(([, c]) => c.kind === 'landmark');
    expect(revealed.length).toBeGreaterThan(0);
    for (const [k, cell] of revealed) {
      if (cell.kind !== 'landmark') continue;
      expect(cell.reward).toBe('find');
      // Reveal happens when growth touches the ground, and touching is
      // claiming — a find enters the board the way a cache does: claimed by
      // the very placement that revealed it.
      expect(cell.claimed).toBe(true);
      const { q, r } = parse(k);
      expect(findAt(state.rootSeed, q, r, DENSE)).not.toBeNull();
    }
    expect(state.relics).toBe(revealed.length * DENSE.claimRelics);
  });

  /** A find planted beside the arrival clearing, the p3b fixture's way. */
  function withFind(tuning: Tuning = tuned({ worldWalls: 0, destinationChance: 0 })): {
    state: GameState;
    landmark: HexKey;
  } {
    const landmark = key(2, 0);
    const base = newRun(11, tuning);
    return {
      state: {
        ...base,
        cells: {
          ...base.cells,
          [landmark]: { kind: 'landmark', reward: 'find', claimed: false },
        },
      },
      landmark,
    };
  }

  it('claims on touch, pays the claim relics, and NOTHING else', () => {
    const { state, landmark } = withFind();
    const next = reduce(state, { type: 'PLACE', hex: key(1, 0) });

    expect(next.cells[landmark]).toMatchObject({ kind: 'landmark', claimed: true });
    // The whole engine-side payout is the claim's relics — the perk it grants
    // is meta, and the shell reads the claim the way it reads a shrine's.
    expect(next.relics).toBe(state.relics + state.tuning.claimRelics);
    expect(next.tiles).toBe(state.tiles - 1);
    expect(next.points).toBe(state.points);
  });

  it('claims exactly once — a spent find stays spent', () => {
    const { state } = withFind();
    const once = reduce(state, { type: 'PLACE', hex: key(1, 0) });
    const again = reduce(once, { type: 'PLACE', hex: key(2, -1) });
    expect(again.relics).toBe(once.relics);
  });
});
