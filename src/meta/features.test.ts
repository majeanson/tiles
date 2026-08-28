import { describe, expect, it } from 'vitest';
import {
  decodeFeatures,
  defaultFeatures,
  encodeFeatures,
  FEATURES,
  isEnabled,
  parseOverrides,
  PLAYER_FEATURES,
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
    // ui.sound joined 2026-08-19: presentation, the theme picker's own
    // class — three synthesised moments, voiced by the theme, changing
    // nothing a shared seed would replay differently. fame.timeline lived
    // here one launch week (2026-08-20 → same week): Marc ruled the diary
    // ON for everybody — record-keeping the engine never sees, and launch
    // day is the only clean epoch the record would ever get. A flag that
    // changes the GAME still does not belong here.
    const ids = FEATURES.map((f) => f.id);
    expect(ids).toEqual(['debug.overlay', 'ui.sound']);
  });

  it('describes every flag, so the registry never becomes a list of mystery ids', () => {
    for (const f of FEATURES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.note.length).toBeGreaterThan(0);
    }
  });

  /**
   * SETTINGS became a public screen on 2026-08-27 (Marc: "no more developer
   * ... make it public"), and it renders `PLAYER_FEATURES` rather than a
   * filter of its own. So the registry decides what a stranger is offered —
   * which means a new flag is private until somebody says otherwise, and a
   * note that reads like a maintainer's notebook cannot reach a player.
   */
  it('offers a player only the public switches, in a voice written for them', () => {
    expect(PLAYER_FEATURES.map((f) => f.id)).toEqual(['ui.sound']);
    for (const f of PLAYER_FEATURES) {
      expect(f.wired).toBe(true);
      // Short enough to read at a glance, and free of the dates and names
      // that belong in the comments above each entry.
      expect(f.note.length).toBeLessThan(120);
      expect(f.note).not.toMatch(/20\d\d-\d\d-\d\d/);
      expect(f.note).not.toContain('Marc');
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
    expect(parseOverrides('?ff=ui.sound')).toEqual({ 'ui.sound': true });
    expect(parseOverrides('?ff=-ui.sound')).toEqual({ 'ui.sound': false });
  });

  it('handles several at once, with whitespace', () => {
    expect(parseOverrides('?ff=ui.sound, -debug.overlay')).toEqual({
      'ui.sound': true,
      'debug.overlay': false,
    });
  });

  it('ignores unknown ids rather than throwing — a stale bookmark must still load', () => {
    expect(parseOverrides('?ff=nonsense,ui.sound')).toEqual({ 'ui.sound': true });
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
    const set = withOverrides(defaultFeatures(), { 'ui.sound': true });
    expect(decodeFeatures(encodeFeatures(set))).toEqual(set);
  });

  it('falls back to defaults for absent, corrupt, or wrong-shaped storage', () => {
    const base = defaultFeatures();
    expect(decodeFeatures(null)).toEqual(base);
    expect(decodeFeatures('not json')).toEqual(base);
    expect(decodeFeatures('null')).toEqual(base);
    expect(decodeFeatures('42')).toEqual(base);
    expect(decodeFeatures('["ui.sound"]')).toEqual(base);
  });

  // Adding or removing a flag must never brick an existing save. The key
  // used here is a real one: `ui.themePicker` was deleted on 2026-08-27, and
  // every device that ever flipped it still has it in storage.
  it('drops unknown keys and fills in missing ones', () => {
    const decoded = decodeFeatures('{"ui.sound":true,"ui.themePicker":true}');
    expect(decoded).toEqual({ ...defaultFeatures(), 'ui.sound': true });
    expect(Object.keys(decoded)).not.toContain('ui.themePicker');
  });

  it('ignores non-boolean values', () => {
    expect(decodeFeatures('{"ui.sound":"yes"}')).toEqual(defaultFeatures());
  });
});

describe('isEnabled', () => {
  it('reads the set it is given and nothing ambient', () => {
    const off: FeatureSet = defaultFeatures();
    const on = withOverrides(off, { 'ui.sound': true });
    expect(isEnabled(off, 'ui.sound')).toBe(false);
    expect(isEnabled(on, 'ui.sound')).toBe(true);
    expect(isEnabled(on, 'debug.overlay')).toBe(false);
  });
});
