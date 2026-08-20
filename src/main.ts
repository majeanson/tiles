import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { CROSSING, GOALS } from '@content/goals';
import { distance, parse } from '@engine/hex';
import { reachOf } from '@engine/rules';
import {
  arcSparkline,
  dailyBadge,
  dailyName,
  dailySeed,
  dailyStreak,
  decodeDailyBook,
  encodeDailyBook,
  isPlayableDaily,
  ordinal,
  recordDaily,
  type DailyBook,
} from '@meta/daily';
import { newlyMetGoals } from '@meta/goals';
import {
  decodeFeatures,
  encodeFeatures,
  FEATURES,
  isEnabled,
  parseOverrides,
  withOverrides,
  type FeatureId,
  type FeatureSet,
} from '@meta/features';
import {
  decodeRecords,
  encodeRecords,
  recordRun,
  EMPTY as EMPTY_RECORDS,
  ONLY_WORLD,
  type RecordBook,
} from '@meta/records';
import { ICON_DATA_URI, NAME, TAGLINE } from '@meta/identity';
import {
  EMPTY_PROGRESS,
  PERKS,
  TEACH_IDS,
  applyProgress,
  decodeProgress,
  encodeProgress,
  grantFind,
  type Progress,
} from '@meta/progress';
import { decodeRun, encodeRun } from '@meta/save';
import {
  appendEntry,
  dailiesOf,
  decodeTimeline,
  encodeTimeline,
  prehistory,
  runHighlights,
  streamOf,
  type DailyEntry,
  type Highlight,
  type RunDetail,
  type RunEntry,
  type TimelineEntry,
  type WorldEventEntry,
} from '@meta/timeline';
import {
  decodeWorld,
  encodeWorld,
  knownFraction,
  mergeRun,
  newWorld,
  rearmedSpent,
  rememberRun,
  unlockedBy,
  UNLOCKS,
  type WorldMemory,
} from '@meta/world';
import { AssetBook } from '@render/assets';
import { PixiRenderer } from '@render/PixiRenderer';
import { renderShareCard } from '@render/shareCard';
import { applyTheme } from '@theme/apply';
import { assetPath, DEFAULT_THEME_ID, parseThemeId, resolveTheme, THEMES } from '@theme/index';
import type { Orientation, Theme } from '@theme/tokens';
import type { GameState, LandmarkReward } from '@engine/state';
import { Game, type Elements, type GameHooks } from '@ui/game';
import { epitaphFor } from '@ui/view';
import { Sound } from '@ui/audio';

// v2, 2026-08-14: the endless world became the default. Any device that ever
// visited before has `world.endless: false` explicitly persisted under v1,
// and a stored value beats a changed default by design — so the key moves,
// every device re-derives from the new defaults, and the old entry is left
// to rot. Overrides cost one visit to re-apply; a default that silently
// fails to arrive costs an evening of "but it works on my phone".
const FEATURE_STORAGE_KEY = 'tiles.features.v2';
// v2, 2026-08-15: Gate E opened and torchlit became the default. Any device
// that ever opened the theme picker has an explicit choice persisted under
// v1, and a stored value beats a changed default by design — so a phone that
// tried the picker months ago would have gone on playing the placeholder
// forever, which is exactly what Marc's screenshot showed (cards reading
// GREEN and BLUE instead of MOSS and TIDE). The key moves; the picker still
// works and still sticks, under the new key.
const THEME_STORAGE_KEY = 'tiles.theme.v2';
const HEX_STORAGE_KEY = 'tiles.hex.v1';
/** The run in progress (or just ended), saved after every action. */
const RUN_STORAGE_KEY = 'tiles.run.v1';
/** The world this device explores: seed, revealed ground, territories held. */
const WORLD_STORAGE_KEY = 'tiles.world.v1';
/**
 * The roguelite purse and shelf. Deliberately NOT per world: Marc chose that
 * upgrades carry across every world, so a new world is a fresh map and never
 * a reset. Shrines stay per-world, so a world still has a story of its own.
 */
const PROGRESS_STORAGE_KEY = 'tiles.progress.v1';
/**
 * The record book, per world — runs, best, and the harvest-choice tally that
 * Gate B is measured on. v2: v1 held bare numbers, this holds records.
 */
const BEST_STORAGE_KEY = 'tiles.records.v2';
/**
 * The shrine receipt (2026-08-18): what the world unlocked THIS run, written
 * once when a run ends and read exactly once — on the very next run's first
 * frame — so a shrine woken late in a run (its own toast already shown, live,
 * mid-run) gets named again where a returning player will actually see it:
 * the opening of the run it changed.
 */
const SHRINE_RECEIPT_KEY = 'tiles.shrinereceipt.v1';
/**
 * The last uncaught error, kept so a phone can REPORT it (2026-08-19: Marc
 * hit "lots of please reload errors" on iOS and could say nothing more,
 * because iOS has no console and the old panel showed no detail and nuked
 * the screen). Written by `showFailure`, shown under SETTINGS ▸ DEVELOPER.
 */
const ERROR_STORAGE_KEY = 'tiles.lasterror.v1';
/** The daily ladder: best and tries per date, plus the streak they imply. */
const DAILY_STORAGE_KEY = 'tiles.daily.v1';
/**
 * The hall of fame's diary (designed 2026-08-20 through Marc's own prompts):
 * every finished run a dated tick, milestone runs carrying their ✦ moments,
 * dailies and crossings alongside. Append-only, kept forever, device-wide —
 * and the first thing the hall of fame keeps for itself, breaking the
 * door's "nothing new is kept" birth rule on purpose. Born behind
 * `fame.timeline`; ruled ON for everyone the same week (Marc, launch
 * decision 2026-08-20) — launch day is the only clean epoch the record
 * would ever get, and what predates a device's first tick is stated live
 * from the aggregate stores as prehistory.
 */
const TIMELINE_STORAGE_KEY = 'tiles.timeline.v1';
/**
 * Which of the three world slots is active (Marc, 2026-08-19: "maybe have 3
 * save game possibilities?"). A device keeps up to three worlds — each with
 * its own map, territories, shrines, run-in-progress and shrine receipt —
 * and plays ONE at a time; the front door's menu switches between them.
 * The shop, perks, teaching and records stay device-wide, as ever.
 */
const ACTIVE_SLOT_KEY = 'tiles.slot.v1';
/** The install nudge's once-ever marker (2026-08-20): set the first time the
 *  end screen offers ADD TO HOME SCREEN, so no one is nagged twice. */
const INSTALL_NUDGE_KEY = 'tiles.installnudge.v1';

type Slot = 1 | 2 | 3;
const SLOTS: readonly Slot[] = [1, 2, 3];

/**
 * Chrome's one-tap install offer, caught before it is lost (launch audit,
 * 2026-08-20: the end screen was printing menu directions while the
 * browser held a NATIVE install dialog we were throwing away). Captured at
 * module scope because the event fires before `main` finishes booting.
 */
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };
let installPrompt: InstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
});

/**
 * An in-app browser (Instagram, TikTok, Facebook, Discord…) — the most
 * likely first click on launch day, and the most hostile ground: storage
 * is partitioned or wiped when the host app closes, and iOS's share sheet
 * there has no ADD TO HOME SCREEN, so the install instructions would lie.
 */
const inAppBrowser = (): boolean =>
  /FBAN|FBAV|Instagram|Line\/|TikTok|Twitter|Snapchat|; wv\)/i.test(navigator.userAgent);

/** Every stored thing that belongs to ONE world, keyed by its slot. */
type SlotKeys = { readonly world: string; readonly run: string; readonly receipt: string };

/**
 * Slot 1 keeps the legacy key names on purpose: every device that existed
 * before slots IS slot 1, with no migration and nothing to re-read.
 */
function slotKeys(slot: Slot): SlotKeys {
  return slot === 1
    ? { world: WORLD_STORAGE_KEY, run: RUN_STORAGE_KEY, receipt: SHRINE_RECEIPT_KEY }
    : {
        world: `tiles.world.s${slot}.v1`,
        run: `tiles.run.s${slot}.v1`,
        receipt: `tiles.shrinereceipt.s${slot}.v1`,
      };
}

function activeSlot(): Slot {
  try {
    const stored = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
    return stored === 2 || stored === 3 ? stored : 1;
  } catch {
    return 1;
  }
}

function setActiveSlot(slot: Slot): void {
  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, String(slot));
  } catch {
    // Unwritable storage plays slot 1 forever, which is the old game intact.
  }
}

/** A slot's world as stored, or null where the slot is unsettled. */
function peekSlot(slot: Slot): WorldMemory | null {
  try {
    return decodeWorld(localStorage.getItem(slotKeys(slot).world));
  } catch {
    return null;
  }
}

/** Today, as the LOCAL date string the daily is named after (Marc's Wordle
 *  rule, `ideas/daily.md`: the ritual is "new one when I wake up"). */
function localToday(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `?camp=1`: begin the next fresh run at the world's farthest territory —
 *  set by the front door's BEGIN AT CAMP button, honoured only when the
 *  camp shrine is woken and a territory exists to wake at. */
function askedCamp(): boolean {
  return new URLSearchParams(location.search).get('camp') === '1';
}

/** `?daily=YYYY-MM-DD`, validated — garbage in the URL is not a daily
 *  (`isPlayableDaily` owns the shape AND the epoch rule). */
function askedDaily(): string | null {
  const asked = new URLSearchParams(location.search).get('daily');
  return asked !== null && isPlayableDaily(asked) ? asked : null;
}

function readDailyBook(): DailyBook {
  try {
    return decodeDailyBook(localStorage.getItem(DAILY_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeDailyBook(book: DailyBook): void {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, encodeDailyBook(book));
  } catch {
    // Private mode: the daily still plays, the ladder just is not kept.
  }
}

function readTimeline(): readonly TimelineEntry[] {
  try {
    return decodeTimeline(localStorage.getItem(TIMELINE_STORAGE_KEY));
  } catch {
    return [];
  }
}

/**
 * The run's end screen, kept for the diary (Marc, 2026-08-20: "a 'full
 * detail' of the run" behind every hall-of-fame row). Mirrors
 * `summariseRun` (ui/view.ts) fact for fact — same counting, same epitaph
 * function — so a reopened row says what the screen said that night.
 */
function runDetailOf(state: GameState): RunDetail {
  let bigPop = 0;
  let bigAt = 0;
  for (const h of state.log.harvests) {
    if (h.points > bigPop) {
      bigPop = h.points;
      bigAt = h.at;
    }
  }
  let claims = 0;
  for (const cell of Object.values(state.cells)) {
    if (cell.kind === 'landmark' && cell.claimed) claims++;
  }
  return {
    placements: state.placements,
    harvests: state.log.harvests.length,
    popped: state.log.popped,
    bigPop,
    bigPopAt: state.placements === 0 ? 0 : bigAt / state.placements,
    claims,
    quests: state.log.questsDone,
    relics: state.relics,
    epitaph: epitaphFor(state),
  };
}

/** One entry onto the diary's end. A diary that cannot be written is still
 *  a run that happened — never fatal, never blocks the end screen. */
function appendTimeline(entry: TimelineEntry): void {
  try {
    localStorage.setItem(TIMELINE_STORAGE_KEY, encodeTimeline(appendEntry(readTimeline(), entry)));
  } catch {
    // Storage full or forbidden: this tick goes unkept, the run does not.
  }
}

/**
 * Flags are resolved once, here at the edge, and passed downward as data. The
 * URL override wins over storage so a system can be flipped from the address
 * bar on a phone — which is the only debugging surface that exists when testing
 * against the deployed site.
 *
 * The resolved set is written BACK to storage, so an override sticks: visit
 * `?ff=ui.themePicker` once and the picker is simply there from then on, until
 * `?ff=-ui.themePicker` takes it away. One link makes a phone a test device.
 */
function persistFeatures(set: FeatureSet): void {
  try {
    localStorage.setItem(FEATURE_STORAGE_KEY, encodeFeatures(set));
  } catch {
    // Private mode, or storage disabled. Nothing to do, nothing worth saying.
  }
}

function resolveFeatures(): FeatureSet {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(FEATURE_STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. Defaults are a fine game.
  }
  const resolved = withOverrides(decodeFeatures(stored), parseOverrides(location.search));
  persistFeatures(resolved);
  return resolved;
}

/**
 * `?hex=flat` / `?hex=pointy` overrides the active theme's facing; `?hex=auto`
 * hands the decision back to the theme. Sticky, like the theme choice, and for
 * the same reason: prompt.md Q2 is decided by LOOKING, on a phone, and both
 * facings have to be one tap away from any theme for that comparison to happen.
 */
function resolveFacing(): Orientation | null {
  const asked = new URLSearchParams(location.search).get('hex');
  try {
    if (asked === 'flat' || asked === 'pointy') {
      localStorage.setItem(HEX_STORAGE_KEY, asked);
      return asked;
    }
    if (asked === 'auto') {
      localStorage.removeItem(HEX_STORAGE_KEY);
      return null;
    }
    const stored = localStorage.getItem(HEX_STORAGE_KEY);
    return stored === 'flat' || stored === 'pointy' ? stored : null;
  } catch {
    return asked === 'flat' || asked === 'pointy' ? asked : null;
  }
}

/**
 * `?theme=torchlit` beats what you picked last time, which beats the default.
 *
 * Same shape as the feature flags and for the same reason: the art direction is
 * not settled, the test environment is a phone against production, and the
 * address bar is the console. A link to a specific direction is a thing you can
 * send someone.
 */
function resolveThemeId(): string {
  const asked = parseThemeId(location.search);
  if (asked !== null) return asked;

  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

/**
 * The roguelite progress, read fresh every time rather than cached.
 *
 * The shop is rendered on the end screen and buying redraws it, so a stale
 * copy here would show a purse that had already been spent. Storage is cheap;
 * a lie about how many relics you have is not.
 */
/**
 * Memoized on the RAW string, not on time: the teaching gates read progress
 * several times per ACTION render now (the LUCK stat, the purse fold, the
 * glow check — camera moves never re-run the HUD, so this is per tap, not
 * per frame). Decoding the same JSON a handful of times per tap is small,
 * but it is also free to not do. The freshness contract survives whole: the
 * stored string is re-read every call, so any write anywhere invalidates
 * the cache by value.
 */
let progressCache: { raw: string | null; decoded: Progress } | null = null;

function readProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (progressCache !== null && progressCache.raw === raw) return progressCache.decoded;
    const decoded = decodeProgress(raw);
    progressCache = { raw, decoded };
    return decoded;
  } catch {
    return EMPTY_PROGRESS;
  }
}

function writeProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, encodeProgress(progress));
  } catch {
    // Private mode. The run still plays; it just never compounds.
  }
}

/** Bank what a finished run carried out, once, at the moment it ends. */
function bankRelics(state: GameState): void {
  if (state.relics <= 0) return;
  const progress = readProgress();
  writeProgress({ ...progress, relics: progress.relics + state.relics });
}

/**
 * Read the shrine receipt back, and clear it — it is read exactly once, on
 * the run it was written for. A device that never woke a shrine, or already
 * read the receipt, gets an empty list, which is silent rather than wrong.
 */
function readShrineReceipt(keys: SlotKeys): readonly string[] {
  try {
    const raw = localStorage.getItem(keys.receipt);
    if (raw === null) return [];
    localStorage.removeItem(keys.receipt);
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((s) => typeof s === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function writeShrineReceipt(keys: SlotKeys, labels: readonly string[]): void {
  if (labels.length === 0) return;
  try {
    localStorage.setItem(keys.receipt, JSON.stringify(labels));
  } catch {
    // Best effort — the receipt is a nicety on top of a shrine's own live
    // toast, not the only place the unlock is ever named.
  }
}

function rememberTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Nothing to do and nothing worth telling the player about.
  }
}

/**
 * `?seed=123` replays an exact run.
 *
 * The engine is deterministic precisely so that "it did something odd on my
 * phone" can become "run this seed", and that is worth nothing unless the seed
 * can be set from the address bar and read back off the screen. An EXPLICIT
 * seed also outranks a saved run — a shared seed link must open that run.
 */
function askedSeed(): number | null {
  const asked = new URLSearchParams(location.search).get('seed');
  if (asked === null) return null;
  const parsed = Number(asked);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * The world this device plays (P4a): rolled once, kept, and abandonable.
 *
 * `?seed=` still means "replay this exact run", which deliberately bypasses
 * the world — a shared link must show the sender's run, not the receiver's
 * geography.
 */
function loadWorld(keys: SlotKeys): WorldMemory {
  try {
    const stored = decodeWorld(localStorage.getItem(keys.world));
    if (stored !== null) return stored;
  } catch {
    // Private mode: every visit is a new world, which is a fine game too.
  }
  const world = newWorld(Date.now() & 0x7fffffff);
  saveWorld(keys, world);
  return world;
}

function saveWorld(keys: SlotKeys, world: WorldMemory): void {
  try {
    localStorage.setItem(keys.world, encodeWorld(world));
  } catch {
    // Unwritable memory is a world you rediscover each time. Still playable.
  }
}

/**
 * The run keeper: resume, autosave, records, world memory, and the one way to
 * start over. All of it lives here at the edge — the game reports through
 * hooks and never learns storage exists, the same split as the feature flags.
 */
function runKeeping(
  world: WorldMemory,
  debugOn: boolean,
  dailyDate: string | null,
  keys: SlotKeys,
  // The theme actually live (2026-08-19, WORKPLAN Stage 2): `share` below
  // renders the share card against it, the same theme the screen the card
  // is a picture OF was drawn in.
  theme: Theme,
  // The timeline (Session 31): which slot this run's tick belongs to. The
  // diary always records (launch ruling, 2026-08-20 — the flag it was born
  // behind died the same week it was born).
  slot: Slot,
): GameHooks & { savedSeed: number | null; dropWorld: () => void } {
  // Asked once: the URL cannot change mid-session without a reload, and this
  // used to construct fresh URLSearchParams three times per action across
  // the hooks below.
  const replaySeed = askedSeed();
  // The perk shelf as this page booted, for the timeline's ✦ diff at finish
  // — perks are device-wide (`Progress`), so the world diff cannot see them.
  const perksAtBoot = readProgress().found.length;
  // A detour: somebody else's seed, or the daily. Neither is this device's
  // world — nothing banks, nothing merges, nothing overwrites the home run.
  const detour = replaySeed !== null || dailyDate !== null;

  let saved = null;
  try {
    saved = detour ? null : decodeRun(localStorage.getItem(keys.run));
  } catch {
    // Private mode. Every run is its own life; that is also a game.
  }

  // The world as it stands right now, kept current between actions so the
  // atlas and the next merge both read the truth rather than the snapshot
  // this page happened to load with.
  let current = world;

  // The world write, debounced. `mergeRun` walks every cell and `saveWorld`
  // stringifies every revealed key, and both used to run on EVERY tap of a
  // run whose board only grows. Two facts make it safe to do less: the world
  // only changes when the run reveals ground (the cell count only ever
  // grows) or claims a landmark, so anything else has nothing to merge; and
  // localStorage is the slow half, so the in-memory `current` stays exact
  // per merge while the WRITE coalesces to every tenth action — with a flush
  // on pagehide/visibilitychange and at finish, so closing the tab mid-run
  // can never lose a claim. That flush is the load-bearing part.
  const WORLD_WRITE_EVERY = 10;
  let mergedCells = 0;
  let mergedClaims = 0;
  let actionsSinceWrite = 0;
  let worldDirty = false;
  const flushWorld = (): void => {
    if (!worldDirty) return;
    worldDirty = false;
    actionsSinceWrite = 0;
    saveWorld(keys, current);
  };
  window.addEventListener('pagehide', flushWorld);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushWorld();
  });

  // Asked once, after the first run save has actually succeeded — persistent
  // storage is what stops iOS treating the world as evictable cache after a
  // week of not playing. Best-effort by contract: some browsers prompt, some
  // silently refuse, some lack the API, and the game is identical in every
  // case, so nothing is awaited and nothing can throw past here.
  let persistenceAsked = false;
  const askPersistence = (): void => {
    if (persistenceAsked) return;
    persistenceAsked = true;
    try {
      if (typeof navigator.storage?.persist === 'function') {
        void navigator.storage.persist().catch(() => undefined);
      }
    } catch {
      // A browser that objects to being asked. The save already worked.
    }
  };

  /**
   * Leave the active world behind, for BOTH doors that do it (the crossing
   * and SETTINGS' NEW WORLD). The load-bearing line is the first one: the
   * fresh-eyes review (2026-08-19) found that navigating away fires
   * `pagehide`, and the flush re-saved a dirty world AFTER its own funeral —
   * which un-crossed every crossing and made the dowry an infinite relic
   * farm (claim shrine, cross, land in the same world, repeat).
   */
  const dropWorld = (): void => {
    worldDirty = false;
    try {
      localStorage.removeItem(keys.world);
      localStorage.removeItem(keys.run);
      localStorage.removeItem(keys.receipt);
    } catch {
      // A storage that refuses the wipe reloads into the old world — with
      // anything already banked kept, which errs kind.
    }
  };

  return {
    resume: saved,
    savedSeed: saved?.rootSeed ?? null,
    dropWorld,
    // A detour starts fully dark (Marc, 2026-08-20: "all dailies should
    // start fogged completely"). The write side was always guarded — a
    // detour never merges into this world's memory — but the READ side
    // passed the home world's revealed keys unconditionally, so a daily
    // (or somebody else's `?seed=`) drew YOUR fog ghost over a world with
    // different geography under it. Same guard as every hook below: a
    // detour is not this device's world, in either direction.
    memory: detour ? [] : world.revealed,

    shop: {
      read: readProgress,
      write: writeProgress,
    },
    debug: debugOn,
    // The manual's own no-staleness contract: moving the stamp behind
    // debug.overlay must not make "which build is this" unanswerable
    // without the flag, so THIS BUILD (game.ts) states the sha directly.
    buildSha: __BUILD_SHA__.slice(0, 7),

    // A `?seed=` replay is somebody else's world, and a daily is nobody's:
    // every start-of-run moment that speaks about THIS world stays quiet.
    replay: detour,
    // Read once, right here — before the game this receipt is FOR has even
    // been constructed — and cleared the moment it is read, so a shrine
    // named on this run's first frame is never named again on the next.
    shrineReceipt: detour ? [] : readShrineReceipt(keys),

    // A hidden find, claimed: grant one unowned perk, write it down, hand
    // back the name for the toast. Deterministic in (world, hex) — no roll to
    // farm within a run — and guarded two ways: a `?seed=` replay is
    // somebody else's walk and must not fill this device's shelf, and a hex
    // this WORLD has already claimed (`current.finds`, 2026-08-18) must not
    // grant a second time on a later run. Without the second guard the same
    // hex could be walked to again after other finds changed which perks are
    // still unowned, and `grantFind`'s pick shifts with that set — a farm the
    // engine's own "already claimed" cannot see, because the grant lives out
    // here.
    findLabel: (hex) => {
      if (detour) return null;
      if (current.finds.includes(hex)) return null;
      const granted = grantFind(readProgress(), world.worldSeed, hex);
      if (granted === null) return null;
      writeProgress(granted.progress);
      return granted.perk.name;
    },

    // The survey (2026-08-18): five world-scale goals, each paying relics
    // ONCE per world. Called after every action's own `onChange` above has
    // already merged the world, so `current` is fresh — reach, territories
    // and known% all read the same live facts the atlas does. A replay is
    // somebody else's world and must neither pay nor mark anything met.
    checkGoals: () => {
      if (detour) return null;
      const progress = readProgress();
      const newly = newlyMetGoals(current, progress);
      if (newly.length === 0) return null;

      const met = newly
        .map((id) => GOALS.find((g) => g.id === id))
        .filter((g): g is (typeof GOALS)[number] => g !== undefined);
      const reward = met.reduce((n, g) => n + g.reward, 0);
      writeProgress({ ...progress, relics: progress.relics + reward });

      // Met goals are a world fact, so they are written and saved immediately
      // rather than riding the merge's own debounce — a goal is met at most a
      // handful of times in a world's whole life, so there is no cost to
      // treating it with the same urgency a claim already gets.
      current = { ...current, goalsMet: [...current.goalsMet, ...newly] };
      worldDirty = false;
      actionsSinceWrite = 0;
      saveWorld(keys, current);

      return `${met.map((g) => g.label).join('; ')} (+${reward} relics)`;
    },

    // Everything a DETOUR does not get, as one list (the simplify pass:
    // three separate conditional spreads made "what does a detour disable?"
    // a six-site hunt in two idioms — the guards inside findLabel/checkGoals/
    // onChange are the sites that must also SAY something):
    //
    // - unlockLabel: a daily shrine must not narrate the HOME world's next
    //   unlock (or "fully awake") when nothing records anywhere — absent,
    //   the game gives detour shrines their own honest line.
    // - worldStats: a daily's REACH must not read "best 18" from a home
    //   world it is not being played on.
    // - crossing: a detour has no world of this device's to leave.
    ...(detour
      ? {}
      : {
          unlockLabel: (nth: number) => UNLOCKS[world.shrines.length + nth]?.label ?? null,

          worldStats: () => ({
            territories: current.territories.length,
            knownPct: knownFraction(current),
            farthestReach: current.farthestReach,
          }),

          // The crossing (Marc, 2026-08-19): a fully-awake world's shrines
          // offer the way onward. Shell-owned whole, because leaving a world
          // outlives any run — and priced in ONE place, so the card's offer
          // and the banked amount are the same number by construction.
          crossing: (() => {
            const dowryOf = (): number =>
              CROSSING.baseRelics + current.territories.length * CROSSING.relicsPerTerritory;
            return {
              dowry: dowryOf,
              cross: () => {
                const dowry = dowryOf();
                // The diary's entry FIRST, synchronously, before the world
                // it names is dropped and the page navigates — a crossing
                // that outran its own record would leave no trace of the
                // world it closed.
                appendTimeline({
                  at: Date.now(),
                  kind: 'world',
                  event: 'crossed',
                  slot,
                  worldSeed: world.worldSeed,
                  n: dowry,
                });
                const progress = readProgress();
                writeProgress({ ...progress, relics: progress.relics + dowry });
                dropWorld();
                location.href = new URL(location.pathname, location.href).toString();
              },
            };
          })(),
        }),

    onChange: (state) => {
      // Detours never touch the home save: before 2026-08-19 this write was
      // unconditional, so playing somebody's `?seed=` link OVERWROTE the run
      // in progress and an abandoned replay could be resumed as your own —
      // exactly what `ideas/daily.md`'s scouting note believed was already
      // guarded. The daily depends on the guard, so now it exists.
      if (detour) return;
      try {
        localStorage.setItem(keys.run, encodeRun(state));
        askPersistence();
      } catch {
        // Storage full or forbidden. The run is the one thing that cannot
        // be regenerated, so other stores are shed to make room — cheapest
        // loss first (reordered 2026-08-20: the old fallback went straight
        // for the world, whose shrines and territories never regrow, while
        // the diary and the daily ladder — records ABOUT play, and the two
        // stores that actually grow without bound — were never touched).
        // The world goes last, and the player is told what happened.
        // The daily book left this ladder on the same day's fresh-eyes pass:
        // it is ~30 bytes a DAY (a year of play ≈ 11KB), the only
        // unrecoverable record on the device (per-date bests, the streak),
        // and shedding it never freed enough to matter. The two stores that
        // actually grow — the diary, then the world's revealed keys — are
        // the ladder.
        const shed: readonly (() => void)[] = [
          () => localStorage.removeItem(TIMELINE_STORAGE_KEY),
          () => localStorage.removeItem(keys.world),
        ];
        for (const drop of shed) {
          try {
            drop();
            localStorage.setItem(keys.run, encodeRun(state));
            askPersistence();
            showStorageNote();
            break;
          } catch {
            // Still full — shed the next thing. (Private mode throws on
            // every attempt and falls through silent: every run its own
            // life, exactly as before.)
          }
        }
      }
      // The world learns as the run happens, not only when it ends. Ground
      // seen, territories taken and shrines woken are facts the moment they
      // occur: waiting for the end of the expedition meant the atlas said
      // "0 of 5 found" while the popup was still announcing a shrine, and it
      // meant closing the tab lost a claim outright. The merge is skipped
      // when neither ground nor claims moved (one cheap counting pass — a
      // pop or a reselect reveals nothing), and the write itself is
      // debounced; see `flushWorld` above for why nothing can be lost.
      if (replaySeed === null) {
        const cells = Object.values(state.cells);
        let claims = 0;
        for (const cell of cells) {
          if (cell.kind === 'landmark' && cell.claimed) claims++;
        }
        if (cells.length > mergedCells || claims > mergedClaims) {
          mergedCells = cells.length;
          mergedClaims = claims;
          current = mergeRun(current, state);
          worldDirty = true;
        }
        if (worldDirty && ++actionsSinceWrite >= WORLD_WRITE_EVERY) flushWorld();
      }
    },

    finish: (state) => {
      // The daily lives on its own ladder (`ideas/daily.md`): tries counted
      // and confessed, best kept per date, and NOTHING of the home economy
      // touched — a daily run can earn relics in play, and banking them
      // would make the plain shared game a meta farm. The end screen's
      // RUN N / best lines read naturally as try N / today's best.
      if (dailyDate !== null) {
        const result = recordDaily(readDailyBook(), dailyDate, state.points);
        writeDailyBook(result.book);
        // The diary's daily tick — same store as the home runs, its own tab
        // when read. Rides the same once-per-ended-transition guarantee the
        // ladder write above does.
        appendTimeline({
          at: Date.now(),
          kind: 'daily',
          date: dailyDate,
          score: state.points,
          reach: reachOf(state),
          arc: arcSparkline(state.log.harvests),
          try: result.record.tries,
          best: result.isNewBest,
          detail: runDetailOf(state),
        });
        return {
          runs: result.record.tries,
          best: result.record.best,
          isNewBest: result.isNewBest,
          previousBest: result.previousBest,
        };
      }

      // A `?seed=` replay is somebody else's run: nothing banks and nothing
      // records — the book is READ so the end screen can still say where
      // this device's standing best sits, but a replayed score never writes
      // it. (Before 2026-08-19 a replay recorded into the home book.)
      if (replaySeed !== null) {
        let standing: RecordBook;
        try {
          standing = decodeRecords(localStorage.getItem(BEST_STORAGE_KEY));
        } catch {
          standing = {};
        }
        const held = standing[ONLY_WORLD] ?? EMPTY_RECORDS;
        return {
          runs: held.runs,
          best: held.bestPoints,
          isNewBest: false,
          previousBest: held.bestPoints,
        };
      }

      // Relics bank before anything else reads the purse: the shop renders
      // on this very screen, and a shop that opened before the run it is
      // paid for had been counted would be showing yesterday's money.
      if (replaySeed === null) bankRelics(state);

      // The world remembers first: ground seen and territories held outlive
      // the run that found them, which is the whole of P4a. A replayed link
      // (`?seed=`) is somebody else's geography and must not touch it.
      // `rememberRun` folds the FULL final state, so this write is also the
      // debounce's flush — nothing the merge skipped can be missing from it.
      if (replaySeed === null) {
        current = rememberRun(current, state);
        worldDirty = false;
        actionsSinceWrite = 0;
        saveWorld(keys, current);

        // The shrine receipt: this run's own shrine-woken toast already fired
        // live, mid-run — this is what makes it legible again on the NEXT
        // run's opening frame, which is when a returning player is actually
        // looking. `world.shrines.length` is this run's OWN starting count
        // (the closure captured it before a single action happened), so the
        // gap is exactly what THIS run woke.
        if (current.shrines.length > world.shrines.length) {
          writeShrineReceipt(
            keys,
            UNLOCKS.slice(world.shrines.length, current.shrines.length).map((u) => u.label),
          );
        }
      }

      let book: RecordBook;
      try {
        book = decodeRecords(localStorage.getItem(BEST_STORAGE_KEY));
      } catch {
        book = {};
      }
      const before = book[ONLY_WORLD] ?? EMPTY_RECORDS;
      const after = recordRun(book, state);
      try {
        localStorage.setItem(BEST_STORAGE_KEY, encodeRecords(after));
      } catch {
        // A record that cannot be written is still a run that happened.
      }

      // The diary's tick (Session 31), in the same synchronous block as the
      // record write above and the run removal below — so it inherits the
      // exactly-once shape the 2026-08-18 double-bank fix bought: `finish`
      // fires once per ended transition, and a reload on the end screen
      // finds no run to resume and re-finish. The ✦ diff reads the world
      // this PAGE booted with against the world the run ended with (a run
      // resumed across a reload will not badge its pre-reload moments; the
      // facts themselves are safe in WorldMemory).
      appendTimeline({
        at: Date.now(),
        kind: 'run',
        slot,
        worldSeed: world.worldSeed,
        score: state.points,
        reach: reachOf(state),
        arc: arcSparkline(state.log.harvests),
        highlights: runHighlights(world, current, {
          points: state.points,
          perksBefore: perksAtBoot,
          perksAfter: readProgress().found.length,
          campStart: state.wakeAt !== null,
        }),
        detail: runDetailOf(state),
      });

      // The finished run leaves storage HERE, not on NEW RUN: an ended run
      // that stayed saved was resumed on every reload, and each resume banked
      // its relics and counted it again — an infinitely repeatable double
      // count found on 2026-08-18. The run is recorded; keeping its corpse
      // around bought nothing but the bug.
      try {
        localStorage.removeItem(keys.run);
      } catch {
        // Unwritable storage cannot double-bank either: the same failure that
        // kept the run from being saved keeps it from being resumed.
      }

      const now = after[ONLY_WORLD] ?? EMPTY_RECORDS;
      return {
        runs: now.runs,
        best: now.bestPoints,
        isNewBest: state.points > before.bestPoints && state.points > 0,
        // The arc chart's ghost baseline: the standing best BEFORE this run
        // folded in, so a new best can be drawn as a line it climbed past
        // rather than a line sitting exactly on this run's own score.
        previousBest: before.bestPoints,
      };
    },

    newRun: () => {
      // A detour never wrote the save, so there is nothing of ITS to clear —
      // and the home save must survive it (the same guard onChange keeps).
      if (!detour) {
        try {
          localStorage.removeItem(keys.run);
        } catch {
          // Nothing to clear is fine too.
        }
      }
      const url = new URL(location.href);
      url.searchParams.delete('seed');
      url.searchParams.delete('ff');
      url.searchParams.delete('daily');
      url.searchParams.delete('camp');
      location.href = url.toString();
    },

    /**
     * Share the run: the score, how it ended, and a link that opens the exact
     * same world and seed. No backend and no account — a seed IS the record,
     * which is the whole reason the engine has been deterministic since
     * Session 0. A daily shares its own line instead (`ideas/daily.md`): the
     * number, the arc as blocks, the confessed retry, and a link that opens
     * the same DATE — so it stays the same world on every phone that taps it.
     * Unchanged text+link logic; this is Stage 0's own fallback, kept, not
     * replaced (WORKPLAN Stage 2, 2026-08-19).
     *
     * The share CARD rides beside it now: rendered client-side from `card` —
     * the same facts `#renderEnd` just drew the screen from — and handed to
     * the Web Share API as a `File` wherever `navigator.canShare({ files })`
     * says yes. A picture is worth reaching for, but never at the cost of
     * the text+link that shipped first: every path below still sends it.
     */
    share: async (state, card) => {
      // Built from the bare pathname, never location.href (2026-08-20, both
      // launch audits found this independently): href drags this device's
      // own test rig into the link — ?ff=, ?theme=, ?hex=, ?camp= — and an
      // arriving ?ff= is PERSISTED by resolveFeatures, so a stale override
      // would install itself on every phone the link ever reaches. A share
      // link carries only what the receiver needs: the seed, or the date.
      const url = new URL(location.pathname, location.href);
      let text: string;
      if (dailyDate !== null) {
        url.searchParams.set('daily', dailyDate);
        const reach = reachOf(state);
        const tries = readDailyBook()[dailyDate]?.tries ?? 1;
        const arc = arcSparkline(state.log.harvests);
        text =
          `${NAME} ${dailyName(dailyDate)} · ${state.points} pts · reach ${reach}` +
          `${arc === '' ? '' : ` · ${arc}`} · ${ordinal(tries)} try · beat it:`;
      } else {
        url.searchParams.set('seed', String(state.rootSeed));
        text = `${NAME}: ${state.points} pts in ${state.placements} placements. Beat my run:`;
      }

      // Best-effort, and never fatal: a browser missing a piece of the
      // canvas API (or an image that fails to decode) simply hands back
      // `null`, and everything below falls through to the text+link share
      // exactly as it did before the card existed.
      let file: File | null = null;
      let cardBlob: Blob | null = null;
      try {
        cardBlob = await renderShareCard(theme, card);
        if (cardBlob !== null) {
          file = new File([cardBlob], 'ashwake-run.png', { type: 'image/png' });
        }
      } catch {
        file = null;
      }

      try {
        if (
          file !== null &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({ title: NAME, text, url: url.toString(), files: [file] });
          return 'shared';
        }
        if (typeof navigator.share === 'function') {
          await navigator.share({ title: NAME, text, url: url.toString() });
          return 'shared';
        }
        // Desktop: no share sheet exists to hand a picture to — but
        // desktop IS Discord and Twitter, so the card goes to the
        // CLIPBOARD (launch audit, 2026-08-20): one Ctrl+V posts the
        // actual run card where a downloaded file would rot in a folder.
        // The download + text-link path stays as the fallback ladder.
        if (
          cardBlob !== null &&
          typeof ClipboardItem !== 'undefined' &&
          navigator.clipboard?.write !== undefined
        ) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': cardBlob,
                'text/plain': new Blob([`${text} ${url.toString()}`], { type: 'text/plain' }),
              }),
            ]);
            return 'copied';
          } catch {
            // Clipboard images refused (permissions, or a picky browser):
            // fall through to the ladder below.
          }
        }
        if (file !== null) downloadFile(file);
        await navigator.clipboard.writeText(`${text} ${url.toString()}`);
        return 'copied';
      } catch (error) {
        // Dismissing the share sheet is the single most common outcome of
        // tapping SHARE, and it used to be conflated with "sharing is
        // unavailable" (the audit's words: the game lies). AbortError is
        // the user changing their mind; the button stays quiet for it.
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        // Neither API exists. The button reports it — a copy nobody is
        // told about reads as a button that does nothing.
        return 'failed';
      }
    },
  };
}

/**
 * The share card's desktop fallback (2026-08-19, WORKPLAN Stage 2): no share
 * sheet exists to hand a `File` to, so the browser downloads it the plain
 * way — an anchor with `download` set, clicked and discarded. Never reached
 * on the phone this game is tested against; a desktop visitor is the only
 * audience for it.
 */
function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

/**
 * The picker: one button per direction, reloading into it.
 *
 * A reload rather than a live swap, deliberately. Switching theme changes the
 * hex orientation, every baked texture, the webfont and the browser chrome
 * colour; a reload gets all of that right for free and costs a quarter of a
 * second, whereas a live swap is a pile of invalidation code guarding a
 * decision that will be made once and then deleted.
 */
function mountThemePicker(host: HTMLElement, current: Theme, facing: Orientation | null): void {
  host.hidden = false;

  const reloadWith = (mutate: (url: URL) => void): void => {
    const url = new URL(location.href);
    mutate(url);
    location.href = url.toString();
  };

  const themeButtons = THEMES.map((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.textContent = theme.name;
    button.title = theme.note;
    button.setAttribute('aria-pressed', String(theme.id === current.id));
    button.addEventListener('click', () => {
      rememberTheme(theme.id);
      reloadWith((url) => url.searchParams.set('theme', theme.id));
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
    button.addEventListener('click', () => {
      reloadWith((url) => url.searchParams.set('hex', value));
    });
    return button;
  });

  host.replaceChildren(...themeButtons, ...facingButtons);
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
    /** The board's ♪ button and this panel's SOUND switch are one wire —
     *  a flip here must land on the button's face and the live gate too. */
    syncSound: (on: boolean) => void;
  },
  startNewRun: () => void,
): void {
  let features = initial;

  // The rows are interactive: their taps must not close the panel around them.
  host.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const heading = document.createElement('p');
  heading.className = 'help-title';
  heading.textContent = 'SETTINGS';

  // Player things first (2026-08-18: "settings reordered"); the two
  // developer switches are testing tools, not something a run is asking a
  // player to decide, and moved into their own fold below.
  const intro = document.createElement('p');
  intro.textContent =
    'Sticky on this device. The switches sit folded under DEVELOPER, below — ' +
    'SOUND among them — and the address bar does the same job ' +
    '(?ff=ui.sound, ?ff=debug.overlay), each note carrying the decision ' +
    'that set its default. NEW RUN is how a changed one actually takes ' +
    'effect; it never touches the run in progress.';

  // The privacy fact (2026-08-20, launch polish): it was true since Session
  // 0 and written only in a README no player ever sees. One quiet line,
  // here where a person wondering about their data would actually look.
  const privacy = document.createElement('p');
  privacy.className = 'flag-note';
  privacy.textContent =
    'Nothing leaves your phone: no account, no analytics, no server — every ' +
    'run, record and setting lives in this device’s own storage, and ' +
    'sharing only ever sends what you see in the share sheet.';

  // The atlas, as a label/value grid in the stat row's own language
  // (`.fact`/`.fact-label`/`.fact-value` — shared with the end screen's own
  // grid, 2026-08-18) rather than a seven-fact sentence a reader had to
  // parse apart. A fact you have to pull out of a run-on is a fact half-shown.
  const atlas = document.createElement('p');
  atlas.className = 'help-title';
  atlas.textContent = 'YOUR WORLD';

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
  // ones are left. Progress carries across every world, unlike the shrine
  // ledger above, so it is read fresh rather than off `live.world`.
  const perksLine = document.createElement('p');
  perksLine.className = 'flag-note';
  perksLine.textContent = `${readProgress().found.length} of ${PERKS.length} perks found.`;

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
    readProgress().found.length > 0;
  const surveyHeading = document.createElement('p');
  surveyHeading.className = 'help-title';
  surveyHeading.textContent = 'THE SURVEY';
  const metGoals = new Set(w.goalsMet);
  const survey = document.createElement('div');
  survey.id = 'survey';
  survey.append(
    ...GOALS.map((goal) => {
      const row = document.createElement('p');
      const met = metGoals.has(goal.id);
      row.className = met ? 'unlock found' : 'unlock';
      row.textContent = `${met ? '◈' : '◇'} ${goal.label}`;
      return row;
    }),
  );

  // Starting over is still the one destructive control in the game, so it
  // confirms — but it is an INVITATION now, not a punishment (Marc,
  // 2026-08-19: "a friendlier fresh start"): NEW WORLD, with the words
  // saying what travels (shop, perks, teaching) and what stays (the map,
  // the territories, the shrines). The paid way out is the crossing — a
  // fully-awake world's shrines offer it with a relic dowry; this button is
  // the unpaid anytime version.
  let armed = false;
  const abandon = document.createElement('button');
  abandon.type = 'button';
  abandon.id = 'abandon-world';
  abandon.className = 'quiet';
  abandon.textContent = 'NEW WORLD — leave this one behind';
  abandon.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      abandon.textContent =
        'TAP AGAIN — the map, territories and shrines stay behind; your shop and perks travel';
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
    const paint = (): void => {
      const on = isEnabled(features, f.id);
      button.textContent = f.wired ? (on ? 'ON' : 'OFF') : 'NOT BUILT';
      button.setAttribute('aria-pressed', String(on));
    };
    paint();

    if (f.wired) {
      button.addEventListener('click', () => {
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
  resetTeaching.addEventListener('click', () => {
    writeProgress({ ...readProgress(), met: [] });
    resetTeaching.textContent = 'TEACHING RESET';
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
        const errorClear = document.createElement('button');
        errorClear.type = 'button';
        errorClear.id = 'clear-last-error';
        errorClear.className = 'quiet';
        errorClear.textContent = 'CLEAR LAST ERROR';
        errorClear.addEventListener('click', () => {
          try {
            localStorage.removeItem(ERROR_STORAGE_KEY);
          } catch {
            // Unwritable storage will simply show it again; harmless.
          }
          errorHead.remove();
          errorBody.remove();
          errorClear.remove();
        });
        errorElements.push(errorHead, errorBody, errorClear);
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
  // ?ff, leaving the STORED settings to decide what comes next. Last on the
  // panel: it is the action that makes anything above it count.
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.id = 'new-run';
  restart.textContent = 'NEW RUN with these settings';
  restart.addEventListener('click', startNewRun);

  host.replaceChildren(
    heading,
    intro,
    privacy,
    atlas,
    atlasGrid,
    ledger,
    shrineHint,
    perksLine,
    ...(surveyStarted ? [surveyHeading, survey] : []),
    abandon,
    developer,
    restart,
  );
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

async function main(): Promise<void> {
  const features = resolveFeatures();
  // Three world slots (Marc, 2026-08-19): the active one is the game; the
  // front door's menu switches, settles and begins the others.
  const slot = activeSlot();
  const keys = slotKeys(slot);
  const world = loadWorld(keys);

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
  const dailyDate = askedDaily();
  const sharedSeed = askedSeed();

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
    keys,
    theme,
    slot,
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
  const wakeAt = camp !== null && askedCamp() ? camp : null;

  // Before anything is drawn: the chrome takes its colours from the same theme
  // the board will, so there is never a frame of placeholder around themed art.
  applyTheme(theme, document.documentElement);

  // The most likely launch-day first click is a link inside somebody's
  // feed — an in-app WebView that quietly keeps nothing. Say so, once.
  if (inAppBrowser()) showInAppNote();

  // The name and the mark, written from one constant so renaming the game is
  // one edit. The icon is an inline SVG data URI: no request, cannot 404.
  document.title = NAME;
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = ICON_DATA_URI;
  document.head.appendChild(icon);

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
    draft: required('draft'),
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
    help: required<HTMLButtonElement>('help'),
    helpPanel: required('help-panel'),
    helpManual: required('help-manual'),
    toast: required('toast'),
    eventCard: required('event-card'),
    eventCardGlyph: required('event-card-glyph'),
    eventCardText: required('event-card-text'),
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

  // RESET ALL: the one true wipe — run, world, shop, records, settings, the
  // lot. Everything this game keeps lives under one prefix, so the wipe is
  // enumerated rather than listed and cannot go stale when a key is added.
  // Two taps, the same arming contract ABANDON THIS WORLD keeps.
  const frontDoorReset = required<HTMLButtonElement>('front-door-reset');
  // A device with nothing to forget gets no wipe (2026-08-20, launch
  // polish): on a virgin phone RESET ALL is a trap on the first screen a
  // stranger ever sees. It appears once there is anything worth wiping.
  frontDoorReset.hidden =
    world.runs === 0 &&
    world.revealed.length === 0 &&
    SLOTS.every((s) => s === slot || peekSlot(s) === null) &&
    Object.keys(readDailyBook()).length === 0 &&
    readProgress().relics === 0 &&
    readProgress().found.length === 0 &&
    // A settled shared world writes a diary tick before any run finishes
    // (fresh-eyes, 2026-08-20) — a device holding one is not virgin.
    readTimeline().length === 0;
  let resetArmed = false;
  frontDoorReset.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      frontDoorReset.classList.add('armed');
      frontDoorReset.textContent = 'TAP AGAIN — forgets everything on this device';
      return;
    }
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('tiles.')) localStorage.removeItem(key);
      }
    } catch {
      // Storage refused the wipe; the reload below still starts clean-ish.
    }
    location.href = '/';
  });
  const frontDoorBegin = required<HTMLButtonElement>('front-door-begin');
  const frontDoorHelp = required<HTMLButtonElement>('front-door-help');
  const frontDoorMode = required('front-door-mode');
  const frontDoorDaily = required<HTMLButtonElement>('front-door-daily');
  const frontDoorHome = required<HTMLButtonElement>('front-door-home');

  // The front door is the playstyle MENU (Marc, 2026-08-19: "a proper menu
  // for all playstyles — seed vs real game"): it names which game BEGIN
  // opens — your world, the daily, or somebody else's shared run — and
  // offers the other doors beside it, so a mode is entered on purpose and
  // never by accident of what was in the address bar.
  const today = localToday();
  const frontDoorWorlds = required('front-door-worlds');
  const frontDoorSettle = required<HTMLButtonElement>('front-door-settle');
  const goHome = (): void => {
    location.href = new URL(location.pathname, location.href).toString();
  };
  /** Navigate home with one param set — the daily and camp doors' shape. */
  const goWith = (param: string, value: string): void => {
    const url = new URL(location.pathname, location.href);
    url.searchParams.set(param, value);
    location.href = url.toString();
  };
  frontDoorHome.addEventListener('click', goHome);

  // A daily game left open across midnight — the installed PWA's NORMAL
  // state — used to go on offering YESTERDAY (launch audit, 2026-08-20):
  // the door's date was baked at boot. Coming back to a still-open MENU on
  // a new day reloads into today; a run in progress is never touched — it
  // banks under the date it started, which is the Wordle rule.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !frontDoor.hidden && localToday() !== today) {
      goHome();
    }
  });
  if (dailyDate !== null) {
    frontDoorBegin.textContent = `BEGIN DAILY ${dailyName(dailyDate)}`;
    frontDoorMode.hidden = false;
    frontDoorMode.textContent =
      'The daily: one shared world for this date, played plain — no upgrades, no perk. ' +
      'Tries are counted and confessed; your own world is untouched.';
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
      frontDoorSettle.addEventListener('click', () => {
        // The seed settles EXACTLY as played — the old 31-bit mask would
        // have settled a different world than the one just previewed
        // whenever a hand-typed seed was negative.
        saveWorld(slotKeys(emptySlot), newWorld(sharedSeed));
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
    frontDoorDaily.textContent =
      dailyBadge(dailyBook, today) + (streak > 1 ? ` · streak ${streak}` : '');
    frontDoorDaily.addEventListener('click', () => {
      goWith('daily', today);
    });

    // BEGIN AT CAMP (waypoints, 2026-08-19): the remembered world's missing
    // verb — deep ground you HOLD becomes ground you can start from. Only a
    // fresh run may camp; a run in progress resumes where it was.
    if (camp !== null) {
      const ring = distance(parse(camp), { q: 0, r: 0 });
      const frontDoorCamp = required<HTMLButtonElement>('front-door-camp');
      if (askedCamp()) {
        frontDoorBegin.textContent = `BEGIN AT CAMP — ring ${ring}`;
        frontDoorMode.textContent =
          `World ${slot} of 3 — waking at your farthest territory, ${ring} out. ` +
          'The climb starts there; the score measures from where you wake.';
      } else {
        frontDoorCamp.hidden = false;
        frontDoorCamp.textContent = `BEGIN AT CAMP — your farthest territory, ring ${ring}`;
        frontDoorCamp.addEventListener('click', () => {
          goWith('camp', '1');
        });
      }
    }

    // The world slots (Marc, 2026-08-19: "3 save game possibilities";
    // 2026-08-20: "offer all 3 worlds"): all three listed, always. The
    // active one is marked NOW and enters the same run BEGIN does; a
    // settled other switches; an empty one begins there — a switch is a
    // reload, the same cheap honesty the theme picker keeps.
    const worldFacts = (w: WorldMemory): string =>
      `${w.runs} ${w.runs === 1 ? 'run' : 'runs'} · best ${w.bestPoints} · ${w.territories.length} held`;
    frontDoorWorlds.hidden = false;
    frontDoorWorlds.replaceChildren(
      ...SLOTS.map((s) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiet';
        if (s === slot) {
          button.textContent = `WORLD ${s} · NOW — ${world.runs > 0 ? worldFacts(world) : 'untouched'}`;
          button.addEventListener('click', () => frontDoorBegin.click());
        } else {
          const other = peekSlot(s);
          button.textContent =
            other === null ? `WORLD ${s} — begin new` : `WORLD ${s} — ${worldFacts(other)}`;
          button.addEventListener('click', () => {
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
    const fameOpen = required<HTMLButtonElement>('front-door-fame');
    const famePanel = required<HTMLElement>('fame-panel');
    const fameBody = required('fame-body');
    const fameRow = (cls: string, text: string): HTMLElement => {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      return p;
    };
    const closeFame = (): void => {
      famePanel.hidden = true;
      fameOpen.focus();
    };
    required<HTMLButtonElement>('fame-back').addEventListener('click', closeFame);
    famePanel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFame();
    });
    // A hall of fame with nothing in it stays off the virgin door (the
    // same reasoning that hides RESET ALL, applied the day the audit
    // pointed out it had not been): a stranger's first screen should not
    // offer a museum of nothing.
    fameOpen.hidden =
      readTimeline().length === 0 &&
      world.runs === 0 &&
      SLOTS.every((s) => s === slot || peekSlot(s) === null) &&
      Object.keys(readDailyBook()).length === 0 &&
      readProgress().found.length === 0;

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

      const progress = readProgress();
      rows.push(fameRow('fame-h', 'PERKS FOUND'));
      if (progress.found.length === 0) {
        rows.push(fameRow('fame-row dim', 'None yet — hidden finds are out there.'));
      } else {
        for (const perk of PERKS.filter((p) => progress.found.includes(p.id))) {
          rows.push(
            fameRow(
              'fame-row',
              `✦ ${perk.name}${progress.equipped.includes(perk.id) ? ' — worn' : ''}`,
            ),
          );
        }
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
      row.addEventListener('click', () => {
        const open = detail.hidden;
        detail.hidden = !open;
        paint(open);
      });
      return [row, detail];
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
        fameRow(
          'fame-row',
          `DAILY ${dailyName(e.date)} · ${ordinal(e.try)} try${e.best ? ' · NEW BEST' : ''} · ${fameDate(e.at)}`,
        ),
        ...(e.arc === '' ? [] : [fameRow('fame-arc', e.arc)]),
        ...(d === undefined ? [] : foldFacts(d, false)),
      ]);
    };

    /** A world-scale entry: leaving, or arriving. One line, no fold. */
    const fameWorldRow = (e: WorldEventEntry): HTMLElement =>
      fameRow(
        'fame-row',
        e.event === 'crossed'
          ? `${fameDate(e.at)} · W${e.slot} · Crossed on — ${e.n ?? 0} relics carried out`
          : `${fameDate(e.at)} · W${e.slot} · Settled a shared world`,
      );

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
        chip.addEventListener('click', () => {
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

    fameOpen.addEventListener('click', () => {
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
        button.addEventListener('click', () => {
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
      famePanel.hidden = false;
      famePanel.focus();
    });
  }
  frontDoorBegin.addEventListener('click', () => {
    frontDoor.hidden = true;
    gameShell.inert = false;
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
  soundToggle.addEventListener('click', () => {
    syncSound(!soundLive);
    persistFeatures(withOverrides(storedFeatures(), { 'ui.sound': soundLive }));
    // Hearing IS the feedback: one small bell on enable, silence on mute —
    // and this tap is the user gesture Web Audio wants the context born in.
    if (soundLive) soundReal.pop(1);
  });

  // The settings half of the ? panel — mounted here rather than in Game
  // because flags are resolved at this edge and stay out of the engine.
  // Rebuilt every time the panel is opened, from storage rather than from the
  // snapshot this page loaded with: a shrine woken at placement 40 has to
  // show as found the moment you go and look, not after the run ends — and
  // since the board's ♪ button writes the ui.sound flag between opens, the
  // switchboard itself re-reads STORAGE too, not this page's boot snapshot.
  const settingsHost = required('help-meta');
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
        syncSound,
      },
      keeper.newRun ?? (() => location.reload()),
    );
  paintSettings();
  required('help').addEventListener('click', paintSettings);

  const renderer = new PixiRenderer(theme, AssetBook.empty(), prefersReducedMotion());
  await renderer.mount(elements.board);
  rendererAlive = true;

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
  const tuning =
    sharedSeed === null && dailyDate === null ? applyProgress(unlocked, readProgress()) : unlocked;
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
            promptNow: (): boolean => {
              if (installPrompt === null) return false;
              void installPrompt.prompt();
              installPrompt = null;
              return true;
            },
          }),
    };
  })();

  // The game reports through this facade and stays deaf to whether anyone
  // is listening — `soundLive` (above, beside the ♪ button that flips it)
  // decides at each moment sound would play, which is what makes the
  // toggle land mid-run rather than on the next load.
  const hooks: GameHooks & { savedSeed: number | null } = {
    ...keeper,
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
    // replays the same date. The reload lands on the front door saying
    // BEGIN DAILY #N, which is the menu doing its job, not a detour.
    ...(dailyDate === null
      ? {}
      : {
          daily: {
            label: (): string => dailyBadge(readDailyBook(), dailyDate),
            retry: (): void => {
              location.reload();
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

  // The front door's own opener — same dialog the in-game ? opens, so
  // there is exactly one manual rather than two that could drift apart.
  frontDoorHelp.addEventListener('click', () => {
    game.openHelp(frontDoorHelp);
  });
  // A keyboard or screen-reader user should land on the primary action, not
  // have to discover it. Best-effort: some browsers refuse focus during
  // load, and the door is still fully usable by touch either way.
  try {
    frontDoorBegin.focus();
  } catch {
    // Not focusable yet, or focus refused. BEGIN is still one tap away.
  }

  // Offline, after the game is already playable. A service worker that
  // registers before the first frame is a service worker that can delay one;
  // this one only ever makes the SECOND visit better, so it waits its turn.
  // Dev never registers one — a cached bundle is the last thing you want
  // while editing, and `import.meta.env.DEV` is compiled out of the build.
  if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
    // The worker takes over mid-session by design (skipWaiting + claim), and
    // until now it did so with no signal at all. `controllerchange` is that
    // signal — but it ALSO fires on the very first install, when the page
    // goes from uncontrolled to controlled, and telling a player who just
    // arrived that there is a new version would be a lie. Only a page that
    // already HAD a controller has actually been updated under.
    const hadController = navigator.serviceWorker.controller !== null;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateNote();
    });
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // A backgrounded phone only looks for a new worker when it
        // NAVIGATES (launch audit, 2026-08-20) — which on launch day is
        // exactly when a hotfix most needs to reach it. Re-check on an
        // interval and whenever the app returns to the foreground; the
        // update note above already knows what to do when one lands.
        setInterval(() => void registration.update().catch(() => undefined), 15 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void registration.update().catch(() => undefined);
          }
        });
      })
      .catch(() => {
        // No offline play. Every other thing still works, so this is not
        // worth a word on screen.
      });
  }

  // Art loads AFTER the first playable frame, never before it. Every slot is
  // empty today and the procedural surfaces are a complete board; a bitmap that
  // arrives late simply replaces one, and a bitmap that never arrives costs
  // nothing. The game must never wait on a picture.
  void AssetBook.load(theme.id)
    .then((assets) => {
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
}

/**
 * The one-line update affordance. A new worker has already taken over — the
 * autosave means a reload loses nothing — so this is an offer, not an alarm:
 * one tappable line in the stamp's voice, above the stamp, that reloads into
 * the build the worker is already serving. Plain DOM, like the failure panel,
 * because it must work whatever state the game is in.
 */
function showUpdateNote(): void {
  if (document.getElementById('update-note') !== null) return;
  // On body, fixed (2026-08-20): it used to sit inside #game-shell beside
  // the stamp — which is `inert` the whole time the front door is up, so
  // an update arriving on the menu was an untappable line. Dismissible
  // since the same day's fresh-eyes pass: it parks over the purse row, it
  // arrives unannounced mid-run, and its only interaction was a reload —
  // one mis-reach for the purse threw the player out of their run.
  const note = document.createElement('div');
  note.id = 'update-note';
  note.setAttribute('role', 'status');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.id = 'update-reload';
  reload.textContent = 'NEW VERSION — TAP TO RELOAD';
  reload.addEventListener('click', () => {
    location.reload();
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.id = 'update-later';
  later.setAttribute('aria-label', 'Not now');
  later.textContent = '✕';
  later.addEventListener('click', () => {
    note.remove();
  });
  note.append(reload, later);
  document.body.appendChild(note);
}

/**
 * The in-app browser warning (launch audit, 2026-08-20): a link opened
 * inside Instagram/TikTok/Facebook/Discord runs in a WebView whose storage
 * is partitioned or wiped when the host app closes — the world, the
 * records and the hall of fame can silently evaporate. Once ever, the
 * storage note's shelf and voice, gone on tap: the useful sentence is
 * "open this in your real browser".
 */
function showInAppNote(): void {
  try {
    if (localStorage.getItem('tiles.inappnote.v1') !== null) return;
    localStorage.setItem('tiles.inappnote.v1', '1');
  } catch {
    // A storage that keeps nothing proves the note's own point; still show
    // it this once.
  }
  if (document.getElementById('inapp-note') !== null) return;
  const note = document.createElement('button');
  note.type = 'button';
  note.id = 'inapp-note';
  note.setAttribute('role', 'status');
  note.textContent =
    'You’re in an in-app browser — your world may not be kept here. Open this page in Safari or Chrome to keep it.';
  note.addEventListener('click', () => {
    note.remove();
  });
  document.body.appendChild(note);
}

/**
 * Storage ran dry mid-run and something regrowable was shed to keep the
 * run (`onChange`'s fallback ladder). One line, the update note's shape,
 * gone on tap or after ten seconds — the player deserves to know why the
 * hall of fame's diary just got shorter, and nothing else says it.
 */
function showStorageNote(): void {
  if (document.getElementById('storage-note') !== null) return;
  const note = document.createElement('button');
  note.type = 'button';
  note.id = 'storage-note';
  note.textContent = 'STORAGE FULL — some history was cleared so your run could be saved';
  note.addEventListener('click', () => {
    note.remove();
  });
  document.body.appendChild(note);
  setTimeout(() => {
    note.remove();
  }, 10000);
}

/** One line a human can send: name, message, and the top of the stack. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const stack = (error.stack ?? '')
      .split('\n')
      .slice(0, 4)
      .map((line) => line.trim())
      .join('\n');
    return `${error.name}: ${error.message}\n${stack}`.slice(0, 700);
  }
  try {
    return String(error).slice(0, 300);
  } catch {
    return 'unknown error';
  }
}

let failureCount = 0;

function rememberError(text: string): void {
  try {
    localStorage.setItem(
      ERROR_STORAGE_KEY,
      JSON.stringify({
        text,
        sha: __BUILD_SHA__.slice(0, 7),
        at: new Date().toISOString(),
        count: failureCount,
      }),
    );
  } catch {
    // A browser that cannot keep the error is the browser this feature
    // cannot help. The panel below still shows it live.
  }
}

/**
 * The failure panel: plain DOM, no Pixi, no framework — because it exists for
 * exactly the moments those things are broken (a WebGL context that will not
 * come up, a bundle half-loaded on a bad connection, a bug in the loop).
 *
 * Rebuilt 2026-08-19 after Marc's iOS session ("lots of please reload
 * errors... my end game screen got cancelled"): the old panel REPLACED the
 * whole body — one transient throw destroyed a perfectly good end screen —
 * and said nothing about what broke, on the one platform with no console.
 * It is an OVERLAY now, with CONTINUE beside RELOAD (a transient error is
 * survivable; the autosave means RELOAD loses nothing either way), it shows
 * the actual error so a phone can report it, it counts repeats instead of
 * stacking, and it remembers the last error for SETTINGS ▸ DEVELOPER.
 */
function showFailure(error?: unknown): void {
  failureCount++;
  const detail = error === undefined ? '' : describeError(error);
  if (detail !== '') rememberError(detail);

  const existing = document.getElementById('boot-failure');
  if (existing !== null) {
    const count = existing.querySelector('#boot-failure-count');
    if (count !== null) count.textContent = `seen ×${failureCount}`;
    if (detail !== '') {
      const shown = existing.querySelector('#boot-failure-detail');
      if (shown !== null) shown.textContent = detail;
    }
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'boot-failure';
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;gap:12px;' +
    'align-items:center;justify-content:center;background:rgba(16,18,24,0.94);color:#e6e9f0;' +
    'font-family:system-ui,sans-serif;padding:24px;text-align:center;';
  const words = document.createElement('p');
  // The honest split (2026-08-20 launch audit): a browser with no WebGL at
  // all cannot draw the board, will not be fixed by CONTINUE, and loops on
  // RELOAD — telling that visitor "your run is saved" was a lie wearing a
  // stack trace. Name the real problem and the real fix instead.
  const noWebgl = !rendererAlive && webglMissing();
  words.textContent = noWebgl
    ? `${NAME} needs WebGL to draw its board, and this browser has it missing or switched off. ` +
      'Try Safari or Chrome — or turn hardware acceleration back on.'
    : 'Something broke. Your run is saved — CONTINUE if the game still works underneath, RELOAD if it does not.';
  const count = document.createElement('p');
  count.id = 'boot-failure-count';
  count.textContent = `seen ×${failureCount}`;
  count.style.cssText = 'opacity:0.6;font-size:0.75rem;margin:0;';
  const shown = document.createElement('p');
  shown.id = 'boot-failure-detail';
  shown.textContent = detail;
  shown.style.cssText =
    'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.6875rem;opacity:0.8;' +
    'max-width:100%;overflow-wrap:anywhere;white-space:pre-wrap;text-align:left;' +
    'user-select:text;-webkit-user-select:text;margin:0;';
  const buttonCss =
    'min-height:44px;padding:0 24px;font:inherit;color:inherit;' +
    'background:#262b36;border:1px solid #3a4150;border-radius:6px;';
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'CONTINUE';
  go.style.cssText = buttonCss;
  go.addEventListener('click', () => {
    panel.remove();
  });
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'RELOAD';
  reload.style.cssText = buttonCss;
  reload.addEventListener('click', () => {
    location.reload();
  });
  // COPY REPORT (2026-08-20): the whole reason the detail is on screen is
  // so a phone can report it — one tap beats reading a stack trace aloud.
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'COPY REPORT';
  copy.style.cssText = buttonCss;
  copy.addEventListener('click', () => {
    const report = `${NAME} ${__BUILD_SHA__.slice(0, 7)}\n${shown.textContent ?? ''}`;
    // `navigator.clipboard` is undefined outside secure contexts, and the
    // property access THROWS synchronously — into the very error listener
    // whose panel this button sits on, overwriting the report it was
    // copying (fresh-eyes, 2026-08-20). The try is the fix.
    try {
      if (navigator.clipboard === undefined) throw new Error('no clipboard');
      navigator.clipboard.writeText(report).then(
        () => {
          copy.textContent = 'COPIED';
        },
        () => {
          copy.textContent = 'SELECT THE TEXT ABOVE';
        },
      );
    } catch {
      copy.textContent = 'SELECT THE TEXT ABOVE';
    }
  });
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
  // A WebGL-less browser has no game underneath to continue INTO, and
  // nothing useful to report — the message already says everything.
  if (noWebgl) row.append(reload);
  else row.append(go, reload, copy);
  panel.replaceChildren(words, count, shown, row);
  document.body.appendChild(panel);
}

/**
 * No WebGL at all — the one boot failure that is the browser's, not ours.
 * Only ever consulted when the renderer NEVER came up (`rendererAlive`
 * below): probing for a context while Pixi holds a live one can push a
 * phone at its context limit to drop the oldest — which is the board
 * (fresh-eyes, 2026-08-20). The probe also releases what it took.
 */
function webglMissing(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    if (gl === null) return true;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  } catch {
    return true;
  }
}

/** Set the moment `renderer.mount` succeeds — after that, a failure is never
 *  "this browser has no WebGL" and the probe above must not run at all. */
let rendererAlive = false;

// A boot that dies (WebGL refused, an element missing, a bundle truncated)
// used to be a silent blank page. The listeners catch what escapes later —
// one uncaught throw in a pointer handler froze the loop with no signal.
// Both hand the error itself across now, so the panel can say it.
window.addEventListener('error', (event) => {
  if (event.error !== undefined && event.error !== null) showFailure(event.error);
});
window.addEventListener('unhandledrejection', (event) => {
  // Only real Errors raise the panel (2026-08-20): a stray non-Error
  // rejection — an extension's, an aborted fetch's DOMException-less
  // reason, a bare string from some library — is noise this game did not
  // write, and the full-screen alarm over a playable board was the scarier
  // bug. Real failures in our own code reject with Error objects.
  if (event.reason instanceof Error) showFailure(event.reason);
});

void main().catch((error: unknown) => {
  showFailure(error);
});
