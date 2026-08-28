/**
 * The run keeper: resume, autosave, records, world memory, and the one way to
 * start over. Moved whole out of main.ts (2026-08-27) — the game reports
 * through hooks and never learns storage exists; the storage helpers
 * themselves are @shell/store's.
 */
import { CROSSING, GOALS } from '@content/goals';
import { endingPayout } from '@engine/reduce';
import { reachOf } from '@engine/rules';
import type { GameState } from '@engine/state';
import { arcSparkline, recordDaily } from '@meta/daily';
import { newlyMetGoals } from '@meta/goals';
import { NAME } from '@meta/identity';
import { grantFind, withWorldPerks, PERKS, type PerkId } from '@meta/progress';
import {
  decodeRecords,
  encodeRecords,
  recordRun,
  EMPTY as EMPTY_RECORDS,
  ONLY_WORLD,
  type RecordBook,
} from '@meta/records';
import { decodeRun, encodeRun } from '@meta/save';
import { SHED_LADDER, type ShedRungId } from '@meta/shedLadder';
import { shareOf } from '@meta/share';
import { runHighlights, SHOT_CHAR_MAX, type RunDetail, type WorldEventEntry } from '@meta/timeline';
import { knownFraction, mergeRun, rememberRun, UNLOCKS, type WorldMemory } from '@meta/world';
import { renderShareCard } from '@render/shareCard';
import type { Theme } from '@theme/tokens';
import type { GameHooks } from '@ui/game';
import { epitaphFor } from '@ui/view';
import { showStorageNote } from '@shell/notes';
import {
  appendTimeline,
  askPersistence,
  bankRelics,
  clearDailyRun,
  createWorld,
  freshWorldSeed,
  readDailyBook,
  readDailyRun,
  readProgress,
  readShrineReceipt,
  saveWorld,
  slotKeys,
  writeDailyBook,
  writeDailyRun,
  writeProgress,
  writeShrineReceipt,
  BEST_STORAGE_KEY,
  ERROR_STORAGE_KEY,
  SLOTS,
  TIMELINE_STORAGE_KEY,
  type Slot,
  type SlotKeys,
} from '@shell/store';

/**
 * The run's end screen, kept for the diary (Marc, 2026-08-20: "a 'full
 * detail' of the run" behind every hall-of-fame row). Mirrors
 * `summariseRun` (ui/view.ts) fact for fact — same counting, same epitaph
 * function — so a reopened row says what the screen said that night.
 */
function runDetailOf(state: GameState, shot: string | null = null): RunDetail {
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
  // The board's thumbnail (C9, 2026-08-26), stored only when it is what the
  // decoder will accept back — same prefix, same ceiling — so a write can
  // never plant a shot a reload would then throw away.
  const goodShot =
    shot !== null && shot.startsWith('data:image/') && shot.length <= SHOT_CHAR_MAX ? shot : null;
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
    ...(goodShot === null ? {} : { shot: goodShot }),
  };
}

/**
 * The run keeper: resume, autosave, records, world memory, and the one way to
 * start over. All of it lives here at the edge — the game reports through
 * hooks and never learns storage exists, the same split as the feature flags.
 */
export function runKeeping(
  world: WorldMemory,
  debugOn: boolean,
  dailyDate: string | null,
  // The `?seed=` replay, resolved once by the session and handed in as data.
  replaySeed: number | null,
  keys: SlotKeys,
  // The theme actually live (2026-08-19, WORKPLAN Stage 2): `share` below
  // renders the share card against it, the same theme the screen the card
  // is a picture OF was drawn in.
  theme: Theme,
  // The timeline (Session 31): which slot this run's tick belongs to. The
  // diary always records (launch ruling, 2026-08-20 — the flag it was born
  // behind died the same week it was born).
  slot: Slot,
  // Severs the flush listeners when the session that made this keeper ends
  // (2026-08-27, the reload-removal refactor): a dead session never writes.
  signal: AbortSignal,
  /**
   * Back to the front door, on a freshly started session.
   *
   * Handed in rather than imported: the session builds the keeper, so the
   * keeper cannot reach back for `restart` without a cycle — and the two
   * doors below that leave a world (the crossing, and NEW RUN) are the only
   * places this edge needs to change scene at all.
   */
  goHome: () => void,
): GameHooks & {
  savedSeed: number | null;
  dropWorld: (carry?: { readonly perks: readonly PerkId[]; readonly worn: PerkId | null }) => void;
  flush: () => void;
  detach: () => void;
} {
  /**
   * Is this keeper's session still the live one?
   *
   * Cleared by `detach` when a session ends. Until 2026-08-27 the answer was
   * always yes, because the only way a session ended was the document going
   * away — and a keeper whose page was being torn down could not be asked
   * anything. Now sessions end in place, and every write below is one a DEAD
   * keeper must never perform: its slot may already belong to the next
   * session.
   */
  let alive = true;

  /**
   * Has this world been left behind?
   *
   * The other half of the same guard, and the one with history. The
   * fresh-eyes review (2026-08-19) found that navigating away fires
   * `pagehide`, and the flush re-saved a dirty world AFTER its own funeral —
   * un-crossing every crossing and making the dowry an infinite relic farm.
   * `dropWorld` answered that by clearing `worldDirty` first, which closed
   * the flush and nothing else: every OTHER writer stayed live for the 140ms
   * the departure fade lasts, and only the page dying stopped a queued tap
   * from putting the world back. In place that window is real, so the
   * funeral is now permanent — after `dropWorld` no hook writes this world
   * or its run again, ever.
   */
  let dropped = false;

  // The perk shelf as this page booted, for the timeline's ✦ diff at finish.
  // PER-WORLD since 2026-08-26 — the shelf is the world's own now, so this
  // reads the world the page booted with, like every other diff input.
  const perksAtBoot = world.perks.length;
  // A detour: somebody else's seed, or the daily. Neither is this device's
  // world — nothing banks, nothing merges, nothing overwrites the home run.
  const detour = replaySeed !== null || dailyDate !== null;

  // Where this boot's run-in-progress comes from. The daily has its own key
  // since Day 2 — a daily put down is a pause, not a forfeit — and it must
  // match TODAY'S date to be picked up, so an abandoned board never surfaces
  // on a world it was not played on. A `?seed=` replay still resumes nothing:
  // it is a one-off you re-open from the link itself, and it writes nowhere.
  let saved: GameState | null = null;
  try {
    if (dailyDate !== null) {
      saved = readDailyRun(dailyDate);
    } else if (replaySeed === null) {
      saved = decodeRun(localStorage.getItem(keys.run));
    }
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
    // `dropped` first, and it is the whole relic-farm fix restated: a world
    // that has been left behind is never written again, by this path or any
    // other. `alive` is the same rule for a session that simply ended.
    if (dropped || !alive) return;
    if (!worldDirty) return;
    worldDirty = false;
    actionsSinceWrite = 0;
    saveWorld(keys, current);
  };
  window.addEventListener('pagehide', flushWorld, { signal });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') flushWorld();
    },
    { signal },
  );

  // Asked ONCE PER BOOT, as early as there is anything worth keeping —
  // persistent storage is what stops iOS treating the world as evictable
  // cache after a week of not playing. Best-effort by contract: some browsers
  // prompt, some silently refuse, some lack the API, and the game is
  // identical in every case, so nothing is awaited and nothing can throw
  // past here.
  //
  // It used to wait for the first successful RUN save on the home world
  // (2026-08-20 audit), which is far too late and far too narrow: a player
  // who opened the daily and only ever played dailies never asked at all,
  // and neither did one who booted — receiving a freshly minted world in the
  // same tick — and then closed the tab. Both had a world on the device that
  // the browser was free to evict, and neither had been counted as worth
  // keeping. `main()` calls this right after `loadWorld` now; the call from
  // the run save stays, because asking twice is free and the first ask can
  // fail on a browser that wants a gesture.
  // (Module-level, so boot can ask before any run exists — see askPersistence.)

  /**
   * Leave the active world behind, for BOTH doors that do it (the crossing
   * and SETTINGS' NEW WORLD). The load-bearing line is the first one: the
   * fresh-eyes review (2026-08-19) found that navigating away fires
   * `pagehide`, and the flush re-saved a dirty world AFTER its own funeral —
   * which un-crossed every crossing and made the dowry an infinite relic
   * farm (claim shrine, cross, land in the same world, repeat).
   *
   * `carry` (2026-08-28, the crossing's own ruling): the perk shelf being
   * left behind, for the door that keeps it. NEW WORLD never passes one — a
   * player choosing to abandon a world is choosing to start hunting again —
   * so this stays the one place both doors' behaviour can diverge without
   * duplicating the wipe above it. When it IS passed, the fresh world for
   * this slot is minted right here, in the same synchronous call, BEFORE the
   * latch below — the same discipline `cross` below keeps for the dowry
   * itself, so there is no tick where a reload could see the old world gone
   * and the new one not yet written.
   */
  const dropWorld = (carry?: {
    readonly perks: readonly PerkId[];
    readonly worn: PerkId | null;
  }): void => {
    // Latched, not merely cleared (2026-08-27): see `dropped` above.
    dropped = true;
    worldDirty = false;
    try {
      localStorage.removeItem(keys.run);
      localStorage.removeItem(keys.receipt);
      // The build goes with the world it was bought for (2026-08-20). Left
      // behind, the next world settled in this slot would inherit it — and a
      // slot whose shop key is absent reads as "older than the split", which
      // would hand it the device's legacy levels instead of a fresh start.
      localStorage.removeItem(keys.shop);
      if (carry === undefined) {
        localStorage.removeItem(keys.world);
      } else {
        // Written now rather than left for the next `loadWorld` to mint
        // lazily: the perk shelf has nowhere else to ride between this tap
        // and the next session's boot, and a world already on disk is one
        // `loadWorld` simply reads back, same as any other.
        createWorld(keys, freshWorldSeed(), carry);
      }
    } catch {
      // A storage that refuses the wipe starts the next session in the old
      // world — with anything already banked kept, which errs kind.
    }
  };

  return {
    resume: saved,
    savedSeed: saved?.rootSeed ?? null,
    dropWorld,

    /**
     * Write out anything owed, now. The session calls this as it ends, so a
     * pause-like exit — HOME, the menu, a slot switch — keeps the last few
     * actions the debounce was still holding. A no-op when clean, and a
     * no-op on a dropped world, which is what makes it safe to call on every
     * exit including the ones that just held a funeral.
     */
    flush: flushWorld,

    /**
     * This keeper is no longer the live one. Called before the next session
     * is built; the flush listeners go with the session's own AbortSignal,
     * and this closes the hooks a dying Game might still call into.
     */
    detach: (): void => {
      alive = false;
    },
    // A detour starts fully dark (Marc, 2026-08-20: "all dailies should
    // start fogged completely"). The write side was always guarded — a
    // detour never merges into this world's memory — but the READ side
    // passed the home world's revealed keys unconditionally, so a daily
    // (or somebody else's `?seed=`) drew YOUR fog ghost over a world with
    // different geography under it. Same guard as every hook below: a
    // detour is not this device's world, in either direction.
    memory: detour ? [] : world.revealed,

    // The shop hook speaks the COMPOSITE (2026-08-26, the per-world perk
    // split): the device's purse and levels with THIS world's shelf folded
    // in, so the shelf UI, `applyProgress` and `grantFind` all keep their
    // shapes. The write splits it back apart — `encodeProgress` strips the
    // perk fields from the device blob, and the world takes them, saved
    // immediately (a shelf change is as rare and as precious as a claim).
    // A detour never writes the world's shelf: its shop door is gone, and
    // the only composite writes it can produce are teaching marks.
    shop: {
      read: () => withWorldPerks(readProgress(), current.perks, current.worn),
      write: (next) => {
        if (dropped || !alive) return;
        writeProgress(next);
        if (detour) return;
        const worn = next.equipped[0] ?? null;
        const sameShelf =
          worn === current.worn &&
          next.found.length === current.perks.length &&
          next.found.every((p, i) => p === current.perks[i]);
        if (sameShelf) return;
        current = { ...current, perks: [...next.found], worn };
        worldDirty = false;
        actionsSinceWrite = 0;
        saveWorld(keys, current);
      },
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
      if (dropped || !alive) return null;
      if (detour) return null;
      if (current.finds.includes(hex)) return null;
      const granted = grantFind(
        withWorldPerks(readProgress(), current.perks, current.worn),
        world.worldSeed,
        hex,
      );
      if (granted === null) return null;
      // The grant is the world's now (2026-08-26): shelf and worn slot land
      // on the world, saved immediately — a perk is the least replaceable
      // thing a world holds, and the device blob no longer carries it.
      current = {
        ...current,
        perks: [...granted.progress.found],
        worn: granted.progress.equipped[0] ?? null,
      };
      worldDirty = false;
      actionsSinceWrite = 0;
      saveWorld(keys, current);
      return granted.perk.name;
    },

    // The survey (2026-08-18): five world-scale goals, each paying relics
    // ONCE per world. Called after every action's own `onChange` above has
    // already merged the world, so `current` is fresh — reach, territories
    // and known% all read the same live facts the atlas does. A replay is
    // somebody else's world and must neither pay nor mark anything met.
    checkGoals: () => {
      if (dropped || !alive) return null;
      if (detour) return null;
      const progress = withWorldPerks(readProgress(), current.perks, current.worn);
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
              cross: (state: GameState) => {
                // A dead or already-dropped keeper crosses nothing a second
                // time — the same belt-and-brace `finish` keeps, and the one
                // thing standing between a slow double-tap and a double-paid
                // dowry (2026-08-28: `dropped` is now latched by the time
                // this returns, so a second call reaches exactly here).
                if (dropped || !alive) return;

                // The dowry AND the run's own economy, settled like any
                // other ending (2026-08-20, widened 2026-08-28 on Marc's
                // evidence — 75 relics for losing two hard-found perks was
                // "not worth it"). A crossing is the only way a run ends
                // without `finish`, so before this its unspent luck and any
                // reach/claim bonus simply never happened. `endingPayout` is
                // the engine's own end-of-run arithmetic (`reduce.ts`),
                // reused here rather than re-derived — a crossing pays what
                // walking to the shrine and STOPPING would have paid.
                const dowry = dowryOf();
                const { relics: settledRelics, points: settledPoints } = endingPayout(state);
                const carried = Math.max(0, settledRelics);
                const settled: GameState = {
                  ...state,
                  relics: settledRelics,
                  points: settledPoints,
                };

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
                  n: dowry + carried,
                });

                // The run lands in the record book the way a finished run
                // does (2026-08-28): score, reach and Gate B's own harvest
                // tally. `finish` is not called — a crossing keeps its
                // world, so the world-remembering half of `finish` does not
                // apply — but the book is the one seam `finish` and `cross`
                // can share without pulling either into the other.
                let book: RecordBook;
                try {
                  book = decodeRecords(localStorage.getItem(BEST_STORAGE_KEY));
                } catch {
                  book = {};
                }
                try {
                  localStorage.setItem(BEST_STORAGE_KEY, encodeRecords(recordRun(book, settled)));
                } catch {
                  // A record that cannot be written is still a run that happened.
                }

                const progress = readProgress();
                writeProgress({
                  ...progress,
                  relics: progress.relics + dowry + carried,
                });

                // All found perks travel (Marc, 2026-08-28): the departing
                // world's shelf is threaded straight into the fresh world
                // `dropWorld` mints below, read here before the latch like
                // everything else this crossing writes.
                dropWorld({ perks: current.perks, worn: current.worn });
                // In place since 2026-08-27. `dropWorld` has already latched
                // this world shut, so the session that ends on the way out
                // cannot write it back — which is the same guarantee the
                // navigation used to provide by killing the page, now made
                // by the keeper itself.
                goHome();
              },
            };
          })(),
        }),

    onChange: (state) => {
      // The dead-session guard, first (2026-08-27). This is the hook every
      // action goes through, so it is the one that would otherwise let a tap
      // queued during a scene change write a run into a slot the next
      // session has already taken over — or put back the world a crossing
      // just left behind.
      if (dropped || !alive) return;
      // Detours never touch the home save: before 2026-08-19 this write was
      // unconditional, so playing somebody's `?seed=` link OVERWROTE the run
      // in progress and an abandoned replay could be resumed as your own —
      // exactly what `ideas/daily.md`'s scouting note believed was already
      // guarded. The daily depends on the guard, so now it exists.
      //
      // The daily keeps a save of its OWN (Day 2), under its own key, so
      // closing the app mid-daily is a pause rather than a forfeit. It
      // returns here rather than falling through: nothing below this line —
      // the home run, the shed ladder, the world merge — belongs to a
      // detour, which is what `detour` used to say in one word.
      if (dailyDate !== null) {
        writeDailyRun(dailyDate, state);
        return;
      }
      if (replaySeed !== null) return;
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
        // and shedding it never freed enough to matter.
        //
        // Reordered again 2026-08-20, because the old two-rung version could
        // CORRUPT a world rather than merely lose one. Rung 2 removed
        // `keys.world` and left `keys.run`: the next boot found no world,
        // minted a fresh random one, then resumed the old run — whose
        // `rootSeed` no longer matched — and the merge below has no seed
        // guard, so a foreign geography was unioned into the new world's
        // revealed ground. Fog memory of places that were never there.
        //
        // The ladder now spends the genuinely cheap things first, and never
        // touches the world being played. Each rung says its OWN sentence,
        // because "some history was cleared" is a fair description of the
        // diary and a lie about a world.
        //
        // The ORDER and the wording are `@meta/shedLadder`'s `SHED_LADDER`,
        // pure and tested; this is only the mechanism each rung id names —
        // keyed the same way so the two cannot drift apart.
        const drop: Record<ShedRungId, () => void> = {
          // Free, and nobody's memory of anything.
          lastError: () => localStorage.removeItem(ERROR_STORAGE_KEY),
          // The other slots' receipts: small, and a receipt is a one-shot
          // toast nobody is waiting for on a world they are not in. Shop
          // levels regenerate as "inherit", never as zero.
          otherReceipts: () => {
            for (const s of SLOTS) {
              if (s === slot) continue;
              localStorage.removeItem(slotKeys(s).receipt);
            }
          },
          timeline: () => localStorage.removeItem(TIMELINE_STORAGE_KEY),
          // Only now, and only worlds you are NOT standing in. The active
          // world is never shed: losing it silently is the worst thing this
          // game can do, and the run it would corrupt is the very thing the
          // ladder is trying to save.
          otherWorlds: () => {
            for (const s of SLOTS) {
              if (s === slot) continue;
              const other = slotKeys(s);
              localStorage.removeItem(other.world);
              localStorage.removeItem(other.run);
              localStorage.removeItem(other.shop);
            }
          },
        };
        for (const rung of SHED_LADDER) {
          try {
            drop[rung.id]();
            localStorage.setItem(keys.run, encodeRun(state));
            askPersistence();
            showStorageNote(rung.note);
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
      // The seed guard (2026-08-20): a run may only ever be merged into the
      // world it was PLAYED on. Nothing should be able to produce a mismatch
      // — but the quota ladder above did, by shedding a world and leaving its
      // run behind, and a corrupt world that silently decodes as null does
      // the same. Ground unioned from a foreign geography is unremovable
      // afterwards, so this is a cheap guard against an expensive class.
      if (replaySeed === null && state.rootSeed === current.worldSeed) {
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

    finish: (state, shot) => {
      // A dead keeper banks nothing. `finish` fires once per ended
      // transition by construction, so this is a belt beside that brace —
      // but it is the most expensive hook to get wrong (relics, records, the
      // diary), and the cheapest possible guard.
      if (dropped || !alive) {
        return { runs: 0, best: 0, isNewBest: false, previousBest: 0 };
      }
      // The daily lives on its own ladder (`ideas/daily.md`): tries counted
      // and confessed, best kept per date, and NOTHING of the home economy
      // touched — a daily run can earn relics in play, and banking them
      // would make the plain shared game a meta farm. The end screen's
      // RUN N / best lines read naturally as try N / today's best.
      if (dailyDate !== null) {
        // The finished daily leaves storage HERE, for the reason the home run
        // does (2026-08-18): an ended run that stayed saved is resumed by
        // every reload, and each resume re-finishes it — which on this ladder
        // means another try confessed and another diary tick, forever. The
        // try is recorded; keeping its corpse around buys only the bug.
        clearDailyRun();
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
          detail: runDetailOf(state, shot),
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
      // Seed-guarded for the same reason `onChange`'s merge is: a run may
      // only ever be folded into the world it was played on.
      if (replaySeed === null && state.rootSeed === current.worldSeed) {
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
          perksAfter: current.perks.length,
          campStart: state.wakeAt !== null,
        }),
        detail: runDetailOf(state, shot),
      });

      // The world's story, not the run's (F6, 2026-08-26): the thresholds
      // this run pushed the world past, each its own entry appended AFTER
      // the run's tick so the stream reads run-then-milestone in stored
      // order. Same seed guard as the merge above — a foreign run must not
      // stamp milestones into a world it was never played on. The finds
      // check reads the device-wide perk pool, credited to the world where
      // the last one was claimed, which is this one.
      if (replaySeed === null && state.rootSeed === current.worldSeed) {
        const milestones: WorldEventEntry['event'][] = [];
        if (world.shrines.length < UNLOCKS.length && current.shrines.length >= UNLOCKS.length)
          milestones.push('awake');
        if (world.goalsMet.length < GOALS.length && current.goalsMet.length >= GOALS.length)
          milestones.push('surveyed');
        if (perksAtBoot < PERKS.length && current.perks.length >= PERKS.length)
          milestones.push('all-finds');
        for (const event of milestones)
          appendTimeline({
            at: Date.now(),
            kind: 'world',
            event,
            slot,
            worldSeed: world.worldSeed,
          });
      }

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
      // Home: no seed, no daily, no camp. Deleting those three params one
      // by one was how this was said while the URL had to survive a reload;
      // the home route simply IS their absence, and the seed re-derives from
      // `world.worldSeed` on the session that starts next.
      goHome();
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
      // The sentence and the query come from `meta/share.ts` (2026-08-21),
      // which is pure and tested; the ORIGIN stays here, because it is the
      // half that has to know about `location` and the half both launch
      // audits caught. `shareOf` hands back params rather than a URL for
      // exactly that reason — it cannot accidentally carry this device's rig.
      const url = new URL(location.pathname, location.href);
      const shared =
        dailyDate === null
          ? shareOf(NAME, {
              kind: 'run',
              points: state.points,
              placements: state.placements,
              seed: state.rootSeed,
              arc: arcSparkline(state.log.harvests),
            })
          : shareOf(NAME, {
              kind: 'daily',
              date: dailyDate,
              points: state.points,
              reach: reachOf(state),
              arc: arcSparkline(state.log.harvests),
              tries: readDailyBook()[dailyDate]?.tries ?? 1,
            });
      for (const [key, value] of Object.entries(shared.params)) {
        url.searchParams.set(key, value);
      }
      const text = shared.text;

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
