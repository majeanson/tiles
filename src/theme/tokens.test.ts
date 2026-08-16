import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { brightness, COLOUR_GLYPH, COLOUR_MARK } from './tokens';

/**
 * The symbol language: one shape per colour, the same everywhere it appears.
 * The contrast maths for the fields themselves lives in theme.test.ts, which
 * measures every direction; this file is only about the second channel.
 */
describe('one symbol per colour', () => {
  /**
   * Marc, 2026-08-16: "instead of dots we could have a symbol per color and
   * this symbol could repeat so its coilor + symbol, good for all humans."
   *
   * Colour alone carried which field was whose, and roughly one man in twelve
   * cannot read the green/red half of that. The symbol is a second channel
   * saying the same thing, and it has to be the SAME symbol everywhere or it
   * is decoration rather than language.
   */
  it('gives every colour a shape, and no two the same', () => {
    const shapes = COLOURS.map((c) => COLOUR_GLYPH[c]);
    expect(shapes).toHaveLength(COLOURS.length);
    expect(new Set(shapes).size).toBe(COLOURS.length);
  });

  it('gives every colour a character, and no two the same', () => {
    const marks = COLOURS.map((c) => COLOUR_MARK[c]);
    expect(marks.every((m) => m.length > 0)).toBe(true);
    expect(new Set(marks).size).toBe(COLOURS.length);
  });

  it('is fixed rather than themed — a language that changes is not learned', () => {
    // Named explicitly so a future art direction cannot quietly reassign them
    // and leave a player's memory of the board wrong.
    expect(COLOUR_GLYPH).toEqual({
      green: 'triangle',
      yellow: 'diamond',
      red: 'square',
      blue: 'circle',
    });
  });
});

describe('the torch', () => {
  /**
   * Marc, 2026-08-16, asked for real light and dark and set its one rule in
   * the same breath: DIM, NEVER HIDDEN. Atmosphere must not cost a player
   * information, and a phone in daylight has to stay playable.
   */
  const LIGHT = { radius: 4, fade: 11, floor: 0.42 };

  it('is full inside the pool', () => {
    expect(brightness(LIGHT, 0)).toBe(1);
    expect(brightness(LIGHT, LIGHT.radius)).toBe(1);
  });

  it('falls off past it, and keeps falling', () => {
    const near = brightness(LIGHT, 6);
    const far = brightness(LIGHT, 12);
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
  });

  it('never reaches zero, however far out you look', () => {
    for (const dist of [20, 100, 5000]) {
      expect(brightness(LIGHT, dist)).toBeGreaterThanOrEqual(LIGHT.floor);
    }
  });

  it('holds near the source and gives way at the edge, rather than greying evenly', () => {
    // A linear falloff reads as a flat disc. The first third of the fade should
    // cost far less light than the last third.
    const start = brightness(LIGHT, LIGHT.radius) - brightness(LIGHT, LIGHT.radius + 3);
    const end = brightness(LIGHT, LIGHT.radius + 8) - brightness(LIGHT, LIGHT.radius + 11);
    expect(start).toBeGreaterThan(end);
  });

  it('is a flat 1 wherever a direction wants no falloff at all', () => {
    expect(brightness({ radius: 999, fade: 1, floor: 1 }, 400)).toBe(1);
  });
});
