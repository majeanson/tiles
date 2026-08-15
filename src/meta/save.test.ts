import { describe, expect, it } from 'vitest';
import { ENDLESS_TUNING } from '@content/tuning';
import { key } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { decodeRun, encodeRun } from './save.js';

/**
 * A saved run is untrusted input. These pin the two claims that matter: a
 * genuine save round-trips exactly (the reducer carries on as if nothing
 * happened), and anything less than a genuine save is refused whole rather
 * than half-resurrected.
 */

describe('keeping a run', () => {
  it('round-trips a live run exactly, and the reducer continues it', () => {
    let state = newRun(9, ENDLESS_TUNING);
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

  it('refuses a run with a mangled core field, whole', () => {
    const state = newRun(3);
    for (const mangle of [
      ['"phase":"placing"', '"phase":"paused"'],
      ['"tiles":30', '"tiles":"lots"'],
      ['"world":"bounded"', '"world":"round"'],
    ] as const) {
      const raw = encodeRun(state).replace(mangle[0], mangle[1]);
      expect(raw).not.toBe(encodeRun(state)); // the mangle found its target
      expect(decodeRun(raw)).toBeNull();
    }
  });
});
