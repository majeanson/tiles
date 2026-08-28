import type { Perk } from '@meta/progress';
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
 * MAGIC and UNIQUE wear their own colours wherever the WORDS appear (Marc,
 * 2026-08-20: "as well as documentation and anywhere it speaks about it") —
 * one splitter shared by the manual, the toast, the event card, the purse row
 * and now the shelf, so prose and palette can never disagree. Uppercase only:
 * the capitals are the vocabulary; lowercase prose stays prose.
 */
export function rarityInked(text: string): (Node | string)[] {
  const parts: (Node | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(/\b(MAGIC|UNIQUE)\b/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const span = document.createElement('span');
    span.className = m[1] === 'MAGIC' ? 'ink-magic' : 'ink-unique';
    span.textContent = m[1]!;
    parts.push(span);
    last = m.index + m[1]!.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
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
    if (row.colour !== undefined) {
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
 * keep playing the way you were — ROOTBOUND zeroes every pocket that strays
 * off its own ground, OPEN HAND takes the stash away — and until now the one
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
