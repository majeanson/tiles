import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { THEMES } from './index';
import { brightness, COLOUR_MARK, fieldPattern } from './tokens';

/**
 * The non-hue channels: a character per colour on the cards, and a texture
 * per colour on the ground. The contrast maths for the fields themselves
 * lives in theme.test.ts, which measures every direction; this file is about
 * the second channel staying a channel.
 */
describe('one mark per colour', () => {
  it('gives every colour a character, and no two the same', () => {
    const marks = COLOURS.map((c) => COLOUR_MARK[c]);
    expect(marks.every((m) => m.length > 0)).toBe(true);
    expect(new Set(marks).size).toBe(COLOURS.length);
  });
});

describe('field patterns', () => {
  /**
   * Marc, 2026-08-18: fields "should use the proper pattern (dots, diagonal,
   * verticals) so its easier on the eyes — blue and green are too lookalike."
   * This replaced the per-colour shapes he asked for on 2026-08-16 and then
   * retired after playing them: at ground scale, orientation survives where
   * silhouette does not. The claim to hold, in EVERY loaded direction: no two
   * colours' ground wears the same texture.
   */
  const signature = (p: ReturnType<typeof fieldPattern>): string =>
    p.kind === 'hatch' ? `hatch:${p.angleDeg}` : p.kind;

  it('keeps all four colours apart on the ground, in every direction', () => {
    for (const theme of THEMES) {
      const signatures = COLOURS.map((c) => signature(fieldPattern(theme, c)));
      expect({ theme: theme.id, distinct: new Set(signatures).size }).toEqual({
        theme: theme.id,
        distinct: COLOURS.length,
      });
    }
  });

  it('speaks the terrain’s own texture language where the terrain has one', () => {
    for (const theme of THEMES) {
      for (const c of COLOURS) {
        const terrain = theme.terrain[c].pattern;
        const field = fieldPattern(theme, c);
        if (terrain.kind === 'hatch') {
          expect(field).toMatchObject({ kind: 'hatch', angleDeg: terrain.angleDeg });
        }
        if (terrain.kind === 'dots') expect(field.kind).toBe('dots');
      }
    }
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
