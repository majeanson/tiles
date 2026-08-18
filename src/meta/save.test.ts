import { describe, expect, it } from 'vitest';
import { legalPlacements } from '@engine/rules';
import { TUNING } from '@content/tuning';
import { key } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import type { GameState } from '@engine/state';
import { decodeRun, encodeRun } from './save.js';

/**
 * A saved run is untrusted input. These pin the two claims that matter: a
 * genuine save round-trips exactly (the reducer carries on as if nothing
 * happened), and anything less than a genuine save is refused whole rather
 * than half-resurrected.
 */

describe('keeping a run', () => {
  it('round-trips a live run exactly, and the reducer continues it', () => {
    let state = newRun(9, TUNING);
    state = reduce(state, { type: 'PLACE', hex: key(1, 0) });
    state = reduce(state, { type: 'HOLD' });

    const revived = decodeRun(encodeRun(state));
    expect(revived).toEqual(state);

    // Same action on both must give the same board — determinism survives.
    const spot = key(0, 1);
    expect(reduce(revived!, { type: 'PLACE', hex: spot })).toEqual(
      reduce(state, { type: 'PLACE', hex: spot }),
    );
  });

  it('round-trips an ended run, so the end screen survives a reload', () => {
    const state = { ...newRun(3), phase: 'ended' as const, death: 'broke' as const };
    expect(decodeRun(encodeRun(state))).toEqual(state);
  });

  it('refuses everything that is not a run', () => {
    expect(decodeRun(null)).toBeNull();
    expect(decodeRun('')).toBeNull();
    expect(decodeRun('not json')).toBeNull();
    expect(decodeRun('42')).toBeNull();
    expect(decodeRun('[]')).toBeNull();
    expect(decodeRun('{}')).toBeNull();
  });

  it('refuses a run from a future save format', () => {
    const state = newRun(3);
    const raw = encodeRun(state).replace('"version":1', '"version":2');
    expect(decodeRun(raw)).toBeNull();
  });

  it('refuses non-finite numbers, which typeof calls numbers', () => {
    // NaN tiles resumes into a run where nothing is ever affordable and
    // nothing ever ends — a save that plays dead forever. JSON has no NaN
    // literal, but devtools-poked and half-written saves reach the decoder
    // through the same door as honest ones.
    const state = newRun(3);
    for (const bad of ['null', '1e999']) {
      const raw = encodeRun(state).replace(`"tiles":${state.tiles}`, `"tiles":${bad}`);
      expect(raw).not.toBe(encodeRun(state));
      expect(decodeRun(raw)).toBeNull();
    }
  });

  it('refuses a cell whose kind the renderer does not know', () => {
    // The renderer and the tap-describe are exhaustive switches with no
    // default: one unknown kind was a black screen on every load, forever.
    const state = reduce(newRun(4), { type: 'PLACE', hex: legalPlacements(newRun(4).cells)[0]! });
    const raw = encodeRun(state).replace('"kind":"tile"', '"kind":"lava"');
    expect(raw).not.toBe(encodeRun(state));
    expect(decodeRun(raw)).toBeNull();
  });

  it('refuses a run with a mangled core field, whole', () => {
    const state = newRun(3);
    for (const mangle of [
      ['"phase":"placing"', '"phase":"paused"'],
      // Derived, not hardcoded: a starting purse of 30 was written into this
      // test as a literal and a rebalance moved it to 22, so the mangle stopped
      // finding its target and the test passed by missing.
      [`"tiles":${state.tiles}`, '"tiles":"lots"'],
      // Still a hard reject: a core field the reducer cannot work without.
      ['"selected":0', '"selected":"first"'],
    ] as const) {
      const raw = encodeRun(state).replace(mangle[0], mangle[1]);
      expect(raw).not.toBe(encodeRun(state)); // the mangle found its target
      expect(decodeRun(raw)).toBeNull();
    }
  });
});

describe('runs saved before a field existed', () => {
  /**
   * The black screen of 2026-08-16.
   *
   * `lastPlaced` shipped without a fill in `decodeRun`, so every saved run on
   * Earth decoded with `lastPlaced: undefined`. `undefined === null` is false,
   * so the guard meant to catch "no torch yet" let it through to
   * `parse(undefined)`, which threw on the first frame and took the whole
   * render with it. Marc opened the game to nothing at all.
   *
   * These load a save with each later field stripped out, one at a time and
   * then all together, and require that the run comes back and keeps playing.
   */
  const LATER = ['lastPlaced', 'bias', 'quest', 'held', 'luck', 'relics', 'usedSecondWind'];

  const stripped = (state: GameState, fields: readonly string[]): string => {
    const raw = JSON.parse(encodeRun(state)) as Record<string, unknown>;
    for (const f of fields) delete raw[f];
    return JSON.stringify(raw);
  };

  it('comes back with every later field filled, one at a time', () => {
    const state = reduce(newRun(4), { type: 'PLACE', hex: legalPlacements(newRun(4).cells)[0]! });

    for (const field of LATER) {
      const back = decodeRun(stripped(state, [field]));
      expect({ field, ok: back !== null }).toEqual({ field, ok: true });
    }
  });

  it('comes back from a save with ALL of them missing, and still renders', () => {
    const state = reduce(newRun(4), { type: 'PLACE', hex: legalPlacements(newRun(4).cells)[0]! });
    const back = decodeRun(stripped(state, LATER));
    expect(back).not.toBeNull();
    if (back === null) return;

    // The crash itself was in the view, which the layering forbids importing
    // from here — `view.test.ts` owns that half. What this file owns is that
    // every field the view goes on to read comes back NULL rather than
    // undefined, which is the exact difference that caused it.
    expect(back.lastPlaced).toBeNull();
    expect(back.bias).toBeNull();
    expect(back.relics).toBe(0);
  });

  it('keeps playing afterwards, which is the point of not rejecting it', () => {
    const state = reduce(newRun(4), { type: 'PLACE', hex: legalPlacements(newRun(4).cells)[0]! });
    const back = decodeRun(stripped(state, LATER));
    if (back === null) throw new Error('rejected');

    const spot = legalPlacements(back.cells)[0];
    if (spot === undefined) throw new Error('nowhere to build');
    const next = reduce(back, { type: 'PLACE', hex: spot });
    expect(next.placements).toBe(back.placements + 1);
    expect(next.lastPlaced).toBe(spot);
  });

  /**
   * `decodeRun` does not fill `tuning` — the whole object survives via the
   * `...parsed` spread, so a dial added to `Tuning` after this save was
   * written decodes as `undefined` on that object rather than as a missing
   * top-level field. Every reader has to treat that the same as zero
   * (`> 0`, not `<= 0`); this pins that a save missing all eight
   * 2026-08-18 dials still plays a placement without a NaN or a throw.
   */
  it('plays on when a save predates a whole batch of tuning keys', () => {
    const TUNING_2026_08_18 = [
      'findEvery',
      'findChance',
      'findSense',
      'stoneDiscount',
      'wallBuildCostMult',
      'cachePaysPerRing',
      'popTilesPerRing',
      'destinationRampBlocks',
    ];
    const state = newRun(4);
    const raw = JSON.parse(encodeRun(state)) as Record<string, unknown>;
    const tuning = raw['tuning'] as Record<string, unknown>;
    for (const key of TUNING_2026_08_18) delete tuning[key];

    const back = decodeRun(JSON.stringify(raw));
    expect(back).not.toBeNull();
    if (back === null) return;

    const spot = legalPlacements(back.cells)[0];
    if (spot === undefined) throw new Error('nowhere to build');
    const next = reduce(back, { type: 'PLACE', hex: spot });
    expect(next.placements).toBe(back.placements + 1);
    expect(Number.isFinite(next.tiles)).toBe(true);
    expect(Number.isNaN(next.tiles)).toBe(false);
  });
});
