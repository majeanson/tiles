// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import { TUNING } from '@content/tuning';
import { key } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import type { GameState } from '@engine/state';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import { decodeRecords, ONLY_WORLD } from '@meta/records';
import type { PerkId } from '@meta/progress';
import { newWorld, type WorldMemory } from '@meta/world';
import { runKeeping } from './keeper';
import {
  loadWorld,
  readProgress,
  slotKeys,
  useShopSlot,
  BEST_STORAGE_KEY,
  type Slot,
} from './store';

/**
 * The keeper, checked for the one thing it must never do: write after it has
 * been told to stop.
 *
 * Until 2026-08-27 the only way a keeper ended was the document going away,
 * so "stop" was something the browser did rather than something this code
 * could be asked for. Sessions swap in place now, and every guard below is
 * the difference between a scene change and a corrupted save.
 *
 * The regression this file exists for is the infinite relic farm (fresh-eyes
 * review, 2026-08-19): navigating away fires `pagehide`, and the world flush
 * re-saved a world AFTER `dropWorld` had buried it — which un-crossed every
 * crossing and paid the dowry again on the next run.
 */

const SLOT: Slot = 1;
const KEYS = slotKeys(SLOT);

/** A run with real ground under it, so the world has something to merge. */
function playedRun(world: WorldMemory): GameState {
  // One placement is enough: it reveals ground, which is what marks the
  // world dirty and gives the debounced write something to flush.
  return reduce(newRun(world.worldSeed, TUNING), { type: 'PLACE', hex: key(1, 0) });
}

function makeKeeper(world: WorldMemory, signal: AbortSignal) {
  // The way home is the session's, and no test here takes it: these are all
  // about what the keeper WRITES, not where the shell goes afterwards.
  return runKeeping(world, false, null, null, KEYS, PLACEHOLDER, SLOT, signal, () => undefined);
}

/** Every key this slot owns, as the device would see them. */
function stored(): Record<string, string | null> {
  return {
    world: localStorage.getItem(KEYS.world),
    run: localStorage.getItem(KEYS.run),
    receipt: localStorage.getItem(KEYS.receipt),
    shop: localStorage.getItem(KEYS.shop),
  };
}

describe('the keeper after its session ends', () => {
  beforeEach(() => {
    localStorage.clear();
    useShopSlot(KEYS);
  });

  it('flushes a dirty world on pagehide while it is alive', () => {
    // The load-bearing half of the guard, pinned first: a REAL reload, a
    // backgrounded PWA or a closed tab must still keep what the debounce was
    // holding. Everything below turns writes off; this is the proof that it
    // only turns them off for a keeper that has been told to stop.
    const world = newWorld(4242);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    keeper.onChange?.(playedRun(world));
    localStorage.removeItem(KEYS.world);

    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEYS.world)).not.toBeNull();
  });

  it('never resurrects a world it has dropped — the relic farm', () => {
    const world = newWorld(777);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    // A run that has revealed ground: the world is dirty and the debounce is
    // holding a write.
    const state = playedRun(world);
    keeper.onChange?.(state);

    // The crossing: the dowry is banked and the world is buried.
    keeper.dropWorld();
    expect(stored()).toEqual({ world: null, run: null, receipt: null, shop: null });

    // Now everything that used to be able to put it back. The flush is the
    // one that actually did, in 2026-08-19; the rest are the writers the old
    // `worldDirty = false` never covered, live for the 140ms of the fade.
    window.dispatchEvent(new Event('pagehide'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    keeper.flush();
    keeper.onChange?.(state);
    keeper.checkGoals?.();

    expect(stored()).toEqual({ world: null, run: null, receipt: null, shop: null });
  });

  it('writes nothing once detached', () => {
    const world = newWorld(99);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    const state = playedRun(world);
    keeper.detach();
    abort.abort();

    keeper.onChange?.(state);
    window.dispatchEvent(new Event('pagehide'));
    keeper.flush();

    expect(stored()).toEqual({ world: null, run: null, receipt: null, shop: null });
  });

  it('keeps the last actions on a pause-like exit', () => {
    // The other side of the same coin: HOME, the menu and a slot switch all
    // end a session without ending the WORLD, and the few actions the
    // debounce was still holding have to land.
    const world = newWorld(31337);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    keeper.onChange?.(playedRun(world));
    localStorage.removeItem(KEYS.world);

    keeper.flush();
    expect(localStorage.getItem(KEYS.world)).not.toBeNull();
  });

  it('lets a dead keeper’s listeners go with the session', () => {
    const world = newWorld(5);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    keeper.onChange?.(playedRun(world));
    // The session ends: detach, then abort, exactly as `endSession` does.
    keeper.detach();
    abort.abort();
    localStorage.removeItem(KEYS.world);

    // The listeners are gone, so this reaches nothing at all.
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEYS.world)).toBeNull();
  });
});

/**
 * The crossing settles the run (2026-08-28), on Marc's own evidence: he
 * crossed with 75 relics and lost the two perks he had found, and called the
 * trade "not worth it". Three things had to change — perks travel whole,
 * unspent luck converts the same way a real ending pays it, and the run
 * lands in the record book — and all three have to happen exactly once, or
 * a crossing becomes the dowry-farm bug's cousin: cross, land in a world
 * that pays out again, repeat.
 */
describe('the crossing settles the run (2026-08-28)', () => {
  beforeEach(() => {
    localStorage.clear();
    useShopSlot(KEYS);
  });

  it('carries every found perk and the worn one into the fresh world', () => {
    const world: WorldMemory = {
      ...newWorld(555),
      perks: ['rootbound', 'stonewalker'] as PerkId[],
      worn: 'rootbound',
      territories: [key(1, 0), key(2, 0)],
    };
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);
    const crossing = keeper.crossing;
    expect(crossing).toBeDefined();

    const state: GameState = { ...newRun(555, TUNING), relics: 30, luck: 0 };
    crossing?.cross(state);

    // The world in this slot is a FRESH one (new seed, empty ground and
    // territories) whose perk shelf is the departing world's, whole.
    const fresh = loadWorld(KEYS);
    expect(fresh.worldSeed).not.toBe(555);
    expect(fresh.revealed).toEqual([]);
    expect(fresh.territories).toEqual([]);
    expect(fresh.perks).toEqual(['rootbound', 'stonewalker']);
    expect(fresh.worn).toBe('rootbound');
  });

  it('converts unspent luck to relics, the same 5% a real ending pays', () => {
    const world = newWorld(9);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    const state: GameState = { ...newRun(9, TUNING), relics: 10, luck: 200 };
    const before = readProgress().relics;
    keeper.crossing?.cross(state);
    const after = readProgress().relics;

    // Dowry (25, no territories) + the run's own 10 + floor(200 * 5%) = 10.
    const dowry = 25;
    const luckBonus = Math.floor(200 * TUNING.luckToRelics);
    expect(luckBonus).toBeGreaterThan(0);
    expect(after - before).toBe(dowry + 10 + luckBonus);
  });

  it('lands the run in the record book, the way a finished run does', () => {
    const world = newWorld(3);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    expect(decodeRecords(localStorage.getItem(BEST_STORAGE_KEY))[ONLY_WORLD]).toBeUndefined();

    const state: GameState = { ...newRun(3, TUNING), relics: 5, luck: 0, points: 40 };
    keeper.crossing?.cross(state);

    const book = decodeRecords(localStorage.getItem(BEST_STORAGE_KEY));
    expect(book[ONLY_WORLD]?.runs).toBe(1);
  });

  it('cannot be crossed twice — the dowry-farm fix holds for this seam too', () => {
    const world = newWorld(41);
    const abort = new AbortController();
    const keeper = makeKeeper(world, abort.signal);

    const state: GameState = { ...newRun(41, TUNING), relics: 10, luck: 0 };
    const before = readProgress().relics;
    keeper.crossing?.cross(state);
    const afterOnce = readProgress().relics;
    expect(afterOnce).toBeGreaterThan(before);

    // A second call — a queued double-tap, or a stray re-fire — must land on
    // the same `dropped` latch every other write hook already refuses after.
    keeper.crossing?.cross(state);
    const afterTwice = readProgress().relics;
    expect(afterTwice).toBe(afterOnce);

    const book = decodeRecords(localStorage.getItem(BEST_STORAGE_KEY));
    expect(book[ONLY_WORLD]?.runs).toBe(1);
  });
});
