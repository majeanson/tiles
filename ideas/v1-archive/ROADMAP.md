# Roadmap

Nine milestones. Each is independently playable and independently testable. Ship each
before starting the next — the point of this ordering is that you can *feel* whether the
design is working long before it is finished.

Effort labels are relative, not hours.

---

## M0 — Foundation

**Small. Do not skip.**

- Repo, TypeScript strict, Vite, Vitest, ESLint + Prettier
- The `content ← engine ← ui` dependency rule enforced by `no-restricted-imports`
- `src/engine/hex.ts` with full unit tests
- `src/engine/rng.ts` with determinism tests
- `src/content/tuning.ts` populated from `CONTENT.md`, even though nothing reads it yet

**Done when:** `pnpm test` passes with hex and RNG coverage, and an import from `engine` to
`ui` fails lint.

---

## M1 — Board and placement

- `GameState` per `ENGINE.md` §3, `reduce` skeleton, `PLACE` and `SELECT_DRAFT`
- Fixed test region (hardcoded cell set — no generation yet)
- Draft of three, rolled tiles, rarity gates, match scoring, refunds
- Barren ground on zero matches
- **Match preview on every legal hex** — this is a design requirement, not a nicety
- Minimal SVG board, draft bar, budget and score readouts

**Done when:** you can place tiles on a fixed board, see match counts before committing,
create barren ground deliberately, and watch the budget drain to zero.

---

## M2 — Regions

- `regiongen.ts` per `ENGINE.md` §7
- Blocked terrain, edge entry, waypoint and ring
- Board auto-fits the generated region
- Space remaining readout

**Done when:** a property test generates 5,000 regions with zero failures — all connected,
every waypoint ring in-region and unblocked, every entry on a boundary.

**Watch for:** playing a 0.08-blocked biome and a 0.20-blocked biome back to back should
already feel different, even before the dividend exists.

---

## M3 — Bursts and the dividend

**The keystone milestone. Everything before this is a toy.**

- Enclosure detection (solid = tile, blocked, barren, outside)
- Chain BFS with reach cap
- `PendingDividend` computation, `phase = 'dividend'`
- The three-choice modal: Quarry, Harvest, Prospect
- Loot floor from matching neighbours; Prospect inserts into the draft
- Burst animation played back over already-resolved state

**Done when:** a burst stops the game and asks a question you actually have to think about.

**The test that matters is not automated.** Play twenty bursts. If you pick the same
option every time, either the values are wrong or the situations aren't varied enough —
report it before building on top.

---

## M4 — Contracts, waypoint, sealing

- Two active contracts, event pipeline, replacement on completion
- Waypoint gating: unplaceable until two contracts complete
- Seal conditions by depth from `content/seals.ts`
- Waypoint burst at ×2.5 with its own dividend
- Region sealing, multiplier calculation, `sealed[]`
- Two-option next-region choice (random pair; graph comes in M6)
- `LEAVE_REGION_UNSEALED` escape hatch
- Cost rises per region

**Done when:** you can seal three regions in a row and the run has a shape.

**Watch for:** the window. Once the way opens, do you ever *choose* to stay? If not,
depletion is too weak or the next region is not scary enough. Report it.

---

## M5 — The death model

- The Ebb with hysteresis (enter <5, exit >12) and `ebbsSurvived` penalty
- Board desaturation and readout state change
- Last Light: one free placement, everything loaded fires at once
- End screen with base score, region multipliers, final score
- **The death curve chart** — cost versus trailing income, with the Ebb marked
- Region `shapeBias` implementation (narrow / open / broken)

**Done when:** a run ends on its largest number, and the end screen tells you what killed
you in one sentence.

---

## M6 — Stats, levels, and the world graph

- XP, levelling, 2 stat points per level
- Five stats with all twenty breakpoints from `CONTENT.md`
- Stat requirements on uniques, with dormant affixes when unmet
- Blessing draft every third level, six slots, five ranks
- Biome adjacency graph replacing random pairs
- Lookahead: one clear tier, one dim tier

**Done when:** two runs that allocated points differently feel like different games.

**This is where the balance harness becomes essential.** Build `src/sim/` here if not
before.

---

## M7 — Meta

- Vault: uniques persist across runs, 3 loadout slots
- Gold, permanent upgrades
- Evolutions (rank 5 + Vault unique)
- The Wake serving drafts
- Save and resume via `JSON.stringify(state)`

---

## M8 — Depth and texture

- In-region fog, revealed by proximity, widened by Survey
- Hidden realms off the graph
- Environmental logs at landmarks, collected across runs
- Procedural deep biomes as parameter hybrids
- Keepers (starting classes)

---

## M9 — Feel

- **Sound.** One burst chime does more for feel than most of M7 and M8 combined. An
  ascending pentatonic run across a chain is the specific thing to build.
- Art direction pass — the prototype's look is a placeholder, not a brief
- Haptics on placement and burst
- PWA install, offline support
- Reduced-motion respect throughout

---

## Cross-cutting: the balance harness

`src/sim/` — build no later than M6, ideally at M4.

Four scripted policies (`greedy-score`, `economy`, `prospector`, `random-legal`) playing
1,000 runs each, reporting median depth, score distribution, Ebb entry and recovery rates,
and median turns per region.

**Signals you are looking for:**

- `greedy-score` and `economy` reach comparable depth by different routes
- `random-legal` dies around region two
- no policy runs forever
- median turns per region sits in a range where the window decision is live rather than
  automatic

Tuning by playing will not work, because the target is the slope of a curve rather than a
duration. You need distributions.

---

## Suggested first session

M0 and M1. Resist starting the reducer before hex math is tested — everything downstream
rests on it, and a coordinate bug found at M4 is expensive.
