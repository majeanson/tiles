/*
 * The service worker: Ashwake, offline.
 *
 * The game has been client-only since Session 0 — no backend, no accounts, no
 * network in the loop — so "works on a plane" is a caching problem and nothing
 * else. The strategy is deliberately the boring one:
 *
 *   NAVIGATIONS  network first, cache as fallback. A player who is online must
 *                get the build that just deployed; a player who is not must
 *                still get a game. Stale HTML is the one thing that would make
 *                `verify-deploy` a liar.
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
  ...JSON.parse('__PRECACHE_ASSETS__'),
];

self.addEventListener('install', (event) => {
  // Take over as soon as the new build is cached: a game with no server state
  // has nothing to migrate, so waiting for every tab to close buys nothing.
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
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
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/index.html'))),
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
