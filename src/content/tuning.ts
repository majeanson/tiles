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
   * Endless only: the points multiplier rises by 1 for every `distanceStep`
   * hexes a harvest happens from the origin. The continuous replacement for the
   * bounded game's map number — depth becomes distance, priced in placements,
   * because every hex of the journey out is a placement at ever-rising cost.
   */
  readonly distanceStep: number;

  /**
   * Endless terrain (P2 of `ideas/endless-world.md`). All of it is a pure
   * function of the world seed, computed as ground is revealed — never stored,
   * never rolled. The bare skeleton zeroes all of these.
   *
   * `worldWalls` — fraction of revealed ground that is wall. Walls surround
   * (ripen things faster) but never match (pay less), and cannot be built on:
   * the trade every obstacle makes: cheaper to ripen against, worth nothing.
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
   * off, which is the bare default). Reaching one — placing a tile against
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
   * `questNeed` 0 switches quests off (the bare default).
   */
  readonly questNeed: number;
  readonly questRadius: number;
  readonly questBonus: number;
  /** How far past the built frontier a destination shows as a beacon. */
  readonly beaconHorizon: number;

  /**
   * Gradual formulas (Marc, 2026-08-18: "gradual formulas instead of
   * constants"). Each turns a flat constant into a curve over distance from
   * home, so the world can be lean at the doorstep and rich in the deep — a
   * difficulty ramp that lives inside the run instead of only between runs.
   * All zeros = the constants stay flat, which is every earlier economy, and
   * what a save written before these existed decodes to.
   *
   * `cachePaysPerRing` — extra tiles a cache pays per distance ring (rule 6's
   * rings: floor(distance / distanceStep)). A cache met three rings out is
   * worth the walk; one beside home is a snack.
   *
   * `popTilesPerRing` — extra tiles a harvest pays per popped tile per ring
   * beyond the first, floored once per harvest. Survival income itself grows
   * with depth, so the lean early game is paid back by pushing outward.
   *
   * `destinationRampBlocks` — blocks of the plane over which destination
   * density climbs from nothing at home to the full `destinationChance`.
   * Near home the world is sparse; the horizon is where the lights are.
   */
  readonly cachePaysPerRing: number;
  readonly popTilesPerRing: number;
  readonly destinationRampBlocks: number;

  /**
   * Deep water (2026-08-18): the destination reward MIX tilts with distance,
   * not just its density. Near home the split is the original fixed one —
   * 40% cache, 35% site, 17% territory, 8% shrine — because caches carry
   * survival and the near world has to stay a lifeline. Past
   * `deepWaterRampBlocks` blocks the cache share has fully tilted to
   * `cacheShareFar`, with site, territory and shrine THICKENING — each
   * keeping its own ratio to the other two, just scaled up to fill what
   * cache gave up. `deepWaterRampBlocks` 0 (the bare default, and every save
   * from before this dial existed) keeps the flat original split exactly —
   * guarded with `> 0` rather than reading `cacheShareFar` unconditionally,
   * so an old save's `undefined` cannot reach the arithmetic at all.
   */
  readonly deepWaterRampBlocks: number;
  readonly cacheShareFar: number;

  /**
   * Hidden finds (Marc, 2026-08-18, resolving `ideas/uniques.md`): a rare
   * landmark that grants an unowned PERK when growing ground reveals it. It
   * never beacons — no glow through the dark, no atlas entry, no hint. "Theyre
   * often hidden from plain sight, you need to stumble on it."
   *
   * Same pure-hash trick as destinations, on its own salts and its own block
   * scale, so switching finds on cannot move a single existing destination.
   * One find per `findEvery`-hex block, `findChance` of blocks holding one;
   * 0 for either switches the system off (the bare default). Where a find and
   * a destination would share a hex, the destination wins and the find does
   * not exist there — deterministic precedence, not a coin flip.
   *
   * `findSense` is the one exception to the darkness, and it is SOLD, never
   * given: hexes of range at which an unrevealed find shimmers when your
   * ground grows near. 0 — pure surprise — everywhere except under the shop's
   * KEEN NOSE upgrade, which raises it via `applyProgress`. It is capped well
   * under `beaconHorizon` so a shimmer can never become a beacon.
   */
  readonly findEvery: number;
  readonly findChance: number;
  readonly findSense: number;

  /**
   * Perk dials (2026-08-18). All zero here and in every shipped tuning —
   * these are set by `applyProgress` ONLY while the perk is equipped, the
   * same contract as `rootboundOnly` below. Old saves decode them as
   * `undefined`, so every reader guards with `> 0`.
   *
   * `stoneDiscount` — STONEWALKER: tiles off a placement's cost when at least
   * one neighbour of the placement hex is stone, floored at a free placement.
   * Hug your own wake to stay solvent, in tension with fleeing it for fresh
   * matches.
   *
   * `wallBuildCostMult` — WALLBREAKER: 0 keeps rule 7 (walls cannot be built
   * on); above 0, placing on a wall REPLACES it with the tile at that
   * multiple of the normal cost. Straight lines through terrain that used to
   * divert you, and an answer to the `walled` death.
   *
   * OPEN HAND needs no dial of its own — it is `draftWidth` 5 with
   * `holdSlots` 0, both of which already exist.
   */
  readonly stoneDiscount: number;
  readonly wallBuildCostMult: number;

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
   * All zeros = the system does not exist, which is the bare default.
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
   * Zeros (and false) switch the personalities off — the bare default.
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
   * The shape of the land (2026-08-16). One height per hex, hashed from the
   * world seed like every other terrain layer, rounded into
   * `elevationBands` steps so the ground reads as contours rather than as a
   * gradient. `elevationEvery` is the coarse block size in hexes; 0 flattens
   * the world.
   *
   * Cosmetic by decision, not by accident: Marc chose purely cosmetic when
   * asked, so nothing in the rules may ever read these. They live here rather
   * than in the theme because the shape of the land belongs to the WORLD — two
   * art directions must not disagree about where the hills are.
   */
  readonly elevationEvery: number;
  readonly elevationBands: number;

  /**
   * Hold slots: pockets that keep a drafted tile for later. One tap swaps the
   * selected card with the stash, so every draft becomes "use it or save it".
   * 0 — no stash, the bare default.
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
   * The third payout (declared in Session 0 as the `pop.treasure` flag,
   * wired in M3, a shrine unlock since the registry was cleaned): a harvest
   * of `treasureNeed`+ may be taken as TREASURE instead —
   * neither tiles nor points, but a guaranteed rare tile straight into the
   * stash, magic below `treasureUnique` tiles and unique at or above it.
   *
   * It earns its place by being a third answer to the same question rather
   * than a bonus on top: taking it forfeits both the tiles and the points, so
   * it is a real cost every time, and it is the only way to CHOOSE a rare
   * tile rather than wait for one. 0 leaves the option unbuilt, which is
   * what every pre-M3 build had.
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
   * The hard clock: placements a run gets, or 0 for none — the shipped game: the cost curve is its clock.
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

  /**
   * The tiles-only run (Marc's pivot, 2026-08-15). One currency to live on,
   * and points as the SCORE rather than a payout you must trade your life
   * for: "start with 30 tiles, get tiles along the way if you're good or
   * lucky, die when you run dry, and go farther over time."
   *
   * `singlePayout` — a pop pays TILES, always, with no choice to make. This
   * is Gate B's own prescribed fallback ("fix it, or cut it to a single
   * automatic payout"), reached after the gate failed twice in a row for
   * opposite reasons: tiles dominating early, then tiles going SPARE and the
   * button dying for the back half of a run.
   *
   * `pointsPerPop` — what a pop adds to the score automatically, as a
   * fraction of what the old points payout would have been. Score becomes
   * something you accumulate by playing well rather than something you buy
   * with survival.
   *
   * `burnLuck` — a pop can instead be BURNED: no tiles, no points, but
   * `burnLuck` luck per tile in it, which is Marc's "sacrifice the run for
   * better tiles". The sacrifice is real because tiles are now the only
   * thing keeping you alive.
   *
   * `endReachBonus` / `endClaimBonus` — what the run is worth for having
   * gone far and reached things, added once when it ends. Points as the
   * final state.
   */
  /**
   * What a pop does to your NEXT draws (2026-08-15, Marc: "odds for better
   * colours depending? or magic/unique" + "early pops pay luck").
   *
   * This is the answer to "why would you ever pop early": popping is not only
   * income, it STEERS the draft. Every pop biases the next `colourBiasDraws`
   * draws toward the colour it was made of, and luck — the rare-tile odds —
   * arrives mostly as a FLAT `luckPerPop` rather than per tile, so many small
   * pops out-earn one monster in luck while the monster out-earns them in
   * tiles and score. Two strategies, both live, and which is right depends on
   * what you need right now: the situational timing rule 5 always wanted.
   */
  readonly luckPerPop: number;
  readonly luckPerTile: number;
  readonly colourBiasDraws: number;
  readonly colourBiasWeight: number;

  /**
   * What luck is SPENT on (2026-08-15, Marc played and reported the flaw:
   * "popping often gave more luck than burning anyway", and the harness
   * confirmed worse — luck hit `luckCap` about fifteen pops into a
   * hundred-and-forty-pop run, so for nine tenths of the game popping early
   * bought nothing at all).
   *
   * The fix is that luck stops being a bar that fills and becomes a purse.
   * Where these are nonzero, luck no longer raises the odds passively at all
   * (`luckMagicPerPop` and friends go to zero and permanent odds are bought
   * with POINTS between runs instead) — it is a currency with three prices:
   *
   *   reroll — a fresh hand. The cheap, constant one.
   *   steer  — name a colour: it runs hot for `colourBiasDraws` draws AND
   *            your hand is redrawn under it immediately, so it is "buy a
   *            hand of this colour" rather than a bet on later.
   *   forge  — turn the selected card unique. The expensive one, and the
   *            only deterministic source of a rare.
   *
   * One number doing one job. Zeros = no shop, which is every other game.
   */
  /**
   * Hide the score while the run is alive (Marc, 2026-08-15: he never once
   * thought about points mid-run, reasoning that going further would earn
   * them anyway — which is correct, so the number was furniture). Points
   * become purely the between-runs payout, revealed on the end screen, and
   * the HUD slot they held goes to LUCK, which is now the live currency.
   */
  /**
   * RELICS — the between-runs currency (Marc, 2026-08-15: "a new currency so
   * you need to decide vs a good point game vs advancing roguelite").
   *
   * Deliberately NOT points. Points are the score you chase; relics are what
   * buys permanent upgrades, and the two compete for the same pockets, so
   * every ripe pocket asks whether this run is for the record book or for the
   * next run. Three sources, all of them chosen by Marc:
   *
   *   `burnRelics` — per tile in a pocket you sacrifice. No tiles and no
   *   score, which is what makes it a decision rather than a bonus.
   *   `claimRelics` — per landmark reached for the first time. Exploring pays
   *   the meta without asking you to give anything up.
   *   `luckToRelics` — the fraction of UNSPENT luck banked when the run ends,
   *   so hoarding the purse is a real alternative to spending it.
   *
   * Zeros = no meta economy, which is every game but the tiles-only one.
   */
  /**
   * PERKS, bought with relics and carried into every world (Marc chose two
   * of ten in the brainstorm, and parked the four big rule-breakers as
   * "not convinced" — they stay in ideas/uniques.md, unbuilt).
   *
   * ROOTBOUND (`rootboundOnly`) — native ground counts DOUBLE and off-native
   * ground pays nothing at all. Not a bonus: a rewrite of where you are
   * allowed to build well, which makes reading the terrain before placing
   * the whole game for that run.
   *
   * SECOND WIND (`secondWindTiles`, `secondWindChance`) — the first time the
   * run would die broke, a coin is flipped: on `secondWindChance` you refill
   * to `secondWindTiles` and carry on, otherwise you die anyway. Marc
   * amended the guaranteed version to this himself, and the amendment is
   * what makes it interesting — a floor tells you how much risk is correct,
   * a coin flip only tells you whether you dared.
   *
   * Zeros and false = the perk is not owned, which is where every run starts.
   */
  readonly rootboundOnly: boolean;
  readonly secondWindTiles: number;
  readonly secondWindChance: number;

  readonly burnRelics: number;
  readonly claimRelics: number;
  readonly luckToRelics: number;

  readonly hidePoints: boolean;

  readonly luckRerollCost: number;
  readonly luckSteerCost: number;
  readonly luckForgeCost: number;

  /**
   * TITHE (2026-08-18): a fourth luck price, and the only one that does not
   * buy the draft. Converts the WHOLE purse to relics, on the spot, at
   * `titheRate` — better than what dying with luck still in the purse pays
   * (`luckToRelics`, 10%), so tithing is a live alternative to hoarding
   * rather than a strictly worse version of the same thing.
   *
   * `titheMin` is the floor: below it, tithing would convert a few luck into
   * a fraction of a relic, which is a trap dressed as an option rather than
   * a real one, so the row simply refuses. Both 0 in the bare skeleton and
   * every old save — the same "the whole cluster is gated by one dial" shape
   * `stoneDiscount`/`wallBuildCostMult` already keep.
   */
  readonly titheRate: number;
  readonly titheMin: number;

  readonly singlePayout: boolean;
  readonly pointsPerPop: number;
  readonly burnLuck: number;
  readonly endReachBonus: number;
  readonly endClaimBonus: number;

  /** Draft width. Three is the base game; more is an unlock. */
  readonly draftWidth: number;

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

/**
 * The zeroed skeleton: every system off, every personality flat.
 *
 * NOT a playable economy and never shipped — it is the baseline the one
 * economy is layered on, and the fixture every rule test isolates against.
 * A test that wants to prove "green crowds" has to start somewhere where
 * green does not crowd, and building that by hand in nine files is how the
 * fixtures drift apart.
 */
export const BARE_TUNING: Tuning = {
  distanceStep: 4,

  worldWalls: 0.06,
  fieldSize: 4,
  fieldChance: 0.55,

  // Off in the bare skeleton — the shipped tuning below switches them on and
  // the harness sweeps them.
  destinationEvery: 0,
  destinationChance: 0,
  cachePays: 12,
  sitePays: 25,
  territoryRadius: 2,
  beaconHorizon: 8,

  cachePaysPerRing: 0,
  popTilesPerRing: 0,
  destinationRampBlocks: 0,
  deepWaterRampBlocks: 0,
  cacheShareFar: 0,

  findEvery: 0,
  findChance: 0,
  findSense: 0,

  stoneDiscount: 0,
  wallBuildCostMult: 0,

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
  elevationEvery: 0,
  elevationBands: 0,

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
  // The bare skeleton keeps the original straight line — the curve the
  // earliest Gate C evidence was gathered on.
  costGrace: 0,
  costRisesEvery: 70,
  runLength: 0,

  tilesPerPop: 1,
  worthPerExtraTile: 2,

  harvestSizeBonus: 1,
  harvestSizeCap: 0,

  luckPerPop: 0,
  luckPerTile: 1,
  rootboundOnly: false,
  secondWindTiles: 0,
  secondWindChance: 0,
  burnRelics: 0,
  claimRelics: 0,
  luckToRelics: 0,
  hidePoints: false,
  luckRerollCost: 0,
  luckSteerCost: 0,
  luckForgeCost: 0,
  titheRate: 0,
  titheMin: 0,
  colourBiasDraws: 0,
  colourBiasWeight: 0,

  singlePayout: false,
  pointsPerPop: 0,
  burnLuck: 0,
  endReachBonus: 0,
  endClaimBonus: 0,

  draftWidth: 3,

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
const PLANE: Tuning = {
  ...BARE_TUNING,

  // 2026-08-14, Marc: "time constrained, yet points become more important."
  // Swept at 40 seeds. The cost curve tightens 70 -> 50: the longest possible
  // run (pure survival stalling) drops 523 -> ~337 placements — roughly a
  // 15-20 minute ceiling at a human pace — while the bank-40 optimum and the
  // bank-80 cliff survive intact. The multiplier steps every 3 hexes instead
  // of 4: every scoring line gains ~40% points in the SAME number of
  // placements (bank15 5,034 -> 7,112 · seeker 3,019 -> 4,320), so a minute
  // spent scoring is worth more and a minute spent stalling still pays ~0.
  // (The bounded game kept its own 70/4 until it was deleted, 2026-08-16.)
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
  // Blocks of 9 hexes across five bands: big enough that a slope takes a few
  // placements to climb, banded enough that two neighbours can visibly differ.
  elevationEvery: 9,
  elevationBands: 5,

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

/**
 * The tiles-only run — Marc's pivot, 2026-08-15, behind `run.tilesonly`.
 *
 * "Start with 30 tiles, get tiles along the way if you're good or lucky,
 * die when you run dry, and go farther over time." One currency to live on,
 * points as the score rather than a payout, and the roguelite carrying the
 * reach across runs.
 *
 * What changes from the endless economy, and why:
 *
 * - `singlePayout` — a pop pays tiles, always. Gate B failed twice for
 *   opposite reasons (tiles dominating, then tiles going spare); this is the
 *   gate's own written fallback rather than a third attempt to balance it.
 * - `runLength: 0` — no clock. Marc: no infinite runs, but the ending should
 *   be running DRY, so a good or lucky run genuinely goes farther. The cost
 *   curve is what guarantees it ends: income is capped by geometry at about
 *   one pop per placement while cost climbs forever.
 * - `costGrace: 0` and a steeper curve — with no clock, the curve IS the
 *   clock, so it starts working immediately rather than after 120 free
 *   placements.
 * - `cachePays` down to 26 — caches still fund the expedition, but a purse
 *   that outgrows what the run can spend was the exact state Marc hit at 202
 *   tiles, and without a clock the only cure is charging more for a
 *   placement than a cache hands over.
 * - `pointsPerPop`, `endReachBonus`, `endClaimBonus` — score from playing
 *   (a fraction of the old points formula), from sites and bounties as
 *   before, and from the expedition itself when it ends.
 * - `burnLuck: 3` — a burned pocket pays three luck a tile instead of its
 *   tiles: sacrifice the run to draw better.
 */
export const TUNING: Tuning = {
  ...PLANE,

  // Small and often is the LUCK line, big and late is the score line: a flat
  // 9 luck a pop against half a point per tile means three 4-pockets pay 33
  // luck where one 12-pocket pays 15. And every pop steers the next six draws
  // toward its own colour, so cashing a green pocket is how you get more
  // green to build the next one with.
  luckPerPop: 9,
  luckPerTile: 0.5,
  colourBiasDraws: 6,
  colourBiasWeight: 2,

  // Luck is a PURSE, not a bar (Marc played it, 2026-08-15). It buys nothing
  // passively here — permanent odds are bought with points between runs — so
  // these three prices are the whole of what popping early is for. Income is
  // about 10 a pop and a good run pops ~140 times, so a reroll is small
  // change, a steered hand is a real decision, and a unique costs six pops.
  luckMagicPerPop: 0,
  luckUniquePerPop: 0,
  luckCap: 99999,
  hidePoints: true,
  luckRerollCost: 12,
  luckSteerCost: 30,
  luckForgeCost: 75,
  // TITHE (2026-08-18): 25%, better than the 10% death pays on unspent luck,
  // so cashing out mid-run is a real alternative to hoarding rather than a
  // strictly worse version of it. `titheMin` 20 keeps a token tithe (a
  // handful of luck for one relic) off the row — 20 luck is roughly two
  // pops' worth, below `luckSteerCost`, so the floor sits under the shop's
  // own cheapest colour purchase rather than above it.
  titheRate: 0.25,
  titheMin: 20,

  singlePayout: true,
  pointsPerPop: 0.35,
  // Burning pays RELICS now, not luck. That was the open question, and the
  // answer arrived with the meta economy: a burn gives up the tiles keeping
  // you alive AND the score, and buys the next run instead. Luck was the
  // wrong price because popping paid luck too, so the sacrifice bought
  // nothing the safe move did not.
  burnLuck: 0,
  burnRelics: 2,
  claimRelics: 3,
  luckToRelics: 0.1,
  endReachBonus: 40,
  endClaimBonus: 60,

  runLength: 0,
  costGrace: 0,
  // Swept: 22 gave ~140-placement runs (8 min), 38 gave ~270 (16). 30 lands
  // a good run near 200 placements — about twelve minutes — with careless
  // play dead at 111 and random play at 32, which is the skill spread Gate C
  // asks for.
  //
  // 2026-08-18 (Marc: "too easy, I want it to become easier gradually with
  // relics, not at the start"): the curve came down to 22 — and became the
  // thing STEADY PACE buys back, +2 a level to the old 30. Last session's
  // sweep rejected a steeper curve because it sank the maxed ceiling; making
  // the curve itself purchasable removes that objection, and the harness
  // agrees: run one falls to ~121 placements · reach 12 · ~3,000 pts while
  // maxed climbs to ~248 · 18 · ~23,000 — the widest ladder of every
  // candidate swept (see LOG, 2026-08-18).
  costRisesEvery: 22,

  /**
   * RUN ONE IS SMALLER THAN IT WAS (Marc, 2026-08-16, mid-run at 166 tiles on
   * placement 61: "feels like early on we can advance alot with only 30 tiles
   * with all the caches and stuff, maybe we can tone it down and balance a bit
   * so after a few runs with bought relics item its back to what it is now").
   *
   * He was right, and the harness said something worse: run one was already
   * where a MAXED run should be. Every upgrade in the shop bought +2 reach and
   * a quarter more placements between them, because a fresh run was already
   * near the ceiling the plane allows. A roguelite whose first run is its best
   * run has a shop for decoration.
   *
   * So the floor came down and the ladder got longer. Measured at 40 seeds a
   * rung, on bank20:
   *
   *   run 1            reach 14 · 166 placements · 7,795 pts
   *   +4 purse, eye, world   reach 15 · 187 · 12,211   (~today's run one)
   *   +6 purse, 3 eye, 2 world  reach 16 · 209 · 17,305
   *   maxed            reach 15 · 228 · 21,906
   *
   * Today's run one was reach 16 · 186 · 14,153, so the shop climbs back
   * through it around the middle rung — a few hundred relics, which is a few
   * runs — and goes past it after. Exactly the shape he asked for.
   *
   * The cost curve was deliberately NOT touched. Steepening it as well (24
   * rather than 30) put the MAXED ceiling below today's floor, which is not
   * toning down, it is a different, smaller game.
   */
  startingTiles: 22,
  destinationChance: 0.45,

  /**
   * THE WORLD IS GRADUAL NOW (Marc, 2026-08-18: "check for gradual formulas
   * instead of constants for our distance, pop/tiles, shrine density").
   *
   * Three constants became curves over distance from home, so the run is lean
   * at the doorstep and rich in the deep — the difficulty ramp lives inside
   * the run as well as between runs:
   *
   * - a cache pays 6 at the doorstep and +4 per ring out, so the cache worth
   *   walking to is the far one. RICHER WORLDS still raises the base +3 a
   *   level, so a maxed ring-2 cache pays 26 — the pre-rebalance number.
   * - a harvest pays a quarter-tile extra per pop per ring, so survival
   *   income grows with depth instead of being flat everywhere.
   * - destination density ramps in over 2 blocks, so the near world is
   *   sparse but run one still meets its first claim (~1 median, swept).
   *
   * Swept together with the 22-curve at 40 seeds a rung: no stalls, skill
   * spread intact (random dead at 23 placements, pop-early at 102, competent
   * at 121), and reach — the point of the game — grows 12 → 18 across the
   * shop ladder where the flat world managed 14 → 16.
   */
  cachePays: 6,
  cachePaysPerRing: 4,
  popTilesPerRing: 0.25,
  destinationRampBlocks: 2,

  /**
   * DEEP WATER (2026-08-18, first values): the mix, not just the density,
   * tilts with distance. `deepWaterRampBlocks` 10 keeps the tilt behind the
   * existing density ramp (2 blocks) on purpose — by the time destinations
   * are at full density the mix has barely moved (20% of the way at block
   * distance 2), so the near world plays exactly as it did before this
   * dial existed, and the tilt is a DEEP-run fact rather than an early one.
   * `cacheShareFar` 0.2 (down from 0.4 near home) hands its other 20 points
   * to site/territory/shrine in their existing 35:17:8 ratio to each other —
   * a maxed-out deep block runs roughly 20% cache / 47% site / 23%
   * territory / 11% shrine, so a pushed run meets more of the interesting
   * things and fewer plain lifelines exactly where survival is least in
   * question. Swept at 40 seeds against bank20/spender/seeker: no stalls,
   * skill spread and the clock held; see LOG for the claims-curve note.
   */
  deepWaterRampBlocks: 10,
  cacheShareFar: 0.2,

  /**
   * HIDDEN FINDS EXIST, AND ARE RARER THAN SHRINES (2026-08-18, first
   * values). The yardstick is the rarest thing already out there: shrines
   * are 8% of destinations at one per ~6-hex block and 0.45 chance —
   * 0.45 × 0.08 / 36 ≈ 0.0010 shrines per hex at full ramp. A find block of
   * 12 hexes at 0.14 is 0.14 / 144 ≈ 0.0010 per hex BEFORE the deep-world
   * exclusion (nothing within a block-width of home) carves out the whole
   * ground a short run ever sees — so where runs actually happen, finds come
   * up rarer than shrines. Measured over seeds 1-40: a disc of radius 14
   * holds ~0.15 finds a world against ~0.5 shrines, radius 20 holds ~0.9
   * against ~1.2, radius 30 ~2.5 against ~3.0 — under the shrine line at
   * every depth. A run that pushes to reach 14+ reveals a strip of that
   * disc, so a find lands every few pushing runs: a lottery ticket, not a
   * checklist. Swept beside 10/0.12 (crosses ABOVE the shrine line past
   * radius 20) and 12/0.2 (outnumbers shrines everywhere deep); 12/0.14 is
   * the one that stays rarest without vanishing. `findSense` stays 0 — the
   * shop sells the nose.
   */
  findEvery: 12,
  findChance: 0.14,
};
