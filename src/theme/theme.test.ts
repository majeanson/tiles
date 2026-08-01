import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { decodeManifest, manifestHas } from './assets';
import { themeCssVars } from './css';
import { DEFAULT_THEME_ID, parseThemeId, resolveTheme, THEMES } from './index';
import { luma, type Surface, type Theme } from './tokens';

/**
 * The art direction, checked without a screen.
 *
 * Most of what a theme claims is taste and cannot be tested. One thing is not:
 * **every direction handed down insists the terrains must be tellable apart in
 * GREYSCALE**, because a board that separates by hue alone dies in sunlight and
 * is unplayable for a colour-blind player. "Value spacing does most of the work"
 * is a checkable sentence, so it is checked here rather than admired in a
 * document.
 *
 * This is the same move the harness made for the economy. A design claim nobody
 * can fail is not a claim.
 */

/**
 * A surface's representative value: the middle of its gradient.
 *
 * Patterns are ignored on purpose. A hatch at 16% moves the average by a couple
 * of percent and cannot rescue two fills that sit on top of each other — if a
 * direction needs its texture to tell two terrains apart, it has already failed
 * the test the sunlight will run.
 */
const value = (s: Surface): number =>
  s.fillTo === null ? luma(s.fill) : (luma(s.fill) + luma(s.fillTo)) / 2;

/**
 * The bar, in L*.
 *
 * 0.05 is five points of perceptual lightness between neighbouring terrains —
 * about the smallest step that survives a phone at half brightness, held at arm's
 * length, outdoors. It is a floor rather than a target: Cold Survey's tightest
 * pair sits at 0.072 and its widest at 0.273, which is what a healthy direction
 * looks like.
 *
 * This number found four real bugs the first time it ran, one of them in the
 * palette that had already shipped. Do not relax it to make a direction pass —
 * darken something.
 */
const MIN_SEPARATION = 0.05;

/** Stone against live ground. Weaker, because texture and pattern also carry it. */
const MIN_STONE_SEPARATION = 0.03;

describe('the registry', () => {
  it('defaults to the placeholder, because Gate E is shut', () => {
    // Not a style preference. CLAUDE.md and LOG.md gate all art direction behind
    // gates A-D, and shipping a direction as the default would be deciding one.
    // If this test is failing because the default moved, the gate should have
    // moved first — check LOG.md says so.
    expect(DEFAULT_THEME_ID).toBe('placeholder');
    expect(resolveTheme(null).id).toBe('placeholder');
  });

  it('falls back rather than throwing on an id nobody has', () => {
    expect(resolveTheme('no-such-direction').id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme(undefined).id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme('').id).toBe(DEFAULT_THEME_ID);
  });

  it('has no duplicate ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads a theme off the query string', () => {
    expect(parseThemeId('?theme=torchlit')).toBe('torchlit');
    expect(parseThemeId('?seed=3&theme=rot-bloom&ff=x')).toBe('rot-bloom');
    expect(parseThemeId('?seed=3')).toBeNull();
    expect(parseThemeId('?theme=')).toBeNull();
    expect(parseThemeId('')).toBeNull();
  });
});

describe.each(THEMES.map((t) => [t.name, t] as const))('%s', (_name, theme: Theme) => {
  it('paints all four colours and names all four', () => {
    for (const colour of COLOURS) {
      expect(theme.terrain[colour]).toBeDefined();
      expect(theme.terrainNames[colour].length).toBeGreaterThan(0);
    }
  });

  /**
   * The one that matters. Sort the four terrains by value and require a real gap
   * between each neighbouring pair.
   *
   * Rot Bloom is the direction its own author flagged as at risk here — "it runs
   * dark and desaturated by design, so crypt and catacomb sit close in greyscale"
   * — and the prescribed fix was to pull burial ground lighter than catacomb
   * rather than to add hue. That fix is applied in `rot-bloom.ts`. This test is
   * what stops it being quietly reverted.
   */
  it('separates its four terrains by value, not by hue', () => {
    const values = COLOURS.map((c) => value(theme.terrain[c])).sort((a, b) => a - b);

    for (let i = 1; i < values.length; i++) {
      const gap = (values[i] ?? 0) - (values[i - 1] ?? 0);
      expect(
        gap,
        `terrains ${i - 1} and ${i} are ${gap.toFixed(3)} apart in luma; ` +
          `the board needs ${MIN_SEPARATION} to survive greyscale`,
      ).toBeGreaterThanOrEqual(MIN_SEPARATION);
    }
  });

  /**
   * Stone is the most common cell in the back half of a run and has no art in
   * the reference sheet, so it is the surface most likely to be wrong. It must
   * not be mistakeable for a live tile — that is the difference between "this
   * board is spent" and "this board still pays".
   */
  it('keeps stone distinguishable from every live colour', () => {
    const stone = value(theme.stone);
    for (const colour of COLOURS) {
      const gap = Math.abs(stone - value(theme.terrain[colour]));
      expect(gap, `stone is ${gap.toFixed(3)} from ${colour} in L*`).toBeGreaterThanOrEqual(
        MIN_STONE_SEPARATION,
      );
    }
  });

  it('keeps ripe louder than legal, and legal louder than nothing', () => {
    // Ripe is the entire harvest decision. If it is not the loudest edge on the
    // board the player is guessing, and the gate B question stops meaning
    // anything.
    expect(theme.board.ripeEdgeWidth).toBeGreaterThan(theme.board.edgeWidth);
    expect(luma(theme.board.ripeEdge)).toBeGreaterThan(luma(theme.board.edge));
    expect(luma(theme.board.legalEdge)).toBeGreaterThan(luma(theme.board.edge));
  });

  it('reads its own text against its own background', () => {
    // Not a WCAG audit — a floor. Ink that vanishes into the board is the one
    // failure that makes a direction untestable rather than merely ugly.
    expect(Math.abs(luma(theme.ink.ink) - luma(theme.ink.bg))).toBeGreaterThan(0.25);
    expect(Math.abs(luma(theme.ink.inkDim) - luma(theme.ink.bg))).toBeGreaterThan(0.1);
  });

  it('ends every font stack in something the device already has', () => {
    // A webfont is always late and sometimes never arrives. Every stack has to
    // land on a system face, or a tunnel is a blank screen.
    for (const stack of [theme.type.display, theme.type.label, theme.type.body]) {
      expect(stack).toMatch(/(serif|sans-serif|monospace)\s*$/);
    }
  });

  it('exports a complete set of custom properties', () => {
    const vars = themeCssVars(theme);
    for (const name of ['--bg', '--ink', '--accent', '--danger', '--font-display']) {
      expect(vars[name], name).toBeTruthy();
    }
    for (const colour of COLOURS) {
      expect(vars[`--tile-${colour}`]).toMatch(/^#[0-9a-f]{6}$/);
      expect(vars[`--tile-${colour}-to`]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('points every asset slot it names at a slot that exists', () => {
    // A theme naming a slot the registry has never heard of would silently never
    // load its art, which is the kind of bug you find six weeks later.
    const surfaces = [
      ...COLOURS.map((c) => theme.terrain[c]),
      theme.wall,
      theme.stone,
      theme.empty,
      theme.ghost,
    ];
    for (const s of surfaces) {
      if (s.asset === null) continue;
      expect(decodeManifest({ [theme.id]: [s.asset] })[theme.id]).toContain(s.asset);
    }
  });
});

describe('the asset manifest', () => {
  it('treats absence, rubbish and stale ids as an empty book', () => {
    expect(decodeManifest(null)).toEqual({});
    expect(decodeManifest('not json')).toEqual({});
    expect(decodeManifest({ torchlit: 'terrain.green' })).toEqual({});
    expect(decodeManifest({ torchlit: ['nope.gone'] })).toEqual({});
  });

  it('keeps the ids it recognises and drops the ones it does not', () => {
    const manifest = decodeManifest({ torchlit: ['terrain.green', 'nope.gone', 'fog.hard'] });
    expect(manifest['torchlit']).toEqual(['terrain.green', 'fog.hard']);
    expect(manifestHas(manifest, 'torchlit', 'terrain.green')).toBe(true);
    expect(manifestHas(manifest, 'torchlit', 'terrain.red')).toBe(false);
    expect(manifestHas(manifest, 'cold-survey', 'terrain.green')).toBe(false);
  });
});
