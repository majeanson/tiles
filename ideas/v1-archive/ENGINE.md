# Engine specification

The game is a **pure state machine**. This document defines its state, its actions, and the
exact order in which a placement resolves.

```ts
function reduce(state: GameState, action: Action): GameState
```

Deterministic given its arguments. All randomness comes from seeded streams inside
`GameState`. No DOM, no timers, no async, no mutation.

---

## 1. Hex math

**Pointy-top hexes, axial coordinates `(q, r)`.** Own this; do not install a library.

```ts
export type Hex = { q: number; r: number };
export type HexKey = string;                    // `${q},${r}`

export const key = (q: number, r: number): HexKey => `${q},${r}`;
export const parse = (k: HexKey): Hex => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

export const DIRECTIONS: readonly [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export const neighbours = (q: number, r: number): Hex[] =>
  DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));

export const distance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

// Rendering only — never used by engine logic.
export const toPixel = (q: number, r: number, size: number) => ({
  x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
  y: size * 1.5 * r,
});
```

**Neighbour order is fixed and meaningful.** Index 0 is east, proceeding
counter-clockwise. Seal conditions and ring definitions depend on this ordering being
stable.

---

## 2. Randomness

**Multiple named streams, not one.** Rerolling a tile must not perturb region generation.
Store each stream's cursor in state so the whole run is reproducible from a single root
seed.

```ts
export type RngStream = { seed: number; cursor: number };

export type RngStreams = {
  region: RngStream;   // region shape, blocked placement, waypoint choice
  tiles: RngStream;    // draft rolls
  loot: RngStream;     // dividend prospect rolls
  contracts: RngStream;
  blessings: RngStream;
};

// mulberry32 — small, fast, adequate. Advance by cursor, never by side effect.
export function rngNext(s: RngStream): [number, RngStream] { /* returns [0,1), new stream */ }
export function rngInt(s: RngStream, n: number): [number, RngStream];
export function rngPick<T>(s: RngStream, xs: readonly T[]): [T, RngStream];
export function rngWeighted<T extends string>(
  s: RngStream, weights: Record<T, number>
): [T, RngStream];
```

Every engine function that consumes randomness takes the relevant stream and **returns the
advanced stream** alongside its result. Never mutate.

---

## 3. State

```ts
export type Rarity = 'common' | 'magic' | 'rare' | 'unique';
export type Terrain = 'woodland' | 'meadow' | 'hamlet' | 'water';
export type AffixKey = 'match' | 'aura' | 'wild' | 'draw' | 'luck' | 'burst';
export type StatKey = 'husbandry' | 'craft' | 'fortune' | 'survey' | 'masonry';

export type Tile = {
  id: string;                              // unique per instance, for React keys and logs
  terrain: Terrain;
  rarity: Rarity;
  uniqueId?: string;                       // set only for uniques; indexes content/uniques
  affixes: Partial<Record<AffixKey, number>>;
  requirement?: { stat: StatKey; value: number };   // uniques only
};

export type CellState =
  | { kind: 'empty' }
  | { kind: 'blocked' }
  | { kind: 'barren' }
  | { kind: 'tile'; tile: Tile; burst: boolean };

export type Region = {
  biomeId: string;
  depth: number;                           // 1-based; drives seal conditions and cost
  cells: Record<HexKey, CellState>;        // the authoritative board. Absent key = outside region
  entry: HexKey;
  waypoint: HexKey;
  waypointRing: HexKey[];                  // ordered, from DIRECTIONS
  placeableTotal: number;                  // cells that are not blocked, at generation time
  revealed: Record<HexKey, true>;          // in-region fog; empty object means fully revealed
};

export type Contract = {
  id: string;
  templateId: string;
  label: string;
  need: number;
  progress: number;
};

export type SealedRegion = {
  biomeId: string;
  depth: number;
  fillFraction: number;
  matchedFraction: number;
  multiplier: number;
  sealed: boolean;                         // false if the player left via an exit edge
};

export type PendingDividend = {
  hexes: HexKey[];                         // every tile in the chain, in detonation order
  pot: number;                             // Harvest value
  tiles: number;                           // Quarry value
  bestMatches: number;                     // drives the loot floor
  luck: number;                            // accumulated from burst tiles and their neighbours
  isWaypoint: boolean;
};

export type Phase =
  | 'placing'
  | 'dividend'
  | 'levelup'
  | 'regionChoice'
  | 'lastLightPlacing'
  | 'ended';

export type GameState = {
  version: 1;
  rootSeed: number;
  rng: RngStreams;

  phase: Phase;

  budget: number;
  costPerPlacement: number;
  score: number;
  xp: number;
  level: number;
  statPoints: number;
  stats: Record<StatKey, number>;
  blessings: Record<string, number>;       // blessingId -> rank

  region: Region;
  regionNumber: number;
  contracts: [Contract, Contract];
  contractsCompleted: number;
  waypointOpen: boolean;

  draft: Tile[];
  wake: Tile[];
  selectedDraftIndex: number;

  ebb: boolean;
  ebbsSurvived: number;

  sealed: SealedRegion[];
  vaultFound: string[];                    // uniqueIds discovered this run

  pendingDividend: PendingDividend | null;
  pendingBlessingChoice: string[] | null;  // three blessingIds
  nextRegionOptions: string[] | null;      // two biomeIds

  stats_run: {                             // telemetry for the end screen
    placements: number;
    bursts: number;
    barren: number;
    incomeHistory: number[];               // tiles gained per placement, for the death curve
    ebbEnteredAt: number | null;
  };
};
```

**Note on `cells`.** It is the single source of truth for the board. Do not keep parallel
`Set`s of blocked/barren/burst — every prior bug in the prototype came from those drifting
apart.

---

## 4. Actions

```ts
export type Action =
  | { type: 'SELECT_DRAFT'; index: number }
  | { type: 'PLACE'; hex: HexKey }
  | { type: 'DISCARD_DRAFT' }
  | { type: 'TAKE_DIVIDEND'; choice: 'quarry' | 'harvest' | 'prospect' }
  | { type: 'SPEND_STAT_POINT'; stat: StatKey }
  | { type: 'CHOOSE_BLESSING'; blessingId: string }
  | { type: 'CONFIRM_LEVELUP' }
  | { type: 'CHOOSE_REGION'; biomeId: string }
  | { type: 'LEAVE_REGION_UNSEALED' }
  | { type: 'NEW_RUN'; seed: number };
```

**Actions are rejected, never thrown.** An illegal action returns the state unchanged.
The UI is responsible for not offering illegal actions; the engine is responsible for not
trusting it.

**Phase gates which actions are legal:**

| Phase | Legal actions |
|---|---|
| `placing` | `SELECT_DRAFT`, `PLACE`, `DISCARD_DRAFT`, `LEAVE_REGION_UNSEALED` |
| `dividend` | `TAKE_DIVIDEND` |
| `levelup` | `SPEND_STAT_POINT`, `CHOOSE_BLESSING`, `CONFIRM_LEVELUP` |
| `regionChoice` | `CHOOSE_REGION` |
| `lastLightPlacing` | `SELECT_DRAFT`, `PLACE` |
| `ended` | `NEW_RUN` |

---

## 5. The placement pipeline

**This ordering is the specification.** Deviating from it changes the game.

`PLACE` in phase `placing`:

1. **Validate.** Cell exists in region, is `empty`, and is not the waypoint while
   `waypointOpen` is false. At least one neighbour is `tile` or `barren`. Placed-tile
   neighbour count meets the rarity gate, reduced by Masonry. **Reject silently if any
   check fails.**
2. **Deduct** `costPerPlacement` from budget. (Zero during `lastLightPlacing`.)
3. **Write** the tile into `cells[hex]` as `{ kind: 'tile', tile, burst: false }`.
4. **Count matches** — neighbours of kind `tile` whose terrain equals this tile's, or where
   either side has the `wild` affix. Barren and blocked never match.
5. **If matches === 0**, replace the cell with `{ kind: 'barren' }` and jump to step 10.
   The tile is consumed and the budget is not refunded.
6. **Score.** `matches × (10 + tile.affixes.match ?? 0)`, then multiply by neighbour auras,
   the Craft stat multiplier, and blessing multipliers, in that order. Round once at the
   end. Add to `score` and to `xp`.
7. **Refund.** If `matches >= refundThreshold(stats.husbandry)`, budget += 1.
8. **On-place affixes.** Apply `draw`.
9. **Contract events.** Emit `{ type: 'place', tile, matches }` to both contracts.
10. **Consume the draft.** Remove the selected tile, push the other two to `wake`, draw a
    replacement set. Reset `selectedDraftIndex` to 0.
11. **Detect enclosure.** For the placed hex and each of its six neighbours, a cell is
    enclosed if it is `kind: 'tile'`, `burst === false`, and all six of its neighbours are
    solid. Solid means: outside the region, `blocked`, `barren`, or `tile`.
12. **Build the chain.** BFS from all enclosed seeds through enclosed, unburst neighbours.
    Cap at `chainReach(stats.masonry, blessings.leylines)` total hexes.
13. **If the chain is non-empty**, compute the `PendingDividend`, set `phase = 'dividend'`,
    and **return**. Steps 14–18 happen after `TAKE_DIVIDEND`.
14. **Level check.** While `xp >= xpForLevel(level + 1)`: level up, grant 2 stat points,
    and on every third level set `pendingBlessingChoice`. If any level occurred, set
    `phase = 'levelup'` and return.
15. **Ebb check.** Enter if `budget < ebbEnter` and not already in Ebb. Exit if
    `budget > ebbExit` and in Ebb, incrementing `ebbsSurvived`.
16. **Last Light check.** If `budget <= 0` and phase is `placing`, set
    `phase = 'lastLightPlacing'`.
17. **Stuck check.** If no drafted tile has a legal hex, the UI should surface
    `DISCARD_DRAFT`. Do not auto-discard.
18. **Set** `phase = 'placing'`.

### `TAKE_DIVIDEND`

1. Mark every hex in `pendingDividend.hexes` as `burst: true`.
2. Apply the chosen payout:
   - `quarry` — `budget += pending.tiles`
   - `harvest` — `score += pending.pot`, `xp += pending.pot`
   - `prospect` — roll one tile at floor `lootFloor(bestMatches, stats.fortune)` with
     `pending.luck` applied; replace the last draft slot. If unique, push to `vaultFound`.
3. Emit contract event `{ type: 'burst', count: hexes.length }`.
4. **If `isWaypoint`**, evaluate the seal condition. On success, seal the region (§6) and
   set `phase = 'regionChoice'`. On failure the waypoint does not seal and remains
   burstable-once — the player has spent it. *(See open question in `OPEN-QUESTIONS.md`.)*
5. Otherwise continue at pipeline step 14.

### `LEAVE_REGION_UNSEALED`

Legal only from `placing`. Pushes a `SealedRegion` with `sealed: false` and
`multiplier: 1` (no bonus), then sets `phase = 'regionChoice'`. This is the escape hatch
that prevents soft-locks when a seal condition is unreachable.

---

## 6. Sealing a region

```ts
fillFraction    = (tiles + barren × 0.5) / region.placeableTotal
matchedFraction = tilesWithAtLeastOneMatch / tiles          // 0 if tiles === 0
multiplier      = 1 + fillFraction × 0.4 + matchedFraction × 0.2
```

Final score at run end:

```ts
finalScore = round(score × sealed.reduce((m, s) => m * s.multiplier, 1))
```

Entering the next region:

```ts
regionNumber += 1
costPerPlacement = 1 + (regionNumber - 1) + ebbsSurvived
// Husbandry 20 (Endurance): the (regionNumber - 1) term uses floor((regionNumber - 1) / 2)
```

---

## 7. Region generation

Deterministic from `rng.region`. The prototype's algorithm is validated over 4000 samples
(35–57 cells, zero invalid waypoints or entries) and should be ported as-is.

```
1. Start from a hex disc of radius 4 centred on (0,0).
2. Drop each cell at distance 4 with probability 0.5, and at distance 3 with probability
   0.15 — this produces the irregular outline.
3. Flood-fill from (0,0) and keep only reachable cells. Guarantees connectivity.
4. Choose the waypoint from cells at distance 1–2 whose six neighbours are all in-region.
   Fall back to the centre if the candidate set is empty.
5. Compute the waypoint ring as the six neighbours, in DIRECTIONS order.
6. Boundary cells are those with at least one out-of-region neighbour.
7. Entry is the boundary cell furthest (hex distance) from the waypoint.
8. Blocked terrain: each cell not equal to entry, waypoint, or a ring member is blocked
   with probability biome.blockedDensity.
9. placeableTotal = reachableCells - blockedCells.
10. Place the entry tile: a common tile of a biome-weighted terrain, at `entry`.
```

**Shape bias per biome is not yet implemented.** `DESIGN.md` §8 calls for narrow valleys
versus open basins. The hook is `biome.shapeBias`; leave it stubbed in milestone 2 and
implement in milestone 5.

---

## 8. Derived reads (selectors)

Keep these out of state; compute them.

```ts
legalHexes(state, tile): HexKey[]
matchPreview(state, tile, hex): number     // required by DESIGN.md §3
remainingSpace(state): number
enclosedUnburst(state): HexKey[]           // the "loaded chain" the player is sitting on
canSeal(state): boolean                    // does the current board satisfy the seal condition
incomeRate(state): number                  // trailing average, for the Ebb and end screen
deathCurve(state): { cost: number[]; income: number[] }
```

`enclosedUnburst` is worth surfacing in the UI — the design calls loaded chains "a savings
account," and the player should be able to see the balance.

---

## 9. Serialisation

`GameState` must round-trip through `JSON.stringify`/`parse` without loss. That is why
`cells` is a `Record` and not a `Map`, and why RNG state is `{ seed, cursor }` rather than
a closure.

This buys three things cheaply: save-and-resume, golden tests, and a replay format
(`rootSeed` plus the action list reconstructs any run exactly).
