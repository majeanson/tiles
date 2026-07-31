/**
 * Seeded randomness as plain data.
 *
 * A stream is `{ seed, cursor }` — never a closure, never a mutable generator.
 * That is what makes `GameState` JSON-round-trippable, and it buys three things
 * at once: save-and-resume, golden tests, and a replay format where a root seed
 * plus an action list reconstructs any run exactly.
 *
 * Streams are NAMED and separate (see RngStreams) so that rerolling a draft
 * cannot perturb region generation. Sharing one stream across concerns makes
 * every reproduction bug a heisenbug.
 */

export type RngStream = { readonly seed: number; readonly cursor: number };

export const stream = (seed: number): RngStream => ({ seed, cursor: 0 });

/**
 * mulberry32, re-expressed as a counter-based function of (seed, cursor) rather
 * than a self-mutating accumulator. Same output quality; addressable by index.
 */
function sample(seed: number, cursor: number): number {
  let t = (seed + Math.imul(0x6d2b79f5, cursor + 1)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A float in [0, 1) and the advanced stream. The input is never mutated. */
export function rngNext(s: RngStream): [number, RngStream] {
  return [sample(s.seed, s.cursor), { seed: s.seed, cursor: s.cursor + 1 }];
}

/** An integer in [0, n). */
export function rngInt(s: RngStream, n: number): [number, RngStream] {
  const [v, next] = rngNext(s);
  return [Math.floor(v * n), next];
}

export function rngPick<T>(s: RngStream, xs: readonly T[]): [T, RngStream] {
  if (xs.length === 0) throw new Error('rngPick: empty array');
  const [i, next] = rngInt(s, xs.length);
  return [xs[i]!, next];
}

/** True with probability `p`. */
export function rngChance(s: RngStream, p: number): [boolean, RngStream] {
  const [v, next] = rngNext(s);
  return [v < p, next];
}

/**
 * Weighted choice over ORDERED pairs, not a Record.
 *
 * A Record would make the result depend on object key insertion order, so
 * re-sorting a content table alphabetically would silently change every seed's
 * output. Pairs make the order explicit and reviewable.
 */
export function rngWeighted<T>(
  s: RngStream,
  entries: readonly (readonly [T, number])[],
): [T, RngStream] {
  let total = 0;
  for (const [, w] of entries) {
    if (w < 0) throw new Error('rngWeighted: negative weight');
    total += w;
  }
  if (total <= 0) throw new Error('rngWeighted: weights sum to zero');

  const [v, next] = rngNext(s);
  let acc = v * total;
  for (const [item, w] of entries) {
    acc -= w;
    if (acc < 0) return [item, next];
  }
  // Only reachable through float error at the very top of the range.
  return [entries[entries.length - 1]![0], next];
}

/**
 * The named streams. Each concern owns one so that consuming randomness in one
 * place cannot shift the sequence in another.
 */
export type RngStreams = {
  readonly region: RngStream;
  readonly tiles: RngStream;
  readonly loot: RngStream;
};

/**
 * Derive every stream from one root seed. The offsets are arbitrary but fixed —
 * they exist so two streams from the same root do not produce identical
 * sequences, which would defeat the point of separating them.
 */
export const streamsFrom = (rootSeed: number): RngStreams => ({
  region: stream((rootSeed ^ 0x9e3779b9) | 0),
  tiles: stream((rootSeed ^ 0x85ebca6b) | 0),
  loot: stream((rootSeed ^ 0xc2b2ae35) | 0),
});
