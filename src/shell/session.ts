/**
 * One session of Ashwake: everything a page load used to do exactly once —
 * resolve the slot, the world, the theme and the mode, wire the front door
 * and every panel, mount the renderer, construct the Game. Moved whole out
 * of main.ts (2026-08-27, the reload-removal refactor); main.ts is the app
 * around it — error plumbing, the service worker, and the first call in.
 */
import { GOALS } from '@content/goals';
import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { distance, parse } from '@engine/hex';
import type { LandmarkReward } from '@engine/state';
import {
  buildBackup,
  decodeBackup,
  describeBackup,
  encodeBackup,
  isOwnKey,
  restorePlan,
} from '@meta/backup';
import { dailyBadge, dailyName, dailySeed, dailyStreak, ordinal } from '@meta/daily';
import {
  decodeFeatures,
  isEnabled,
  withOverrides,
  FEATURES,
  type FeatureId,
  type FeatureSet,
} from '@meta/features';
import { metGoalIds } from '@meta/goals';
import { ICON_DATA_URI, NAME, TAGLINE } from '@meta/identity';
import {
  applyProgress,
  withWorldPerks,
  EMPTY_PROGRESS,
  PERKS,
  TEACH_IDS,
  type PerkId,
} from '@meta/progress';
import { decodeRecords, EMPTY as EMPTY_RECORDS, ONLY_WORLD } from '@meta/records';
import { sendCrashReport } from '@meta/report';
import { HOME, parseRoute, searchFor, type Route } from '@meta/route';
import {
  dailiesOf,
  prehistory,
  streamOf,
  type DailyEntry,
  type Highlight,
  type RunDetail,
  type RunEntry,
  type TimelineEntry,
  type WorldEventEntry,
} from '@meta/timeline';
import { knownFraction, rearmedSpent, unlockedBy, UNLOCKS, type WorldMemory } from '@meta/world';
import { AssetBook } from '@render/assets';
import { PixiRenderer } from '@render/PixiRenderer';
import type { Renderer } from '@render/Renderer';
import { applyTheme } from '@theme/apply';
import { assetPath, resolveTheme, AUTO_THEME_ID, DEFAULT_THEME_ID, THEMES } from '@theme/index';
import type { Orientation, Theme } from '@theme/tokens';
import { Sound } from '@ui/audio';
import { closeDialog, openDialog, resetDialogs, siblingsOf } from '@ui/dialog';
import { Game, type Elements, type GameHooks } from '@ui/game';
import { shopParts } from '@ui/shop';
import { markRendererAlive, recordFailure } from '@shell/failure';
import { promptInstall } from '@shell/install';
import { runKeeping } from '@shell/keeper';
import { showInAppNote } from '@shell/notes';
import { departTo, setRoute, transition } from '@shell/router';
import {
  activeSlot,
  appendTimeline,
  askPersistence,
  inAppBrowser,
  loadWorld,
  localToday,
  peekSlot,
  persistFeatures,
  readDailyBook,
  readDailyRun,
  readProgress,
  readTimeline,
  rememberFacing,
  rememberTheme,
  resolveFacing,
  resolveFeatures,
  resolveThemeId,
  saveBackupFile,
  setActiveSlot,
  settleSlot,
  slotKeys,
  useShopSlot,
  writeProgress,
  BEST_STORAGE_KEY,
  ERROR_STORAGE_KEY,
  FEATURE_STORAGE_KEY,
  INSTALL_NUDGE_KEY,
  PROGRESS_STORAGE_KEY,
  SLOTS,
  THEME_STORAGE_KEY,
  type Slot,
} from '@shell/store';

/**
 * What a live session is, and what it takes to end one.
 *
 * A page load used to BE the session: everything below was done exactly once
 * and torn down by the document going away. Since 2026-08-27 a scene change
 * swaps one session for the next without a navigation, so each one has to be
 * able to die — and everything it holds is here so that nothing is forgotten.
 */
export type Session = {
  readonly route: Route;
  readonly abort: AbortController;
  readonly keeper: ReturnType<typeof runKeeping>;
  readonly renderer: PixiRenderer;
  readonly game: Game;
  readonly sound: Sound;
};

/** The session on screen, or null before the first one has been built. */
let live: Session | null = null;

/**
 * A session currently being BUILT, or null.
 *
 * `live` is only assigned once `startSession` returns, and it contains one
 * await — mounting the renderer. Between those two moments a session exists
 * on screen (the door is wired) and is invisible to `restart`, which is how
 * a single tap could start a second one. This is that window, made visible.
 */
let booting: Promise<Session> | null = null;

/**
 * Which game is on screen right now.
 *
 * The panels are painted by module functions that never see the session's
 * scope, and a restart from one of them — a theme swatch, say — must land on
 * the SAME game rather than dropping a daily player back into their own
 * world. The URL is the fallback for the window before the first session
 * exists, which is also exactly what it means there.
 */
function currentRoute(): Route {
  return live?.route ?? parseRoute(location.search);
}

/**
 * Back to the front door of your own world.
 *
 * `replace`, not `push`: leaving a daily, switching slot, settling a shared
 * seed, abandoning a world and crossing on all change what the CURRENT
 * history entry means rather than travelling somewhere new. Only the two
 * doors a player walks INTO — the daily and the camp — push, because those
 * are the two they expect to come back out of.
 */
function goHome(): void {
  void restart(HOME, 'replace');
}

/**
 * BACK and FORWARD, wired once per page.
 *
 * There is no dispatch table here and there deliberately never will be: the
 * URL names a game, `startSession` is the one thing that opens one, so
 * replaying a history entry is the same act as opening the link would be.
 * A second mapping from URL to scene is a second thing to keep in step.
 *
 * `'none'`, because the browser has already moved the address bar — writing
 * the route back would push an entry for arriving at one.
 *
 * What this makes true for a player: BACK out of the daily, or out of a run
 * begun at camp, lands on the home door. Their board is not lost by it — a
 * daily is saved after every action under its own key, and the door offers
 * it straight back — which is exactly what the HOME button already promised.
 */
export function followHistory(): void {
  window.addEventListener('popstate', () => {
    void restart(parseRoute(location.search), 'none');
  });
}

/**
 * The signal every listener in this file is wired with.
 *
 * Module-level rather than threaded through twenty functions: exactly one
 * session exists at a time, `startSession` sets this before it wires
 * anything, and `endSession` aborts it. `mountSettings` and its friends are
 * module functions that cannot see the session's scope, and they wire onto
 * markup that outlives every session — which is precisely the wiring that
 * would otherwise double.
 */
let sessionAbort = new AbortController();
function sessionSignal(): AbortSignal {
  return sessionAbort.signal;
}

/**
 * Listen, and be able to stop. Every `addEventListener` in this file goes
 * through here so none can be forgotten by the one call that ends a session.
 */
function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void {
  target.addEventListener(type, handler as EventListener, {
    ...options,
    signal: sessionSignal(),
  });
}

/**
 * Put the markup back the way `index.html` declares it.
 *
 * This is the half a reload used to get for free: a fresh document arrives
 * with the front door up, the shell inert, every optional button hidden and
 * every panel closed, and the session then reveals what applies. In place,
 * whatever the last session revealed is still revealed — so a daily's door
 * would still be offering YESTERDAY's RESUME on the way home.
 *
 * Three hosts are deliberately NOT emptied. `#themes` is relocated into
 * `#settings-body` by `mountSettings`, and `#help-menu` into the manual by
 * the game's own `#buildManual` — emptying their new parents would delete
 * nodes `index.html` declares once and `required()` would then never find
 * again. They are hidden panels repainted on open, so stale content in them
 * is never seen.
 */
function resetShell(): void {
  const el = (id: string): HTMLElement | null => document.getElementById(id);

  el('front-door')?.removeAttribute('hidden');
  el('game-shell')?.setAttribute('inert', '');

  // Everything the markup declares hidden, hidden again.
  for (const id of [
    'front-door-mode',
    'front-door-worlds',
    'front-door-daily',
    'front-door-settle',
    'front-door-home',
    'front-door-shop',
    'worlds-camp',
    'worlds-panel',
    'more-panel',
    'shop-panel',
    'settings-panel',
    'fame-panel',
    'help-panel',
    'more-fame',
    'more-data-title',
    'more-backup',
    'more-restore',
    'more-reset',
    'mode-chip',
    'hint',
    'toast',
    'event-card',
    'end',
    'purse',
    'spends',
    'harvest-points',
    'harvest-treasure',
    'harvest-burn',
    'themes',
  ]) {
    const node = el(id);
    if (node !== null) node.hidden = true;
  }

  // Hosts that hold only nodes their painter created.
  for (const id of [
    'worlds-list',
    'fame-body',
    'shop-body',
    'end',
    'stats',
    'draft',
    'stash',
    'spends',
    'themes',
  ]) {
    el(id)?.replaceChildren();
  }

  // The armed two-tap labels. Their `armed` booleans are session closures and
  // reset with the session; the words on the persistent button do not.
  const relabel = (id: string, text: string): void => {
    const node = el(id);
    if (node === null) return;
    node.classList.remove('armed');
    node.textContent = text;
  };
  relabel('more-reset', 'RESET ALL');
  relabel('more-restore', 'RESTORE A BACKUP');
  relabel('more-backup', 'BACK UP MY WORLDS');
  relabel('front-door-begin', 'BEGIN');

  // The `ui.logo` swap, undone (2026-08-27). A theme that ships a lockup
  // replaces the mark with it, hides the name beside it and adds `.lockup`;
  // the next session only rewrites `src` and the name's TEXT, so switching
  // FROM such a theme to one without would have left the door wearing
  // lockup layout with the game's own name still hidden. Unreachable today —
  // every art slot is empty — but it is a per-page mutation that survived
  // into a per-session path, which is exactly the class this refactor has to
  // stop shipping.
  const logo = el('front-door-logo');
  if (logo !== null) {
    logo.classList.remove('lockup');
    logo.setAttribute('alt', '');
  }
  const doorName = el('front-door-name');
  if (doorName !== null) doorName.hidden = false;
}

/**
 * End a session: stop it writing, stop it listening, stop it drawing.
 *
 * The order is the whole safety argument. `flush` first, so a pause-like exit
 * keeps the last few actions the world-write debounce was still holding — it
 * is a no-op on a world that has been dropped, which is what makes it safe to
 * call even on the exits that just held a funeral. `detach` and `abort` then
 * make every further write impossible rather than merely unlikely. Only then
 * is anything destroyed, and the renderer goes last of the three so no frame
 * is ever drawn into a dead WebGL context.
 */
export function endSession(session: Session): void {
  session.keeper.flush();
  session.keeper.detach();
  session.abort.abort();
  session.game.destroy();
  session.renderer.destroy();
  session.sound.close();
  resetDialogs();
  resetShell();
  if (live === session) live = null;
}

/**
 * Swap this session for one opening `route`, in place.
 *
 * The fade is the acknowledgement a tap deserves (Marc, 2026-08-26) and is
 * now doing a second job: for its 140ms the page is `pointer-events: none`,
 * so nothing can be tapped in the window where one session has ended and the
 * next has not begun.
 *
 * `between` runs with NO session alive — the wipes (RESET ALL, RESTORE) need
 * that, because a keeper still holding the old slot's keys while they are
 * deleted is exactly the double-write this refactor exists to make impossible.
 */
export async function restart(
  route: Route,
  how: 'push' | 'replace' | 'none',
  between?: () => void,
): Promise<void> {
  await transition(async () => {
    // A session still being BUILT is not yet `live`, and tearing down `null`
    // tears down nothing (2026-08-27). `startSession` has exactly one await
    // in it — `renderer.mount` — and every door listener is wired before it,
    // so on a slow cold boot a tap on DAILY or a WORLDS row would have run a
    // second `startSession` alongside the first: two renderers, two Games on
    // the same board, two keepers writing one run key, and whichever
    // finished last owning `live` while the other became unreachable and
    // unkillable. `main.ts` guards this for `popstate`; the doors are the
    // other half. Waiting is right rather than dropping the tap — the boot
    // is about to finish, and the player asked for somewhere else.
    if (booting !== null) await booting.catch(() => undefined);
    if (live !== null) endSession(live);
    between?.();
    if (how !== 'none') setRoute(route, how);
    try {
      await startSession(route);
    } catch (error) {
      // The in-place rebuild is what failed — the realistic cause is a phone
      // refusing a second WebGL context — so the fallback is the navigation
      // this refactor replaced. It cannot fail the same way, and it is what
      // every one of these doors did before 2026-08-27.
      //
      // Without this the app is left with no session at all: the door up
      // over an empty shell, BEGIN throwing on a `game` that was never
      // built, and a failure panel offering CONTINUE into nothing. The
      // error is recorded first so SETTINGS ▸ DEVELOPER still has it.
      recordFailure(error);
      departTo(() => {
        location.href = `${location.pathname}${searchFor(route)}`;
      });
    }
  });
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Follow the setting while the game is open (2026-08-21), not only at boot.
 * Someone reaching for reduced motion mid-run is very likely reaching for it
 * BECAUSE of what is on screen, and until now it took a reload to land. The
 * CSS half has always been live — every animation sits inside a media query
 * — so this closes the gap for the half that lives in the renderer.
 */
function followReducedMotion(renderer: Renderer): void {
  try {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener(
      'change',
      (event) => {
        renderer.setReducedMotion(event.matches);
      },
      { signal: sessionSignal() },
    );
  } catch {
    // A browser without matchMedia change events keeps the boot answer,
    // which is exactly what it did before.
  }
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

/**
 * The picker: one button per direction, restarting into it.
 *
 * A whole new session rather than a live swap, still deliberately — but no
 * longer a page load (2026-08-27). Switching theme changes the hex
 * orientation, every baked texture, the webfont and the browser chrome
 * colour; `PixiRenderer` takes its theme in the constructor and holds it
 * `readonly`, so the honest way to change it is to build another one. That is
 * what a session restart IS, and it costs a fade instead of a navigation.
 *
 * The choice goes to STORAGE rather than into the URL, which is the other
 * half of what changed: `?theme=` and `?hex=` were only ever a way to
 * smuggle a value through a reload, and a route by design cannot carry them.
 */
function mountThemePicker(host: HTMLElement, current: Theme, facing: Orientation | null): void {
  host.hidden = false;

  const themeButtons = THEMES.map((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.textContent = theme.name;
    button.title = theme.note;
    button.setAttribute('aria-pressed', String(theme.id === current.id));
    on(button, 'click', () => {
      rememberTheme(theme.id);
      void restart(currentRoute(), 'replace');
    });
    return button;
  });

  // The facing row: prompt.md Q2 is answered by flipping between these on a
  // phone, so they sit right next to the directions being judged.
  const facingButtons = (
    [
      ['auto', 'theme facing'],
      ['pointy', 'pointy-top'],
      ['flat', 'flat-top'],
    ] as const
  ).map(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(value === (facing ?? 'auto')));
    on(button, 'click', () => {
      rememberFacing(value);
      void restart(currentRoute(), 'replace');
    });
    return button;
  });

  host.replaceChildren(...themeButtons, ...facingButtons);
}

/**
 * A button label that reports an outcome, then goes back to work — every
 * transient label in the shell on ONE clock (2026-08-26; they were at 2000,
 * 2500 and forever). The rule that decides which labels use this: an
 * OUTCOME reverts, an INVITATION stays — "SENT — thank you" stays on its
 * disabled button so a completed one-shot cannot invite a second send, and
 * "NO CONNECTION — try again" stays because it is asking for the tap.
 * The guard keeps a slow timer from clobbering whatever the button says by
 * then — an armed label, a newer outcome.
 */
const LABEL_MS = 2500;
function flashLabel(button: HTMLButtonElement, text: string, revertTo: string): void {
  button.textContent = text;
  setTimeout(() => {
    if (button.textContent === text) button.textContent = revertTo;
  }, LABEL_MS);
}

/**
 * The switchboard half of the `?` panel: one row per registered feature,
 * written FROM the registry — label, decision note, wired-or-not — so the
 * settings screen is the decision record and can never go stale against it.
 *
 * Toggles persist immediately. UI flags apply in place; world flags apply
 * from the next run, never to the one in progress — a switch must not eat a
 * live board. The NEW RUN button is the explicit way to make them count now.
 */
function mountSettings(
  host: HTMLElement,
  initial: FeatureSet,
  live: {
    themesHost: HTMLElement;
    theme: Theme;
    facing: Orientation | null;
    world: WorldMemory;
    slot: Slot;
    abandon: () => void;
    /**
     * The MENU tab's body (Marc, 2026-08-20). Everything about the WORLD —
     * the atlas, the unlock ledger, the survey — plus the three ways out of
     * a run, moved here off the bottom of the settings scroll. Nothing it
     * holds is repeated in the manual's other tabs.
     */
    menuHost: HTMLElement;
    /** Back to the front door. The run is saved, so it is a pause. */
    mainMenu: () => void;
    /**
     * Open the SETTINGS screen (2026-08-25). The switchboard used to be the
     * bottom half of this very panel, so mid-run it needed no door of its
     * own; now that it is a panel, the MENU tab is where the door belongs —
     * MENU already holds every other way out of a run.
     *
     * Takes the button that asked, because the dialog stack hands focus back
     * to it on close and this one is built here, inside a body that is
     * replaced wholesale on every paint.
     */
    openSettings: (opener: HTMLElement) => void;
    /**
     * Which game this is (Marc, 2026-08-20: "separate clearly worlds vs
     * daily, right now a lot of things are intertwined").
     *
     * A detour is not a world, and until now the two shared one panel: the
     * atlas printed YOUR world's seed and shrines while you were playing
     * somebody else's, and NEW WORLD offered to abandon a world the run was
     * not being played on. The MENU tab now shows exactly one of the two,
     * with exits that mean something where you actually are.
     */
    mode: { kind: 'world' } | { kind: 'daily'; name: string; badge: string } | { kind: 'shared' };
    /** The board's ♪ button and this panel's SOUND switch are one wire —
     *  a flip here must land on the button's face and the live gate too. */
    syncSound: (on: boolean) => void;
  },
  startNewRun: () => void,
): void {
  let features = initial;

  // (The panel's own "a tap on a row must not close it" listener is wired
  // once per SESSION, beside `paintSettings` — see `startSession`. It used to
  // be here, and `host` is `#settings-body`, persistent markup this function
  // only ever `replaceChildren`s: it was the one listener in this function
  // that outlived the nodes around it, accumulating one copy per panel open.)

  // Player things first (2026-08-18: "settings reordered"); the two
  // developer switches are testing tools, not something a run is asking a
  // player to decide, and moved into their own fold below.
  // No SETTINGS heading of its own since 2026-08-25: the panel this writes
  // into wears the word in its own header, and a screen that says its name
  // twice in the first two lines reads as a bug.
  const intro = document.createElement('p');
  intro.textContent =
    'Sticky on this device. The switches sit folded under DEVELOPER, below — ' +
    'SOUND among them — and the address bar does the same job ' +
    '(?ff=ui.sound, ?ff=debug.overlay), each note carrying the decision ' +
    'that set its default. RESTART — in the ? panel’s MENU tab — is how a ' +
    'changed one actually takes effect; it never touches the run in progress.';

  // The privacy fact (2026-08-20, launch polish): it was true since Session
  // 0 and written only in a README no player ever sees. One quiet line,
  // here where a person wondering about their data would actually look.
  const privacy = document.createElement('p');
  privacy.className = 'flag-note';
  privacy.textContent =
    'Nothing leaves your phone: no account, no analytics, no server — every ' +
    'run, record and setting lives in this device’s own storage, and ' +
    'sharing only ever sends what you see in the share sheet. The one ' +
    'exception is a crash report, and only when you tap SEND REPORT ' +
    'yourself — it carries the error, the build and your browser’s name, ' +
    'and nothing that says who you are.';

  const appearance = buildAppearance(live.theme);

  // The atlas, as a label/value grid in the stat row's own language
  // (`.fact`/`.fact-label`/`.fact-value` — shared with the end screen's own
  // grid, 2026-08-18) rather than a seven-fact sentence a reader had to
  // parse apart. A fact you have to pull out of a run-on is a fact half-shown.
  // The atlas's own heading is the MENU tab's title now — it names the slot
  // as well ("YOUR WORLD · 2 OF 3"), so a second one here would be a
  // duplicate of the thing directly above it.
  const w = live.world;
  const fact = (label: string, value: string): HTMLElement => {
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
  const atlasGrid = document.createElement('div');
  atlasGrid.id = 'atlas';
  atlasGrid.className = 'facts-grid';
  atlasGrid.append(
    fact('WORLD', `${live.slot} of 3`),
    fact('SEED', String(w.worldSeed)),
    fact('RUNS', String(w.runs)),
    fact('KNOWN', `${Math.round(knownFraction(w) * 100)}%`),
    fact('SEEN', `${w.revealed.length} hexes`),
    fact('TERRITORIES', String(w.territories.length)),
    fact('BEST', `${w.bestPoints} pts`),
    fact('FARTHEST', String(w.farthestReach)),
  );

  // The unlock ledger, as geography: what this world has switched on, and
  // what the next shrine will. A list of locked things you can still read is
  // the difference between a reason to explore and a surprise.
  const ledger = document.createElement('div');
  ledger.id = 'unlocks';
  ledger.append(
    ...UNLOCKS.map((unlock, i) => {
      const row = document.createElement('p');
      const found = i < w.shrines.length;
      row.className = found ? 'unlock found' : 'unlock';
      row.textContent = `${found ? '◈' : '◇'} ${unlock.label}`;
      return row;
    }),
  );

  const shrineHint = document.createElement('p');
  shrineHint.className = 'flag-note';
  shrineHint.textContent =
    w.shrines.length >= UNLOCKS.length
      ? 'Every shrine in the ledger has been found. This world is fully awake.'
      : `Reach a shrine (◈ in the fog) to unlock the next one. ${w.shrines.length} of ${UNLOCKS.length} found.`;

  // Perks are FOUND, never bought (2026-08-18) — a count, never a name: an
  // unfound perk stays a mystery even here, so this line never says which
  // ones are left. PER-WORLD since 2026-08-26, like the shrine ledger above.
  const perksLine = document.createElement('p');
  perksLine.className = 'flag-note';
  perksLine.textContent = `${w.perks.length} of ${PERKS.length} perks found in this world.`;

  // The survey (2026-08-18): five world-scale goals, legible from run one —
  // met vs unmet, facts rather than places (never a find's location, never a
  // hidden perk's name — the same reticence the shrine ledger keeps).
  // Since 2026-08-19 it APPEARS at the first nonzero progress toward any
  // goal (Marc's own wording, `ideas/teaching.md`): a stranger who opens
  // SETTINGS before their first placement is not greeted by a ledger of
  // five locked goals for systems they have not met.
  const surveyStarted =
    w.farthestReach > 0 ||
    w.territories.length > 0 ||
    w.shrines.length > 0 ||
    w.goalsMet.length > 0 ||
    w.revealed.length > 0 ||
    w.perks.length > 0;
  const surveyHeading = document.createElement('p');
  surveyHeading.className = 'help-title';
  surveyHeading.textContent = 'THE SURVEY';
  // What is TRUE, not what has been PAID (2026-08-21). This read
  // `w.goalsMet`, the per-world ledger of goals already reimbursed — which
  // `goals.ts` says `metGoalIds` exists precisely so the panel and the tests
  // ask one question. The gap shows on a second world: `perksAll` is
  // device-wide, so a shelf finished on world 1 sat unticked on world 2
  // forever, because world 2 had never been paid for a fact that was true
  // the day it was settled. A survey reports the world; the ledger is an
  // accounting detail underneath it.
  const metGoals = new Set(metGoalIds(w, withWorldPerks(readProgress(), w.perks, w.worn)));
  const survey = document.createElement('div');
  survey.id = 'survey';
  survey.append(
    ...GOALS.map((goal) => {
      const row = document.createElement('p');
      const met = metGoals.has(goal.id);
      row.className = met ? 'unlock found' : 'unlock';
      // ✓, not ◈ (2026-08-26): the shrine's own glyph was standing in for
      // "goal met", so one mark meant two earned-things. ◇ stays the shared
      // "not yet" slot both ledgers speak.
      row.textContent = `${met ? '✓' : '◇'} ${goal.label}`;
      return row;
    }),
  );

  // Starting over is still the one destructive control in the game, so it
  // confirms — but it is an INVITATION now, not a punishment (Marc,
  // 2026-08-19: "a friendlier fresh start"): NEW WORLD, with the words
  // saying what travels and what stays. What travels CHANGED on 2026-08-20
  // and this sentence did not follow it: shop LEVELS are a world's own now,
  // so they stay behind with the map. Saying otherwise here was a promise
  // made at the exact moment it was about to be broken.
  // The paid way out is the crossing — a fully-awake world's shrines offer it
  // with a relic dowry; this button is the unpaid anytime version.
  let armed = false;
  const abandon = document.createElement('button');
  abandon.type = 'button';
  abandon.id = 'abandon-world';
  abandon.className = 'quiet';
  abandon.textContent = 'NEW WORLD — leave this one behind';
  on(abandon, 'click', () => {
    if (!armed) {
      armed = true;
      abandon.classList.add('armed');
      abandon.textContent =
        'TAP AGAIN — the map, territories, shrines and everything you bought here stay behind; your relics and perks travel';
      return;
    }
    live.abandon();
  });

  // The developer fold (2026-08-18): both registered flags are testing
  // tools (a raw readout with no console to hand; a way to compare art
  // directions before Gate E was chosen) rather than something a run asks
  // a PLAYER to decide, so they are folded away — the manual's own NUMBERS
  // pattern, restated here as DEVELOPER.
  const rows = FEATURES.map((f) => {
    const row = document.createElement('div');
    row.className = 'flag';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flag-toggle';
    button.disabled = !f.wired;
    // Named for screen readers (2026-08-20): the button's only content is
    // ON/OFF, and the setting's name is an unwired sibling <span>, so every
    // row in SETTINGS announced as "ON, toggle button" — identical to the one
    // above and the one below it. The label element is given an id and
    // pointed at, which names the control without duplicating any text.
    const labelId = `flag-label-${f.id.replace(/[^a-z0-9]/gi, '-')}`;
    button.setAttribute('aria-labelledby', labelId);
    const paint = (): void => {
      const on = isEnabled(features, f.id);
      button.textContent = f.wired ? (on ? 'ON' : 'OFF') : 'NOT BUILT';
      button.setAttribute('aria-pressed', String(on));
    };
    paint();

    if (f.wired) {
      on(button, 'click', () => {
        const next: Partial<Record<FeatureId, boolean>> = {};
        next[f.id] = !isEnabled(features, f.id);
        features = withOverrides(features, next);
        persistFeatures(features);
        paint();

        // The live wires: the theme picker mounts and unmounts in place,
        // and sound flips the same gate the board's ♪ button reads (both
        // 2026-08-20). Everything world-shaped waits for the next run.
        if (f.id === 'ui.themePicker') {
          if (isEnabled(features, f.id)) {
            mountThemePicker(live.themesHost, live.theme, live.facing);
          } else {
            live.themesHost.hidden = true;
            live.themesHost.replaceChildren();
          }
        }
        if (f.id === 'ui.sound') live.syncSound(isEnabled(features, f.id));
      });
    }

    const label = document.createElement('span');
    label.className = 'flag-label';
    label.id = labelId;
    label.textContent = f.label;

    const top = document.createElement('div');
    top.className = 'flag-row';
    top.append(button, label);

    const note = document.createElement('p');
    note.className = 'flag-note';
    note.textContent = f.note;

    row.append(top, note);
    return row;
  });

  // The theme picker itself, and the gallery, live in the ui.themePicker
  // row's own area — "render it inside the flag's own row/area when the
  // flag is on" — rather than a separate section elsewhere. `themesHost`
  // is the SAME node `index.html` declares and `main()` mounts into; it is
  // relocated here, into the fold, the first time SETTINGS paints.
  const galleryLink = document.createElement('a');
  galleryLink.href = '/gallery.html';
  galleryLink.textContent = 'THE GALLERY — every art direction, side by side ▸';

  const themePickerIndex = FEATURES.findIndex((f) => f.id === 'ui.themePicker');
  const flagElements: HTMLElement[] = [];
  rows.forEach((row, i) => {
    flagElements.push(row);
    if (i === themePickerIndex) flagElements.push(live.themesHost, galleryLink);
  });

  const developer = document.createElement('details');
  developer.className = 'help-more';
  const developerSummary = document.createElement('summary');
  developerSummary.textContent = 'DEVELOPER';

  // RESET TEACHING (`ideas/teaching.md`, 2026-08-19): replay the drip on a
  // device that has met everything — the only way Marc's own phone ever sees
  // what a stranger sees. Harmless (it forgets no relics, no perks, only
  // which concepts have been explained), so it needs no arming tap.
  const resetTeaching = document.createElement('button');
  resetTeaching.type = 'button';
  resetTeaching.id = 'reset-teaching';
  resetTeaching.className = 'quiet';
  resetTeaching.textContent = 'RESET TEACHING';
  on(resetTeaching, 'click', () => {
    writeProgress({ ...readProgress(), met: [] });
    flashLabel(resetTeaching, 'TEACHING RESET', 'RESET TEACHING');
  });
  const resetTeachingNote = document.createElement('p');
  resetTeachingNote.className = 'flag-note';
  resetTeachingNote.textContent =
    'Forgets which concepts have been explained — nothing else — so every ' +
    'card and toast fires again from its next moment. It previews the ' +
    'LESSONS a stranger sees, not their game: your shop, perks and known ' +
    'world all stay. The closest true rehearsal is RESET TEACHING, then ' +
    'BEGIN DAILY — the daily plays plain and fully fogged, like their run one.';

  // LAST ERROR (2026-08-19): whatever `showFailure` last caught, readable
  // and selectable here — the report channel for a phone with no console.
  // Absent entirely when nothing has ever broken, which is the good day.
  const errorElements: HTMLElement[] = [];
  try {
    const raw = localStorage.getItem(ERROR_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      const { text, sha, at, count } = parsed as {
        text?: unknown;
        sha?: unknown;
        at?: unknown;
        count?: unknown;
      };
      if (typeof text === 'string' && text.length > 0) {
        const errorHead = document.createElement('p');
        errorHead.className = 'flag-label';
        errorHead.textContent = 'LAST ERROR';
        const errorBody = document.createElement('p');
        errorBody.className = 'flag-note';
        errorBody.style.userSelect = 'text';
        errorBody.style.whiteSpace = 'pre-wrap';
        errorBody.textContent =
          `${typeof sha === 'string' ? `build ${sha}` : ''}` +
          `${typeof at === 'string' ? ` · ${at}` : ''}` +
          `${typeof count === 'number' ? ` · seen ×${count}` : ''}\n${text}`;
        // SEND REPORT (2026-08-26): the same one-tap destination the
        // failure panel has — for an error that was CONTINUEd past in the
        // moment and reconsidered here later. Sends only on the tap.
        const errorSend = document.createElement('button');
        errorSend.type = 'button';
        errorSend.className = 'quiet';
        errorSend.textContent = 'SEND REPORT';
        on(errorSend, 'click', () => {
          errorSend.disabled = true;
          errorSend.textContent = 'SENDING…';
          void sendCrashReport({
            build: typeof sha === 'string' ? sha : __BUILD_SHA__.slice(0, 7),
            mode: 'last error (settings)',
            count: typeof count === 'number' ? count : 1,
            userAgent: navigator.userAgent,
            detail: text,
          }).then((ok) => {
            if (ok) {
              errorSend.textContent = 'SENT — thank you';
            } else {
              errorSend.disabled = false;
              errorSend.textContent = 'NO CONNECTION — try again';
            }
          });
        });
        const errorClear = document.createElement('button');
        errorClear.type = 'button';
        errorClear.id = 'clear-last-error';
        errorClear.className = 'quiet';
        errorClear.textContent = 'CLEAR LAST ERROR';
        on(errorClear, 'click', () => {
          try {
            localStorage.removeItem(ERROR_STORAGE_KEY);
          } catch {
            // Unwritable storage will simply show it again; harmless.
          }
          errorHead.remove();
          errorBody.remove();
          errorSend.remove();
          errorClear.remove();
        });
        errorElements.push(errorHead, errorBody, errorSend, errorClear);
      }
    }
  } catch {
    // A corrupt record is not worth a row.
  }

  developer.append(
    developerSummary,
    ...flagElements,
    resetTeaching,
    resetTeachingNote,
    ...errorElements,
  );

  // A fresh run under whatever the switches now say — the same path as the
  // end screen's button, so it also clears the saved run and drops ?seed and
  // ?ff, leaving the STORED settings to decide what comes next.
  //
  // RESTART, not "NEW RUN with these settings" (Marc, 2026-08-21). Two
  // reasons the shorter word is the better one: it says what the button does
  // to the run you are IN — abandons it and starts over — where "new run"
  // reads like a thing you get when the current one is finished, and it
  // stops colliding with the end screen's own NEW RUN, which is the same
  // action at a moment when it means something different.
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.id = 'new-run';
  restart.textContent = 'RESTART — a fresh run on this world';
  on(restart, 'click', startNewRun);

  // Back to the front door. Not destructive and not arming: the run is saved
  // after every action (and, since Day 2, so is a daily), so this is a pause
  // rather than a forfeit — which is exactly what the label has to promise.
  const toMenu = document.createElement('button');
  toMenu.type = 'button';
  toMenu.id = 'to-main-menu';
  toMenu.textContent = live.mode.kind === 'world' ? 'MAIN MENU' : 'BACK TO YOUR WORLD';
  on(toMenu, 'click', live.mainMenu);

  const toMenuNote = document.createElement('p');
  toMenuNote.className = 'flag-note';
  toMenuNote.textContent =
    live.mode.kind === 'world'
      ? 'Your board is kept — RESUME picks it up exactly where it is.'
      : 'This board is kept too — the door offers it back until you finish it.';

  // The door into SETTINGS (2026-08-25). The switchboard used to be printed
  // under this very panel, so mid-run there was nothing to open; now that it
  // is its own screen, the way in belongs where every other way out of a run
  // already is. Offered in all three modes — SOUND lives behind it, and a
  // daily is exactly when somebody reaches for the mute.
  const toSettings = document.createElement('button');
  toSettings.type = 'button';
  toSettings.id = 'to-settings';
  toSettings.className = 'quiet';
  toSettings.textContent = 'SETTINGS';
  on(toSettings, 'click', () => {
    live.openSettings(toSettings);
  });

  // The MENU tab, in one of two shapes. A detour never sees the atlas, the
  // ledger, the survey or NEW WORLD: none of them are about the game being
  // played, and printing them here is what made the two modes feel like one
  // tangled thing.
  const menuTitle = document.createElement('p');
  menuTitle.className = 'help-title';
  const menuNote = document.createElement('p');
  menuNote.className = 'flag-note';

  const menuParts: HTMLElement[] = [];
  if (live.mode.kind === 'world') {
    menuTitle.textContent = `YOUR WORLD · ${live.slot} OF 3`;
    menuNote.textContent =
      'Your own map, kept between runs. Relics travel to every world; what you buy with them — and every perk you find — stays here.';
    menuParts.push(
      menuTitle,
      menuNote,
      atlasGrid,
      ledger,
      shrineHint,
      perksLine,
      ...(surveyStarted ? [surveyHeading, survey] : []),
      toMenu,
      toMenuNote,
      toSettings,
      restart,
      abandon,
    );
  } else {
    if (live.mode.kind === 'daily') {
      menuTitle.textContent = `THE DAILY · ${live.mode.name}`;
      menuNote.textContent =
        'One world everybody gets today, played plain — no upgrades, no perk, no shrines. Nothing here touches your own world, and nothing it earns is banked.';
      const badge = document.createElement('p');
      badge.className = 'flag-note';
      badge.textContent = live.mode.badge;
      menuParts.push(menuTitle, menuNote, badge, toMenu, toMenuNote, toSettings);
    } else {
      menuTitle.textContent = 'A SHARED RUN';
      menuNote.textContent =
        "Somebody else's world and seed, played plain. Nothing here is kept, and your own world is untouched.";
      menuParts.push(menuTitle, menuNote, toMenu, toMenuNote, toSettings);
    }
  }

  // The CONTROLS swallow their taps — NEW WORLD arms on the first one, and a
  // panel that closed underneath it would make the second tap impossible —
  // but the prose above them does not: tapping what you have finished reading
  // closes the panel, which is the contract every other tab keeps. SETTINGS
  // is in the list for a sharper reason: it opens a panel ON TOP of this one,
  // and a tap that also closed the manual would leave BACK pointing at a
  // dialog that is no longer there.
  for (const control of [toMenu, toSettings, restart, abandon]) {
    on(control, 'click', (event) => {
      event.stopPropagation();
    });
  }
  live.menuHost.replaceChildren(...menuParts);

  // SETTINGS keeps the switches, the privacy note and the developer fold —
  // what the DEVICE does, rather than what this world is. NEW RUN and NEW
  // WORLD moved to MENU above; repeating them here is the intertwining the
  // MENU tab exists to undo.
  // APPEARANCE first, above the intro: it is the only row here a player is
  // likely to have come looking for, and it is the answer to the one complaint
  // the panel has ever had to field ("constrast is very bad", 2026-08-25).
  host.replaceChildren(appearance, intro, privacy, developer);
}

/**
 * How this device wants the game to look.
 *
 * The FIRST setting in the panel that is not a developer switch, and the first
 * that is not behind a flag. There has been a theme picker since Session 2, but
 * it lived behind `?ff=ui.themePicker` — a URL you have to know — because for
 * eleven sessions the directions were CANDIDATES and letting a player pick one
 * would have been letting them decide Gate E. Gate E is decided. What is left is
 * not a vote on the art; it is whether the art is readable on the phone in your
 * hand, and that is a question only the person holding it can answer.
 *
 * Four options, and AUTO is deliberately first and the default. A phone set to
 * light mode, or set to increase contrast, has already answered this question
 * once and should not have to answer it again inside a game — `pickForScheme`
 * reads those two and picks. The other three are for the case the OS gets wrong,
 * which is most cases: the setting is about the room you are in, not the device.
 *
 * The dev picker (`mountThemePicker`) stays where it is, in the DEVELOPER fold,
 * because it does a different job — it offers the PLACEHOLDER and the
 * orientation flip, which are workbench controls and not choices to put in front
 * of anyone.
 */
function buildAppearance(current: Theme): HTMLElement {
  const section = document.createElement('div');
  section.id = 'appearance';

  const label = document.createElement('span');
  label.className = 'flag-label';
  label.textContent = 'APPEARANCE';

  // `chosen` is the STORED value, not the live theme: with AUTO stored, the
  // live theme is whichever one the OS resolved to, and highlighting that one
  // would tell the player they had chosen it. They chose to let the phone
  // decide, and the row has to keep saying so.
  let chosen: string;
  try {
    chosen = localStorage.getItem(THEME_STORAGE_KEY) ?? AUTO_THEME_ID;
  } catch {
    chosen = AUTO_THEME_ID;
  }

  const options: readonly (readonly [string, string])[] = [
    [AUTO_THEME_ID, 'AUTO'],
    [DEFAULT_THEME_ID, 'TORCHLIT'],
    ['torchlit-bright', 'HIGH CONTRAST'],
    ['daylight', 'DAYLIGHT'],
  ];

  const row = document.createElement('div');
  row.id = 'appearance-options';
  row.append(
    ...options.map(([id, text]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      button.textContent = text;
      button.setAttribute('aria-pressed', String(id === chosen));
      on(button, 'click', () => {
        rememberTheme(id);
        // In place since 2026-08-27, and the run survives it exactly as it
        // survived the reload: the board is saved after every action, and the
        // restart re-reads it. `PixiRenderer` still takes its theme in the
        // constructor and holds it `readonly` — so the renderer, its texture
        // caches and its ticker are torn down and rebuilt. That is what the
        // reload was buying, done deliberately and without leaving the page.
        //
        // The route carries no `?theme=`, so writing it back is also what
        // drops a stale one left over from an old shared link — which is the
        // deletion this handler used to have to remember to do itself.
        void restart(currentRoute(), 'replace');
      });
      return button;
    }),
  );

  const note = document.createElement('p');
  note.className = 'flag-note';
  note.textContent =
    current.note +
    ' — AUTO follows this phone’s own light and contrast settings; the other ' +
    'three ignore them. Sticky on this device, and applied on the spot: the ' +
    'run in progress is saved and comes straight back.';
  // "Applied on the spot" became literally true on 2026-08-27 — it used to
  // describe a reload that took a blink and came back to the same board.

  section.append(label, row, note);
  return section;
}

/**
 * Flags and a world's unlocks, folded into the numbers the engine plays with.
 *
 * Both live out here for the same reason: `src/engine/` must stay a pure
 * function of state and tuning, so anything ambient — a switch, a shrine
 * somebody walked to three runs ago — has to become a number before it
 * crosses the line. The manual then describes the result automatically,
 * because it reads the same tuning.
 */
function applyUnlocks(base: Tuning, unlocked: readonly string[]): Tuning {
  let t = base;
  // Treasure is part of the game now rather than a flag or a shrine's gift:
  // a third real choice at a pocket, and the economy Marc has been playing
  // and balancing all along is the one with it in.
  if (unlocked.includes('draft')) t = { ...t, draftWidth: t.draftWidth + 1 };
  if (unlocked.includes('hold')) t = { ...t, holdSlots: t.holdSlots + 1 };
  if (unlocked.includes('luck')) {
    t = { ...t, magicChance: t.magicChance * 2, uniqueChance: t.uniqueChance * 2 };
  }
  if (unlocked.includes('reach')) t = { ...t, beaconHorizon: t.beaconHorizon * 2 };
  return t;
}

/**
 * Open a session, and be visible while doing it.
 *
 * A thin wrapper so `booting` is set the moment the build starts rather than
 * somewhere inside it — an async function cannot hand its own promise to a
 * module variable from within its own body, and the window this closes is
 * exactly the one between the first line and the first await.
 */
export function startSession(route: Route): Promise<Session> {
  const opening = buildSession(route);
  booting = opening;
  void opening
    .catch(() => undefined)
    .then(() => {
      if (booting === opening) booting = null;
    });
  return opening;
}

async function buildSession(route: Route): Promise<Session> {
  // A session's own listeners hang off this, and nothing else does: the
  // previous one has already been aborted by `endSession` before we arrive.
  sessionAbort = new AbortController();
  const features = resolveFeatures();
  // Three world slots (Marc, 2026-08-19): the active one is the game; the
  // door's WORLDS panel switches and begins the others, and a shared link's
  // SETTLE fills an empty one.
  const slot = activeSlot();
  const keys = slotKeys(slot);
  // Before the first `readProgress` anywhere: the shop levels this session
  // reads and writes are THIS world's (2026-08-20's split). Set at the top of
  // every session rather than once per page — this used to say "the active
  // slot cannot change without a reload", which was true right up until
  // switching slot stopped being one (2026-08-27).
  useShopSlot(keys);
  const world = loadWorld(keys);
  // There is a world on this device now — possibly minted a line ago — so it
  // is worth asking the browser not to evict it. Early and unconditional
  // since 2026-08-20: waiting for a home run's first save meant a
  // daily-only player never asked, and neither did anyone who booted and
  // closed the tab.
  askPersistence();

  // Teaching (`ideas/teaching.md`, 2026-08-19): `decodeProgress` already
  // treats a pre-teaching PROGRESS blob as a veteran's, but a device that has
  // finished runs without ever writing progress (no relics banked, nothing
  // found) has no blob to migrate — its world remembers the runs even though
  // its purse never existed. Seed the ledger full for it here, once, so only
  // a genuinely fresh device gets the drip.
  try {
    if (localStorage.getItem(PROGRESS_STORAGE_KEY) === null && world.runs > 0) {
      writeProgress({ ...EMPTY_PROGRESS, met: [...TEACH_IDS] });
    }
  } catch {
    // Private mode. decodeProgress(null) starts the drip, which is the
    // right answer for a device that keeps nothing anyway.
  }

  // The daily (`ideas/daily.md`, built 2026-08-19): `?daily=YYYY-MM-DD`
  // opens that date's shared world, strictly plain, on its own ladder. The
  // shared seed is asked ONCE, like runKeeping's own copy — the URL cannot
  // change mid-session, and re-parsing it five times cost a provably-dead
  // null guard downstream (the simplify pass's find).
  const dailyDate = route.daily;
  const sharedSeed = route.seed;

  // The theme, resolved here rather than where it used to sit (right before
  // `applyTheme` below): `runKeeping`'s own `share` hook renders the share
  // card (WORKPLAN Stage 2, 2026-08-19) and needs the theme that is actually
  // live, not torchlit hand-picked the way the build-time og:image is —
  // `applyTheme` and everything that reads `theme` after this point is
  // unaffected by moving the three lines earlier.
  const facing = resolveFacing();
  const picked = resolveTheme(resolveThemeId());
  // The facing override rides on top of the theme as data, so every consumer —
  // renderer, baked draft cards, layout — sees one consistent orientation.
  const theme: Theme = facing === null ? picked : { ...picked, orientation: facing };

  const keeper = runKeeping(
    world,
    isEnabled(features, 'debug.overlay'),
    dailyDate,
    sharedSeed,
    keys,
    theme,
    slot,
    sessionAbort.signal,
    goHome,
  );
  const resuming = keeper.resume !== null && keeper.resume !== undefined;
  // Resumed run > the daily > shared seed link > THIS DEVICE'S WORLD. The
  // last is P4a: without a link or a run in progress you go back to your own
  // plane, which is what makes the fog memory and territories mean anything.
  const seed =
    keeper.savedSeed ?? (dailyDate !== null ? dailySeed(dailyDate) : sharedSeed) ?? world.worldSeed;
  // Camps (waypoints, built 2026-08-19 — `ideas/waypoints.md`, Marc's
  // anchor: every camp restarts the climb): once the camp shrine is woken, a
  // fresh home-world run may begin at the world's FARTHEST territory — one
  // nullable value, non-null exactly when the front door may offer it.
  // Detours never camp, and a resumed run carries its own wake hex.
  const camp =
    dailyDate === null &&
    sharedSeed === null &&
    !resuming &&
    unlockedBy(world).includes('camp') &&
    world.territories.length > 0
      ? [...world.territories].sort(
          (a, b) => distance(parse(b), { q: 0, r: 0 }) - distance(parse(a), { q: 0, r: 0 }),
        )[0]!
      : null;
  const wakeAt = camp !== null && route.camp ? camp : null;

  // Before anything is drawn: the chrome takes its colours from the same theme
  // the board will, so there is never a frame of placeholder around themed art.
  applyTheme(theme, document.documentElement);

  // The most likely launch-day first click is a link inside somebody's
  // feed — an in-app WebView that quietly keeps nothing. Say so, once.
  if (inAppBrowser()) showInAppNote();

  // The name and the mark, written from one constant so renaming the game is
  // one edit. The icon is an inline SVG data URI: no request, cannot 404.
  document.title = NAME;
  // Replaced, never appended (2026-08-27): this used to run once per page.
  // A session restart would otherwise leave a <link rel=icon> behind on every
  // theme change, the way `applyWebfont` was already careful not to.
  const icon =
    document.getElementById('app-icon') ??
    Object.assign(document.createElement('link'), {
      id: 'app-icon',
      rel: 'icon',
    });
  (icon as HTMLLinkElement).href = ICON_DATA_URI;
  if (!icon.isConnected) document.head.appendChild(icon);

  // The stamp reclaims the bottom third for everyone but the one audience it
  // exists for (Stage 2, 2026-08-18: "bottom-third reclaim") — a build sha,
  // a seed and a feature list on screen at all times was never for a
  // player, it was for testing against prod with no console. `debug.overlay`
  // already gates the in-run readout (`#debugLine`); the footer joins it.
  // The manual's THIS BUILD still names the sha regardless (below), so
  // "which build is this" stays answerable without the flag.
  const stamp = document.getElementById('stamp');
  if (stamp !== null) {
    const debugOverlayOn = isEnabled(features, 'debug.overlay');
    stamp.hidden = !debugOverlayOn;
    if (debugOverlayOn) {
      const on = Object.entries(features)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);
      stamp.textContent = [
        NAME,
        `${__BUILD_SHA__.slice(0, 7)}`,
        `seed ${seed}`,
        theme.id,
        ...(facing === null ? [] : [`hex:${facing}`]),
        ...on,
      ].join(' · ');
    }
  }

  const elements: Elements = {
    board: required('board'),
    stats: required('stats'),
    hint: required('hint'),
    hand: required('hand'),
    draft: required('draft'),
    stash: required('stash'),
    harvestTiles: required<HTMLButtonElement>('harvest-tiles'),
    harvestPoints: required<HTMLButtonElement>('harvest-points'),
    harvestTreasure: required<HTMLButtonElement>('harvest-treasure'),
    harvestBurn: required<HTMLButtonElement>('harvest-burn'),
    spends: required('spends'),
    purse: required('purse'),
    purseToggle: required<HTMLButtonElement>('purse-toggle'),
    actionsMore: required('actions-more'),
    controls: required('controls'),
    end: required('end'),
    cameraToggle: required<HTMLButtonElement>('camera-toggle'),
    lensClear: required<HTMLButtonElement>('lens-clear'),
    help: required<HTMLButtonElement>('help'),
    helpPanel: required('help-panel'),
    helpManual: required('help-manual'),
    helpMenu: required('help-menu'),
    toast: required('toast'),
    eventCard: required('event-card'),
    eventCardGlyph: required('event-card-glyph'),
    eventCardText: required('event-card-text'),
    eventCardRows: required('event-card-rows'),
    eventCardDismiss: required<HTMLButtonElement>('event-card-dismiss'),
  };

  // The front door: static markup, already painted before any of this runs —
  // dismissing it costs nothing because the game underneath has already
  // booted. `game-shell` starts `inert` in the markup so a keyboard user
  // cannot tab into a board they cannot see yet; BEGIN lifts both at once.
  const frontDoor = required('front-door');
  const gameShell = required<HTMLElement>('game-shell');
  const frontDoorLogo = required<HTMLImageElement>('front-door-logo');
  frontDoorLogo.src = ICON_DATA_URI;
  const frontDoorName = required('front-door-name');
  frontDoorName.textContent = NAME;
  required('front-door-tagline').textContent = TAGLINE;

  /**
   * One open/close pair for every panel the door leads to (2026-08-25).
   *
   * `ui/dialog.ts` owns the hard parts already — what a panel covers goes
   * inert, focus goes in and comes back, Escape reaches only the panel on
   * top. This is the handful of DOM lines that sit either side of it, and it
   * is written once because four hand-rolled copies is precisely how the
   * hall of fame ended up with an Escape handler the other three did not
   * have. WORLDS and MORE open over the door; the manual, the hall of fame
   * and SETTINGS open over MORE, which the stack nests without being told.
   */
  const panelDoor = (
    panelId: string,
    backId: string,
  ): {
    readonly panel: HTMLElement;
    readonly open: (opener: HTMLElement | null) => void;
    readonly close: () => void;
  } => {
    const panel = required<HTMLElement>(panelId);
    const close = (): void => {
      if (panel.hidden) return;
      panel.hidden = true;
      closeDialog(panel);
    };
    const backButton = required<HTMLButtonElement>(backId);
    on(backButton, 'click', close);
    return {
      panel,
      close,
      open: (opener: HTMLElement | null): void => {
        panel.hidden = false;
        // `openDialog` BEFORE `focus` (2026-08-25): a panel opened over
        // another one arrives wearing the inert that one put on it, and
        // focus does not land on an inert element. Opening it is what
        // clears that, so focus has to come second.
        openDialog({ panel, covers: siblingsOf(panel), opener, close });
        panel.focus();
      },
    };
  };

  const worldsPanel = panelDoor('worlds-panel', 'worlds-back');
  const morePanel = panelDoor('more-panel', 'more-back');
  const settingsPanel = panelDoor('settings-panel', 'settings-back');
  const famePanelDoor = panelDoor('fame-panel', 'fame-back');

  const frontDoorMore = required<HTMLButtonElement>('front-door-more');
  on(frontDoorMore, 'click', () => {
    morePanel.open(frontDoorMore);
  });

  // What "this device has something on it" means, asked once (2026-08-25).
  // It gated RESET ALL and the two backup buttons through one copy of the
  // expression and the hall of fame through a second, slightly different
  // one — the fame copy left out relics, so a device that had earned some
  // and nothing else was offered a wipe and no museum. One predicate now,
  // and the museum's extra condition (a world with runs) stays where it
  // belongs, at its own button.
  const virginDevice =
    world.runs === 0 &&
    world.revealed.length === 0 &&
    SLOTS.every((s) => s === slot || peekSlot(s) === null) &&
    Object.keys(readDailyBook()).length === 0 &&
    readProgress().relics === 0 &&
    world.perks.length === 0 &&
    // A settled shared world writes a diary tick before any run finishes
    // (fresh-eyes, 2026-08-20) — a device holding one is not virgin.
    readTimeline().length === 0;

  // RESET ALL: the one true wipe — run, world, shop, records, settings, the
  // lot. Everything this game keeps lives under one prefix, so the wipe is
  // enumerated rather than listed and cannot go stale when a key is added.
  // Two taps, the same arming contract ABANDON THIS WORLD keeps.
  const moreReset = required<HTMLButtonElement>('more-reset');
  // A device with nothing to forget gets no wipe (2026-08-20, launch
  // polish): on a virgin phone RESET ALL is a trap. Since 2026-08-25 it is
  // not on the first screen at all — it lives behind MORE ▸ THIS DEVICE —
  // but the guard stays: a heading over three hidden buttons is worse than
  // no heading, and a virgin device has nothing for any of the three to do.
  moreReset.hidden = virginDevice;
  let resetArmed = false;
  on(moreReset, 'click', () => {
    if (!resetArmed) {
      resetArmed = true;
      moreReset.classList.add('armed');
      moreReset.textContent = 'TAP AGAIN — forgets everything on this device';
      return;
    }
    // The wipe runs BETWEEN sessions (2026-08-27): the old one has ended
    // and the new one has not begun, so no keeper is holding keys while they
    // are deleted. A reload used to buy that ordering for free.
    void restart(HOME, 'replace', () => {
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('tiles.')) localStorage.removeItem(key);
        }
      } catch {
        // Storage refused the wipe; the session below still starts clean-ish.
      }
    });
  });

  // BACK UP MY WORLDS / RESTORE A BACKUP (2026-08-21). See `meta/backup.ts`
  // for why this exists at all; the shell's half is storage and the share
  // sheet, which is all this module is allowed to know about.
  //
  // The backup rides the SAME ladder the run share already uses — share
  // sheet, then clipboard, then download — because that ladder is already
  // the answer to "get this off a phone" on every platform this runs on.
  const moreBackup = required<HTMLButtonElement>('more-backup');
  const moreRestore = required<HTMLButtonElement>('more-restore');
  // Offered on the same condition as the wipe: a device with nothing to
  // forget has nothing to keep either. The heading above the three goes with
  // them — an empty THIS DEVICE section reads as something broken.
  moreBackup.hidden = virginDevice;
  moreRestore.hidden = virginDevice;
  required('more-data-title').hidden = virginDevice;

  on(moreBackup, 'click', () => {
    let entries: Record<string, string> = {};
    try {
      for (const key of Object.keys(localStorage)) {
        if (!isOwnKey(key)) continue;
        const value = localStorage.getItem(key);
        if (value !== null) entries[key] = value;
      }
    } catch {
      entries = {};
    }
    if (Object.keys(entries).length === 0) {
      flashLabel(moreBackup, 'NOTHING TO BACK UP', 'BACK UP MY WORLDS');
      return;
    }
    const text = encodeBackup(
      buildBackup(entries, { sha: __BUILD_SHA__.slice(0, 7), at: new Date().toISOString() }),
    );
    const file = `ashwake-backup-${localToday()}.json`;
    void saveBackupFile(file, text).then((how) => {
      // Outcomes revert to the working label; the failure stays, because it
      // is an invitation to the fallback, not a report.
      if (how === 'failed') {
        moreBackup.textContent = 'COULD NOT SAVE — try RESTORE’s box to copy it';
        return;
      }
      flashLabel(
        moreBackup,
        how === 'shared'
          ? 'BACKUP SENT'
          : how === 'copied'
            ? 'BACKUP COPIED — paste it somewhere safe'
            : 'BACKUP SAVED',
        'BACK UP MY WORLDS',
      );
    });
  });

  // Restoring REPLACES, so it confirms — and it shows what it is about to
  // put back BEFORE it does, because "3 worlds · 412 relics · 2026-08-19" is
  // how a player tells their own backup from a stale one.
  let pending: ReturnType<typeof decodeBackup> = null;
  on(moreRestore, 'click', () => {
    if (pending !== null) {
      const plan = restorePlan(pending).write;
      let refused = false;
      // Between sessions, for the reason RESET ALL is: the keeper that owns
      // these keys must be gone before they are replaced under it.
      void restart(HOME, 'replace', () => {
        try {
          for (const key of Object.keys(localStorage)) {
            if (isOwnKey(key)) localStorage.removeItem(key);
          }
          for (const [key, value] of Object.entries(plan)) {
            localStorage.setItem(key, value);
          }
        } catch {
          refused = true;
        }
      }).then(() => {
        if (refused) moreRestore.textContent = 'RESTORE FAILED — storage refused';
      });
      return;
    }
    const pasted = window.prompt(
      'Paste your backup here. This REPLACES everything on this device — worlds, relics, perks and records.',
    );
    if (pasted === null || pasted.trim() === '') return;
    const read = decodeBackup(pasted.trim());
    if (read === null) {
      flashLabel(moreRestore, 'THAT IS NOT A BACKUP', 'RESTORE A BACKUP');
      return;
    }
    pending = read;
    moreRestore.classList.add('armed');
    moreRestore.textContent = `TAP AGAIN — replace this device with ${describeBackup(read)}`;
  });

  const frontDoorBegin = required<HTMLButtonElement>('front-door-begin');
  const moreHelp = required<HTMLButtonElement>('more-help');
  const frontDoorMode = required('front-door-mode');
  const frontDoorDaily = required<HTMLButtonElement>('front-door-daily');
  const frontDoorHome = required<HTMLButtonElement>('front-door-home');

  // The front door is the playstyle MENU (Marc, 2026-08-19: "a proper menu
  // for all playstyles — seed vs real game"): it names which game BEGIN
  // opens — your world, the daily, or somebody else's shared run — and
  // offers the other doors beside it, so a mode is entered on purpose and
  // never by accident of what was in the address bar.
  //
  // Lean since 2026-08-25 (Marc): those doors are BEGIN, WORLDS, DAILY and
  // MORE. What each one leads to did not change; how much of it is shouted
  // at somebody who only wants to play did.
  const today = localToday();
  const frontDoorWorlds = required<HTMLButtonElement>('front-door-worlds');
  const worldsList = required('worlds-list');
  const frontDoorSettle = required<HTMLButtonElement>('front-door-settle');
  on(frontDoorHome, 'click', goHome);

  // Which game the board IS, said on the board itself (Marc, 2026-08-26:
  // "make sure its clear which one is which and which one is the current
  // world"). One quiet line under the stats, on from the first frame — a
  // daily and a home run used to be told apart only by what the ? panel
  // said when asked.
  const modeChip = required('mode-chip');
  modeChip.hidden = false;
  modeChip.textContent =
    dailyDate !== null
      ? `THE DAILY · ${dailyName(dailyDate)} — points only, nothing banks`
      : sharedSeed !== null
        ? 'A SHARED RUN — nothing banks'
        : `WORLD ${slot} OF 3`;

  // THE SHOP, from the door (Marc, 2026-08-26: "a way to access our relic
  // and shop outside the main game") — the same shelf the end screen shows,
  // drawn by the same builder (ui/shop.ts), for the ACTIVE world. Home door
  // only: a daily or shared door must not offer a shop whose currency that
  // mode never banks. Hidden until relics exist to spend or have been met,
  // the end-screen door's own teaching gate.
  const frontDoorShop = required<HTMLButtonElement>('front-door-shop');
  if (dailyDate === null && sharedSeed === null && keeper.shop !== undefined) {
    const shopHook = keeper.shop;
    const shopSheet = panelDoor('shop-panel', 'shop-back');
    const shopTitle = required('shop-title');
    const shopPurse = required('shop-purse-line');
    const shopBody = required('shop-body');
    const doorJustWorn: { id: PerkId | null } = { id: null };
    const paintShopDoor = (): void => {
      const p = shopHook.read();
      frontDoorShop.hidden = !(p.relics > 0 || p.found.length > 0 || p.met.includes('relic'));
      frontDoorShop.textContent = `SHOP — ${p.relics} ${p.relics === 1 ? 'RELIC' : 'RELICS'}`;
    };
    const paintShopPanel = (): void => {
      const p = shopHook.read();
      shopTitle.textContent = `THE SHOP · WORLD ${slot}`;
      shopPurse.textContent = `${p.relics} RELICS`;
      shopBody.replaceChildren(...shopParts(shopHook, paintShopPanel, doorJustWorn));
      paintShopDoor();
    };
    on(frontDoorShop, 'click', () => {
      paintShopPanel();
      shopSheet.open(frontDoorShop);
    });
    paintShopDoor();
  }

  // A daily game left open across midnight — the installed PWA's NORMAL
  // state — used to go on offering YESTERDAY (launch audit, 2026-08-20):
  // the door's date is baked per session. Coming back to a still-open MENU
  // on a new day starts a fresh session, which re-reads `localToday()` and
  // the daily book with it; a run in progress is never touched — the guard
  // is `!frontDoor.hidden` — and it banks under the date it started, which
  // is the Wordle rule.
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible' && !frontDoor.hidden && localToday() !== today) {
        goHome();
      }
    },
    { signal: sessionSignal() },
  );
  if (dailyDate !== null) {
    // A daily in progress says so on its own door (Day 2), the same words the
    // home door uses — resuming is not a new try, and the button must not
    // read BEGIN over a board that is already half played.
    const dailyResume = keeper.resume ?? null;
    frontDoorBegin.textContent =
      dailyResume === null
        ? `BEGIN DAILY ${dailyName(dailyDate)}`
        : `RESUME DAILY ${dailyName(dailyDate)} — PLACEMENT ${dailyResume.placements}`;
    frontDoorMode.hidden = false;
    frontDoorMode.textContent =
      'The daily: one shared world for this date, played plain — no upgrades, no perk. ' +
      'Tries are counted and confessed; your own world is untouched.' +
      (dailyResume === null ? '' : ' Your board is where you left it — this is the same try.');
    frontDoorHome.hidden = false;
  } else if (sharedSeed !== null) {
    frontDoorBegin.textContent = 'BEGIN — SHARED RUN';
    frontDoorMode.hidden = false;
    frontDoorMode.textContent =
      'A shared link: somebody else’s world and seed, played plain. ' +
      'Nothing here is kept; your own world is untouched.';
    frontDoorHome.hidden = false;

    // Continue FROM a seed (Marc, 2026-08-19): a shared world worth keeping
    // can be SETTLED — its geography becomes one of this device's three
    // worlds, fresh and unexplored, played with your own economy from then
    // on. Only the seed travels; the sender's run stays theirs.
    // A virgin active slot (auto-created at boot, never actually played)
    // counts as the empty one — otherwise a brand-new device arriving via a
    // shared link burned slot 1 on a random world nobody chose. The active
    // slot's world is already decoded in scope, and the other slots only
    // need a null check, not a decode of their largest blob (the simplify
    // pass counted five redundant decodes on this boot path).
    const slotEmpty = (s: Slot): boolean => {
      try {
        return localStorage.getItem(slotKeys(s).world) === null;
      } catch {
        return false;
      }
    };
    const emptySlot =
      world.runs === 0 && world.revealed.length === 0 ? slot : SLOTS.find(slotEmpty);
    if (emptySlot !== undefined) {
      frontDoorSettle.hidden = false;
      frontDoorSettle.textContent = `SETTLE THIS WORLD — keep the seed as WORLD ${emptySlot}`;
      on(frontDoorSettle, 'click', () => {
        // The seed settles EXACTLY as played — the old 31-bit mask would
        // have settled a different world than the one just previewed
        // whenever a hand-typed seed was negative.
        //
        // Through the same footprint wipe the end screen's SETTLE uses
        // (2026-08-20): this path called `createWorld` alone, so when the
        // "empty" slot was the VIRGIN ACTIVE one, its saved run and shrine
        // receipt survived into the settled world — and a run whose seed no
        // longer matches its world is the corruption the seed guard in
        // `onChange` now refuses. Clearing is the half that stops it
        // happening at all.
        settleSlot(emptySlot, sharedSeed);
        // The diary's arrival entry, before the navigation that follows —
        // settling is a world-scale moment, not a run, and it happens on a
        // door no run-end hook ever sees.
        appendTimeline({
          at: Date.now(),
          kind: 'world',
          event: 'settled',
          slot: emptySlot,
          worldSeed: sharedSeed,
        });
        setActiveSlot(emptySlot);
        goHome();
      });
    }
  } else {
    // A run already in progress gets named rather than a generic BEGIN — the
    // same fact the end screen states as "RUN N", read here from the state
    // this device is about to resume.
    frontDoorBegin.textContent =
      keeper.resume === null || keeper.resume === undefined
        ? 'BEGIN'
        : `RESUME — PLACEMENT ${keeper.resume.placements}`;
    frontDoorMode.hidden = false;
    // A virgin device has no remembered ground, no shop and nothing
    // carried — the veteran's mode line was a paragraph of things a
    // stranger does not have yet (the audit's words).
    frontDoorMode.textContent =
      world.runs === 0 && world.revealed.length === 0
        ? 'A fresh world, fogged and waiting — your first expedition starts here.'
        : `World ${slot} of 3 — remembered ground, your shop, whatever you carry.`;
    const dailyBook = readDailyBook();
    const streak = dailyStreak(dailyBook, today);
    frontDoorDaily.hidden = false;
    // The way BACK to a daily in progress (Day 2). Saving the board was only
    // half the fix: a reopened PWA lands on its start URL with no `?daily=`,
    // so without this door the resumable run had nowhere to be resumed from.
    // Today's only — an unfinished board from another date is still kept, and
    // still resumes if its own link is opened, but it is not what this button
    // is for.
    // An UNTOUCHED board is not something to resume — opening the daily and
    // backing out must leave the door reading exactly as it did, or the badge
    // (number, best, streak) would vanish for a run nobody has played yet.
    const keptDaily = readDailyRun(today);
    frontDoorDaily.textContent =
      keptDaily === null || keptDaily.placements === 0
        ? dailyBadge(dailyBook, today) + (streak > 1 ? ` · streak ${streak}` : '')
        : `RESUME DAILY ${dailyName(today)} — PLACEMENT ${keptDaily.placements}`;
    on(frontDoorDaily, 'click', () => {
      void restart({ ...HOME, daily: today }, 'push');
    });

    // BEGIN AT CAMP (waypoints, 2026-08-19): the remembered world's missing
    // verb — deep ground you HOLD becomes ground you can start from. Only a
    // fresh run may camp; a run in progress resumes where it was.
    // Inside the WORLDS panel since 2026-08-25 — it is a way INTO this world,
    // which is what that panel is a list of. The one case where it still
    // speaks on the door is the one where it IS the door: `?camp=1` was
    // already asked for, so BEGIN itself is the camp.
    if (camp !== null) {
      const ring = distance(parse(camp), { q: 0, r: 0 });
      const worldsCamp = required<HTMLButtonElement>('worlds-camp');
      if (route.camp) {
        frontDoorBegin.textContent = `BEGIN AT CAMP — ring ${ring}`;
        frontDoorMode.textContent =
          `World ${slot} of 3 — waking at your farthest territory, ${ring} out. ` +
          'The climb starts there; the score measures from where you wake.';
      } else {
        worldsCamp.hidden = false;
        worldsCamp.textContent = `BEGIN AT CAMP — your farthest territory, ring ${ring}`;
        on(worldsCamp, 'click', () => {
          void restart({ ...HOME, camp: true }, 'push');
        });
      }
    }

    // The world slots (Marc, 2026-08-19: "3 save game possibilities";
    // 2026-08-20: "offer all 3 worlds"): all three listed, always. The
    // active one is marked NOW and enters the same run BEGIN does; a
    // settled other switches; an empty one begins there — a switch is a
    // whole new session, the same cheap honesty the theme picker keeps.
    //
    // In their own panel since 2026-08-25, behind one WORLDS button. The
    // list itself is unchanged: three rows, same words, same wiring. What
    // changed is that a door offering ONE world you are already in stopped
    // spending four of its buttons saying so.
    const worldFacts = (w: WorldMemory): string =>
      `${w.runs} ${w.runs === 1 ? 'run' : 'runs'} · best ${w.bestPoints} · ${w.territories.length} held`;
    frontDoorWorlds.hidden = false;
    on(frontDoorWorlds, 'click', () => {
      worldsPanel.open(frontDoorWorlds);
    });
    worldsList.replaceChildren(
      ...SLOTS.map((s) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiet';
        if (s === slot) {
          button.textContent = `WORLD ${s} · NOW — ${world.runs > 0 ? worldFacts(world) : 'untouched'}`;
          // Close the panel before BEGIN fires: BEGIN hides the door and
          // lifts the shell's `inert`, and a dialog still on the stack over
          // a live board is a board you cannot tap.
          on(button, 'click', () => {
            worldsPanel.close();
            frontDoorBegin.click();
          });
        } else {
          const other = peekSlot(s);
          button.textContent =
            other === null ? `WORLD ${s} — begin new` : `WORLD ${s} — ${worldFacts(other)}`;
          on(button, 'click', () => {
            setActiveSlot(s);
            goHome();
          });
        }
        return button;
      }),
    );

    // The hall of fame (Marc, 2026-08-20: "make the button now"; the
    // timeline it grew into was designed the same day through his own
    // prompts — LOG.md Session 31, and ruled always-on for launch the same
    // week). Three tabs: TIMELINE (the diary of runs and crossings, ✦
    // moments folded under their run), DAILY (the diary's daily ticks under
    // the ladder's own line), TOTALS (the original flat ledger, unmoved).
    const fameOpen = required<HTMLButtonElement>('more-fame');
    const fameBody = required('fame-body');
    const fameRow = (cls: string, text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      return p;
    };
    // Escape belongs to the dialog stack (2026-08-21). It was bound to the
    // PANEL, so it only worked while focus was inside it — and since nothing
    // behind was inert, tabbing out of the fame panel put you on the front
    // door's BEGIN with no keyboard way back. Both halves of that are the
    // stack's job, and since 2026-08-25 this panel gets them from the same
    // `panelDoor` helper as WORLDS, MORE and SETTINGS rather than from its
    // own copy of the wiring.
    //
    // A hall of fame with nothing in it stays hidden (the same reasoning
    // that hides RESET ALL): MORE should not offer a museum of nothing. It
    // asks one question more than `virginDevice` does — a world with runs in
    // it has a museum even when nothing else on the device does.
    fameOpen.hidden =
      readTimeline().length === 0 &&
      world.runs === 0 &&
      SLOTS.every((s) => s === slot || peekSlot(s) === null) &&
      Object.keys(readDailyBook()).length === 0 &&
      world.perks.length === 0;

    /** The original flat ledger — the TOTALS tab. */
    const fameTotalsRows = (): HTMLElement[] => {
      const rows: HTMLElement[] = [fameRow('fame-h', 'WORLDS')];
      for (const s of SLOTS) {
        const w = s === slot ? world : peekSlot(s);
        rows.push(
          w === null || w.runs === 0
            ? fameRow('fame-row dim', `World ${s} — untouched`)
            : fameRow(
                'fame-row',
                `World ${s} — ${worldFacts(w)} · ${w.revealed.length} hexes known`,
              ),
        );
      }

      const book = readDailyBook();
      const dates = Object.keys(book);
      rows.push(fameRow('fame-h', 'THE DAILY'));
      if (dates.length === 0) {
        rows.push(fameRow('fame-row dim', 'Never played.'));
      } else {
        const best = Math.max(...dates.map((d) => book[d]!.best));
        const tries = dates.reduce((n, d) => n + book[d]!.tries, 0);
        const streak = dailyStreak(book, today);
        rows.push(
          fameRow(
            'fame-row',
            `${dates.length} ${dates.length === 1 ? 'day' : 'days'} played · best ${best} · ${tries} tries` +
              (streak > 1 ? ` · streak ${streak}` : ''),
          ),
        );
      }

      // PER-WORLD since 2026-08-26: each world's own shelf, under the world
      // that found it — a device-wide list here would be the exact confusion
      // the split exists to end.
      rows.push(fameRow('fame-h', 'PERKS FOUND'));
      let anyPerks = false;
      for (const s of SLOTS) {
        const w = s === slot ? world : peekSlot(s);
        if (w === null || w.perks.length === 0) continue;
        anyPerks = true;
        for (const perk of PERKS.filter((p) => w.perks.includes(p.id))) {
          rows.push(
            fameRow('fame-row', `✦ W${s} · ${perk.name}${w.worn === perk.id ? ' — worn' : ''}`),
          );
        }
      }
      if (!anyPerks) {
        rows.push(fameRow('fame-row dim', 'None yet — hidden finds are out there.'));
      }
      return rows;
    };

    // The diary's date, human-sized: the entry's own epoch ms, shown as the
    // day it happened, with the year only when it is not this one. Display
    // only — the stream's ORDER is the stored array, never the clock.
    const FAME_MONTHS = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ] as const;
    const fameDate = (at: number): string => {
      const d = new Date(at);
      const label = `${FAME_MONTHS[d.getMonth()]} ${d.getDate()}`;
      return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
    };

    /** One ✦ moment in plain words. The run row carries score and reach
     *  already, so the two records name their number outright. */
    const highlightWords = (h: Highlight, e: RunEntry): string => {
      const n = h.n ?? 1;
      switch (h.kind) {
        case 'best-score':
          return `NEW BEST — ${e.score} pts`;
        case 'best-reach':
          return `FARTHEST YET — reach ${e.reach}`;
        case 'shrine':
          return n === 1 ? 'Shrine woken' : `${n} shrines woken`;
        case 'perk':
          return n === 1 ? 'Perk found' : `${n} perks found`;
        case 'goal':
          return n === 1 ? 'Survey goal met' : `${n} survey goals met`;
        case 'territory':
          return n === 1 ? 'Territory claimed' : `${n} territories claimed`;
        case 'camp':
          return 'Began at camp';
      }
    };

    /** One openable diary row: the line, a chevron that says it opens (the
     *  audit: a borderless button reads as prose until someone guesses),
     *  and the fold wired with aria-controls. Shared by both tabs so the
     *  panel has ONE grammar for "tap a row, get the night back". */
    let foldSeq = 0;
    const fameFoldRow = (text: string, children: readonly HTMLElement[]): HTMLElement[] => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'fame-row fame-run';
      const detail = document.createElement('div');
      detail.className = 'fame-detail';
      detail.id = `fame-fold-${foldSeq++}`;
      detail.hidden = true;
      detail.replaceChildren(...children);
      row.setAttribute('aria-controls', detail.id);
      const paint = (open: boolean): void => {
        row.textContent = `${text} ${open ? '▾' : '▸'}`;
        row.setAttribute('aria-expanded', String(open));
      };
      paint(false);
      on(row, 'click', () => {
        const open = detail.hidden;
        detail.hidden = !open;
        paint(open);
      });
      return [row, detail];
    };

    /** The board as that run ended (C9, 2026-08-26): the museum's picture,
     *  where the diary kept one — `capShots` strips it from older rows, and
     *  rows from before it existed never had one, so absence is the normal
     *  case and costs the fold nothing. */
    const fameShot = (d: RunDetail | undefined): HTMLElement[] => {
      if (d?.shot === undefined) return [];
      const img = document.createElement('img');
      img.className = 'fame-shot';
      img.src = d.shot;
      img.alt = 'The board as the run ended';
      img.loading = 'lazy';
      return [img];
    };

    /** The end-screen facts a `RunDetail` holds, as fold rows. The relics
     *  clause is the caller's call: a daily banks nothing, and "N relics
     *  carried out" there would be the fold lying (the same rule the real
     *  end screen keeps with `carriedRelics`). */
    const foldFacts = (d: RunDetail, withRelics: boolean): HTMLElement[] => [
      fameRow(
        'fame-row',
        `${d.placements} placements · ${d.popped} tiles popped in ${d.harvests} ${d.harvests === 1 ? 'pop' : 'pops'}`,
      ),
      ...(d.bigPop > 0
        ? [fameRow('fame-row', `biggest pop ${d.bigPop} at ${Math.round(d.bigPopAt * 100)}%`)]
        : []),
      fameRow(
        'fame-row',
        `${d.claims} destination${d.claims === 1 ? '' : 's'}` +
          (d.quests > 0 ? ` · ${d.quests} bount${d.quests === 1 ? 'y' : 'ies'}` : '') +
          (withRelics && d.relics > 0 ? ` · ${d.relics} relics carried out` : ''),
      ),
    ];

    /** A run's tick (Marc, 2026-08-20: "a way to see the end screen we had
     *  ... a 'full detail' of the run"): the fold is that run's end screen
     *  in miniature. Older ticks open with the facts the diary kept from
     *  birth; `RunDetail` rides on everything written since. */
    const fameRunRow = (e: RunEntry): HTMLElement[] => {
      const text =
        `${fameDate(e.at)} · W${e.slot} · ${e.score} pts · reach ${e.reach}` +
        (e.arc === '' ? '' : ` · ${e.arc}`) +
        (e.highlights.length === 0 ? '' : ` · ✦ ${e.highlights.length}`);
      const d = e.detail;
      return fameFoldRow(text, [
        fameRow('fame-score', `${e.score} pts`),
        ...(d === undefined ? [] : [fameRow('fame-epitaph', d.epitaph)]),
        ...fameShot(d),
        fameRow('fame-row', `REACH ${e.reach} · WORLD ${e.slot} · ${fameDate(e.at)}`),
        ...(e.arc === '' ? [] : [fameRow('fame-arc', e.arc)]),
        ...(d === undefined ? [] : foldFacts(d, true)),
        ...e.highlights.map((h) => fameRow('fame-row', `✦ ${highlightWords(h, e)}`)),
      ]);
    };

    /** A daily tick, the same grammar (fresh-eyes: the DAILY tab's rows
     *  were the one place a tap did nothing). No relics clause — a daily
     *  banks none, by design. */
    const fameDailyRow = (e: DailyEntry): HTMLElement[] => {
      const text =
        `${fameDate(e.at)} · ${dailyName(e.date)} · ${e.score} pts · reach ${e.reach}` +
        (e.arc === '' ? '' : ` · ${e.arc}`) +
        ` · ${ordinal(e.try)} try` +
        (e.best ? ' · NEW BEST' : '');
      const d = e.detail;
      return fameFoldRow(text, [
        fameRow('fame-score', `${e.score} pts`),
        ...(d === undefined ? [] : [fameRow('fame-epitaph', d.epitaph)]),
        ...fameShot(d),
        fameRow(
          'fame-row',
          `DAILY ${dailyName(e.date)} · ${ordinal(e.try)} try${e.best ? ' · NEW BEST' : ''} · ${fameDate(e.at)}`,
        ),
        ...(e.arc === '' ? [] : [fameRow('fame-arc', e.arc)]),
        ...(d === undefined ? [] : foldFacts(d, false)),
      ]);
    };

    /** A world-scale entry: leaving, arriving, or one of the thresholds a
     *  run pushed the world past (F6, 2026-08-26). One line, no fold. */
    const fameWorldRow = (e: WorldEventEntry): HTMLElement => {
      const words = (): string => {
        switch (e.event) {
          case 'crossed':
            return `Crossed on — ${e.n ?? 0} relics carried out`;
          case 'settled':
            return 'Settled a shared world';
          case 'awake':
            return 'The last shrine woken — the world is fully awake';
          case 'surveyed':
            return 'The survey completed';
          case 'all-finds':
            return 'The last hidden find claimed';
        }
      };
      return fameRow('fame-row', `${fameDate(e.at)} · W${e.slot} · ${words()}`);
    };

    /** The TIMELINE tab: prehistory's one sentence, the world filter
     *  chips, and the stream — newest first, in stored order reversed. */
    const fameTimelineTab = (t: readonly TimelineEntry[], pastRuns: number): HTMLElement[] => {
      const els: HTMLElement[] = [];
      if (pastRuns > 0) {
        els.push(
          fameRow(
            'flag-note',
            `${pastRuns} ${pastRuns === 1 ? 'run' : 'runs'} before the record began.`,
          ),
        );
      }

      const list = document.createElement('div');
      const paintStream = (slotFilter: number | null): void => {
        const entries = [...streamOf(t, slotFilter)].reverse();
        list.replaceChildren(
          ...(entries.length === 0
            ? [fameRow('fame-row dim', 'The record begins now — finish a run.')]
            : entries.flatMap((e) => (e.kind === 'run' ? fameRunRow(e) : [fameWorldRow(e)]))),
        );
      };

      const chips = document.createElement('div');
      chips.className = 'fame-chips';
      const chipDefs: readonly { readonly label: string; readonly slot: number | null }[] = [
        { label: 'ALL', slot: null },
        ...SLOTS.map((s) => ({ label: `W${s}`, slot: s })),
      ];
      const chipButtons = chipDefs.map((def, index) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'fame-chip';
        chip.textContent = def.label;
        if (index === 0) chip.dataset['on'] = 'true';
        on(chip, 'click', () => {
          for (const [i, other] of chipButtons.entries()) {
            if (i === index) other.dataset['on'] = 'true';
            else delete other.dataset['on'];
          }
          paintStream(def.slot);
        });
        return chip;
      });
      chips.replaceChildren(...chipButtons);
      paintStream(null);

      els.push(chips, list);
      return els;
    };

    /** The DAILY tab: the ladder's own aggregate line on top (the same
     *  facts TOTALS states), then the diary's daily ticks, newest first. */
    const fameDailyTab = (t: readonly TimelineEntry[], pastTries: number): HTMLElement[] => {
      const els: HTMLElement[] = [];
      const book = readDailyBook();
      const dates = Object.keys(book);
      if (dates.length === 0) {
        els.push(fameRow('fame-row dim', 'Never played.'));
      } else {
        const best = Math.max(...dates.map((d) => book[d]!.best));
        const tries = dates.reduce((n, d) => n + book[d]!.tries, 0);
        const streak = dailyStreak(book, today);
        els.push(
          fameRow(
            'fame-row',
            `${dates.length} ${dates.length === 1 ? 'day' : 'days'} played · best ${best} · ${tries} tries` +
              (streak > 1 ? ` · streak ${streak}` : ''),
          ),
        );
      }
      if (pastTries > 0) {
        els.push(
          fameRow(
            'flag-note',
            `${pastTries} ${pastTries === 1 ? 'try' : 'tries'} before the record began.`,
          ),
        );
      }

      const entries = [...dailiesOf(t)].reverse();
      if (entries.length === 0) {
        els.push(fameRow('fame-row dim', 'No tries since the record began.'));
      } else {
        els.push(...entries.flatMap((e) => fameDailyRow(e)));
      }
      return els;
    };

    on(fameOpen, 'click', () => {
      // The diary and the prehistory it has not lived: the record book's
      // device-wide run count and the daily ladder's summed tries, minus
      // what the timeline already holds — computed live, never stored,
      // which is what the clean start means.
      const t = readTimeline();
      let deviceRuns = 0;
      try {
        deviceRuns = (decodeRecords(localStorage.getItem(BEST_STORAGE_KEY))[ONLY_WORLD] ??
          EMPTY_RECORDS)['runs'];
      } catch {
        // Unreadable records claim no prehistory, which errs quiet.
      }
      const book = readDailyBook();
      const past = prehistory(
        t,
        deviceRuns,
        Object.values(book).reduce((n, r) => n + r.tries, 0),
      );

      // The manual's own tab pattern (`#buildManual`, game.ts) and its own
      // CSS — one vocabulary for "a panel with tabs" in the whole game.
      const tabs = [
        { label: 'TIMELINE', build: (): HTMLElement[] => fameTimelineTab(t, past.runs) },
        { label: 'DAILY', build: (): HTMLElement[] => fameDailyTab(t, past.dailies) },
        { label: 'TOTALS', build: fameTotalsRows },
      ];
      const bar = document.createElement('div');
      bar.className = 'help-tabs';
      const panels = tabs.map((tab, index) => {
        const panel = document.createElement('div');
        panel.hidden = index !== 0;
        panel.replaceChildren(...tab.build());
        return panel;
      });
      const buttons = tabs.map((tab, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'help-tab';
        button.textContent = tab.label;
        if (index === 0) button.dataset['on'] = 'true';
        on(button, 'click', () => {
          for (const [i, panel] of panels.entries()) panel.hidden = i !== index;
          for (const [i, other] of buttons.entries()) {
            if (i === index) other.dataset['on'] = 'true';
            else delete other.dataset['on'];
          }
        });
        return button;
      });
      bar.replaceChildren(...buttons);

      fameBody.replaceChildren(bar, ...panels);
      famePanelDoor.open(fameOpen);
    });
  }
  on(frontDoorBegin, 'click', () => {
    // Nothing may still be covering the game when the game arrives
    // (2026-08-25). WORLDS calls BEGIN through this same handler, and a panel
    // left on the dialog stack would hold `#game-shell` inert — a board you
    // can see and cannot tap. Closing a panel that is not open is a no-op, so
    // this is the whole guard.
    worldsPanel.close();
    morePanel.close();
    frontDoor.hidden = true;
    gameShell.inert = false;
    // Focus follows the door (2026-08-20). Hiding the element that HAD focus
    // drops it to <body>, so every keyboard and switch user restarted their
    // tabbing from the top of the document at the exact moment the game
    // began. The stats row is the first thing in the shell and is already
    // focusable, so it is where the game starts for them.
    // 2026-08-25: that used to focus `.stat`, but script-focusing a
    // `tabindex=0` div matches `:focus-visible`, so every run opened wearing
    // an accent-outline rectangle around TILES until the next tap. `#board`
    // is the same focus sink the event card's close path already lands on
    // (`tabindex="-1"`, exempt from `:focus-visible` styling below).
    elements.board.focus();
    // The arrival toast fires HERE, not at boot (fresh-eyes finding 9): at
    // boot it played its five seconds to the back of the front door, and
    // the shrine receipt — read-and-cleared — was gone unseen.
    game.announceArrival();
  });

  if (isEnabled(features, 'ui.themePicker')) {
    mountThemePicker(required('themes'), theme, facing);
  }

  // The voice (ideas/sound.md, behind ui.sound — off by default): the ♪
  // button in the board chrome and SETTINGS' switch are the same wire
  // (Marc's launch call, 2026-08-20: "a way to toggle on/off easily") —
  // `soundLive` is the truth the hook facade below consults at each moment
  // sound would play, so a flip lands on the very next pop rather than the
  // next load, and both surfaces persist through the one stored flag.
  let soundLive = isEnabled(features, 'ui.sound');
  const soundReal = new Sound(theme.voice);
  const storedFeatures = (): FeatureSet => {
    try {
      return decodeFeatures(localStorage.getItem(FEATURE_STORAGE_KEY));
    } catch {
      return features;
    }
  };
  const soundToggle = required<HTMLButtonElement>('sound-toggle');
  const paintSoundToggle = (): void => {
    soundToggle.setAttribute('aria-pressed', String(soundLive));
    soundToggle.setAttribute(
      'aria-label',
      soundLive ? 'Sound on — tap to mute' : 'Sound off — tap for sound',
    );
    soundToggle.classList.toggle('muted', !soundLive);
  };
  const syncSound = (on: boolean): void => {
    soundLive = on;
    paintSoundToggle();
  };
  paintSoundToggle();
  on(soundToggle, 'click', () => {
    syncSound(!soundLive);
    persistFeatures(withOverrides(storedFeatures(), { 'ui.sound': soundLive }));
    // Hearing IS the feedback: one small bell on enable, silence on mute —
    // and this tap is the user gesture Web Audio wants the context born in.
    if (soundLive) soundReal.pop(1);
  });

  // SETTINGS, and the ? panel's MENU tab with it — mounted here rather than
  // in Game because flags are resolved at this edge and stay out of the
  // engine. Rebuilt every time either panel is opened, from storage rather
  // than from the snapshot this page loaded with: a shrine woken at placement
  // 40 has to show as found the moment you go and look, not after the run
  // ends — and since the board's ♪ button writes the ui.sound flag between
  // opens, the switchboard itself re-reads STORAGE too, not this page's boot
  // snapshot. Its own screen since 2026-08-25; one call still writes both
  // halves, because the MENU tab is built from the same live facts.
  const settingsHost = required('settings-body');
  // The rows are interactive: their taps must not close the panel around
  // them. Wired once per SESSION rather than inside `mountSettings`, which
  // repaints on every `?` and MORE ▸ SETTINGS tap — this is `#settings-body`,
  // markup that outlives every repaint, so wiring it there added one copy
  // per open (2026-08-27).
  on(settingsHost, 'click', (event) => {
    event.stopPropagation();
  });
  const paintSettings = (): void =>
    mountSettings(
      settingsHost,
      storedFeatures(),
      {
        themesHost: required('themes'),
        theme,
        facing,
        world: loadWorld(keys),
        slot,
        abandon: () => {
          // Through the keeper's own dropWorld (fresh-eyes finding 2): the
          // pagehide flush was re-saving up to nine actions of the world
          // this button had just left behind.
          keeper.dropWorld();
          goHome();
        },
        menuHost: required('help-menu'),
        mainMenu: goHome,
        // No repaint on this path: the MENU tab that holds this button was
        // painted by the very `?` open that made it visible, so the body it
        // would rebuild is already current — and rebuilding it would replace
        // the button under the thumb that just tapped it, leaving the dialog
        // stack holding an opener no longer in the document to hand focus
        // back to.
        openSettings: (opener) => {
          settingsPanel.open(opener);
        },
        // Which game the ? panel is describing. Read fresh on every paint,
        // like everything else here, though these three cannot change within
        // one session — the route is what decides them, and a route change
        // starts a new session by definition.
        mode:
          dailyDate !== null
            ? {
                kind: 'daily',
                name: dailyName(dailyDate),
                badge: dailyBadge(readDailyBook(), dailyDate),
              }
            : sharedSeed !== null
              ? { kind: 'shared' }
              : { kind: 'world' },
        syncSound,
      },
      keeper.newRun ??
        (() => {
          void restart(currentRoute(), 'none');
        }),
    );
  paintSettings();
  const helpButton = required('help');
  on(helpButton, 'click', paintSettings);

  // MORE ▸ SETTINGS (2026-08-25). Repainted first, unlike the MENU tab's own
  // button: nothing has painted this body since boot, and LAST ERROR is the
  // one row that can appear between then and now. Safe to repaint here
  // because the button that asked lives on MORE, not inside what is rebuilt.
  const moreSettings = required<HTMLButtonElement>('more-settings');
  on(moreSettings, 'click', () => {
    paintSettings();
    settingsPanel.open(moreSettings);
  });

  const renderer = new PixiRenderer(theme, AssetBook.empty(), prefersReducedMotion());
  await renderer.mount(elements.board);
  markRendererAlive();
  followReducedMotion(renderer);

  // A resumed run plays under the tuning it was saved with, by design —
  // rebalances never re-score a run in progress.
  // Flags and UNLOCKS become TUNING here at the edge and travel no further:
  // the engine sees numbers, never a feature registry and never a world.
  // ONE economy, for everybody (Marc, 2026-08-16: "officialize some decisions
  // and remove some flags so all players play the same game when shared").
  // The tiles-only run stopped being an experiment the day he played it and
  // asked for the roguelite on top; the flag that used to gate it is gone, so
  // a shared seed opens the game its sender was playing rather than whatever
  // the receiver happened to have switched on.
  const base = TUNING;
  const unlocked = applyUnlocks(base, seed === world.worldSeed ? unlockedBy(world) : []);
  // ...and then what the roguelite has bought, which is the last word: a
  // deeper purse, keener odds, richer worlds and whichever perk is worn.
  // A shared `?seed=` link is somebody else's run and plays the plain
  // economy, because a replay scored under this device's upgrades would not
  // be a replay of anything.
  // The daily has no ledger, so its shrines are meaningless doors (Marc,
  // Day 2): the dial rewrites every one into a cache or a site inside
  // `destinationAt`, deterministically per hex, so every phone's daily
  // still agrees. Shared `?seed=` replays keep their shrines — a replay
  // shows the sender's world as it was.
  // A detour banks nothing, so it speaks no relics AT ALL (Marc, 2026-08-26:
  // "completely remove anything relic related or sacrifice related" from the
  // daily — you only optimise points there). Every relic faucet zeroes, which
  // is the dial-form contract: SACRIFICE disappears (it paid only relics —
  // `burnLuck` ships 0), claims stop announcing a currency that never lands,
  // and TITHE has no rate to offer. No points path moves — relics never were
  // one — so a daily score stays comparable phone to phone.
  const noRelics = { burnRelics: 0, claimRelics: 0, luckToRelics: 0, titheRate: 0 };
  const tuning =
    sharedSeed === null && dailyDate === null
      ? applyProgress(unlocked, withWorldPerks(readProgress(), world.perks, world.worn))
      : dailyDate !== null
        ? { ...unlocked, shrinesReborn: true, ...noRelics }
        : { ...unlocked, ...noRelics };
  // Territories (and, since 2026-08-18, finds) the world already holds
  // arrive as plain data — the engine still knows nothing about storage, and
  // a replay is reproducible from seed + tuning + these two lists.
  const held = seed === world.worldSeed ? world.territories : [];
  const heldFinds = seed === world.worldSeed ? world.finds : [];
  // Spent shrines and finds, reborn as this run's caches and sites (Marc,
  // 2026-08-20) — rolled per run count, home world only: a detour has no
  // spent history, and the daily stays strictly plain.
  const rearmed = seed === world.worldSeed ? rearmedSpent(world) : {};
  // The install nudge (2026-08-20, Marc's launch call — "adapt it for iOS
  // players on where to find the option manually"): one quiet line on the
  // end screen, once ever, in the words of THIS platform. iOS has no
  // install prompt at all — the Share sheet is the only door, and nothing
  // on the page ever says so; Android's own banner appears or it doesn't.
  // Absent for anyone already installed, on desktop, or told before.
  const installNudge = ((): {
    readonly note: string;
    readonly shown: () => void;
    readonly promptNow?: () => boolean;
  } | null => {
    try {
      if (localStorage.getItem(INSTALL_NUDGE_KEY) !== null) return null;
    } catch {
      // A storage that keeps nothing would re-nudge every run. Stay quiet.
      return null;
    }
    // An in-app WebView has no install path at all — the iOS share sheet
    // there lacks ADD TO HOME SCREEN, and Android's prompt never fires —
    // so the nudge would be a lie (launch audit). The in-app NOTE below
    // says the useful thing instead.
    if (inAppBrowser()) return null;
    try {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      if (standalone) return null;
    } catch {
      // Unqueryable display mode reads as a browser tab, which nudges.
    }
    const ua = navigator.userAgent;
    // iPadOS 13+ masquerades as a Mac; the touch points give it away.
    const ios = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1);
    if (!ios && !/Android/i.test(ua)) return null;
    return {
      note: ios
        ? `${NAME} can live on your home screen — full screen, works offline. In Safari: tap SHARE (the square with the arrow), then ADD TO HOME SCREEN.`
        : `${NAME} can live on your home screen — full screen, works offline. In your browser's menu: ADD TO HOME SCREEN (or INSTALL APP).`,
      shown: () => {
        try {
          localStorage.setItem(INSTALL_NUDGE_KEY, '1');
        } catch {
          // It will offer again next run. Harmless.
        }
      },
      // Android's captured one-tap prompt, offered as a REAL button where
      // it exists — strictly better than the menu directions it replaces.
      ...(ios
        ? {}
        : {
            promptNow: (): boolean => promptInstall(),
          }),
    };
  })();

  // The game reports through this facade and stays deaf to whether anyone
  // is listening — `soundLive` (above, beside the ♪ button that flips it)
  // decides at each moment sound would play, which is what makes the
  // toggle land mid-run rather than on the next load.
  // The seed a DETOUR just played, or null in your own world — what SETTLE
  // would keep. `seed` has already resolved the daily's date and the link's
  // number by here, and a resumed daily resumes under that same seed, so
  // this is always the geography that was actually on screen.
  const detourSeed = dailyDate !== null || sharedSeed !== null ? seed : null;

  const hooks: GameHooks & { savedSeed: number | null } = {
    ...keeper,
    // Narrower than `detour`, which is also true for the daily: this is
    // true only for an actual `?seed=` link, so the end screen's
    // onward-share invitation never talks about a "link" to a daily player
    // who never followed one.
    fromLink: dailyDate === null && sharedSeed !== null,
    sound: {
      pop: (count: number): void => {
        if (soundLive) soundReal.pop(count);
      },
      claim: (kind: LandmarkReward): void => {
        if (soundLive) soundReal.claim(kind);
      },
      dry: (): void => {
        if (soundLive) soundReal.dry();
      },
    },
    ...(installNudge === null ? {} : { install: installNudge }),
    // The daily's own end-screen voice (2026-08-19): the badge reads the
    // book FRESH — finish() has just moved best and tries — and TRY AGAIN
    // replays the same date. The new session lands on the front door saying
    // BEGIN DAILY #N, which is the menu doing its job, not a detour.
    ...(dailyDate === null
      ? {}
      : {
          daily: {
            label: (): string => dailyBadge(readDailyBook(), dailyDate),
            retry: (): void => {
              // The same date, played again: the route does not move, so
              // nothing is written to history. The new session re-reads the
              // daily book, which is what makes the badge say try N+1.
              void restart(currentRoute(), 'none');
            },
          },
        }),

    // SETTLE, from the end screen (2026-08-20, Marc's own three answers: put
    // it here, let the daily be settled too, allow settling over a full
    // slot). Offered on any detour — a daily's geography is exactly as worth
    // keeping as a shared link's — and never in your own world, which is
    // already settled by definition.
    //
    // `seed` is the one that was actually PLAYED, so what settles is the
    // world just seen: for a daily that is `dailySeed(date)`, for a link the
    // number in the URL, and both arrive here already resolved.
    ...(detourSeed === null
      ? {}
      : {
          settle: {
            slots: () =>
              SLOTS.map((s) => {
                const held = peekSlot(s);
                return {
                  slot: s,
                  // What would be lost, in the atlas's own words — enough to
                  // recognise a world by without opening it. A slot holding a
                  // world nobody has played is free in every sense that
                  // matters, and says so.
                  holds:
                    held === null || (held.runs === 0 && held.revealed.length === 0)
                      ? null
                      : `${held.runs} run${held.runs === 1 ? '' : 's'} · ${Math.round(knownFraction(held) * 100)}% known · best ${held.bestPoints}`,
                };
              }),
            go: (slot: number): void => {
              const target = SLOTS.find((s) => s === slot);
              if (target === undefined) return;
              // Everything the old slot held goes with it — world, run,
              // receipt AND its shop levels — or the new world inherits a
              // build it never earned and a run that belongs to a different
              // geography. Shared with the front door's SETTLE.
              settleSlot(target, detourSeed);
              appendTimeline({
                at: Date.now(),
                kind: 'world',
                event: 'settled',
                slot: target,
                worldSeed: detourSeed,
              });
              setActiveSlot(target);
              goHome();
            },
          },
        }),
  };
  const game = new Game(
    renderer,
    elements,
    seed,
    theme,
    tuning,
    hooks,
    held,
    heldFinds,
    wakeAt,
    rearmed,
  );
  game.start();

  // MORE ▸ HOW TO PLAY — the same dialog the in-game ? opens, so there is
  // exactly one manual rather than two that could drift apart. It opens ON
  // TOP of MORE rather than replacing it, which is what makes the manual's
  // own close land the reader back on the panel they came from.
  on(moreHelp, 'click', () => {
    // START, not MENU (2026-08-20): this is the only tutorial door a stranger
    // ever taps, and MENU took the tab bar's first seat the same day.
    game.openHelp(moreHelp, 'start');
  });
  // A keyboard or screen-reader user should land inside the door and hear
  // its name; the first Tab is BEGIN. The DOOR, not BEGIN itself
  // (2026-08-26): programmatic focus before any interaction matches
  // :focus-visible in Chromium, so focusing the button painted a permanent
  // accent ring around BEGIN on every boot — the same container-focus
  // pattern every panel already uses, for the same reason. Best-effort:
  // some browsers refuse focus during load, and the door is still fully
  // usable by touch either way.
  try {
    required('front-door').focus();
  } catch {
    // Not focusable yet, or focus refused. BEGIN is still one tap away.
  }

  // Art loads AFTER the first playable frame, never before it. Every slot is
  // empty today and the procedural surfaces are a complete board; a bitmap that
  // arrives late simply replaces one, and a bitmap that never arrives costs
  // nothing. The game must never wait on a picture.
  const assetSignal = sessionSignal();
  void AssetBook.load(theme.id)
    .then((assets) => {
      // The manifest can land after this session has ended — a theme switch
      // is exactly the case, since it restarts while a fetch is in flight.
      // Everything below would be drawing into a destroyed renderer.
      if (assetSignal.aborted) return;
      if (assets.size > 0) renderer.useAssets(assets);

      // `ui.logo` (2026-08-19, WORKPLAN Stage 1): a PNG at the slot
      // supersedes the drawn mark-and-name treatment on the front door AND
      // the end screen — one file, both surfaces, checked once here rather
      // than costing either surface its own manifest fetch.
      if (assets.has('ui.logo')) {
        const url = assetPath(theme.id, 'ui.logo');
        frontDoorLogo.src = url;
        frontDoorLogo.alt = NAME;
        frontDoorLogo.classList.add('lockup');
        frontDoorName.hidden = true;
        game.setLogo(url);
      }

      // `ui.runEnd` (2026-08-19, WORKPLAN Stage 2): same drop-target
      // contract, one slot later — a PNG here supersedes the end screen
      // hero's own CSS gradient as its backdrop, checked off this same
      // manifest fetch.
      if (assets.has('ui.runEnd')) {
        game.setRunEndArt(assetPath(theme.id, 'ui.runEnd'));
      }

      // The hand's cards (2026-08-20, the pipeline's fresh-eyes review): the
      // board prefers a terrain slot's PNG the moment it loads, and the
      // card's whole job is to show the tile the board draws — so the cards
      // switch to the same files, off this same fetch. A colour whose slot
      // is empty keeps its procedural bake, the floor everything falls
      // back to.
      const cardArt: Partial<Record<Colour, string>> = {};
      for (const colour of COLOURS) {
        const slot = theme.terrain[colour].asset;
        if (slot !== null && assets.has(slot)) cardArt[colour] = assetPath(theme.id, slot);
      }
      if (Object.keys(cardArt).length > 0) game.setCardArt(cardArt);
    })
    // A manifest that fails to fetch (flaky network, a hostile cache) must
    // not become an unhandled rejection — before 2026-08-19 that was one of
    // the ways the failure panel could fire over a perfectly playable game.
    .catch(() => undefined);

  live = {
    route,
    abort: sessionAbort,
    keeper,
    renderer,
    game,
    sound: soundReal,
  };
  return live;
}
