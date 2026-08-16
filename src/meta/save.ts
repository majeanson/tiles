import type { GameState } from '@engine/state';

/**
 * A run, kept.
 *
 * `GameState` has been plain JSON since Session 0 — counter-based rng, tuning
 * carried in state, no closures — precisely so this file could eventually be
 * twenty lines. Encoding is `JSON.stringify`; the work is DECODING, because a
 * saved run is untrusted input: written by an older build, truncated by a
 * browser, or poked at in devtools. A save that fails any structural check is
 * discarded and the game starts fresh — a lost run is an annoyance, a
 * half-corrupt run resurrected into the reducer is a haunting.
 *
 * A resumed run plays under its OWN saved tuning, not today's: a run is
 * reproducible from its seed and its rules, and rebalancing the game must not
 * silently re-score a run in progress. New settings apply from the next run.
 */

export const encodeRun = (state: GameState): string => JSON.stringify(state);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStream = (v: unknown): boolean =>
  isRecord(v) && typeof v['seed'] === 'number' && typeof v['cursor'] === 'number';

const isTile = (v: unknown): boolean =>
  isRecord(v) &&
  typeof v['id'] === 'string' &&
  typeof v['colour'] === 'string' &&
  typeof v['rarity'] === 'string';

export function decodeRun(raw: string | null): GameState | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  // Structural checks, shallow on purpose: enough to guarantee the reducer's
  // assumptions (fields exist and carry the right primitive shapes), without
  // re-implementing the type system in `if` statements. A malicious save can
  // still lose its own game; it cannot crash the loop.
  if (parsed['version'] !== 1) return null;
  if (parsed['phase'] !== 'placing' && parsed['phase'] !== 'ended') return null;
  for (const key of ['tiles', 'points', 'placements', 'rootSeed']) {
    if (typeof parsed[key] !== 'number') return null;
  }

  const tuning = parsed['tuning'];
  if (!isRecord(tuning)) return null;
  for (const key of ['startingTiles', 'baseCost', 'costRisesEvery', 'draftWidth']) {
    if (typeof tuning[key] !== 'number') return null;
  }

  const rng = parsed['rng'];
  if (
    !isRecord(rng) ||
    !isStream(rng['region']) ||
    !isStream(rng['tiles']) ||
    !isStream(rng['loot'])
  ) {
    return null;
  }

  if (!isRecord(parsed['cells'])) return null;
  if (!Array.isArray(parsed['draft']) || !parsed['draft'].every(isTile)) return null;
  if (typeof parsed['selected'] !== 'number') return null;

  const log = parsed['log'];
  if (!isRecord(log) || !Array.isArray(log['harvests']) || typeof log['popped'] !== 'number') {
    return null;
  }

  /**
   * Fields that arrived AFTER saves already existed.
   *
   * A run written before one of them is not corrupt, it is just older, so each
   * is filled rather than rejected — that is the difference between a save
   * format that can evolve and one that eats a run every time the game grows.
   *
   * Filling is also not optional. An absent field decodes as `undefined`, and
   * `undefined` slips past every `=== null` guard in the codebase before
   * crashing on the property access underneath it.
   *
   * Not hypothetical: `lastPlaced` shipped on 2026-08-16 without this block,
   * so every saved run decoded with `lastPlaced: undefined`, which reached
   * `parse(undefined)` on the first frame and took the whole render down with
   * it. Marc opened the game to a black screen. Anything added to `GameState`
   * from here belongs in this list on the same commit.
   */
  const claimed = parsed['claimed'];
  const bias = parsed['bias'];
  const lastPlaced = parsed['lastPlaced'];
  const quest = parsed['quest'];
  const held = parsed['held'];

  const state = {
    ...parsed,
    claimed: Array.isArray(claimed) && claimed.every((k) => typeof k === 'string') ? claimed : [],
    lastPlaced: typeof lastPlaced === 'string' ? lastPlaced : null,
    bias:
      isRecord(bias) && typeof bias['colour'] === 'string' && typeof bias['left'] === 'number'
        ? bias
        : null,
    quest: isRecord(quest) ? quest : null,
    held: isTile(held) ? held : null,
    luck: typeof parsed['luck'] === 'number' ? parsed['luck'] : 0,
    relics: typeof parsed['relics'] === 'number' ? parsed['relics'] : 0,
    usedSecondWind: parsed['usedSecondWind'] === true,
  };
  return state as unknown as GameState;
}
