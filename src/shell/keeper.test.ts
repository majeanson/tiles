// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import { TUNING } from '@content/tuning';
import { key } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import type { GameState } from '@engine/state';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import { newWorld, type WorldMemory } from '@meta/world';
import { runKeeping } from './keeper';
import { slotKeys, useShopSlot, type Slot } from './store';

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
  return runKeeping(world, false, null, null, KEYS, PLACEHOLDER, SLOT, signal);
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
