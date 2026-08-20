import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { THEMES } from './index';
import {
  brightness,
  COLOUR_MARK,
  fieldDots,
  fieldGround,
  fieldOverlayPattern,
  fieldPattern,
} from './tokens';

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

describe('field overlays (2026-08-20, Stage 3’s second layer reaching the ground)', () => {
  /**
   * Stage 3 gave board TILES a second procedural layer over their axis
   * pattern — `terrain[c].overlay` — and `fieldPattern` never looked at it,
   * so territory ground fell one layer behind everything standing on it.
   * `fieldOverlayPattern` is the field's own version of that second layer.
   */
  it('carries a pattern wherever the terrain has an overlay to thin', () => {
    for (const theme of THEMES) {
      for (const c of COLOURS) {
        const overlay = theme.terrain[c].overlay;
        const field = fieldOverlayPattern(theme, c);
        if (overlay.kind === 'none') {
          expect(field.kind).toBe('none');
        } else {
          expect(field.kind).not.toBe('none');
        }
      }
    }
  });

  it('never doubles the base field pattern exactly — the two layers stay two frequencies', () => {
    for (const theme of THEMES) {
      for (const c of COLOURS) {
        const base = fieldPattern(theme, c);
        const overlay = fieldOverlayPattern(theme, c);
        if (overlay.kind === 'none') continue;
        expect(overlay).not.toEqual(base);
      }
    }
  });
});

describe(
  'field ground (2026-08-20, Marc: "the background tiles of territories colors have ' +
    'not switched textures like the others")',
  () => {
    /**
     * `fieldGround` is the ONE place that decides a native field's look —
     * `PixiRenderer#surfaceFor` and the gallery's `fieldCard` both call it, so
     * this file is the argument that the decision itself is right, not just
     * that the two callers agree with each other (they structurally cannot
     * disagree; they share the function).
     */
    it('without art, extends the procedural floor with the thinned overlay too', () => {
      for (const theme of THEMES) {
        for (const c of COLOURS) {
          const ground = fieldGround(theme, c, false);
          expect(ground.kind).toBe('procedural');
          if (ground.kind !== 'procedural') continue;
          expect(ground.surface.pattern).toEqual(fieldPattern(theme, c));
          expect(ground.surface.overlay).toEqual(fieldOverlayPattern(theme, c));
          expect(ground.surface.fill).toBe(theme.empty.fill);
        }
      }
    });

    it('with art, wears the terrain slot’s own PNG ghosted over the flat ground', () => {
      for (const theme of THEMES) {
        for (const c of COLOURS) {
          const asset = theme.terrain[c].asset;
          if (asset === null) continue; // nothing to ghost — every loaded direction with art covers this
          const ground = fieldGround(theme, c, true);
          expect(ground.kind).toBe('art');
          if (ground.kind !== 'art') continue;
          expect(ground.asset).toBe(asset);
          expect(ground.base).toEqual(theme.empty);
          // The ghost alpha equalises the same way `fieldDots` does — reused,
          // not reinvented, so a future retune of one retunes the other too.
          expect(ground.ghostAlpha).toBe(fieldDots(theme, c).alpha);
          expect(ground.ghostAlpha).toBeGreaterThan(0);
          expect(ground.ghostAlpha).toBeLessThanOrEqual(1);
        }
      }
    });

    it('falls back to procedural when the terrain has no asset slot at all, even if asked for art', () => {
      for (const theme of THEMES) {
        for (const c of COLOURS) {
          if (theme.terrain[c].asset !== null) continue;
          const ground = fieldGround(theme, c, true);
          expect(ground.kind).toBe('procedural');
        }
      }
    });
  },
);

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
