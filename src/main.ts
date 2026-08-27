/**
 * The entry. One page load hosts the app: the error plumbing, the service
 * worker, and the session (@shell/session) that is everything else. Until
 * 2026-08-27 this file was the whole shell — 4,100 lines of it; the
 * reload-removal refactor moved the body into src/shell/ and left the page
 * scaffolding here.
 */
import { parseRoute } from '@meta/route';
import { showFailure } from '@shell/failure';
import { showUpdateNote } from '@shell/notes';
import { followHistory, startSession } from '@shell/session';

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

/** Once per PAGE, never per session: the interval and the visibility listener
 *  below must not stack when a session restarts in place. */
function registerServiceWorker(): void {
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
}

void startSession(parseRoute(location.search))
  .then(() => {
    // BACK and FORWARD, wired only once the first session is actually up.
    // `restart` serialises swaps through the router's own busy flag, but the
    // FIRST session is started directly rather than through it — so a
    // `popstate` arriving mid-boot would build a second session alongside
    // the one still mounting, and two live renderers is the one state this
    // refactor must never reach. Nothing can be navigated from before the
    // first paint anyway.
    followHistory();
    registerServiceWorker();
  })
  .catch((error: unknown) => {
    showFailure(error);
  });
