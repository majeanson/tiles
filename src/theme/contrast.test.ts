import { describe, expect, it } from 'vitest';
import { COLOURS } from '@content/tuning';
import { THEMES } from './index';
import { contrastRatio, mix, type Rgb, type Surface, type Theme } from './tokens';

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
});
