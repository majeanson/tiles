/**
 * The shell's storage edge: every localStorage key this game owns and the
 * readers and writers around them. Moved whole out of main.ts (2026-08-27,
 * the reload-removal refactor) — the game reports, the shell keeps, and
 * this file is the keeping half.
 */
import type { GameState } from '@engine/state';
import {
  dailyRunFor,
  decodeDailyBook,
  decodeDailyRun,
  encodeDailyBook,
  encodeDailyRun,
  type DailyBook,
} from '@meta/daily';
import {
  decodeFeatures,
  encodeFeatures,
  parseOverrides,
  withOverrides,
  type FeatureSet,
} from '@meta/features';
import { decodeProgress, encodeProgress, EMPTY_PROGRESS, type Progress } from '@meta/progress';
import { decodeRun, encodeRun } from '@meta/save';
import { inheritShopLevels, parseShopLevels } from '@meta/shopLevels';
import {
  appendEntry,
  capShots,
  decodeTimeline,
  encodeTimeline,
  type TimelineEntry,
} from '@meta/timeline';
import { decodeWorld, encodeWorld, newWorld, type WorldMemory } from '@meta/world';
import { AUTO_THEME_ID, parseThemeId, pickForScheme } from '@theme/index';
import type { Orientation } from '@theme/tokens';

// v2, 2026-08-14: the endless world became the default. Any device that ever
// visited before has `world.endless: false` explicitly persisted under v1,
// and a stored value beats a changed default by design — so the key moves,
// every device re-derives from the new defaults, and the old entry is left
// to rot. Overrides cost one visit to re-apply; a default that silently
// fails to arrive costs an evening of "but it works on my phone".
export const FEATURE_STORAGE_KEY = 'tiles.features.v2';
// v2, 2026-08-15: Gate E opened and torchlit became the default. Any device
// that ever opened the theme picker has an explicit choice persisted under
// v1, and a stored value beats a changed default by design — so a phone that
// tried the picker months ago would have gone on playing the placeholder
// forever, which is exactly what Marc's screenshot showed (cards reading
// GREEN and BLUE instead of MOSS and TIDE). The key moves; the picker still
// works and still sticks, under the new key.
export const THEME_STORAGE_KEY = 'tiles.theme.v2';
export const HEX_STORAGE_KEY = 'tiles.hex.v1';
/** The run in progress (or just ended), saved after every action. */
export const RUN_STORAGE_KEY = 'tiles.run.v1';
/** The world this device explores: seed, revealed ground, territories held. */
export const WORLD_STORAGE_KEY = 'tiles.world.v1';
/**
 * The roguelite purse and shelf. Deliberately NOT per world: Marc chose that
 * upgrades carry across every world, so a new world is a fresh map and never
 * a reset. Shrines stay per-world, so a world still has a story of its own.
 */
export const PROGRESS_STORAGE_KEY = 'tiles.progress.v1';
/**
 * The record book, per world — runs, best, and the harvest-choice tally that
 * Gate B is measured on. v2: v1 held bare numbers, this holds records.
 */
export const BEST_STORAGE_KEY = 'tiles.records.v2';
/**
 * The shrine receipt (2026-08-18): what the world unlocked THIS run, written
 * once when a run ends and read exactly once — on the very next run's first
 * frame — so a shrine woken late in a run (its own toast already shown, live,
 * mid-run) gets named again where a returning player will actually see it:
 * the opening of the run it changed.
 */
export const SHRINE_RECEIPT_KEY = 'tiles.shrinereceipt.v1';
/**
 * The last uncaught error, kept so a phone can REPORT it (2026-08-19: Marc
 * hit "lots of please reload errors" on iOS and could say nothing more,
 * because iOS has no console and the old panel showed no detail and nuked
 * the screen). Written by `showFailure`, shown under SETTINGS.
 */
export const ERROR_STORAGE_KEY = 'tiles.lasterror.v1';
/** The daily ladder: best and tries per date, plus the streak they imply. */
export const DAILY_STORAGE_KEY = 'tiles.daily.v1';
/**
 * The daily run in progress (Marc, Day 2: "make sure we can resume a daily
 * too — right now it restarts if I'm mid-daily and restart the app").
 *
 * Its OWN key, never a slot's: the home run must survive a detour, which is
 * the 2026-08-19 guard that made the daily safe to play at all. The date is
 * kept beside the run because one key holds one daily — read back on a
 * different date it answers nothing, so yesterday's abandoned board can never
 * land on today's, and the next daily simply overwrites it.
 */
export const DAILY_RUN_STORAGE_KEY = 'tiles.dailyrun.v1';
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
export const TIMELINE_STORAGE_KEY = 'tiles.timeline.v1';
/**
 * Which of the three world slots is active (Marc, 2026-08-19: "maybe have 3
 * save game possibilities?"). A device keeps up to three worlds — each with
 * its own map, territories, shrines, run-in-progress and shrine receipt —
 * and plays ONE at a time; the door's WORLDS panel switches between them.
 * The shop, perks, teaching and records stay device-wide, as ever.
 */
export const ACTIVE_SLOT_KEY = 'tiles.slot.v1';
/** The install nudge's once-ever marker (2026-08-20): set the first time the
 *  end screen offers ADD TO HOME SCREEN, so no one is nagged twice. */
export const INSTALL_NUDGE_KEY = 'tiles.installnudge.v1';

export type Slot = 1 | 2 | 3;
export const SLOTS: readonly Slot[] = [1, 2, 3];

/**
 * An in-app browser (Instagram, TikTok, Facebook, Discord…) — the most
 * likely first click on launch day, and the most hostile ground: storage
 * is partitioned or wiped when the host app closes, and iOS's share sheet
 * there has no ADD TO HOME SCREEN, so the install instructions would lie.
 */
export const inAppBrowser = (): boolean =>
  /FBAN|FBAV|Instagram|Line\/|TikTok|Twitter|Snapchat|; wv\)/i.test(navigator.userAgent);

/** Every stored thing that belongs to ONE world, keyed by its slot. */
export type SlotKeys = {
  readonly world: string;
  readonly run: string;
  readonly receipt: string;
  readonly shop: string;
};

/**
 * Slot 1 keeps the legacy key names on purpose: every device that existed
 * before slots IS slot 1, with no migration and nothing to re-read.
 *
 * `shop` is the exception and is new for every slot (2026-08-20): the levels
 * it holds used to live in the device-wide progress blob, and slot 1 pointing
 * at that blob would make the split a no-op for the one slot every existing
 * device plays. Absent means "inherit the old device-wide levels once" —
 * see `readShopLevels`.
 */
export function slotKeys(slot: Slot): SlotKeys {
  return slot === 1
    ? {
        world: WORLD_STORAGE_KEY,
        run: RUN_STORAGE_KEY,
        receipt: SHRINE_RECEIPT_KEY,
        shop: 'tiles.shop.s1.v1',
      }
    : {
        world: `tiles.world.s${slot}.v1`,
        run: `tiles.run.s${slot}.v1`,
        receipt: `tiles.shrinereceipt.s${slot}.v1`,
        shop: `tiles.shop.s${slot}.v1`,
      };
}

export function activeSlot(): Slot {
  try {
    const stored = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
    return stored === 2 || stored === 3 ? stored : 1;
  } catch {
    return 1;
  }
}

export function setActiveSlot(slot: Slot): void {
  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, String(slot));
  } catch {
    // Unwritable storage plays slot 1 forever, which is the old game intact.
  }
}

/** A slot's world as stored, or null where the slot is unsettled. */
export function peekSlot(slot: Slot): WorldMemory | null {
  try {
    return decodeWorld(localStorage.getItem(slotKeys(slot).world));
  } catch {
    return null;
  }
}

/** Today, as the LOCAL date string the daily is named after (Marc's Wordle
 *  rule, `ideas/daily.md`: the ritual is "new one when I wake up"). */
export function localToday(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function readDailyBook(): DailyBook {
  try {
    return decodeDailyBook(localStorage.getItem(DAILY_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeDailyBook(book: DailyBook): void {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, encodeDailyBook(book));
  } catch {
    // Private mode: the daily still plays, the ladder just is not kept.
  }
}

/**
 * The daily put down mid-board, with the date it belongs to. Tolerant in the
 * same way `decodeRun` is: anything that is not a shape this wrote reads as
 * nothing, because a daily that refuses to resume is a small loss and a daily
 * that resumes wrong is a broken promise on a shared world.
 */
export function readDailyRun(date: string): GameState | null {
  try {
    const kept = dailyRunFor(decodeDailyRun(localStorage.getItem(DAILY_RUN_STORAGE_KEY)), date);
    return kept === null ? null : decodeRun(kept);
  } catch {
    return null;
  }
}

export function writeDailyRun(date: string, state: GameState): void {
  try {
    localStorage.setItem(DAILY_RUN_STORAGE_KEY, encodeDailyRun({ date, run: encodeRun(state) }));
  } catch {
    // Private mode, or a full disk. The daily still plays; it just cannot be
    // put down and picked up again. Deliberately NOT on the home run's
    // shed-and-retry ladder: the run that must never be lost is the one in
    // this device's own world, and a daily is a detour by definition.
  }
}

export function clearDailyRun(): void {
  try {
    localStorage.removeItem(DAILY_RUN_STORAGE_KEY);
  } catch {
    // Nothing to clear is fine too.
  }
}

export function readTimeline(): readonly TimelineEntry[] {
  try {
    return decodeTimeline(localStorage.getItem(TIMELINE_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** How many diary rows keep their board picture (C9): the newest twenty —
 *  ~10KB each, so the museum's whole picture wall stays around 200KB
 *  against the storage audit's multi-MB budget. */
export const FAME_SHOTS_KEPT = 20;

/** One entry onto the diary's end. A diary that cannot be written is still
 *  a run that happened — never fatal, never blocks the end screen. */
export function appendTimeline(entry: TimelineEntry): void {
  try {
    localStorage.setItem(
      TIMELINE_STORAGE_KEY,
      encodeTimeline(capShots(appendEntry(readTimeline(), entry), FAME_SHOTS_KEPT)),
    );
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
 * `?ff=debug.overlay` once and the readout is simply there from then on, until
 * `?ff=-debug.overlay` takes it away. One link makes a phone a test device.
 */
export function persistFeatures(set: FeatureSet): void {
  try {
    localStorage.setItem(FEATURE_STORAGE_KEY, encodeFeatures(set));
  } catch {
    // Private mode, or storage disabled. Nothing to do, nothing worth saying.
  }
}

export function resolveFeatures(): FeatureSet {
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
export function resolveFacing(): Orientation | null {
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
export function resolveThemeId(): string {
  const asked = parseThemeId(location.search);
  // An arriving `?theme=` STICKS, exactly as `?ff=` and `?hex=` do
  // (2026-08-27). It did not, and that was invisible until scene changes
  // stopped being navigations: `setRoute` rebuilds the URL from the route
  // alone, so the first door tap dropped `?theme=` from the bar and the next
  // session resolved from storage — the direction under test reverting
  // mid-test, on the phone that is the only place it can be judged. The
  // other two rig params were already persisted on arrival; this one was the
  // odd one out, and `router.ts`'s comment claiming all three stick was
  // wrong about it.
  if (asked !== null) rememberTheme(asked);
  // `?theme=auto` means auto, not "an id nobody has". Without this it would fall
  // through `resolveTheme`'s unknown-id guard to torchlit, so the one spelling a
  // person is most likely to type by hand would be the one that silently did
  // something else.
  if (asked !== null && asked !== AUTO_THEME_ID) return asked;
  if (asked === AUTO_THEME_ID) return pickForScheme(...askedScheme());

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Private mode. The device gets whatever it is asking for right now, which
    // is the same answer a device that has never chosen gets.
  }

  // AUTO is the new default (2026-08-25), and it is what a phone that has never
  // opened SETTINGS is on. `null` — never chosen — means auto too, so the
  // behaviour arrives for everyone rather than only for people who go looking.
  // An explicit choice still wins, which is the whole reason the row exists.
  if (stored === null || stored === AUTO_THEME_ID) return pickForScheme(...askedScheme());
  return stored;
}

/**
 * What the device is asking for: `[prefersLight, prefersContrast]`.
 *
 * The only two media queries the theme layer cares about, sampled at the edge
 * and handed to `pickForScheme` as plain booleans so the decision itself stays
 * pure and testable — the same split `resolveFacing` and the feature flags use.
 *
 * `matchMedia` is guarded because a system with no preference set answers "not
 * light and not more contrast", which is exactly torchlit, and because a browser
 * old enough to lack it should get the default rather than a crash on the way to
 * the front door.
 */
export function askedScheme(): [boolean, boolean] {
  try {
    return [
      window.matchMedia('(prefers-color-scheme: light)').matches,
      window.matchMedia('(prefers-contrast: more)').matches,
    ];
  } catch {
    return [false, false];
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

/**
 * Which world's shop levels `readProgress` and `writeProgress` speak for.
 *
 * The split (Marc, 2026-08-20: "purse global, levels per-world") is done out
 * here rather than inside `Progress`, so `applyProgress`, `buy`, `priceOf`
 * and the whole shop UI keep taking one object and never learn that half of
 * it comes from somewhere else. Null until the active slot is known at boot,
 * which is the only window where nothing has asked yet.
 */
let shopKeys: SlotKeys | null = null;

/**
 * Point the shop's reads and writes at a slot's keys. Called by every
 * session at its own top — the active slot changes when a session does.
 */
export function useShopSlot(keys: SlotKeys): void {
  shopKeys = keys;
}

/**
 * A world's bought levels, or null where the world predates the split.
 *
 * Its own small key rather than a field on `WorldMemory`: the world blob
 * carries every revealed hex, and `readProgress` runs several times per tap,
 * so folding it in would mean decoding the largest thing on the device to
 * answer "how many levels of DEEPER PURSE". Kept tiny, it is free.
 *
 * The parsing itself — and the inherit decision `readProgress` builds on it
 * — is `@meta/shopLevels`, pure and tested; this is only the storage read.
 */
export function readShopLevels(keys: SlotKeys): Progress['bought'] | null {
  try {
    return parseShopLevels(localStorage.getItem(keys.shop));
  } catch {
    return null;
  }
}

export function writeShopLevels(keys: SlotKeys, bought: Progress['bought']): void {
  try {
    localStorage.setItem(keys.shop, JSON.stringify(bought));
  } catch {
    // Private mode. The purchase holds for this session and no longer.
  }
}

export function readProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const device =
      progressCache !== null && progressCache.raw === raw
        ? progressCache.decoded
        : ((): Progress => {
            const decoded = decodeProgress(raw);
            progressCache = { raw, decoded };
            return decoded;
          })();

    // The migration, and it is a one-way generosity (`@meta/shopLevels`'s
    // `inheritShopLevels`): a world that has never written a shop key
    // predates the split, so it INHERITS the device-wide levels rather than
    // resetting to nothing. Every world a device already held keeps exactly
    // the build it had; only worlds settled after today start bare, which
    // is the point of the split.
    return shopKeys === null ? device : inheritShopLevels(device, readShopLevels(shopKeys));
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function writeProgress(progress: Progress): void {
  try {
    // The purse, the shelf and the teaching are the device's; the LEVELS
    // belong to the world they were bought for. The device blob keeps its own
    // `bought` untouched — it is the legacy floor that worlds older than the
    // split still inherit from, and rewriting it here would silently move the
    // build of every OTHER world that has not been played since.
    const legacy = decodeProgress(localStorage.getItem(PROGRESS_STORAGE_KEY)).bought;
    localStorage.setItem(PROGRESS_STORAGE_KEY, encodeProgress({ ...progress, bought: legacy }));
    if (shopKeys !== null) writeShopLevels(shopKeys, progress.bought);
  } catch {
    // Private mode. The run still plays; it just never compounds.
  }
}

/** Bank what a finished run carried out, once, at the moment it ends. */
export function bankRelics(state: GameState): void {
  if (state.relics <= 0) return;
  const progress = readProgress();
  writeProgress({ ...progress, relics: progress.relics + state.relics });
}

/**
 * Read the shrine receipt back, and clear it — it is read exactly once, on
 * the run it was written for. A device that never woke a shrine, or already
 * read the receipt, gets an empty list, which is silent rather than wrong.
 */
export function readShrineReceipt(keys: SlotKeys): readonly string[] {
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

export function writeShrineReceipt(keys: SlotKeys, labels: readonly string[]): void {
  if (labels.length === 0) return;
  try {
    localStorage.setItem(keys.receipt, JSON.stringify(labels));
  } catch {
    // Best effort — the receipt is a nicety on top of a shrine's own live
    // toast, not the only place the unlock is ever named.
  }
}

export function rememberTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Nothing to do and nothing worth telling the player about.
  }
}

/**
 * The world this device plays (P4a): rolled once, kept, and abandonable.
 *
 * `?seed=` still means "replay this exact run", which deliberately bypasses
 * the world — a shared link must show the sender's run, not the receiver's
 * geography.
 */
export function loadWorld(keys: SlotKeys): WorldMemory {
  try {
    const stored = decodeWorld(localStorage.getItem(keys.world));
    if (stored !== null) return stored;
  } catch {
    // Private mode: every visit is a new world, which is a fine game too.
  }
  return createWorld(keys, Date.now() & 0x7fffffff);
}

/**
 * Settle a slot on a seed: the world, plus the EMPTY shop that makes it a
 * fresh build (2026-08-20).
 *
 * Writing `{}` is the load-bearing half. An absent shop key means "older than
 * the split, inherit the device's levels", so a world created without one
 * would arrive wearing the build of the world it was started to get away
 * from. Every place a world is born goes through here for that reason.
 */
export function createWorld(keys: SlotKeys, worldSeed: number): WorldMemory {
  const world = newWorld(worldSeed);
  saveWorld(keys, world);
  writeShopLevels(keys, {});
  return world;
}

/**
 * Settle a seed into a slot, taking everything the slot held with it.
 *
 * One helper for both SETTLE doors (2026-08-20). The end screen's path wiped
 * the footprint and the front door's did not, which mattered exactly where
 * nobody looked: when the "empty" slot is the virgin ACTIVE one, its saved
 * run and shrine receipt outlive the world they belonged to, and a run whose
 * `rootSeed` no longer matches its world is the merge corruption the seed
 * guard in `onChange` now refuses outright. Two doors, one behaviour.
 */
/**
 * Get a backup off the phone, by whatever door this platform has.
 *
 * The same ladder the run share climbs, for the same reason: on iOS the
 * share sheet is the only route to Files or a message to yourself, on
 * desktop the clipboard is what people actually use, and a download is the
 * floor everywhere else. A JSON file rather than a link because a backup is
 * far past any URL length that survives a chat app.
 */
export async function saveBackupFile(
  name: string,
  text: string,
): Promise<'shared' | 'copied' | 'downloaded' | 'failed'> {
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] }) === true) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (error) {
    // A dismissed share sheet is a change of mind, not a failure — and it
    // must not fall through to also downloading the file behind their back.
    if (error instanceof Error && error.name === 'AbortError') return 'shared';
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    // Revoked on a later turn: revoking synchronously can beat the download
    // starting on some browsers, which loses the file silently.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10000);
    return 'downloaded';
  } catch {
    // Downloads blocked (an in-app WebView, most likely — which is exactly
    // the storage that evaporates, so the clipboard below matters most
    // precisely where the file route is least available).
  }

  try {
    if (navigator.clipboard === undefined) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

let persistenceAsked = false;

/** Ask the browser to keep this origin's storage. Best-effort, once a boot. */
export function askPersistence(): void {
  if (persistenceAsked) return;
  persistenceAsked = true;
  try {
    if (typeof navigator.storage?.persist === 'function') {
      void navigator.storage.persist().catch(() => undefined);
    }
  } catch {
    // A browser that objects to being asked. Nothing here was load-bearing.
  }
}

export function settleSlot(target: Slot, worldSeed: number): void {
  const keys = slotKeys(target);
  for (const key of [keys.world, keys.run, keys.receipt, keys.shop]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // A storage that refuses the wipe still gets the world written below;
      // the worst case is a stale receipt naming a shrine in another world.
    }
  }
  createWorld(keys, worldSeed);
}

export function saveWorld(keys: SlotKeys, world: WorldMemory): void {
  try {
    localStorage.setItem(keys.world, encodeWorld(world));
  } catch {
    // Unwritable memory is a world you rediscover each time. Still playable.
  }
}
