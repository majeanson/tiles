# The endless world — a design push, 2026-08-04

Status: **P1 built and answered (2026-08-04, Session 3 in `LOG.md`) — the
answer is yes.** The engine plays the endless world behind
`--set world=endless`, the harness has swept it, and harvest timing has an
interior optimum with a cliff past it — pinned in `src/sim/sim.test.ts`. P2
(terrain) and P3 (camera, fog, landmarks) remain unbuilt, and nothing here has
been touched by a human hand yet.

This is the design pass `prompt.md` Q0 called option (b), pushed by Marc after
playing the prototype. It lives in `ideas/` because `DESIGN.md` records only
what play has proven. It is written in the repo's idiom: questions first, one
per prototype, harness before pixels.

---

## Why this is not a detour

Two facts already in the ledger make this push legitimate rather than scope
creep:

1. **Rule 5's harvest timing is fake, and the cause is structural.** Banking
   every pop to the end of a map beats harvesting as you go by 43×, survives
   flattening the quadratic, and neither existing dial fixes it
   (`src/sim/sim.test.ts`, pinned failing). The root cause is that a bounded
   map plus a whole-board harvest makes banking free: there is always an "end
   of the map" to bank toward, and one button cashes the entire board at once.
   The two dials tried so far both tune *within* that structure. This proposal
   changes the structure.

2. **The art directions were written for this game.** All three handed-down
   directions assume an endless scrolling map, two-tier fog of war, and local
   cascades. Session 2 marked those slots `NO MECHANIC` rather than faking
   them. If this design survives its prototypes, those slots stop being
   orphans.

So the honest frame: this is a candidate **answer to the open design
problem**, which happens to also be the game the art assumes. It still reopens
Gate C — the economy was closed against bounded maps — and that cost is
accepted knowingly, because Gate C's subject is currently failing anyway.

---

## What a run becomes

One continuous hex plane, endless in every direction. You spawn at a marked
origin. There are no maps and no LEAVE button — the world is the map.

- **Background terrain** exists under everything: plain ground, blocked
  ground (walls), and biome fields where one colour is native. It is a pure
  function of `(worldSeed, hex)` — computed on demand, never stored, which is
  what makes "endless" free in a pure engine.
- **Fog** hides terrain you have not been near. Placing a tile reveals cells
  around it. Two tiers, as the art directions specify: far fog shows nothing
  except **landmarks**, which glow through it from a distance; near fog shows
  terrain but takes no placement.
- **Landmarks are the hints.** A seeded feature twelve hexes north-east shows
  as a glow long before you can see the ground under it. Reaching it —
  building your tile chain out to touch it — pays something real: a special
  tile, a perk, an unlock. "Where do I push next" becomes the routing
  decision, replacing the unlock ledger's "choice of two maps".
- **Stone becomes the road.** Popped tiles still turn to stone, stone still
  surrounds and never matches — but on a continuous plane your stone wake is
  also the connected ground you extend from. The spent land behind you is the
  trail; the map at death is the run's whole story, drawn.

### The rules, redrafted

```
1. Take one of three tiles. Four colours.
2. Place it touching something already placed.
3. A tile touched on all six sides is RIPE.
   Walls and stone count as touching.
4. A ripe tile's WORTH = how many of its six neighbours are
   the same colour. Native ground counts as one match.
5. Tap a ripe tile: it and every ripe tile touching it pop
   together, and turn to stone. Take either tiles or points.
6. Points are worth more the farther from home you pop them.
7. Placing costs tiles. The cost rises the more you have
   placed, all run. At zero: one last tile, one last harvest.
```

Still seven rules, still zero invented words. Old rule 7 (harvest before you
leave) dissolves — there is no leave. Its job, pricing depth, moves to rule 6:
distance from origin replaces `mapNumber` as the multiplier, continuous
instead of stepped, and you cannot beeline to distance 40 for free because
every hex of the journey is a placement at ever-rising cost.

### Why local harvest attacks the banking problem

Rule 5 changes from "every ripe tile everywhere pops at once" to "the
connected ripe cluster you tap pops". Three consequences:

- Banking the whole board is no longer one free action. The size bonus is
  per-cluster, so the skill is growing one *contiguous* ripe cluster — which
  terrain walls and your own stone actively interrupt.
- An early pop no longer poisons the whole map, only its own neighbourhood —
  and rule 6 means the neighbourhood you poison is the cheap one behind you,
  while fresh high-multiplier ground is always ahead.
- The stone-never-matches rule stops being a punishment for harvesting and
  becomes the pressure to *migrate*, which is what it was always supposed to
  be.

Whether this actually makes timing a real decision is exactly what the
harness must answer — see the questions below. It is a hypothesis with a
mechanism, not a claim.

---

## "Iterative" — the two readings

Marc's word "iterative" can mean two things, and they layer rather than
compete:

- **Within a run** (this proposal): the map accumulates your history — placed
  colour ahead, stone wake behind, fog receding.
- **Across runs** (later, behind a flag): the world seed is fixed per
  profile, and *revealed fog is remembered between runs*. Each run is an
  expedition into the same world; the map itself is the meta-progression, and
  unlocks are literally places you found. The art directions' phrase
  "permanent memory" describes exactly this. Not part of any prototype below
  — written down so it is not lost.

---

## The questions, one per prototype, in order

**P1 — headless, engine + sim only. No fog, no camera, no terrain.**
*Question: does local cluster harvest on an unbounded plane with a distance
multiplier make harvest TIMING a real decision?* Build the smallest version:
unbounded placement, cluster pop, distance multiplier. Re-run farm vs trickle.
The pinned failing test in `sim.test.ts` is the thing a real fix flips. If
banking one giant cluster still dominates, the whole proposal is wounded and
we find out for the price of a sim session, before a single pixel.

**P1's answer — yes, with structure the bounded game never had.** Medians over
40 seeds; `bank<N>` grows its best pocket to N tiles before cashing it as
points, feeding on small pockets as tiles meanwhile, so N is the timing dial
held in isolation:

| Threshold | Endless points | Bounded points |
| --------- | -------------- | -------------- |
| bank3     | 336            | 293            |
| bank15    | 3,873          | 3,961          |
| bank40    | **7,380**      | 33,155         |
| bank80    | **0**          | **111,132**    |

On the bounded map banking bigger is simply always better — bank80 scores
FOUR TIMES the old champion farm, with no downside, because "map full" hands
you the cash-in moment risk-free. On the endless plane the same line has an
interior optimum and a cliff: an 80-pocket is never finished before the cost
curve wins, and the run dies with its fortune unpopped, scoring zero. Cash too
small, leave a multiple on the table; wait too long, lose everything. WHEN is
now yours to misjudge, which is the definition of the decision being real.

Three more findings from the same sweep, all pinned in `sim.test.ts`:

- **Bank-until-forced stops existing.** The bounded exploit's exact line —
  place until something forces a harvest — scores ZERO on the plane, because
  the only forced stop left is bankruptcy, and at bankruptcy survival always
  wins the payout choice.
- **The beeline exploit fails structurally.** A pure walk outward can never
  ripen anything — an arm encloses nothing — so distance cannot be farmed
  without stopping to build, which is the toll the design wanted.
- **The payout spine holds.** Always-tiles still scores nothing, pure
  points-suicide still dies at forty placements, and the sustained mixture
  beats both.

Caveat, written before anyone gets excited: trickling small pockets is still
dominated ~10× by banking to the optimum. The decision is real; whether the
GRADIENT is fun — whether a human can feel their way toward the optimum
rather than look it up — is a P3-and-phone question, not a harness one.

**P2 — terrain, still headless.**
*Question: does background terrain (walls + native fields) make placement
richer without breaking the economy?* Walls ripen clusters faster but pay
less (prompt.md Q4's economy question, now answerable). Native fields are a
placement magnet the policies can read.

**P2's answer — enriches, doesn't break.** Terrain is `engine/world.ts`, a
pure hash of `(worldSeed, hex)`: `worldWalls` fraction of ground is wall,
`fieldChance` of `fieldSize`-hex blocks are native to a colour, and a tile on
its own native ground counts the ground as one match. Same 40 seeds: every
scoring line improves (bank40 7,380 → **16,040**, rush 1,108 → 1,284, trickle
767 → 894), reach extends (12 → 16), and the structure holds — interior
optimum, cliff at bank80, blind still 0, nothing stalls. Walls also invented
the run's second death, exactly as the `DeathCause` union predicted a later
system would: `walled`, a frontier that is all wall with nothing left to pop.
Pinned in `sim.test.ts` ("pays more on textured ground").

**P3 — the UI: camera, fog, one landmark type.**
*Question: does a hint through the fog actually change where a human plays?*
This is a Gate-B-shaped question — if players ignore landmarks, they are
decoration and come out. Pan-vs-tap on a phone gets solved here or the whole
thing dies on touch.

**P3a is built — the plane under a thumb, question still open.**
`?ff=world.endless` plays the endless world on the phone: the board auto-fits
the grown world (every placement zooms the camera out a step — no pan, no
pinch, and therefore no gesture war with tap-to-place), a tap on a ripe tile
is a QUESTION rather than a placement — the harvest buttons re-price to that
pocket and the board outlines it in the theme's accent — LEAVE is gone, and
the third stat reads REACH. Deliberately not built: fog (undiscovered ground
is simply not drawn, which is half of fog for free), landmarks and their
hints, and any pan gesture. Those are **P3b**, and P3's actual question —
does a hint change where a human plays — stays unanswered until they exist.
What P3a answers first, on a phone: is the plane playable AT ALL at
auto-fit scale, and does the pocket-tap harvest read.

Persistence-across-runs is not a prototype yet; it waits on P1–P3. Marc has
confirmed it as the intent (2026-08-04): one world seed per player, revealed
ground remembered between runs, unlocks as places found. It is P4.

---

## P3b — somewhere to go, and something to find

**Status: BUILT (2026-08-13, Session 6), shaped by Marc's answers below;
its two questions are open and wait on a phone.** What shipped: destinations
as cache (12 tiles) / site (25 × distance multiplier) / claimable territory
(unfurls a radius-2 native field of its colour), one per ~12-hex block,
beacons through unrevealed ground plus a HUD hint line; rarity rolled per
DRAWN tile (magic = wild, unique = wild + heavy/double) with luck — tiles
popped in tiles-harvests — raising the printed odds. `pnpm sim --endless`
plays the shipped economy; the harness's findings are in `LOG.md` Session 6,
headline: caches moved the banking optimum from ~15 back to ~40, cliff
intact, and a compass-following policy keeps pace while claiming.

**Marc's answers (2026-08-13), which override the first cut below where they
differ:** territories pay caches and point sites PLUS claimable territory —
not rare-tile shrines; rarity rolls on the draft AND harvests raise the odds
(luck as a resource); all four rare powers appeal — wild and heavy shipped,
**scout** (reveals ground in a ring, sees beacons farther) and **perk tiles**
(placing grants a run-long passive) are the next candidates, unbuilt.

Marc's direction after first playing (2026-08-04, verbatim intent): *"the
player needs somewhere to go, a quest, bonus points, etc. Same with tiles we
get when taking tiles — based on the number, we should get a chance of
common, unique, magic, etc."* Two systems, one spec:

**Destinations.** Landmarks seeded by the terrain function, glowing through
the fog from a distance — the "hint on where to go next" from the original
push. Reaching one (building your chain out to touch it) pays something
concrete. First cut: a tile cache (bonus tiles) and a bonus-points site, so
the reward vocabulary stays inside currencies the game already has. Quests
("pop a pocket of 12+ within reach of this shrine") come only if plain
destinations prove out.

**Rarity on the tiles you take.** Today a tiles-harvest pays a NUMBER. The
direction: it should pay tiles with QUALITY, and quality should roll on
harvest size — a big pocket cashed as tiles has a chance of better-than-
common tiles (common / magic / unique, in the Diablo register the torchlit
direction already speaks). What a better tile DOES is the design work:
candidates, smallest first — a wild tile (matches any colour); a heavy tile
(counts double when matched); a seed tile (reveals ground in a ring when
placed). This makes the TILES side of the payout choice exciting for the
first time — survival stops being the boring choice — and it couples reward
quality to the same timing decision the points side already has.

**The questions, one each, before building:**

- Destinations: does a visible destination actually change where a human
  builds? (P3's original question, now with a concrete reward attached.)
- Rarity: does rolling quality on harvest size make anyone choose a TILES
  harvest they would previously have taken as points? (Gate-B-shaped: it
  must move the choice, or it is decoration.)

**Constraints carried from CLAUDE.md:** special tiles are unlock-gated
depth, not run-one content (the unlock ledger already reserves this slot);
every rarity number lives in `content/`; plain words — common, magic, unique
are words players already own. The harness needs a policy that values
special tiles before the human question gets asked, or Gate C reopens
unmeasured.

## P3c — character, and the queue behind it

**Status: the first slice is BUILT (2026-08-13, Session 8).** Marc's
diagnosis — "all is streamlined and not much fun or exploration" — and his
picks: placement wants colour personalities + pattern bonuses + a deeper
economy; exploration wants biomes, hidden finds, hazards AND quests;
drafting wants a hold slot + tiles with quirks. Shipped this session:
**colour personalities** (green crowds / yellow company / red ash / blue
tide, all in the worth channel), **biomes** (regions ~24 hexes across where
every field wears the region's colour), and the **hold slot** (a stash that
survives rerolls). Harness: reach doubled across policies — exploration pays
structurally — and the timing spine held.

**The queue, in rough order, one question each:**

- **Pattern shapes** (lines of 3+, a ring around a hex, a four-colour
  pocket): does explicit geometry change how a human packs? Note crowds and
  company already reward geometry implicitly; build only if they prove too
  subtle on the phone.
- **Hidden finds**: treasure sown under unrevealed ground so growth is
  digging. Question: does a reveal-roll make placement itself exciting, or
  just noisy?
- **Hazards**: ground that costs or threatens (thorns, unstable ground).
  Question: does risk texture change routes, or just punish?
- **Quests at landmarks**: a task with a payoff at a destination. Waits on
  the destinations themselves being felt (P3b's open question).
- **Tile quirks**: printed modifiers beyond rarity ("pays double past 8
  distance"). Waits on rarity being felt first.
- **Economy re-target** (Marc's "deeper economy"): the Session 8 inflation
  is accepted, not tuned. Re-run the depth target against personalities +
  biomes; `costRisesEvery` and `distanceStep` are the first dials.

## Risks, written down before building

- **Banking may survive as "grow one giant cluster forever".** Ringing a
  cluster keeps it growing indefinitely. Terrain interruption and rising cost
  push against it; the harness decides. Do not pre-fix with a new rule until
  P1 shows it is needed.
- **The beeline exploit in continuous form.** A thin causeway outward then
  farming at high multiplier is the old map-40 exploit reborn. The defence is
  that the causeway itself costs placements at rising cost — but that is a
  hope until swept.
- **Pan and zoom fight tap-to-place on a phone.** The current single-screen
  board has no camera. A drag threshold or a place-confirm interaction may be
  needed; testing happens on the deployed site, in portrait, as always.
- **The sim policies get harder.** They must route as well as pack. Expect
  the harness to grow a pathing heuristic; that is real work and it is the
  price of keeping Gate C honest.

## What this does to the ledger

- **Gate C reopens** for the P1 economy. Its evidence stands for the bounded
  game; it does not transfer.
- **Gate A feedback exists now**: the draft is three labelled buttons rather
  than drawn tiles, and placing reads as "just click there". Logged as the
  first human signal against the minute feeling good — a UI structure fix
  (drawn hand tiles via the existing baker), legal under the gates since it
  is layout, not art direction.
- Everything ships behind flags as always; the bounded game remains the
  default until P1–P3 say otherwise.

## The content queue, resolved (M4, 2026-08-15)

Marc's picks from 2026-08-13, each now built or killed in writing, as
`ROADMAP.md`'s contract requires. A kept corpse is a cut corner; so is a
feature kept because it was promised.

**BUILT and kept**

- **Quests at landmarks** (M1). A site opens a bounty: pop 8+ within 6 hexes
  as POINTS for ×3. Kept because it is the one thing that manufactures a
  moment where points is obviously right, which is Gate B's whole problem.
- **Shrines — places as features** (M4). 8% of destinations; reaching one
  switches a system on for the world, permanently, in a fixed five-entry
  ledger (treasure · fourth card · second stash · double odds · double
  beacon range). The unlock table `DESIGN.md` has carried since the first
  design pass, now addressed as geography instead of as a list.
- **The atlas** (M4). Seed, runs, percent known, hexes seen, territories,
  best, farthest, and the unlock ledger with the locked entries still
  readable — a reason to explore has to be legible before it is earned.
- **Territory perks** (M3), **treasure** (M3), **the stash** (S8),
  **personalities and biomes** (S8), **rarity and luck** (S6).

**KILLED, with reasons**

- **Hazards** — built, swept, deleted the same session. Unstable ground cost
  +3 tiles and paid +2 worth, which reads as a decision and measures as a
  trap: at 12% density the value-following policy died at 27 placements with
  517 points against a 38,753 baseline, and at 25% two more lines collapsed.
  The cause is structural, not a number: the REWARD sits on the preview
  number — the game's central teaching signal, the one Gate A passed on —
  and the COST does not, so every player who has learned to read the board
  is walked into bankruptcy by having learned it. A mechanic that punishes
  the game's own lesson is not a risk, it is a lie. Deleted rather than
  parked at zero.
- **Hidden finds** — killed unbuilt. Destinations now sit one per ~6-hex
  block and pay 40 tiles (M1), which IS the dig-and-find layer, at a density
  where a run claims six. A second, smaller, invisible version of the same
  idea would be two systems answering one question, and the plane already
  asks the player to read four kinds of ground.
- **Tile quirks** — killed unbuilt. Rarity already prints modifiers on a
  card: magic is wild, unique is wild and heavy, and treasure lets you
  CHOOSE one. Quirks would be a third vocabulary for the same slot.
- **Perk tiles** — killed unbuilt. Territory perks (M3) now occupy the
  run-long-passive slot and source it from exploration, which is the better
  source: a passive you earned by walking somewhere beats one you drew.
- **Scout tiles** — killed unbuilt. Their job was seeing farther; fog memory
  (M2) and the shrine that doubles beacon range (M4) both do it, and both
  are permanent rather than a one-shot.
- **Pattern shapes** (lines, rings, four-colour pockets) — killed unbuilt.
  Green's crowds and yellow's company are already geometry bonuses, measured
  at 29-31% of those colours' worth. Explicit shapes would add a rules
  paragraph to a game whose whole promise is seven rules and no glossary.
