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
  /**
   * Which world the run is played on.
   *
   * `bounded` — the shipped game: discs that grow with depth, LEAVE to go
   * deeper, harvest pops every ripe tile at once, points multiply by map number.
   *
   * `endless` — the P1 prototype (`ideas/endless-world.md`): one unbounded
   * plane grown outward from a seed tile at the origin. No LEAVE. Harvest pops
   * one connected ripe cluster, and points multiply with the cluster's distance
   * from home. Exists to answer one question — does local harvest make TIMING a
   * real decision? — and the harness answers it via `--set world=endless`.
   */
  readonly world: 'bounded' | 'endless';

  /**
   * Endless only: the points multiplier rises by 1 for every `distanceStep`
   * hexes a harvest happens from the origin. The continuous replacement for the
   * bounded game's map number — depth becomes distance, priced in placements,
   * because every hex of the journey out is a placement at ever-rising cost.
   */
  readonly distanceStep: number;

  /**
   * Endless terrain (P2 of `ideas/endless-world.md`). All of it is a pure
   * function of the world seed, computed as ground is revealed — never stored,
   * never rolled. The bounded game reads none of these.
   *
   * `worldWalls` — fraction of revealed ground that is wall. Walls surround
   * (ripen things faster) but never match (pay less), and cannot be built on:
   * the same economic trade `wallDensity` describes, on the plane.
   *
   * Native fields: the plane is tiled into blocks of `fieldSize` hexes;
   * `fieldChance` of them are native to one colour. A tile placed on its own
   * native ground counts the ground as one extra match — placement context you
   * can read before you commit, and the first thing fog will be hiding.
   */
  readonly worldWalls: number;
  readonly fieldSize: number;
  readonly fieldChance: number;

  /**
   * Destinations (P3b of `ideas/endless-world.md`): landmarks seeded by the
   * same pure world hash, one per `destinationEvery`-hex block of the plane
   * (`destinationChance` of blocks hold one; 0 for either switches the system
   * off, which is the bounded default). Reaching one — placing a tile against
   * it — claims it, once:
   *
   *   cache     — pays `cachePays` tiles on the spot. A lifeline out there.
   *   site      — pays `sitePays` × the distance multiplier at its hex, so a
   *               farther site is worth the longer walk, same as rule 6.
   *   territory — Marc's "key territories" (2026-08-13): claiming one turns
   *               the ground within `territoryRadius` into a native field of
   *               its colour. Conquest, paid in the field mechanic P2 built.
   */
  readonly destinationEvery: number;
  readonly destinationChance: number;
  readonly cachePays: number;
  readonly sitePays: number;
  readonly territoryRadius: number;

  /**
   * Quests (M1 of `ROADMAP.md`, Gate B's structural fix). Claiming a scoring
   * site opens a bounty: pop a pocket of `questNeed`+ within `questRadius` of
   * it AS POINTS, and that harvest pays `questBonus` times.
   *
   * Not a second income stream — a multiplier on the one channel, at a named
   * place, collectable only by pressing the points button. That is the whole
   * design intent: a human who takes tiles nine times in ten needs a moment
   * where points is obviously right, and this manufactures one per site.
   * `questNeed` 0 switches quests off (the bounded default).
   */
  readonly questNeed: number;
  readonly questRadius: number;
  readonly questBonus: number;
  /** How far past the built frontier a destination shows as a beacon. */
  readonly beaconHorizon: number;

  /**
   * Rarity on the draft (P3b's second half, shaped by Marc 2026-08-13): every
   * drawn tile rolls common / magic / unique on its own stream, so the bounded
   * game's sequences never move. Magic is WILD — it matches every neighbouring
   * tile. Unique is wild and HEAVY — its matches count double, both ways.
   *
   * Luck is the count of tiles popped in TILES-harvests, capped at `luckCap`;
   * each point adds `luckMagicPerPop` / `luckUniquePerPop` to the odds. Cashing
   * big pockets as tiles is what raises your odds — survival finally pays in
   * excitement, and it couples loot to the same timing decision points have.
   * All zeros = the system does not exist, which is the bounded default.
   */
  readonly magicChance: number;
  readonly uniqueChance: number;
  readonly luckMagicPerPop: number;
  readonly luckUniquePerPop: number;
  readonly luckCap: number;

  /**
   * Colour personalities (Session 8, Marc's "why would I take THIS tile").
   * Every colour earns its own placement logic, all through the one worth
   * channel so the preview numbers stay the whole truth:
   *
   *   green  — crowds:  +`greenCrowdBonus` worth per green neighbour past the
   *            first. Mono-clusters snowball.
   *   yellow — company: +`yellowCompanyBonus` worth per DIFFERENT colour
   *            among its neighbours. The glue tile in mixed pockets.
   *   red    — ash:     stone neighbours count as matches. Your spent wake
   *            becomes red's soil, so red builds where nothing else pays.
   *   blue   — tide:    +1 worth per `blueTideEvery` hexes from home. The
   *            colour you carry outward.
   *
   * Zeros (and false) switch the personalities off — the bounded default.
   */
  readonly greenCrowdBonus: number;
  readonly yellowCompanyBonus: number;
  readonly redAshMatches: boolean;
  readonly blueTideEvery: number;

  /**
   * Power experiments from the first colour-balance report (LOG addendum 5):
   * red was an era colour competent play barely placed before stone existed,
   * and yellow was the most-placed, least-valuable tile on the board.
   *
   * `redAshWalls` — ash counts WALLS as well as stone, giving red a little
   * soil from the first placement instead of none until the first harvest.
   * `yellowCompanyAll` — company counts every differently-coloured NEIGHBOUR
   * rather than every distinct colour, lifting its cap from 3 to 6 so a
   * well-surrounded yellow can actually compete with a well-crowded green.
   */
  readonly redAshWalls: boolean;
  readonly yellowCompanyAll: boolean;

  /**
   * Biomes: broad regions of the plane, `biomeEvery` hexes to a block,
   * `biomeChance` of blocks native to one colour. Inside a biome every field
   * takes the biome's colour, so regions read as one colour's country and
   * chasing a colour means walking to it. 0 switches the layer off.
   */
  readonly biomeEvery: number;
  readonly biomeChance: number;

  /**
   * Hold slots: pockets that keep a drafted tile for later. One tap swaps the
   * selected card with the stash, so every draft becomes "use it or save it".
   * 0 — no stash, the bounded default.
   */
  readonly holdSlots: number;

  /**
   * Territory perks (P4b, M3 of `ROADMAP.md`): every territory this world
   * holds adds `territoryTiles` to the next run's purse, up to
   * `territoryTilesCap` in total.
   *
   * This is the roguelite answer Marc asked for by name, aimed at the thing
   * his first debrief actually described — "I never felt SAFE enough to take
   * points". A softer start is safety that compounds with exploration rather
   * than with luck, and it is bounded so a well-held world cannot buy its way
   * out of the clock. 0 switches it off.
   */
  readonly territoryTiles: number;
  readonly territoryTilesCap: number;

  /**
   * The third payout (`pop.treasure`, declared in Session 0 and wired in
   * M3): a harvest of `treasureNeed`+ may be taken as TREASURE instead —
   * neither tiles nor points, but a guaranteed rare tile straight into the
   * stash, magic below `treasureUnique` tiles and unique at or above it.
   *
   * It earns its place by being a third answer to the same question rather
   * than a bonus on top: taking it forfeits both the tiles and the points, so
   * it is a real cost every time, and it is the only way to CHOOSE a rare
   * tile rather than wait for one. 0 leaves the option unbuilt, which is what
   * the bounded game and every pre-M3 build had.
   */
  readonly treasureNeed: number;
  readonly treasureUnique: number;

  readonly startingTiles: number;

  /**
   * cost = baseCost + floor(max(0, placements - costGrace) / costRisesEvery),
   * all run, never reset.
   *
   * `costGrace` is the KNEE, and it exists because of what M1's
   * instrumentation found (2026-08-15). With a curve that rises from the
   * first placement, income and cost converge across the whole back half of a
   * run — and at the margin a harvest MUST be taken as tiles, because that
   * convergence is what "the run is ending" means. Measured: 94-98% tiles for
   * every policy, including one that prices both sides and takes the better.
   * No amount of content fixes that; the shape of the curve does.
   *
   * A flat grace, then a sharper rise, gives a run two eras: a long one where
   * survival is handled and a harvest is a scoring DECISION, and a short
   * desperate one where it is not. That is also the arc Gate D asks for.
   */
  readonly baseCost: number;
  readonly costGrace: number;
  readonly costRisesEvery: number;

  /**
   * The hard clock: placements a run gets, or 0 for none (the bounded game).
   *
   * The deepest thing M1's instrumentation found. An economy whose ONLY end
   * is bankruptcy always converges — income meets cost, that convergence IS
   * the ending, and so the last harvests of every run must be taken as tiles.
   * Measured at 94-98% tiles for every policy, including one that prices both
   * sides. No content and no curve shape fixes it, because the fixed point is
   * the ending itself.
   *
   * A hard budget breaks the fixed point: tiles you never get to spend are
   * worth nothing, so a run with runway to spare should cash pockets as
   * POINTS — and the closer the end, the more obviously so. Survival stops
   * being infinitely valuable, which is precisely what made the choice fake.
   *
   * It is also the constraint Marc asked for in as many words ("I'd like the
   * time to be constrained yet points become more important"), and it makes
   * the run's length a promise the game can print rather than a mystery.
   */
  readonly runLength: number;

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

  /**
   * Pocket size past which the size bonus stops growing; 0 for no cap.
   *
   * The quadratic is what makes a big pocket worth more than two small ones,
   * and that is the tension rule 5 lives on. Unbounded, though, it means ONE
   * pocket grown as large as the run allows beats every other line — and once
   * the run has a hard clock (`runLength`), timing that single cash-in stops
   * being a gamble and becomes arithmetic. Measured: with the clock and no
   * cap, the bank-everything line scored 150k against the next line's 63k,
   * with its risk removed.
   *
   * The cap keeps "bigger is better" and removes "biggest is everything":
   * past it, a pocket still pays more worth but no more multiplier, so
   * cashing well and often competes with hoarding. It is the smallest change
   * that restores the cliff the clock flattened.
   */
  readonly harvestSizeCap: number;

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
  world: 'bounded',
  distanceStep: 4,

  worldWalls: 0.06,
  fieldSize: 4,
  fieldChance: 0.55,

  // Off in the shipped bounded game — run one is the smallest game there is.
  // The endless tuning below turns both systems on; the harness sweeps them.
  destinationEvery: 0,
  destinationChance: 0,
  cachePays: 12,
  sitePays: 25,
  territoryRadius: 2,
  beaconHorizon: 8,

  questNeed: 0,
  questRadius: 6,
  questBonus: 3,

  magicChance: 0,
  uniqueChance: 0,
  luckMagicPerPop: 0,
  luckUniquePerPop: 0,
  luckCap: 150,

  greenCrowdBonus: 0,
  yellowCompanyBonus: 0,
  redAshMatches: false,
  blueTideEvery: 0,
  redAshWalls: false,
  yellowCompanyAll: false,

  biomeEvery: 0,
  biomeChance: 0,

  holdSlots: 0,

  territoryTiles: 0,
  territoryTilesCap: 0,

  treasureNeed: 0,
  treasureUnique: 0,

  // 40/100 let the first human session bank 134 tiles without ever feeling
  // the curve (2026-08-04). Swept to 30/70: random-legal dies on map 1,
  // survivor caps ~325 placements, and the endless timing optimum moves from
  // a 40-pocket to a 15-pocket — closer, which is more pressure sooner. The
  // "map 6-8 for competent play" depth target is still unmet (farm reaches 4)
  // and stays an open tuning job; these numbers fix the FELT problem first.
  startingTiles: 30,

  baseCost: 1,
  // The bounded game keeps the original straight line: no grace, and the
  // curve it was balanced against. Its Gate C evidence stands on it.
  costGrace: 0,
  costRisesEvery: 70,
  runLength: 0,

  tilesPerPop: 1,
  worthPerExtraTile: 2,

  harvestSizeBonus: 1,
  harvestSizeCap: 0,

  draftWidth: 3,

  mapBaseRadius: 4,
  mapGrowsEvery: 3,
  mapMaxRadius: 6,

  wallDensity: 0,

  ripeTilesMatch: true,
};

/**
 * The endless world's economy: the shipped tuning with the world swapped and
 * the plane's own systems switched on. One object so the UI flag, the harness
 * and the tests all mean the same thing by "endless". Shared balance numbers
 * stay identical on purpose — the worlds differ by structure, and a number
 * that must differ earns its own entry here.
 *
 * The destination and rarity numbers are FIRST VALUES, not claims: swept once
 * for "nothing stalls, nothing explodes" (Session 6) and awaiting a human.
 */
export const ENDLESS_TUNING: Tuning = {
  ...TUNING,
  world: 'endless',

  // 2026-08-14, Marc: "time constrained, yet points become more important."
  // Swept at 40 seeds. The cost curve tightens 70 -> 50: the longest possible
  // run (pure survival stalling) drops 523 -> ~337 placements — roughly a
  // 15-20 minute ceiling at a human pace — while the bank-40 optimum and the
  // bank-80 cliff survive intact. The multiplier steps every 3 hexes instead
  // of 4: every scoring line gains ~40% points in the SAME number of
  // placements (bank15 5,034 -> 7,112 · seeker 3,019 -> 4,320), so a minute
  // spent scoring is worth more and a minute spent stalling still pays ~0.
  // The bounded game keeps its own 70/4; these are the plane's numbers.
  // 2026-08-15 (M1): the knee. See `costGrace` — a straight curve made every
  // late harvest a forced tiles-harvest and Gate B unpassable at any content
  // setting. Swept in Session 11: grace 120 placements at cost 1, then +1
  // every 25. Clock preserved, choice restored.
  costGrace: 120,
  costRisesEvery: 25,
  distanceStep: 3,

  // The hard clock, and the three numbers M1 moved with it (Session 11).
  // Together they are one change, not four: a run is a fixed expedition of
  // 260 placements (~15 minutes), survival is funded mostly by CACHES rather
  // than by emergency harvests, and the size bonus stops paying past 20 so
  // hoarding one monster pocket cannot out-score cashing well and often.
  // Measured effect on Gate B: the tiles share of harvests fell from 94-98%
  // (every policy, unfixable by content) to 59-63% for lines that harvest as
  // they go. See LOG.md, Session 11.
  runLength: 260,
  harvestSizeCap: 20,

  // Destinations went from a landmark you might meet to the plane's SURVIVAL
  // ENGINE (Session 11): one per ~6-hex block, a cache paying 40 tiles. That
  // is the change that lets a harvest be a scoring decision — with survival
  // funded by walking, the tiles button stops being the only safe answer.
  // The block around home is still kept empty, so the first glow is a journey.
  destinationEvery: 6,
  destinationChance: 0.7,
  cachePays: 40,

  // A pocket of 8 is a real but reachable ask — bank15's line clears it
  // routinely and bank3's never does, so the bounty asks the player to grow
  // something rather than cash reflexively. ×3 is loud enough to be worth
  // changing your mind for; swept in Session 11.
  questNeed: 8,

  // Base odds are felt but rare: roughly one magic tile per two drafts' worth
  // of placements, uniques an event. Luck at its cap roughly triples magic.
  magicChance: 0.05,
  uniqueChance: 0.01,
  luckMagicPerPop: 0.0008,
  luckUniquePerPop: 0.0002,

  // The personalities, at their first values: every bonus worth exactly one
  // ordinary match, so no colour's power outranks plain good packing.
  greenCrowdBonus: 1,
  yellowCompanyBonus: 1,
  redAshMatches: true,
  blueTideEvery: 6,

  // 2026-08-15, from the colour-balance report (LOG addendum 5) and measured
  // before shipping: walls give red soil before the first harvest (placed
  // +43%, worth share 13% → 16-18%, still the late-game riser), and counting
  // every differently-coloured neighbour lifts yellow from worst-per-tile to
  // the middle (5.70 → 6.23 avg). Per-tile spread across the four colours
  // halved; every power now earns 25-31% of its colour's worth; the timing
  // optimum, cliff, clock and seeker all held at 40 seeds.
  redAshWalls: true,
  yellowCompanyAll: true,

  // Biomes twice the size of destination blocks: a country per two beacons,
  // so walking somewhere changes what the ground grows.
  biomeEvery: 24,
  biomeChance: 0.65,

  holdSlots: 1,

  // Six tiles a territory, capped at 24 — four territories' worth. That is
  // about a fifth of the starting purse per territory and never more than
  // four-fifths of it in total: felt on the first placements of a run,
  // powerless to change how it ends. Swept in Session 13 against runs 0-8 of
  // a world; the clock and the optimum are unmoved.
  territoryTiles: 6,
  territoryTilesCap: 24,

  // A treasure needs a pocket of 10 — bigger than the bounty's 8, so the two
  // goals pull in the same direction without collapsing into one — and pays
  // unique at 20, the size cap, where points are at their best. Choosing
  // treasure there is giving up the best points harvest in the game for a
  // tile, which is exactly the weight this option should carry.
  treasureNeed: 10,
  treasureUnique: 20,
};

/** The four tile colours. Named for what they are — art direction is undecided. */
export const COLOURS = ['green', 'yellow', 'red', 'blue'] as const;
export type Colour = (typeof COLOURS)[number];

/** Uniform for now. A weighted table is where biome character will come from. */
export const COLOUR_WEIGHTS: readonly (readonly [Colour, number])[] = COLOURS.map((c) => [c, 1]);
