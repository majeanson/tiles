import type { Tuning } from '@content/tuning';
import type { TeachId } from '@meta/progress';
import { CONCEPT_MARK, LANDMARK_GLYPH, type Theme } from '@theme/tokens';
import type { FigureId } from './figure';
import type { TipRow } from './view';

/**
 * One lesson, one source (2026-08-28).
 *
 * Marc: "the world, the screen, etc. should be from in-game too, not just
 * text. lets think of a fresh new idea that agglomerates all concept. a single
 * source: when you get helped in game, its help you can review there."
 *
 * He was describing a measurable defect. Before this file the same rule was
 * written in as many places as it had doors: the ripening rule six times from
 * four independent literals (the manual's START line, the manual's RIPEN line,
 * the teach card, the glossary, `describeHexOf`, the figure caption); "relics
 * travel, what you buy stays" five times, and the comments at
 * `shell/session.ts` record that it had already silently DRIFTED twice. Four
 * registries — `TEACH_IDS`, `GLOSSARY`, `FIGURES`, `#helpSections` — all keyed
 * off or beside `TeachId`, none of them the one the others answered to.
 *
 * The cure is not new. It is `LUCK_CORE` and `LAST_GASP_RULE` — Marc's own two
 * shared clauses, each already feeding two or three doors that append only the
 * ending they alone need — generalised from a string constant to a registry,
 * with the pictures hung off it.
 *
 * ## Why beats, and not three prose fields
 *
 * The obvious shape is `{ short, card, detail }`. It is also exactly today's
 * bug with a nicer type: **three prose fields drift because they are three
 * arbitrary LENGTHS.** Nobody can hold "the forty-word ripening rule and the
 * twenty-five-word one and the fifteen-word one" in their head, so when one is
 * edited the others rot — which is precisely how six copies happened.
 *
 * So the unit is not a length. It is a SENTENCE WITH A WEIGHT. "Shorter" then
 * becomes a filter over one list, and a filter cannot drift from what it
 * filters:
 *
 * - `core`   — the lesson in one sentence. Every door prints it.
 * - `more`   — the rest of the visible lesson.
 * - `detail` — the manual's DETAILS fold, and nowhere else.
 *
 * A door that has room for one sentence takes `core` and appends its own live
 * clause, which is what `statNote('luck')` already does by hand. That
 * appending is the escape hatch that stops anyone reaching for a fourth field.
 *
 * ## The hard boundary
 *
 * A beat sees `(Tuning, Theme)` and nothing else — not the detour flag, not
 * the hooks, not the worn perk, not the run's seed. The signature draws the
 * migration line for free: prose that needs a session fact (WHY, WHICH GAME,
 * WHAT REMAINS, THIS BUILD, WHAT YOU CARRY, HOW A RUN ENDS) stays a literal in
 * `#helpSections`, and that exclusion is a gift rather than a compromise —
 * it is exactly the copy Marc tuned on 2026-08-27 and exactly the copy that is
 * duplicated nowhere.
 *
 * Pure and DOM-free, like `view.ts` and the `glossary.ts` it absorbs. It lives
 * in `src/ui/` rather than `src/content/` because `eslint.config.js` denies
 * `content/` every import but its own, and a lesson needs `Theme` for the
 * terrain names and `TipRow` for its marked rows.
 */

/**
 * Every concept the game can teach.
 *
 * A superset of `TeachId` — the drip's ledger — because some concepts are
 * words the manual prints without ever firing a card for them. The extra six
 * are the ones `glossary.ts` added on 2026-08-27 for exactly that reason.
 */
export type LessonId = TeachId | 'pocket' | 'worth' | 'bounty' | 'stash' | 'sizeBonus' | 'stone';

/** How heavy a sentence is. Absent means `more`. */
export type Weight = 'core' | 'more' | 'detail';

/**
 * One sentence of a lesson, in this run's own numbers.
 *
 * Returning `null` is how a dial being off removes a sentence rather than
 * flattening it: `redAshMatches`, `harvestSizeCap`, `holdSlots` and the rest
 * each own a beat that simply is not spoken when the system is zeroed. That is
 * the same conditional the literals already carried, kept whole.
 *
 * A beat is a WHOLE SENTENCE, never a clause. The manual prints one `<p>` per
 * beat, and a clause-level beat would render an orphan fragment; the tests
 * enforce it by checking every beat ends in terminal punctuation.
 */
export type Beat = {
  readonly say: (t: Tuning, theme: Theme) => string | null;
  readonly at?: Weight;
};

export type Lesson = {
  readonly id: LessonId;
  /**
   * What this lesson is CALLED — the manual's heading, the teach card's lead,
   * the term card's title. `terms[0]` today, kept as its own field because a
   * lesson with no tappable word still needs a name.
   */
  readonly name: string;
  /** From one of the four mark registries only — never a literal character. */
  readonly glyph?: string;
  /** MAGIC and UNIQUE keep the ink `rarityInked` already gives them. */
  readonly ink?: 'ink-magic' | 'ink-unique';
  /**
   * UPPERCASE, longest first — the spellings `tips.ts`'s matcher alternates
   * over. An EMPTY list is a lesson with no tappable word, which is how the
   * nine concepts `glossary.ts` deliberately left out (`costRise`, `glow`,
   * `field`, `lens`, `purse`, `colours`, `place`, `wall`, `lastGasp`) can hold
   * their prose here without becoming a button nobody could ever reach.
   */
  readonly terms: readonly string[];
  readonly beats: readonly Beat[];
  /** A set this lesson lists — the four grounds, the purse's spends. */
  readonly rows?: (t: Tuning, theme: Theme) => readonly TipRow[];
  /**
   * The picture of this rule. Travels WITH the lesson, so every door that
   * teaches it draws the same one — which is the whole of Marc's ask.
   *
   * A lesson has a figure or rows, never both: a portrait teaching card
   * already runs glyph, lead, body and button, and both together overflow it.
   * `lessons.test.ts` asserts it.
   */
  readonly figure?: FigureId;
};

/** LUCK's shared opening clause, moved from `glossary.ts` (2026-08-27).
 *  The LUCK lesson and `statNote('luck')` both read it; `statNote` appends the
 *  live conversion rate, which is the one thing this clause never says. */
export const LUCK_CORE = 'LUCK — a purse, not a score.';

const weightOf = (beat: Beat): Weight => beat.at ?? 'more';

/** Every sentence of one weight that this run actually speaks. */
function beatsAt(lesson: Lesson, weight: Weight, t: Tuning, theme: Theme): string[] {
  const out: string[] = [];
  for (const beat of lesson.beats) {
    if (weightOf(beat) !== weight) continue;
    const said = beat.say(t, theme);
    if (said !== null && said !== '') out.push(said);
  }
  return out;
}

/** The visible lesson: `core` then `more`, one string per sentence. What the
 *  manual prints as its lines. */
export function lessonLines(lesson: Lesson, t: Tuning, theme: Theme): string[] {
  return [...beatsAt(lesson, 'core', t, theme), ...beatsAt(lesson, 'more', t, theme)];
}

/** The folded arithmetic — the manual's DETAILS, and nowhere else. */
export function lessonDetail(lesson: Lesson, t: Tuning, theme: Theme): string[] {
  return beatsAt(lesson, 'detail', t, theme);
}

/**
 * The lesson in ONE sentence, for a door that has room for one and then
 * appends its own live clause. `LUCK_CORE`'s job, generalised.
 */
export function lessonCore(lesson: Lesson, t: Tuning, theme: Theme): string {
  return beatsAt(lesson, 'core', t, theme).join(' ');
}

/**
 * The visible lesson as one paragraph — the term card's definition, and the
 * body of a teaching card.
 *
 * That those two are the SAME words is the design's honest claim. Today they
 * differ only because they were written twice, days apart, by two passes.
 */
export function lessonDefine(lesson: Lesson, t: Tuning, theme: Theme): string {
  return lessonLines(lesson, t, theme).join(' ');
}

/**
 * The lessons themselves.
 *
 * **Stage 3 is deliberately inert.** Every entry here is one of `glossary.ts`'s
 * sixteen definitions, moved in VERBATIM as a single beat, so the derived
 * `GLOSSARY` hands back byte-identical strings and Stage 0's pins pass without
 * an edit. The beats are split, re-weighted and re-sourced from the manual's
 * own wording in the stages that follow — one lesson per commit, each with its
 * prose change listed. A registry that changed the words on the way in would
 * have made every later diff unreadable.
 *
 * Figures are attached here because they are already keyed by the same
 * concepts: `ripen` is the `ripe` lesson's picture, `pop` is `pop`'s, `rare` is
 * MAGIC's, `stash` is THE STASH's. `place` and `destinations` teach sections
 * rather than single concepts and stay on the manual until stage 5.
 */
export const LESSONS: readonly Lesson[] = [
  {
    id: 'ripe',
    name: 'RIPENS',
    terms: ['RIPENS'],
    figure: 'ripen',
    beats: [
      {
        at: 'core',
        say: () =>
          'A tile RIPENS once every one of its six sides is covered — by another tile, by stone, by a wall, or by the map’s edge. A ripe tile shows its WORTH and can be popped.',
      },
    ],
  },
  {
    id: 'pop',
    name: 'POP',
    terms: ['POP'],
    figure: 'pop',
    beats: [
      {
        at: 'core',
        say: () =>
          'POP cashes a ripe pocket: it pays tiles to keep you placing, and points as your score. Waiting lets a pocket grow and pays more, but every placement still costs tiles, so waiting too long can end a run before it pops.',
      },
    ],
  },
  {
    id: 'pocket',
    name: 'POCKET',
    terms: ['POCKET'],
    beats: [
      {
        at: 'core',
        say: () =>
          'A POCKET is a ripe tile and every ripe tile touching it — they pop together, as one. Tap any ripe tile to price its pocket; the buttons show what it pays.',
      },
    ],
  },
  {
    id: 'worth',
    name: 'WORTH',
    terms: ['WORTH'],
    beats: [
      {
        at: 'core',
        say: () =>
          'WORTH counts how many of a tile’s six sides touch a match — the same colour, or a wild rare tile. A pop scores the pocket’s summed worth, so the more that ripen together, the more it pays.',
      },
    ],
  },
  {
    id: 'cache',
    name: 'CACHE',
    terms: ['CACHE'],
    glyph: LANDMARK_GLYPH.cache,
    beats: [
      {
        at: 'core',
        say: (t) =>
          `A CACHE pays ${
            t.cachePaysPerRing > 0
              ? `${t.cachePays} tiles on the spot, +${t.cachePaysPerRing} per ring out`
              : `${t.cachePays} tiles on the spot`
          } the moment you build a tile touching it. Caches re-arm every run, so ground you already know stays worth walking to.`,
      },
    ],
  },
  {
    id: 'site',
    name: 'SITE',
    terms: ['SITE'],
    glyph: LANDMARK_GLYPH.site,
    beats: [
      {
        at: 'core',
        say: (t) =>
          `A SITE pays ${t.sitePays} points, × its distance from home, the moment you claim it — and it opens a BOUNTY. Sites re-arm every run, so a claimed one is worth returning to.`,
      },
    ],
  },
  {
    id: 'shrine',
    name: 'SHRINE',
    terms: ['SHRINE'],
    glyph: LANDMARK_GLYPH.shrine,
    beats: [
      {
        at: 'core',
        say: () =>
          'A SHRINE switches a system on for your world, permanently, the moment you claim it. Once every shrine unlock is woken, the next one offers a crossing to a new world instead.',
      },
    ],
  },
  {
    id: 'territory',
    name: 'TERRITORY',
    terms: ['TERRITORY'],
    glyph: LANDMARK_GLYPH.territory,
    beats: [
      {
        at: 'core',
        say: (t) =>
          `A TERRITORY claims the ground within ${t.territoryRadius} hexes as native to its colour, for good.${
            t.territoryTiles > 0
              ? ` Each one held starts your later runs with +${t.territoryTiles} tiles, up to +${t.territoryTilesCap}.`
              : ''
          }`,
      },
    ],
  },
  {
    id: 'stone',
    name: 'STONE',
    terms: ['STONE'],
    glyph: CONCEPT_MARK.stone,
    beats: [
      {
        at: 'core',
        say: (t, theme) =>
          t.redAshMatches
            ? `STONE is spent ground — what a tile becomes after it pops. It still surrounds neighbours, helping them ripen, but only ${theme.terrainNames.red} counts it as a match.`
            : 'STONE is spent ground — what a tile becomes after it pops. It still surrounds neighbours, helping them ripen, but it never matches.',
      },
    ],
  },
  {
    id: 'rare',
    name: 'MAGIC',
    terms: ['MAGIC'],
    ink: 'ink-magic',
    figure: 'rare',
    beats: [
      {
        at: 'core',
        say: () =>
          'MAGIC is wild: it matches every neighbouring tile, whatever the colour, and they match it back. Placed, it wears a star on the board so you can always find it again.',
      },
    ],
  },
  {
    id: 'rareUnique',
    name: 'UNIQUE',
    terms: ['UNIQUE'],
    ink: 'ink-unique',
    beats: [
      {
        at: 'core',
        say: () =>
          'UNIQUE is wild and heavy: every match it is part of counts DOUBLE, for both sides. Placed, it wears a star on the board so you can always find it again.',
      },
    ],
  },
  {
    id: 'luck',
    name: 'LUCK',
    terms: ['LUCK'],
    glyph: CONCEPT_MARK.luck,
    beats: [
      {
        at: 'core',
        say: () =>
          `${LUCK_CORE} Every pop pays a little of it, and the row under your hand spends it: a fresh draw, a colour called, a rare tile forged.`,
      },
    ],
  },
  {
    id: 'relic',
    name: 'RELICS',
    terms: ['RELICS', 'RELIC'],
    glyph: CONCEPT_MARK.relic,
    beats: [
      {
        at: 'core',
        say: () =>
          'Relics are not points — they buy the NEXT run. They follow you out when a run ends, and THE SHOP on the end screen spends them: every run makes the next one start stronger.',
      },
    ],
  },
  {
    id: 'bounty',
    name: 'BOUNTY',
    terms: ['BOUNTY'],
    glyph: LANDMARK_GLYPH.site,
    beats: [
      {
        at: 'core',
        say: (t) =>
          `A BOUNTY is a site’s second payout: pop ${t.questNeed}+ tiles within ${t.questRadius} hexes of its star and that pop scores ×${t.questBonus}. It is live the moment you claim the site, and any pop in range can collect it.`,
      },
    ],
  },
  {
    id: 'stash',
    name: 'STASH',
    terms: ['STASH'],
    figure: 'stash',
    beats: [
      {
        at: 'core',
        say: (t) =>
          t.holdSlots > 1
            ? `The dashed HOLD cards keep ${t.holdSlots} tiles for later. Tap one to stash the selected card; tap a held card to trade that tile back. Held tiles survive a redraw.`
            : 'The dashed HOLD card keeps one tile for later. Tap to stash the selected card; tap it again to trade that tile back. Held tiles survive a redraw.',
      },
    ],
  },
  {
    id: 'sizeBonus',
    name: 'SIZE BONUS',
    terms: ['SIZE BONUS'],
    beats: [
      {
        at: 'core',
        say: (t) =>
          t.harvestSizeCap > 0
            ? `The SIZE BONUS is one point of multiplier per tile in a pocket, up to ${t.harvestSizeCap}: a bigger pocket pays more worth, but past that only more worth, no more multiplier.`
            : 'The SIZE BONUS is one point of multiplier per tile in a pocket — the more that pops together, the more its worth is multiplied.',
      },
    ],
  },
];

/** One lesson by id, or `undefined` where no lesson has been written yet. */
export function lessonOf(id: LessonId): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}
