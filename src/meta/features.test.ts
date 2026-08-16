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

  /**
   * Every flag defaults OFF, and now there is no exception.
   *
   * There used to be one — the endless world, made default by play. On
   * 2026-08-16 Marc officialised the lot: the tiles-only run became the game,
   * treasure became part of it, and the bounded world was cut. What is left in
   * this registry is a debug readout and a theme picker, so a shared seed opens
   * the game its sender was playing rather than whatever the receiver had
   * switched on. A flag that changes the GAME does not belong here again.
   */
  it('defaults every flag off, with no exceptions left', () => {
    for (const on of Object.values(defaultFeatures())) expect(on).toBe(false);
  });

  it('holds no flag that changes what game is being played', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(ids).toEqual(['debug.overlay', 'ui.themePicker']);
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
    expect(parseOverrides('?ff=ui.themePicker')).toEqual({ 'ui.themePicker': true });
    expect(parseOverrides('?ff=-ui.themePicker')).toEqual({ 'ui.themePicker': false });
  });

  it('handles several at once, with whitespace', () => {
    expect(parseOverrides('?ff=ui.themePicker, -debug.overlay')).toEqual({
      'ui.themePicker': true,
      'debug.overlay': false,
    });
  });

  it('ignores unknown ids rather than throwing — a stale bookmark must still load', () => {
    expect(parseOverrides('?ff=nonsense,ui.themePicker')).toEqual({ 'ui.themePicker': true });
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
    const set = withOverrides(defaultFeatures(), { 'ui.themePicker': true });
    expect(decodeFeatures(encodeFeatures(set))).toEqual(set);
  });

  it('falls back to defaults for absent, corrupt, or wrong-shaped storage', () => {
    const base = defaultFeatures();
    expect(decodeFeatures(null)).toEqual(base);
    expect(decodeFeatures('not json')).toEqual(base);
    expect(decodeFeatures('null')).toEqual(base);
    expect(decodeFeatures('42')).toEqual(base);
    expect(decodeFeatures('["ui.themePicker"]')).toEqual(base);
  });

  // Adding or removing a flag must never brick an existing save.
  it('drops unknown keys and fills in missing ones', () => {
    const decoded = decodeFeatures('{"ui.themePicker":true,"since-removed":true}');
    expect(decoded).toEqual({ ...defaultFeatures(), 'ui.themePicker': true });
    expect(Object.keys(decoded)).not.toContain('since-removed');
  });

  it('ignores non-boolean values', () => {
    expect(decodeFeatures('{"ui.themePicker":"yes"}')).toEqual(defaultFeatures());
  });
});

describe('isEnabled', () => {
  it('reads the set it is given and nothing ambient', () => {
    const off: FeatureSet = defaultFeatures();
    const on = withOverrides(off, { 'ui.themePicker': true });
    expect(isEnabled(off, 'ui.themePicker')).toBe(false);
    expect(isEnabled(on, 'ui.themePicker')).toBe(true);
    expect(isEnabled(on, 'debug.overlay')).toBe(false);
  });
});
