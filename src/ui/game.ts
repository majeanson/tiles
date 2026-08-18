import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { parse, type HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import {
  cachePaysAt,
  canPlaceAt,
  harvestMultiplier,
  harvestValue,
  isRipe,
  worthOf,
} from '@engine/rules';
import type {
  Action,
  GameState,
  HarvestChoice,
  LandmarkReward,
  Rarity,
  Spend,
} from '@engine/state';
import { destinationAt } from '@engine/world';
import { bakeSurface } from '@render/bake';
import { UPGRADES, buy, equip, levelOf, priceOf, slotsOf, type Progress } from '@meta/progress';
import type { Renderer } from '@render/Renderer';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import { COLOUR_MARK, type Theme } from '@theme/tokens';
import { NAME, TAGLINE } from '@meta/identity';
import { toBoardView, toHudView, type HudView } from './view';

/**
 * The loop: hold a state, turn taps into actions, redraw.
 *
 * All the thinking lives in the engine and in `view.ts`; this file is wiring
 * and is meant to stay that way. Anything here that starts deciding what a
 * number means belongs in the selector, where it can be tested without a phone.
 *
 * The theme reaches this file for exactly two reasons: the draft cards need the
 * direction's NAME for a colour ("CRYPT" rather than "green"), and the stat row
 * needs to know which number is the one that kills you. Colours themselves never
 * appear here — they arrive as CSS custom properties, written once by
 * `applyTheme`, so the chrome and the canvas cannot drift apart.
 */

/**
 * One block of the manual: what a thing IS, in a line or two, with every
 * formula and threshold in `detail` behind a toggle. The split is the whole
 * design — short by default, complete on demand.
 */
type HelpSection = {
  readonly title: string;
  readonly lines: readonly string[];
  readonly detail?: readonly string[];
};

/** A tab of the manual. Tabs are ordered as a run meets them. */
type HelpTab = {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly HelpSection[];
};

export type Elements = {
  readonly board: HTMLElement;
  readonly stats: HTMLElement;
  readonly hint: HTMLElement;
  readonly colours: HTMLElement;
  readonly draft: HTMLElement;
  readonly harvestTiles: HTMLButtonElement;
  readonly harvestPoints: HTMLButtonElement;
  /** The third payout. Present only while a pocket is big enough for it. */
  readonly harvestTreasure: HTMLButtonElement;
  /** The sacrifice: pop for luck instead of tiles. Only where it exists. */
  readonly harvestBurn: HTMLButtonElement;
  readonly spends: HTMLElement;
  readonly purse: HTMLElement;
  readonly purseToggle: HTMLButtonElement;
  readonly actionsMore: HTMLElement;
  readonly controls: HTMLElement;
  readonly end: HTMLElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomFit: HTMLButtonElement;
  readonly help: HTMLButtonElement;
  readonly helpPanel: HTMLElement;
  /** The manual's half of the panel. The settings half belongs to main.ts. */
  readonly helpManual: HTMLElement;
  /**
   * The popup over the board: what you just claimed, or what the glyph you
   * tapped does. Loud enough to be read, gone on a tap or after a few
   * seconds — the hint line was too quiet for something that just happened.
   */
  readonly toast: HTMLElement;
};

/**
 * What the shell (main.ts) lends the game: persistence and records. All
 * optional so the headless tests and the gallery can run the loop bare.
 * The game never touches localStorage itself — it reports, the shell keeps.
 */
export type GameHooks = {
  /** A saved run to resume instead of starting fresh. Plays under ITS tuning. */
  readonly resume?: GameState | null;
  /** Called with the new state after every action that changed it. */
  readonly onChange?: (state: GameState) => void;
  /**
   * Submit a finished run to the record book; returns what the book now says.
   * Called exactly once per ended run.
   *
   * It used to carry Gate B's tiles-share tally too; that left with the gate
   * (2026-08-18) — `singlePayout` removed the fork the tally measured, and a
   * line the UI suppressed was evidence nobody could read.
   */
  readonly finish?: (state: GameState) => {
    readonly runs: number;
    readonly best: number;
    readonly isNewBest: boolean;
  };
  /** Start a fresh run under the current settings. Wired to the end screen. */
  readonly newRun?: () => void;

  /**
   * The roguelite purse and shelf, read and written by the shell so the game
   * loop never touches storage. Absent where there is no meta economy, which
   * is what hides the whole shop rather than showing an empty one.
   */
  readonly shop?: {
    read(): Progress;
    write(progress: Progress): void;
  };
  /**
   * Ground this world remembers from earlier runs (P4a) — drawn faint under
   * the board. Keys only; the terrain is re-derived from the world seed.
   */
  readonly memory?: readonly HexKey[];
  /**
   * Print the run's raw numbers under the board (`debug.overlay`). A phone
   * has no console, and "it did something odd" needs a readout to become a
   * seed and a state.
   */
  readonly debug?: boolean;
  /**
   * True on a device that has never played. The game greets a stranger with
   * the manual open rather than with a board they must guess at — once, ever,
   * and the shell remembers that it happened.
   */
  readonly firstVisit?: boolean;
  /**
   * Send this run somewhere — the share sheet, or the clipboard. Absent means
   * the button is not drawn, which is the honest state on a browser with no
   * way to share.
   *
   * The outcome comes back because the clipboard path is invisible: a copy
   * with no acknowledgement reads as a button that does nothing, which is
   * exactly how it read until 2026-08-18. `'shared'` needs no words — the
   * share sheet was its own feedback; `'copied'` does; `'failed'` means
   * neither API worked (or the user cancelled), and the button says so.
   */
  readonly share?: (state: GameState) => Promise<'shared' | 'copied' | 'failed'>;
  /**
   * What the next shrine will unlock, by how many this run has already
   * claimed. The ledger belongs to the world, which lives outside the game —
   * the game only needs the words to put in the popup.
   */
  readonly unlockLabel?: (nth: number) => string | null;
};

/** The colour POWERS' names, for the lens line. Plain words, Marc's word. */
const POWER_NAMES: Record<Colour, string> = {
  green: 'crowds',
  yellow: 'company',
  red: 'ash',
  blue: 'tide',
};

/** One zoom-button step. Three taps from fit to full close-up. */
const ZOOM_STEP = 1.6;

/** Movement under this many pixels is still a tap; past it, a drag. */
const TAP_SLOP = 8;

/** Label, value, and whether this is the number counting down to the end. */
type Stat = { readonly id: string; readonly label: string; readonly value: string };

/** How long a claim announcement stays up before it fades on its own. */
const NOTE_MS = 5200;

/** Circumradius of the hex drawn on a draft card, in CSS pixels. */
const HAND_HEX_SIZE = 24;

export class Game {
  #state: GameState;
  readonly #renderer: Renderer;
  readonly #el: Elements;
  readonly #theme: Theme;
  /**
   * The four terrain surfaces, baked once to data URLs so a draft card shows the
   * tile EXACTLY as the board will draw it — same baker, same theme, same
   * texture. A card that shows a flat swatch while the board shows a hatched hex
   * is promising one thing and placing another. Empty where no 2D canvas exists
   * (happy-dom, a broken context); the flat swatch is the fallback, not an error.
   */
  readonly #art: Partial<Record<Colour, string>> = {};

  /**
   * The pocket the player last tapped, on the plane. UI state, not game state:
   * the engine only learns about it when a harvest button carries it as `at`.
   * The selector re-resolves it every render, so a stale tap (the pocket got
   * popped) degrades to the biggest pocket rather than to a dead button.
   */
  #harvestAt: HexKey | null = null;

  /**
   * The colour lens: the chip currently held down, or null. UI state like the
   * tapped pocket — the engine never learns a colour was being studied.
   */
  #spotlight: Colour | null = null;

  readonly #hooks: GameHooks;

  /**
   * The popup's text, and the timer that clears it. UI state: the engine
   * neither knows nor cares that anything was announced.
   */
  #noteTimer: ReturnType<typeof setTimeout> | null = null;
  /** Shrines claimed this run, so each one announces the right unlock. */
  #shrinesClaimed = 0;

  /**
   * The end screen's record lines, computed once per ended run so the book is
   * written exactly once however many times the ended state renders.
   */
  #recordLines: string[] | null = null;

  constructor(
    renderer: Renderer,
    elements: Elements,
    seed: number,
    theme: Theme = PLACEHOLDER,
    tuning: Tuning = TUNING,
    hooks: GameHooks = {},
    claimed: readonly HexKey[] = [],
  ) {
    this.#renderer = renderer;
    this.#el = elements;
    this.#theme = theme;
    this.#hooks = hooks;
    this.#state = hooks.resume ?? newRun(seed, tuning, claimed);

    for (const colour of COLOURS) {
      try {
        const baked = bakeSurface(theme.terrain[colour], HAND_HEX_SIZE, theme.orientation);
        if (baked !== null) this.#art[colour] = baked.toDataURL();
      } catch {
        // No canvas here. The card keeps its coloured background and its word.
      }
    }
  }

  get state(): GameState {
    return this.#state;
  }

  start(): void {
    this.#mountGestures();

    // Names for the controls that carry only a glyph. They are in the markup
    // too, but a label that exists in one file and is required in another is
    // a label that goes missing the first time the markup is rewritten — so
    // the game states them, and a test holds it to that.
    const label = (el: HTMLElement, text: string): void => {
      el.setAttribute('aria-label', text);
    };
    label(this.#el.help, 'How to play');
    label(this.#el.zoomIn, 'Zoom in');
    label(this.#el.zoomOut, 'Zoom out');
    label(this.#el.zoomFit, 'Show the whole world');

    // The two places words appear on their own: the popup and the hint line.
    // aria-live, stated here for the same reason as the labels above — so a
    // screen reader hears a claim or a warning without focus ever moving.
    this.#el.toast.setAttribute('aria-live', 'polite');
    this.#el.hint.setAttribute('aria-live', 'polite');

    this.#el.zoomIn.addEventListener('click', () => {
      this.#renderer.zoomBy(ZOOM_STEP);
      this.#syncCamera();
    });
    this.#el.zoomOut.addEventListener('click', () => {
      this.#renderer.zoomBy(1 / ZOOM_STEP);
      this.#syncCamera();
    });
    this.#el.zoomFit.addEventListener('click', () => {
      this.#renderer.resetCamera();
      this.#syncCamera();
    });

    // The help panel is the manual: every system in play, in the order a run
    // meets them, with its numbers read from the LIVE tuning so the text can
    // never disagree with the economy it describes. It closes on any tap
    // because the only thing to do with it is stop reading it.
    const title = document.createElement('p');
    title.id = 'help-name';
    title.textContent = NAME;
    const tagline = document.createElement('p');
    tagline.className = 'flag-note';
    tagline.textContent = TAGLINE;

    this.#el.helpManual.replaceChildren(title, tagline, ...this.#buildManual());

    // The panel IS a dialog — it sits over the board and takes every gesture —
    // so it says so: role, modality, a name, and a keyboard path (Escape, and
    // focus that moves in on open and back to the ? button on close). The
    // close-on-any-tap behaviour stays; the keyboard is an addition, not a
    // replacement.
    this.#el.helpPanel.setAttribute('role', 'dialog');
    this.#el.helpPanel.setAttribute('aria-modal', 'true');
    this.#el.helpPanel.setAttribute('aria-label', 'How to play, and settings');
    this.#el.helpPanel.tabIndex = -1;

    this.#el.help.addEventListener('click', () => {
      if (this.#el.helpPanel.hidden) this.#openHelp();
      else this.#closeHelp();
    });
    this.#el.helpPanel.addEventListener('click', () => {
      this.#closeHelp();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.#el.helpPanel.hidden) this.#closeHelp();
    });

    // The popup goes away on a tap, like everything else that covers a board.
    this.#el.toast.addEventListener('click', () => {
      this.#showNote(null);
    });

    this.#el.harvestTiles.addEventListener('click', () => {
      this.#harvest('tiles');
    });
    this.#el.harvestPoints.addEventListener('click', () => {
      this.#harvest('points');
    });
    this.#el.harvestTreasure.addEventListener('click', () => {
      this.#harvest('treasure');
    });
    this.#el.harvestBurn.addEventListener('click', () => {
      this.#harvest('burn');
    });

    // The shop's buttons are rebuilt every frame, so the listener lives on
    // the row and reads what was tapped. One listener, any number of prices.
    this.#el.purseToggle.addEventListener('click', () => {
      const open = this.#el.purseToggle.getAttribute('aria-expanded') === 'true';
      this.#el.purseToggle.setAttribute('aria-expanded', String(!open));
      this.render();
    });

    this.#el.spends.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest('button');
      const on = button?.dataset['spend'];
      if (on === undefined) return;
      const colour = button?.dataset['colour'] as Colour | undefined;
      this.#spend(on as Spend, colour);
    });

    // A stranger's first minute: the manual, open, before the board is a
    // puzzle they have to guess at. Once ever — the shell remembers — and it
    // closes on the same tap as always, so it costs a returning player
    // nothing and a new one one gesture.
    if (this.#hooks.firstVisit === true) this.#openHelp();

    this.#syncCamera();
    this.render();
  }

  /**
   * One finger taps or, past a small slop, pans. Two fingers pinch. Placement
   * only ever happens on a lift that never crossed the slop — so the board
   * can be dragged and zoomed freely without a stray tile appearing, which is
   * the gesture war P3a sidestepped by having no camera at all.
   *
   * `pointerup` rather than `click` for the tap: a click is synthesised
   * ~300ms after a touch on some mobile browsers, and placing a tile a third
   * of a second after the thumb lifts is the difference between crisp and
   * mushy.
   */
  #mountGestures(): void {
    const board = this.#el.board;
    const down = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinch = 0;

    const spread = (): number => {
      const [a, b] = [...down.values()];
      return a !== undefined && b !== undefined ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    // Only the canvas is a gesture surface. The camera buttons and the help
    // panel LIVE INSIDE the board element, and a press on them bubbles here —
    // capturing that pointer steals the button's click entirely (how every
    // board-mounted button died on desktop), and treating its lift as a tap
    // could place a tile through the help panel. Anything that is not the
    // bare board or its canvas is somebody else's press.
    const isBoardSurface = (target: EventTarget | null): boolean => {
      // While the manual is up, the board is behind a curtain and must not
      // take a single gesture — not a tap, not a drag, not a wheel. The panel
      // is inset inside `#board`, so its 8px frame was live board the whole
      // time, and closing the manual could place a tile you never meant.
      if (!this.#el.helpPanel.hidden) return false;
      return target === board || target instanceof HTMLCanvasElement;
    };

    board.addEventListener('pointerdown', (event) => {
      if (!isBoardSurface(event.target)) return;
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (down.size === 2) pinch = spread();
      try {
        board.setPointerCapture(event.pointerId);
      } catch {
        // No capture support (old browser, test DOM). Gestures still work;
        // a drag that leaves the element just ends early.
      }
    });

    // Desktop's native zoom gesture. The trackpad pinch arrives as a wheel
    // too, so this covers both mice and trackpads.
    board.addEventListener(
      'wheel',
      (event) => {
        if (!isBoardSurface(event.target)) return;
        event.preventDefault();
        this.#renderer.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
        this.#syncCamera();
      },
      { passive: false },
    );

    board.addEventListener('pointermove', (event) => {
      const from = down.get(event.pointerId);
      if (from === undefined) return;

      if (down.size >= 2) {
        down.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const d = spread();
        if (pinch > 0 && d > 0) {
          this.#renderer.zoomBy(d / pinch);
          this.#syncCamera();
        }
        pinch = d;
        moved = true;
        return;
      }

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      moved = true;
      this.#renderer.panBy(dx, dy);
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });

    const lift = (event: PointerEvent): void => {
      const had = down.delete(event.pointerId);
      if (down.size > 0) {
        // One finger of a pinch lifted; the other continues as a pan.
        pinch = 0;
        return;
      }
      const tapped = had && !moved && event.type === 'pointerup';
      moved = false;
      pinch = 0;
      if (tapped) this.#tap(event);
    };
    board.addEventListener('pointerup', lift);
    board.addEventListener('pointercancel', lift);
  }

  /**
   * The dialog contract, kept in one pair so no opener or closer can forget
   * half of it: focus moves into the panel when it opens (the panel itself,
   * tabIndex −1 — the first tab button would also do, but the panel keeps
   * working when a tuning empties the tab bar) and back to the ? button when
   * it closes, however it closes — tap, Escape, or the ? again.
   */
  #openHelp(): void {
    this.#el.helpPanel.hidden = false;
    this.#el.helpPanel.focus();
  }

  #closeHelp(): void {
    if (this.#el.helpPanel.hidden) return;
    this.#el.helpPanel.hidden = true;
    this.#el.help.focus();
  }

  #tap(event: PointerEvent): void {
    const rect = this.#el.board.getBoundingClientRect();
    const hex = this.#renderer.hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (hex === null) return;

    // On the plane a tap on a ripe tile is a QUESTION — "what is this pocket
    // worth?" — not a placement. The harvest buttons re-price to that pocket
    // and the board outlines it. Everywhere else a tap stays a placement.
    if (isRipe(this.#state.cells, hex)) {
      this.#harvestAt = hex;
      // Tapping a pocket is a question; this is the whole answer, including
      // where the numbers on the buttons come from.
      this.#showNote(this.#pocketNote(hex), true);
      this.render();
      return;
    }

    // A tap you cannot build on used to be a silent no-op — the engine
    // returned the same state and the screen said nothing, which is the
    // worst answer a game can give a deliberate action. It is now the
    // contextual help: tap a glyph, learn what it does. Nothing to learn a
    // mode for, and it costs a gesture that did nothing before.
    if (!canPlaceAt(this.#state.cells, hex)) {
      // Sticky: you asked for this one, so it waits for you to be done.
      this.#showNote(this.#describe(hex), true);
      return;
    }

    this.#showNote(null);
    this.#dispatch({ type: 'PLACE', hex });
  }

  /** A rare tile's power, in one line, or null for an ordinary one. */
  #rarityLine(rarity: Rarity | undefined): string | null {
    if (rarity === 'magic') {
      return 'MAGIC — wild: it matches every neighbouring tile, whatever the colour, and they match it back.';
    }
    if (rarity === 'unique') {
      return 'UNIQUE — wild and heavy: every match it is part of counts DOUBLE, for both sides.';
    }
    return null;
  }

  /**
   * The pocket you just tapped, priced and explained — size, worth, what each
   * button would pay, and any rare tiles inside it. The buttons already carry
   * the numbers; this says where those numbers come FROM, which is the part a
   * player has to learn once and then never again.
   */
  #pocketNote(at: HexKey): string {
    const t = this.#state.tuning;
    const value = harvestValue(this.#state, at);
    const worth = value.keys.reduce((n, k) => n + worthOf(this.#state.cells, k, t), 0);
    const multiplier = harvestMultiplier(this.#state, value.keys);

    // Rare tiles inside the pocket, and what each kind does — a ripe rare
    // tile cannot be tapped for its own explanation, because tapping it
    // prices the pocket, so the pocket has to carry the explanation.
    const rarities = new Set<Rarity>();
    for (const k of value.keys) {
      const cell = this.#state.cells[k];
      if (cell?.kind === 'tile' && cell.rarity !== undefined) rarities.add(cell.rarity);
    }
    const rares = value.keys.filter((k) => {
      const cell = this.#state.cells[k];
      return cell?.kind === 'tile' && cell.rarity !== undefined;
    }).length;

    const lines = [
      `POCKET OF ${value.count} — total worth ${worth}.`,
      `Take tiles: +${value.tiles}.`,
      `Take pts: ${value.points} = worth ${worth} × pocket ${Math.min(value.count, t.harvestSizeCap > 0 ? t.harvestSizeCap : value.count)} × distance ${multiplier}${value.questPays ? ` × bounty ${t.questBonus}` : ''}.`,
    ];
    if (value.treasure !== null)
      lines.push(`Take treasure: a ${value.treasure.toUpperCase()} tile.`);
    if (value.questPays)
      lines.push('★ This pocket collects the bounty — but only if you take PTS.');
    if (rares > 0) {
      lines.push(
        `${rares} rare tile${rares === 1 ? '' : 's'} in here will be spent by popping it.`,
      );
    }
    return lines.join('\n');
  }

  /**
   * What a harvest just did, with its arithmetic shown.
   *
   * The pop is the loudest thing that happens in a run and it used to leave
   * only a number moving in the stat row. Saying the sum out loud at the
   * moment it pays is the cheapest teaching in the game: two or three of
   * these and the formula stops being a thing to read in the manual.
   */
  #harvestNote(
    before: GameState,
    choice: HarvestChoice,
    value: ReturnType<typeof harvestValue>,
  ): string {
    const t = before.tuning;
    const worth = value.keys.reduce((n, k) => n + worthOf(before.cells, k, t), 0);
    const multiplier = harvestMultiplier(before, value.keys);
    const head = `POPPED ${value.count} — total worth ${worth}`;

    if (choice === 'tiles') {
      const luck =
        t.magicChance + t.uniqueChance > 0
          ? `\nLuck +${value.count} — your rare-tile odds just rose.`
          : '';
      // The depth grade, shown only when it actually paid something — the
      // arithmetic on screen has to sum to the number on screen.
      const rings = Math.floor(value.count * t.popTilesPerRing * (multiplier - 1));
      const depth = rings > 0 ? `, +${rings} for the depth` : '';
      return `${head}\n+${value.tiles} tiles: ${t.tilesPerPop} per tile, +1 more per ${t.worthPerExtraTile} worth${depth}.${luck}`;
    }
    if (choice === 'treasure') {
      return `${head}\nA ${String(value.treasure).toUpperCase()} tile goes to your stash — no tiles, no points.`;
    }

    const counted = t.harvestSizeCap > 0 ? Math.min(value.count, t.harvestSizeCap) : value.count;
    const capped =
      t.harvestSizeCap > 0 && value.count > t.harvestSizeCap
        ? ` (the size bonus stops at ${t.harvestSizeCap})`
        : '';
    return (
      `${head}\n+${value.points} pts = worth ${worth} × pocket ${counted}${capped} × distance ${multiplier}` +
      (value.questPays ? ` × BOUNTY ${t.questBonus}` : '') +
      (value.questPays ? '\n★ Bounty collected.' : '')
    );
  }

  /**
   * What a placement just claimed, if anything — announced in the hint line
   * so the reward is legible at the moment it is earned.
   */
  #claimNote(before: GameState, after: GameState): string | null {
    const t = after.tuning;
    for (const [k, cell] of Object.entries(after.cells)) {
      if (cell.kind !== 'landmark' || !cell.claimed) continue;
      const was = before.cells[k];
      if (was?.kind === 'landmark' && was.claimed) continue;

      // Every announcement leads with the GLYPH it happened to, because the
      // thing that pays and the words about it have to be the same object in
      // the player's head — "a star gave me that" rather than "some text
      // appeared".
      switch (cell.reward) {
        case 'cache':
          return `+  CACHE CLAIMED\n+${cachePaysAt(k, t)} tiles, on the spot.`;
        case 'site':
          return (
            `★  SITE CLAIMED\nPoints banked — and this star has set a BOUNTY: ` +
            `pop a pocket of ${t.questNeed}+ within ${t.questRadius} hexes of it and take it as PTS for ×${t.questBonus}.`
          );
        case 'territory': {
          const owns =
            cell.colour === undefined ? 'its colour' : this.#theme.terrainNames[cell.colour];
          return `◆  TERRITORY CLAIMED\nGround within ${t.territoryRadius} hexes is native to ${owns} now — and it stays yours between runs.`;
        }
        case 'shrine': {
          const label = this.#hooks.unlockLabel?.(this.#shrinesClaimed) ?? null;
          this.#shrinesClaimed++;
          return label === null
            ? '◈  SHRINE WOKEN\nThis world is fully awake — every unlock is yours.'
            : `◈  SHRINE WOKEN\n${label}\nYours from your next run on, in this world for good.`;
        }
      }
    }
    return null;
  }

  /**
   * What that hex is, in one sentence, in the direction's own words and this
   * run's own numbers. Covers the things a player can tap and not understand:
   * the four destination glyphs (reached or still glowing in the dark), wall,
   * stone, native ground, a tile not yet ripe, and ground this world only
   * remembers.
   */
  #describe(hex: HexKey): string {
    const t = this.#state.tuning;
    const name = (c: Colour): string => this.#theme.terrainNames[c];
    const cell = this.#state.cells[hex];

    const destination = (
      reward: LandmarkReward,
      colour: Colour | null,
      claimed: boolean,
    ): string => {
      if (reward === 'cache') {
        return claimed
          ? '+ CACHE — already claimed. It gave its tiles.'
          : `+ CACHE — build a tile touching it to claim ${cachePaysAt(hex, t)} tiles on the spot.`;
      }
      if (reward === 'site') {
        return claimed
          ? '★ SITE — already claimed.'
          : `★ SITE — claim it for ${t.sitePays} pts × its distance, and it opens a bounty worth ×${t.questBonus}.`;
      }
      if (reward === 'shrine') {
        const next = this.#hooks.unlockLabel?.(this.#shrinesClaimed) ?? null;
        return claimed
          ? '◈ SHRINE — woken. It switched a system on for this world.'
          : `◈ SHRINE — claim it to unlock ${next ?? 'a system'} for this world, permanently.`;
      }
      const owns = colour === null ? 'a colour' : name(colour);
      return claimed
        ? `◆ TERRITORY — yours. The ground within ${t.territoryRadius} hexes is native to ${owns}.`
        : `◆ TERRITORY — claim it and the ground within ${t.territoryRadius} hexes becomes native to ${owns}, for good.`;
    };

    if (cell === undefined) {
      // Not on the board: either a destination glowing through the dark, or
      // ground this world remembers from an earlier run.
      const { q, r } = parse(hex);
      const dest = destinationAt(this.#state.rootSeed, q, r, t);
      if (dest !== null) {
        return `${destination(dest.reward, dest.colour, false)} Build your chain out to it.`;
      }
      return 'Remembered from an earlier run — this run has not grown here yet.';
    }

    switch (cell.kind) {
      case 'landmark':
        return destination(cell.reward, cell.colour ?? null, cell.claimed);
      case 'wall':
        return t.redAshWalls
          ? `Wall — cannot be built on. It surrounds (so it helps things ripen) but never matches, except for ${name('red')}, which counts it as one.`
          : 'Wall — cannot be built on. It surrounds (so it helps things ripen) but never matches.';
      case 'stone':
        return `Spent ground — a popped tile. It surrounds but never matches, except for ${name('red')}, which feeds on it.`;
      case 'tile': {
        const worth = worthOf(this.#state.cells, hex, t);
        const power = this.#rarityLine(cell.rarity);
        return (
          `${name(cell.colour)} tile, worth ${worth}. It ripens when all six sides are covered.` +
          (power === null ? '' : `\n${power}`)
        );
      }
      case 'empty':
        return cell.native === undefined
          ? 'Open ground — you can build here once something of yours touches it.'
          : `Ground native to ${name(cell.native)} — a ${name(cell.native)} tile here is worth one more.`;
    }
  }

  /** Zooming out below fit is meaningless, so those two buttons say so. */
  #syncCamera(): void {
    const zoom = this.#renderer.zoomLevel();
    const atFit = zoom <= 1.001;
    this.#el.zoomOut.disabled = atFit;
    this.#el.zoomFit.disabled = atFit;
    // The ceiling rises as the board grows, so it has to be asked for rather
    // than assumed — a button that is dead at 4x on a small board is live
    // again at 4x once the world is twice the size.
    this.#el.zoomIn.disabled = zoom >= this.#renderer.zoomMax() - 0.001;
  }

  /**
   * The manual, in plain words, in the order a run meets each system. Every
   * number is read from the run's OWN tuning — the same object the reducer
   * pays with — so a balance change rewrites the manual by itself and the
   * text can never describe an economy that is not the one being played.
   */
  /**
   * The manual, as tabs (Marc, 2026-08-15: "rework the help with sections,
   * tabs, etc. and rework to be concise and precise. if extra calculations
   * are wanted, toggle to expand").
   *
   * The old manual was fourteen sections of paragraphs — everything true and
   * nothing findable. Two rules replace it. Each section says what a thing IS
   * in a line or two; every formula, price and threshold moves behind a
   * NUMBERS toggle, so the manual is short by default and complete on demand.
   *
   * The panel closes on any tap, which is right for prose and wrong for a
   * control — so the tabs and the toggles swallow their own taps, the same
   * way the settings rows already do.
   */
  #buildManual(): HTMLElement[] {
    const tabs = this.#helpSections();
    const bar = document.createElement('div');
    bar.className = 'help-tabs';

    const panels = tabs.map((tab, index) => {
      const panel = document.createElement('div');
      panel.className = 'help-panel-body';
      panel.hidden = index !== 0;
      panel.replaceChildren(...tab.sections.flatMap((section) => this.#helpSection(section)));
      return panel;
    });

    const buttons = tabs.map((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'help-tab';
      button.textContent = tab.label;
      if (index === 0) button.dataset['on'] = 'true';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        for (const [i, panel] of panels.entries()) panel.hidden = i !== index;
        for (const [i, other] of buttons.entries()) {
          if (i === index) other.dataset['on'] = 'true';
          else delete other.dataset['on'];
        }
      });
      return button;
    });

    bar.replaceChildren(...buttons);
    return [bar, ...panels];
  }

  /** One section: a heading, its short lines, and its numbers folded away. */
  #helpSection(section: HelpSection): HTMLElement[] {
    const heading = document.createElement('p');
    heading.className = 'help-title';
    heading.textContent = section.title;

    const lines = section.lines.map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    });

    if (section.detail === undefined || section.detail.length === 0) {
      return [heading, ...lines];
    }

    const fold = document.createElement('details');
    fold.className = 'help-more';
    const summary = document.createElement('summary');
    summary.textContent = 'NUMBERS';
    // A summary that let its tap through would open the fold and close the
    // panel in the same gesture, which reads as the button not working.
    summary.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    fold.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    fold.replaceChildren(
      summary,
      ...section.detail.map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );

    return [heading, ...lines, fold];
  }

  #helpSections(): HelpTab[] {
    const t = this.#state.tuning;
    const name = (c: Colour): string => this.#theme.terrainNames[c];

    // Every number below is read from the run's OWN tuning — the same object
    // the reducer pays with — so a balance change rewrites the manual by
    // itself and the text can never describe an economy nobody is playing.

    // The quick start (Marc, 2026-08-18: "here is what you see, here is what
    // you do, here is how you make points — then the advanced sections").
    // Three sections, three lines each, no NUMBERS fold: the one tab a
    // stranger reads before their first placement. Everything it says is said
    // again, properly, in the tabs after it.
    const start: HelpTab = {
      id: 'start',
      label: 'START',
      sections: [
        {
          title: 'WHAT YOU SEE',
          lines: [
            'The board is your land. The cards below are tiles you can place.',
            'Glowing edges are where you may build. Faint numbers show what a tile pays there.',
            'Lights beyond your land are places worth walking to. They pay when you reach them.',
          ],
        },
        {
          title: 'WHAT YOU DO',
          lines: [
            'Tap a card, then tap a glowing hex.',
            'Surround a tile on all six sides and it ripens — it lights up.',
            'Tap a ripe tile, then POP. Popping pays the tiles that keep you going.',
          ],
        },
        {
          title: 'HOW YOU SCORE',
          lines: [
            'Every pop scores on its own. You never trade survival for points.',
            'Bigger pockets score more. Pockets farther from home score much more.',
            'The run ends when your tiles run out. Go deep before it does.',
          ],
        },
      ],
    };

    const play: HelpTab = {
      id: 'play',
      label: 'PLAY',
      sections: [
        {
          title: 'THE LOOP',
          lines: [
            'Place tiles. Surround them on all six sides to ripen them. Pop them for tiles. Go farther.',
            t.singlePayout
              ? 'Tiles are the only thing keeping you alive. Popping always pays tiles and scores at the same time — so what you decide is WHEN and WHERE, never which button.'
              : 'Tiles keep you going; points are the score. You take one or the other, never both.',
          ],
          detail: [
            `You start with ${t.startingTiles} tiles on one endless plane. Every placement spends tiles, every pocket hands some back, and a good or lucky run simply goes farther.`,
            t.runLength > 0
              ? `The expedition is ${t.runLength} placements long whether or not you spend your tiles — so tiles you never place are wasted.`
              : 'There is no clock. The purse is the whole limit, and the run ends when you cannot afford a placement.',
          ],
        },
        {
          title: 'PLACING',
          lines: [
            'Tap a card, then tap a hex with a glowing edge. A tile must touch something already built.',
            'The faint number on an empty hex is exactly what the selected tile will be worth there. A promise, not an estimate.',
          ],
          detail: [
            t.costGrace > 0
              ? `A placement costs ${t.baseCost} tiles for the first ${t.costGrace}, then +1 for every ${t.costRisesEvery} after.`
              : `A placement costs ${t.baseCost} tiles, +1 for every ${t.costRisesEvery} you have ever placed this run.`,
            'The cost never comes back down. That is the clock that ends every run.',
            'BEST marks the card whose strongest placement pays most right now. Advice, not an order.',
          ],
        },
        {
          title: 'RIPE AND WORTH',
          lines: [
            'A tile touched on all six sides is RIPE. Walls, stone, ground off the map and other tiles all count as touching.',
            'WORTH is how many of its neighbours match it. The bright number on a ripe tile is its worth.',
          ],
          detail: [
            'Same colour matches. Stone and walls surround but never match — they help you ripen and pay you nothing.',
            'Dotted ground native to a tile’s own colour counts as one extra match.',
            'One tile can raise the worth of up to six neighbours at once. That is the whole craft.',
          ],
        },
        {
          title: 'POPPING',
          lines: [
            'Tap any ripe tile to price its pocket — the board outlines it and the buttons show what it pays. The biggest pocket is priced by default.',
            'Popped tiles turn to STONE: still surrounds, never matches. Every pop makes that ground poorer, which is the pressure to keep moving.',
            t.runLength > 0
              ? 'Wait too long and the expedition ends around your unfinished pocket.'
              : 'Wait too long and you can die broke with a fortune still in the ground.',
          ],
          detail: [
            `A pop pays ${t.tilesPerPop} tile per popped tile, plus 1 more per ${t.worthPerExtraTile} worth.`,
            ...(t.popTilesPerRing > 0
              ? [
                  `Depth pays: a pocket adds ${t.popTilesPerRing} tile per popped tile for every distance ring it sits from home.`,
                ]
              : []),
            `It scores the pocket’s summed worth × its size bonus × the distance multiplier, which rises by 1 every ${t.distanceStep} hexes from home.`,
            ...(t.harvestSizeCap > 0
              ? [
                  `The size bonus stops growing past ${t.harvestSizeCap} tiles — a bigger pocket pays more worth but no more multiplier.`,
                ]
              : []),
            ...(t.treasureNeed > 0
              ? [
                  `A pocket of ${t.treasureNeed}+ can be cashed as TREASURE instead: a magic tile into your stash, or a unique one from ${t.treasureUnique}+. You give up the tiles and the score to choose a power instead of waiting for one.`,
                ]
              : []),
          ],
        },
      ],
    };

    const colourPowers =
      t.greenCrowdBonus + t.yellowCompanyBonus + t.blueTideEvery > 0 || t.redAshMatches;

    const board: HelpTab = {
      id: 'board',
      label: 'BOARD',
      sections: [
        ...(colourPowers
          ? [
              {
                title: 'THE COLOURS',
                lines: [
                  `${name('green')} — crowds. Wants to be one big mob of its own colour.`,
                  `${name('yellow')} — company. Scores in messy mixed ground where nothing else matches.`,
                  `${name('red')} — ash. Builds along the spent, popped land everyone else abandons.`,
                  `${name('blue')} — tide. Worth little at home, a lot on the frontier.`,
                ],
                detail: [
                  `${name('green')}: +${t.greenCrowdBonus} worth per neighbour of its own colour past the first.`,
                  t.yellowCompanyAll
                    ? `${name('yellow')}: +${t.yellowCompanyBonus} worth per differently-coloured neighbour.`
                    : `${name('yellow')}: +${t.yellowCompanyBonus} worth per DIFFERENT colour touching it.`,
                  t.redAshWalls
                    ? `${name('red')}: stone and walls both count as matches for it.`
                    : `${name('red')}: stone counts as a match for it.`,
                  `${name('blue')}: +1 worth per ${t.blueTideEvery} hexes from home.`,
                ],
              },
            ]
          : []),
        {
          title: 'THE GROUND',
          lines: [
            'Dotted ground is a NATIVE FIELD — a tile of that colour placed there gains a match.',
            'Walls cannot be built on. They surround but never match, and a frontier that is all wall can end a run.',
          ],
          detail: [
            'Whole regions of one colour’s dots are BIOMES. Chasing a colour means walking to where it grows.',
            'The plane only exists where you have grown it. Every placement reveals the ground around itself.',
          ],
        },
        {
          title: 'WHERE TO GO',
          lines: [
            'The glows beyond your ground are destinations, shining through land you have not reached. Touch one with a tile to claim it. Each pays once.',
            t.cachePaysPerRing > 0
              ? `+ CACHE — ${t.cachePays} tiles on the spot, +${t.cachePaysPerRing} more per ring out.`
              : `+ CACHE — ${t.cachePays} tiles on the spot.`,
            `★ SITE — points, and it opens a bounty.`,
            `◆ TERRITORY — turns the ground around it into your field, for good.`,
            '◈ SHRINE — switches a system on for your world, permanently.',
          ],
          detail: [
            `A site pays ${t.sitePays} pts × the distance multiplier at its hex.`,
            ...(t.destinationRampBlocks > 0
              ? [
                  'The near world is deliberately sparse. The deeper you push, the thicker the lights — and the richer the caches.',
                ]
              : []),
            ...(t.questNeed > 0
              ? [
                  `Its bounty: pop a pocket of ${t.questNeed}+ within ${t.questRadius} hexes of it and take it as PTS for ×${t.questBonus}. Take it as tiles and the bounty stays standing. One at a time.`,
                ]
              : []),
            `A territory’s field reaches ${t.territoryRadius} hexes, and it glows in the colour it will grant.`,
            'Caches and sites re-arm every run, so ground you know stays worth walking.',
            'The line above your hand always names the nearest unclaimed destination and how far out it sits.',
          ],
        },
        {
          title: 'READING THE SCREEN',
          lines: [
            t.hidePoints
              ? 'TILES keeps you alive · LUCK is what pops pay and the shop spends · REACH is how far you have built · COST is the next placement.'
              : 'TILES keeps you alive · POINTS is your score · REACH is how far you have built · COST is the next placement.',
            'Zoom with + and −, pinch, or drag to pan. FIT shows everything.',
          ],
          detail: [
            ...(t.hidePoints
              ? [
                  'Your SCORE is deliberately off screen while you play. It is what the run is worth when it ends, not a number to play against.',
                ]
              : []),
            'The line above your hand reads: what to do now · the nearest destination · your odds.',
            'Worth numbers on tiles appear as you zoom in. Tapping any symbol on the map explains it where it sits.',
          ],
        },
      ],
    };

    const hand: HelpTab = {
      id: 'hand',
      label: 'HAND',
      sections: [
        {
          title: 'RARE TILES',
          lines: [
            'MAGIC is wild: it matches every neighbour whatever the colour, and they match it back.',
            'UNIQUE is wild and heavy: every match it makes counts DOUBLE, for both sides.',
          ],
          detail: [
            'The card says which it is, and rare tiles keep an accent edge once placed.',
            'A unique’s ground match counts double too.',
          ],
        },
        ...(t.luckRerollCost > 0
          ? [
              {
                title: 'LUCK IS A PURSE',
                lines: [
                  'Luck buys nothing by itself. You spend it, on the row under your hand.',
                  `Every pop pays about ${t.luckPerPop} luck flat plus a little per tile — so many small pops earn far more luck than one monster, while the monster wins on tiles.`,
                  'So popping early is about affording what you need next, not about odds.',
                ],
                detail: [
                  `REDRAW (${t.luckRerollCost}) — throw this hand away for a new one.`,
                  `A COLOUR’S NAME (${t.luckSteerCost}) — draw a new hand leaning that way, and keep the next ${t.colourBiasDraws} draws leaning with it. How you go and get the colour a pocket needs.`,
                  `FORGE (${t.luckForgeCost}) — turn the selected card UNIQUE. The only way to have a rare exactly when you want one.`,
                ],
              },
            ]
          : []),
        ...(t.holdSlots > 0
          ? [
              {
                title: 'THE STASH',
                lines: [
                  'The dashed HOLD card keeps one tile for later. Tap to stash the selected card; tap again to trade it back.',
                ],
                detail: [
                  'Held tiles survive rerolls — save a rare tile, or the right colour, for the moment it is worth something.',
                ],
              },
            ]
          : []),
      ],
    };

    const after: HelpTab = {
      id: 'after',
      label: 'AFTER',
      sections: [
        ...(t.burnRelics > 0
          ? [
              {
                title: 'RELICS',
                lines: [
                  'Relics are not points. Points are what a run is worth; relics buy the NEXT run.',
                  'Both come out of the same pockets, so every ripe pocket asks which game you are playing.',
                  'SACRIFICE a pocket and it pays relics and nothing else — no tiles to live on, no score.',
                ],
                detail: [
                  `A sacrifice pays ${t.burnRelics} relics per tile in the pocket.`,
                  `Reaching somewhere new pays ${t.claimRelics}, for nothing — the half of the meta that costs no sacrifice.`,
                  `When a run ends, ${Math.round(t.luckToRelics * 100)}% of the luck still in your purse comes home, so hoarding luck is a real alternative to spending it.`,
                ],
              },
              {
                title: 'THE SHOP',
                lines: [
                  'Spend relics on the screen that appears when a run ends. Everything you buy is permanent and follows you into every world.',
                  'PERKS change the rules rather than the numbers. You may wear one at a time until you buy the second slot.',
                ],
                detail: [
                  'DEEPER PURSE, KEENER EYE and RICHER WORLDS are the steady floor: more starting tiles, better odds, more out there to find.',
                  'ROOTBOUND makes your own ground pay double and everything else pay nothing.',
                  'SECOND WIND flips a coin the first time a run would end broke. Half the time you carry on. Half the time you do not.',
                ],
              },
            ]
          : []),
        {
          title: 'HOW IT ENDS',
          lines: [
            'Out of tiles with nothing ripe to cash: broke. Walking to caches is how you avoid it.',
            'A frontier that is all wall with nothing left to pop: walled in. Rare, and worth avoiding on the way past.',
            ...(t.runLength > 0
              ? [
                  'LEFT reaches zero: the expedition is over. Anything already ripe can still be cashed.',
                ]
              : []),
          ],
        },
        {
          title: 'YOUR WORLD',
          lines: [
            'This device has ONE world, and it remembers. Ground you have revealed stays drawn faint on later runs.',
            'Territories you claim are yours for good and greet you already claimed.',
          ],
          detail: [
            ...(t.territoryTiles > 0
              ? [
                  `Each territory held starts every later run with +${t.territoryTiles} tiles, up to +${t.territoryTilesCap}.`,
                ]
              : []),
            'SETTINGS shows what your world has seen, and can abandon it for a fresh one.',
          ],
        },
      ],
    };

    // "What this game is", derived rather than written: the systems list comes
    // from the run's own tuning, so it re-describes itself after every balance
    // or flag change. The decisions behind the switches live in SETTINGS.
    const systems: string[] = [];
    if (t.destinationEvery > 0) systems.push('destinations');
    if (t.biomeEvery > 0) systems.push('biomes');
    if (t.magicChance + t.uniqueChance > 0) systems.push('rare tiles');
    if (t.luckRerollCost > 0) systems.push('the luck purse');
    if (t.burnRelics > 0) systems.push('relics + the shop');
    if (t.greenCrowdBonus + t.yellowCompanyBonus + t.blueTideEvery > 0 || t.redAshMatches) {
      systems.push('colour personalities');
    }
    if (t.holdSlots > 0) systems.push('the stash');

    const build: HelpTab = {
      id: 'build',
      label: 'BUILD',
      sections: [
        {
          title: 'THIS BUILD',
          lines: [
            `One endless plane, grown from seed ${this.#state.rootSeed}. Same seed, same world — share the number to share the run.`,
            systems.length > 0
              ? `In play: ${systems.join(' · ')}.`
              : 'In play: nothing. This is the smallest game there is.',
          ],
          detail: [
            `Start with ${t.startingTiles} tiles · a placement costs ${t.baseCost}` +
              (t.costGrace > 0 ? ` for ${t.costGrace} placements, then` : ',') +
              ` +1 per ${t.costRisesEvery} placed` +
              (t.runLength > 0 ? ` · ${t.runLength} placements to the expedition` : '') +
              ` · ${t.draftWidth}-card draft${t.holdSlots > 0 ? ' plus the stash' : ''}.`,
            'SETTINGS below switches every system and carries the decision that set each default.',
            'The stamp at the bottom of the screen names the exact code this page is running.',
          ],
        },
      ],
    };

    const tabs = [start, play, board, hand, after, build];
    return tabs.filter((tab) => tab.sections.length > 0);
  }

  /**
   * Harvest what the buttons are pricing. The selector owns which pocket that
   * is (`hud.harvestAt`), so the dispatch and the price cannot disagree.
   */
  /**
   * The luck shop: what popping early is for.
   *
   * Everything the shop sells is on screen at all times, priced, whether or
   * not the purse can pay — the whole reason to cash a small pocket is that
   * you can see what the luck is going to buy. Unaffordable rows are dimmed
   * rather than removed, which is what makes them a goal instead of a
   * surprise. The row hides entirely where luck has no prices.
   */
  #renderSpends(hud: HudView): void {
    this.#el.purse.hidden = hud.spends.length === 0;
    if (hud.spends.length === 0) {
      this.#el.spends.replaceChildren();
      return;
    }

    // Closed by default, because six buttons wrapping to two rows under the
    // hand was the crammed thing. The toggle carries the purse and the
    // cheapest price, and wears the accent whenever something is affordable —
    // so a folded shop advertises itself at exactly the moment it can be used,
    // which the always-open version somehow did not: Marc finished a run with
    // 166 luck unspent while every price sat on screen the whole time.
    const cheapest = hud.spends.reduce((n, s2) => Math.min(n, s2.cost), Infinity);
    const canBuy = hud.spends.some((s2) => s2.affordable);
    const open = this.#el.purseToggle.getAttribute('aria-expanded') === 'true';

    this.#el.purseToggle.textContent = open
      ? `${hud.luck} LUCK  ▾`
      : `${hud.luck} LUCK  ${canBuy ? '· SPEND' : `· next ${cheapest}`}  ▸`;
    // Written rather than merely read, so the control states its own state
    // even on the first frame — a screen reader should not have to infer it.
    this.#el.purseToggle.setAttribute('aria-expanded', String(open));
    this.#el.purseToggle.classList.toggle('live', canBuy);
    this.#el.spends.hidden = !open;
    if (!open) return;

    this.#el.spends.replaceChildren(
      ...hud.spends.map((spend) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'spend';
        button.dataset['spend'] = spend.on;
        button.disabled = !spend.affordable;
        if (spend.colour !== null) button.dataset['colour'] = spend.colour;

        const label =
          spend.colour !== null
            ? this.#theme.terrainNames[spend.colour]
            : spend.on === 'reroll'
              ? 'REDRAW'
              : 'FORGE';
        button.textContent = `${label} ${spend.cost}`;
        button.title =
          spend.on === 'reroll'
            ? 'Throw this hand away and draw a new one.'
            : spend.on === 'forge'
              ? 'Turn the selected card UNIQUE: wild, and its matches count double.'
              : `Draw a new hand leaning ${label}, and keep it leaning for the next few draws.`;
        return button;
      }),
    );
  }

  #harvest(choice: HarvestChoice): void {
    const at = toHudView(this.#state, this.#harvestAt).harvestAt;
    this.#dispatch(at === null ? { type: 'HARVEST', choice } : { type: 'HARVEST', choice, at });
  }

  /**
   * Buy something with luck, and SAY what was bought.
   *
   * A reroll that silently replaces three cards looks identical to a bug, so
   * every purchase pays out into the toast — the purse is a currency now and
   * a currency you cannot see leaving is a currency you stop trusting.
   */
  #spend(on: Spend, colour?: Colour): void {
    const before = this.#state.luck;
    this.#dispatch(colour === undefined ? { type: 'SPEND', on } : { type: 'SPEND', on, colour });
    const paid = before - this.#state.luck;
    if (paid <= 0) return;

    const word = colour === undefined ? '' : this.#theme.terrainNames[colour];
    this.#showNote(
      on === 'reroll'
        ? `A fresh hand, for ${paid} luck.`
        : on === 'steer'
          ? `${word} runs hot: a new hand drawn under it, and the next ${this.#state.tuning.colourBiasDraws} draws lean its way. ${paid} luck.`
          : `Forged UNIQUE — wild, and every match it makes counts double, both ways. ${paid} luck.`,
    );
  }

  #dispatch(action: Action): void {
    // Priced BEFORE the pop, because after it the pocket is stone and the
    // sum cannot be shown any more.
    const harvested = action.type === 'HARVEST' ? harvestValue(this.#state, action.at) : null;

    const next = reduce(this.#state, action);
    // The engine returns the same state for anything illegal, so this is also
    // the "that did nothing" check — no need to ask permission before acting.
    if (next === this.#state) return;

    // Reaching a destination is the biggest thing that can happen in a
    // placement, and until now the only sign was a number moving somewhere
    // else on the screen. A shrine was worse than that: its whole payoff
    // lands on the NEXT run, so claiming one looked like nothing at all.
    const claimed = this.#claimNote(this.#state, next);
    const popped =
      harvested !== null && action.type === 'HARVEST'
        ? this.#harvestNote(this.#state, action.choice, harvested)
        : null;

    this.#state = next;
    // A pop outranks a claim in the popup: it is the thing the player just
    // decided, and its arithmetic is the thing worth learning.
    const note = popped ?? claimed;
    if (note !== null) this.#showNote(note);
    // Every real change is offered to the shell to keep. Saving after each
    // action rather than on some timer means the most a crash can eat is one
    // tap — a run is 10-20 minutes of a phone's attention, and phones wander.
    this.#hooks.onChange?.(next);
    this.render();
  }

  render(): void {
    this.#renderer.draw(
      toBoardView(
        this.#state,
        this.#harvestAt,
        this.#spotlight,
        this.#hooks.memory ?? [],
        this.#theme.light,
      ),
    );
    this.#renderHud(toHudView(this.#state, this.#harvestAt, this.#spotlight));
    // The board just grew, which moved the zoom ceiling: a placement can make
    // ZOOM IN live again after it had gone dead. Resyncing only on the camera
    // buttons left that state a placement behind.
    this.#syncCamera();
  }

  /**
   * Say something over the board, and take it away again.
   *
   * Claims announce themselves for `NOTE_MS`; an explanation you asked for by
   * tapping a glyph stays until you tap it away, because you are reading it
   * deliberately and a timer would be a race against your own eyes.
   */
  #showNote(text: string | null, sticky = false): void {
    if (this.#noteTimer !== null) {
      clearTimeout(this.#noteTimer);
      this.#noteTimer = null;
    }
    this.#el.toast.textContent = text ?? '';
    this.#el.toast.hidden = text === null;

    if (text !== null && !sticky) {
      this.#noteTimer = setTimeout(() => {
        this.#el.toast.hidden = true;
        this.#noteTimer = null;
      }, NOTE_MS);
    }
  }

  #renderHud(hud: HudView): void {
    this.#renderStats(hud);
    this.#renderDraft(hud);
    this.#renderColours(hud);

    // The reorientation line: what to do now, then the nearest destination,
    // then the odds. One string, collapsing to nothing when all are silent.
    // With a colour chip held down, its calculation takes the line instead —
    // the lens is exactly a question, and this is its answer, per colour:
    // the numbers, how much the colour's own power earned of them, and the
    // power itself. The formula is one channel for everyone by design; what
    // differs is how each colour builds worth, so that is what the tip says.
    const spot = hud.spotlight;
    const spotLine =
      spot === null
        ? null
        : `${this.#theme.terrainNames[spot.colour]}: ` +
          (spot.count === 0
            ? 'nothing standing yet'
            : `${spot.count} ${spot.count === 1 ? 'tile' : 'tiles'} standing · worth ${spot.worth}` +
              // The power's take, by name: "worth 14 — 5 from its power
              // (ash)" reads as a report card on playing the colour its own
              // way, where "earned by its trick" read as a riddle.
              (spot.bonus > 0
                ? ` — ${spot.bonus} from its power (${POWER_NAMES[spot.colour]})`
                : '') +
              (spot.ripeCount > 0 ? ` · ${spot.ripeWorth} of it ripe now` : '') +
              ` · pts when popped = worth × pocket size × distance`) +
          this.#powerOf(spot.colour);
    const parts = [spotLine ?? hud.guide, hud.questLine ?? hud.hint, hud.odds];
    if (this.#hooks.debug === true) parts.push(this.#debugLine());
    const hint = parts.filter((s) => s !== null).join(' · ');
    this.#el.hint.textContent = hint;
    this.#el.hint.hidden = hint === '';

    // The harvest buttons exist only while the choice does. A pair of dead
    // buttons pricing an impossible harvest at 0 was two decisions on screen
    // that were not decisions; their appearing IS the "pocket ready" signal,
    // and when they appear both payouts show their real numbers — the choice
    // is only a choice if you can see what you are giving up.
    // A tiles-harvest that buys nothing says so on the button itself, because
    // a dead option that looks exactly like a live one is how a player wastes
    // the back half of a run.
    this.#el.harvestTiles.textContent = hud.tilesSpare
      ? `Take ${hud.harvestTiles} tiles · SPARE`
      : `Take ${hud.harvestTiles} tiles`;
    this.#el.harvestTiles.classList.toggle('spare', hud.tilesSpare);
    // Under the single payout there is nothing to choose between: one POP
    // button that pays tiles and scores, and the points button stops
    // existing rather than sitting there meaning the same thing.
    if (hud.singlePayout) {
      this.#el.harvestTiles.textContent = hud.questPays
        ? `★ POP  ${hud.harvestTiles} tiles · ${hud.harvestPoints} pts`
        : `POP  ${hud.harvestTiles} tiles · ${hud.harvestPoints} pts`;
      this.#el.harvestTiles.classList.toggle('bounty', hud.questPays);
      this.#el.harvestTiles.classList.remove('spare');
      this.#el.harvestPoints.hidden = true;
      this.#el.harvestPoints.disabled = true;
    } else {
      // The bounty rides on the button that collects it, with its multiplier
      // shown — the reason to press a button belongs on the button.
      this.#el.harvestPoints.textContent = hud.questPays
        ? `Take ${hud.harvestPoints} pts ★`
        : `Take ${hud.harvestPoints} pts`;
      this.#el.harvestPoints.classList.toggle('bounty', hud.questPays);
    }

    this.#renderSpends(hud);

    // The sacrifice, where it exists: give up the pocket for luck instead.
    const burn = hud.canHarvest ? hud.harvestBurn : 0;
    this.#el.harvestBurn.hidden = burn <= 0;
    this.#el.harvestBurn.disabled = burn <= 0;
    if (burn > 0) {
      this.#el.harvestBurn.textContent = hud.burnPaysRelics
        ? `SACRIFICE  ${burn} relics`
        : `BURN  +${burn} luck`;
    }
    this.#el.harvestTiles.hidden = !hud.canHarvest;
    this.#el.harvestTiles.disabled = !hud.canHarvest;
    // The points button is GONE under the single payout, not merely empty —
    // this line un-hid it a moment after the branch above hid it, and an
    // empty button between POP and TREASURE is what Marc's phone showed.
    this.#el.harvestPoints.hidden = hud.singlePayout || !hud.canHarvest;
    this.#el.harvestPoints.disabled = hud.singlePayout || !hud.canHarvest;

    // The third payout appears only for a pocket big enough to earn it, and
    // says which rare tile it hands over — the whole point is choosing a
    // specific power instead of waiting for the draft to offer one.
    const treasure = hud.canHarvest ? hud.harvestTreasure : null;
    this.#el.harvestTreasure.hidden = treasure === null;
    this.#el.harvestTreasure.disabled = treasure === null;
    if (treasure !== null) {
      this.#el.harvestTreasure.textContent = `TAKE  1 ${treasure.toUpperCase()}`;
    }

    // A finished run has no hand to play and no luck to spend, and leaving
    // those controls on screen did worse than confuse: the end screen is long
    // now that it carries the shop, and the live controls ended up drawn over
    // the board itself (Marc's second screenshot). Dead controls come off.
    this.#el.controls.hidden = hud.ended;
    this.#el.end.hidden = !hud.ended;
    if (hud.ended) this.#renderEnd(hud);
  }

  /**
   * The run's arc, drawn: one bar per harvest, placed where it landed in the
   * run, as tall as its score against the run's biggest — which is drawn in
   * the accent. Gate D's question ("did the biggest number come near the
   * end?") answered by a picture instead of a percentage buried in a fact
   * line. Inline SVG so it costs no asset, inherits the theme through CSS,
   * and survives a screenshot at any width.
   */
  #arcChart(): SVGSVGElement | null {
    const harvests = this.#state.log.harvests;
    if (harvests.length < 2) return null;
    const biggest = harvests.reduce((n, h) => Math.max(n, h.points), 0);
    const span = Math.max(1, this.#state.placements);
    if (biggest <= 0) return null;

    const NS = 'http://www.w3.org/2000/svg';
    const W = 280;
    const H = 44;
    const BASE = H - 2;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'end-arc');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `every pop of the run in order; the biggest landed ${Math.round(
        ((harvests.find((h) => h.points === biggest)?.at ?? 0) / span) * 100,
      )}% of the way through`,
    );

    const base = document.createElementNS(NS, 'line');
    base.setAttribute('x1', '0');
    base.setAttribute('y1', String(BASE));
    base.setAttribute('x2', String(W));
    base.setAttribute('y2', String(BASE));
    base.setAttribute('class', 'end-arc-base');
    svg.appendChild(base);

    for (const h of harvests) {
      const x = 3 + (h.at / span) * (W - 6);
      const height = Math.max(2, (h.points / biggest) * (H - 8));
      const bar = document.createElementNS(NS, 'rect');
      bar.setAttribute('x', String(x - 1.5));
      bar.setAttribute('y', String(BASE - height));
      bar.setAttribute('width', '3');
      bar.setAttribute('height', String(height));
      bar.setAttribute('class', h.points === biggest ? 'end-arc-bar best' : 'end-arc-bar');
      svg.appendChild(bar);
    }
    return svg;
  }

  /**
   * The run, ended — Gate D's screen. The cause of death in one sentence,
   * then the arc in numbers: the score, how far, the biggest pop and WHERE it
   * landed in the run (near the end is an arc; the gate's question, asked of
   * every run), what was claimed, and the standing best so a finished run
   * immediately poses the next one's question. One button: again.
   */
  #renderEnd(hud: HudView): void {
    if (this.#recordLines === null) {
      this.#recordLines = [];
      const book = this.#hooks.finish?.(this.#state);
      if (book !== undefined) {
        this.#recordLines.push(
          book.isNewBest ? `NEW BEST — ${book.best} pts` : `best ${book.best} pts`,
        );
        // A Gate B tally line lived here until 2026-08-18, guarded to hide
        // itself under the single payout — which shipped, so the guard held
        // the door shut on the roadmap's own evidence. The gate is retired
        // (singlePayout WAS its prescribed fallback); the run's pops, burns
        // and biggest-pop already print in the facts line below.
      }
    }

    const line = (cls: string, text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      return p;
    };

    // The game says its own name here, because this is the screen that gets
    // screenshotted and shared — a picture of a run should say whose run.
    const parts: Element[] = [
      line('end-title', NAME),
      line('end-epitaph', hud.epitaph ?? ''),
      line('end-score', `${hud.points} pts`),
    ];
    const arc = this.#arcChart();
    if (arc !== null) parts.push(arc);
    if (this.#recordLines.length > 0) parts.push(line('end-best', this.#recordLines[0]!));

    const s = hud.summary;
    if (s !== null) {
      const facts: string[] = [`reach ${hud.depthValue}`, `${hud.placements} placements`];
      if (s.harvests > 0) {
        facts.push(
          hud.singlePayout
            ? `${s.harvests} pocket${s.harvests === 1 ? '' : 's'} popped`
            : `${s.tilesTaken} tiles / ${s.pointsTaken} pts taken`,
        );
      }
      if (s.biggestHarvest > 0) {
        facts.push(
          `biggest pop ${s.biggestHarvest} pts at ${Math.round(s.biggestAt * 100)}% of the run`,
        );
      }
      if (s.claims > 0) facts.push(`${s.claims} destination${s.claims === 1 ? '' : 's'} reached`);
      if (s.quests > 0) facts.push(`${s.quests} quest${s.quests === 1 ? '' : 's'} done`);
      if (s.luck > 0) facts.push(`luck ${s.luck}`);
      if (hud.relics > 0) facts.push(`${hud.relics} relics carried out`);
      parts.push(line('end-facts', facts.join(' · ')));
    }

    if (this.#recordLines.length > 1) parts.push(line('end-facts', this.#recordLines[1]!));

    parts.push(...this.#shopParts());

    if (this.#hooks.newRun !== undefined) {
      const again = document.createElement('button');
      again.type = 'button';
      again.id = 'end-new-run';
      again.textContent = 'NEW RUN';
      const start = this.#hooks.newRun;
      again.addEventListener('click', () => {
        start();
      });
      parts.push(again);
    }

    if (this.#hooks.share !== undefined) {
      const share = document.createElement('button');
      share.type = 'button';
      share.id = 'end-share';
      share.className = 'quiet';
      share.textContent = 'SHARE THIS RUN';
      const send = this.#hooks.share;
      share.addEventListener('click', () => {
        void send(this.#state).then((outcome) => {
          // The share sheet is its own feedback; the clipboard is not. The
          // acknowledgement lives on the button because the button is what
          // the eye is already on.
          if (outcome === 'shared') return;
          share.textContent = outcome === 'copied' ? 'LINK COPIED' : 'SHARING UNAVAILABLE';
          setTimeout(() => {
            share.textContent = 'SHARE THIS RUN';
          }, 2000);
        });
      });
      parts.push(share);
    }

    this.#el.end.replaceChildren(...parts);
  }

  /**
   * The between-runs shop, on the end screen because that is the moment the
   * numbers mean something (Marc's call, 2026-08-15). Relics are the currency
   * and they are NOT points: points are the score you chase, relics are what
   * buys the next run, and a pocket spent on one is a pocket not spent on the
   * other.
   *
   * Everything is listed, priced, whether or not it can be afforded — the
   * shop is what gives a burnt pocket a reason, so its expensive half has to
   * be visible from the first run. Empty entirely where there is no meta
   * economy, which is every game but the tiles-only one.
   */
  #shopParts(): HTMLElement[] {
    const shop = this.#hooks.shop;
    if (shop === undefined) return [];
    const progress = shop.read();
    const slots = slotsOf(progress);

    const head = document.createElement('p');
    head.className = 'shop-purse';
    head.textContent = `${progress.relics} RELICS`;

    const rows = UPGRADES.map((upgrade) => {
      const level = levelOf(progress, upgrade.id);
      const price = priceOf(progress, upgrade);
      const owned = level > 0;
      const worn = progress.equipped.includes(upgrade.id);

      const row = document.createElement('div');
      row.className = 'shop-row';
      if (worn) row.dataset['worn'] = 'true';

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

      // A perk already owned offers the only other thing it can do: be worn,
      // or taken off to make room. With two perks and one slot that is the
      // decision the slot upgrade exists to sell.
      if (upgrade.perk && owned) {
        button.textContent = worn ? 'WORN' : 'WEAR';
        button.disabled = false;
        button.addEventListener('click', () => {
          shop.write(equip(shop.read(), upgrade.id));
          this.#renderEnd(toHudView(this.#state, this.#harvestAt, this.#spotlight));
        });
      } else if (price === null) {
        button.textContent = 'DONE';
        button.disabled = true;
      } else {
        button.textContent = String(price);
        button.disabled = progress.relics < price;
        button.addEventListener('click', () => {
          shop.write(buy(shop.read(), upgrade));
          this.#renderEnd(toHudView(this.#state, this.#harvestAt, this.#spotlight));
        });
      }

      row.append(name, note, button);
      return row;
    });

    const slotLine = document.createElement('p');
    slotLine.className = 'end-facts';
    slotLine.textContent =
      slots === 1 ? 'One perk may be worn at a time.' : `${slots} perks may be worn at a time.`;

    return [head, ...rows, slotLine];
  }

  /**
   * Four numbers, each with its label above it.
   *
   * It was one concatenated line before, which was legible on a laptop and a
   * smear on a phone. The structure is the same in every art direction handed
   * down — tiles and points on the left, map and cost on the right — and cost is
   * on it because cost is the thing that eventually kills you.
   *
   * `data-stat="tiles"` carries the one piece of meaning the CSS needs: that is
   * the number counting down, and every direction paints it in its one warm
   * colour for that reason.
   */
  #renderStats(hud: HudView): void {
    const stats: readonly Stat[] = [
      { id: 'tiles', label: 'TILES', value: String(hud.tiles) },
      // Score where it is worth watching; otherwise the purse, which is the
      // number this game is actually played against.
      hud.showPoints
        ? ({ id: 'points', label: 'POINTS', value: String(hud.points) } satisfies Stat)
        : ({ id: 'luck', label: 'LUCK', value: String(hud.luck) } satisfies Stat),
      { id: 'map', label: 'REACH', value: String(hud.depthValue) },
      { id: 'cost', label: 'COST', value: `−${hud.cost}` },
      // The clock, where there is one. Last on the row because it is the
      // number you check rather than the number you watch — but on screen
      // from the first second, because a budget sprung at the end is a trick.
      ...(hud.left === null
        ? []
        : [{ id: 'left', label: 'LEFT', value: String(hud.left) } satisfies Stat]),
    ];

    this.#el.stats.replaceChildren(
      ...stats.map((stat) => {
        const box = document.createElement('div');
        box.className = 'stat';
        box.dataset['stat'] = stat.id;
        // A STABLE name per stat. The row is rebuilt wholesale every render,
        // which is exactly why it must not be an aria-live region (every
        // action would re-announce four numbers); a constant label instead,
        // so a reader can find TILES by name and ask for it when it wants it.
        box.setAttribute('aria-label', stat.label);

        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = stat.label;

        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = stat.value;

        box.append(label, value);
        return box;
      }),
    );
  }

  #renderDraft(hud: HudView): void {
    // Rebuilt rather than diffed: three buttons, redrawn a few hundred times a
    // run. A diffing scheme here would be more code than the thing it speeds up.
    this.#el.draft.replaceChildren(
      ...hud.draft.map((tile, index) => {
        const button = document.createElement('button');
        button.className = 'tile';
        button.dataset['colour'] = tile.colour;
        button.dataset['rarity'] = tile.rarity;
        button.setAttribute('aria-pressed', String(tile.selected));

        // The direction's name for this colour, or the colour itself when the
        // direction has no fiction. Written into the card rather than left to
        // hue alone: four blocks of colour with no words is a memory test, and
        // it is also unplayable for anyone who cannot separate two of them.
        const name = this.#theme.terrainNames[tile.colour];
        button.setAttribute(
          'aria-label',
          tile.rarity === 'common' ? `${name} tile` : `${tile.rarity} ${name} tile`,
        );

        const art = this.#art[tile.colour];
        if (art !== undefined) {
          const img = document.createElement('img');
          img.className = 'tile-art';
          img.src = art;
          img.alt = '';
          img.draggable = false;
          button.classList.add('has-art');
          button.append(img);
        }

        const label = document.createElement('span');
        label.className = 'tile-name';
        // Name, colour AND symbol: three channels for one fact, so no single
        // one of them has to carry it. The symbol is the one that survives
        // colour blindness and a glance.
        label.textContent = `${COLOUR_MARK[tile.colour]} ${name}`;
        button.append(label);

        // Rarity is written on the card, not just hinted: MAGIC matches every
        // colour and UNIQUE counts double, and a power you might not notice is
        // a power that might as well not exist.
        if (tile.rarity !== 'common') {
          const badge = document.createElement('span');
          badge.className = 'tile-rarity';
          badge.textContent = tile.rarity.toUpperCase();
          button.append(badge);
        }

        // The card whose best placement pays the most, marked so choosing a
        // card starts from an answer instead of an audit. The selector decides
        // which one from the same previews the board draws.
        if (tile.best) {
          const badge = document.createElement('span');
          badge.className = 'tile-best';
          badge.textContent = 'BEST';
          button.append(badge);
        }

        button.addEventListener('click', () => {
          this.#dispatch({ type: 'SELECT', index });
        });
        return button;
      }),
      ...this.#renderHold(hud),
    );
  }

  /**
   * The raw run, for when something looks wrong on a device with no console
   * (`debug.overlay`). Everything here is enough to reproduce a report: the
   * seed names the world, the cursors name the exact draw, and the cell
   * count names how far it had grown when it went strange.
   */
  #debugLine(): string {
    const s = this.#state;
    return (
      `seed ${s.rootSeed} · cells ${Object.keys(s.cells).length} · ` +
      `p${s.placements} t${s.tiles} pts${s.points} luck${s.luck} · ` +
      `rng ${s.rng.tiles.cursor}/${s.rng.loot.cursor}` +
      (s.death === null ? '' : ` · ${s.death}`)
    );
  }

  /**
   * The colour's power, in one clause, with its numbers read from the live
   * tuning — same no-staleness contract as the manual. Empty string when the
   * personalities are off (the bounded game), so the tip stays honest there.
   */
  #powerOf(colour: Colour): string {
    const t = this.#state.tuning;
    switch (colour) {
      case 'green':
        return t.greenCrowdBonus > 0
          ? ` · crowds: +${t.greenCrowdBonus} worth per green neighbour past the first`
          : '';
      case 'yellow':
        return t.yellowCompanyBonus > 0
          ? ` · company: +${t.yellowCompanyBonus} worth per ${t.yellowCompanyAll ? 'differently-coloured neighbour' : 'different colour beside it'}`
          : '';
      case 'red':
        return t.redAshMatches
          ? ` · ash: stone${t.redAshWalls ? ' and walls' : ''} beside red count as matches`
          : '';
      case 'blue':
        return t.blueTideEvery > 0
          ? ` · tide: +1 worth per ${t.blueTideEvery} hexes from home`
          : '';
    }
  }

  /**
   * The colour lens: one chip per colour, printing that colour's standing
   * worth — the exact number a points harvest sums. Tapping a chip spotlights
   * the colour on the board and expands the chip into its calculation in the
   * hint line; tapping it again lets go.
   */
  #renderColours(hud: HudView): void {
    this.#el.colours.replaceChildren(
      ...hud.colours.map((c) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset['colour'] = c.colour;
        const active = hud.spotlight?.colour === c.colour;
        chip.setAttribute('aria-pressed', String(active));
        const name = this.#theme.terrainNames[c.colour];
        chip.textContent = `${COLOUR_MARK[c.colour]} ${name} ${c.worth}`;
        chip.setAttribute(
          'aria-label',
          `${name}: ${c.count} tiles standing, total worth ${c.worth}`,
        );
        chip.addEventListener('click', () => {
          this.#spotlight = this.#spotlight === c.colour ? null : c.colour;
          this.render();
        });
        return chip;
      }),
    );
  }

  /**
   * The stash, drawn as one more card at the end of the row. Tapping it swaps
   * with the selected card — take when empty, trade when full — so saving a
   * tile for later costs one tap and no reading.
   */
  #renderHold(hud: HudView): HTMLButtonElement[] {
    if (!hud.canHold) return [];

    const button = document.createElement('button');
    button.className = 'tile hold';
    button.addEventListener('click', () => {
      this.#dispatch({ type: 'HOLD' });
    });

    if (hud.held === null) {
      button.setAttribute('aria-label', 'Hold the selected tile for later');
      const label = document.createElement('span');
      label.className = 'tile-name';
      label.textContent = 'HOLD';
      button.append(label);
      return [button];
    }

    button.dataset['colour'] = hud.held.colour;
    const name = this.#theme.terrainNames[hud.held.colour];
    button.setAttribute('aria-label', `Swap the held ${name} tile back into the hand`);

    const art = this.#art[hud.held.colour];
    if (art !== undefined) {
      const img = document.createElement('img');
      img.className = 'tile-art';
      img.src = art;
      img.alt = '';
      img.draggable = false;
      button.classList.add('has-art');
      button.append(img);
    }

    const label = document.createElement('span');
    label.className = 'tile-name';
    label.textContent = name;
    button.append(label);

    if (hud.held.rarity !== 'common') {
      const badge = document.createElement('span');
      badge.className = 'tile-rarity';
      badge.textContent = hud.held.rarity.toUpperCase();
      button.append(badge);
    }

    const badge = document.createElement('span');
    badge.className = 'tile-held';
    badge.textContent = 'HELD';
    button.append(badge);
    return [button];
  }
}
