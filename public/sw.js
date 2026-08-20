/*
 * The service worker: Ashwake, offline.
 *
 * The game has been client-only since Session 0 — no backend, no accounts, no
 * network in the loop — so "works on a plane" is a caching problem and nothing
 * else. The strategy is deliberately the boring one:
 *
 *   NAVIGATIONS  network first, cache as fallback — and the network gets 2.5
 *                seconds. A player who is online must get the build that just
 *                deployed; a player who is not must still get a game; and a
 *                player on one flickering bar is the second case wearing the
 *                first one's clothes — without the timer they stared at a
 *                blank tab for the browser's own 30s+ while a complete game
 *                sat in the cache. A network response that beats the timer
 *                still wins, and still refreshes the cache even when it
 *                loses. Stale HTML is the one thing that would make
 *                `verify-deploy` a liar, and the timer never serves stale to
 *                anyone the network could actually reach in time.
 *   EVERYTHING   cache first, then network, then store. Vite fingerprints its
 *   ELSE         assets, so a cached hash is immutable and a new build simply
 *                asks for different names.
 *
 * The cache name carries the build, so deploying evicts the old one wholesale
 * rather than leaving a museum of half-versions in people's phones.
 */

const VERSION = 'ashwake-__BUILD_SHA__';
// The hashed bundle is stamped in at build time, same as the sha. It has to
// be PRECACHED, not just opportunistically cached: this worker registers
// after the first playable frame, so on visit one the page's own JS was
// fetched before the worker controlled anything — and an offline visit two
// then got a cached index.html pointing at a script the cache never held.
// A white screen, from the feature that exists to prevent one (2026-08-18).
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  // The install icons live in public/, outside the recursive assets walk —
  // without them here an offline install prompt (and the apple-touch-icon)
  // fell back to nothing (fresh-eyes, 2026-08-20).
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  // The self-hosted faces (2026-08-20): public/fonts/ sits outside the
  // assets walk, and offline typography was the point of self-hosting.
  '/fonts/cinzel.woff2',
  '/fonts/ebgaramond.woff2',
  '/fonts/ebgaramond-italic.woff2',
  '/icon-maskable-512.png',
  ...JSON.parse('__PRECACHE_ASSETS__'),
];

// The shell the game cannot boot without: the page and its bundle. These
// stay all-or-nothing — a half-cached shell is the white screen this worker
// exists to prevent, so failing the install (and retrying next visit) is
// the correct outcome. Everything else (icons, art, manifests) is comfort:
// cached best-effort, because one flaky art fetch voiding ALL of offline
// was the all-or-nothing addAll's silent failure mode (2026-08-20).
const isCore = (url) =>
  url === '/' || url === '/index.html' || url.endsWith('.js') || url.endsWith('.css');

self.addEventListener('install', (event) => {
  // Take over as soon as the new build is cached: a game with no server state
  // has nothing to migrate, so waiting for every tab to close buys nothing.
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        cache
          .addAll(PRECACHE.filter(isCore))
          .then(() =>
            Promise.all(
              PRECACHE.filter((url) => !isCore(url)).map((url) =>
                cache.add(url).catch(() => undefined),
              ),
            ),
          ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The version stamp must never be served from cache: it is the file that
  // answers "which build is this", and a cached answer is a wrong answer.
  if (url.pathname === '/version.json') return;

  if (request.mode === 'navigate') {
    // How long the network gets before the cached shell answers instead.
    const NAV_TIMEOUT_MS = 2500;
    const network = fetch(request);

    // The cache refresh rides on waitUntil, not on the response: when the
    // timer wins, the page has already been answered from cache, and the
    // late network response must still land in the cache for next time.
    event.waitUntil(
      network
        .then((response) =>
          caches.open(VERSION).then((cache) => cache.put(request, response.clone())),
        )
        .catch(() => undefined),
    );

    event.respondWith(
      (async () => {
        const winner = await Promise.race([
          network.catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)),
        ]);
        if (winner !== null) return winner;

        const cached = (await caches.match(request)) ?? (await caches.match('/index.html'));
        // A first visit on a line this slow has nothing cached yet, so the
        // network — however late — is the only answer left to wait for.
        return cached ?? network;
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit !== undefined) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
