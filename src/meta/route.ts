/**
 * The URL as data: which game a page of Ashwake is opening.
 *
 * `?seed=123` replays an exact run — the engine is deterministic precisely so
 * that "it did something odd on my phone" can become "run this seed", and an
 * EXPLICIT seed outranks a saved run because a shared link must open that run.
 * `?daily=YYYY-MM-DD` opens that date's shared world, validated because
 * garbage in the URL is not a daily (`isPlayableDaily` owns the shape AND the
 * epoch rule). `?camp=1` begins the next fresh run at the world's farthest
 * territory.
 *
 * Pure and typed on purpose (2026-08-27, the reload-removal refactor): a
 * `Route` cannot express `?ff=`, `?theme=` or `?hex=` — the device's own test
 * rig — so a URL built from one can never carry the rig onto somebody else's
 * phone, which is the invariant both launch audits caught by hand in
 * `share()`. Rig params stay boot-style overrides read at a session's top.
 */
import { isPlayableDaily } from '@meta/daily';

export type Route = {
  /** A shared `?seed=` replay, or null off a link. */
  readonly seed: number | null;
  /** The daily's date, or null outside the daily. */
  readonly daily: string | null;
  /** Begin at the farthest territory (`?camp=1`). */
  readonly camp: boolean;
};

/** The front door of your own world: no seed, no daily, no camp. */
export const HOME: Route = { seed: null, daily: null, camp: false };

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);

  const seedAsked = params.get('seed');
  const seedParsed = seedAsked === null ? Number.NaN : Number(seedAsked);
  const seed = Number.isFinite(seedParsed) ? Math.trunc(seedParsed) : null;

  const dailyAsked = params.get('daily');
  const daily = dailyAsked !== null && isPlayableDaily(dailyAsked) ? dailyAsked : null;

  return { seed, daily, camp: params.get('camp') === '1' };
}

/** The search string a route answers to — `''` for home, `?daily=…` else. */
export function searchFor(route: Route): string {
  const params = new URLSearchParams();
  if (route.seed !== null) params.set('seed', String(route.seed));
  if (route.daily !== null) params.set('daily', route.daily);
  if (route.camp) params.set('camp', '1');
  const s = params.toString();
  return s === '' ? '' : `?${s}`;
}
