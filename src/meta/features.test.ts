import { describe, expect, it } from 'vitest';
import {
  decodeFeatures,
  defaultFeatures,
  encodeFeatures,
  FEATURES,
  isEnabled,
  parseOverrides,
  withOverrides,
  type FeatureSet,
} from './features.js';

describe('the registry', () => {
  it('has unique ids', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });

  // The premise stands: run one is the smallest game there is, and systems
  // arrive off. The ONE recorded exception is the world itself — endless
  // became the shipped default on 2026-08-14, because Session 4 said that
  // decision belonged to playing and Marc played both worlds and chose
  // (LOG, Session 9). A new exception here needs a decision in the ledger.
  it('defaults every flag off, except the world play chose', () => {
    for (const [id, on] of Object.entries(defaultFeatures())) {
      expect(on).toBe(id === 'world.endless');
    }
  });

  it('describes every flag, so the registry never becomes a list of mystery ids', () => {
    for (const f of FEATURES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.note.length).toBeGreaterThan(0);
    }
  });

  // The settings panel renders unwired flags as NOT BUILT; a default that
  // nothing reads would be a lie with extra steps.
  it('never defaults an unwired flag on', () => {
    for (const f of FEATURES) {
      if (!f.wired) expect(f.defaultOn).toBe(false);
    }
  });
});

describe('parseOverrides', () => {
  it('turns flags on, and off with a leading minus', () => {
    expect(parseOverrides('?ff=pop.treasure')).toEqual({ 'pop.treasure': true });
    expect(parseOverrides('?ff=-pop.treasure')).toEqual({ 'pop.treasure': false });
  });

  it('handles several at once, with whitespace', () => {
    expect(parseOverrides('?ff=pop.treasure, -debug.overlay')).toEqual({
      'pop.treasure': true,
      'debug.overlay': false,
    });
  });

  it('ignores unknown ids rather than throwing — a stale bookmark must still load', () => {
    expect(parseOverrides('?ff=nonsense,pop.treasure')).toEqual({ 'pop.treasure': true });
  });

  it('is a no-op when absent or empty', () => {
    expect(parseOverrides('')).toEqual({});
    expect(parseOverrides('?other=1')).toEqual({});
    expect(parseOverrides('?ff=')).toEqual({});
    expect(parseOverrides('?ff=,,')).toEqual({});
  });
});

describe('persistence', () => {
  it('round-trips', () => {
    const set = withOverrides(defaultFeatures(), { 'pop.treasure': true });
    expect(decodeFeatures(encodeFeatures(set))).toEqual(set);
  });

  it('falls back to defaults for absent, corrupt, or wrong-shaped storage', () => {
    const base = defaultFeatures();
    expect(decodeFeatures(null)).toEqual(base);
    expect(decodeFeatures('not json')).toEqual(base);
    expect(decodeFeatures('null')).toEqual(base);
    expect(decodeFeatures('42')).toEqual(base);
    expect(decodeFeatures('["pop.treasure"]')).toEqual(base);
  });

  // Adding or removing a flag must never brick an existing save.
  it('drops unknown keys and fills in missing ones', () => {
    const decoded = decodeFeatures('{"pop.treasure":true,"since-removed":true}');
    expect(decoded).toEqual({ ...defaultFeatures(), 'pop.treasure': true });
    expect(Object.keys(decoded)).not.toContain('since-removed');
  });

  it('ignores non-boolean values', () => {
    expect(decodeFeatures('{"pop.treasure":"yes"}')).toEqual(defaultFeatures());
  });
});

describe('isEnabled', () => {
  it('reads the set it is given and nothing ambient', () => {
    const off: FeatureSet = defaultFeatures();
    const on = withOverrides(off, { 'pop.treasure': true });
    expect(isEnabled(off, 'pop.treasure')).toBe(false);
    expect(isEnabled(on, 'pop.treasure')).toBe(true);
    expect(isEnabled(on, 'debug.overlay')).toBe(false);
  });
});
