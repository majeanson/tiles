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

/** cache pays tiles, site pays points at distance, territory unfurls a field. */
export type LandmarkReward = 'cache' | 'site' | 'territory';

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

export type HarvestChoice = 'tiles' | 'points';

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
 */
export type DeathCause = 'broke' | 'walled';

/**
 * What one harvest did. Kept as a list because Gate D's real question — did the
 * run's biggest number come near the end? — cannot be answered from a total.
 */
export type HarvestRecord = {
  readonly mapNumber: number;
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
  readonly mapNumber: number;

  /**
   * Tiles popped in TILES-harvests so far, capped at `tuning.luckCap`. Each
   * point raises the draft's magic/unique odds by the per-pop rates — luck is
   * a resource the run builds by cashing pockets as survival.
   */
  readonly luck: number;

  readonly cells: Readonly<Record<HexKey, Cell>>;

  readonly draft: readonly Tile[];
  readonly selected: number;

  /** Telemetry for the end screen and the harness. */
  readonly log: {
    readonly harvests: readonly HarvestRecord[];
    readonly popped: number;
    /** Placements spent on maps already left behind — for cost-per-depth. */
    readonly placementsAtMapStart: number;
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
  | { readonly type: 'LEAVE' };
