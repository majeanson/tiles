import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { THEMES } from './index';
import { contrastRatio, edgeCasing, mix, type Rgb, type Surface, type Theme } from './tokens';

/**
 * The contrast budget.
 *
 * `theme.test.ts` asks the greyscale question — can a player tell these four
 * grounds APART — and it has been asking it well since Session 2. This asks a
 * different one that nothing was asking: can a player READ the thing standing on
 * top of them.
 *
 * It exists because of a phone screenshot on 2026-08-25 ("constrast is very
 * bad"), and because nothing in the repository could have failed for the reason
 * the screenshot showed. `theme.test.ts` checked two crude L* deltas of ink and
 * inkDim against the BACKGROUND, said nothing at all about `inkFaint`, and never
 * once compared a label with the ground it is drawn on. Torchlit's own tile
 * number was at **1.46:1** over EMBER — pale gold on pale sand, unreadable — and
 * every test in the project was green.
 *
 * The bar is WCAG's, not one this project invented: 4.5:1 for text, 3:1 for a
 * mark or an edge. Two reasons to borrow rather than choose. The greyscale
 * threshold is a judgement about this game's board and had to be argued from
 * scratch; "can a person read this" is not a question about hex tiles, it has a
 * published answer, and a number nobody can move to make a direction pass is
 * worth more here than a number that could be. And this is the test a NEW
 * direction has to satisfy — `daylight` is the first light board in the game,
 * and it was written against these assertions rather than checked after.
 */

/** Text: numbers, labels, sentences. Anything a player is asked to read. */
const TEXT = 4.5;

/** Marks and edges: geometry that has to be SEEN, not read. */
const MARK = 3;

/**
 * Both ends of a surface's gradient, because a label sits over both.
 *
 * `theme.test.ts`'s `value()` takes the midpoint, which is right for asking
 * whether two grounds are the same tone. It is wrong here: a number is drawn
 * across the whole hex, so the end where the ink is weakest is the one that
 * decides whether the number can be read. ASH was found exactly this way — its
 * midpoint looked fine and its bright end was at 4.29:1.
 */
const ends = (s: Surface): readonly Rgb[] => (s.fillTo === null ? [s.fill] : [s.fill, s.fillTo]);

/**
 * Every opaque ground a board LABEL is ever drawn over.
 *
 * `ghost` is deliberately absent. The preview number sits over the ghost drawn
 * at its own alpha over whatever cell is underneath it, so the composite is a
 * real question and the ghost's raw fill is not the answer to it — asserting on
 * the raw fill would be a test that is easy to write and means nothing.
 */
function grounds(theme: Theme): readonly (readonly [string, Rgb])[] {
  const out: [string, Rgb][] = [];
  const add = (name: string, s: Surface): void => {
    for (const paint of ends(s)) out.push([name, paint]);
  };
  for (const colour of COLOURS) add(theme.terrainNames[colour], theme.terrain[colour]);
  add('stone', theme.stone);
  add('wall', theme.wall);
  add('empty', theme.empty);
  return out;
}

const at = (c: Rgb): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * What a ground actually looks like once it is only a memory.
 *
 * The two steps `PixiRenderer` takes, in order and from the same tokens: the
 * sprite is tinted toward the board by `fog.veil`, then drawn over the board at
 * `fog.alpha`. The torch falloff is deliberately absent because it is absent
 * there too — `view.ts` draws remembered ground at full light, which was Marc's
 * fix on 2026-08-20 for a fog that was black on black.
 */
function remembered(theme: Theme, ground: Rgb): Rgb {
  const bg = theme.board.background;
  return mix(bg, mix(ground, bg, theme.fog.veil), theme.fog.alpha);
}

describe.each(THEMES.map((t) => [t.name, t] as const))('%s', (_name, theme: Theme) => {
  /**
   * The chrome, against the two things it is ever set on.
   *
   * Both, because a panel is not the board — torchlit's `danger` cleared 4.62:1
   * on the board and 4.21 on a panel, and the panel is where the tile count
   * actually sits when the run ends. Checking one and assuming the other is how
   * the gap got there.
   */
  it('reads every ink role against the board and against a panel', () => {
    for (const role of [
      'ink',
      'inkDim',
      'inkFaint',
      'accent',
      'magic',
      'unique',
      'danger',
    ] as const) {
      for (const [surfaceName, behind] of [
        ['the board', theme.ink.bg],
        ['a panel', theme.ink.panel],
      ] as const) {
        const ratio = contrastRatio(theme.ink[role], behind);
        expect(
          ratio,
          `${role} ${at(theme.ink[role])} on ${surfaceName} ${at(behind)} is ${ratio.toFixed(2)}:1; ` +
            `${TEXT} is the floor for text`,
        ).toBeGreaterThanOrEqual(TEXT);
      }
    }
  });

  /**
   * The pair rule, and the whole reason `Ink.halo` exists.
   *
   * One ink over eight grounds cannot clear the bar on its own in any direction
   * — a light ink dies on the pale terrains, a dark one dies on the dark ones,
   * and whichever you pick there is a band in the middle where neither works. So
   * the label is drawn as ink PLUS outline and the rule is stated on the pair:
   * wherever the ink cannot be seen the halo can, and the letterform is legible
   * either way.
   *
   * Both halves must also be readable against EACH OTHER, or the outline eats
   * the glyph it is supposed to define.
   */
  it('reads a board label over every ground it can be drawn on', () => {
    const { ink, halo } = theme.ink;

    const pair = contrastRatio(ink, halo);
    expect(
      pair,
      `the label ink ${at(ink)} and its halo ${at(halo)} are ${pair.toFixed(2)}:1 apart; ` +
        `an outline that close to its own glyph erases it`,
    ).toBeGreaterThanOrEqual(TEXT);

    for (const [name, ground] of grounds(theme)) {
      const byInk = contrastRatio(ink, ground);
      const byHalo = contrastRatio(halo, ground);
      expect(
        Math.max(byInk, byHalo),
        `a label on ${name} ${at(ground)} reads at ${byInk.toFixed(2)}:1 by its ink and ` +
          `${byHalo.toFixed(2)}:1 by its halo; one of the two must reach ${TEXT}`,
      ).toBeGreaterThanOrEqual(TEXT);
    }
  });

  /**
   * The faint label, over the only ground it is ever drawn on.
   *
   * `PixiRenderer` draws a label in `inkFaint` in exactly one case: a REMEMBERED
   * landmark's glyph, on fogged ground. So the terrain's own fill is the wrong
   * thing to measure it against — fogged ground is that fill pulled toward the
   * board by `fog.veil` and then composited over the board at `fog.alpha`, which
   * is a different and much quieter colour. `remembered()` reproduces those two
   * steps from the same tokens the renderer reads.
   *
   * Measuring the raw fill instead would be a test that is easy to write and
   * means nothing — the same reason `ghost` is left out of `grounds()`.
   *
   * A glyph is geometry you find rather than prose you read, so it answers to
   * the mark bar. It is meant to be quiet; "dim, never hidden" is Marc's rule
   * about exactly this, and this is the floor under it.
   */
  it('keeps a faint label findable over the fogged ground it is drawn on', () => {
    for (const [name, ground] of grounds(theme)) {
      const behind = remembered(theme, ground);
      const best = Math.max(
        contrastRatio(theme.ink.inkFaint, behind),
        contrastRatio(theme.ink.halo, behind),
      );
      expect(
        best,
        `a faint glyph on remembered ${name} — ${at(ground)} fogged to ${at(behind)} — ` +
          `reads at ${best.toFixed(2)}:1; ${MARK} is the floor`,
      ).toBeGreaterThanOrEqual(MARK);
    }
  });

  /**
   * The strokes on the board, against the board.
   *
   * `theme.test.ts` already pins the ORDER of these — ripe louder than legal,
   * legal louder than plain — which is the thing that keeps the harvest decision
   * readable as a decision. This pins the floor underneath that order: an edge
   * nobody can see has no rank.
   *
   * `board.edge` is exempt on purpose. It is the seam every cell wears, it is
   * supposed to disappear, and it carries no information a player would go
   * looking for.
   */
  it('shows every edge that means something against the board', () => {
    const { board } = theme;
    for (const [name, colour] of [
      ['the ripe edge', board.ripeEdge],
      ['the legal edge', board.legalEdge],
      ['the home ring', board.home.ring],
    ] as const) {
      const ratio = contrastRatio(colour, board.background);
      expect(
        ratio,
        `${name} ${at(colour)} on the board ${at(board.background)} is ${ratio.toFixed(2)}:1; ` +
          `${MARK} is the floor for a mark`,
      ).toBeGreaterThanOrEqual(MARK);
    }
  });

  /**
   * Every edge that means something, over every ground it is actually drawn on
   * (2026-08-27).
   *
   * The test above checks the same strokes against the BOARD, which is the one
   * surface most of them are never drawn on: a legal edge rims a live tile, a
   * ripe edge rims the tile you must not miss, and the accent rims a landmark —
   * which wears the WALL's ground, because a destination is a thing standing on
   * the plane. Checking an edge against the background and assuming the terrain
   * is the same gap that put a tile's own number at 1.46:1 over EMBER, one
   * layer up.
   *
   * Two numbers this found, both on a direction that was fully green: torchlit's
   * ripe edge at **1.69:1** over EMBER — the loudest promise the board makes,
   * invisible on one of its four grounds — and daylight's accent at **1.02:1**
   * over the wall, which is to say a shrine that could not be told from a
   * claimed one. Neither is fixable by moving a colour, for the same reason
   * `Ink.halo` exists, so the rule is stated on a PAIR here too: the stroke
   * clears the bar on its own, or `edgeCasing` has something to lay under it
   * that does.
   */
  it('shows every edge over every ground it is drawn on, by itself or by its casing', () => {
    const edges: readonly (readonly [string, Rgb])[] = [
      ['the ripe edge', theme.board.ripeEdge],
      ['the legal edge', theme.board.legalEdge],
      ['the landmark accent', theme.ink.accent],
      ['the magic edge', theme.ink.magic],
      ['the unique edge', theme.ink.unique],
      ['the home ring', theme.board.home.ring],
    ];
    for (const [edgeName, stroke] of edges) {
      for (const [groundName, ground] of grounds(theme)) {
        const alone = contrastRatio(stroke, ground);
        const casing = edgeCasing(theme, stroke, ground);
        expect(
          alone >= MARK || casing !== null,
          `${edgeName} ${at(stroke)} on ${groundName} ${at(ground)} is ${alone.toFixed(2)}:1 ` +
            `and nothing this theme owns will case it; ${MARK} is the floor for a mark`,
        ).toBe(true);
      }
    }
  });

  /**
   * The two anchors, in memory (2026-08-27).
   *
   * A remembered shrine or territory is the only thing in the fog that still
   * wears an outline — Marc asked for it twice, on 2026-08-20 ("make them
   * clearer, its hard to see") and again the same day ("i still dont see
   * clearly") — and it is drawn in the accent veiled by half the fog's own
   * veil, over ground that is veiled by all of it. Both halves are reproduced
   * from the same tokens `PixiRenderer` reads. Daylight's landed at 2.85:1
   * over remembered ASH, under a floor the direction passes everywhere else.
   */
  it('keeps a remembered shrine or territory findable in its own fog', () => {
    const anchor = mix(theme.ink.accent, theme.board.background, theme.fog.veil * 0.5);
    for (const [name, ground] of grounds(theme)) {
      const behind = remembered(theme, ground);
      const alone = contrastRatio(anchor, behind);
      expect(
        alone >= MARK || edgeCasing(theme, anchor, behind) !== null,
        `a remembered anchor's edge ${at(anchor)} on remembered ${name} ${at(behind)} is ` +
          `${alone.toFixed(2)}:1 and nothing will case it; ${MARK} is the floor`,
      ).toBe(true);
    }
  });

  /**
   * The rarity marks, which are drawn on their own disc of the board's dark and
   * therefore read against THAT rather than against the terrain.
   *
   * Same reasoning as the halo, arrived at eighteen months earlier by the star
   * itself — see `PixiRenderer`'s rare-mark block. This is the assertion that
   * keeps the two in step.
   */
  it('shows both rarity marks on their own plinth', () => {
    for (const [name, colour] of [
      ['magic', theme.ink.magic],
      ['unique', theme.ink.unique],
    ] as const) {
      const ratio = contrastRatio(colour, theme.board.background);
      expect(
        ratio,
        `the ${name} star ${at(colour)} on its disc ${at(theme.board.background)} is ` +
          `${ratio.toFixed(2)}:1; ${MARK} is the floor`,
      ).toBeGreaterThanOrEqual(MARK);
    }
  });

  /**
   * An unclaimed destination has to read as LIT (2026-08-28).
   *
   * The test that was missing when Marc looked at the light skin on his phone
   * and said the `+` and the `★` "are not yellow but grey and they seem
   * inactive". Nothing here was broken in the way the rest of this file
   * measures — `edgeCasing` had already made the ring visible on 2026-08-27,
   * and its own doc names the same 1.02:1 this fixes. Visible is not the
   * claim, though. The claim a destination makes is "walk here, this pays",
   * it makes it in gold in every direction, and daylight was making it in a
   * brown that was 1.02:1 on the ground it was painted on — so the strongest
   * promise on the board arrived as a grey smudge that looked spent.
   *
   * Three grounds, because a destination is drawn at three opacities and the
   * beacon is the one that failed: solid (reached ground), faded to
   * `beaconFade` over the board (out past the frontier), and the edge chip,
   * which is drawn on the raw wall fill wherever the camera cannot reach the
   * beacon itself. Deliberately NOT allowing `edgeCasing` to rescue this one:
   * a casing can make a ring findable, and this assertion is about the ring
   * being the right COLOUR, which is a thing no outline can stand in for.
   */
  it('lights an unclaimed destination in a colour that reads on its own tablet', () => {
    const wall = theme.wall.fill;
    const faded = mix(wall, theme.board.background, 1 - theme.board.beaconFade);
    for (const [where, ground] of [
      ['a reached destination', wall],
      ['a beacon', faded],
      ['an edge chip', wall],
    ] as const) {
      const ratio = contrastRatio(theme.ink.lit, ground);
      expect(
        ratio,
        `${where}: lit ${at(theme.ink.lit)} on ${at(ground)} is ${ratio.toFixed(2)}:1; ` +
          `${MARK} is the floor, and a destination nobody can see is a destination nobody walks to`,
      ).toBeGreaterThanOrEqual(MARK);
    }
  });

  /*
   * There is deliberately NO assertion here that a lit destination reads as
   * different from a spent one, and the reason is worth keeping. It was
   * written first as `contrastRatio(lit, stone)` and then as
   * `contrastRatio(wall, stone)`, and both failed the directions that have
   * shipped and work: torchlit's two tablets are 2.10:1 apart and the
   * placeholder's are 1.26:1. Neither number is a bug. Claimed and unclaimed
   * are told apart by the GOLD — present, ringed and stippled on one, absent
   * on the other — and "one of these has a colour the other does not" is not
   * a contrast ratio between two swatches. The rule above is the whole rule;
   * a second one invented to look thorough would have had to have its bar
   * lowered until it could not fail, which is the thing this file's own
   * header forbids.
   */
});
