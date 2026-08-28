import type { Tuning } from '@content/tuning';
import type { TeachId } from '@meta/progress';
import { CONCEPT_MARK, LANDMARK_GLYPH, type Theme } from '@theme/tokens';

/**
 * The glossary registry (2026-08-27, WORKPLAN's symbol & glossary pipeline,
 * Stage 3): one place that holds what a word MEANS, generically — as
 * distinct from `describeHexOf` (what THIS hex is), `statNote` (what THIS
 * run's number is doing) and `colourLesson` (what a personality wants),
 * which each answer a contextual, priced question and stay their own
 * functions on purpose. A concept earns an entry here only once it is a
 * word the manual actually prints in capitals — `tips.ts`'s own rule for
 * `rarityInked` ("uppercase only: the capitals are the vocabulary;
 * lowercase prose stays prose") is the same rule this registry answers to,
 * because Stage 4's tappable terms are built from exactly these strings.
 *
 * No UI reads this file yet — Stage 4 wires the tap. This stage only ships
 * the registry and moves two definitions that already existed in two
 * places (`RELIC_LESSON` in `game.ts`, the LUCK teach card and
 * `statNote('luck')` in `view.ts`) onto it, so those two doors stop being
 * two places to keep in sync by hand.
 */
export type GlossaryId = TeachId | 'pocket' | 'worth' | 'bounty' | 'stash' | 'sizeBonus' | 'stone';

export type GlossaryEntry = {
  readonly id: GlossaryId;
  /**
   * UPPERCASE, longest first — the exact spellings Stage 4's matcher will
   * alternate over. A term that never appears in the manual's own capitals
   * is a button nobody could ever tap, so every term here is grepped
   * against the full-ledger manual by `glossary.test.ts` before it ships.
   */
  readonly terms: readonly string[];
  /** From one of the four registries only — never a literal character. */
  readonly glyph?: string;
  /** MAGIC and UNIQUE keep the ink `rarityInked` already gives them. */
  readonly ink?: 'ink-magic' | 'ink-unique';
  /** What the word means, in this run's own numbers where a number is the point. */
  readonly define: (t: Tuning, theme: Theme) => string;
};

/**
 * LUCK's shared opening clause (2026-08-27): the LUCK teach card and
 * `statNote('luck')` (`view.ts`) used to carry two different sentences for
 * the same idea. Both read this one now; `statNote` appends its own live
 * clause (whether unspent luck comes home as relics, and at what rate) and
 * the teach card appends what the purse row's buttons are for — each door
 * keeps the ending only IT needs, and the opening can never drift.
 */
export const LUCK_CORE = 'LUCK — a purse, not a score.';

/**
 * ~16 of the TeachIds and extra concepts have no entry, on purpose:
 * `costRise`, `glow`, `field`, `lens`, `purse`, `colours`, `place` and
 * `lastGasp` are never printed in capitals anywhere the manual's own prose
 * reaches (`lastGasp`'s rule is stated in full sentences, never under that
 * name), and `wall` — checked the same way — turns out to be spoken only
 * as "Wall"/"wall" today, never "WALL". An entry nobody's manual text can
 * ever surface is a dead definition, so per this stage's own instructions
 * these stay out rather than forcing a manual rewrite that is not this
 * stage's job. (Stage 4, or a future manual pass, can capitalize `wall`
 * into reach and this entry can join it then.)
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: 'ripe',
    terms: ['RIPENS'],
    define: () =>
      'A tile RIPENS once every one of its six sides is covered — by another tile, by stone, by a wall, or by the map’s edge. A ripe tile shows its WORTH and can be popped.',
  },
  {
    id: 'pop',
    terms: ['POP'],
    define: () =>
      'POP cashes a ripe pocket: it pays tiles to keep you placing, and points as your score. Waiting lets a pocket grow and pays more, but every placement still costs tiles, so waiting too long can end a run before it pops.',
  },
  {
    id: 'pocket',
    terms: ['POCKET'],
    define: () =>
      'A POCKET is a ripe tile and every ripe tile touching it — they pop together, as one. Tap any ripe tile to price its pocket; the buttons show what it pays.',
  },
  {
    id: 'worth',
    terms: ['WORTH'],
    define: () =>
      'WORTH counts how many of a tile’s six sides touch a match — the same colour, or a wild rare tile. A pop scores the pocket’s summed worth, so the more that ripen together, the more it pays.',
  },
  {
    id: 'cache',
    terms: ['CACHE'],
    glyph: LANDMARK_GLYPH.cache,
    define: (t) =>
      `A CACHE pays ${
        t.cachePaysPerRing > 0
          ? `${t.cachePays} tiles on the spot, +${t.cachePaysPerRing} per ring out`
          : `${t.cachePays} tiles on the spot`
      } the moment you build a tile touching it. Caches re-arm every run, so ground you already know stays worth walking to.`,
  },
  {
    id: 'site',
    terms: ['SITE'],
    glyph: LANDMARK_GLYPH.site,
    define: (t) =>
      `A SITE pays ${t.sitePays} points, × its distance from home, the moment you claim it — and it opens a BOUNTY. Sites re-arm every run, so a claimed one is worth returning to.`,
  },
  {
    id: 'shrine',
    terms: ['SHRINE'],
    glyph: LANDMARK_GLYPH.shrine,
    define: () =>
      'A SHRINE switches a system on for your world, permanently, the moment you claim it. Once every shrine unlock is woken, the next one offers a crossing to a new world instead.',
  },
  {
    id: 'territory',
    terms: ['TERRITORY'],
    glyph: LANDMARK_GLYPH.territory,
    define: (t) =>
      `A TERRITORY claims the ground within ${t.territoryRadius} hexes as native to its colour, for good.${
        t.territoryTiles > 0
          ? ` Each one held starts your later runs with +${t.territoryTiles} tiles, up to +${t.territoryTilesCap}.`
          : ''
      }`,
  },
  {
    id: 'stone',
    terms: ['STONE'],
    glyph: CONCEPT_MARK.stone,
    define: (t, theme) =>
      t.redAshMatches
        ? `STONE is spent ground — what a tile becomes after it pops. It still surrounds neighbours, helping them ripen, but only ${theme.terrainNames.red} counts it as a match.`
        : 'STONE is spent ground — what a tile becomes after it pops. It still surrounds neighbours, helping them ripen, but it never matches.',
  },
  {
    id: 'rare',
    terms: ['MAGIC'],
    ink: 'ink-magic',
    define: () =>
      'MAGIC is wild: it matches every neighbouring tile, whatever the colour, and they match it back. Placed, it wears a star on the board so you can always find it again.',
  },
  {
    id: 'rareUnique',
    terms: ['UNIQUE'],
    ink: 'ink-unique',
    define: () =>
      'UNIQUE is wild and heavy: every match it is part of counts DOUBLE, for both sides. Placed, it wears a star on the board so you can always find it again.',
  },
  {
    id: 'luck',
    terms: ['LUCK'],
    glyph: CONCEPT_MARK.luck,
    define: () =>
      `${LUCK_CORE} Every pop pays a little of it, and the row under your hand spends it: a fresh draw, a colour called, a rare tile forged.`,
  },
  {
    id: 'relic',
    terms: ['RELICS', 'RELIC'],
    glyph: CONCEPT_MARK.relic,
    define: () =>
      'Relics are not points — they buy the NEXT run. They follow you out when a run ends, and THE SHOP on the end screen spends them: every run makes the next one start stronger.',
  },
  {
    id: 'bounty',
    terms: ['BOUNTY'],
    glyph: LANDMARK_GLYPH.site,
    define: (t) =>
      `A BOUNTY is a site’s second payout: pop ${t.questNeed}+ tiles within ${t.questRadius} hexes of its star and that pop scores ×${t.questBonus}. It is live the moment you claim the site, and any pop in range can collect it.`,
  },
  {
    id: 'stash',
    terms: ['STASH'],
    define: (t) =>
      t.holdSlots > 1
        ? `The dashed HOLD cards keep ${t.holdSlots} tiles for later. Tap one to stash the selected card; tap a held card to trade that tile back. Held tiles survive a redraw.`
        : 'The dashed HOLD card keeps one tile for later. Tap to stash the selected card; tap it again to trade that tile back. Held tiles survive a redraw.',
  },
  {
    id: 'sizeBonus',
    terms: ['SIZE BONUS'],
    define: (t) =>
      t.harvestSizeCap > 0
        ? `The SIZE BONUS is one point of multiplier per tile in a pocket, up to ${t.harvestSizeCap}: a bigger pocket pays more worth, but past that only more worth, no more multiplier.`
        : 'The SIZE BONUS is one point of multiplier per tile in a pocket — the more that pops together, the more its worth is multiplied.',
  },
];

/** One entry by id, or `undefined` where this stage deliberately left no entry. */
export function glossaryEntry(id: GlossaryId): GlossaryEntry | undefined {
  return GLOSSARY.find((entry) => entry.id === id);
}
