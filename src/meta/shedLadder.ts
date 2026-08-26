/**
 * The shed ladder: what a storage-full write triages away, in order.
 *
 * `main.ts`'s `onChange` cannot fail to save the run in progress — it is the
 * one thing on the device that cannot be regenerated — so when `localStorage`
 * throws it sheds other things, cheapest loss first, and retries. This
 * module owns exactly the ORDERING and the honest sentence each rung reports;
 * the actual `localStorage.removeItem` calls stay in `main.ts`, keyed by a
 * slot number this module has no business knowing.
 *
 * The order is not arbitrary — it survived a real bug (2026-08-20). An
 * earlier two-rung version shed `keys.world` while leaving `keys.run`: the
 * next boot found no world, minted a fresh random one, then resumed the old
 * run — whose `rootSeed` no longer matched the new world's — and the merge
 * had no seed guard, so a foreign geography got unioned into the new world's
 * revealed ground. The rule that came out of it: spend the genuinely cheap
 * things first, and never touch the world being played (rung 4 sheds every
 * OTHER world, never the active one).
 *
 * Each rung says its OWN sentence rather than sharing one, because "some
 * history was cleared" is a fair description of the diary and a lie about a
 * world.
 */

export type ShedRungId =
  /** A diagnostic record. Free, and nobody's memory of anything. */
  | 'lastError'
  /**
   * The other slots' receipts — small, and a receipt is a one-shot toast
   * nobody is waiting for on a world they are not in.
   */
  | 'otherReceipts'
  /** The diary. Your worlds, relics and perks are untouched. */
  | 'timeline'
  /**
   * Every OTHER world's whole footprint (world, run, shop levels) — never
   * the one being played, which is the point of the ladder existing.
   */
  | 'otherWorlds';

export type ShedRung = {
  readonly id: ShedRungId;
  /** The one sentence this rung reports if it is the one that freed enough room. */
  readonly note: string;
};

/**
 * Cheapest and least missed first; the active world is never a rung at all,
 * because it is what the whole ladder exists to protect.
 */
export const SHED_LADDER: readonly ShedRung[] = [
  {
    id: 'lastError',
    note: 'Storage was full — a diagnostic record was cleared so your run could be saved.',
  },
  {
    id: 'otherReceipts',
    note: 'Storage was full — some notes from your other worlds were cleared so your run could be saved.',
  },
  {
    id: 'timeline',
    note: 'Storage was full — your diary was cleared so your run could be saved. Your worlds, relics and perks are untouched.',
  },
  {
    id: 'otherWorlds',
    note: 'Storage was full — your OTHER worlds were forgotten so this run could be saved. The world you are in is untouched.',
  },
];
