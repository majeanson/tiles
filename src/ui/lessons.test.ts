import { describe, expect, it } from 'vitest';
import { BARE_TUNING, TUNING, type Tuning } from '@content/tuning';
import { CONCEPT_MARK, COLOUR_MARK, LANDMARK_GLYPH, TILE_GLYPH } from '@theme/tokens';
import { DAYLIGHT } from '@theme/themes/daylight';
import { TORCHLIT } from '@theme/themes/torchlit';
import type { Theme } from '@theme/tokens';
import { FIGURES } from './figure';
import { LESSONS, lessonCore, lessonDefine, lessonDetail, lessonLines, lessonOf } from './lessons';

/**
 * The registry's own rules — the ones that keep it a single source rather than
 * a fifth place to write a sentence.
 *
 * These are invariants, not pins. `teaching.pin.test.ts` and the manual
 * snapshots in `game.test.ts` say what the words ARE today; this says what
 * shape any lesson must have, now and after every stage of the migration.
 */

const CASES: readonly (readonly [string, Tuning, Theme])[] = [
  ['TUNING · torchlit', TUNING, TORCHLIT],
  ['TUNING · daylight', TUNING, DAYLIGHT],
  ['BARE_TUNING · torchlit', BARE_TUNING, TORCHLIT],
  ['BARE_TUNING · daylight', BARE_TUNING, DAYLIGHT],
];

/** Every mark any lesson is allowed to wear. A glyph invented here would be a
 *  symbol the board never draws — the thing `tips.ts` forbids for rows and the
 *  figures forbid for cells. */
const KNOWN_GLYPHS = new Set<string>([
  ...Object.values(LANDMARK_GLYPH),
  ...Object.values(CONCEPT_MARK),
  ...Object.values(COLOUR_MARK),
  TILE_GLYPH,
]);

describe('the lesson registry', () => {
  it('gives every lesson a unique id and a name', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size, 'two lessons share an id').toBe(ids.length);
    for (const lesson of LESSONS) {
      expect(lesson.name, `${lesson.id} has no name`).not.toBe('');
    }
  });

  it('finds every lesson by its own id', () => {
    for (const lesson of LESSONS) expect(lessonOf(lesson.id)).toBe(lesson);
  });

  /**
   * The one that keeps a beat a BEAT.
   *
   * The manual prints one `<p>` per beat and a card joins them with a space,
   * so a beat that is a clause rather than a sentence renders as an orphan
   * fragment in one host and a run-on in the other. Terminal punctuation is
   * the cheapest possible statement of "this is a whole thought".
   */
  it('speaks in whole sentences, under every tuning and every direction', () => {
    for (const [name, t, theme] of CASES) {
      for (const lesson of LESSONS) {
        for (const line of [...lessonLines(lesson, t, theme), ...lessonDetail(lesson, t, theme)]) {
          expect(line, `${lesson.id} · ${name}: an empty sentence`).not.toBe('');
          expect(line.trim(), `${lesson.id} · ${name}: "${line}" does not end a sentence`).toMatch(
            /[.!?]$/,
          );
        }
      }
    }
  });

  /**
   * Every lesson says SOMETHING in every economy. A lesson whose only beat is
   * conditional would go silent when its dial is off — and a manual section or
   * a teach card rendering nothing at all is worse than one that never fired.
   */
  it('never goes silent, whatever the dials say', () => {
    for (const [name, t, theme] of CASES) {
      for (const lesson of LESSONS) {
        expect(
          lessonLines(lesson, t, theme).length,
          `${lesson.id} says nothing at all under ${name}`,
        ).toBeGreaterThan(0);
        expect(lessonCore(lesson, t, theme), `${lesson.id} has no core under ${name}`).not.toBe('');
      }
    }
  });

  /**
   * A figure OR rows, never both — the portrait-card rule, stated where the
   * data is so a future lesson cannot quietly break it. A teaching card
   * already runs glyph, lead, body and button; a hex figure AND four marked
   * rows overflow an 844px screen.
   */
  it('never asks a card to carry a figure and rows at once', () => {
    for (const lesson of LESSONS) {
      expect(
        lesson.figure !== undefined && lesson.rows !== undefined,
        `${lesson.id} has both a figure and rows`,
      ).toBe(false);
    }
  });

  it('points every figure at one the table actually holds', () => {
    for (const lesson of LESSONS) {
      if (lesson.figure === undefined) continue;
      expect(
        FIGURES[lesson.figure],
        `${lesson.id} names a figure that does not exist`,
      ).toBeDefined();
    }
  });

  it('borrows every glyph from a mark registry, never inventing one', () => {
    for (const lesson of LESSONS) {
      if (lesson.glyph === undefined) continue;
      expect(KNOWN_GLYPHS, `${lesson.id} invented the glyph ${lesson.glyph}`).toContain(
        lesson.glyph,
      );
    }
  });

  /**
   * Terms are what `tips.ts` alternates over to find a tappable word, and it
   * matches on the literal string — so a lowercase term would never fire, and
   * a short term listed before a longer one containing it would swallow it.
   */
  it('keeps every term uppercase and longest-first', () => {
    const seen = new Set<string>();
    for (const lesson of LESSONS) {
      for (const term of lesson.terms) {
        expect(term, `${lesson.id}: "${term}" is not uppercase`).toBe(term.toUpperCase());
        expect(seen.has(term), `"${term}" is claimed by two lessons`).toBe(false);
        seen.add(term);
      }
      const lengths = lesson.terms.map((term) => term.length);
      expect(
        [...lengths].sort((a, b) => b - a),
        `${lesson.id}'s terms are not longest-first`,
      ).toEqual(lengths);
    }
  });

  /**
   * The definition and the card body are the same words, by construction —
   * this asserts the construction rather than the words, so it keeps holding
   * as the prose stages rewrite them.
   */
  it('builds its definition out of exactly the lines it shows', () => {
    for (const [name, t, theme] of CASES) {
      for (const lesson of LESSONS) {
        expect(lessonDefine(lesson, t, theme), `${lesson.id} · ${name}`).toBe(
          lessonLines(lesson, t, theme).join(' '),
        );
      }
    }
  });

  /** The core is the opening of the visible lesson, never a separate sentence
   *  written beside it — the property that makes "shorter" a filter. */
  it('opens the visible lesson with its own core', () => {
    for (const [name, t, theme] of CASES) {
      for (const lesson of LESSONS) {
        const core = lessonCore(lesson, t, theme);
        if (core === '') continue;
        expect(lessonDefine(lesson, t, theme).startsWith(core), `${lesson.id} · ${name}`).toBe(
          true,
        );
      }
    }
  });
});
