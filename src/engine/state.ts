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
  | { readonly kind: 'empty' }
  | { readonly kind: 'wall' }
  | { readonly kind: 'stone' }
  | { readonly kind: 'tile'; readonly colour: Colour };

export type Tile = {
  /** Unique per instance — for renderer keys and for reading action logs. */
  readonly id: string;
  readonly colour: Colour;
};

export type Phase = 'placing' | 'ended';

export type HarvestChoice = 'tiles' | 'points';

/**
 * Why the run stopped.
 *
 * Gate D asks the end screen to name the cause of death in one sentence, so the
 * engine decides it rather than leaving the UI to guess from the numbers.
 *
 * There is exactly one cause, and that is the design working: the cost curve
 * climbs forever while income is capped by geometry at one pop per placement, so
 * every run ends by running out of tiles. Being out of ROOM is never fatal —
 * you can always harvest what is ripe, and always leave a map you have already
 * harvested. A union of one is deliberate: if a later system invents a second
 * way to die, it gets named here rather than inferred from the numbers.
 */
export type DeathCause = 'broke';

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
