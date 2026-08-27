import { PERK_DIALS, UPGRADE_STEPS } from '@content/goals';
import type { Tuning } from '@content/tuning';
import { rngNext, stream } from '@engine/rng';

/**
 * The roguelite layer: what you keep when a run ends.
 *
 * Marc set its shape on 2026-08-15, in four answers:
 *
 * - **A currency that is not points.** "A new currency so you need to decide
 *   vs a good point game vs advancing roguelite." Points stay the score you
 *   chase; RELICS buy upgrades, and the two compete for the same pockets. A
 *   run played for the record book is not a run played for the next run.
 * - **Carried across every world.** As Marc first set it: upgrades are yours
 *   on any world seed, so a new world is a fresh map and never a reset.
 *   AMENDED TWICE since, both times by him, both times narrowing it — the
 *   line is kept as written because the amendments only make sense against
 *   it. 2026-08-20: the economy SPLIT — the RELICS travel, what you BUY with
 *   them stays in the world you bought it in (`meta/shopLevels.ts`).
 *   2026-08-26: perks joined the bought side — a found perk belongs to the
 *   world that hid it (`WorldMemory.perks`/`worn`), and this module's blob
 *   refuses to carry one at all. What is left of "carried across every
 *   world" is the purse, and the purse alone.
 * - **Spent on the end screen**, at the moment the numbers mean something.
 *
 * And reshaped it on 2026-08-18, resolving `ideas/uniques.md`:
 *
 * - **Perks are FOUND, never bought.** The shop keeps the boring upgrades and
 *   sells the nose (KEEN NOSE); the perks themselves are granted by hidden
 *   finds out in the world. Owning one is a fact about where you have been.
 * - **Strictly ONE perk carried.** The second slot is deleted and refunded on
 *   load — a run has one identity, and combinations are where Diablo's
 *   balance went to die.
 *
 * Everything here is plain data with no DOM and no storage: the shell reads
 * and writes it, this module only says what it means.
 */

export type UpgradeId = 'tiles' | 'odds' | 'world' | 'pace' | 'sense';

export type Upgrade = {
  readonly id: UpgradeId;
  readonly name: string;
  /** What it does, in the words the shop prints. */
  readonly note: string;
  /** Relics for the first level; each level after costs `cost * (level + 1)`. */
  readonly cost: number;
  /** How many times it can be bought. */
  readonly levels: number;
};

/**
 * The shop.
 *
 * Every upgrade is deliberately BORING — a bigger purse, better odds, a
 * richer world, a cheaper curve, a keener nose. They are the steady floor
 * that makes run 20 feel unlike run 1, and they are boring on purpose so the
 * perks can be strange. The perks themselves are not for sale: they are found
 * in the world (`grantFind`), which is the 2026-08-18 decision in one line —
 * the shop sells the nose, never the prize.
 */
export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'tiles',
    name: 'DEEPER PURSE',
    note: `+${UPGRADE_STEPS.tiles} tiles to start every run.`,
    cost: 20,
    levels: 8,
  },
  {
    id: 'odds',
    name: 'KEENER EYE',
    note: 'Magic and unique tiles turn up more often, on every run, for good.',
    cost: 35,
    levels: 5,
  },
  {
    id: 'world',
    name: 'RICHER WORLDS',
    note: 'More caches, sites and territories out there to find — and richer caches when you reach them.',
    cost: 50,
    levels: 4,
  },
  {
    id: 'pace',
    name: 'STEADY PACE',
    note: 'Placements stay cheap for longer, on every run, for good.',
    cost: 30,
    levels: 4,
  },
  {
    id: 'sense',
    name: 'KEEN NOSE',
    note: `Hidden finds shimmer when your ground grows near — +${UPGRADE_STEPS.sense} hexes farther each level.`,
    cost: 40,
    levels: 3,
  },
];

export type PerkId = 'rootbound' | 'secondwind' | 'stonewalker' | 'wallbreaker' | 'openhand';

export type Perk = {
  readonly id: PerkId;
  readonly name: string;
  /** What it does, in the words the shelf prints — once it is yours. */
  readonly note: string;
};

/**
 * The findable pool, in the order the shelf lists it. Names in the shop's
 * plain-caps voice; what each one costs is not relics but a walk — a hidden
 * find grants one of these, unowned ones only, and an undiscovered perk shows
 * on the shelf as a mystery row with no name. Do not print these names
 * anywhere an unowned perk is being described.
 */
export const PERKS: readonly Perk[] = [
  {
    id: 'rootbound',
    name: 'ROOTBOUND',
    note: 'Native ground pays DOUBLE. Ground that is not yours pays nothing at all.',
  },
  {
    id: 'secondwind',
    name: 'SECOND WIND',
    note: `The first time a run would end broke, a coin is flipped: ${Math.round(PERK_DIALS.secondWindChance * 100)}% of the time you carry on with ${PERK_DIALS.secondWindTiles} tiles, and the rest of the time you do not.`,
  },
  {
    id: 'stonewalker',
    name: 'STONEWALKER',
    note: `Placements beside stone cost ${PERK_DIALS.stoneDiscount} less.`,
  },
  {
    id: 'wallbreaker',
    name: 'WALLBREAKER',
    note: `Walls can be built on, at ${PERK_DIALS.wallBuildCostMult}× cost.`,
  },
  {
    id: 'openhand',
    name: 'OPEN HAND',
    note: `Draft ${PERK_DIALS.openHandDraft} tiles. No stash.`,
  },
];

/*  removed 2026-08-21 — unused. The shelf and the find-grant both
 * work from the PERKS list itself. */

/**
 * Teaching, drop by drop (`ideas/teaching.md`, 2026-08-19): the concepts this
 * DEVICE has met, each explained exactly once, at the moment it first
 * happens. Per device rather than per world because confusion is a property
 * of the player, not the map — abandoning a world must not re-teach; a new
 * phone does. The list is the union the UI fires from AND the migration
 * seed: a save from before teaching existed decodes as having met all of
 * them, so every existing player sees nothing, with no flag to flip.
 */
export const TEACH_IDS = [
  // The very first lesson (2026-08-20, the launch audit's finding: nobody was
  // ever told how to place a tile outside the opt-in manual): one card, at
  // the start of a genuinely virgin device's first run — see
  // `Game#announceArrival`, which guards it on an EMPTY ledger so a veteran
  // device that predates this id never sees it.
  'place',
  'ripe',
  'pop',
  'costRise',
  'glow',
  'cache',
  'site',
  'territory',
  'shrine',
  'wall',
  'field',
  'rare',
  // UNIQUE's own card (2026-08-20, Marc's rehearsal find: "when getting
  // both unique and magic in the same hand only the magic help popped") —
  // one shared `rare` id meant whichever rarity arrived first burned the
  // card for both. Split: `rare` is MAGIC's card now, this is UNIQUE's;
  // each fires once at its own first appearance, and a hand holding both
  // fires one card now and keeps the other armed for the next quiet
  // action. Veterans' ledgers predate the id, so — the colour-ids
  // precedent — every device gets the UNIQUE card exactly once.
  'rareUnique',
  // The fog lens's one-line invitation (same day): a run that OPENS with
  // remembered ground on screen says, once, that tapping it lights the
  // biome — the gesture was undiscoverable (Marc: "hard to discover").
  'lens',
  'luck',
  // The purse fold's own first opening (Marc, 2026-08-20: "explain all and
  // that you can lose it all too"): what each spend row IS, and that a
  // purse you die on is mostly lost. Added after launch-week ledgers
  // existed, so — like the colour ids before it — every device gets this
  // card exactly once: words nobody had been shown, at the right cost.
  'purse',
  'relic',
  // The four colour personalities (2026-08-19, same day — Marc: "the colors
  // are not explained"): each teaches itself once, at the FIRST placement of
  // that colour. Added after the first deploy, so a ledger seeded full that
  // morning re-arms exactly these four — one toast each, once, which is the
  // right cost for words nobody had been shown.
  'colourGreen',
  'colourYellow',
  'colourRed',
  'colourBlue',
  // The last-gasp rule (2026-08-19, Marc: "1 tile left but cost is 6, I can
  // still play — is that normal?"): deliberate since DESIGN.md, illegible
  // until taught at the moment it first happens.
  'lastGasp',
] as const;

export type TeachId = (typeof TEACH_IDS)[number];

export const hasMet = (progress: Progress, id: TeachId): boolean => progress.met.includes(id);

/** Mark a concept met. Idempotent, like every write in this module. */
export const meet = (progress: Progress, id: TeachId): Progress =>
  hasMet(progress, id) ? progress : { ...progress, met: [...progress.met, id] };

export type Progress = {
  readonly relics: number;
  /** Levels bought, by upgrade. Absent means none. */
  readonly bought: Readonly<Partial<Record<UpgradeId, number>>>;
  /**
   * Perks granted by hidden finds. PER-WORLD since 2026-08-26 (Marc's phone
   * ruling — a shrine promising "a fourth draft card" beside an Open Hand
   * found two worlds ago was the bug): the durable copy lives on
   * `WorldMemory.perks`/`worn` now, and these two fields exist only on the
   * in-memory COMPOSITE the shell builds with `withWorldPerks` — storage
   * never carries them here (`encodeProgress` strips, `decodeProgress`
   * refuses), so the device blob cannot leak one world's perks into another.
   */
  readonly found: readonly PerkId[];
  /** The perk being carried. Never longer than the one slot there is. */
  readonly equipped: readonly PerkId[];
  /** Concepts this device has been taught, in the order it met them. */
  readonly met: readonly TeachId[];
};

/**
 * The composite the shell actually plays with: device purse and levels,
 * THIS world's perks. Every consumer of `found`/`equipped` — the shelf,
 * `applyProgress`, `grantFind` — takes this and never notices the split.
 */
export const withWorldPerks = (
  progress: Progress,
  perks: readonly PerkId[],
  worn: PerkId | null,
): Progress => ({
  ...progress,
  found: perks,
  equipped: worn === null ? [] : [worn],
});

export const EMPTY_PROGRESS: Progress = {
  relics: 0,
  bought: {},
  found: [],
  equipped: [],
  met: [],
};

export const levelOf = (progress: Progress, id: UpgradeId): number => progress.bought[id] ?? 0;

/**
 * How many perks may be carried: one, always. The SECOND SLOT upgrade was
 * deleted and refunded on 2026-08-18 — a run has one identity, and the
 * combinations a second slot invites are where Diablo's balance went to die.
 */
export const slotsOf = (): number => 1;

/**
 * What the next level of an upgrade costs, or null when it is maxed.
 *
 * Prices climb per level so that the boring upgrades stay worth buying early
 * and stop being the obvious purchase later.
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
 */
export function buy(progress: Progress, upgrade: Upgrade): Progress {
  const price = priceOf(progress, upgrade);
  if (price === null || progress.relics < price) return progress;

  const bought = { ...progress.bought, [upgrade.id]: levelOf(progress, upgrade.id) + 1 };
  return { ...progress, relics: progress.relics - price, bought };
}

/**
 * Equip or unequip a found perk. One slot, so equipping replaces whatever was
 * worn — the tap always does something visible rather than silently refusing.
 */
export function equip(progress: Progress, id: PerkId): Progress {
  if (!progress.found.includes(id)) return progress;
  if (progress.equipped.includes(id)) {
    return { ...progress, equipped: progress.equipped.filter((e) => e !== id) };
  }
  return { ...progress, equipped: [id] };
}

/** A cheap deterministic fold of a hex key into 32 bits, for `grantFind`. */
function foldKey(hexKey: string): number {
  let h = 0;
  for (let i = 0; i < hexKey.length; i++) h = (Math.imul(h, 31) + hexKey.charCodeAt(i)) | 0;
  return h;
}

/**
 * What a hidden find grants: one perk you do not yet own, picked
 * deterministically from (worldSeed, hex) — the same find on the same world
 * gives the same answer, replay-honest like everything else — via the run
 * streams' own mulberry32, never `Math.random`. Null when every perk is
 * owned: a find met with a full shelf grants nothing, and the shell's toast
 * says so honestly.
 *
 * The granted perk AUTO-EQUIPS when nothing is worn — a find that visibly
 * changed nothing was the exact bug the shop's old auto-equip fixed, and the
 * same reasoning holds harder for something you cannot buy twice.
 */
export function grantFind(
  progress: Progress,
  worldSeed: number,
  hexKey: string,
): { progress: Progress; perk: Perk } | null {
  const unowned = PERKS.filter((p) => !progress.found.includes(p.id));
  if (unowned.length === 0) return null;

  const [roll] = rngNext(stream((worldSeed ^ foldKey(hexKey)) | 0));
  const perk = unowned[Math.floor(roll * unowned.length) % unowned.length];
  if (perk === undefined) return null;

  const next: Progress = {
    ...progress,
    found: [...progress.found, perk.id],
    equipped: progress.equipped.length === 0 ? [perk.id] : progress.equipped,
  };
  return { progress: next, perk };
}

/**
 * Fold what has been bought — and found — into the run's economy.
 *
 * This is the ONLY place progress touches balance, and it produces a `Tuning`
 * — so a run still carries its whole economy in its state, a replay still
 * knows which economy it was recorded under, and the harness can play any
 * point on the ladder with `--set`.
 */
export function applyProgress(tuning: Tuning, progress: Progress): Tuning {
  const worn = new Set(progress.equipped);
  const level = (id: UpgradeId): number => levelOf(progress, id);

  return {
    ...tuning,
    startingTiles: tuning.startingTiles + level('tiles') * UPGRADE_STEPS.tiles,
    magicChance: tuning.magicChance + level('odds') * UPGRADE_STEPS.magic,
    uniqueChance: tuning.uniqueChance + level('odds') * UPGRADE_STEPS.unique,
    // RICHER WORLDS buys back what the rebalances took: more destinations out
    // there, and caches worth more when you reach them. Since 2026-08-18 cache
    // value is graded by distance, so the restoration reads differently but
    // stays literal: a maxed base of 18 plus two rings' bonus is 26 — the
    // number caches paid before the floor first came down.
    destinationChance: Math.min(
      1,
      tuning.destinationChance + level('world') * UPGRADE_STEPS.destination,
    ),
    cachePays: tuning.cachePays + level('world') * UPGRADE_STEPS.cache,
    // STEADY PACE buys back the curve the 2026-08-18 rebalance steepened:
    // 22 at run one, +2 a level, 30 — the old curve exactly — at max. The
    // whole point of a steeper start is that this ladder exists.
    costRisesEvery: tuning.costRisesEvery + level('pace') * UPGRADE_STEPS.pace,
    // KEEN NOSE: 2 hexes of shimmer a level, 6 maxed — deliberately under
    // `beaconHorizon` (8), so a shimmer can never become a beacon.
    findSense: tuning.findSense + level('sense') * UPGRADE_STEPS.sense,
    // The worn perk, as dials. Exactly one of these blocks can fire.
    rootboundOnly: worn.has('rootbound'),
    secondWindTiles: worn.has('secondwind') ? PERK_DIALS.secondWindTiles : 0,
    secondWindChance: worn.has('secondwind') ? PERK_DIALS.secondWindChance : 0,
    stoneDiscount: worn.has('stonewalker') ? PERK_DIALS.stoneDiscount : tuning.stoneDiscount,
    wallBuildCostMult: worn.has('wallbreaker')
      ? PERK_DIALS.wallBuildCostMult
      : tuning.wallBuildCostMult,
    draftWidth: worn.has('openhand') ? PERK_DIALS.openHandDraft : tuning.draftWidth,
    holdSlots: worn.has('openhand') ? 0 : tuning.holdSlots,
  };
}

/** The exact price the second slot sold for, refunded on load when found. */
const SLOT_REFUND = 400;

/**
 * Read progress back from storage, refusing anything that is not a shape a
 * version of this module ever wrote. A corrupt or unknown blob starts empty
 * rather than crashing the shell on load — the same tolerance `decodeRun`
 * keeps.
 *
 * Two migrations from the bought-perks era (2026-08-18), both one-way:
 * ROOTBOUND and SECOND WIND stored as purchases become FOUND — anyone who
 * paid keeps them owned; a stored SECOND SLOT refunds its exact price into
 * relics and vanishes, and whatever was equipped is clamped to the one slot
 * that exists now.
 */
export function decodeProgress(raw: string | null): Progress {
  if (raw === null) return EMPTY_PROGRESS;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Arrays are rejected explicitly (2026-08-20). They used to fall out of
    // the `bought` type check below, which the salvage pass replaced — an
    // array is a shape this module never wrote, not a damaged one.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return EMPTY_PROGRESS;
    }

    const { relics, bought, met } = parsed as {
      relics?: unknown;
      bought?: unknown;
      met?: unknown;
    };
    // SALVAGED field by field (2026-08-20). Both of these used to return
    // EMPTY_PROGRESS — throwing away the relic purse AND every perk the
    // player had walked to — because one unrelated field was the wrong
    // shape. Perks are the least replaceable thing on the device: they are
    // found in the world, one per hidden find, and nothing regenerates them.
    // A bad `bought` is a reason to distrust `bought`, not the shelf.
    const purse = typeof relics === 'number' && Number.isFinite(relics) ? relics : 0;
    const levels: Record<string, unknown> =
      typeof bought === 'object' && bought !== null ? (bought as Record<string, unknown>) : {};

    const knownUpgrades = new Set<string>(UPGRADES.map((u) => u.id));

    const clean: Partial<Record<UpgradeId, number>> = {};
    let refund = 0;
    for (const [id, n] of Object.entries(levels)) {
      if (typeof n !== 'number' || n <= 0) continue;
      if (knownUpgrades.has(id)) clean[id as UpgradeId] = Math.floor(n);
      // The deleted SECOND SLOT: its exact price comes back as relics.
      else if (id === 'slot') refund += SLOT_REFUND * Math.floor(n);
    }

    // The per-world era's one-way door (2026-08-26, Marc: full reset, every
    // world hunts its perks fresh): stored `found`/`equipped` are IGNORED,
    // not migrated — the durable copy lives on each world now, and the
    // matching side of the reset is `decodeWorld` forgetting a pre-split
    // world's claimed find-hexes so every perk is out there again. The
    // bought-perks-era migration that used to run here (perk purchases kept
    // as found) dies with it, by the same ruling.

    // Teaching (2026-08-19): a blob with no `met` field predates the ledger,
    // and a device that has already played is not a stranger — it decodes as
    // having met EVERYTHING, so shipping the drip changed nothing for anyone
    // current (the same dial-form off-by-default the FOUND perks wear, paid
    // in data instead of a boolean). The deliberate value matters: reading
    // the field raw would decode `undefined` and re-teach every veteran,
    // the exact save-decode failure the fresh-eyes review caught in the
    // near-share fields. A present array keeps only ids this build knows.
    const knownTeach = new Set<string>(TEACH_IDS);
    const taught: TeachId[] = Array.isArray(met)
      ? [
          ...new Set(
            (met as unknown[]).filter(
              (id): id is TeachId => typeof id === 'string' && knownTeach.has(id),
            ),
          ),
        ]
      : [...TEACH_IDS];

    return {
      relics: Math.max(0, Math.floor(purse)) + refund,
      bought: clean,
      found: [],
      equipped: [],
      met: taught,
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

/** The device blob never carries perks (per-world since 2026-08-26): a
 *  composite written back whole would smuggle one world's shelf into
 *  storage every world then reads, so the two fields are stripped HERE,
 *  at the one door everything leaves through. */
export const encodeProgress = (progress: Progress): string =>
  JSON.stringify({ relics: progress.relics, bought: progress.bought, met: progress.met });
