import type { Colour, Tuning } from '@content/tuning';
import type { HexKey } from './hex';
import type { RngStreams } from './rng';

/**
 * A cell of the map.
 *
 * A key ABSENT from `cells` means "off the map", which counts as solid — that is
 * what makes the rim of a map the cheapest place to ripen something, and it is
 * load-bearing rather than an edge case.
 *
 * `stone` is a popped tile. It still surrounds, but never matches. That single
 * asymmetry is what makes each successive harvest on a map faster and cheaper,
 * and is therefore the entire reason to move on.
 */
export type Cell =
  | {
      readonly kind: 'empty';
      /**
       * The colour this ground is native to, baked in when the endless world
       * revealed the cell. A tile of that colour placed here counts the ground
       * as one extra match. Absent on bounded maps and on plain ground.
       */
      readonly native?: Colour;
    }
  | { readonly kind: 'wall' }
  | { readonly kind: 'stone' }
  | {
      readonly kind: 'tile';
      readonly colour: Colour;
      /** True when this tile stands on its own native ground. Worth reads it. */
      readonly onNative?: boolean;
      /** Absent means common. Magic and unique tiles keep their power on the board. */
      readonly rarity?: Rarity;
    }
  /**
   * A destination (P3b): somewhere to go, baked in when growth revealed it.
   * Solid like a wall — it surrounds, never matches, cannot be built on — but
   * placing a tile AGAINST an unclaimed one claims it, once, and the reward
   * says what that pays. `colour` is set on territories: the field their claim
   * unfurls. Beacons for destinations beyond the revealed ground are the
   * VIEW's business — the board only ever holds what growth has reached.
   */
  | {
      readonly kind: 'landmark';
      readonly reward: LandmarkReward;
      readonly claimed: boolean;
      readonly colour?: Colour;
    };

/**
 * cache pays tiles, site pays points at distance and opens a bounty,
 * territory unfurls a field and is kept for good — and a SHRINE is the unlock
 * ledger turned into geography (M4): reaching one for the first time switches
 * a system on for this world, permanently. The engine only marks it claimed;
 * WHICH system it grants is the shell's business, because an unlock outlives
 * the run that found it and the engine may not know that runs have a past.
 */
export type LandmarkReward = 'cache' | 'site' | 'territory' | 'shrine';

/**
 * Common is the tile the whole game is made of. Magic is WILD — it matches
 * every neighbouring tile regardless of colour. Unique is wild and HEAVY —
 * every match it is part of counts double, for both sides. Words players
 * already own (Marc's direction, in the register torchlit speaks).
 */
export type Rarity = 'common' | 'magic' | 'unique';

export type Tile = {
  /** Unique per instance — for renderer keys and for reading action logs. */
  readonly id: string;
  readonly colour: Colour;
  readonly rarity: Rarity;
};

export type Phase = 'placing' | 'ended';

/**
 * `treasure` is the third payout, unlocked by `pop.treasure` and priced by
 * `treasureNeed`: a big pocket may be cashed for a rare tile instead of
 * either currency. Still exactly one of the three, never two.
 */
/**
 * `treasure` is the third payout, unlocked by `pop.treasure`: a big pocket
 * cashed for a rare tile instead of either currency. `burn` is Marc's
 * sacrifice (2026-08-15): no tiles, no points, only luck — you give up the
 * thing keeping you alive to make your next draws better.
 *
 * Under `singlePayout` the tiles/points fork is gone: `tiles` and `points`
 * both mean "pop it", paying tiles and scoring automatically. The two names
 * survive so every saved run, replay and policy written before the pivot
 * still means something.
 */
export type HarvestChoice = 'tiles' | 'points' | 'treasure' | 'burn';

/**
 * A bounty on a place, opened by claiming a scoring site.
 *
 * "Pop a pocket of `need`+ within `radius` of here AS POINTS, and that
 * harvest pays `bonus` times." One at a time, so it is one sentence on the
 * screen and one goal in the head.
 *
 * The shape is chosen to serve Gate B rather than to add content. The gate is
 * failing because a human takes tiles almost always — points feel unsafe and,
 * early, worthless. A quest does not add a second income stream (v1 died of
 * two channels that could not be priced against each other); it MULTIPLIES the
 * one channel at a named place and time. That makes a concrete, legible moment
 * where points is obviously the right button — and it cannot be double-dipped,
 * because taking that pocket as tiles wastes the bounty.
 */
export type Quest = {
  readonly at: HexKey;
  readonly need: number;
  readonly radius: number;
  readonly bonus: number;
};

/**
 * Why the run stopped.
 *
 * Gate D asks the end screen to name the cause of death in one sentence, so the
 * engine decides it rather than leaving the UI to guess from the numbers.
 *
 * `broke` is the design working: the cost curve climbs forever while income is
 * capped by geometry, so a run ends out of tiles. On a bounded map it is the
 * ONLY cause — out of room is never fatal there, because a full map is all
 * ripe and a harvested map can be left.
 *
 * `walled` is the endless world's second death, invented by P2's terrain
 * exactly as this union predicted a later system would: on the plane there is
 * no map to leave, so a run whose entire frontier is wall, with nothing ripe
 * left to cash, has no move at any price. Rare by construction, named rather
 * than inferred.
 *
 * `spent` is the hard clock running out (`tuning.runLength`), and it is the
 * COMMON ending by design — see that field. A run that ends on the clock with
 * tiles still in hand wasted them, which is exactly the pressure that makes
 * cashing a pocket for points a real decision rather than a luxury.
 */
export type DeathCause = 'broke' | 'walled' | 'spent';

/**
 * What one harvest did. Kept as a list because Gate D's real question — did the
 * run's biggest number come near the end? — cannot be answered from a total.
 */
export type HarvestRecord = {
  /** Placements made so far this run, which is the run's clock. */
  readonly at: number;
  readonly count: number;
  readonly choice: HarvestChoice;
  readonly tiles: number;
  readonly points: number;
};

export type GameState = {
  readonly version: 1;
  readonly rootSeed: number;
  readonly rng: RngStreams;

  /**
   * The economy this run is being played under, carried rather than imported.
   * A run is reproducible from its seed AND its tuning; a replay that did not
   * record the second would silently re-score itself after any balance change.
   */
  readonly tuning: Tuning;

  readonly phase: Phase;
  /** Set exactly when `phase` is `ended`. */
  readonly death: DeathCause | null;

  /** The run's life total. Placing spends it; harvesting returns it. */
  readonly tiles: number;
  readonly points: number;

  /** Total placements THIS RUN, never reset. The escalation dial. */
  readonly placements: number;

  /**
   * Tiles popped in TILES-harvests so far, capped at `tuning.luckCap`. Each
   * point raises the draft's magic/unique odds by the per-pop rates — luck is
   * a resource the run builds by cashing pockets as survival.
   */
  readonly luck: number;

  /**
   * RELICS: the between-runs currency, banked by sacrificing pockets,
   * reaching landmarks and dying with luck still in the purse. Never spent
   * inside a run — the engine only counts them, and the shell carries them
   * out. Deliberately separate from points so that chasing a score and
   * advancing the roguelite are different games played on the same board.
   */
  readonly relics: number;

  /** Second Wind is once a run, spent whether the coin was won or lost. */
  readonly usedSecondWind: boolean;

  readonly cells: Readonly<Record<HexKey, Cell>>;

  readonly draft: readonly Tile[];
  readonly selected: number;
  /**
   * The stash: a drafted tile kept for later, swapped with the selected card
   * by HOLD. Null when empty, and always null while `tuning.holdSlots` is 0.
   * Held tiles survive rerolls — that is the entire point of holding one.
   */
  readonly held: Tile | null;

  /** The bounty in play, or null. Opened by claiming a site; one at a time. */
  readonly quest: Quest | null;

  /**
   * The colour the last pop was made of, and how many draws it still steers.
   *
   * Popping is not only income: it tells the plane what you are building
   * with. Cash a green pocket and green runs for the next few draws, which
   * is how you get the tiles to build the NEXT green pocket. Null where the
   * bias is switched off.
   */
  readonly bias: { readonly colour: Colour; readonly left: number } | null;

  /**
   * Territories this WORLD already holds, from earlier runs (P4a). Plain
   * data handed to `newRun`, never read from storage by the engine: a run
   * stays reproducible from its seed, its tuning and this list. Those
   * landmarks arrive already claimed — they pay nothing again, and their
   * fields are live the moment the ground around them is revealed.
   */
  readonly claimed: readonly HexKey[];

  /** Telemetry for the end screen and the harness. */
  readonly log: {
    readonly harvests: readonly HarvestRecord[];
    readonly popped: number;
    /** Bounties collected this run. The end screen counts them. */
    readonly questsDone: number;
  };
};

export type Action =
  | { readonly type: 'SELECT'; readonly index: number }
  | { readonly type: 'PLACE'; readonly hex: HexKey }
  /**
   * `at` targets one connected ripe cluster, and only the endless world reads
   * it: there a harvest is local, and which pocket you cash is part of the
   * decision. The bounded game pops every ripe tile regardless — an omitted
   * `at` on a bounded board is the whole harvest, an omitted `at` on an endless
   * board is a no-op, and both are the rules rather than special cases.
   */
  | { readonly type: 'HARVEST'; readonly choice: HarvestChoice; readonly at?: HexKey }
  /**
   * Swap the selected draft card with the stash. Empty stash takes the card
   * (the draft shrinks until its next reroll); a full one trades. One action
   * for both directions, so the stash is a place, not a mode.
   */
  | { readonly type: 'HOLD' }
  /**
   * Spend luck. `reroll` buys a fresh hand, `steer` names a colour and buys a
   * hand drawn under it, `forge` turns the selected card unique. Prices live
   * in tuning and a zero price means the shop does not exist — so every game
   * that never heard of luck ignores this action entirely.
   */
  | { readonly type: 'SPEND'; readonly on: Spend; readonly colour?: Colour };

export type Spend = 'reroll' | 'steer' | 'forge';
