/**
 * The whole balance surface, in one file.
 *
 * If a number that affects balance appears under `src/engine/`, that is a bug —
 * the point is that the harness can sweep these without touching game logic.
 * Which is why `Tuning` is a TYPE with a default value rather than a frozen
 * import: a run carries its tuning in its state, so the harness can play the
 * same seed under twenty different economies, and a saved replay still knows
 * which economy it was recorded under.
 *
 * Every value here is a STARTING POINT, not a claim. Income per placement is
 * (pops per placement) x (tiles per pop), and pops-per-placement swings roughly
 * 0.3 to 1.0 on packing skill alone, so these cannot be settled on paper. See
 * DESIGN.md — the harness moves `costRisesEvery` and `worthPerExtraTile` until
 * competent play reaches map 6-8 and careless play dies on map 2.
 */

export type Tuning = {
  readonly startingTiles: number;

  /** cost = baseCost + floor(placements / costRisesEvery), all run, never reset. */
  readonly baseCost: number;
  readonly costRisesEvery: number;

  /**
   * Tiles returned per popped tile: tilesPerPop + floor(worth / worthPerExtraTile).
   * Linear in harvest size — deliberately, so survival cannot explode the way
   * points can. Cost climbs forever while this is capped by geometry at one pop
   * per placement, which is what guarantees the curves cross.
   */
  readonly tilesPerPop: number;
  readonly worthPerExtraTile: number;

  /**
   * How much a BIGGER harvest is worth per tile in it.
   *
   *   points = sumWorth * (1 + harvestSizeBonus * (count - 1)) * mapNumber
   *
   * This is the dial that decides whether harvest timing is a real decision,
   * and it runs continuously between two fake games:
   *
   *   0 — points are linear in harvest size. Splitting a harvest costs nothing,
   *       so timing is free and rule 5 is a formality.
   *   1 — points are quadratic (the original `sumWorth * count`). Banking every
   *       pop until the map is finished dominates by a factor of forty, which
   *       the harness measured, so rule 5 is a formality the other way.
   *
   * Somewhere between the two, the fact that stone accelerates ripening should
   * make an early harvest pay for itself. Finding that number is what the
   * harness is for.
   */
  readonly harvestSizeBonus: number;

  /** Draft width. Three is the base game; more is an unlock. */
  readonly draftWidth: number;

  /**
   * Map size, by depth. Radius 4 is 61 cells, which is the ~50 usable the design
   * asks for and about as much as a phone in portrait can show without the hexes
   * getting smaller than a thumb.
   */
  readonly mapBaseRadius: number;
  readonly mapGrowsEvery: number;
  readonly mapMaxRadius: number;

  /**
   * Fraction of a map's cells that start as wall.
   *
   * Zero for now, because run one is the smallest game there is. It is a real
   * dial rather than a stub: walls make a map ripen FASTER (they surround) but
   * pay LESS (they never match), so this is the lever that gives deeper map
   * types their character when unlock 5 lands.
   */
  readonly wallDensity: number;

  /**
   * Whether a ripe tile still counts as a matching neighbour.
   *
   * This is the dial against DESIGN.md's "what is fragile". Points scale with
   * the square of harvest size, so banking every pop until the map is finished
   * looks strictly better and the timing decision may be fake. Turning this OFF
   * makes banking cost you worth: a tile sitting ripe stops feeding its
   * neighbours' scores, so leaving it there has a price.
   *
   * Kept ON by default so the harness measures the honest, unfixed game first.
   */
  readonly ripeTilesMatch: boolean;
};

export const TUNING: Tuning = {
  startingTiles: 40,

  baseCost: 1,
  costRisesEvery: 100,

  tilesPerPop: 1,
  worthPerExtraTile: 2,

  harvestSizeBonus: 1,

  draftWidth: 3,

  mapBaseRadius: 4,
  mapGrowsEvery: 3,
  mapMaxRadius: 6,

  wallDensity: 0,

  ripeTilesMatch: true,
};

/** The four tile colours. Named for what they are — art direction is undecided. */
export const COLOURS = ['green', 'yellow', 'red', 'blue'] as const;
export type Colour = (typeof COLOURS)[number];

/** Uniform for now. A weighted table is where biome character will come from. */
export const COLOUR_WEIGHTS: readonly (readonly [Colour, number])[] = COLOURS.map((c) => [c, 1]);
