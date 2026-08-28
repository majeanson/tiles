import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { decodeManifest, manifestHas } from './assets';
import { themeCssVars } from './css';
import { DEFAULT_THEME_ID, parseThemeId, resolveTheme, THEMES } from './index';
import {
  clearance,
  fieldDots,
  fieldGround,
  luma,
  mix,
  MIN_FIELD_LIFT,
  MIN_LIT_FIELD_LIFT,
  type Rgb,
  type Surface,
  type Theme,
} from './tokens';

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
 * length, outdoors. It is a floor rather than a target: a healthy direction's
 * gaps run well past it, not up against it.
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

/**
 * Live ground against the board (2026-08-28).
 *
 * Twice the wall's floor, and deliberately: a wall has a hard band pattern and
 * a solid dark mass doing half the work, where a placed tile is a plain
 * gradient whose only claim on your attention is that it is not the paper. The
 * number is set where the two dark directions already sit comfortably —
 * torchlit's worst is MOSS's dark end at 0.145 — so it costs them nothing and
 * asks the one pale direction the question its palette was never asked.
 */
const MIN_GROUND_CLEARANCE = 0.1;

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

  // The goodbye (2026-08-19, WORKPLAN Stage 1): cold-survey and rot-bloom
  // left the registry. A `?theme=` link naming either one is not a typo —
  // it is someone's old bookmark or a link shared before today — and it
  // must still open a playable game rather than a blank one.
  it('falls back for a direction deleted since the link was shared', () => {
    expect(resolveTheme('cold-survey').id).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme('rot-bloom').id).toBe(DEFAULT_THEME_ID);
  });

  it('has no duplicate ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads a theme off the query string', () => {
    expect(parseThemeId('?theme=torchlit')).toBe('torchlit');
    // parseThemeId is a dumb string extractor — it does not know or care
    // whether the id it read still exists in the registry. That is
    // `resolveTheme`'s job, checked above.
    expect(parseThemeId('?seed=3&theme=some-old-link&ff=x')).toBe('some-old-link');
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
   * ...and separates them from the BOARD as well as from each other.
   *
   * The gap in the rule above, found by Marc's phone on 2026-08-28 ("ember in
   * light skin has no contrast compared to torchlit") and not by any test
   * here: the ladder asks whether the four terrains are tellable apart, and a
   * palette can satisfy that perfectly while one of its rungs sits on top of
   * the paper. Daylight's EMBER did — 0.022 L* from the background, 1.06:1,
   * a tile whose own SILHOUETTE was invisible — and every direction was
   * green, because no dark direction can fail this: black is already the
   * furthest thing from every colour they paint.
   *
   * Both ENDS, like `contrast.test.ts`: a gradient that starts clear of the
   * paper and finishes on it is still half a tile you cannot see. Stone is
   * deliberately exempt and always will be — "a tile that popped leaves the
   * map looking undrawn" is daylight's own words for a signal it sends ON
   * purpose, and stone sits 0.062 from the paper because of it.
   */
  it('separates every live terrain from the board it is drawn on', () => {
    const bg = theme.board.background;
    for (const colour of COLOURS) {
      const s = theme.terrain[colour];
      const ends: [string, number][] = [['fill', s.fill]];
      if (s.fillTo !== null) ends.push(['fillTo', s.fillTo]);
      for (const [end, paint] of ends) {
        const gap = clearance(paint, bg);
        expect(
          gap,
          `${theme.terrainNames[colour]}'s ${end} sits ${gap.toFixed(3)} from the board; ` +
            `${MIN_GROUND_CLEARANCE} is the floor that keeps a placed tile a visible shape`,
        ).toBeGreaterThanOrEqual(MIN_GROUND_CLEARANCE);
      }
    }
  });

  /**
   * Stone is the most common cell in the back half of a run and has no art in
   * the reference sheet, so it is the surface most likely to be wrong. It must
   * not be mistakeable for a live tile — that is the difference between "this
   * board is spent" and "this board still pays".
   */
  it('keeps every colour of its wall clear of the fog', () => {
    // DISTANCE from the background, not height above it (2026-08-25). The two
    // are the same sentence on a dark board and opposite ones on a pale board,
    // where blocked ground is the DARKEST thing on screen: `daylight`'s wall
    // scored -0.578 against a floor of 0.045 and failed a rule it passes by
    // more than any dark direction does. See `clearance`.
    const bg = theme.board.background;
    const paints: [string, number][] = [['fill', clearance(theme.wall.fill, bg)]];
    if (theme.wall.fillTo !== null) paints.push(['fillTo', clearance(theme.wall.fillTo, bg)]);
    if (theme.wall.pattern.kind === 'bands') {
      paints.push(
        ['band a', clearance(theme.wall.pattern.a, bg)],
        ['band b', clearance(theme.wall.pattern.b, bg)],
      );
    }
    for (const [name, gap] of paints) {
      expect(
        gap,
        `the wall's ${name} sits ${gap.toFixed(3)} from the background; ` +
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
    // Louder means FURTHER FROM THE BOARD, not lighter (2026-08-25). On a pale
    // direction the loudest edge is the darkest one — `daylight`'s ripe edge is
    // very nearly black — and the old comparison ranked the whole ladder
    // upside down. Same rule, stated in the terms it always meant.
    const bg = theme.board.background;
    expect(theme.board.ripeEdgeWidth).toBeGreaterThan(theme.board.edgeWidth);
    expect(clearance(theme.board.ripeEdge, bg)).toBeGreaterThan(clearance(theme.board.edge, bg));
    expect(clearance(theme.board.legalEdge, bg)).toBeGreaterThan(clearance(theme.board.edge, bg));
  });

  // Home (2026-08-19): a quiet PERMANENT marker, not a live one — it must
  // never read as louder than any state the stroke ladder actually decides
  // between, or the origin would compete with the harvest decision instead
  // of sitting quietly under it.
  it('keeps home quieter than ripe, which is quieter than a targeted pocket', () => {
    expect(theme.board.home.ringWidth).toBeLessThan(theme.board.ripeEdgeWidth);
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
    for (const name of [
      '--bg',
      '--ink',
      '--accent',
      '--magic',
      '--unique',
      '--danger',
      '--font-display',
    ]) {
      expect(vars[name], name).toBeTruthy();
    }
    for (const colour of COLOURS) {
      expect(vars[`--tile-${colour}`]).toMatch(/^#[0-9a-f]{6}$/);
      expect(vars[`--tile-${colour}-to`]).toMatch(/^#[0-9a-f]{6}$/);
    }
    // The rest of the board's vocabulary (2026-08-28), which the manual's
    // figures draw with. Asserted as real colours rather than merely present:
    // a var that resolves to `undefined` falls back to the hand-typed default
    // in `style.css`, which is torchlit's — so a missing one here would not
    // break the page, it would quietly draw daylight's manual in torchlit's
    // greys, which is precisely the class of bug this session was spent on.
    for (const name of ['--stone', '--wall', '--legal-edge', '--ripe-edge', '--lit']) {
      expect(vars[name], name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps the rarities’ colours their own — never the accent, never the selected ring', () => {
    // Marc, 2026-08-20: "make sure magic and unique have their own color,
    // distinctive of the normal selected tile color." In torchlit the
    // selected ring and the accent were the same gold, so this is the
    // contract as a test: four voices, no two alike.
    const { accent, magic, unique, panelEdgeActive } = theme.ink;
    expect(new Set([accent, magic, unique, panelEdgeActive]).size).toBeGreaterThanOrEqual(3);
    expect(magic).not.toBe(accent);
    expect(magic).not.toBe(panelEdgeActive);
    expect(magic).not.toBe(unique);
    expect(unique).not.toBe(accent);
    expect(unique).not.toBe(panelEdgeActive);
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
  it('reads every colour’s field at the same strength, against its own ground', () => {
    for (const colour of COLOURS) {
      const { ink, alpha } = fieldDots(theme, colour);
      // Distance from the ground, not height above it (2026-08-25) — the same
      // correction the wall clearance needed. On a pale board a field is
      // DARKER than the ground it marks, and the signed form scored
      // `daylight` at -0.250 against a floor of +0.25: a perfect field, read
      // upside down.
      const lift = alpha * clearance(ink, theme.empty.fill);
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

  /**
   * Art may not cost a field its marks (2026-08-27).
   *
   * When a terrain slot has a PNG, `fieldGround` ghosts it under the ground so
   * a claimed hex and the field around it read as one material. For a week it
   * ALSO replaced the field's pattern with that ghost, and the ghost is the one
   * layer nothing equalises: it is whatever the PNG's average happens to be
   * against `empty`, and then the torch multiplies that difference too.
   * Torchlit's MOSS field ended up 0.020 in L* from bare ground over most of
   * the board — the rule was still in the engine and gone from the screen.
   *
   * The marks are the channel `MIN_FIELD_LIFT` is a floor for, so this asserts
   * the structure that keeps that floor connected to something drawn: both
   * branches of `fieldGround` carry the pattern, art or no art.
   */
  it('never trades a field’s marks for its art', () => {
    for (const colour of COLOURS) {
      for (const hasArt of [false, true]) {
        const ground = fieldGround(theme, colour, hasArt);
        const base = ground.kind === 'art' ? ground.base : ground.surface;
        expect(
          base.pattern.kind,
          `the ${colour} field ${hasArt ? 'with' : 'without'} art draws no pattern; ` +
            `the ghost is the material layer and the pattern is the readable one`,
        ).not.toBe('none');
      }
    }
  });

  /**
   * And the torch may not eat what the pattern earns.
   *
   * The renderer dims a cell by tinting the whole sprite toward the board —
   * `mix(background, white, light)` used as a multiply — so outside the light
   * pool a field and the bare ground beside it are BOTH scaled down, and the
   * gap between them with them. Reproduced here from the same two tokens the
   * renderer reads, at each direction's own `light.floor`, which is the
   * brightness most of an endless board is at.
   */
  it('keeps a native field readable at its own light floor', () => {
    const floor = theme.light.floor;
    const tint = mix(theme.board.background, 0xffffff, floor);
    const under = (c: Rgb): Rgb => {
      const ch = (shift: number): number =>
        Math.round((((c >> shift) & 0xff) * ((tint >> shift) & 0xff)) / 255) & 0xff;
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };

    for (const colour of COLOURS) {
      const { ink, alpha } = fieldDots(theme, colour);
      const marked = mix(theme.empty.fill, ink, alpha);
      const lift = clearance(under(marked), under(theme.empty.fill));
      expect(
        lift,
        `the ${colour} field lifts ${lift.toFixed(3)} off bare ground at a light floor of ` +
          `${floor}; ${MIN_LIT_FIELD_LIFT} is what keeps the rule visible off the torch`,
      ).toBeGreaterThanOrEqual(MIN_LIT_FIELD_LIFT);
    }
  });
});
