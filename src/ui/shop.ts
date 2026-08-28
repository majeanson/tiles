import {
  PERKS,
  UPGRADES,
  buy,
  equip,
  levelOf,
  priceOf,
  type PerkId,
  type Progress,
} from '@meta/progress';
import { perkRows, tipRows } from './tips';

/**
 * The shop's shelf and upgrade rows, extracted whole from `Game#shopParts`
 * (2026-08-26) the day the front door grew a shop of its own (Marc: "make
 * sure we have a way to access our relic and shop outside the main game") —
 * one builder, two hosts, so the door's shop and the end screen's cannot
 * drift apart. The Game passes its own repaint; the door panel passes its
 * own; neither knows the other exists.
 *
 * Everything is listed, priced, whether or not it can be afforded — the shop
 * is what gives a burnt pocket a reason, so its expensive half has to be
 * visible from the first run. The purse total itself is drawn by the caller
 * (the sticky header), not here.
 */
export type ShopAccess = {
  read(): Progress;
  write(progress: Progress): void;
};

/**
 * `justWorn` is a one-slot memory the CALLER holds across repaints: the tap
 * that wears a perk re-renders the whole list, and without the marker the
 * perk just put on looks identical to one worn all along. One beat of the
 * bought-row wash on the row that JUST became worn, then the marker clears.
 */
export function shopParts(
  shop: ShopAccess,
  repaint: () => void,
  justWorn: { id: PerkId | null },
): HTMLElement[] {
  const progress = shop.read();

  // What travels and what does not (Marc, 2026-08-20: "purse global, levels
  // per-world"; the perks joined the world's side 2026-08-26). Said once,
  // here, at the moment money is about to be spent — without it, opening a
  // second world and finding DEEPER PURSE back at zero reads as lost
  // progress rather than as the deal.
  const scope = document.createElement('p');
  scope.className = 'end-facts';
  scope.textContent =
    'Relics are yours on every world. What you buy — and every perk you find — belongs to THIS world: a new world is a fresh build as well as a fresh map.';

  const rows = UPGRADES.map((upgrade) => {
    const level = levelOf(progress, upgrade.id);
    const price = priceOf(progress, upgrade);
    const owned = level > 0;

    const row = document.createElement('div');
    row.className = 'shop-row';

    const name = document.createElement('span');
    name.className = 'shop-name';
    name.textContent =
      upgrade.levels > 1 && owned ? `${upgrade.name} ${level}/${upgrade.levels}` : upgrade.name;

    const note = document.createElement('span');
    note.className = 'shop-note';
    note.textContent = upgrade.note;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-buy';

    // Named, not just priced (2026-08-27). The button's own text is "BUY 4"
    // and the thing it buys is a sibling span, so a screen reader heard a
    // column of "BUY 4, button" with nothing saying WHAT — the same defect
    // the settings rows fixed with `aria-labelledby` on 2026-08-20. The name
    // still begins with the visible text, so voice control keeps working
    // (WCAG 2.5.3).
    if (price === null) {
      button.textContent = 'DONE';
      button.setAttribute('aria-label', `DONE — ${upgrade.name}`);
      button.disabled = true;
    } else {
      button.textContent = `BUY ${price}`;
      button.setAttribute('aria-label', `BUY ${price} — ${upgrade.name}`);
      button.disabled = progress.relics < price;
      button.addEventListener('click', () => {
        shop.write(buy(shop.read(), upgrade));
        // The acknowledgement: a beat of the row wearing the accent, and
        // the button saying so, before the whole screen redraws under it.
        row.classList.add('bought');
        button.textContent = 'BOUGHT';
        setTimeout(repaint, 260);
      });
    }

    row.append(name, note, button);
    return row;
  });

  // THE SHELF (2026-08-18): perks are found in the world, never bought.
  // An owned perk shows its name, the one toggle it has, and its full card
  // ONE TAP AWAY; the header carries the count as N/5 FOUND so a fresh shelf
  // reads as a collection with a size, not a shop section that failed to
  // load.
  //
  // Title-only since 2026-08-27, on Marc's ask: "just have the title
  // ROOTBOUND WORN (no explanation, need to tap) and explanation is fully
  // complete". The shelf used to print each perk's one sentence inline,
  // which read as a wall of small grey text between you and the WEAR button
  // — and the sentence was a summary anyway, so the shelf was simultaneously
  // too long to scan and too short to explain. Folding it turns the row into
  // a NAME and a STATE, and buys the room to say the whole thing properly.
  const owned = PERKS.filter((perk) => progress.found.includes(perk.id));

  const shelfHead = document.createElement('p');
  shelfHead.className = 'shop-purse';
  shelfHead.textContent = `THE SHELF · ${owned.length}/${PERKS.length} FOUND`;

  const shelfNote = document.createElement('p');
  shelfNote.className = 'end-facts';
  shelfNote.textContent =
    'Unique perks, found out in THIS world — never sold here. One perk may be worn at a time.';
  const shelf = owned.map((perk) => {
    const worn = progress.equipped.includes(perk.id);

    const row = document.createElement('div');
    row.className = 'shop-row perk-row';
    if (worn) row.dataset['worn'] = 'true';
    if (worn && justWorn.id === perk.id) {
      row.classList.add('bought');
      justWorn.id = null;
    }

    // `<details>` rather than a card over the top: THE SHOP has two hosts —
    // the end screen inside the Game, and a front-door SHEET — and only one
    // of them owns the event card. A modal would either have to be built
    // twice or stack a panel on a panel, and the dialog stack's whole point
    // (`ui/dialog.ts`) is that covering surfaces is a rule, not a paint job.
    // A fold is the same content, in one implementation, in both places.
    const fold = document.createElement('details');
    fold.className = 'perk-more';

    const name = document.createElement('summary');
    name.className = 'shop-name';
    name.textContent = perk.name;
    // The summary says what it opens, since the visible word is only a name.
    name.setAttribute('aria-label', `${perk.name} — what it gains, what it costs, how to play it`);

    const body = document.createElement('div');
    body.className = 'perk-rows';
    body.replaceChildren(...tipRows(perkRows(perk)));

    fold.append(name, body);
    row.append(fold);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-buy';
    button.textContent = worn ? 'WORN' : 'WEAR';
    button.setAttribute('aria-label', `${worn ? 'WORN' : 'WEAR'} — ${perk.name}`);
    button.addEventListener('click', () => {
      shop.write(equip(shop.read(), perk.id));
      justWorn.id = perk.id;
      repaint();
    });
    row.append(button);
    return row;
  });

  const undiscovered = PERKS.length - owned.length;
  const mystery = document.createElement('p');
  mystery.className = 'end-facts';
  mystery.textContent =
    undiscovered > 0
      ? `${undiscovered} more ${undiscovered === 1 ? 'is' : 'are'} still out there, unnamed.`
      : 'Every perk in this world has been found.';

  return [scope, ...rows, shelfHead, shelfNote, ...shelf, mystery];
}
