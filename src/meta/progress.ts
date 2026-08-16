import type { Tuning } from '@content/tuning';

/**
 * The roguelite layer: what you keep when a run ends.
 *
 * Marc set its shape on 2026-08-15, in four answers:
 *
 * - **A currency that is not points.** "A new currency so you need to decide
 *   vs a good point game vs advancing roguelite." Points stay the score you
 *   chase; RELICS buy upgrades, and the two compete for the same pockets. A
 *   run played for the record book is not a run played for the next run.
 * - **Carried across every world.** Upgrades are yours on any world seed, so
 *   a new world is a fresh map and never a reset. (Shrines stay per-world, so
 *   a world still has a story of its own.)
 * - **Spent on the end screen**, at the moment the numbers mean something.
 * - **One perk, plus a second slot unlocked late.**
 *
 * Everything here is plain data with no DOM and no storage: the shell reads
 * and writes it, this module only says what it means.
 */

export type UpgradeId = 'tiles' | 'odds' | 'world' | 'slot' | 'rootbound' | 'secondwind';

export type Upgrade = {
  readonly id: UpgradeId;
  readonly name: string;
  /** What it does, in the words the shop prints. */
  readonly note: string;
  /** Relics for the first level; each level after costs `cost * (level + 1)`. */
  readonly cost: number;
  /** How many times it can be bought. Perks and the slot are bought once. */
  readonly levels: number;
  /** True for the two perks, which are equipped rather than merely owned. */
  readonly perk: boolean;
};

/**
 * The shop.
 *
 * Three upgrades are deliberately BORING — a bigger purse, better odds, a
 * richer world. They are the steady floor that makes run 20 feel unlike run
 * 1, and they are boring on purpose so the perks can be strange. The two
 * perks are the ones Marc picked out of a brainstorm of sixteen; the four
 * rule-breakers he was not convinced by are in `ideas/uniques.md`, unbuilt.
 */
export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'tiles',
    name: 'DEEPER PURSE',
    note: '+5 tiles to start every run.',
    cost: 20,
    levels: 8,
    perk: false,
  },
  {
    id: 'odds',
    name: 'KEENER EYE',
    note: 'Magic and unique tiles turn up more often, on every run, for good.',
    cost: 35,
    levels: 5,
    perk: false,
  },
  {
    id: 'world',
    name: 'RICHER WORLDS',
    note: 'More caches, sites and territories out there to find.',
    cost: 50,
    levels: 4,
    perk: false,
  },
  {
    id: 'rootbound',
    name: 'ROOTBOUND',
    note: 'Native ground pays DOUBLE. Ground that is not yours pays nothing at all.',
    cost: 120,
    levels: 1,
    perk: true,
  },
  {
    id: 'secondwind',
    name: 'SECOND WIND',
    note: 'The first time a run would end broke, a coin is flipped. Half the time you carry on with 20 tiles. Half the time you do not.',
    cost: 150,
    levels: 1,
    perk: true,
  },
  {
    id: 'slot',
    name: 'SECOND SLOT',
    note: 'Carry two perks at once instead of one.',
    cost: 400,
    levels: 1,
    perk: false,
  },
];

export type Progress = {
  readonly relics: number;
  /** Levels bought, by upgrade. Absent means none. */
  readonly bought: Readonly<Partial<Record<UpgradeId, number>>>;
  /** Perks the player has chosen to carry. Longer than the slots is invalid. */
  readonly equipped: readonly UpgradeId[];
};

export const EMPTY_PROGRESS: Progress = { relics: 0, bought: {}, equipped: [] };

export const levelOf = (progress: Progress, id: UpgradeId): number => progress.bought[id] ?? 0;

/** How many perks may be carried: one, or two once the slot is bought. */
export const slotsOf = (progress: Progress): number => 1 + levelOf(progress, 'slot');

/**
 * What the next level of an upgrade costs, or null when it is maxed.
 *
 * Prices climb per level so that the boring upgrades stay worth buying early
 * and stop being the obvious purchase later — otherwise a player would take
 * eight purses before ever seeing a perk, and the interesting half of the
 * shop would never open.
 */
export function priceOf(progress: Progress, upgrade: Upgrade): number | null {
  const level = levelOf(progress, upgrade.id);
  if (level >= upgrade.levels) return null;
  return upgrade.cost * (level + 1);
}

export const canAfford = (progress: Progress, upgrade: Upgrade): boolean => {
  const price = priceOf(progress, upgrade);
  return price !== null && progress.relics >= price;
};

/**
 * Buy one level. Returns the progress unchanged when it cannot be afforded —
 * the same contract the engine keeps, for the same reason.
 *
 * A perk bought is EQUIPPED immediately if there is a free slot, because the
 * alternative is a player spending 150 relics and seeing nothing happen.
 */
export function buy(progress: Progress, upgrade: Upgrade): Progress {
  const price = priceOf(progress, upgrade);
  if (price === null || progress.relics < price) return progress;

  const bought = { ...progress.bought, [upgrade.id]: levelOf(progress, upgrade.id) + 1 };
  const next: Progress = { ...progress, relics: progress.relics - price, bought };
  if (!upgrade.perk || next.equipped.length >= slotsOf(next)) return next;
  return { ...next, equipped: [...next.equipped, upgrade.id] };
}

/**
 * Equip or unequip an owned perk.
 *
 * With two perks and one slot this is a real decision, which is the point of
 * the slot being an upgrade rather than a given. Equipping past the slot
 * count drops the OLDEST perk, so the tap always does something visible
 * rather than silently refusing.
 */
export function equip(progress: Progress, id: UpgradeId): Progress {
  if (levelOf(progress, id) === 0) return progress;
  if (progress.equipped.includes(id)) {
    return { ...progress, equipped: progress.equipped.filter((e) => e !== id) };
  }
  const slots = slotsOf(progress);
  const kept = progress.equipped.slice(Math.max(0, progress.equipped.length - (slots - 1)));
  return { ...progress, equipped: [...kept, id] };
}

/**
 * Fold what has been bought into the run's economy.
 *
 * This is the ONLY place progress touches balance, and it produces a `Tuning`
 * — so a run still carries its whole economy in its state, a replay still
 * knows which economy it was recorded under, and the harness can play any
 * point on the upgrade ladder with `--set`.
 */
export function applyProgress(tuning: Tuning, progress: Progress): Tuning {
  const equipped = new Set(progress.equipped);
  const level = (id: UpgradeId): number => levelOf(progress, id);

  return {
    ...tuning,
    startingTiles: tuning.startingTiles + level('tiles') * 5,
    magicChance: tuning.magicChance + level('odds') * 0.02,
    uniqueChance: tuning.uniqueChance + level('odds') * 0.005,
    destinationChance: Math.min(1, tuning.destinationChance + level('world') * 0.08),
    rootboundOnly: equipped.has('rootbound'),
    secondWindTiles: equipped.has('secondwind') ? 20 : 0,
    secondWindChance: equipped.has('secondwind') ? 0.5 : 0,
  };
}

/**
 * Read progress back from storage, refusing anything that is not the shape
 * this version writes. A corrupt or older blob starts empty rather than
 * crashing the shell on load — the same tolerance `decodeRun` keeps.
 */
export function decodeProgress(raw: string | null): Progress {
  if (raw === null) return EMPTY_PROGRESS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_PROGRESS;

    const { relics, bought, equipped } = parsed as Partial<Progress>;
    if (typeof relics !== 'number' || !Number.isFinite(relics)) return EMPTY_PROGRESS;
    if (typeof bought !== 'object' || bought === null) return EMPTY_PROGRESS;

    const known = new Set(UPGRADES.map((u) => u.id));
    const clean: Partial<Record<UpgradeId, number>> = {};
    for (const [id, n] of Object.entries(bought)) {
      if (known.has(id as UpgradeId) && typeof n === 'number' && n > 0) {
        clean[id as UpgradeId] = Math.floor(n);
      }
    }

    const worn: UpgradeId[] = Array.isArray(equipped)
      ? (equipped as unknown[]).filter(
          (id): id is UpgradeId =>
            typeof id === 'string' &&
            known.has(id as UpgradeId) &&
            clean[id as UpgradeId] !== undefined,
        )
      : [];

    const progress: Progress = {
      relics: Math.max(0, Math.floor(relics)),
      bought: clean,
      equipped: worn,
    };
    return { ...progress, equipped: worn.slice(0, slotsOf(progress)) };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export const encodeProgress = (progress: Progress): string => JSON.stringify(progress);
