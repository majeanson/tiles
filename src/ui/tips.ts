import type { Perk } from '@meta/progress';
import { LESSONS, type LessonId } from './lessons';
import type { TipRow } from './view';

/**
 * The marked list, and the words that go in one.
 *
 * Extracted from `Game` on 2026-08-27 for the same reason `shop.ts` was
 * extracted the day before: a second host needed it. The shelf in THE SHOP is
 * drawn by `ui/shop.ts` and the find card by `ui/game.ts`, and Marc asked for
 * both to explain a perk the SAME way ("we could have the same card pop in
 * the shop"). One builder, two hosts, so the two doors onto one perk cannot
 * drift apart — which is exactly what happened before this file: the shop
 * printed one sentence, the find card printed the same sentence, and neither
 * said how to actually play the thing.
 */

/**
 * The walk both inkers do: find every match of `pattern`, in order, and
 * stitch the plain text back together around whatever `build` turns each one
 * into (2026-08-27, Stage 4 — extracted the day `conceptInked` needed the
 * exact same loop `rarityInked` already had, so a second copy did not start
 * drifting from the first the way `describeHexOf`'s glyphs once did before
 * they shared a registry).
 */
function inkSplit(
  text: string,
  pattern: RegExp,
  build: (match: RegExpMatchArray) => Node,
): (Node | string)[] {
  const parts: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index === undefined) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(build(m));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * MAGIC and UNIQUE wear their own colours wherever the WORDS appear (Marc,
 * 2026-08-20: "as well as documentation and anywhere it speaks about it") —
 * one splitter shared by the manual, the toast, the event card, the purse row
 * and now the shelf, so prose and palette can never disagree. Uppercase only:
 * the capitals are the vocabulary; lowercase prose stays prose.
 */
export function rarityInked(text: string): (Node | string)[] {
  return inkSplit(text, /\b(MAGIC|UNIQUE)\b/g, (m) => {
    const span = document.createElement('span');
    span.className = m[1] === 'MAGIC' ? 'ink-magic' : 'ink-unique';
    span.textContent = m[1]!;
    return span;
  });
}

/**
 * Every term the glossary answers to, longest first — so RELICS is never cut
 * short into RELIC and SIZE BONUS is never split at its own space — mapped
 * back to the entry it opens. Built from LESSONS itself, which is where
 * MAGIC and UNIQUE already live as its `rare`/`rareUnique` entries, so this
 * needs no second list to keep in sync with the ink `rarityInked` gives them.
 * `glossary.test.ts` is what guarantees no two entries share a term.
 */
const CONCEPT_TERM = new Map<
  string,
  { readonly id: LessonId; readonly ink?: 'ink-magic' | 'ink-unique' }
>();
for (const entry of LESSONS) {
  for (const term of entry.terms) {
    CONCEPT_TERM.set(
      term,
      entry.ink === undefined ? { id: entry.id } : { id: entry.id, ink: entry.ink },
    );
  }
}

const CONCEPT_PATTERN = new RegExp(
  `\\b(${[...CONCEPT_TERM.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`,
  'g',
);

/**
 * A glossary term, made tappable (WORKPLAN Stage 4, 2026-08-27): the
 * manual's own capitalized words become the doors onto their own
 * definitions, rather than a reader hunting the sentence that first used
 * one. Same shape as `rarityInked` — one regex, longest term first, `\b`
 * boundaries — but every match becomes a `button` instead of a `span`, and
 * MAGIC/UNIQUE (already two of the registry's own lessons) wear the same ink
 * class `rarityInked` gives them on top of it.
 *
 * This file attaches no listeners. Every `addEventListener` in the
 * game goes through the signalled `on`/`#on` helpers so a dead session can
 * never still be wired to the DOM — and this file has no session of its own
 * to be signalled by. `on` is the caller's own binder (`Game#on`); this
 * function only decides WHICH button gets wired and to WHAT, never how the
 * listeners are attached or torn down.
 */
export function conceptInked(
  text: string,
  open: (id: LessonId, anchor: HTMLButtonElement) => void,
  on: (target: HTMLElement, type: 'click', handler: (event: MouseEvent) => void) => void,
): (Node | string)[] {
  return inkSplit(text, CONCEPT_PATTERN, (m) => {
    const term = m[1]!;
    const meta = CONCEPT_TERM.get(term);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = meta?.ink === undefined ? 'term' : `term ${meta.ink}`;
    button.setAttribute('aria-haspopup', 'dialog');
    button.textContent = term;
    // Always true in practice — the pattern is built from `CONCEPT_TERM`'s
    // own keys — but a matcher and its map are two pieces of code, and a
    // button that opened nothing would be a silent dead end rather than a
    // loud bug.
    if (meta !== undefined) {
      button.dataset['term'] = meta.id;
      on(button, 'click', () => {
        open(meta.id, button);
      });
    }
    return button;
  });
}

/**
 * A set, drawn as lines rather than as a paragraph.
 *
 * Born on the four-grounds card (2026-08-27) and shared with the manual the
 * same day (Marc: "use colors and symbols from the game in all help"), so a
 * set is drawn ONE way wherever the game explains one — the swatch is a MARK
 * and never the surface any text sits on, which is what keeps the reading
 * budget in `contrast.test.ts` untouched by it and lets every direction
 * inherit these unchanged.
 *
 * The mark column is reserved even for a row that has no mark, because the
 * point of a list is that the sentences start in the same place.
 */
export function tipRows(rows: readonly TipRow[] | undefined): HTMLElement[] {
  return (rows ?? []).map((row) => {
    const line = document.createElement('p');
    line.className = 'tip-row';

    const mark = document.createElement('span');
    // Decoration in every case: the words beside it already name the thing,
    // so a screen reader gains nothing but noise from the square or the glyph.
    mark.setAttribute('aria-hidden', 'true');
    if (row.colour !== undefined && row.art !== undefined) {
      // The real tile, hex-shaped, where the game could bake one: the same
      // art the draft card is wearing while you read this (2026-08-27).
      mark.className = 'tip-swatch tip-tile';
      mark.dataset['colour'] = row.colour;
      mark.style.backgroundImage = `url(${row.art})`;
    } else if (row.colour !== undefined) {
      mark.className = 'tip-swatch';
      mark.dataset['colour'] = row.colour;
    } else if (row.glyph !== undefined) {
      mark.className = 'tip-glyph';
      mark.textContent = row.glyph;
    } else {
      mark.className = 'tip-swatch tip-blank';
    }

    const words = document.createElement('span');
    words.className = 'tip-words';
    words.replaceChildren(...rarityInked(row.text));
    line.append(mark, words);
    return line;
  });
}

/**
 * A perk, in the three lines it actually takes to use one (Marc, 2026-08-27:
 * "a quick help card of how to use it properly, what you gain what you lose
 * style").
 *
 * A perk is the only thing in this game that can make you WORSE at it if you
 * keep playing the way you were — ROOTBOUND starves every pocket that strays
 * off its own ground, and starves it harder the luckier you get; OPEN HAND
 * takes the stash away — and until now the one
 * sentence each of them got said what the dial did without ever saying that.
 * The find card named the gain; nothing named the cost as a cost, and nothing
 * at all said what to do differently.
 *
 * So: what it hands you, what it takes, and how to play it. `lose` is never
 * omitted, even for the two that take nothing — "Nothing" is the answer a
 * player is entitled to read rather than infer from a missing line, and a
 * three-row card that is sometimes two rows reads as a card with a bug.
 *
 * No row invents a symbol (`theme/tokens.ts` states the rule: `COLOUR_MARK`
 * and `LANDMARK_GLYPH` are the whole vocabulary), so all three go markless
 * and the leading words carry the structure instead.
 */
export function perkRows(perk: Perk): TipRow[] {
  return [
    { text: `YOU GAIN — ${perk.gain}` },
    { text: `YOU LOSE — ${perk.lose}` },
    { text: `PLAY IT — ${perk.play}` },
  ];
}
