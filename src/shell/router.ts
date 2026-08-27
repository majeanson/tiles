/**
 * Leaving one scene for another.
 *
 * Until 2026-08-27 every scene switch in this game was a full page reload,
 * and this file was one function: a fade to acknowledge the tap (Marc,
 * 2026-08-26: "sometimes buttons are long to switch scenes — it seems to be
 * working in the background") before the navigation tore the page down.
 *
 * The fade stays, doing the same job and one more. A session swap has a
 * window in which the old scene is gone and the new one is not built; the
 * `departing` class covers it, and because the class also sets
 * `pointer-events: none` (style.css), nothing can be tapped while it is open.
 * What used to hide a navigation now hides a rebuild.
 *
 * These are the primitives only. What a swap actually IS — end this session,
 * start the next — lives in `@shell/session`, which imports this; keeping the
 * dependency one-way is why the two are separate files.
 */
import { searchFor, type Route } from '@meta/route';

/** The beat a departure gets, in ms. Long enough to see, short enough to
 *  feel like the tap did it. Reduced motion keeps the beat and snaps the
 *  fade, which is CSS's decision, not this file's. */
const FADE_MS = 140;

/**
 * The two remaining REAL reloads: the service worker's "new version", where
 * a fresh bundle genuinely needs a navigation to load, and the boot-failure
 * panel, where the page may be too broken to swap anything in place.
 *
 * Everything else goes through `transition`.
 */
export function departTo(go: () => void): void {
  document.documentElement.classList.add('departing');
  window.setTimeout(go, FADE_MS);
}

/**
 * One swap at a time.
 *
 * A double-tapped button, or a burst of history events, must not run two
 * teardowns concurrently — the second would destroy a renderer the first is
 * still building. Later taps during a swap are dropped rather than queued:
 * the fade has already swallowed the pointer events, so anything arriving
 * here is a race rather than an intention.
 */
let busy = false;

export async function transition(swap: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  document.documentElement.classList.add('departing');
  await new Promise((resolve) => setTimeout(resolve, FADE_MS));
  try {
    await swap();
  } finally {
    // Whatever happened, the page comes back: a swap that threw still has to
    // leave something tappable behind, and the error itself reaches the
    // failure panel through the window listeners in main.ts.
    document.documentElement.classList.remove('departing');
    busy = false;
  }
}

/**
 * Write a route into the address bar.
 *
 * Built from `location.pathname` and the route alone, which is the same rule
 * `share()` follows and for the same reason: a `Route` cannot express `?ff=`,
 * `?theme=` or `?hex=`, so this can never preserve the device's own test rig
 * — and it can never carry one onto a phone the URL is later sent to. Those
 * three are persisted to storage the moment they arrive, so dropping them
 * from the bar costs nothing but the clutter.
 *
 * `push` is for the doors a player walks INTO and expects to come back out
 * of; `replace` is for everything that changes what the current entry means.
 */
export function setRoute(route: Route, how: 'push' | 'replace'): void {
  const url = `${location.pathname}${searchFor(route)}`;
  // Nothing to record: a double-tap on HOME should not stack two identical
  // entries for BACK to walk through.
  if (how === 'push' && url === `${location.pathname}${location.search}`) return;
  try {
    if (how === 'push') history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  } catch {
    // A browser refusing the History API (or a file:// page) keeps the URL it
    // has. The session is already being swapped by the caller either way, so
    // the game is right — only the address bar is stale.
  }
}
