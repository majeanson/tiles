import { dailyName, ordinal } from './daily';

/**
 * The words and the link a shared run travels as.
 *
 * This is the game's ENTIRE distribution mechanism. There is no backend, no
 * account and no store listing: a run reaches another person because somebody
 * pasted this sentence and this URL into a chat. It lived inside `main.ts`'s
 * `share` hook, untested, next to the share-sheet plumbing — so the one
 * string the project's growth depends on was covered by nothing at all.
 *
 * Pure by construction, like every other `meta/` module: facts in, a sentence
 * and a query out. The shell owns `location`, the clipboard and the share
 * sheet; nothing here knows those exist.
 */

export type ShareSubject =
  | {
      readonly kind: 'run';
      readonly points: number;
      readonly placements: number;
      readonly seed: number;
      /** The sparkline, or '' where the run had no harvests to draw. */
      readonly arc: string;
    }
  | {
      readonly kind: 'daily';
      readonly date: string;
      readonly points: number;
      readonly reach: number;
      /** The sparkline, or '' where the run had no harvests to draw. */
      readonly arc: string;
      readonly tries: number;
    };

export type Shared = {
  readonly text: string;
  /** Exactly the query the receiver needs — never this device's own rig. */
  readonly params: Readonly<Record<string, string>>;
};

/**
 * What to say, and what to put in the query string.
 *
 * The params are returned rather than a whole URL because the ORIGIN is the
 * shell's business, and getting that wrong has bitten twice: a link built
 * from `location.href` drags the sender's own overrides along — `?ff=`,
 * `?theme=`, `?hex=`, `?camp=` — and an arriving `?ff=` is PERSISTED, so a
 * stale override would install itself on every phone the link ever reached.
 * Handing back only the params makes that mistake impossible to make here.
 */
export function shareOf(name: string, subject: ShareSubject): Shared {
  if (subject.kind === 'daily') {
    // The daily's line is a scoreboard entry: which day, the score, how far,
    // the shape of the run, and the try count — confessed rather than hidden,
    // which is the design's own honesty rule (`ideas/daily.md`).
    const arc = subject.arc === '' ? '' : ` · ${subject.arc}`;
    return {
      text:
        `${name} ${dailyName(subject.date)} · ${subject.points} pts · ` +
        `reach ${subject.reach}${arc} · ${ordinal(subject.tries)} try · beat it:`,
      params: { daily: subject.date },
    };
  }
  // The run's shape rides along the way the daily's always has (2026-08-26):
  // the sparkline was stored on every timeline row and drawn in the daily's
  // line, while the game's MAIN share string never carried it.
  const arc = subject.arc === '' ? '' : ` · ${subject.arc}`;
  return {
    text: `${name}: ${subject.points} pts in ${subject.placements} placements${arc}. Beat my run:`,
    params: { seed: String(subject.seed) },
  };
}
