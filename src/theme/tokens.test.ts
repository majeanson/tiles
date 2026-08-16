import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { COLOUR_GLYPH, COLOUR_MARK } from './tokens';

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
