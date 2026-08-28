import type { Tuning } from '@content/tuning';
import type { Theme } from '@theme/tokens';
import { LESSONS, lessonDefine, lessonOf, type Lesson, type LessonId } from './lessons';

/**
 * The glossary, now a VIEW of `lessons.ts` rather than a registry of its own
 * (2026-08-28).
 *
 * It was the right shape and the wrong scope. Shipped 2026-08-27 as "one place
 * that holds what a word MEANS", it did that job for the seventeen words the
 * manual prints in capitals — and could not hold the other half of the same
 * concept: the picture of the rule, the teaching card's wording, the manual's
 * own lines. So a word had a single source and the RULE behind it still had
 * four. `lessons.ts` is that registry widened to the concept; this file is
 * kept as the projection of it that every existing caller already speaks.
 *
 * Kept rather than deleted on purpose, and only for the length of the
 * migration: `tips.ts` builds its term matcher from `GLOSSARY`, `game.ts`
 * opens its definition card from `glossaryEntry`, and `glossary.test.ts` has
 * 215 lines pinning both. Rewriting those in the same commit that introduced
 * the registry would have made one diff out of two changes. The rename is its
 * own stage, and this file dies in it.
 */

/** @deprecated Use `LessonId`. Kept until the rename stage. */
export type GlossaryId = LessonId;

/**
 * A term as the matcher and the definition card want it — the four fields
 * those two consumers actually read, derived from the lesson behind them.
 */
export type GlossaryEntry = {
  readonly id: LessonId;
  readonly terms: readonly string[];
  readonly glyph?: string;
  readonly ink?: 'ink-magic' | 'ink-unique';
  readonly define: (t: Tuning, theme: Theme) => string;
};

const asEntry = (lesson: Lesson): GlossaryEntry => ({
  id: lesson.id,
  terms: lesson.terms,
  ...(lesson.glyph === undefined ? {} : { glyph: lesson.glyph }),
  ...(lesson.ink === undefined ? {} : { ink: lesson.ink }),
  // The visible lesson, joined — which is byte-identical to the `define` this
  // entry used to carry, because stage 3 moved each definition across as one
  // whole beat. When a lesson is later split into several, this projection
  // follows it automatically and the definition stops being a separate thing
  // anyone can forget to update.
  define: (t, theme) => lessonDefine(lesson, t, theme),
});

/**
 * Only lessons with a tappable word.
 *
 * A lesson with `terms: []` is a rule the manual never prints in capitals —
 * `glossary.ts` declined those on 2026-08-27 for the good reason that a term
 * nobody can reach is a dead definition, and the filter keeps that promise
 * while letting the registry behind it hold their prose anyway.
 */
export const GLOSSARY: readonly GlossaryEntry[] = LESSONS.filter(
  (lesson) => lesson.terms.length > 0,
).map(asEntry);

/** One entry by id, or `undefined` where no lesson has a tappable term. */
export function glossaryEntry(id: GlossaryId): GlossaryEntry | undefined {
  const lesson = lessonOf(id);
  return lesson === undefined || lesson.terms.length === 0 ? undefined : asEntry(lesson);
}

/** LUCK's shared opening clause. Re-exported from its new home so
 *  `view.ts`'s `statNote` keeps its one-line import through the migration. */
export { LUCK_CORE } from './lessons';
