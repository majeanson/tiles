import { type Colour } from '@content/tuning';
import { place } from '@render/layout';
import { COLOUR_MARK, type Orientation } from '@theme/tokens';

/**
 * The manual's figures, drawn — extracted from `Game` on 2026-08-28.
 *
 * It left the class for the reason `tips.ts` did the day before and the seven
 * text builders did on 2026-08-26: **a second host needs it.** `#figure` was
 * private, so the only surface in the game that could show a picture of a rule
 * was the manual — while the teaching CARD that first states the same rule, at
 * the moment a stranger actually meets it, could show nothing at all. Marc:
 * "the world, the screen, etc. should be from in-game too, not just text."
 *
 * `drawFigure` takes the art book, the facing and the colour names as
 * ARGUMENTS where the method read `this.#art` and `this.#theme`, which is the
 * whole of the change; `Game` keeps one-line wrappers so no call site moved.
 *
 * **This file wires no listeners, and that is deliberate rather than lucky.**
 * A hex figure is spans; a card figure is buttons inside an `inert` row — a
 * picture of controls, not controls. So the session's `on`/`#on` severability
 * contract has nothing to enforce here, and this file needs no binder passed
 * in the way `conceptInked` does.
 *
 * It degrades to flat ground where nothing could be baked (a bare test, a
 * browser with no 2D canvas): every hex is a clipped span carrying its terrain
 * colour, and the art is a background IMAGE on top of that. The shape and the
 * colour are CSS; only the texture is a canvas.
 */

/** What a host must hand over to draw one: the baked tiles it already has,
 *  the facing the theme chose, and the theme's own words for the colours. */
export type FigureContext = {
  readonly art: Partial<Record<Colour, string>>;
  readonly orientation: Orientation;
  readonly names: Record<Colour, string>;
};

/**
 * The manual's drawn figures (2026-08-28).
 *
 * `hexes` is the whole language: a cell is a ground, optionally a ring, and
 * optionally a mark drawn on it — which between them say everything the five
 * new figures needed to say, without any of them growing bespoke DOM. Every
 * value maps to something the BOARD already paints, so a figure cannot show a
 * state the game does not have: the grounds are the four terrains plus stone
 * and wall, the rings are the stroke ladder's own (`legal`, `ripe`, `lit`),
 * and a mark is the same glyph or number `labelFor` would put there.
 *
 * `cards` is the one exception, for THE STASH. That section is about the
 * dashed HOLD card, which is chrome rather than board — a hex grid physically
 * cannot say it — so the figure is a row of the real card markup instead.
 */
export type FigureId = 'ripen' | 'destinations' | 'place' | 'pop' | 'rare' | 'stash';

/** What a figure's cell is made of. `ground` is what it is; `ring` is what
 *  the stroke ladder would draw round it; `mark` is what would be printed on
 *  it. All three are the board's own vocabulary. */
export type FigCell = {
  readonly q: number;
  readonly r: number;
  readonly ground: Colour | 'stone' | 'wall';
  readonly ring?: 'legal' | 'ripe' | 'lit' | 'spent';
  readonly mark?: string;
  /** A preview number is faint where a ripe tile's worth is not — the same
   *  distinction `labelFor` makes on the board. */
  readonly faint?: boolean;
  /**
   * The mark's own voice, where it has one.
   *
   * MAGIC and UNIQUE have worn their own colours on the board since
   * 2026-08-20 (Marc: "make sure magic and unique have their own color") —
   * so a figure that drew both stars in the plain ink would be teaching that
   * the two look alike, on the one section whose whole job is telling them
   * apart. The first draft of the rare figure did exactly that and the
   * screenshot caught it.
   */
  readonly tone?: 'magic' | 'unique';
};

/** One card in a `cards` figure. `held` draws the dashed HOLD slot. */
export type FigCard =
  { readonly colour: Colour; readonly held?: boolean } | { readonly slot: 'hold' };

export type FigureSpec = {
  readonly hexes?: readonly FigCell[];
  readonly cards?: readonly FigCard[];
  readonly caption: string;
};

/**
 * The figures themselves — data, so adding one is a table edit.
 *
 * Every ring in here is MIXED on purpose wherever the rule is about matching:
 * worth counts neighbours of the same colour, so a picture of six identical
 * tiles would quietly teach a rule the game does not have. That was the
 * original figure's own note and it governs all of them.
 */
export const FIGURES: Record<FigureId, FigureSpec> = {
  // Six around one — the rule the whole game rests on, and the one a sentence
  // has never carried well.
  ripen: {
    hexes: [
      { q: 1, r: 0, ground: 'green' },
      { q: 0, r: 1, ground: 'yellow' },
      { q: -1, r: 1, ground: 'green' },
      { q: -1, r: 0, ground: 'red' },
      { q: 0, r: -1, ground: 'green' },
      { q: 1, r: -1, ground: 'blue' },
      { q: 0, r: 0, ground: 'green', ring: 'ripe', mark: '3' },
    ],
    caption: 'Six sides covered: the middle tile is ripe, and worth what matches it.',
  },

  // What "lights out in the dark are worth walking to" actually looks like —
  // the line START has always carried and never shown. One still-lit
  // destination against one already spent, because the difference between
  // them is the whole navigation rule (`faint means spent`, 2026-08-27).
  destinations: {
    hexes: [
      { q: 0, r: 0, ground: 'wall', ring: 'lit', mark: '✚' },
      { q: 2, r: -1, ground: 'wall', ring: 'lit', mark: '★' },
      { q: 1, r: 1, ground: 'stone', mark: '◈', faint: true },
    ],
    caption: 'Lit is unclaimed and still pays. Faint means you have already spent it.',
  },

  // PLACE: the glowing edge and the promised number, which are two separate
  // claims the section makes in two separate sentences.
  place: {
    hexes: [
      { q: 0, r: 0, ground: 'green' },
      { q: 1, r: -1, ground: 'blue' },
      { q: 1, r: 0, ground: 'green', ring: 'legal', mark: '2', faint: true },
      { q: 0, r: 1, ground: 'green', ring: 'legal', mark: '1', faint: true },
      { q: 2, r: -1, ground: 'wall' },
    ],
    caption: 'Glowing edges are where a tile may go. The faint number is what it would pay.',
  },

  // POP: a pocket is not one tile. Three ripe tiles touching, with the stone
  // a previous pop already left beside them — so the section's two facts
  // ("they pop together" and "popped tiles turn to stone") share one picture.
  pop: {
    hexes: [
      { q: 0, r: 0, ground: 'red', ring: 'ripe', mark: '4' },
      { q: 1, r: 0, ground: 'red', ring: 'ripe', mark: '4' },
      { q: 0, r: 1, ground: 'red', ring: 'ripe', mark: '3' },
      { q: 1, r: -1, ground: 'stone' },
      { q: -1, r: 1, ground: 'yellow' },
    ],
    caption: 'Ripe tiles that touch are ONE pocket — they pop together, and leave stone.',
  },

  // RARE: what the section's last line promises — "a placed rare tile wears a
  // star, so its power stays findable on a full map" — which was the only
  // claim in the manual about something you can SEE that showed nothing.
  rare: {
    hexes: [
      { q: 0, r: 0, ground: 'blue', mark: '✦', tone: 'magic' },
      { q: 1, r: 0, ground: 'yellow', mark: '✦', tone: 'unique' },
      { q: 0, r: 1, ground: 'green' },
    ],
    caption: 'A placed rare wears a star in its own colour: magic, then unique.',
  },

  stash: {
    cards: [{ colour: 'green' }, { colour: 'red' }, { slot: 'hold' }],
    caption: 'The dashed slot is the stash. Tap it to keep the selected card for later.',
  },
};

/**
 * A rule, drawn (2026-08-27).
 *
 * `bakeSurface` already gives the draft card the real tile; this hands the
 * manual the same canvases, laid out on the same axial grid the board uses
 * (`place`, from `render/layout.ts`) at the same orientation the theme
 * chose. So the picture is not an illustration OF the game — it is the
 * game's own art, arranged by the game's own geometry, and it follows a
 * theme swap or an art-slot change without anybody remembering to redraw
 * it.
 *
 * It degrades to flat ground where nothing could be baked (a bare test, a
 * browser with no 2D canvas): every hex is a clipped span carrying its
 * terrain colour, and the art is a background IMAGE on top of that. The
 * shape and the colour are CSS; only the texture is a canvas.
 */
export function drawFigure(kind: FigureId, ctx: FigureContext): HTMLElement {
  const spec = FIGURES[kind];
  if (spec.cards !== undefined) return cardFigure(spec, ctx);

  const figure = document.createElement('div');
  figure.className = 'help-figure';
  figure.dataset['facing'] = ctx.orientation;

  const size = 21;
  const layout = { size, originX: 0, originY: 0, orientation: ctx.orientation };
  const cells = spec.hexes ?? [];

  const placed = cells.map((cell) => ({ cell, ...place({ q: cell.q, r: cell.r }, layout) }));
  const halfW = ctx.orientation === 'pointy' ? (Math.sqrt(3) / 2) * size : size;
  const halfH = ctx.orientation === 'pointy' ? size : (Math.sqrt(3) / 2) * size;
  const minX = Math.min(...placed.map((p) => p.x)) - halfW;
  const minY = Math.min(...placed.map((p) => p.y)) - halfH;
  figure.style.width = `${Math.max(...placed.map((p) => p.x)) + halfW - minX}px`;
  figure.style.height = `${Math.max(...placed.map((p) => p.y)) + halfH - minY}px`;

  const hexAt = (p: { x: number; y: number }, className: string, grow = 1): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = className;
    const w = halfW * 2 * grow;
    const h = halfH * 2 * grow;
    span.style.left = `${p.x - w / 2 - minX}px`;
    span.style.top = `${p.y - h / 2 - minY}px`;
    span.style.width = `${w}px`;
    span.style.height = `${h}px`;
    return span;
  };

  // A ring is a slightly LARGER clipped hex behind its cell rather than an
  // outline on it: `clip-path` clips a border and an inset shadow along with
  // everything else, so the only way to draw a rim on a clipped shape is to
  // put a bigger clipped shape behind it — which is exactly what the board's
  // own ripe edge looks like anyway.
  const ground = (p: (typeof placed)[number]): HTMLSpanElement => {
    const hex = hexAt(p, 'fig-hex');
    hex.dataset['ground'] = p.cell.ground;
    // Only the four terrains have baked art; stone and wall wear their
    // token colour, which is what the board does when a slot has no PNG.
    const art = ctx.art[p.cell.ground as Colour];
    if (art !== undefined) hex.style.backgroundImage = `url(${art})`;
    return hex;
  };

  // Rings first for every cell, so no ring paints over a neighbouring
  // ground — the board draws in the same order for the same reason.
  for (const p of placed) {
    if (p.cell.ring === undefined) continue;
    const ring = hexAt(p, 'fig-ring', 1.22);
    ring.dataset['ring'] = p.cell.ring;
    figure.append(ring);
  }
  for (const p of placed) figure.append(ground(p));
  // ...and marks last of all, over everything, exactly as the label layer
  // sits above the cell layer on the board.
  for (const p of placed) {
    if (p.cell.mark === undefined) continue;
    const mark = hexAt(p, 'fig-mark');
    mark.textContent = p.cell.mark;
    if (p.cell.faint === true) mark.dataset['faint'] = 'true';
    if (p.cell.tone !== undefined) mark.dataset['tone'] = p.cell.tone;
    figure.append(mark);
  }

  return captioned(figure, spec.caption);
}

/**
 * THE STASH's figure: a row of the real card markup.
 *
 * The one figure that is not hexes, because the thing it teaches is not on
 * the board — the dashed HOLD card is chrome, and a hex grid cannot draw a
 * dashed slot with a word in it. So it borrows `.tile`, `.tile-art`,
 * `.tile-name` and `.tile.hold` from the hand itself: the same classes, the
 * same baked art, the same CSS. `inert` rather than disabled buttons —
 * these are a picture of controls, and nothing here should be tabbable.
 */
function cardFigure(spec: FigureSpec, ctx: FigureContext): HTMLElement {
  const row = document.createElement('div');
  row.className = 'fig-cards';
  row.inert = true;

  for (const card of spec.cards ?? []) {
    // BUTTONS, like the hand's own cards (2026-08-28). The first draft used
    // divs and the screenshot showed why: `.tile` styles a card's INSIDE —
    // its layout, its ink, its halo — and every bit of chrome that makes it
    // look like a card (the panel, the border, the radius) comes from the
    // global `button` rule. A div wearing `.tile` is a naked hex with a
    // word under it. The row is `inert`, so these are a picture of controls
    // and not controls: untabbable, unclickable, and invisible to the
    // audit's tap-target check.
    if ('slot' in card) {
      const hold = document.createElement('button');
      hold.type = 'button';
      hold.className = 'tile hold fig-card';
      const label = document.createElement('span');
      label.className = 'tile-name';
      label.textContent = 'HOLD';
      hold.append(label);
      row.append(hold);
      continue;
    }
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile fig-card';
    tile.dataset['colour'] = card.colour;
    const art = ctx.art[card.colour];
    if (art !== undefined) {
      const img = document.createElement('img');
      img.className = 'tile-art';
      img.src = art;
      img.alt = '';
      tile.classList.add('has-art');
      tile.append(img);
    }
    const label = document.createElement('span');
    label.className = 'tile-name';
    label.textContent = `${COLOUR_MARK[card.colour]} ${ctx.names[card.colour]}`;
    tile.append(label);
    if (card.held === true) {
      const badge = document.createElement('span');
      badge.className = 'tile-rarity';
      badge.textContent = 'HELD';
      tile.append(badge);
    }
    row.append(tile);
  }

  return captioned(row, spec.caption);
}

/** A figure and the one line that says what it shows. */
function captioned(art: HTMLElement, text: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'help-figure-wrap';
  const caption = document.createElement('p');
  caption.className = 'flag-note';
  caption.textContent = text;
  wrap.append(art, caption);
  return wrap;
}
