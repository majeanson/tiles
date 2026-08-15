import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { decodeManifest, manifestHas } from './assets';
import { themeCssVars } from './css';
import { DEFAULT_THEME_ID, parseThemeId, resolveTheme, THEMES } from './index';
import { fieldDots, luma, MIN_FIELD_LIFT, type Surface, type Theme } from './tokens';

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

/**
 * Walls against the void. On the endless plane the canvas background IS the
 * fog — undiscovered ground is simply not drawn — so a wall whose paint sits
 * on the background's value reads as a hole in the world instead of a thing
 * blocking it. Every colour a wall is painted with (fill, gradient end, and
 * BOTH band stripes) must clear the background; the first run of this test
 * found the dark stripe within 0.007 of the background in all three
 * handed-down directions.
 */
const MIN_WALL_CLEARANCE = 0.045;

describe('the registry', () => {
  it('defaults to the direction Gate E chose', () => {
    // Not a style preference, in either direction. For eleven sessions this
    // asserted `placeholder`, because Gate E is "no art direction until A–D
    // pass" and a default IS the decision. The gate opened on 2026-08-15 and
    // the decision is torchlit (LOG.md, Session 15). If this test fails
    // because the default moved again, the ledger should have moved first.
    expect(DEFAULT_THEME_ID).toBe('torchlit');
    expect(resolveTheme(null).id).toBe('torchlit');
  });

  // Four colours a player must tell apart in half a second cannot be four
  // synonyms for the same thing. Torchlit's reference words were CRYPT /
  // CEMETERY / BURIAL GROUND / CATACOMB; they were renamed when the gate
  // opened, and this keeps any future direction from repeating the mistake.
  it('gives its colours four names nobody could confuse', () => {
    for (const theme of THEMES) {
      const names = COLOURS.map((c) => theme.terrainNames[c]);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name.length).toBeGreaterThan(0);
        // No name may be a prefix of another — that is what makes two words
        // read as one at a glance on a small card.
        const others = names.filter((n) => n !== name);
        expect(others.some((n) => n.startsWith(name))).toBe(false);
      }
    }
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
  it('keeps every colour of its wall clear of the fog', () => {
    const bg = luma(theme.board.background);
    const paints: [string, number][] = [['fill', luma(theme.wall.fill)]];
    if (theme.wall.fillTo !== null) paints.push(['fillTo', luma(theme.wall.fillTo)]);
    if (theme.wall.pattern.kind === 'bands') {
      paints.push(['band a', luma(theme.wall.pattern.a)], ['band b', luma(theme.wall.pattern.b)]);
    }
    for (const [name, paint] of paints) {
      expect(
        paint - bg,
        `the wall's ${name} sits ${(paint - bg).toFixed(3)} above the background; ` +
          `${MIN_WALL_CLEARANCE} is the floor that keeps blocked ground from reading as fog`,
      ).toBeGreaterThanOrEqual(MIN_WALL_CLEARANCE);
    }
  });

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

/**
 * Native fields are a RULE — a tile of the right colour on its own ground is
 * worth one more — so a field you cannot see is a rule you cannot use. Marc
 * reported exactly that on 2026-08-15: the dots were invisible on some
 * colours. They were drawn in each colour's own fill at a flat alpha, so
 * their legibility was whatever that colour's contrast happened to be.
 */
describe.each(THEMES.map((t) => [t.name, t] as const))('%s field dots', (_name, theme: Theme) => {
  const ground = luma(theme.empty.fill);

  it('reads every colour’s field at the same strength, against its own ground', () => {
    for (const colour of COLOURS) {
      const { ink, alpha } = fieldDots(theme, colour);
      const lift = alpha * (luma(ink) - ground);
      expect(
        lift,
        `${colour} field dots lift ${lift.toFixed(3)} over the ground; ` +
          `${MIN_FIELD_LIFT} is the floor that keeps a field visible`,
      ).toBeGreaterThanOrEqual(MIN_FIELD_LIFT - 0.001);
      // And never so loud that ground reads as a placed tile.
      expect(alpha).toBeLessThanOrEqual(0.5);
    }
  });

  it('keeps the four fields telling you WHICH colour owns the ground', () => {
    // Brightening for contrast must not converge the four on one pale grey:
    // the whole point of a field is that it names a colour, and Marc's second
    // report was that blue and green fields still read as each other. Being
    // merely UNEQUAL is not enough — they have to be far apart in the channels
    // an eye actually compares.
    const inks = COLOURS.map((c) => fieldDots(theme, c).ink);
    const apart = (a: number, b: number): number =>
      Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) +
      Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) +
      Math.abs((a & 0xff) - (b & 0xff));

    for (let i = 0; i < inks.length; i++) {
      for (let j = i + 1; j < inks.length; j++) {
        const gap = apart(inks[i]!, inks[j]!);
        expect(
          gap,
          ` and  field dots are  apart in RGB; ` + 'fields that close read as the same ground',
        ).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
