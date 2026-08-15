import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { parse, type HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { canPlaceAt, isRipe, worthOf } from '@engine/rules';
import type { Action, GameState, LandmarkReward } from '@engine/state';
import { destinationAt } from '@engine/world';
import { bakeSurface } from '@render/bake';
import type { Renderer } from '@render/Renderer';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import type { Theme } from '@theme/tokens';
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
  readonly leave: HTMLButtonElement;
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
   * `tilesShare` across `pops` harvests is Gate B's own measurement, carried
   * here so the end screen can print the gate's verdict on the player's own
   * play rather than on a memory of it.
   */
  readonly finish?: (state: GameState) => {
    readonly runs: number;
    readonly best: number;
    readonly isNewBest: boolean;
    readonly pops: number;
    readonly tilesShare: number | null;
  };
  /** Start a fresh run under the current settings. Wired to the end screen. */
  readonly newRun?: () => void;
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
   */
  readonly share?: (state: GameState) => void | Promise<void>;
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

    this.#el.helpManual.replaceChildren(
      title,
      tagline,
      ...this.#helpSections().flatMap(({ title, lines }) => {
        const heading = document.createElement('p');
        heading.className = 'help-title';
        heading.textContent = title;
        return [
          heading,
          ...lines.map((line) => {
            const p = document.createElement('p');
            p.textContent = line;
            return p;
          }),
        ];
      }),
    );
    this.#el.help.addEventListener('click', () => {
      this.#el.helpPanel.hidden = !this.#el.helpPanel.hidden;
    });
    this.#el.helpPanel.addEventListener('click', () => {
      this.#el.helpPanel.hidden = true;
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
    this.#el.leave.addEventListener('click', () => {
      this.#dispatch({ type: 'LEAVE' });
    });

    // A stranger's first minute: the manual, open, before the board is a
    // puzzle they have to guess at. Once ever — the shell remembers — and it
    // closes on the same tap as always, so it costs a returning player
    // nothing and a new one one gesture.
    if (this.#hooks.firstVisit === true) this.#el.helpPanel.hidden = false;

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

  #tap(event: PointerEvent): void {
    const rect = this.#el.board.getBoundingClientRect();
    const hex = this.#renderer.hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (hex === null) return;

    // On the plane a tap on a ripe tile is a QUESTION — "what is this pocket
    // worth?" — not a placement. The harvest buttons re-price to that pocket
    // and the board outlines it. Everywhere else a tap stays a placement.
    if (this.#state.tuning.world === 'endless' && isRipe(this.#state.cells, hex)) {
      this.#showNote(null);
      this.#harvestAt = hex;
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
          return `+  CACHE CLAIMED\n+${t.cachePays} tiles, on the spot.`;
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
          : `+ CACHE — build a tile touching it to claim ${t.cachePays} tiles on the spot.`;
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
        return `${name(cell.colour)} tile, worth ${worth}. It ripens when all six sides are covered.`;
      }
      case 'empty':
        return cell.native === undefined
          ? 'Open ground — you can build here once something of yours touches it.'
          : `Ground native to ${name(cell.native)} — a ${name(cell.native)} tile here is worth one more.`;
    }
  }

  /** Zooming out below fit is meaningless, so those two buttons say so. */
  #syncCamera(): void {
    const atFit = this.#renderer.zoomLevel() <= 1.001;
    this.#el.zoomOut.disabled = atFit;
    this.#el.zoomFit.disabled = atFit;
  }

  /**
   * The manual, in plain words, in the order a run meets each system. Every
   * number is read from the run's OWN tuning — the same object the reducer
   * pays with — so a balance change rewrites the manual by itself and the
   * text can never describe an economy that is not the one being played.
   */
  #helpSections(): { title: string; lines: string[] }[] {
    const t = this.#state.tuning;
    const endless = t.world === 'endless';

    const loop: { title: string; lines: string[] } = {
      title: 'THE LOOP',
      lines: [
        endless
          ? `One endless plane, and one expedition of ${t.runLength} placements. Place tiles, surround them to ripen them, pop ripe pockets for tiles or points, and push outward — farther pays more.`
          : 'Place tiles, surround them to ripen them, harvest for tiles or points, and move on to deeper, better-paying maps. The run ends when you run out of tiles.',
        ...(endless
          ? [
              'Tiles keep you going; points are the score. The expedition ends whether or not you spent your tiles — so tiles you never use are wasted, and a pocket you never cash is a fortune left in the ground.',
            ]
          : []),
      ],
    };

    const placing: { title: string; lines: string[] } = {
      title: 'PLACING',
      lines: [
        'Tap a card to pick it up, then tap any hex with a glowing edge. A tile must touch something already built.',
        t.costGrace > 0
          ? `Placing costs tiles: ${t.baseCost} for your first ${t.costGrace} placements, then +1 for every ${t.costRisesEvery} after that. The cost NEVER comes back down, so the back half of an expedition is the expensive half.`
          : `Placing costs tiles: ${t.baseCost} to start, +1 for every ${t.costRisesEvery} tiles you have ever placed this run. The cost NEVER resets — this is the clock that ends every run.`,
        'The faint number on an empty hex is exactly what the selected tile will be worth there. It is a promise, not an estimate.',
        'BEST marks the card whose strongest placement pays the most right now. Advice, not an order.',
      ],
    };

    const ripe: { title: string; lines: string[] } = {
      title: 'RIPE AND WORTH',
      lines: [
        'A tile touched on ALL SIX sides is ripe — ready to pop. Walls, stone and other tiles all count as touching.',
        'Worth = how many neighbours MATCH the tile (same colour). Stone and walls surround but never match. Native ground (dots in the tile’s own colour) counts as one extra match.',
        'The bright number on a ripe tile is its worth. Placing one tile can raise the worth of up to six neighbours at once — that is the whole craft.',
      ],
    };

    const harvest: { title: string; lines: string[] } = {
      title: 'HARVEST',
      lines: [
        endless
          ? 'A pocket is a connected group of ripe tiles. Tap any ripe tile to price its pocket — the board outlines it and the two buttons show what popping it pays. The biggest pocket is priced by default.'
          : 'Harvest pops EVERY ripe tile on the map at once.',
        `Take tiles: ${t.tilesPerPop} per popped tile, +1 more per ${t.worthPerExtraTile} worth. Linear and safe — this is how you keep placing.`,
        endless
          ? `Take pts: the pocket’s summed worth × its size bonus × the distance multiplier. Bigger pockets pay disproportionately more, and the multiplier rises by 1 for every ${t.distanceStep} hexes the pocket sits from home. Score lives out there.`
          : 'Take pts: summed worth × size bonus × the map number. Bigger harvests and deeper maps pay disproportionately more.',
        ...(t.harvestSizeCap > 0
          ? [
              `The size bonus stops growing past ${t.harvestSizeCap} tiles. A bigger pocket than that still pays more worth, but no more multiplier — so cashing at about ${t.harvestSizeCap} and starting another beats hoarding one monster.`,
            ]
          : []),
        ...(t.treasureNeed > 0
          ? [
              `Take a rare tile: a pocket of ${t.treasureNeed}+ can be cashed as TREASURE instead — a magic tile straight into your stash, or a unique one from ${t.treasureUnique}+. You give up both the tiles and the points to do it, which is the price of choosing a power instead of waiting for one.`,
            ]
          : []),
        `You take ONE of the ${t.treasureNeed > 0 ? 'three' : 'two'}, never more. Small pockets favour tiles; big far ones favour points. When to stop growing a pocket and cash it is the whole game.`,
        ...(t.runLength > 0
          ? [
              'Watch LEFT: tiles are only worth what you can still spend. Early, a tiles-harvest buys a lot of expedition. Late, it buys nothing — and points are all that is left to take.',
            ]
          : []),
        'Popped tiles turn to STONE. Stone still surrounds (helps ripen) but never matches (pays nothing) — every harvest makes that ground cheaper, which is the pressure to keep moving.',
        t.runLength > 0
          ? 'Wait too long and the expedition ends around your unfinished pocket. Greed costs.'
          : 'Wait too long and you can die with a fortune unpopped. Greed has a cliff.',
      ],
    };

    // The manual speaks the DIRECTION's words for the colours, because the
    // cards, the chips and the lens all do — a manual that says GREEN beside
    // a card that says MOSS is a manual for a different game.
    const name = (c: Colour): string => this.#theme.terrainNames[c];
    const colours: { title: string; lines: string[] } = {
      title: 'THE COLOURS',
      lines: [
        `${name('green')} — crowds. +${t.greenCrowdBonus} worth for every neighbour of its own colour past the first. It wants to be one big mob: commit to a single-colour pocket and it snowballs.`,
        t.yellowCompanyAll
          ? `${name('yellow')} — company. +${t.yellowCompanyBonus} worth for every differently-coloured neighbour. It scores in messy mixed ground where nothing else matches — the glue tile.`
          : `${name('yellow')} — company. +${t.yellowCompanyBonus} worth for every DIFFERENT colour touching it. It scores in messy mixed ground where nothing else matches — the glue tile.`,
        t.redAshWalls
          ? `${name('red')} — ash. Stone and walls count as matches for it. Spent land and blocked land are its soil: build it where nothing else pays.`
          : `${name('red')} — ash. Stone counts as a match for it. Your spent, popped land is its soil: build it along the wake everyone else abandons.`,
        `${name('blue')} — tide. +1 worth for every ${t.blueTideEvery} hexes from home. Worth little in the clearing, a lot on the frontier — the colour you carry outward.`,
      ],
    };

    const ground: { title: string; lines: string[] } = {
      title: 'THE GROUND',
      lines: [
        'Plain ground takes any tile. Dotted ground is a NATIVE FIELD: a tile of that colour placed there counts the ground as one extra match.',
        'Whole regions of same-coloured dots are BIOMES — one colour’s country. Chasing a colour strategy means walking to where that colour grows.',
        'Walls cannot be built on. They surround (help ripen) but never match — and a frontier that is all wall can end a run.',
        'The plane only exists where you have grown it. Every placement reveals the ground around itself.',
      ],
    };

    const destinations: { title: string; lines: string[] } = {
      title: 'DESTINATIONS',
      lines: [
        'The glows beyond your ground are destinations. They shine through undiscovered land — build your chain out and TOUCH one with a tile to claim it. Each pays once.',
        `+ is a CACHE: ${t.cachePays} tiles on the spot. Caches are how an expedition funds itself — walking to them is meant to keep you alive, so that your harvests can be about scoring instead of surviving.`,
        `★ is a SITE: ${t.sitePays} pts × the distance multiplier at its hex, and it opens a BOUNTY.`,
        ...(t.questNeed > 0
          ? [
              `A bounty asks for one thing: pop a pocket of ${t.questNeed}+ within ${t.questRadius} hexes of that site, and take it as PTS — that harvest pays ×${t.questBonus}. Take it as tiles and the bounty stays standing. One bounty at a time; the line above your hand names it, and the pts button wears a ★ when the pocket you have selected would collect it.`,
            ]
          : []),
        `◆ is a TERRITORY: claiming it turns the ground within ${t.territoryRadius} hexes into a native field of its colour — permanently yours, and it glows in the colour it will grant.`,
        '◈ is a SHRINE: reaching one switches a system on for your world, for good. They are rare, and SETTINGS lists which ones you have woken and what the next one gives.',
        'The line above your hand always names the nearest unclaimed destination and how many hexes out it sits.',
      ],
    };

    const rarity: { title: string; lines: string[] } = {
      title: 'RARE TILES AND LUCK',
      lines: [
        'Every drawn tile can roll MAGIC or UNIQUE — the card says so, and rare tiles keep an accent edge on the board.',
        'MAGIC is wild: it matches EVERY neighbouring tile, whatever the colour, and they match it back.',
        'UNIQUE is wild and heavy: every match it is part of counts DOUBLE, for both sides — ground included.',
        `Luck: every tile popped in a TILES-harvest raises your odds (shown in the line above your hand), up to a cap. Cashing big pockets as survival is what buys better draws — the two currencies feed each other.`,
      ],
    };

    const stash: { title: string; lines: string[] } = {
      title: 'THE STASH',
      lines: [
        'The dashed HOLD card keeps one tile for later. Tap it to stash your selected card; tap again to trade the stashed tile back into your hand.',
        'Held tiles survive rerolls — save a rare tile, or the right colour, for the moment it is actually worth something.',
      ],
    };

    const reading: { title: string; lines: string[] } = {
      title: 'READING THE SCREEN',
      lines: [
        endless
          ? 'TILES is what you place with. POINTS is your score. REACH is how far from home you have built. COST is what the next placement takes. LEFT is how many placements the expedition has still to give.'
          : 'TILES is your life — it is the number that ends the run. POINTS is your score. MAP is how deep you are. COST is what the next placement takes.',
        'The line above your hand reads: what to do now · the nearest destination · your current odds.',
        'Zoom with + and −, pinch works too, drag to pan, FIT shows everything. Worth numbers appear as you zoom in.',
      ],
    };

    const end: { title: string; lines: string[] } = {
      title: 'HOW IT ENDS',
      lines: [
        ...(t.runLength > 0
          ? [
              `LEFT reaches zero: the expedition is over. You may still cash anything already ripe — what the clock takes is the pockets you never finished.`,
            ]
          : []),
        'Out of tiles with nothing ripe to cash: broke. Walking to caches is how you avoid this.',
        ...(endless
          ? [
              'A frontier that is all wall with nothing left to pop: walled in. Rare, and worth avoiding on the way past.',
            ]
          : [
              'Once you have harvested on a map you may MOVE ON — deeper maps multiply points harder.',
            ]),
        'Tap anywhere to close this.',
      ],
    };

    // "What this game is", derived rather than written: the world, the
    // economy and the list of systems in play all come from the run's own
    // tuning, so this section re-describes itself after every balance or
    // flag change. The decisions behind the switches live in SETTINGS below.
    const systems: string[] = [];
    if (t.destinationEvery > 0) systems.push('destinations');
    if (t.biomeEvery > 0) systems.push('biomes');
    if (t.magicChance + t.uniqueChance > 0) systems.push('rare tiles + luck');
    if (t.greenCrowdBonus + t.yellowCompanyBonus + t.blueTideEvery > 0 || t.redAshMatches) {
      systems.push('colour personalities');
    }
    if (t.holdSlots > 0) systems.push('the stash');

    const yourWorld: { title: string; lines: string[] } = {
      title: 'YOUR WORLD',
      lines: [
        'This device has ONE world, and it remembers. Ground you have revealed stays drawn faint on later runs — a map you are filling in, expedition by expedition.',
        t.territoryTiles > 0
          ? `Territories you claim (◆) are yours for good: they greet you already claimed, with their field live, and each one starts every later run with +${t.territoryTiles} tiles (up to +${t.territoryTilesCap}). Conquest compounds; it just cannot buy past the clock.`
          : 'Territories you claim (◆) are yours for good: they greet you already claimed, with their field live, and they never pay twice.',
        'Caches and sites re-arm every run, so ground you know is still worth walking. What changes between runs is you knowing where to walk.',
        'SETTINGS shows what your world has seen, and can abandon it for a fresh one if you ever want a stranger’s plane again.',
      ],
    };

    const build: { title: string; lines: string[] } = {
      title: 'THIS BUILD',
      lines: [
        endless
          ? `World: one endless plane, grown from seed ${this.#state.rootSeed}. Same seed, same world — share the number to share the run.`
          : `World: bounded maps, seed ${this.#state.rootSeed}.`,
        `Economy: start with ${t.startingTiles} tiles · a placement costs ${t.baseCost}` +
          (t.costGrace > 0 ? ` for ${t.costGrace} placements, then` : ',') +
          ` +1 per ${t.costRisesEvery} placed` +
          (t.runLength > 0 ? ` · ${t.runLength} placements to the expedition` : '') +
          ` · ${t.draftWidth}-card draft${t.holdSlots > 0 ? ' plus the stash' : ''}.`,
        systems.length > 0
          ? `Systems in play: ${systems.join(' · ')}. Each is detailed above.`
          : 'Systems in play: none — this is the smallest game there is.',
        'SETTINGS below switches every system and carries the decision that set each default. The stamp at the bottom of the screen names the exact code this page is running.',
      ],
    };

    return endless
      ? [
          loop,
          placing,
          ripe,
          harvest,
          colours,
          ground,
          destinations,
          rarity,
          stash,
          yourWorld,
          reading,
          end,
          build,
        ]
      : [loop, placing, ripe, harvest, reading, end, build];
  }

  /**
   * Harvest what the buttons are pricing. The selector owns which pocket that
   * is (`hud.harvestAt`), so the dispatch and the price cannot disagree.
   */
  #harvest(choice: 'tiles' | 'points' | 'treasure'): void {
    const at = toHudView(this.#state, this.#harvestAt).harvestAt;
    this.#dispatch(at === null ? { type: 'HARVEST', choice } : { type: 'HARVEST', choice, at });
  }

  #dispatch(action: Action): void {
    const next = reduce(this.#state, action);
    // The engine returns the same state for anything illegal, so this is also
    // the "that did nothing" check — no need to ask permission before acting.
    if (next === this.#state) return;

    // Reaching a destination is the biggest thing that can happen in a
    // placement, and until now the only sign was a number moving somewhere
    // else on the screen. A shrine was worse than that: its whole payoff
    // lands on the NEXT run, so claiming one looked like nothing at all.
    const claimed = this.#claimNote(this.#state, next);
    this.#state = next;
    if (claimed !== null) this.#showNote(claimed);
    // Every real change is offered to the shell to keep. Saving after each
    // action rather than on some timer means the most a crash can eat is one
    // tap — a run is 10-20 minutes of a phone's attention, and phones wander.
    this.#hooks.onChange?.(next);
    this.render();
  }

  render(): void {
    this.#renderer.draw(
      toBoardView(this.#state, this.#harvestAt, this.#spotlight, this.#hooks.memory ?? []),
    );
    this.#renderHud(toHudView(this.#state, this.#harvestAt, this.#spotlight));
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
              ` · pts when popped = worth × pocket size × ${hud.showLeave ? 'map' : 'distance'}`) +
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
    this.#el.harvestTiles.textContent = `Take ${hud.harvestTiles} tiles`;
    // The bounty rides on the button that collects it, with its multiplier
    // shown — the reason to press a button belongs on the button.
    this.#el.harvestPoints.textContent = hud.questPays
      ? `Take ${hud.harvestPoints} pts ★`
      : `Take ${hud.harvestPoints} pts`;
    this.#el.harvestPoints.classList.toggle('bounty', hud.questPays);
    this.#el.harvestTiles.hidden = !hud.canHarvest;
    this.#el.harvestPoints.hidden = !hud.canHarvest;
    this.#el.harvestTiles.disabled = !hud.canHarvest;
    this.#el.harvestPoints.disabled = !hud.canHarvest;

    // The third payout appears only for a pocket big enough to earn it, and
    // says which rare tile it hands over — the whole point is choosing a
    // specific power instead of waiting for the draft to offer one.
    const treasure = hud.canHarvest ? hud.harvestTreasure : null;
    this.#el.harvestTreasure.hidden = treasure === null;
    this.#el.harvestTreasure.disabled = treasure === null;
    if (treasure !== null) {
      this.#el.harvestTreasure.textContent = `Take a ${treasure.toUpperCase()} tile`;
    }

    this.#el.leave.hidden = !hud.showLeave;
    this.#el.leave.textContent = hud.leaveHint;
    this.#el.leave.disabled = !hud.canLeave;

    this.#el.end.hidden = !hud.ended;
    if (hud.ended) this.#renderEnd(hud);
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
        // Gate B's own measurement, printed. A player who can see they take
        // tiles nine times in ten is a player who might take points.
        if (book.tilesShare !== null) {
          const tiles = Math.round(book.tilesShare * 100);
          this.#recordLines.push(
            `across ${book.runs} run${book.runs === 1 ? '' : 's'}: ` +
              `${book.pops} harvest${book.pops === 1 ? '' : 's'}, ` +
              `${tiles}% tiles / ${100 - tiles}% pts`,
          );
        }
      }
    }

    const line = (cls: string, text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      return p;
    };

    const parts: HTMLElement[] = [
      line('end-epitaph', hud.epitaph ?? ''),
      line('end-score', `${hud.points} pts`),
    ];
    if (this.#recordLines.length > 0) parts.push(line('end-best', this.#recordLines[0]!));

    const s = hud.summary;
    if (s !== null) {
      const facts: string[] = [
        `${hud.depthLabel.toLowerCase()} ${hud.depthValue}`,
        `${hud.placements} placements`,
      ];
      if (s.harvests > 0) facts.push(`${s.tilesTaken} tiles / ${s.pointsTaken} pts taken`);
      if (s.biggestHarvest > 0) {
        facts.push(
          `biggest pop ${s.biggestHarvest} pts at ${Math.round(s.biggestAt * 100)}% of the run`,
        );
      }
      if (s.claims > 0) facts.push(`${s.claims} destination${s.claims === 1 ? '' : 's'} reached`);
      if (s.quests > 0) facts.push(`${s.quests} quest${s.quests === 1 ? '' : 's'} done`);
      if (s.luck > 0) facts.push(`luck ${s.luck}`);
      parts.push(line('end-facts', facts.join(' · ')));
    }

    if (this.#recordLines.length > 1) parts.push(line('end-facts', this.#recordLines[1]!));

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
        void send(this.#state);
      });
      parts.push(share);
    }

    this.#el.end.replaceChildren(...parts);
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
      { id: 'points', label: 'POINTS', value: String(hud.points) },
      { id: 'map', label: hud.depthLabel, value: String(hud.depthValue) },
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
        label.textContent = name;
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
        chip.textContent = `${name} ${c.worth}`;
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
