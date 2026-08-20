import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { distance, key, parse, type HexKey } from '@engine/hex';
import { newRun, reduce, startingPerk } from '@engine/reduce';
import {
  cachePaysAt,
  canPlaceAt,
  costOf,
  harvestMultiplier,
  harvestValue,
  homeOf,
  isRipe,
  placementCostAt,
  reachOf,
  withinBeaconHorizon,
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
import { destinationAt, findAt } from '@engine/world';
import { bakeSurface } from '@render/bake';
import {
  PERKS,
  UPGRADES,
  buy,
  canAfford,
  equip,
  hasMet,
  levelOf,
  meet,
  priceOf,
  type Progress,
  type TeachId,
} from '@meta/progress';
import type { Renderer } from '@render/Renderer';
import type { ShareCardData } from '@render/shareCard';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import { COLOUR_MARK, type Theme } from '@theme/tokens';
import { ICON_DATA_URI, NAME, TAGLINE } from '@meta/identity';
import { rememberedNativeAt, renderContext, toBoardView, toHudView, type HudView } from './view';

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
  /**
   * True when the teaching ledger is still hiding something here
   * (`ideas/teaching.md`: the manual grows with the world). The tab's panel
   * says so in one quiet foot line, so a short manual reads as a promise
   * rather than the whole book.
   */
  readonly grows?: boolean;
};

export type Elements = {
  readonly board: HTMLElement;
  readonly stats: HTMLElement;
  readonly hint: HTMLElement;
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
  /**
   * The camera's one control: FIT ⇄ HERE (Stage 2, 2026-08-18). Four buttons
   * (+, −, FIT, and ? beside them) became two — this and `help` — because
   * pinch and drag already do continuous zoom, and a phone does not need a
   * discrete step for what a gesture already does better. The label always
   * names where a tap goes: HERE jumps in on `state.lastPlaced`, FIT goes
   * back to seeing everything.
   */
  readonly cameraToggle: HTMLButtonElement;
  readonly help: HTMLButtonElement;
  readonly helpPanel: HTMLElement;
  /** The manual's half of the panel. The settings half belongs to main.ts. */
  readonly helpManual: HTMLElement;
  /**
   * The popup over the board: what you just claimed, or what the glyph you
   * tapped does. Loud enough to be read, gone on a tap or after a few
   * seconds — the hint line was too quiet for something that just happened.
   * The ordinary tier of two (Stage 2, 2026-08-18: "feedback tiers") — a
   * receipt, for the things a run does constantly.
   */
  readonly toast: HTMLElement;
  /**
   * The other tier: held, centred, dismissed on purpose — for a find, a
   * shrine or a territory, the things that change what the NEXT run starts
   * with. A real dialog, like the manual (role, modality, Escape).
   */
  readonly eventCard: HTMLElement;
  /**
   * The leading (rarest) claim's own glyph, pulled out of `eventCardText`'s
   * words and shown large above them (2026-08-19) — the glyph and the words
   * are one object in the player's head, and a card that names a big moment
   * should look like one from across the room, not read like a receipt.
   */
  readonly eventCardGlyph: HTMLElement;
  readonly eventCardText: HTMLElement;
  readonly eventCardDismiss: HTMLButtonElement;
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
    /**
     * The standing best BEFORE this run was folded in — `undefined` where
     * the caller has none to give. `best` above is the book's number
     * AFTER folding, which equals this run's own score on a new best; the
     * arc chart wants the OLD one, to draw where it used to stand.
     */
    readonly previousBest?: number;
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
   * Send this run somewhere — the share sheet, or the clipboard. Absent means
   * the button is not drawn, which is the honest state on a browser with no
   * way to share.
   *
   * The outcome comes back because the clipboard path is invisible: a copy
   * with no acknowledgement reads as a button that does nothing, which is
   * exactly how it read until 2026-08-18. `'shared'` needs no words — the
   * share sheet was its own feedback; `'copied'` does; `'failed'` means
   * neither API worked (or the user cancelled), and the button says so.
   *
   * `card` (2026-08-19, WORKPLAN Stage 2) is the share IMAGE's own facts —
   * built by `#renderEnd` from the exact `hud` fields it just drew the
   * screen from, so a picture the shell renders from this can never say
   * something the screen did not already say. The shell decides whether a
   * picture goes out at all (Web Share `files`, a download, or neither);
   * the game only ever hands over what is true.
   */
  readonly share?: (
    state: GameState,
    card: ShareCardData,
  ) => Promise<'shared' | 'copied' | 'failed'>;
  /**
   * What the next shrine will unlock, by how many this run has already
   * claimed. The ledger belongs to the world, which lives outside the game —
   * the game only needs the words to put in the popup.
   */
  readonly unlockLabel?: (nth: number) => string | null;
  // `firstVisit` used to live here and auto-open the manual once, ever
  // (2026-08-15). Stage 2's front door (main.ts) is a stranger's greeting
  // now — BEGIN and a quiet HOW TO PLAY, shown before the first interaction
  // rather than a panel sprung open over a board nobody has seen yet — so
  // the flag's one job moved out of this class entirely. `Game.openHelp` is
  // the seam the front door calls into instead of reimplementing the dialog.
  /**
   * A hidden find was claimed at this hex: the shell grants a perk
   * (deterministically, writes progress) and returns its NAME for the toast —
   * or null when there was nothing to grant: every perk already owned, or a
   * `?seed=` replay, where somebody else's walk must not fill this device's
   * shelf. Same contract as `unlockLabel`: the grant outlives the run, so it
   * belongs to the shell, and the game only needs the words.
   */
  readonly findLabel?: (hex: HexKey) => string | null;
  /**
   * The world-scale facts the end screen's CARRIED OUT strip states beside
   * this run's own (relics banked, a perk found) — territories held and how
   * much of the map is known, both outlive any one run, so the game asks
   * the shell fresh rather than carrying a snapshot. Read on every render —
   * cheap, the same contract as `shop.read()` — so a territory claimed a
   * moment ago is never shown as unclaimed. `farthestReach` also feeds the
   * live REACH stat (2026-08-18): the world's own best, which updates as
   * THIS run passes it, not merely a fact for the end of the story.
   */
  readonly worldStats?: () => {
    readonly territories: number;
    readonly knownPct: number;
    readonly farthestReach: number;
  };
  /**
   * The exact build this page is running, short. The footer stamp that used
   * to say this at all times moved behind `debug.overlay` (Stage 2,
   * 2026-08-18: "bottom-third reclaim") — THIS BUILD in the manual states it
   * unconditionally instead, so "which build is this" stays answerable
   * without the flag.
   */
  readonly buildSha?: string;
  /**
   * True for any DETOUR — a `?seed=` replay or the daily: a run that is not
   * this device's world. Every moment that speaks about THIS world (NEW
   * GROUND, the shrine receipt, banked relics, the crossing) checks it and
   * stays quiet or speaks the detour's own honest line. The name predates
   * the daily; `Game`'s #detour getter is where the widening is spelled.
   */
  readonly replay?: boolean;
  /**
   * Shrines the PREVIOUS run woke, named for the first frame of this one —
   * "the shrine receipt" (2026-08-18). The shell knows the world before and
   * after a run ends; this is what it hands over the moment the receipt
   * would be read, which is the very next run's opening frame. Absent or
   * empty means nothing to report.
   */
  readonly shrineReceipt?: readonly string[];
  /**
   * The survey (2026-08-18): called after every action, so the shell can
   * detect and pay a newly-met world goal wherever it actually happened —
   * reach, a territory count, known%, a shrine or a perk. Relics are already
   * paid and the ledger already written by the time this returns; the game
   * only needs the words for the toast and, once, for the end screen's
   * CARRIED OUT strip. Null when nothing was newly met.
   */
  readonly checkGoals?: () => string | null;
  /**
   * The crossing (Marc, 2026-08-19): once this world is fully awake, a
   * further shrine reached OFFERS passage to a fresh world, paid in relics
   * for what is left behind. The shell owns both halves — `dowry()` prices
   * the current world live (territories change mid-run), `cross()` banks it
   * and leaves — because leaving a world outlives any run. Absent on
   * replays and dailies, which are not this device's world to leave.
   */
  readonly crossing?: {
    readonly dowry: () => number;
    readonly cross: () => void;
  };
  /**
   * The three sounded moments (`ideas/sound.md`, behind `ui.sound`): the
   * pop's rising bells, the claim's struck note, the running-dry fade.
   * Absent while the flag is off, which is the silence the game shipped
   * with — the game calls, the shell decides whether anything is listening.
   */
  readonly sound?: {
    pop(count: number): void;
    claim(kind: LandmarkReward): void;
    dry(): void;
  };
  /**
   * Present exactly when this run IS the daily: the badge the end screen
   * prints (number, best, tries — read fresh, because finish() just moved
   * them) and the retry that plays the same date again. NEW RUN reads as
   * BACK TO YOUR WORLD beside it, because that is what it does there.
   */
  readonly daily?: {
    readonly label: () => string;
    readonly retry: () => void;
  };
  /**
   * The install nudge (2026-08-20, launch polish): one quiet line on the end
   * screen — the moment a player has proven interest — saying how to put the
   * game on the home screen, in the words of THIS platform (iOS has no
   * install prompt at all; the Share sheet is the only door). The shell
   * passes it only when it applies (a browser tab, never shown before) and
   * `shown()` marks it so it never repeats.
   */
  readonly install?: {
    readonly note: string;
    readonly shown: () => void;
  };
};

/** The colour POWERS' names, for the lens line. Plain words, Marc's word. */
const POWER_NAMES: Record<Colour, string> = {
  green: 'crowds',
  yellow: 'company',
  red: 'ash',
  blue: 'tide',
};

/**
 * The teaching id each colour's first placement marks (Marc, 2026-08-19,
 * hours after the pack shipped: "the colors are not explained") — each
 * personality taught once, at the moment that colour first lands on the
 * player's own board, where the manual's always-on section and the
 * long-press lens both wait to be found rather than arriving.
 */
const COLOUR_TEACH: Record<Colour, TeachId> = {
  green: 'colourGreen',
  yellow: 'colourYellow',
  red: 'colourRed',
  blue: 'colourBlue',
};

/**
 * HERE's jump-in zoom, from FIT (always 1). Close enough to read worth
 * numbers on a phone without a second tap; a real board can still clamp
 * this lower via `zoomMax` (the ceiling rises with the board, never falls
 * below it, but a very small early board could in principle sit under this).
 */
const CAMERA_HERE_ZOOM = 2.4;

/** Movement under this many pixels is still a tap; past it, a drag. */
const TAP_SLOP = 8;

/** Label, value, and whether this is the number counting down to the end. */
type Stat = { readonly id: string; readonly label: string; readonly value: string };

/** How long a claim announcement stays up before it fades on its own. */
const NOTE_MS = 5200;

/**
 * Every `#claimNote` line leads with its glyph, then two spaces, then the
 * words — `EVENT_GLYPH` is how `#showEventCard` pulls the leading claim's
 * glyph back out to show large above the card, without `#claimNote` having
 * to know that the card even exists.
 */
const EVENT_GLYPH = /^(\S+)\s\s([\s\S]*)$/;

/** Circumradius of the hex drawn on a draft card, in CSS pixels. */
const HAND_HEX_SIZE = 24;

/**
 * The relic lesson (`ideas/teaching.md`), said from wherever the first relic
 * actually arrives: mid-run for a sacrifice or a claim's own relics, or at
 * the ended transition when the first ones only came home in the ending
 * bonus. One string, so the two doors cannot drift apart.
 */
/**
 * The last-gasp rule, one clause for its three doors (the toast, the manual,
 * the COST tap note) — the same cannot-drift contract RELIC_LESSON below and
 * `#colourLesson` keep for their own multi-door words.
 */
const LAST_GASP_RULE =
  'You may place while ANY tiles remain — the difference is forgiven at zero, and it cannot chain: only a pop can lift you back above zero.';

const RELIC_LESSON =
  '⬢  RELICS\nRelics are not points — they buy the NEXT run. They follow you out when a run ends, and THE SHOP on the end screen spends them: every run makes the next one start stronger.';

/**
 * The end screen's board portrait: bounds the longest side of the raster
 * `Renderer.snapshot` returns. Large enough to read as a picture of the run
 * rather than a smear once CSS frames it at up to 40% of a phone's viewport
 * height on a 2-3x device pixel ratio; small enough that one PNG data URL
 * held in memory for the rest of the session is not a cost worth measuring.
 */
const SNAPSHOT_MAX_PX = 480;

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
   * The colour lens: the long-pressed draft card's colour, or null. UI state
   * like the tapped pocket — the engine never learns a colour was being
   * studied. Set by a `contextmenu` on a draft card (game.ts's `#renderDraft`)
   * since Stage 2 folded the old standalone chips into the cards themselves.
   */
  #spotlight: Colour | null = null;

  /**
   * The destination signpost last shown as a TOAST, so a CHANGE — not a
   * render — is what announces it again (Stage 2, 2026-08-18: the hint line
   * cut to one clause, and the signpost moved off it). `undefined` until the
   * first render primes it, so boot (or resuming a run) never greets a
   * player with a toast about ground they already knew was near.
   */
  #lastSignpost: string | null | undefined = undefined;

  readonly #hooks: GameHooks;

  /**
   * The popup's text, and the timer that clears it. UI state: the engine
   * neither knows nor cares that anything was announced.
   */
  #noteTimer: ReturnType<typeof setTimeout> | null = null;
  /** Shrines claimed this run, so each one announces the right unlock. */
  #shrinesClaimed = 0;
  /**
   * The name of a perk THIS RUN found, if any — for the end screen's CARRIED
   * OUT strip. Set inside `#claimNote` when `findLabel` grants one; never
   * cleared mid-run, because a run finds at most a handful and the strip
   * only ever reads it once the run has ended.
   */
  #foundThisRun: string | null = null;
  /**
   * A world goal (the survey, 2026-08-18) met by an action THIS run, for the
   * end screen's CARRIED OUT strip. Set from `checkGoals`' own text; never
   * cleared, since the strip only reads it once the run has ended.
   */
  #goalMetThisRun: string | null = null;

  /**
   * NEW GROUND (2026-08-18): fires once, the first time this run's reach
   * exceeds the world's own farthest reach as of the moment this run began —
   * captured here rather than re-read live, because `worldStats` is kept
   * current by the shell's own merge and would otherwise cross the very
   * boundary this moment exists to announce (see `#dispatch`).
   */
  #startFarthestReach = 0;
  #newGroundShown = false;
  /**
   * The first-unique explainer (2026-08-18): fires once, the first time a
   * unique tile is in the hand this run — drawn or forged. Per run, not per
   * device: a fresh Game instance per run means a fresh flag.
   */
  #uniqueExplained = false;
  /**
   * Running dry, sounded once per descent (`ideas/sound.md`): armed while
   * the purse is healthy, fired the moment it first sinks near the next
   * placement's cost, re-armed only after a real recovery — hysteresis, so
   * hovering at the line is one warning, not a metronome. The margins are
   * feedback thresholds, not balance: nothing in the economy reads them.
   */
  #dryWarned = false;

  /**
   * The end screen's record lines, computed once per ended run so the book is
   * written exactly once however many times the ended state renders. Element
   * 0 is either `'NEW BEST'` or the exact number of points short of it —
   * which one decides whether the end screen shows a headline or a footnote.
   */
  #recordLines: string[] | null = null;
  /** `book.runs`, alongside `#recordLines` — RUN N on the end screen. */
  #runNumber: number | null = null;
  /**
   * The world's standing best TOTAL score, from before this run was folded
   * in — `null` where there is none yet (a first run, or no `finish` hook at
   * all, as the headless tests and the gallery run bare). The arc chart's
   * ghost baseline: no new storage, just a field the `finish` hook already
   * had the number for and had never handed across.
   */
  #recordBest: number | null = null;
  /**
   * The story, drawn (`ideas/endless-world.md`): a small portrait of the
   * board, captured once — alongside `#recordLines`, guarded by the same
   * null-check — at the ended transition. `null` on every render before the
   * run ends, and wherever the renderer itself had nothing to extract (the
   * stub in tests, or a real browser missing a piece of the canvas API). A
   * fresh `Game` instance per run (see `#uniqueExplained`'s own note) means
   * this needs no explicit clearing on NEW RUN — there is no run for it to
   * survive into.
   */
  #snapshot: string | null = null;
  /**
   * Which face of the end surface is showing: the run's picture, or the shop.
   * Split on 2026-08-18 (Marc: "split the end screen and the spend screen") —
   * one screen carrying the epitaph, the arc, six shop rows and the shelf was
   * two screens interleaved, and neither read well.
   */
  #endView: 'run' | 'shop' = 'run';

  /**
   * Which button opened the manual, so closing it returns focus to the right
   * place — the in-game ? most of the time, but the front door's quiet HOW TO
   * PLAY lives outside this class entirely (main.ts), and its own button is
   * where a keyboard or screen-reader user actually was. Set on every open;
   * defaults to the in-game button below.
   */
  #helpOpener: HTMLButtonElement;

  /**
   * The event card's optional second button (2026-08-19, for the crossing):
   * a card is dismiss-only except when the moment carries a CHOICE — then
   * this button acts and GOT IT reads as staying. Created once in `start`,
   * hidden between choices; the handler is swapped per card.
   */
  #eventAction: HTMLButtonElement | null = null;
  #eventActionRun: (() => void) | null = null;

  /**
   * The `ui.logo` slot's URL, once art has loaded and confirmed the theme
   * has one (2026-08-19, WORKPLAN Stage 1) — `null` is the state the game
   * ships in and the end screen's default DRAWN treatment (mark + name)
   * covers it completely. Set via `setLogo`, well after `start()`: art
   * loads after the first playable frame (`main.ts`'s own rule), and a run
   * ending before that fetch resolves is not a real sequence to design for,
   * but `setLogo` re-renders anyway if it somehow happened.
   */
  #logoUrl: string | null = null;

  /**
   * The `ui.runEnd` slot's URL (2026-08-19, WORKPLAN Stage 2) — same
   * contract as `#logoUrl` above, one slot later. `null` is the state the
   * game ships in and the end screen's hero block's own CSS gradient
   * covers it completely; set via `setRunEndArt` once art has loaded and
   * confirmed the theme has one.
   */
  #runEndUrl: string | null = null;

  constructor(
    renderer: Renderer,
    elements: Elements,
    seed: number,
    theme: Theme = PLACEHOLDER,
    tuning: Tuning = TUNING,
    hooks: GameHooks = {},
    claimed: readonly HexKey[] = [],
    claimedFinds: readonly HexKey[] = [],
    // Camps (2026-08-19): where this run wakes. Null — every run before
    // today, and every run not begun from the front door's camp button — is
    // the world origin, exactly as always. A resumed run ignores it: the
    // save carries its own.
    wakeAt: HexKey | null = null,
  ) {
    this.#renderer = renderer;
    this.#el = elements;
    this.#theme = theme;
    this.#hooks = hooks;
    this.#helpOpener = elements.help;
    this.#state = hooks.resume ?? newRun(seed, tuning, claimed, claimedFinds, wakeAt);
    // The world's own best as of right now — before this run's own actions
    // can move it. A resumed run may already have passed it in an earlier
    // session, which is exactly why NEW GROUND must not fire twice for the
    // same progress.
    this.#startFarthestReach = hooks.worldStats?.().farthestReach ?? 0;

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

  /**
   * Wire the `ui.logo` slot (2026-08-19, WORKPLAN Stage 1). `main.ts` calls
   * this once art has loaded and confirmed the current theme has a file
   * there — `null` never arrives, since the default is simply never calling
   * this at all. Re-renders the end screen if a run is already sitting on
   * it, on the off chance art resolved unusually late.
   */
  setLogo(url: string): void {
    this.#logoUrl = url;
    if (this.#state.phase === 'ended' && this.#endView === 'run') {
      this.#renderEnd(toHudView(this.#state, this.#harvestAt, this.#spotlight));
    }
  }

  /**
   * Wire the `ui.runEnd` slot (2026-08-19, WORKPLAN Stage 2) — same contract
   * as `setLogo`, one slot later: `main.ts` calls this once art has loaded
   * and confirmed the current theme has a file there. Supersedes the hero
   * block's CSS gradient as its backdrop; never the numbers painted on it.
   */
  setRunEndArt(url: string): void {
    this.#runEndUrl = url;
    if (this.#state.phase === 'ended' && this.#endView === 'run') {
      this.#renderEnd(toHudView(this.#state, this.#harvestAt, this.#spotlight));
    }
  }

  /**
   * Wire the hand's cards to the terrain art (2026-08-20, the pipeline's
   * fresh-eyes review). The constructor bakes each card's hex procedurally —
   * the only option when no PNG exists, and the floor this falls back to —
   * but the BOARD prefers the baked PNG at a terrain slot the moment one
   * loads, and the card's whole reason to carry art is to show the tile the
   * board draws (`STATUS.md`'s own bullet). Without this, Stage 3's PNGs
   * split the two: richer ground on the board, the plainer procedural bake
   * still on the card. `main.ts` calls this off the same manifest fetch
   * `ui.logo` and `ui.runEnd` already ride.
   */
  setCardArt(art: Partial<Record<Colour, string>>): void {
    Object.assign(this.#art, art);
    this.#renderDraft(toHudView(this.#state, this.#harvestAt, this.#spotlight));
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
    // cameraToggle's own aria-label changes with what it does (HERE vs FIT)
    // and is kept current by `#syncCamera`, called at the end of `start`.

    // The two places words appear on their own: the popup and the hint line.
    // aria-live, stated here for the same reason as the labels above — so a
    // screen reader hears a claim or a warning without focus ever moving.
    this.#el.toast.setAttribute('aria-live', 'polite');
    this.#el.hint.setAttribute('aria-live', 'polite');

    // FIT ⇄ HERE: two states, not four buttons. At FIT (zoom 1), a tap jumps
    // in on `state.lastPlaced` — the last thing you built, and still the
    // warmest point of the light even now that the pool is the whole
    // structure's, not just this one hex (2026-08-18/19: see `view.ts`).
    // Past FIT, a tap goes back to seeing everything. Pinch and drag still
    // do continuous zoom and pan; this is the one DISCRETE decision left on
    // screen, and it is a toggle rather than a step.
    this.#el.cameraToggle.addEventListener('click', () => {
      if (this.#renderer.zoomLevel() <= 1.001) {
        this.#renderer.zoomBy(CAMERA_HERE_ZOOM);
        this.#renderer.centerOn(this.#state.lastPlaced ?? key(0, 0));
      } else {
        this.#renderer.resetCamera();
      }
      this.#syncCamera();
    });

    // The help panel is the manual: every system in play, in the order a run
    // meets them, with its numbers read from the LIVE tuning so the text can
    // never disagree with the economy it describes. It closes on any tap
    // because the only thing to do with it is stop reading it.
    this.#paintManual();

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
      if (this.#el.helpPanel.hidden) this.openHelp(this.#el.help);
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

    // The event card: the same close-on-any-tap contract as the manual — a
    // click anywhere inside it, including its own GOT IT button (bubbling,
    // unstopped), dismisses it. Escape does the same, the keyboard path a
    // tap never offered.
    this.#el.eventCard.addEventListener('click', () => {
      this.#closeEventCard();
    });
    // The optional ACT button (the crossing): runs its moment's handler,
    // then the same bubbling click closes the card — no second dismiss path.
    const act = document.createElement('button');
    act.type = 'button';
    act.id = 'event-card-action';
    act.hidden = true;
    act.addEventListener('click', () => {
      this.#eventActionRun?.();
    });
    this.#el.eventCardDismiss.insertAdjacentElement('beforebegin', act);
    this.#eventAction = act;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.#el.eventCard.hidden) this.#closeEventCard();
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
      // The fold's own first-contact card (Marc, 2026-08-20: "when the
      // first time we expand the luck toggle explain all and that you can
      // lose it all too"): the rows print their PRICES, so the card
      // carries the two facts a price cannot — what each row IS, and that
      // a purse you die on is mostly lost. Once, at the first deliberate
      // opening, which is exactly when someone is asking what this is.
      if (!open && !this.#met('purse')) {
        this.#markMet('purse');
        this.#showEventCard(this.#purseLesson());
      }
      this.render();
    });

    this.#el.spends.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest('button');
      const on = button?.dataset['spend'];
      if (on === undefined) return;
      const colour = button?.dataset['colour'] as Colour | undefined;
      this.#spend(on as Spend, colour);
    });

    // A stranger's first minute used to be greeted by springing this very
    // panel open over a board nobody had seen yet. Stage 2's front door
    // (main.ts, outside this class) is the greeting now — BEGIN and a quiet
    // HOW TO PLAY, before the first interaction rather than after it — so
    // there is nothing left for this class to auto-open.

    this.#syncCamera();
    this.render();
  }

  /**
   * The start-of-run toast (2026-08-18): a fresh run only, never a resumed
   * one — a resume is the same run reloading, not a new expedition, and it
   * has already had its opening frame. Two moments share the one slot,
   * joined when both fire: the shrine receipt (what the PREVIOUS run woke,
   * named once on the very next run's first frame) and the territory
   * why-line (`startingPerk`, already in the manual — surfaced here too
   * when it actually changed the starting purse).
   *
   * PUBLIC, and separate from `start()` since the fresh-eyes review
   * (2026-08-19, finding 9): fired at boot, the toast played its 5.2 seconds
   * to the back of the front door and the receipt — read-and-cleared by the
   * shell — was gone forever. The shell calls this when BEGIN actually
   * lifts the door, which is when someone is looking.
   */
  announceArrival(): void {
    if (this.#hooks.resume !== null && this.#hooks.resume !== undefined) return;
    const parts: string[] = [];
    const receipt = this.#hooks.shrineReceipt ?? [];
    if (receipt.length > 0) {
      parts.push(`Awake since your last run: ${receipt.join(', ')}.`);
    }
    const perk = startingPerk(this.#state.tuning, this.#state.claimed.length);
    if (perk > 0) parts.push(`+${perk} tiles from territories held.`);
    if (parts.length > 0) this.#showNote(parts.join(' '));

    // The very first lesson (2026-08-20): a genuinely virgin device — an
    // EMPTY teaching ledger, which is a fresh install or RESET TEACHING, and
    // never a veteran whose ledger merely predates the `place` id — is told
    // how to play at the one moment nothing else is speaking. A shared link
    // or the daily can BE first contact, so a detour teaches this too.
    const met = this.#metSet();
    if (met !== null && met.size === 0 && this.#state.placements === 0) {
      this.#markMet('place');
      this.#showEventCard(
        '⬢  THE EXPEDITION\nTap a card in your hand, then tap a glowing hex to place it — tapping the card again puts it down. Tiles are the purse and the clock: when they run out, the run ends. Ripen tiles by surrounding them, then POP.',
      );
    }
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

    // Only the canvas is a gesture surface. The camera buttons LIVE INSIDE
    // the board element, and a press on them bubbles here — capturing that
    // pointer steals the button's click entirely (how every board-mounted
    // button died on desktop). Anything that is not the bare board or its
    // canvas is somebody else's press.
    const isBoardSurface = (target: EventTarget | null): boolean => {
      // While the manual OR an event card is up, the board is behind a
      // curtain and must not take a single gesture — not a tap, not a drag,
      // not a wheel. Both panels are `position: fixed` and cover the
      // viewport (2026-08-18), not merely `#board`'s box, but the explicit
      // check stays: dismissing one on the SAME gesture that follows must
      // not also place a tile.
      if (!this.#el.helpPanel.hidden || !this.#el.eventCard.hidden) return false;
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
   * working when a tuning empties the tab bar) and back to WHICHEVER button
   * asked when it closes, however it closes — tap, Escape, or the same
   * button again.
   *
   * `openHelp` is public — the front door (main.ts) lives outside this
   * class entirely, and its quiet HOW TO PLAY opens this exact dialog rather
   * than a second one built to match it by hand. Passing the opener is how
   * focus finds its way back to a button this class never mounted itself.
   */
  openHelp(opener: HTMLButtonElement = this.#el.help): void {
    // Repainted on every open, not just at start: the manual GROWS with the
    // ledger now (`ideas/teaching.md`), and a cache claimed a moment ago has
    // to be in here the moment you go and look — the same freshness contract
    // main.ts already keeps for the settings half of this panel.
    this.#paintManual();
    this.#helpOpener = opener;
    this.#el.helpPanel.hidden = false;
    this.#el.helpPanel.focus();
  }

  /** The manual's half of the panel, rebuilt from the live tuning and ledger. */
  #paintManual(): void {
    const title = document.createElement('p');
    title.id = 'help-name';
    title.textContent = NAME;
    const tagline = document.createElement('p');
    tagline.className = 'flag-note';
    tagline.textContent = TAGLINE;
    this.#el.helpManual.replaceChildren(title, tagline, ...this.#buildManual());
  }

  #closeHelp(): void {
    if (this.#el.helpPanel.hidden) return;
    this.#el.helpPanel.hidden = true;
    this.#helpOpener.focus();
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
    if (!canPlaceAt(this.#state.cells, hex, this.#state.tuning)) {
      // The fog lens (Marc, 2026-08-20: "on clicking a tile in the fog
      // that we know the biome it highlights the whole known biome"):
      // tapping remembered ground with a known native colour turns the
      // colour lens — the same one the cards long-press — on that colour,
      // and the lens reaches into memory now, so every known patch of it
      // reads as one shape through the fog. The same tap lets go.
      if (this.#state.cells[hex] === undefined && (this.#hooks.memory?.includes(hex) ?? false)) {
        const known = rememberedNativeAt(this.#state, hex);
        if (known !== null) {
          this.#spotlight = this.#spotlight === known ? null : known;
          const ground = this.#theme.terrainNames[known];
          this.#showNote(
            this.#spotlight === null
              ? `${ground} ground, remembered. The lens is off.`
              : `Remembered ${ground} ground — every known patch of it is lit. Tap it again to let go.`,
            true,
          );
          this.render();
          return;
        }
      }
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
    const home = homeOf(this.#state);
    const worth = value.keys.reduce((n, k) => n + worthOf(this.#state.cells, k, t, home), 0);
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
      `POP for tiles: +${value.tiles}.`,
      `POP for pts: ${value.points} = worth ${worth} × pocket ${Math.min(value.count, t.harvestSizeCap > 0 ? t.harvestSizeCap : value.count)} × distance ${multiplier}${value.questPays ? ` × bounty ${t.questBonus}` : ''}.`,
    ];
    // The pocket bar (2026-08-18): the priced pocket's count against the size
    // bonus's cap — "POCKET 14/20" — once it is within reach of mattering.
    // Always showing "1/20" is noise nobody reads twice; 2+ is the point a
    // pocket has started becoming a decision rather than a single tile.
    if (t.harvestSizeCap > 0 && value.count >= 2) {
      lines.push(`POCKET ${value.count}/${t.harvestSizeCap}`);
    }
    if (value.treasure !== null)
      lines.push(`POP for treasure: a ${value.treasure.toUpperCase()} tile.`);
    if (value.questPays)
      lines.push('★ This pocket collects the bounty — but only if you POP for PTS.');
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
    const homeBefore = homeOf(before);
    const worth = value.keys.reduce((n, k) => n + worthOf(before.cells, k, t, homeBefore), 0);
    const multiplier = harvestMultiplier(before, value.keys);
    const head = `POPPED ${value.count} — total worth ${worth}`;

    if (choice === 'tiles') {
      // The true gain, matching `reduce.ts`'s own arithmetic exactly (flat
      // per pop plus a little per tile, then rounded and capped) — the old
      // line here printed the pocket's tile count, which is a different
      // number that only coincidentally looked plausible.
      const perPop =
        t.luckPerPop > 0 || t.luckPerTile !== 1
          ? t.luckPerPop + value.count * t.luckPerTile
          : value.count;
      const gained = Math.min(t.luckCap, Math.round(before.luck + perPop)) - before.luck;
      // The odds claim is only true when luck actually moves the draft's
      // rare-tile chances — in the shipped economy it does not, and saying
      // so anyway was the other half of this line lying.
      const odds =
        t.luckMagicPerPop + t.luckUniquePerPop > 0 ? ' Your rare-tile odds just rose.' : '';
      const luck = `\nLuck +${gained}.${odds}`;
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
   * What a placement just claimed, if anything, and whether it is worth an
   * EVENT CARD rather than the ordinary one-line toast (Stage 2, 2026-08-18:
   * "feedback tiers"). A find, a shrine and a territory change what the
   * NEXT run starts with — held, centred, dismissed on purpose; a cache or a
   * site stays a receipt. `eventWorthy` is the leading (rarest) claim's
   * call — a placement that claims a cache AND a territory at once is a
   * territory moment first, and reads as one.
   *
   * One placement can touch more than one unclaimed landmark at once (a
   * cache and a find sharing a frontier, say) — the old version of this
   * method returned on the FIRST claim it saw, which silently ate every
   * find-grant or shrine-unlock that happened to sit beside something else
   * that placement also reached. Every claim now runs its full side effect
   * (a find's grant, a shrine's counter) and gets a line in the note; the
   * rarest claim leads, the rest follow after a blank line.
   */
  #claimNote(
    before: GameState,
    after: GameState,
  ): {
    text: string;
    eventWorthy: boolean;
    action?: { readonly label: string; readonly run: () => void };
  } | null {
    const t = after.tuning;
    const RANK: Record<LandmarkReward, number> = {
      find: 0,
      shrine: 1,
      territory: 2,
      site: 3,
      cache: 4,
    };
    const notes: { rank: number; text: string }[] = [];
    // Teaching (`ideas/teaching.md`): a claim IS its own first-contact card —
    // the note below already says what each kind is — so a first claim only
    // marks the ledger, except a first SITE, which upgrades itself to the
    // held card: the bounty changes how the next few pops are played, and a
    // timed toast is too quiet for a rule change.
    let firstSite = false;
    // The crossing's CROSS button, when a fully-awake shrine offered one.
    let action: { readonly label: string; readonly run: () => void } | undefined;

    for (const [k, cell] of Object.entries(after.cells)) {
      if (cell.kind !== 'landmark' || !cell.claimed) continue;
      const was = before.cells[k];
      if (was?.kind === 'landmark' && was.claimed) continue;

      // Every announcement leads with the GLYPH it happened to, because the
      // thing that pays and the words about it have to be the same object in
      // the player's head — "a star gave me that" rather than "some text
      // appeared".
      this.#hooks.sound?.claim(cell.reward);
      switch (cell.reward) {
        case 'cache':
          this.#markMet('cache');
          notes.push({
            rank: RANK.cache,
            text: `+  CACHE CLAIMED\n+${cachePaysAt(k, t)} tiles, on the spot.`,
          });
          break;
        case 'site':
          if (!this.#met('site')) {
            firstSite = true;
            this.#markMet('site');
          }
          notes.push({
            rank: RANK.site,
            text:
              `★  SITE CLAIMED\nPoints banked — and this star has set a BOUNTY: ` +
              `pop a pocket of ${t.questNeed}+ within ${t.questRadius} hexes of it as PTS for ×${t.questBonus}.`,
          });
          break;
        case 'territory': {
          this.#markMet('territory');
          const owns =
            cell.colour === undefined ? 'its colour' : this.#theme.terrainNames[cell.colour];
          notes.push({
            rank: RANK.territory,
            text: `◆  TERRITORY CLAIMED\nGround within ${t.territoryRadius} hexes is native to ${owns} now — and it stays yours between runs.`,
          });
          break;
        }
        case 'shrine': {
          this.#markMet('shrine');
          const label = this.#hooks.unlockLabel?.(this.#shrinesClaimed) ?? null;
          this.#shrinesClaimed++;
          // The crossing (Marc, 2026-08-19): a shrine past the ledger's end
          // used to say "fully awake" and give nothing — a dead reward. It
          // is the way onward now: cross to a fresh world carrying relics
          // for what this one holds, or stay and keep building it.
          // A detour has no ledger to narrate (fresh-eyes finding 5): say
          // what shrines ARE, never what the HOME world would have unlocked.
          if (this.#detour) {
            notes.push({
              rank: RANK.shrine,
              text: '◈  SHRINE WOKEN\nOn your own world a shrine switches a system on, for good. A shared run keeps nothing — but it still counts the claim.',
            });
            break;
          }
          const crossing = this.#hooks.crossing;
          if (label === null && crossing !== undefined) {
            const dowry = crossing.dowry();
            action = { label: `CROSS — carry ${dowry} relics`, run: crossing.cross };
            notes.push({
              rank: RANK.shrine,
              text:
                '◈  THE WORLD IS AWAKE\nEvery unlock is yours — and this shrine is a way onward. ' +
                `Cross to a NEW WORLD and carry ${dowry} relics out for what you leave: the ground and the territories stay behind; your shop and your perks travel. ` +
                'This run ends at the crossing. Or stay, and keep building this world.',
            });
            break;
          }
          notes.push({
            rank: RANK.shrine,
            text:
              label === null
                ? '◈  SHRINE WOKEN\nThis world is fully awake — every unlock is yours.'
                : `◈  SHRINE WOKEN\n${label}\nYours from your next run on, in this world for good.`,
          });
          break;
        }
        case 'find': {
          // The shell does the granting and hands back the perk's name — or
          // null, which is both "you carry everything already" and "this is
          // somebody else's replay". One honest sentence covers both: a find
          // only grants what you do not own, on your own world.
          const label = this.#hooks.findLabel?.(k) ?? null;
          if (label !== null) this.#foundThisRun = label;
          // The 2026-08-19 debrief's one defect: the old card said "Equip it
          // in THE SHOP" even when the grant had ALREADY auto-equipped
          // itself, and never said what the perk DOES — Marc found one and
          // had nowhere to learn either fact. The card now carries the
          // perk's own sentence, and tells the truth about whether it is
          // worn: WHAT YOU CARRY in the ? panel keeps the words mid-run;
          // THE SHOP on the end screen is where it changes.
          const perk = label === null ? undefined : PERKS.find((p) => p.name === label);
          const worn =
            perk !== undefined && (this.#hooks.shop?.read().equipped.includes(perk.id) ?? false);
          notes.push({
            rank: RANK.find,
            text:
              label === null
                ? '✦  A HIDDEN FIND\nNothing new inside — a find grants only what you do not already carry, and only on your own world.'
                : `✦  FOUND — ${label}\n` +
                  (perk === undefined ? '' : `${perk.note}\n`) +
                  (worn
                    ? 'Already worn — it works from here on. WHAT YOU CARRY, in the ? panel, keeps the words; THE SHOP, on the end screen, is where it changes.'
                    : 'Yours for good, on every world. WEAR it in THE SHOP, on the end screen.'),
          });
          break;
        }
      }
    }

    if (notes.length === 0) return null;
    notes.sort((a, b) => a.rank - b.rank);
    return {
      text: notes.map((n) => n.text).join('\n\n'),
      eventWorthy: notes[0]!.rank <= RANK.territory || firstSite,
      ...(action === undefined ? {} : { action }),
    };
  }

  /**
   * What that hex is, in one sentence, in the direction's own words and this
   * run's own numbers. Covers the things a player can tap and not understand:
   * the five destination glyphs (reached or still glowing in the dark), wall,
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
        // A detour has no ledger to narrate (fresh-eyes finding 5): say what
        // shrines ARE, not what the home world would have unlocked.
        if (this.#detour) {
          return claimed
            ? '◈ SHRINE — woken. On your own world, this switches a system on for good.'
            : '◈ SHRINE — touch it with a tile. On your own world, waking one switches a system on for good.';
        }
        const next = this.#hooks.unlockLabel?.(this.#shrinesClaimed) ?? null;
        if (claimed) return '◈ SHRINE — woken. It switched a system on for this world.';
        // Fully awake with the crossing available: the shrine's remaining
        // gift is the way onward, and its tap explanation says so.
        if (next === null && this.#hooks.crossing !== undefined) {
          return `◈ SHRINE — this world is fully awake, so reaching it offers the crossing: a NEW WORLD, with ${this.#hooks.crossing.dowry()} relics carried for what you leave.`;
        }
        return `◈ SHRINE — claim it to unlock ${next ?? 'a system'} for this world, permanently.`;
      }
      if (reward === 'find') {
        // Mysterious but honest: what a find gives is the one thing the
        // board never says out loud.
        return claimed
          ? '✦ A hidden find — spent. It gave what it had.'
          : '✦ Something is here. Touch it with a tile.';
      }
      const owns = colour === null ? 'a colour' : name(colour);
      return claimed
        ? `◆ TERRITORY — yours. The ground within ${t.territoryRadius} hexes is native to ${owns}.`
        : `◆ TERRITORY — claim it and the ground within ${t.territoryRadius} hexes becomes native to ${owns}, for good.`;
    };

    if (cell === undefined) {
      // Not on the board: a destination glowing through the dark, a find's
      // shimmer, or ground this world remembers from an earlier run.
      const { q, r } = parse(hex);
      const remembered = this.#hooks.memory?.includes(hex) ?? false;
      const dest = destinationAt(this.#state.rootSeed, q, r, t);
      if (dest !== null) {
        // Named only where the world has actually SHOWN it (Marc,
        // 2026-08-19: memory shows what it saw): ground this world
        // remembers, or a beacon inside the live horizon — via the ONE
        // predicate `beaconsFor` draws by, because the simplify pass caught
        // this copy already drifted (it still measured from the origin, so
        // a camp run's tap answers disagreed with its own drawn beacons).
        if (remembered || withinBeaconHorizon(this.#state, hex)) {
          const claimed = this.#state.claimed.includes(hex);
          return claimed
            ? destination(dest.reward, dest.colour, true)
            : `${destination(dest.reward, dest.colour, false)} Build your chain out to it.`;
        }
      }
      // Only a hex the shimmer is actually drawing gets this answer — with
      // no sense, or out of range, a hidden find stays exactly that, and
      // tap-scanning remembered ground must not become a divining rod.
      if (t.findSense > 0 && findAt(this.#state.rootSeed, q, r, t) !== null) {
        const near = Object.keys(this.#state.cells).some(
          (k) => distance(parse(k), { q, r }) <= t.findSense,
        );
        if (near) return 'Something shimmers here. Grow your ground to it.';
      }
      return remembered
        ? 'Remembered from an earlier run — this run has not grown here yet.'
        : 'Dark ground — nothing any run has seen yet. Grow toward it.';
    }

    switch (cell.kind) {
      case 'landmark':
        return destination(cell.reward, cell.colour ?? null, cell.claimed);
      case 'wall': {
        // WALLBREAKER rewrites this sentence while it is worn — a rule the
        // perk breaks must not go on being stated as a rule.
        const standing =
          t.wallBuildCostMult > 0
            ? `Wall — you can build on it, at ${t.wallBuildCostMult}× the placement cost.`
            : 'Wall — cannot be built on.';
        return t.redAshWalls
          ? `${standing} It surrounds (so it helps things ripen) but never matches, except for ${name('red')}, which counts it as one.`
          : `${standing} It surrounds (so it helps things ripen) but never matches.`;
      }
      case 'stone':
        return `Spent ground — a popped tile. It surrounds but never matches, except for ${name('red')}, which feeds on it.`;
      case 'tile': {
        const worth = worthOf(this.#state.cells, hex, t, homeOf(this.#state));
        const power = this.#rarityLine(cell.rarity);
        // The colour's personality rides along (2026-08-19, "the colors are
        // not explained") — a tapped tile is the cheapest place to learn
        // what its colour wants, right where it is wanting it.
        const personality = this.#colourLesson(cell.colour);
        return (
          `${name(cell.colour)} tile, worth ${worth}. It ripens when all six sides are covered.` +
          (personality === null ? '' : `\n${personality}`) +
          (power === null ? '' : `\n${power}`)
        );
      }
      case 'empty':
        return cell.native === undefined
          ? 'Open ground — you can build here once something of yours touches it.'
          : `Ground native to ${name(cell.native)} — a ${name(cell.native)} tile here is worth one more.`;
    }
  }

  /**
   * The toggle's label always names where a tap goes, not where the camera
   * IS — the same convention the old FIT button kept. At fit, that is HERE;
   * past it, FIT. Never disabled: unlike the old +/− pair, both states are
   * always a legal thing to ask for.
   */
  #syncCamera(): void {
    const atFit = this.#renderer.zoomLevel() <= 1.001;
    this.#el.cameraToggle.textContent = atFit ? 'HERE' : 'FIT';
    this.#el.cameraToggle.setAttribute(
      'aria-label',
      atFit ? 'Zoom in on your last placement' : 'Show everything',
    );
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
      // One quiet line where the ledger is still hiding something — never a
      // per-section placeholder, never a count (`ideas/teaching.md`).
      if (tab.grows === true) {
        const foot = document.createElement('p');
        foot.className = 'flag-note';
        foot.textContent = 'More appears here as you meet it.';
        panel.append(foot);
      }
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

    // The manual grows with the world (`ideas/teaching.md`, 2026-08-19):
    // sections and lines about a concept this device has not MET stay out,
    // and each first-contact card carries the words the manual will grow, so
    // the two can never disagree. No ledger (no shop hook — the gallery, a
    // bare test) shows everything, the same degradation the drip itself keeps.
    const met = this.#metSet();
    const show = (id: TeachId): boolean => met === null || met.has(id);
    const grew = (...ids: TeachId[]): boolean => met !== null && ids.some((id) => !met.has(id));

    // WHAT YOU CARRY reads the worn perk off the shelf, never off tuning —
    // and stays out of a `?seed=` replay, which plays the plain economy and
    // must not claim a perk is working when it is not.
    const wornPerk = this.#detour
      ? undefined
      : PERKS.find((p) => this.#hooks.shop?.read().equipped.includes(p.id) ?? false);

    // The quick start (Marc, 2026-08-18: "here is what you see, here is what
    // you do, here is how you make points — then the advanced sections", and
    // later the same day: "explain the whys and how the full game vs seed
    // works in START"). Short sections, no NUMBERS fold: the one tab a
    // stranger reads before their first placement. Everything mechanical it
    // says is said again, properly, in the tabs after it.
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
          title: 'WHY',
          lines: [
            'The goal is DEPTH. The same pocket scores far more the farther from home you pop it — your score is how deep you dared to build.',
            'Runs end. That is normal: what you carry out buys permanent upgrades, so every run makes the next one start stronger.',
            'Your world remembers — ground stays revealed, territories stay yours. You are not playing a run; you are playing the climb.',
          ],
        },
        {
          title: 'YOUR WORLD VS A SHARED RUN',
          lines: [
            'The plain link opens YOUR world: one per device, remembered between runs, played with everything you have bought and found.',
            'A link with a seed in it is somebody else’s run — the same world, but no shop upgrades and no perk, and nothing you do there is kept.',
            'SHARE on the end screen makes such a link from your own run, so “beat my run” is always a fair fight.',
          ],
        },
      ],
    };

    const colourPowers =
      t.greenCrowdBonus + t.yellowCompanyBonus + t.blueTideEvery > 0 || t.redAshMatches;

    // Reordered 2026-08-18 (Marc: "less sections, more info per words read"):
    // six tabs and nineteen sections became four and thirteen. Nothing was
    // deleted — sections that said one thing each were merged into sections
    // that say one SUBJECT each, and the arithmetic stayed in its folds.
    // The NUMBERS folds were pruned on Marc's 2026-08-19 ruling ("only the
    // relevant real ones that matter and are numbers, otherwise prose"): a
    // fold keeps only numbers that price a DECISION and have no on-screen
    // referent — the cost curve, the depth step, the between-runs numbers,
    // the spend prices a phone cannot hover for. Everything a button, a
    // receipt or a tapped symbol already prices lives THERE, not here.
    const play: HelpTab = {
      id: 'play',
      label: 'PLAY',
      grows: grew('field', 'wall', 'cache', 'site', 'territory', 'shrine'),
      sections: [
        {
          title: 'PLACE AND RIPEN',
          lines: [
            'Tap a card, then tap a hex with a glowing edge. A tile must touch something already built, and the faint number is exactly what it will be worth there — a promise, not an estimate.',
            'Surrounded on all six sides, a tile RIPENS and shows its WORTH: how many neighbours match it. Stone, walls and the map’s edge all surround; none of them match.',
            t.singlePayout
              ? 'Tiles are the only thing keeping you alive, and every placement spends them — so what you decide is WHERE and WHEN, never which button.'
              : 'Tiles keep you going; points are the score. You POP for one or the other, never both.',
          ],
          detail: [
            t.costGrace > 0
              ? `A placement costs ${t.baseCost} tiles for the first ${t.costGrace}, then +1 for every ${t.costRisesEvery} after. It never comes back down — that is the clock that ends every run.`
              : `A placement costs ${t.baseCost} tiles, +1 for every ${t.costRisesEvery} you have ever placed this run. It never comes back down — that is the clock that ends every run.`,
            LAST_GASP_RULE,
          ],
        },
        {
          title: 'POP',
          lines: [
            'Tap any ripe tile to price its pocket — the board outlines it and the buttons show what it pays. The biggest pocket is priced by default.',
            'Popped tiles turn to STONE: still surrounds, never matches. Every pop makes that ground poorer, which is the pressure to keep moving.',
            // The timing decision, stated as its two sides (Marc, 2026-08-20:
            // "explain why to pop now or why to wait to pop too") — the
            // now-side only where the luck and steering dials are live.
            ...(t.luckPerPop > 0 && t.colourBiasDraws > 0
              ? [
                  'Why pop NOW: luck and steering. Luck arrives mostly per pop — many small pops out-earn one monster — and every pop tilts your next draws toward its own colour, so cashing a colour is how you draw more of it.',
                ]
              : []),
            'Why WAIT: tiles and score. Every tile added to a pocket raises its neighbours’ worth, so a big pop pays more than the same tiles popped piecemeal.',
            t.runLength > 0
              ? 'Wait too long and the expedition ends around your unfinished pocket.'
              : 'But wait too long and you can die broke with a fortune still in the ground.',
          ],
          detail: [
            // What a pop PAYS is printed on the buttons and said again by the
            // receipt every pop leaves — the fold keeps only the numbers a
            // player steers a run by, not the arithmetic the game already
            // shows at the moment it happens.
            `It scores the pocket’s summed worth × its size bonus × the distance multiplier, which rises by 1 every ${t.distanceStep} hexes from home.`,
            ...(t.harvestSizeCap > 0
              ? [
                  `The size bonus stops growing past ${t.harvestSizeCap} tiles — a bigger pocket pays more worth but no more multiplier.`,
                ]
              : []),
            ...(t.treasureNeed > 0
              ? [
                  `A pocket of ${t.treasureNeed}+ can be POPPED as TREASURE instead: a magic tile into your stash, or a unique one from ${t.treasureUnique}+. You give up the tiles and the score to choose a power instead of waiting for one.`,
                ]
              : []),
          ],
        },
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
          title: 'THE WORLD',
          // Each destination kind earns its line when it is first CLAIMED —
          // its claim note carries the same fact at the moment it happens —
          // and the hidden-find tease stays always: the mystery is the design.
          // Site pay, bounty numbers and the territory radius left the fold
          // for the places that already price them where they sit: the claim
          // notes, and a tap on the symbol itself.
          lines: [
            'The plane only exists where you have grown it — every placement reveals the ground around itself.',
            ...(show('field')
              ? [
                  'Textured ground is a NATIVE FIELD — a tile of that colour placed there gains a match. Whole regions of one colour are BIOMES: chasing a colour means walking to where it grows.',
                ]
              : []),
            ...(show('wall')
              ? [
                  t.wallBuildCostMult > 0
                    ? 'Walls surround but never match — and your perk lets you build ON them, at a price.'
                    : 'Walls cannot be built on. They surround but never match, and a frontier that is all wall can end a run.',
                ]
              : []),
            'The glows beyond your ground are destinations, shining through land you have not reached. Touch one with a tile to claim it; each pays once.',
            ...(t.destinationRampBlocks > 0
              ? [
                  'The near world is deliberately sparse. The deeper you push, the thicker the lights — and the richer the caches.',
                ]
              : []),
            ...(show('cache')
              ? [
                  t.cachePaysPerRing > 0
                    ? `+ CACHE — ${t.cachePays} tiles on the spot, +${t.cachePaysPerRing} more per ring out. Caches and sites re-arm every run, so ground you know stays worth walking.`
                    : `+ CACHE — ${t.cachePays} tiles on the spot. Caches and sites re-arm every run, so ground you know stays worth walking.`,
                ]
              : []),
            ...(show('site') ? ['★ SITE — points, and it opens a bounty.'] : []),
            ...(show('territory')
              ? ['◆ TERRITORY — the ground around it becomes your field, for good.']
              : []),
            ...(show('shrine')
              ? ['◈ SHRINE — a system switched on for your world, permanently.']
              : []),
            ...(t.findEvery > 0 && t.findChance > 0
              ? [
                  'And something else is hidden out there, deep and unmarked. It never glows. You stumble onto it, or you never know it was there.',
                ]
              : []),
          ],
          ...(t.findSense > 0
            ? {
                detail: [
                  `Your nose is keen: hidden things shimmer faintly when your ground grows within ${t.findSense} hexes of them.`,
                ],
              }
            : {}),
        },
        {
          title: 'THE SCREEN',
          // The fold dissolved (2026-08-19): nothing here was a number to
          // steer by — the score-off-screen line matters to everyone and
          // moved up; the hint-line anatomy described chrome that already
          // explains itself. The stat line names LUCK only once luck exists.
          lines: [
            t.hidePoints
              ? [
                  'TILES keeps you alive',
                  ...(show('luck') ? ['LUCK is what pops pay and the shop spends'] : []),
                  'REACH is how far you have built',
                  'COST is the next placement.',
                ].join(' · ')
              : 'TILES keeps you alive · POINTS is your score · REACH is how far you have built · COST is the next placement.',
            'Zoom with + and −, pinch, or drag to pan. FIT shows everything. Tapping any symbol on the map — or any stat up top — explains it where it sits.',
            ...(t.hidePoints
              ? [
                  'Your SCORE is deliberately off screen while you play. It is what the run is worth when it ends, not a number to play against.',
                ]
              : []),
            'Worth numbers and the map’s marks stay drawn at every zoom — small when far out, but always there.',
          ],
        },
      ],
    };

    const hand: HelpTab = {
      id: 'hand',
      label: 'HAND',
      grows: grew('rare', 'luck'),
      sections: [
        // Rare tiles earn their section when the first one reaches the hand —
        // the moment's own card says the same words. The old fold dissolved
        // into prose (no number in it priced anything); the OPEN HAND perk
        // line moved to WHAT YOU CARRY, where every worn perk speaks now.
        ...(show('rare')
          ? [
              {
                title: 'RARE TILES AND THE STASH',
                lines: [
                  'MAGIC is wild: it matches every neighbour whatever the colour, and they match it back.',
                  'UNIQUE is wild and heavy: every match it makes counts DOUBLE, for both sides.',
                  'The card says which it is, and a placed rare tile wears a star on the board — four points for magic, five for unique — so its power stays findable on a full map. A unique’s ground match counts double too.',
                  ...(t.holdSlots > 0
                    ? [
                        'The dashed HOLD card keeps one tile for later. Tap to stash the selected card; tap again to trade it back.',
                        'Held tiles survive rerolls — save a rare tile, or the right colour, for the moment it is worth something.',
                      ]
                    : []),
                ],
              },
            ]
          : []),
        ...(t.luckRerollCost > 0 && show('luck')
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
                  ...(t.titheRate > 0 && t.titheMin > 0
                    ? [
                        `TITHE — convert your whole purse to relics on the spot, at ${Math.round(t.titheRate * 100)}%. Better than what unspent luck still banks when the run ends, spent now instead of banked at the end; disabled below ${t.titheMin} luck so a token tithe cannot be a trap.`,
                      ]
                    : []),
                ],
              },
            ]
          : []),
        // WHAT YOU CARRY (the 2026-08-19 debrief's fix): the worn perk, its
        // own sentence, and where it changes — readable MID-RUN, in the one
        // place a player already looks for answers, instead of a whole run
        // away behind the end screen. Absent while nothing is worn; absent
        // on a replay, which plays the plain economy.
        ...(wornPerk !== undefined
          ? [
              {
                title: 'WHAT YOU CARRY',
                lines: [
                  `${wornPerk.name} — ${wornPerk.note}`,
                  'Found out in the world, yours for good. One perk is worn at a time; THE SHOP, on the end screen, is where it changes.',
                ],
              },
            ]
          : []),
      ],
    };

    const after: HelpTab = {
      id: 'after',
      label: 'AFTER',
      grows: t.burnRelics > 0 && grew('relic'),
      sections: [
        // Relics earn their section with the first relic — the moment's card
        // (or the ended transition's) says the same words. The fold keeps the
        // two numbers weighed BETWEEN runs; what the shop sells is read off
        // the shop itself, and the shelf's mystery line already lives above.
        ...(t.burnRelics > 0 && show('relic')
          ? [
              {
                title: 'RELICS AND THE SHOP',
                lines: [
                  'Relics are not points. Points are what a run is worth; relics buy the NEXT run — and both come out of the same pockets, so every ripe pocket asks which game you are playing.',
                  'SACRIFICE a pocket and it pays relics and nothing else — no tiles to live on, no score.',
                  'Spend them in the SHOP, behind its own button on the end screen. Everything you buy is permanent and follows you into every world.',
                  'PERKS are not for sale. They are FOUND — hidden somewhere out in the world — and you may wear one at a time.',
                ],
                detail: [
                  `A sacrifice pays ${t.burnRelics} relics per tile in the pocket, and reaching somewhere new pays ${t.claimRelics} for nothing — the half of the meta that costs no sacrifice.`,
                  `When a run ends, ${Math.round(t.luckToRelics * 100)}% of the luck still in your purse comes home, so hoarding luck is a real alternative to spending it.`,
                ],
              },
            ]
          : []),
        {
          title: 'HOW IT ENDS, AND WHAT REMAINS',
          lines: [
            'Out of tiles with nothing ripe to POP: broke. Walking to caches is how you avoid it. A frontier that is all wall: walled in — rare, and worth avoiding on the way past.',
            ...(t.runLength > 0
              ? [
                  'LEFT reaches zero: the expedition is over. Anything already ripe can still be POPPED.',
                ]
              : []),
            'This device keeps up to THREE worlds — the front door switches between them — and each one remembers: ground you have revealed stays drawn faint on later runs, and territories you claim greet you already yours.',
            ...(this.#hooks.crossing !== undefined && show('shrine')
              ? [
                  'Once every shrine unlock is woken, any further shrine is a crossing: step through to a NEW WORLD, carrying relics for what you leave behind.',
                ]
              : []),
            'SETTINGS shows what your world has seen, and can start a NEW WORLD outright — unpaid, but your shop and perks always travel.',
          ],
          detail: [
            ...(t.territoryTiles > 0
              ? [
                  `Each territory held starts every later run with +${t.territoryTiles} tiles, up to +${t.territoryTilesCap}.`,
                ]
              : []),
            ...(startingPerk(t, this.#state.claimed.length) > 0
              ? [
                  `This run started with +${startingPerk(t, this.#state.claimed.length)} tiles from territories held.`,
                ]
              : []),
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
    if (t.findEvery > 0 && t.findChance > 0) systems.push('hidden finds');
    if (t.findSense > 0) systems.push('a keen nose');
    if (t.titheRate > 0 && t.titheMin > 0) systems.push('TITHE');
    // The survey has no dial that zeroes it — five world-scale goals exist
    // wherever GOALS does, which is always. Named here so THIS BUILD's own
    // "what this game is" cannot leave out the one system it has no way to
    // turn off.
    systems.push('the survey');

    // THIS BUILD rides at the end of AFTER rather than owning a tab: one
    // section did not earn a sixth of the tab bar.
    const afterWithBuild: HelpTab = {
      ...after,
      sections: [
        ...after.sections,
        {
          title: 'THIS BUILD',
          lines: [
            `One endless plane, grown from seed ${this.#state.rootSeed}. Same seed, same world — share the number to share the run.`,
            systems.length > 0
              ? `In play: ${systems.join(' · ')}.`
              : 'In play: nothing. This is the smallest game there is.',
            // The footer stamp that used to say this at all times moved
            // behind ?ff=debug.overlay (Stage 2, 2026-08-18) — this line is
            // what keeps "which build is this" answerable without it.
            this.#hooks.buildSha === undefined
              ? 'Running an unlabelled build.'
              : `Running build ${this.#hooks.buildSha}.`,
          ],
          detail: [
            `Start with ${t.startingTiles} tiles · a placement costs ${t.baseCost}` +
              (t.costGrace > 0 ? ` for ${t.costGrace} placements, then` : ',') +
              ` +1 per ${t.costRisesEvery} placed` +
              (t.runLength > 0 ? ` · ${t.runLength} placements to the expedition` : '') +
              ` · ${t.draftWidth}-card draft${t.holdSlots > 0 ? ' plus the stash' : ''}.`,
            'SETTINGS below switches every system and carries the decision that set each default.',
            '?ff=debug.overlay adds a raw readout in the hint line and the footer, for reporting a bug with no console to hand.',
          ],
        },
      ],
    };

    const tabs = [start, play, hand, afterWithBuild];
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
  /**
   * LUCK's one visibility gate (`ideas/teaching.md`): the stat and the purse
   * fold appear together, at first luck earned or once taught — a promise
   * that used to be kept by copy-paste in two methods.
   */
  #luckVisible(hud: HudView): boolean {
    return hud.luck > 0 || this.#met('luck');
  }

  #renderSpends(hud: HudView): void {
    // The purse fold arrives WITH the purse: until this device has earned
    // its first luck — or been taught what luck is — a row of prices for a
    // currency that does not exist yet is chrome explaining itself to nobody.
    const luckVisible = this.#luckVisible(hud);
    this.#el.purse.hidden = hud.spends.length === 0 || !luckVisible;
    if (hud.spends.length === 0 || !luckVisible) {
      this.#el.spends.replaceChildren();
      return;
    }

    // Closed by default, because six buttons wrapping to two rows under the
    // hand was the crammed thing. The toggle carries the purse and the
    // cheapest price, and wears the accent whenever something is affordable —
    // so a folded shop advertises itself at exactly the moment it can be used,
    // which the always-open version somehow did not: Marc finished a run with
    // 166 luck unspent while every price sat on screen the whole time.
    // TITHE's own `cost` is the whole purse, not a fixed price — it must
    // never win the toggle's "next N" summary, which is about the cheapest
    // thing left to SAVE UP for.
    const cheapest = hud.spends
      .filter((s2) => s2.on !== 'tithe')
      .reduce((n, s2) => Math.min(n, s2.cost), Infinity);
    const canBuy = hud.spends.some((s2) => s2.affordable);
    const open = this.#el.purseToggle.getAttribute('aria-expanded') === 'true';

    // The rare-tile odds, moved here from the hint line (Stage 2,
    // 2026-08-18): they are what luck buys, and this is the one place luck
    // is already the subject. Closed-state only — open already shows the
    // priced spends, which is the shop's own answer to "what does luck do".
    const odds = hud.odds === null || open ? '' : `  ${hud.odds}`;
    this.#el.purseToggle.textContent = open
      ? `${hud.luck} LUCK  ▾`
      : `${hud.luck} LUCK${odds}  ${canBuy ? '· SPEND' : `· next ${cheapest}`}  ▸`;
    // Written rather than merely read, so the control states its own state
    // even on the first frame — a screen reader should not have to infer it.
    this.#el.purseToggle.setAttribute('aria-expanded', String(open));
    this.#el.purseToggle.classList.toggle('live', canBuy);
    this.#el.spends.hidden = !open;
    if (!open) {
      // Emptied as well as hidden. The fold's first phone test found the grid
      // still drawn after closing: #spends' own display rule outranked the
      // hidden attribute (fixed globally in style.css), and the early return
      // here left the buttons in the DOM to be drawn. Either fix alone ends
      // the symptom; both together end the bug.
      this.#el.spends.replaceChildren();
      return;
    }

    this.#el.spends.replaceChildren(
      ...hud.spends.map((spend) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'spend';
        button.dataset['spend'] = spend.on;
        button.disabled = !spend.affordable;
        if (spend.colour !== null) button.dataset['colour'] = spend.colour;

        if (spend.on === 'tithe') {
          button.textContent = `TITHE — all luck → ${spend.relics ?? 0} relics`;
          button.title =
            'Convert your whole luck purse to relics, on the spot — a better rate than what ' +
            'unspent luck banks when the run ends, spent now instead of banked at the end.';
          return button;
        }

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
    // Pan to the pocket BEFORE it pops. The DEFAULT (biggest) pocket prices
    // the buttons even with nothing tapped, so pressing POP cold — no tap,
    // straight to the button — could pop tiles the camera was never
    // pointed at. A press should show what it just did.
    if (at !== null) this.#renderer.centerOn(at);
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
    const beforeRelics = this.#state.relics;
    this.#dispatch(colour === undefined ? { type: 'SPEND', on } : { type: 'SPEND', on, colour });
    const paid = before - this.#state.luck;
    if (paid <= 0) return;

    const word = colour === undefined ? '' : this.#theme.terrainNames[colour];
    this.#showNote(
      on === 'reroll'
        ? `A fresh hand, for ${paid} luck.`
        : on === 'steer'
          ? `${word} runs hot: a new hand drawn under it, and the next ${this.#state.tuning.colourBiasDraws} draws lean its way. ${paid} luck.`
          : on === 'tithe'
            ? `Tithed ${paid} luck for ${this.#state.relics - beforeRelics} relics.`
            : `Forged UNIQUE — wild, and every match it makes counts double, both ways. ${paid} luck.`,
    );
  }

  #dispatch(action: Action): void {
    // Priced BEFORE the pop, because after it the pocket is stone and the
    // sum cannot be shown any more.
    const before = this.#state;
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
    // Every real change is offered to the shell to keep, BEFORE this method
    // decides what to say about it — the survey's own check right after
    // reads the world the shell just merged, not the snapshot from a moment
    // ago. Saving after each action rather than on some timer means the
    // most a crash can eat is one tap — a run is 10-20 minutes of a phone's
    // attention, and phones wander.
    this.#hooks.onChange?.(next);

    // The survey (2026-08-18): relics are already paid and the ledger
    // already written by the time this returns — the game only has words
    // left to say. Rare (five goals, once a world), so it never gets its
    // own slot: it rides along on top of whatever the SAME action already
    // earned, joined rather than dropped.
    const goalNote = this.#hooks.checkGoals?.() ?? null;
    if (goalNote !== null) this.#goalMetThisRun = goalNote;
    const goalLine = goalNote === null ? '' : `\n\nGOAL MET — ${goalNote}`;

    // A pop outranks a claim in the popup: it is the thing the player just
    // decided, and its arithmetic is the thing worth learning. A claim that
    // outranks nothing (no pop happened) routes by its own weight: a find,
    // a shrine or a territory is an EVENT CARD; a cache or a site stays the
    // one-line toast every pop already uses. Two smaller, once-a-run moments
    // (2026-08-18) fall in behind both: the first unique tile to enter the
    // hand, then new ground — neither worth interrupting a pop or a claim
    // for, both worth saying the one time they are true.
    if (popped !== null) {
      if (harvested !== null && harvested.count > 0) this.#hooks.sound?.pop(harvested.count);
      // The first pop is a teaching moment AND a receipt (`ideas/teaching.md`):
      // the held card carries the lesson — stone, the pressure it makes, and
      // WHEN to pop (Marc, 2026-08-20: "explain why to pop now or why to
      // wait to pop too") — with this pop's own arithmetic under it, so
      // nothing is lost to the card that the toast would have said. The
      // now-vs-wait sentences only speak where their dials are live.
      if (!this.#met('pop')) {
        this.#markMet('pop');
        const t = this.#state.tuning;
        const nowVsWait =
          t.luckPerPop > 0 && t.colourBiasDraws > 0
            ? ' Pop EARLY and often for luck — it pays mostly per pop, not per size — and to steer your next draws toward the popped colour. Let a pocket GROW and it pays more than its pieces: more tiles, more score. Waiting too long can kill you broke with a fortune in the ground.'
            : ' A pocket left to grow pays more than its pieces; a pocket popped early pays sooner — waiting too long can kill you broke with a fortune in the ground.';
        this.#showEventCard(
          '⬢  YOUR FIRST POP\nThe pocket turned to STONE — it still surrounds, but never matches, so popped ground grows poorer; the world stays rich farther out.' +
            nowVsWait +
            `\n\n${popped}${goalLine}`,
        );
      } else {
        this.#showNote(`${popped}${goalLine}`);
      }
    } else if (claimed !== null) {
      if (claimed.eventWorthy) this.#showEventCard(`${claimed.text}${goalLine}`, claimed.action);
      else this.#showNote(`${claimed.text}${goalLine}`);
    } else if (goalNote !== null) {
      this.#showNote(`GOAL MET — ${goalNote}`);
    } else {
      // Nothing louder spoke: a quiet action is where an armed, unmet,
      // currently-true teaching moment gets its card or its toast.
      const lesson = this.#teachCheck(before, next, action);
      if (lesson !== null) {
        this.#markMet(lesson.id);
        if (lesson.tier === 'card') this.#showEventCard(lesson.text);
        else this.#showNote(lesson.text);
      } else if (!this.#uniqueExplained && next.draft.some((tile) => tile.rarity === 'unique')) {
        this.#uniqueExplained = true;
        this.#showNote('UNIQUE — every match counts double, both ways.');
      } else if (
        !this.#newGroundShown &&
        !this.#detour &&
        // A camp run measures reach from the camp; the world's farthest is
        // measured from the origin. Comparing them is not a moment.
        next.wakeAt === null &&
        reachOf(next) > this.#startFarthestReach
      ) {
        this.#newGroundShown = true;
        this.#showNote('NEW GROUND — farther than this world has ever reached.');
      }
    }
    this.render();
  }

  render(): void {
    // One context for both selectors: the board and the HUD price the same
    // pocket, mark the same previews and measure the same reach from one set
    // of board passes instead of re-deriving them apart. See `renderContext`.
    const ctx = renderContext(this.#state, this.#harvestAt);
    this.#renderer.draw(
      toBoardView(
        this.#state,
        this.#harvestAt,
        this.#spotlight,
        this.#hooks.memory ?? [],
        this.#theme.light,
        ctx,
      ),
    );
    this.#renderHud(toHudView(this.#state, this.#harvestAt, this.#spotlight, ctx));
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

  /**
   * The other feedback tier (Stage 2, 2026-08-18): held until dismissed,
   * centred, for a find, a shrine or a territory — the claims that change
   * what the NEXT run starts with. Closes any live toast first: the two
   * tiers must never show two overlapping surfaces for one action, and the
   * card is the modal one — `#mountGestures`'s curtain reads it as such the
   * moment it opens.
   */
  #showEventCard(
    text: string,
    action?: { readonly label: string; readonly run: () => void },
  ): void {
    this.#showNote(null);
    const match = EVENT_GLYPH.exec(text);
    this.#el.eventCardGlyph.textContent = match?.[1] ?? '';
    this.#el.eventCardText.textContent = match?.[2] ?? text;
    // A card with a choice grows its second button; GOT IT reads as staying.
    if (this.#eventAction !== null) {
      this.#eventAction.hidden = action === undefined;
      this.#eventAction.textContent = action?.label ?? '';
      this.#eventActionRun = action?.run ?? null;
    }
    this.#el.eventCardDismiss.textContent = action === undefined ? 'GOT IT' : 'STAY';
    this.#el.eventCard.hidden = false;
    this.#el.eventCardDismiss.focus();
  }

  #closeEventCard(): void {
    if (this.#el.eventCard.hidden) return;
    this.#el.eventCard.hidden = true;
    if (this.#eventAction !== null) this.#eventAction.hidden = true;
    this.#eventActionRun = null;
  }

  /* --------------------------------------------------------------- teaching
   *
   * Drop by drop (`ideas/teaching.md`, 2026-08-19): the first time this
   * DEVICE meets a concept, one short card or toast says what it is — at the
   * moment it happens, once, never again. The ledger is `Progress.met`, per
   * device (confusion is a property of the player, not the world), read and
   * written through the same shop hook the shelf already uses. No hook — the
   * gallery, a bare test build — means no ledger, and no ledger teaches
   * nothing: there is nowhere to write "already said", and a card that
   * repeats forever is worse than none.
   *
   * Claims teach through their own notes (`#claimNote` marks the ledger and
   * upgrades a first site to the held card); the glow fires from
   * `#renderHud`, where the signpost already lives; a run that ends with
   * relics and the moment unmet fires from `#renderEnd`. Everything else
   * fires below, on the first QUIET action after it becomes true — an armed
   * moment never evicts a pop receipt, a claim or a goal.
   */

  /**
   * Is this run a DETOUR — somebody else's seed, or the daily? The hook is
   * still named `replay` (its original case), but the shell passes it for
   * both; this getter is the one place the widening is spelled, so every
   * guard asks the same question by the same name.
   */
  get #detour(): boolean {
    return this.#hooks.replay === true;
  }

  #metSet(): ReadonlySet<TeachId> | null {
    const store = this.#hooks.shop;
    return store === undefined ? null : new Set(store.read().met);
  }

  /** Whether a moment has been taught. No store reads as "yes, all of it". */
  #met(id: TeachId): boolean {
    const store = this.#hooks.shop;
    return store === undefined || hasMet(store.read(), id);
  }

  #markMet(id: TeachId): void {
    const store = this.#hooks.shop;
    if (store === undefined) return;
    // `meet` returns the SAME object when already met — writing it anyway
    // re-serialized the whole progress blob on every cache/territory/shrine
    // claim for the life of a veteran install (the simplify pass's find).
    const progress = store.read();
    const taught = meet(progress, id);
    if (taught !== progress) store.write(taught);
  }

  /**
   * The moments `#dispatch` fires itself, in priority order — the first
   * unmet-and-true one speaks and the rest stay ARMED. A state-shaped
   * trigger (a wall on the board, luck in the purse) fires on the next quiet
   * action; a transient one (a cost tick, a native placement) waits for its
   * next natural occurrence. Cards outrank toasts because a card is the
   * bigger lesson.
   */
  #teachCheck(
    before: GameState,
    next: GameState,
    action: Action,
  ): { readonly tier: 'card' | 'toast'; readonly id: TeachId; readonly text: string } | null {
    const t = next.tuning;
    const met = this.#metSet();
    if (met === null) return null;

    if (!met.has('ripe') && Object.keys(next.cells).some((k) => isRipe(next.cells, k))) {
      return {
        tier: 'card',
        id: 'ripe',
        text: '⬢  RIPE\nSurrounded on all six sides, a tile RIPENS and lights up — stone and walls surround too. Tap it to see what its pocket pays, then POP — or keep building around it: a pocket left to grow pays more than its pieces, a pocket popped early pays sooner.',
      };
    }

    if (!met.has('rare')) {
      const inHand = next.held === null ? next.draft : [...next.draft, next.held];
      const rare =
        inHand.find((tile) => tile.rarity === 'unique') ??
        inHand.find((tile) => tile.rarity === 'magic');
      if (rare !== undefined) {
        // The once-a-run unique toast covers repeat runs; the device-wide
        // card covers the first ever. Both firing for one tile would say
        // the same thing twice.
        if (rare.rarity === 'unique') this.#uniqueExplained = true;
        return {
          tier: 'card',
          id: 'rare',
          text:
            rare.rarity === 'unique'
              ? '⬢  UNIQUE\nWild, and heavy: every match it is part of counts DOUBLE, for both sides. Spend it where many tiles touch — placed, it wears a star on the board so you can always find it.'
              : '⬢  MAGIC\nWild: it matches every neighbouring tile, whatever the colour, and they match it back. Spend it where many tiles touch — placed, it wears a star on the board so you can always find it.',
        };
      }
    }

    if (!met.has('luck') && next.luck > 0) {
      return {
        tier: 'card',
        id: 'luck',
        text: '⬢  LUCK\nEvery pop pays a little of it. Luck is a purse, not a score — the row under your hand spends it: a fresh draw, a colour called, a rare tile forged.',
      };
    }

    // Never on a detour: a daily's run-relics bank nothing, and the lesson's
    // own words ("they follow you out") must not be taught by a mode where
    // they do not. The moment stays armed for the home world.
    if (!met.has('relic') && next.relics > 0 && !this.#detour) {
      return { tier: 'card', id: 'relic', text: RELIC_LESSON };
    }

    // The last-gasp rule, taught the first time it fires (Marc, 2026-08-19:
    // "1 tile left but cost is 6, I can still play — is that normal?"). It
    // is — `canAfford` is deliberately `tiles > 0` and the overdraft floors
    // at zero (DESIGN.md's "at zero: one last tile") — but a COST the TILES
    // cannot cover reads as a bug to anyone it has not been explained to,
    // including the game's own designer.
    if (
      !met.has('lastGasp') &&
      action.type === 'PLACE' &&
      before.tiles < placementCostAt(before.cells, action.hex, before.placements, t)
    ) {
      return {
        tier: 'toast',
        id: 'lastGasp',
        text: `That cost more tiles than you had — allowed, by design. ${LAST_GASP_RULE} At zero with nothing ripe, the run is over.`,
      };
    }

    // A colour teaches itself at its FIRST placement — after the cards
    // above (a personality can wait one action; a first ripe tile cannot)
    // and before the other toasts, so tap one is usually a colour lesson.
    if (action.type === 'PLACE') {
      const placed = next.cells[action.hex];
      if (placed?.kind === 'tile') {
        const id = COLOUR_TEACH[placed.colour];
        if (!met.has(id)) {
          const lesson = this.#colourLesson(placed.colour);
          if (lesson !== null) return { tier: 'toast', id, text: lesson };
        }
      }
    }

    if (!met.has('costRise') && costOf(next.placements, t) > costOf(before.placements, t)) {
      return {
        tier: 'toast',
        id: 'costRise',
        text: `The placement cost just rose — it rises every ${t.costRisesEvery} placed and never comes back down. That is the clock that ends every run.`,
      };
    }

    if (!met.has('wall') && Object.values(next.cells).some((cell) => cell.kind === 'wall')) {
      return {
        tier: 'toast',
        id: 'wall',
        text: 'That dark ridge is a WALL — it cannot be built on. It surrounds (so it helps things ripen) but never matches. A frontier that is all wall can end a run; build around.',
      };
    }

    if (!met.has('field') && action.type === 'PLACE') {
      const was = before.cells[action.hex];
      if (was?.kind === 'empty' && was.native !== undefined) {
        return {
          tier: 'toast',
          id: 'field',
          text: 'Dotted ground is a NATIVE FIELD: a tile of its own colour placed there counts the ground as one extra match. Whole regions lean one colour — chase a colour to where it grows.',
        };
      }
    }

    return null;
  }

  /**
   * The purse fold's first-contact card (Marc, 2026-08-20), built from the
   * LIVE tuning like every explanation in the game: only rows whose dials
   * are on get named, the rates are the run's own numbers, and the one fact
   * the fold's prices never say leads the close — luck is use-it-or-lose-it.
   */
  #purseLesson(): string {
    const t = this.#state.tuning;
    const rows = [
      ...(t.luckRerollCost > 0 ? ['a fresh hand (REROLL)'] : []),
      ...(t.luckSteerCost > 0 ? ['a hand drawn toward a colour you name (STEER)'] : []),
      ...(t.luckForgeCost > 0 ? ['the selected card turned UNIQUE (FORGE)'] : []),
    ];
    const spends =
      rows.length > 0
        ? `Every row is priced in luck: ${rows.join(', ')}.`
        : 'Every row is priced in luck.';
    const tithe =
      t.titheRate > 0
        ? ` TITHE is the exit — the WHOLE purse traded for relics at ${Math.round(t.titheRate * 100)}%, better than dying on it.`
        : '';
    const lost =
      t.luckToRelics > 0
        ? `And you CAN lose it all: the run's end pays back only ${Math.round(t.luckToRelics * 100)}% of whatever is left, so a full purse you die on is mostly gone. Spend it.`
        : 'And you CAN lose it all: whatever is left when the run ends is lost outright. Spend it.';
    return `⬢  LUCK IS FOR SPENDING\n${spends}${tithe}\n\n${lost}`;
  }

  #renderHud(hud: HudView): void {
    // Running dry (`ideas/sound.md`): the dread is the sound, and it plays
    // when the purse first sinks within a few tiles of the next cost — not
    // at death, which stays silent. Hysteresis re-arms it only after a real
    // recovery (a cache, a pop), so the line is crossed once per descent.
    if (!hud.ended && this.#hooks.sound !== undefined) {
      if (!this.#dryWarned && hud.tiles > 0 && hud.tiles < hud.cost + 3) {
        this.#dryWarned = true;
        this.#hooks.sound.dry();
      } else if (this.#dryWarned && hud.tiles >= hud.cost + 6) {
        this.#dryWarned = false;
      }
    }

    this.#renderStats(hud);
    this.#renderDraft(hud);

    // The reorientation line, cut to ONE clause (Stage 2, 2026-08-18:
    // "bottom-third reclaim") — what to do now, full stop. It used to run
    // three ideas together (the guide, the nearest destination, the odds),
    // which read as a paragraph nobody actually read. The other two moved
    // rather than vanished: the destination signpost is announced as a
    // TOAST when it changes (below), which is louder than a line that sat
    // there being true the whole time; the odds moved onto the purse
    // toggle, beside the currency they actually describe.
    //
    // A long-pressed draft card takes the line instead — the spotlight is
    // exactly a question, and this is its answer, per colour: the numbers,
    // how much the colour's own power earned of them, and the power itself.
    // The formula is one channel for everyone by design; what differs is how
    // each colour builds worth, so that is what the tip says.
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
    const parts = [spotLine ?? hud.guide];
    if (this.#hooks.debug === true) parts.push(this.#debugLine());
    const hint = parts.filter((s) => s !== null).join(' · ');
    this.#el.hint.textContent = hint;
    this.#el.hint.hidden = hint === '';

    // The destination signpost, as a TOAST on CHANGE rather than a line that
    // sat in the hint permanently being true. `#lastSignpost` starts
    // undefined so the very first render (boot, or a resumed run) primes it
    // silently — a returning player should not be greeted with a toast about
    // ground they already knew was near. A claim or a pop's own toast, AND
    // an open event card, always win the same beat; the signpost only
    // speaks when nothing louder just did.
    const quietBeat =
      this.#lastSignpost !== undefined &&
      hud.hint !== null &&
      this.#el.toast.hidden &&
      this.#el.eventCard.hidden;
    if (quietBeat && !this.#met('glow')) {
      // The first light this device has ever had a signpost to
      // (`ideas/teaching.md`): the held card, where the recurring signpost
      // toast below is the receipt every later light gets. Same quiet-beat
      // guard, same priming rule — boot never greets anyone with it.
      this.#markMet('glow');
      this.#showEventCard(
        '⬢  A LIGHT IN THE DARK\nThat glow is a real place, shining through ground you have not reached. Build your chain out and touch it with a tile to claim it — each kind explains itself when you first arrive.',
      );
    } else if (quietBeat && hud.hint !== this.#lastSignpost) {
      this.#showNote(`${hud.hint}.`);
    }
    this.#lastSignpost = hud.hint;

    // The harvest buttons exist only while the choice does. A pair of dead
    // buttons pricing an impossible harvest at 0 was two decisions on screen
    // that were not decisions; their appearing IS the "pocket ready" signal,
    // and when they appear both payouts show their real numbers — the choice
    // is only a choice if you can see what you are giving up.
    // A tiles-harvest that buys nothing says so on the button itself, because
    // a dead option that looks exactly like a live one is how a player wastes
    // the back half of a run.
    this.#el.harvestTiles.textContent = hud.tilesSpare
      ? `POP ${hud.harvestTiles} tiles · SPARE`
      : `POP ${hud.harvestTiles} tiles`;
    this.#el.harvestTiles.classList.toggle('spare', hud.tilesSpare);
    // Under the single payout there is nothing to choose between: one POP
    // button that pays tiles and scores, and the points button stops
    // existing rather than sitting there meaning the same thing. Where
    // `hidePoints` is on, the points figure itself stayed off this button —
    // printing it here leaked the very number the setting exists to hide.
    // DEPTH is what shows instead: the same distance multiplier the pocket
    // is about to be scored at, the honest thing to learn from a button
    // whose score you cannot see. The end screen's payout breakdown is where
    // the points themselves are learned, once the run is over.
    if (hud.singlePayout) {
      const worth = hud.showPoints ? `${hud.harvestPoints} pts` : `×${hud.harvestDepth} deep`;
      this.#el.harvestTiles.textContent = hud.questPays
        ? `★ POP  ${hud.harvestTiles} tiles · ${worth}`
        : `POP  ${hud.harvestTiles} tiles · ${worth}`;
      this.#el.harvestTiles.classList.toggle('bounty', hud.questPays);
      this.#el.harvestTiles.classList.remove('spare');
      this.#el.harvestPoints.hidden = true;
      this.#el.harvestPoints.disabled = true;
    } else {
      // The bounty rides on the button that collects it, with its multiplier
      // shown — the reason to press a button belongs on the button.
      this.#el.harvestPoints.textContent = hud.questPays
        ? `POP ${hud.harvestPoints} pts ★`
        : `POP ${hud.harvestPoints} pts`;
      this.#el.harvestPoints.classList.toggle('bounty', hud.questPays);
    }

    this.#renderSpends(hud);

    // The sacrifice, where it exists: give up the pocket for luck instead.
    const burn = hud.canHarvest ? hud.harvestBurn : 0;
    this.#el.harvestBurn.hidden = burn <= 0;
    this.#el.harvestBurn.disabled = burn <= 0;
    if (burn > 0) {
      // "for the shop" names what a sacrifice is FOR — relics only ever buy
      // the shop, and the word was otherwise doing the same job as SACRIFICE
      // itself: naming that something is given up, not what it is given up
      // for.
      this.#el.harvestBurn.textContent = hud.burnPaysRelics
        ? `SACRIFICE · ${burn} relics for the shop`
        : `SACRIFICE · +${burn} luck`;
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
   *
   * The ghost baseline (2026-08-18): when a standing best exists, the chart's
   * own scale stretches to include it — `scale` is whichever is bigger, this
   * run's own biggest pop or the world's best TOTAL score — and that total is
   * drawn as a faint horizontal line. No new storage: `#recordBest` is
   * `meta/records.ts`'s own `bestPoints`, read from the SAME `finish` call
   * that already prints "NEW BEST" or "N short of best" beside the score;
   * this is the first thing that draws it rather than only saying it. A run
   * whose single biggest pocket beats an entire past run outright — which
   * this economy's bank-and-cash shape makes plausible, not rare — shows
   * exactly that: the tallest bar reaching past a line it used to fall short
   * of.
   */
  #arcChart(): SVGSVGElement | null {
    const harvests = this.#state.log.harvests;
    if (harvests.length < 2) return null;
    const biggest = harvests.reduce((n, h) => Math.max(n, h.points), 0);
    const span = Math.max(1, this.#state.placements);
    if (biggest <= 0) return null;

    const previousBest = this.#recordBest ?? 0;
    const scale = Math.max(biggest, previousBest);

    // Enlarged 280×44 → 300×72 (2026-08-19, WORKPLAN Stage 2 screen pass):
    // the arc is the run's own emotional centerpiece now, sitting inside
    // the hero block rather than one line among several — the data it
    // draws is unchanged, only the room it gets to say it in.
    const NS = 'http://www.w3.org/2000/svg';
    const W = 300;
    const H = 72;
    const BASE = H - 2;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'end-arc');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `every pop of the run in order; the biggest landed ${Math.round(
        ((harvests.find((h) => h.points === biggest)?.at ?? 0) / span) * 100,
      )}% of the way through` +
        (previousBest > 0 ? `; your standing best run scored ${previousBest}` : ''),
    );

    const base = document.createElementNS(NS, 'line');
    base.setAttribute('x1', '0');
    base.setAttribute('y1', String(BASE));
    base.setAttribute('x2', String(W));
    base.setAttribute('y2', String(BASE));
    base.setAttribute('class', 'end-arc-base');
    svg.appendChild(base);

    if (previousBest > 0) {
      const y = BASE - (previousBest / scale) * (H - 8);
      const ghost = document.createElementNS(NS, 'line');
      ghost.setAttribute('x1', '0');
      ghost.setAttribute('y1', String(y));
      ghost.setAttribute('x2', String(W));
      ghost.setAttribute('y2', String(y));
      ghost.setAttribute('class', 'end-arc-ghost');
      svg.appendChild(ghost);
    }

    for (const h of harvests) {
      const x = 3 + (h.at / span) * (W - 6);
      const height = Math.max(2, (h.points / scale) * (H - 8));
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
   * The run, ended — Gate D's screen, as a PAYOUT (Stage 2, 2026-08-18):
   * what you scored, broken into exactly the three terms the engine paid it
   * in, and what you carry out into the next run. `hidePoints` keeps the
   * running total off the HUD all the way through the run; this is the one
   * screen that owes the player the arithmetic behind the number they only
   * just saw for the first time.
   */
  /**
   * The default title treatment (2026-08-19, WORKPLAN Stage 1): the mark
   * beside the name, the same lockup the front door draws in markup — built
   * here in JS because the end screen has no static markup of its own to
   * hang an `<img>` on. Superseded whole by `#titleImage` the moment
   * `ui.logo` is wired for the running theme.
   */
  #drawnTitle(cls: string): HTMLElement {
    const wrap = document.createElement('p');
    wrap.className = cls;
    const mark = document.createElement('img');
    mark.className = 'title-mark';
    mark.src = ICON_DATA_URI;
    mark.alt = '';
    mark.width = 16;
    mark.height = 16;
    wrap.append(mark, document.createTextNode(NAME));
    return wrap;
  }

  /** `ui.logo`, wired: the baked lockup replaces `#drawnTitle` entirely. */
  #titleImage(url: string): HTMLImageElement {
    const img = document.createElement('img');
    img.className = 'end-title-img';
    img.src = url;
    img.alt = NAME;
    img.width = 876;
    img.height = 450;
    return img;
  }

  #renderEnd(hud: HudView): void {
    if (this.#recordLines === null) {
      this.#recordLines = [];
      const book = this.#hooks.finish?.(this.#state);
      if (book !== undefined) {
        // A headline when it is true; a distance when it is not. Restating
        // "best 480 pts" beside a run that scored 190 answered a question
        // nobody asked — how far short is the one worth knowing.
        this.#recordLines.push(
          book.isNewBest ? 'NEW BEST' : `${Math.max(0, book.best - hud.points)} short of best`,
        );
        this.#runNumber = book.runs;
        this.#recordBest = book.previousBest ?? null;
      }
      // The story, drawn: one snapshot, taken exactly once at this same
      // ended transition — never re-captured on a later render of the same
      // end screen (opening the shop and coming back, say), which is what
      // guarding it behind `#recordLines`'s own null-check buys for free.
      this.#snapshot = this.#renderer.snapshot(SNAPSHOT_MAX_PX);

      // The install nudge is marked shown at the same exactly-once
      // transition everything else on this screen banks on — the LINE keeps
      // rendering for the life of this end screen, but no later run repeats it.
      this.#hooks.install?.shown();

      // A run can end with the relic moment still unmet — its first relics
      // arriving only in the ending bonus, after the last quiet action that
      // could have taught them. Said here, once, at the same transition that
      // banked them (`finish` above), so the door below never appears
      // unexplained (`ideas/teaching.md`). Never on a detour: a daily banks
      // nothing, and "they follow you out" must not be taught by a mode
      // where they do not.
      if (!this.#met('relic') && !this.#detour) {
        const banked = this.#hooks.shop?.read().relics ?? 0;
        if (banked > 0 || hud.relics > 0) {
          this.#markMet('relic');
          this.#showEventCard(RELIC_LESSON);
        }
      }
    }

    const line = (cls: string, text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      return p;
    };

    // Two columns of one line each — a label and its number, the same shape
    // the stat row already uses, so a payout row and a HUD stat read as the
    // same kind of fact.
    const row = (
      cls: string,
      label: string,
      value: string,
      opts: { link?: () => void; live?: boolean } = {},
    ): HTMLElement => {
      const el =
        opts.link === undefined ? document.createElement('p') : document.createElement('button');
      el.className = cls;
      if (el instanceof HTMLButtonElement) {
        el.type = 'button';
        el.classList.toggle('live', opts.live === true);
        el.addEventListener('click', () => opts.link?.());
      }
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.textContent = value;
      el.append(l, v);
      return el;
    };

    const isNewBest = this.#recordLines[0] === 'NEW BEST';

    // The shop lives behind its own door now, not interleaved with the run's
    // picture. Its own screen, sticky purse and BACK at the top so neither
    // scrolls out of reach of a long shelf.
    if (this.#endView === 'shop') {
      const progress = this.#hooks.shop?.read();
      const header = document.createElement('div');
      header.className = 'shop-header';
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'end-shop-back';
      back.className = 'end-link';
      back.textContent = '◂ BACK';
      back.addEventListener('click', () => {
        this.#endView = 'run';
        this.#renderEnd(hud);
      });
      const purse = document.createElement('p');
      purse.className = 'shop-purse';
      purse.textContent = `${progress?.relics ?? 0} RELICS`;
      header.append(back, purse);
      this.#el.end.replaceChildren(header, ...this.#shopParts());
      return;
    }

    // The game says its own name here, because this is the screen that gets
    // screenshotted and shared — a picture of a run should say whose run.
    // `ui.logo` (2026-08-19) supersedes the text: a PNG at the slot replaces
    // the drawn mark-and-name treatment with the baked lockup, same as every
    // other asset slot's fill-vs-asset precedence.
    const parts: Element[] = [
      this.#logoUrl === null ? this.#drawnTitle('end-title') : this.#titleImage(this.#logoUrl),
    ];
    if (this.#runNumber !== null) {
      parts.push(
        line(
          'end-run',
          this.#hooks.daily === undefined ? `RUN ${this.#runNumber}` : `TRY ${this.#runNumber}`,
        ),
      );
    }
    // The daily badge (2026-08-19): which daily this was and where you
    // stand on it — the same facts the share line carries, visible before
    // sharing is even considered.
    if (this.#hooks.daily !== undefined) {
      parts.push(line('end-run', this.#hooks.daily.label()));
    }

    // The hero (2026-08-19, WORKPLAN Stage 2): the headline, the score and
    // the arc, framed as one block instead of four lines loose on the
    // page — this is the screen that gets screenshotted, and the arc is
    // the picture worth composing around. `ui.runEnd` wired the same way
    // `ui.logo` was: a warm CSS gradient panel by default, a PNG at the
    // slot supersedes it as the backdrop those numbers sit ON, never in
    // place of them — this stage moves paint, never numbers.
    const hero = document.createElement('div');
    hero.className = 'end-hero';
    if (this.#runEndUrl !== null) {
      hero.classList.add('art');
      hero.style.setProperty('--run-end-art', `url("${this.#runEndUrl}")`);
    }
    if (isNewBest) hero.append(line('end-headline', 'NEW BEST'));
    hero.append(line('end-epitaph', hud.epitaph ?? ''));
    hero.append(line('end-score', `${hud.points} pts`));

    const arc = this.#arcChart();
    if (arc !== null) hero.append(arc);
    if (!isNewBest && this.#recordLines.length > 0) {
      hero.append(line('end-best', this.#recordLines[0]!));
    }
    parts.push(hero);

    // The story, drawn (`ideas/endless-world.md`): the board itself, exactly
    // as the run left it. Tap opens nothing — it IS the screenshot bait; the
    // share CARD (2026-08-19, WORKPLAN Stage 2) draws its own picture of the
    // run rather than this one, since a board portrait carries no numbers a
    // chat thumbnail can read.
    if (this.#snapshot !== null) {
      const img = document.createElement('img');
      img.className = 'end-snapshot';
      img.src = this.#snapshot;
      img.alt = '';
      parts.push(img);
    }

    // SHARE rides beside the run's own picture of itself — the arc and the
    // score — rather than waiting at the bottom under the shop and NEW RUN.
    if (this.#hooks.share !== undefined) {
      const share = document.createElement('button');
      share.type = 'button';
      share.id = 'end-share';
      share.className = 'end-link';
      share.textContent = 'SHARE THIS RUN';
      const send = this.#hooks.share;
      // The share card's own facts (2026-08-19, WORKPLAN Stage 2): built
      // from the SAME `hud`/`isNewBest`/`this.#runNumber` this very render
      // just drew the screen from — one source, so the picture the shell
      // sends can never contradict the screen it came off. The daily's own
      // ladder line (`hooks.daily.label()`) supersedes RUN/TRY entirely —
      // it already carries the number that line would have said — and its
      // seed is a date nobody outside this device's book can use, so the
      // footer stays empty rather than printing a number that means
      // nothing (the existing text share drops it the same way).
      const card: ShareCardData = {
        points: hud.points,
        reach: hud.depthValue,
        arc: this.#state.log.harvests.map((h) => h.points),
        headline: isNewBest ? 'NEW BEST' : null,
        topLine:
          this.#hooks.daily !== undefined
            ? this.#hooks.daily.label()
            : this.#runNumber !== null
              ? `RUN ${this.#runNumber}`
              : '',
        footerLine: this.#hooks.daily !== undefined ? '' : `SEED ${this.#state.rootSeed}`,
      };
      share.addEventListener('click', () => {
        void send(this.#state, card).then((outcome) => {
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

    // The payout breakdown: the score, in the exact three terms the engine
    // adds it up in — everything scored while playing (every pop taken as
    // points, and any site claimed outright), then the two end-of-run
    // bonuses `endingBonus` pays once, at the moment the run stops. Derived
    // from the SAME numbers the reducer just paid with (`hud.depthValue` is
    // `reachOf(state)`, `hud.summary.claims` counts the identical claimed
    // landmarks `endingBonus` does) rather than restated, so this cannot
    // drift from what actually happened. Silent where the dials are both
    // off — nothing to break down.
    const t = this.#state.tuning;
    if ((t.endReachBonus > 0 || t.endClaimBonus > 0) && hud.summary !== null) {
      const reachBonus = hud.depthValue * t.endReachBonus;
      const claimBonus = hud.summary.claims * t.endClaimBonus;
      const pops = hud.points - reachBonus - claimBonus;
      const payout = document.createElement('div');
      payout.className = 'end-payout';
      payout.append(
        row('end-payout-row', 'POPS', String(pops)),
        row('end-payout-row', `REACH ${hud.depthValue} × ${t.endReachBonus}`, `+${reachBonus}`),
        row(
          'end-payout-row',
          `CLAIMS ${hud.summary.claims} × ${t.endClaimBonus}`,
          `+${claimBonus}`,
        ),
        row('end-payout-row end-payout-total', 'TOTAL', String(hud.points)),
      );
      parts.push(payout);
    }

    // The facts, as a 2×3 grid rather than one clause run together — six
    // fixed cells, always present, so the shape of the screen never jumps
    // between a short run and a long one. LUCK is deliberately not one of
    // them: it double-counts relics (`endingBonus` already folded the
    // unspent purse into the relics line below), and this grid is about the
    // run's shape, not its currency.
    const s = hud.summary;
    if (s !== null) {
      const grid = document.createElement('div');
      grid.className = 'facts-grid';
      const cell = (label: string, value: string): HTMLElement => {
        const c = document.createElement('div');
        c.className = 'fact';
        const l = document.createElement('span');
        l.className = 'fact-label';
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'fact-value';
        v.textContent = value;
        c.append(l, v);
        return c;
      };
      grid.append(
        cell('REACH', String(hud.depthValue)),
        cell('PLACEMENTS', String(hud.placements)),
        cell('POPPED', String(s.harvests)),
        cell(
          'BIGGEST POP',
          s.biggestHarvest > 0 ? `${s.biggestHarvest} at ${Math.round(s.biggestAt * 100)}%` : '—',
        ),
        cell('DESTINATIONS', String(s.claims)),
        cell('BOUNTIES', String(s.quests)),
      );
      parts.push(grid);
    }

    // What-still-glows (2026-08-18): the nearest thing this run never
    // reached, and how far past its own edge it sits — `hintFor`'s own
    // language, reused, never a find. Silent when nothing qualifies (a run
    // that claimed everything nearby, or died somewhere with nothing left
    // in beacon range).
    if (hud.glowBeyondEdge !== null) parts.push(line('end-facts', hud.glowBeyondEdge));

    // CARRIED OUT: what this run adds to the roguelite, permanently — as
    // distinct from the run's own score above it. Relics banked and a perk
    // found are THIS run's; territories held and how much of the map is
    // known are the WORLD's, read fresh from the shell (`worldStats`) so a
    // territory claimed a moment ago is never shown as unclaimed.
    // On a detour (a replay, a daily) NOTHING is carried out — the run's own
    // relics were never banked, so saying "N relics banked" would be the end
    // screen lying about the one thing the mode promises not to do.
    const carriedRelics = this.#detour ? 0 : hud.relics;
    const world = this.#hooks.worldStats?.();
    if (
      carriedRelics > 0 ||
      this.#foundThisRun !== null ||
      this.#goalMetThisRun !== null ||
      world !== undefined
    ) {
      const carried = document.createElement('div');
      carried.className = 'end-carried';
      carried.append(line('shop-purse', 'CARRIED OUT'));
      carried.append(line('end-facts', `${carriedRelics} relics banked`));
      if (this.#foundThisRun !== null) {
        carried.append(line('end-facts', `✦ found — ${this.#foundThisRun}`));
      }
      if (world !== undefined) {
        carried.append(
          line(
            'end-facts',
            `${world.territories} territor${world.territories === 1 ? 'y' : 'ies'} held · ` +
              `${Math.round(world.knownPct * 100)}% of the world known`,
          ),
        );
      }
      // The survey: a world goal met THIS run, named once — the ledger
      // itself (met vs unmet, every goal) lives in SETTINGS' YOUR WORLD.
      if (this.#goalMetThisRun !== null) {
        carried.append(line('end-facts', `◈ goal met — ${this.#goalMetThisRun}`));
      }
      parts.push(carried);
    }

    // The shop door, demoted from a button to a payout row: the purse total
    // (not this run's take above — the whole thing you can spend), tappable,
    // wearing the accent when anything inside is affordable — the same
    // advertising contract the in-run luck fold keeps. Hidden entirely until
    // this device has relics to spend or has met them (`ideas/teaching.md`) —
    // a door to a shop priced in a currency you have never seen is the exact
    // kind of unexplained chrome the drip exists to remove.
    if (
      this.#hooks.shop !== undefined &&
      (this.#met('relic') || this.#hooks.shop.read().relics > 0 || carriedRelics > 0)
    ) {
      const progress = this.#hooks.shop.read();
      // Promoted back from a whisper (Marc, 2026-08-20: "make more emphasis
      // on relics, count, go buy"). The demoted payout row was dim until
      // something inside was already affordable — quiet exactly when the
      // purse is short, which is when "go sacrifice one more pocket" is the
      // message. The count is the value, GO BUY is the action, the accent
      // is unconditional; `live` still marks the affordable state louder.
      // The next-rung tease that sat under it ("STEADY PACE in 12",
      // 2026-08-18) is gone by the same report — at "DEEPER PURSE in 56"
      // it read as noise, and the shelf inside prices every rung already.
      const door = row(
        'end-payout-row end-link end-shop-door',
        'RELICS',
        `${progress.relics} · GO BUY ▸`,
        {
          link: () => {
            this.#endView = 'shop';
            this.#renderEnd(hud);
          },
          live: UPGRADES.some((u) => canAfford(progress, u)),
        },
      );
      door.id = 'end-shop-open';
      parts.push(door);
    }

    // TRY AGAIN (the daily, 2026-08-19): the retry loop lives on the end
    // screen where the itch actually is — the tries counter above confesses
    // every press, per the design's own honesty rule.
    if (this.#hooks.daily !== undefined) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.id = 'end-retry';
      retry.textContent = 'TRY AGAIN';
      const go = this.#hooks.daily.retry;
      retry.addEventListener('click', () => {
        go();
      });
      parts.push(retry);
    }

    // NEW RUN is the exit — and on a daily it says where the exit goes.
    if (this.#hooks.newRun !== undefined) {
      const again = document.createElement('button');
      again.type = 'button';
      again.id = 'end-new-run';
      again.textContent = this.#hooks.daily === undefined ? 'NEW RUN' : 'BACK TO YOUR WORLD';
      const start = this.#hooks.newRun;
      again.addEventListener('click', () => {
        start();
      });
      parts.push(again);
    }

    // The install nudge, once ever: quietest voice on the screen, after the
    // actions — an invitation, not a gate. `shown()` was marked at this end
    // screen's exactly-once transition above, so a reload never re-offers.
    if (this.#hooks.install !== undefined) {
      const nudge = line('end-install', this.#hooks.install.note);
      nudge.id = 'end-install';
      parts.push(nudge);
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
   * economy, which is every game but the tiles-only one. The purse total
   * itself is drawn by the caller now (the sticky header), not here.
   */
  #shopParts(): HTMLElement[] {
    const shop = this.#hooks.shop;
    if (shop === undefined) return [];
    const progress = shop.read();

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

      if (price === null) {
        button.textContent = 'DONE';
        button.disabled = true;
      } else {
        button.textContent = `BUY ${price}`;
        button.disabled = progress.relics < price;
        button.addEventListener('click', () => {
          shop.write(buy(shop.read(), upgrade));
          // The acknowledgement: a beat of the row wearing the accent, and
          // the button saying so, before the whole screen redraws under it.
          // A bought upgrade used to look identical to one that was still
          // for sale — same row, same price gone quiet — and the only sign
          // anything happened was a purse number one had to already know to
          // check.
          row.classList.add('bought');
          button.textContent = 'BOUGHT';
          setTimeout(() => {
            this.#renderEnd(toHudView(this.#state, this.#harvestAt, this.#spotlight));
          }, 260);
        });
      }

      row.append(name, note, button);
      return row;
    });

    // THE SHELF (2026-08-18): perks are found in the world, never bought.
    // An owned perk shows its name, its sentence and the one toggle it has.
    // Undiscovered ones used to be four identical UNDISCOVERED rows with a
    // dash — the mystery was the point, but four blank rows read as a
    // loading state rather than a promise. One line names the count instead —
    // and since 2026-08-20 the HEADER carries it as N/5 FOUND (Marc: "the
    // shelf is unclear that they are unique items you can find, show 0 / 5
    // or similar"): a fresh device's empty shelf now reads as a collection
    // with a size, not a shop section that failed to load.
    const owned = PERKS.filter((perk) => progress.found.includes(perk.id));

    const shelfHead = document.createElement('p');
    shelfHead.className = 'shop-purse';
    shelfHead.textContent = `THE SHELF · ${owned.length}/${PERKS.length} FOUND`;

    const shelfNote = document.createElement('p');
    shelfNote.className = 'end-facts';
    shelfNote.textContent =
      'Unique perks, found out in the world — never sold here. One perk may be worn at a time.';
    const shelf = owned.map((perk) => {
      const worn = progress.equipped.includes(perk.id);

      const row = document.createElement('div');
      row.className = 'shop-row';
      if (worn) row.dataset['worn'] = 'true';

      const name = document.createElement('span');
      name.className = 'shop-name';
      name.textContent = perk.name;

      const note = document.createElement('span');
      note.className = 'shop-note';
      note.textContent = perk.note;

      row.append(name, note);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shop-buy';
      button.textContent = worn ? 'WORN' : 'WEAR';
      button.addEventListener('click', () => {
        shop.write(equip(shop.read(), perk.id));
        this.#renderEnd(toHudView(this.#state, this.#harvestAt, this.#spotlight));
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
        : 'Every perk in the pool has been found.';

    return [...rows, shelfHead, shelfNote, ...shelf, mystery];
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
    // REACH · best N (2026-08-18): the world's own farthest reach, read
    // fresh off `worldStats` — the same hook the end screen's CARRIED OUT
    // strip uses — so a run that just passed its own world's old best
    // shows it changing live, not merely at the end of the story. No prior
    // best (a fresh world, or the hook absent) prints plain REACH N.
    const world = this.#hooks.worldStats?.();
    // "· best N" is the world's origin-anchored farthest; a camp run's own
    // reach is camp-anchored, so the rider comes off rather than comparing
    // two different rulers on one line.
    const reachValue =
      world !== undefined && world.farthestReach > 0 && this.#state.wakeAt === null
        ? `${hud.depthValue} · best ${world.farthestReach}`
        : String(hud.depthValue);

    // LUCK holds its slot only once this device has luck to hold, or has
    // already been taught what luck is (`ideas/teaching.md`: the HUD appears
    // as it matters, paired with the card so the appearance IS the event).
    const luckVisible = this.#luckVisible(hud);

    const stats: readonly Stat[] = [
      { id: 'tiles', label: 'TILES', value: String(hud.tiles) },
      // Score where it is worth watching; otherwise the purse, which is the
      // number this game is actually played against.
      ...(hud.showPoints
        ? [{ id: 'points', label: 'POINTS', value: String(hud.points) } satisfies Stat]
        : luckVisible
          ? [{ id: 'luck', label: 'LUCK', value: String(hud.luck) } satisfies Stat]
          : []),
      { id: 'map', label: 'REACH', value: reachValue },
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

        // Tap a stat, learn it where it sits — the same contract a tapped
        // symbol on the board already keeps, extended to the numbers up top
        // (`ideas/teaching.md`: the board is the manual). A div wearing the
        // button role rather than a <button>, because the global button
        // chrome (panel, border, flex) would restyle the whole row; the
        // keyboard path is stated by hand for the same reason.
        box.setAttribute('role', 'button');
        box.tabIndex = 0;
        const explain = (): void => {
          this.#showNote(this.#statNote(stat.id, hud), true);
        };
        box.addEventListener('click', explain);
        box.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            explain();
          }
        });
        return box;
      }),
    );
  }

  /**
   * One stat, explained in this run's own numbers — the tap-a-symbol
   * contract, kept by the stat row. Sticky, like every explanation you asked
   * for by hand: you are reading it deliberately, and a timer would be a
   * race against your own eyes.
   */
  #statNote(id: string, hud: HudView): string {
    const t = this.#state.tuning;
    switch (id) {
      case 'tiles':
        return 'TILES — what keeps you alive. Every placement spends them; pops, caches and territories pay them back. At zero with nothing ripe to pop, the run ends.';
      case 'points':
        return 'POINTS — the score. A pocket popped for points pays its worth × its size × its distance from home.';
      case 'luck':
        return (
          'LUCK — a purse, not a score. The row under your hand spends it' +
          (t.luckToRelics > 0
            ? `; whatever is left when the run ends comes home as relics, at ${Math.round(t.luckToRelics * 100)}%.`
            : '.')
        );
      case 'map':
        return `REACH — how far from home you have built. Every ${t.distanceStep} hexes out raises the distance multiplier by 1, so the same pocket scores more the deeper it pops.`;
      case 'cost': {
        const curve =
          t.costGrace > 0
            ? `It stays ${t.baseCost} for the first ${t.costGrace} placements, then rises +1 every ${t.costRisesEvery} placed`
            : `It rises +1 every ${t.costRisesEvery} placed`;
        return `COST — the next placement's price: ${hud.cost}. ${curve}, and it never comes back down — the clock that ends every run. ${LAST_GASP_RULE}`;
      }
      case 'left':
        return 'LEFT — placements remaining in the expedition. At zero it ends; anything already ripe can still be popped.';
      default:
        return '';
    }
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
        // The colour lens (2026-08-18: folded off its own row and into the
        // cards that already carry that colour — "bottom-third reclaim").
        // The spotlight itself is unchanged: same field, same board dimming,
        // same calculation in the hint line the standalone chips used to
        // hold down for.
        button.classList.toggle('spotlit', hud.spotlight?.colour === tile.colour);

        // The direction's name for this colour, or the colour itself when the
        // direction has no fiction. Written into the card rather than left to
        // hue alone: four blocks of colour with no words is a memory test, and
        // it is also unplayable for anyone who cannot separate two of them.
        const name = this.#theme.terrainNames[tile.colour];
        button.setAttribute(
          'aria-label',
          tile.rarity === 'common' ? `${name} tile` : `${tile.rarity} ${name} tile`,
        );
        button.title = `Hold, or right-click, to spotlight ${name} on the board.`;

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

        // The BEST badge lived here until 2026-08-19 (Marc: "remove the best
        // indicator on the tile") — the board's own preview numbers already
        // say where every card pays, and the badge was an answer to a
        // question the numbers answer better.

        button.addEventListener('click', () => {
          // A second tap on the selected card puts it DOWN (Marc, 2026-08-20:
          // "we can always unselect a selected tile by tapping it again") —
          // SELECT -1 empties the hand — and still answers the question the
          // tap used to be (2026-08-19, "the colors are not explained"):
          // the lesson shows as the card goes down. Sticky, like every
          // explanation asked for by hand. Dispatch first, note second, so
          // the lesson outlives whatever the quiet action wanted to say.
          this.#dispatch({ type: 'SELECT', index: tile.selected ? -1 : index });
          if (tile.selected) {
            const rare = this.#rarityLine(tile.rarity);
            const lesson =
              this.#colourLesson(tile.colour) ??
              `${name} — worth one per matching neighbour when it ripens.`;
            this.#showNote(rare === null ? lesson : `${lesson}\n${rare}`, true);
          }
        });
        // Long-press (touch), right-click (mouse), or the keyboard's own
        // context-menu key (Menu / Shift+F10 on a focused button) all fire
        // this ONE native event — the browser's own long-press, not a
        // hand-rolled timer, which is what buys the keyboard path for free
        // and keeps this in step with whatever hold-time the platform
        // already trains a thumb to expect.
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.#spotlight = this.#spotlight === tile.colour ? null : tile.colour;
          this.render();
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
    let claims = 0;
    for (const cell of Object.values(s.cells)) {
      if (cell.kind === 'landmark' && cell.claimed) claims++;
    }
    const wornId = this.#hooks.shop?.read().equipped[0];
    const worn = wornId === undefined ? '-' : (PERKS.find((p) => p.id === wornId)?.name ?? '-');
    return (
      `seed ${s.rootSeed} · cells ${Object.keys(s.cells).length} · ` +
      `p${s.placements} t${s.tiles} pts${s.points} luck${s.luck} · ` +
      `rng ${s.rng.tiles.cursor}/${s.rng.loot.cursor}` +
      (s.death === null ? '' : ` · ${s.death}`) +
      ` · relics${s.relics} · perk:${worn} · sense${s.tuning.findSense} · claims${claims}`
    );
  }

  /**
   * One colour's personality as a whole sentence, in the theme's own words
   * and the live tuning's numbers — the text the colour's first-contact
   * toast, the selected card's second tap and a tapped placed tile all
   * share, so the three doors cannot drift apart. Null while that colour's
   * power dial is zeroed: a personality that is off must not be taught.
   */
  #colourLesson(colour: Colour): string | null {
    const t = this.#state.tuning;
    const n = this.#theme.terrainNames[colour];
    switch (colour) {
      case 'green':
        return t.greenCrowdBonus > 0
          ? `${n} — CROWDS. Wants one big mob of its own colour: +${t.greenCrowdBonus} worth per ${n} neighbour past the first.`
          : null;
      case 'yellow':
        return t.yellowCompanyBonus > 0
          ? `${n} — COMPANY. Scores in messy mixed ground: +${t.yellowCompanyBonus} worth per ${t.yellowCompanyAll ? 'differently-coloured neighbour' : 'different colour beside it'}.`
          : null;
      case 'red':
        return t.redAshMatches
          ? `${n} — ASH. Stone${t.redAshWalls ? ' and walls' : ''} count as matches for it: it feeds on the spent ground everyone else abandons.`
          : null;
      case 'blue':
        return t.blueTideEvery > 0
          ? `${n} — TIDE. Worth little at home, a lot on the frontier: +1 worth per ${t.blueTideEvery} hexes from home.`
          : null;
    }
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
