# LOG.md — the gates, and the record

## The gates

Established before any code, so that no work is done twice and no polish lands
on an unproven design. **A gate is not passed until it is written down here as
passed, with its evidence.**

| Gate                         | Rule                                                                               | Passes when                                                                                                                    | State                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **A — The minute is fun**    | No pops, no regions, no meta until placing a tile feels good                       | 20 consecutive placements with placeholder art feel good, on the phone                                                         | **PASSED (2026-08-15)**                         |
| **B — The decision is real** | The pop payout must be a genuine choice                                            | Across 20 logged pops, no option is taken more than ~70% of the time. If it is: fix it, or cut it to a single automatic payout | **fixed structurally (S11); human log pending** |
| **C — The economy closes**   | No content authoring before the headless harness reports                           | No scripted policy runs forever; `random-legal` dies early; two different policies reach comparable depth by different routes  | **passed (session 1)**                          |
| **D — The run has an arc**   | A run must peak and then end legibly                                               | The end screen names the cause of death in one sentence, and the run's biggest number came near the end                        | **PASSED (2026-08-15)**                         |
| **E — Design freeze**        | No art direction until A–D pass                                                    | A–D signed off here                                                                                                            | open                                            |
| **F — Content last**         | Biomes, specials, perks and unlock tables are cheap to write, expensive to balance | Gate C passed with placeholder content only                                                                                    | open                                            |

## Sessions

Each session asks one question and answers it. A session that answered nothing
gets written down as such — that is information too.

---

### Session 0 — Foundation

**Question:** none. This session builds the floor everything else stands on, and
deliberately makes no design claims.

**Done**

- `tiles/` is its own git repository. It was previously untracked inside a repo
  rooted at `C:/Users/marc_` (the LAC ecosystem repo), where it did not belong.
- Toolchain: Vite 8, TypeScript 5.9 `strict` (plus `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes`), Vitest 4, ESLint 10, Prettier, pnpm.
  TypeScript was pinned back from 7.0 — `typescript-eslint` does not support it
  yet, and type-aware linting is what enforces the purity rules below.
- **The layering rule is enforced, not merely stated.** `src/engine/**` cannot
  import `ui`, `render`, `meta`, `sim` or `pixi.js`; `src/content/**` cannot
  import anything but itself. Verified by probe: an offending file produces four
  lint errors covering the layering, `Math.random`, `Date.now` and `document`.
- `src/engine/hex.ts` — pointy-top axial math, `DIRECTIONS` pinned by a test
  because ring-order rules read it as a sequence.
- `src/engine/rng.ts` — counter-based mulberry32 as plain `{ seed, cursor }`
  data, named streams so a draft reroll cannot perturb region generation.
- `src/meta/features.ts` — the progressive-unlock spine, landed before anything
  needs gating because retrofitting it later is expensive. Flags default off and
  can be flipped from the address bar (`?ff=pop.treasure`), which is the only
  debugging surface that exists when testing on a phone against prod.
- `src/render/` — a `Renderer` interface the engine never sees, a PixiJS v8
  implementation behind it, and `layout.ts` (pure, tested) which fits any region
  shape to a portrait viewport by its full drawn extent, so edge hexes cannot
  clip.
- Cloudflare: assets-only Worker, `dist/version.json` stamped with the build
  commit, and `scripts/verify-deploy.ts` proving the live site serves that exact
  commit. CI runs format/lint/typecheck/test/build and gates the deploy.

**Not done, deliberately:** no game state, no rules, no colours. The palette in
`PixiRenderer.ts` is labelled a placeholder and must not be built on.

**Verified:** 55 tests green; typecheck clean; lint clean; the layering probe
fails as designed; production build emits `version.json`; deployed and verified
live at both https://tiles.marcportal.com and
https://tiles.marc-jeanson.workers.dev; CI green on `main` in 36s.

**What the first deploy taught us.** `verify-deploy` failed on its first real
run, and was right to: `version.json` matched the pushed commit immediately
while a modulepreloaded chunk still 404'd. Assets propagate independently of the
version stamp, so the asset check now retries. This is the case for having a
verifier at all — a green CI run and a working site are different claims, and
only one of them was true for about ten seconds.

**Push-to-deploy proven end to end** on `d0e318c`: CI 31s, deploy 44s, live site
confirmed serving that commit. The workers.dev fallback earned its place on its
first real run — the `marcportal.com` zone's bot protection 403'd the GitHub
runner, the verifier recognised an edge challenge rather than an app failure,
and re-checked the same worker via its WAF-free host. Without that distinction
every deploy would have failed on a green deploy.

---

### Session 1 — The run loop, and someone to play it

**Question:** does the economy close? Gate C names three conditions and none of
them could be checked, because there was no run to check — no way to leave a
map, no way to die, and nobody to press the buttons a hundred thousand times.

**Done**

- The reducer became an actual run: map generation that grows with depth, a
  `LEAVE` action, one named cause of death, and the "one last tile" grace.
- Tuning became **data the run carries** rather than a frozen import. The
  harness's entire job is sweeping these numbers, and a module-level constant
  cannot be swept. It also means a replay records the economy it ran under
  instead of silently re-scoring itself after a balance change.
- `src/sim/` — seven policies, each one strategy in one sentence, a runner that
  reports stalls instead of hanging, and `pnpm sim` with `--set` for sweeps.
- `src/ui/` — a pure `GameState -> BoardView` selector, tap-to-place with exact
  cube-rounded hit-testing, both payouts priced on screen at all times, and an
  end screen that names the cause of death.

**A seventh rule, added under protest.** Leaving a map was free and unlimited,
which made the map multiplier free with it — skip to map 40 touching nothing,
then farm at 40×. You may now leave only once you have harvested here. It prices
depth in the only currency the game has, in one sentence rather than another
number. Recorded in DESIGN.md as an implementation decision, not a design one.

**Gate C — PASSED.** Evidence, 40 seeds per policy at default tuning:

- Nothing runs forever: 0 stalled, 0 capped across all seven policies, pinned as
  a test rather than a table anyone has to re-read.
- `random-legal` dies on map 2 with 41 points, against `farm`'s map 5.
- `rush` reaches map 5 in 40 placements; `farm` reaches map 5 in 327. Opposite
  routes, same depth. Rush arrives nearly scoreless though, so "comparable
  SCORES by different routes" is not yet true — that is a tuning job, not a
  structural one.

**Gate B — mechanism confirmed, not passed.** The gate wants 20 logged pops from
a human. What the harness can say is that the choice is load-bearing:
always-tiles scores 0 at depth 7, always-points dies on map 1, and only the
mixture reaches map 5 with a real score. If the choice were fake, one of the two
pure policies would have won.

**Gate A — playable, unjudged.** It runs on a phone now; whether the minute is
fun is not something a test can answer, and the gate stays open until it is
played in portrait against prod.

**What the harness found on its first execution.** A deadlock. Policies kept
choosing placements they could no longer afford, and the run neither ended nor
advanced. It hid from the stall detector because `SELECT` returned a freshly
spread object even when it changed nothing, so "did that action do anything?"
was unanswerable by identity. Three fixes: `SELECT` returns the same state for a
no-op, the policies ask `canPlaceNow` rather than trusting the board, and the
runner compares run progress rather than object identity. This is the argument
for writing the harness before the content, not after.

**What the harness found on its second: DESIGN.md's fragile claim was right, and
the cause was wrong.** Banking every pop to the end beats harvesting as you go by
43×. The suspected culprit was the quadratic points term — but with the size
bonus flattened to zero entirely, banking still wins 716 to 186. The real cause
is the rule that was supposed to create the tension: popped tiles become stone,
stone never matches, so an early harvest does not trade value for tempo, it
permanently destroys the board's capacity to be worth anything. `ripeTilesMatch:
false` over-corrects violently — a full-map harvest becomes worth exactly zero.
**Rule 5's timing decision is fake and neither existing dial fixes it.** Pinned
as a failing design in `src/sim/sim.test.ts`.

**Verified:** 124 tests green; typecheck, lint and format clean; production
build emits `version.json`. The UI loop is covered end to end headlessly —
fill a map, harvest, leave, and die — against a stub renderer.

**Not done, deliberately:** no art direction (Gate E is shut and Gate A is not
signed off), no unlocks, no specials, no perks. The palette in `PixiRenderer.ts`
and `style.css` is still labelled a placeholder and still must not be built on.

---

### Session 2 — The machine that holds an art direction

**Question:** can the game hold an art direction as data — swappable, testable,
and thrown away without touching a rule — before anyone decides which one?

**Gate E, stated plainly.** The gate says no art direction until A–D pass, and it
is still shut. This session did not choose one. What it built is the SLOT an art
direction goes in, plus the three candidate directions loaded as data behind it,
with **the placeholder still the default** — asserted by a test, not by habit.
The distinction is the whole session: choosing is gated, being ABLE to choose is
the thing that makes the gate cheap to open. Deciding between three directions
requires seeing them on a phone in daylight, and until this existed there was no
way to see any of them at all.

The rule the session did break, knowingly: the placeholder palette is no longer
untouched. See "what the greyscale test found" below — it had a real defect.

**Done**

- **`src/theme/` — a new layer, machine-enforced.** `content <- theme <- render`.
  A theme is plain serialisable data describing how ROLES are painted (ripe,
  legal, stone, one of four colours), never what anything means. ESLint forbids
  `engine/` and `content/` from importing it: a rule that can read the palette is
  a rule you can change by repainting.
- **Four directions.** `placeholder` (the shipped look, promoted from a constant),
  and `cold-survey`, `rot-bloom`, `torchlit` transcribed from the handed-down
  design document. Switch with `?theme=torchlit`, or a picker under the stamp at
  `?ff=ui.themePicker`. Same reasoning as `?ff=` and `?seed=` — the address bar is
  the only console a phone has.
- **Procedural surfaces, and slots for real art.** `render/bake.ts` turns a
  described pattern — hatch, dots, bands, none — into a hex on a canvas. Four
  kinds, because that is exactly what the three directions between them ask for.
  Every surface can also name a bitmap slot: drop a PNG in `public/assets/<theme>/`,
  and a build-time scan writes the manifest the client reads. **Missing is the
  normal case**; the game never waits on a picture and never 404s looking for one.
- **Orientation became a theme decision.** All three directions specify flat-top
  hexes; the placeholder is pointy-top. Axial coordinates and `DIRECTIONS` mean
  the same thing either way, so only the projection moved — into `render/layout.ts`,
  parameterised, with the whole geometry suite now run against both. The engine
  was not touched.
- **The chrome is painted from the same source as the board.** `style.css` decides
  no colour and no typeface; it reads custom properties written from the active
  theme. The duplicated tile palette it used to carry an apology for is gone.
- **One thing that moves.** A harvest flashes the popped hexes, staggered so a big
  harvest reads as a cascade, derived by diffing consecutive board views — the
  engine still has no events and no clock. Off under `prefers-reduced-motion`.
- **`/gallery`** — every direction's surfaces, ink, type and slot states on
  one page, drawn by the same baker the board uses. It ships with the game because
  a design tool that only opens on a laptop is pointed at the wrong screen.

**What the greyscale test found: all four directions failed, including ours.**

Every one of these directions insists the four terrains must be tellable apart in
greyscale — "value spacing does most of the work" — because a hue-only board dies
in sunlight and for colour-blind players. That is a checkable sentence, so it
became `theme.test.ts` rather than a line to admire. On its first run it failed
all four. Two findings, and the first was mine:

1. **The metric was wrong.** Relative luminance is linear in light, so on a board
   this dark it crowds every terrain into the bottom tenth of its range and
   reports two plainly different greys as identical. It failed the shipped
   placeholder, which is legible. Switched to CIE L*, which applies the cube root
   the eye applies — so one threshold means the same thing at both ends.
2. _*Under L*, three real defects survived._* The shipped placeholder's red and
   blue were **0.006 apart** — the same tone, in the palette whose entire stated
   job is "tellable apart". Torchlit's crypt and catacomb were **0.001 apart**,
   straight from the document. Cold Survey's were 0.048, under the bar. All three
   fixed by darkening, which is what both documents prescribe: "if it fails the
   sunlight test, the fix is value spacing, not more hue."

Stone got the same treatment and it mattered more than expected — it has no art
in the reference sheet at all, and it is the most common cell in the back half of
a run.

**Where the document describes a different game.** The directions assume an
endless scrolling map, two-tier fog of war, a six-hex chain cascade, and a
`+6 tiles / ×2 points` pop choice. This game has a bounded island, no fog, a
whole-board harvest, and `take N tiles / take N points`. Nothing was bent to fit:
the fog and title-screen slots are declared and marked `NO MECHANIC`, and the
gallery says so on screen. Recorded in `prompt.md` as the first thing to decide.

**Verified:** 188 tests green (was 124); typecheck, lint and format clean;
production build emits `version.json` and `assets/manifest.json`. The layering
rule caught a cross-layer import in a test file I wrote, which is the rule
working. **Not verified: a single pixel.** happy-dom has no 2D canvas, so no test
in this repository has ever seen the board. Everything visual in this session is
unjudged until it is opened on a phone, in portrait, against prod — which is
where Gate A has been waiting all along.

**Not done, deliberately:** no direction chosen, no default moved, no fog, no
scrolling map, no title screen, no cascade, and no PNG imported from the design
project. Real art was left out on purpose — the reference tiles are drawn flat-top
against a game whose default is pointy-top, and empty slots are a truer starting
state than art that half fits.

---

### Session 3 — The endless world, P1

**Question:** does local cluster harvest on an unbounded plane, with a distance
multiplier, make harvest TIMING a real decision? This is P1 of
`ideas/endless-world.md` — Marc's push, and `prompt.md` Q0 resolved as option
(b) — aimed squarely at the open design problem Session 1 left: on the bounded
map, banking every pop to the end beats harvesting as you go by 43× and neither
existing dial fixes it.

**Answer: yes, with structure the bounded game never had.** The timing dial was
isolated with a family of policies — `bank<N>` grows its best pocket to N tiles
before cashing it as points, feeding on small pockets as tiles meanwhile — so N
is WHEN, holding everything else fixed. Medians over 40 seeds:

- Endless: bank3 336 · bank15 3,873 · bank40 **7,380** · bank80 **0**. An
  interior optimum with a cliff past it: an 80-pocket is never finished before
  the cost curve wins, and the run dies with its fortune unpopped. Cash small
  and you leave a multiple on the table; wait too long and you lose everything.
- Bounded, same policies: bank3 293 · bank15 3,961 · bank40 33,155 · bank80
  **111,132** — monotone, no cliff, and FOUR TIMES the old champion `farm`. The
  bounded timing problem is worse than Session 1 measured: the map-full moment
  hands you the cash-in risk-free, so banking bigger is simply always better.

Both shapes are pinned in `src/sim/sim.test.ts` — the bounded one still as a
failing design, the endless one as the candidate fix.

**Two exploits died structurally, no tuning involved.**

- **Bank-until-forced stops existing.** `farm`'s exact line — place until
  something forces a harvest — scores ZERO on the plane: the only forced stop
  left is bankruptcy, and at bankruptcy survival always wins the payout choice.
  (`farm` and `survivor` produce identical runs there, which is the tell.)
- **The beeline fails.** A pure walk outward can never ripen anything — an arm
  encloses nothing — so the map-40 exploit's continuous cousin cannot exist.
  `rush` was rebuilt as the honest probe (sprint three multiplier steps out,
  then farm there) and lands mid-pack at 1,108.

**How the engine holds it.** One dial in `content/tuning.ts` (`world`, default
`bounded`), carried in state like every other tuning value, so
`pnpm sim --set world=endless` replays the whole policy table under the other
economy. The plane is GROWN, not generated: the seed tile plus its six empty
neighbours are the entire starting board, and each placement materialises the
empty ground around itself — so no tile ever borders an absent cell, "absent is
solid" never fires, and every rule function works on both worlds untouched.
HARVEST gained an optional target (`at`) that only the endless world reads:
there a harvest pops one connected ripe cluster, priced by
`1 + floor(mean distance / distanceStep)` in place of the map number. LEAVE is
a no-op on the plane; old rule 7's job — pricing depth — moved into the
distance multiplier, where every hex of the journey out is a placement at
rising cost.

**Also this session: the draft cards now show the tile.** Marc's first
hands-on feedback (Gate A's first human signal, and it was negative): the hand
was three flat swatch buttons and placing read as "just click there". Each card
now carries the same baked hex surface the board draws — same baker, same
theme — with the flat swatch kept as the no-canvas fallback. Structure, not art
direction; Gate E stays shut.

**Verified:** 201 tests green (was 188); typecheck, lint and format clean; both
40-seed tables reproduced twice; 0 stalled, 0 capped across all eleven policies
on both worlds.

**Not done, deliberately:** no endless UI — the mode is engine and harness
only, unreachable from the phone; no fog, no camera, no terrain, no landmarks
(P2 and P3 in `ideas/endless-world.md`); no tuning of `distanceStep` beyond its
first value; and the bounded game remains the shipped default everywhere. The
caveat written into the ideas file stands: trickling small pockets is still
dominated ~10× by banking to the optimum. The decision now EXISTS; whether its
gradient is fun needs a human and a screen, and that is P3.

---

### Session 4 — The decisions, the ground, and the plane under a thumb

**Question:** P2's, from `ideas/endless-world.md` — does background terrain
make placement richer without breaking the endless economy? Plus the session
`prompt.md` was written for: Marc answered every open decision in it, and the
answers are recorded there under "ANSWERED".

**The decisions, in brief.** P2 then P3, both before the next play session.
Endless-replaces-bounded is decided by playing, not arguing. The persistent
world (one seed per player, fog memory across runs, unlocks as places found)
is confirmed as the intent — P4. No art direction killed; facing decided by
looking, so `?hex=flat|pointy` now overrides any theme and the picker carries
the toggle, sticky like the theme choice. Feature overrides now persist too —
visit `?ff=ui.themePicker` once and it stays. Q3's answer was both at once:
**the pop is a jump** — the tile leaps and falls away over the flash, `popLift`
in every theme's motion, off under reduced motion. Session 2's three flagged
calls all confirmed.

**P2 — answered: terrain enriches and breaks nothing.** `engine/world.ts` is a
pure hash of `(worldSeed, hex)` — no streams, no storage; growth reveals it
cell by cell and bakes the answer into the board. Walls (6% of ground)
surround-but-never-match and cannot be built on; native fields (55% of 4-hex
blocks) count as one extra match for their own colour, promised by the same
`previewWorth` the placement pays. Same 40 seeds as Session 3: bank40 7,380 →
**16,040**, rush 1,108 → 1,284, trickle 767 → 894, reach 12 → 16, and the
timing structure — interior optimum, cliff at 80, dead exploits — holds
untouched. Walls also invented the run's second death, exactly as the
`DeathCause` union said a later system would: **walled**, a frontier that is
all wall with nothing ripe left, named by the engine and spoken by the
epitaph. Pinned in `sim.test.ts`.

**P3a — built, its question waiting on a phone.** `?ff=world.endless` plays
the plane: the board auto-fits the grown world (no pan, no pinch, so no
gesture war with tap-to-place), a tap on a ripe tile is a question — the
harvest buttons re-price to that pocket, the board outlines it in accent —
LEAVE is gone and the third stat reads REACH. Fog, landmarks and hints are
P3b, deliberately: undrawn ground is already half of fog, and P3's real
question (does a hint change where a human plays) needs landmarks to exist.

**Also fixed: the board now watches its own element.** Pixi's `resizeTo` only
hears window resizes, but `#board` is a flex child that changes size with no
window event — the draft cards filling in on first render being the case that
surfaced it (canvas oversized across the controls until devtools opened the
window). A `ResizeObserver` on the host closes the whole class.

**Verified:** 212 tests green (was 201); typecheck, lint and format clean; the
40-seed endless table run with terrain on and off; the endless UI loop covered
headlessly against the stub renderer — ripen, target, pop, REACH label, LEAVE
hidden.

**Not done, deliberately:** P3b (fog tiers, landmarks, hints), P4
(persistence), any pan gesture, any `distanceStep`/terrain tuning sweep beyond
defaults, and no gate signed — Gate A still waits for twenty placements on a
phone, now with prompt.md's script plus `?ff=world.endless` as the second
thing to try.

---

### Session 5 — First contact, and what it moved

**Question:** none of the pinned ones — this session metabolises the first
human play session. Marc played, banked **134 tiles**, and reported that
pressing "Move on" felt like nothing ("okk?"). Two findings and a direction.

**The economy never threatened him — re-targeted.** 40 starting tiles and a
curve at 100 meant the first ~100 placements were effectively free money.
Swept and moved to **30 / 70** (`content/tuning.ts` carries the reasoning):
random-legal now dies on map 1, survivor caps ~325 placements, every bounded
pin holds unchanged — and the endless timing optimum MOVED, from a 40-pocket
to a 15-pocket, with 40 past the cliff on half the seeds. The dial answering
to tuning is the decision staying live; re-pinned in `sim.test.ts` with the
history in the comment. Still unmet and recorded as open: "competent play
reaches map 6–8" (farm reaches 4).

**"Move on" being flat goes to the endless world, not to polish.** Decision:
don't dress a moment the new structure deletes. The energy goes to P3b, whose
spec now exists in `ideas/endless-world.md`: **destinations** (landmarks
glowing through fog, paying tile caches and bonus points — the original
"hints on where to go") and **rarity on tiles-harvests** (big pockets cashed
as tiles roll common/magic/unique — Marc's addition, and the first thing that
makes the survival choice exciting). Each carries its question; neither is
built.

**Native fields became visible.** They were only detectable as a +1 in the
preview numbers. Empty ground native to a colour now shows a faint dot
pattern in that colour, derived entirely from tokens the theme already has —
repaint the direction and the fields repaint with it. Values marked
provisional; Gate E stays shut.

**Verified:** 212 tests green; typecheck, lint, format clean; both worlds
re-swept at the new economy; production build clean.

**Not done, deliberately:** P3b itself (spec only), the depth-target tuning,
and nothing signed on any gate — the manual phone script (prompt.md Part 3,
plus `?ff=world.endless`) is still the next thing only Marc can do.

---

### Session 6 — P3b built: somewhere to go, and something to draw

**Questions, written before building, one per system:**

1. Destinations — does a visible destination actually change where a human
   builds?
2. Rarity — do the odds ever make a human take a TILES harvest they would have
   taken as points?

Neither is answerable by the harness; both wait on a phone. What the harness
CAN answer — are the rewards worth the detour, does the loot break the
economy — it answered below.

**Marc's design answers (2026-08-13, via prompts), recorded:** territories pay
**caches and point sites plus claimable territory** — not rare-tile shrines.
Rarity rolls **on the draft AND harvests raise the odds** (luck as a
resource). All four rare powers appeal (wild / heavy / scout / perk); the
minimal cut ships wild and heavy, scout and perk stay in the ideas file.
Build order: **both systems, minimal cuts, one session.**

**Done**

- **Destinations.** One per ~12-hex block of the plane (`blockDestination`,
  same pure-hash trick as fields, one scale up; the block around home stays
  empty so the first is always a journey). Three rewards, all in `content/`:
  a **cache** pays 12 tiles on touch, a **site** pays 25 × the distance
  multiplier at its hex, a **territory** — Marc's "key territories" — unfurls
  a radius-2 native field of its colour when claimed, now and for all later
  reveals. A landmark is solid like a wall, claimed once by placing a tile
  against it, and paid AFTER the placement cost so a cache can save a run at
  zero. Unrevealed destinations inside `reach + 8` draw as **beacons** —
  glow through ground that does not exist yet — and one faint HUD line names
  the nearest ("A cache of 12 tiles glows 9 out").
- **Rarity.** Every drawn tile rolls common/**magic**/**unique** on the LOOT
  stream (bounded sequences do not move; the stream existed unused since
  Session 0). Magic is WILD — matches every neighbouring tile, both ways.
  Unique is wild and HEAVY — its matches count double, both ways, ground
  included. **Luck** is tiles popped in TILES-harvests, capped at 150; each
  point adds to the draft odds, and the HUD prints the odds so watching them
  climb is the reward. Cards say MAGIC/UNIQUE; rare tiles keep an accent edge
  on the board.
- Both systems are tuning-gated and OFF in the bounded defaults;
  `ENDLESS_TUNING` — what `?ff=world.endless` plays — turns them on.
  `pnpm sim --endless` sweeps the shipped endless economy in one flag.

**What the harness said (40 seeds, and pinned at 6 in `sim.test.ts`):**

- Nothing stalls, nothing caps, across all twelve policies — including the
  new `seeker`.
- **The timing optimum MOVED, and that is the finding:** on the bare 30/70
  plane bank40's median is 0 (past the cliff); with destinations on it is
  **19,356** — caches are lifelines, so the sustainable pocket grew from ~15
  back to ~40. The cliff holds (bank80: 75), banking-until-forced still
  scores ~0, the payout spine still stands. Destinations are part of the
  economy, not decoration on it.
- **`seeker` earned its keep the honest way: by failing first.** A seeker
  that simply walked at the beacon starved — 66 placements, one harvest —
  the beeline lesson again: an arm encloses nothing. Rebuilt as best-packing
  with a drift toward the goal on near-ties, it claims a median 2
  destinations per run and stays in bank15's league (3,827 vs 4,886, higher
  best). Following the compass is viable, not dominant — whether it FEELS
  worth it is exactly question 1.

**Verified:** 234 tests green (was 212); typecheck, lint, format clean;
production build clean; the 40-seed endless table run with the systems on and
off; bounded pins byte-identical (the loot stream only rolls when odds are
nonzero).

**Not done, deliberately:** scout and perk tiles (recorded in
`ideas/endless-world.md`); quests; any tuning sweep of the new numbers beyond
"nothing breaks"; fog memory (P4); and nothing signed on any gate. The two
written questions above are the play session this build exists for:
**`?ff=world.endless`, on the phone, against prod.**

---

### Session 7 — A camera, a manual, and fewer decisions on screen

**Question:** none pinned — this session answers Marc's direct asks
(2026-08-13): a way to zoom, hints and how-to-play "so I can keep up and
reorient", and a UI that takes decisions so the screen presents fewer. All
interaction and layout; Gate E stays shut and every colour still comes from
theme tokens.

**The camera.** Buttons first (`+` / `−` / `FIT` floating on the board),
pinch also works, one-finger drag pans past an 8px slop — placement only ever
happens on a lift that never crossed it, so the gesture war P3a dodged by
having no camera stays dodged with one. Zoom is clamped 1–4× where 1 is the
auto-fit that shows everything; the maths is `zoomLayout` in
`render/layout.ts`, pure and pinned (the hex under the anchor must not move —
that is what makes zooming feel like leaning in). Zoom bakes into the layout
so the worth numbers appear as you lean in (the label threshold already
existed); pan is a container translation and rebuilds nothing at 60Hz.

**Reorientation.** A `?` button opens one screen of plain sentences — the
rules in play order, the destination glyphs, the rarity words, the camera —
closed by any tap; the text is per-world. The hint line now leads with a
one-clause "what now" guide (place / pocket ready / low on tiles) derived in
the selector, so coming back mid-run costs one sentence, not a re-derivation.

**Decisions taken off the screen.** The harvest buttons now EXIST only while
something is ripe — two dead buttons pricing an impossible harvest at 0 were
two fake decisions; their appearing is the signal (the actions row keeps its
height so the board never jumps). The draft marks BEST on the card whose best
placement pays the most, from the same previews the board draws — you still
choose, you just do not audit three cards first. The pocket-tap default
(biggest) already existed. What remains in the player's face is exactly the
game: where to build, and tiles or points.

**Verified:** 244 tests green (was 234) — camera maths pinned in
`layout.test.ts`, gestures (tap / slop / drag / pinch / swallowed lifts),
help panel, guide line, harvest-hiding and BEST marker all covered against
the stub renderer; typecheck, lint, format, production build clean. Not
verified: any of it under a real thumb — same standing caveat as everything
visual in this repository.

**Not done, deliberately:** no double-tap zoom (fights fast placement), no
momentum/inertia on pan, no first-visit auto-open of the help panel (a `?`
in the corner is discoverable; auto-opening it every run is a toll). The
phone session the last two sessions have been waiting for is still the next
thing only Marc can do.

---

### Session 8 — Character: why this tile, why here

**Question:** do colour personalities, biomes and a stash make TAKING and
PLACING a tile feel like decisions? Marc's diagnosis (2026-08-13): "all is
streamlined and not much fun or exploration" — the tiles were mechanically
identical, the ground was uniform, and the best move was usually obvious.
The human half waits on the phone; the harness half is answered below.

**Marc's picks (2026-08-13, via prompts), recorded:** placement should get
colour personalities + pattern bonuses + a deeper economy (not reactive
ground); exploration should get ALL of biomes / hidden finds / hazards /
quests; drafting should get a hold slot + tiles with quirks (not
draft-follows-land, not skip-for-luck). This session built the coherent
minimal slice — personalities, biomes, hold — and the rest is queued in
`ideas/endless-world.md`.

**Done**

- **Colour personalities.** Every colour earns its own reason to be taken,
  all through the ONE worth channel so the preview stays the whole truth
  (numbers in `content/`, zeros = off, on in `ENDLESS_TUNING`):
  GREEN crowds (+1 per green neighbour past the first — mono-clusters
  snowball) · YELLOW company (+1 per different colour adjacent — the glue in
  mixed pockets) · RED ash (stone counts as a match — your spent wake becomes
  red's soil) · BLUE tide (+1 worth per 6 hexes from home — the colour you
  carry outward). Implemented as one shared `tallyWorth` under both `worthOf`
  and `previewWorth`, so promise and payment cannot diverge. Two of the four
  are pattern bonuses in disguise (crowds, company) — the explicit-shapes cut
  stays queued.
- **Biomes.** `biomeAt`, a third scale of the same pure hash (fields are
  patches, destinations are blocks, biomes are regions ~24 hexes across, 65%
  of the plane): inside a biome every native field wears the biome's colour,
  so regions read as one colour's country through the existing dot rendering
  — no new paint. Chasing a colour now means walking to it.
- **The hold slot.** `HOLD` swaps the selected card with a stash that
  survives rerolls (take when empty, trade when full — one action, both
  directions). Drawn as a dashed extra card; `holdSlots: 0` in the bounded
  game. Every draft is now "use it or save it".

**What the harness said (40 seeds, `pnpm sim --endless`):** nothing stalls
across all twelve policies, and **median reach roughly doubled everywhere**
(rush 17 → 31, farm/survivor 18 → 33, bank40 14 → 27) — blue tide and red
ash make the frontier and the wake worth building, so the policies WALK now.
Exploration pays structurally, which was the complaint. Every scoring line
rose (bank40 19,356 → 25,193; bank15 4,886 → 10,478; seeker 6,043 with 3
claims); the interior optimum, the bank80 cliff and the dead exploits all
hold, pinned unchanged. The inflation is accepted for now — the "deeper
economy" re-target Marc asked for is the recorded next tuning job, done
against these systems rather than before them.

**Verified:** 256 tests green (was 244): personality arithmetic, preview/pay
agreement per colour, biome purity and field-colour dominance, hold
take/trade/persist, plus every prior pin. Typecheck, lint, format,
production build clean.

**Not done, deliberately (queued in `ideas/endless-world.md`):** explicit
pattern shapes (lines, rings, four-colour pockets), hidden finds under
unrevealed ground, hazards, quests at landmarks, tile quirks, scout and perk
tiles, and the economy re-target. One session cannot answer nine questions;
these three were the ones that make placement, exploration and drafting each
mean something.

**Addendum 2, 2026-08-14 — Session 9, a one-line decision with a ledger.**
Marc: "make it so going to tiles.marcportal.com does what I want instead of
going to an url." **The endless world is now the shipped default.** Session
4 established that endless-replacing-bounded would be decided by playing,
not arguing; Marc has played both and plays only the plane. `world.endless`
defaults ON — the single recorded exception to the flags-default-off rule,
noted in `CLAUDE.md` and pinned by the updated registry test — and
`?ff=-world.endless` remains the bounded game, one sticky visit away. The
feature-storage key moved v1 → v2 because a stored `false` from any earlier
plain visit would have silently beaten the new default; the old entry is
abandoned rather than migrated. Gates unaffected: A, B and D still want
their evidence, now against the plane by default.

**Addendum 3, 2026-08-14 — the switches moved into the game, and the ledger
with them.** Marc: flag changes should live in the UI, not the address bar,
must not eat the run in progress, and the game should carry its own
what-this-is and decision record, stale-proof like the manual. The `?` panel
gained two derived halves: **THIS BUILD** (world, seed, economy, and the
list of systems in play — computed from the run's own tuning, so it
re-describes itself after any change) and **SETTINGS** (one row per flag,
rendered FROM the feature registry: label, ON/OFF, and the registry note,
which now carries each default's decision — the registry became the
player-visible decision record). `FeatureDef` gained `wired`: unwired flags
(treasure, debug overlay) render as NOT BUILT instead of offering a switch
that lies, and a test pins that an unwired flag can never default on.
Toggles persist immediately; the theme picker applies live; world switches
deliberately wait — a "NEW RUN with these settings" button (drops `?seed`
and `?ff` so storage decides) is the explicit way to make them count.
The current game is never touched by a toggle. 258 tests. Marc: "add more
explanations, all must be detailed in ?". The help panel grew from eight
sentences to eleven titled sections (THE LOOP → HOW IT ENDS) covering every
system in play — cost curve, worth, pocket pricing, both payout formulas in
words, all four colour personalities, ground types, the three destination
glyphs with their payouts, rarity and luck, the stash, the screen layout,
and both deaths. Every number in it is read from the run's OWN tuning object
at render time, so a balance change rewrites the manual by itself and the
text can never describe an economy that is not the one being played. The
bounded game gets the shorter bounded manual. Pinned by test: all eleven
sections present, three live-tuning numbers verified in the text, bounded
manual free of endless sections. 257 tests.

**Addendum 4, 2026-08-14 — the run got a clock, and points got the
spotlight.** Marc: "how long can a game take? I'd like the time to be
constrained yet points become more important." The harness's answer first:
at the shipped numbers the longest possible run (pure survival stalling) was
523 placements — half an hour of not-scoring for 125 points — with the good
scoring lines at 220–413. Swept three candidates at 40 seeds; the pick, as
endless-only overrides in `ENDLESS_TUNING` (bounded keeps 70/4):

- `costRisesEvery` 70 → **50** — the stall ceiling drops to ~337 placements
  (survivor 523 → 337, bank80 516 → 348), a 15–20 minute ceiling at a human
  pace, while the bank-40 optimum (23,066) and the bank-80 cliff (25) both
  survive. The rejected 45 collapsed the optimum to 15 — too tight.
- `distanceStep` 4 → **3** — every scoring line gains ~40% points in the
  SAME placements (bank15 5,034 → 7,112 · bank40 → 26,845 · seeker 3,019 →
  4,320): a minute spent scoring is worth more, a minute spent stalling
  still pays ~0. Sites and distance pay harder, so the constraint pushes
  OUTWARD, not just faster.

All 258 tests pass unchanged — the structural pins are ratios and the
structure held — and the in-game manual re-wrote its own numbers, which is
what it is for. Run lengths now: quick scoring run ~10 min (seeker, 144
placements), deep run ~15 (bank40, 251), ceiling ~20 (337). Human timing
untested; the estimate is ~3.5s a placement.

**Addendum 5, 2026-08-15 — the colours, measured.** Marc asked how the
colours balance through a run, so the harness grew a standing report:
`pnpm exec tsx scripts/colours.ts` plays four policies over 30 seeds and
credits every popped tile's worth to its colour, its power, and its third
of the run. First findings (shipped economy): **green** is the strongest
tile in hand (avg worth 7.28, 31% of it from crowds) and fades through the
run as harvests break its mobs. **Blue** is the volume workhorse — placed
and popped the most, 32% of all worth, rising late with the tide. **Red is
an era colour**: placed 3× less than blue (its power is literally worthless
until stone exists) but the ONLY colour whose per-tile worth rises all run
(6.18 → 7.46) — early red draws are what the stash is for. **Yellow is the
most-placed and least-valuable** per tile (5.70 avg, power-share 18% — the
company bonus caps at 3 and mixing spoils its neighbours' own matches).
No dead colour, real character, two flags worth watching: yellow may be
quietly weak, and early red may feel like a brick to a human who has not
learned to stash it. No numbers changed — measurement only, Marc decides.

**Addendum 6, 2026-08-15 — Marc said try both, so both were measured, then
shipped.** Two new dials, A/B'd with the colour report before touching the
default: `redAshWalls` (ash counts walls too — red has soil before the
first harvest) lifted red's placements 43% and its worth share 13% → 16-18%
while red kept its late-game rise; `yellowCompanyAll` (company counts every
differently-coloured neighbour, cap 6 not 3) lifted yellow from worst per
tile (5.70) to the middle (6.23) with its power share 18% → 29%. Together:
per-tile spread across the four colours HALVED (7.28–5.70 → 7.04–6.23),
every power now earns 25–31% of its colour's worth, and the 40-seed economy
held — optimum (bank40 32,340), cliff, clock, seeker, nothing stalls. Both
ON in `ENDLESS_TUNING`; manual and lens text follow the dials. Two pins
adjusted honestly: the P3b suite runs 12 seeds (the powers raised bank40's
variance — at 6 seeds its median lands on whichever side of the cliff the
coin fell) and seeker's "keeps pace" margin widened to 3× (the yellow buff
fattened bank15's mixed pockets more than the compass line).

**Addendum 7, 2026-08-15 — Session 10: first full-run debrief, two gates
move, and the run gets kept.**

Marc played a full run and answered the debrief prompts. The evidence:

- **Gate A — PASSED.** "Placing feels right" after a full run on the phone
  against prod, with placeholder art. The minute is fun; the gate's exact
  condition, met by its arbiter. Three sessions of texture (powers, biomes,
  destinations) between the gate being set and being passed.
- **Gate B — failing in human hands, cause named.** Marc took TILES almost
  every harvest — over the gate's 70% line. His why, from the prompts:
  points felt worthless early, and he never felt SAFE enough to take them —
  "we should add roguelite elements maybe." The harness always said the
  mixture wins; a human's risk perception says otherwise. Fix directions
  recorded: P4b's territory starting-perks (soften the start), possibly an
  early points taste (quests/sites), and a look at whether the low-tiles
  guide line cries wolf. Not fixed this session; the gate now has a real
  target instead of a hope.
- **Worst moment: a boring stretch mid-run.** The all-survival middle is
  flat — consistent with mostly-tiles play being the flat line. This is the
  next CONTENT session's target (quests at landmarks are the queued
  candidate: mid-run goals with payoffs).

**Built this session — the run is kept, and it ends properly (Gate D's
screen).** `meta/save.ts`: a run autosaves after every action (state was
JSON-ready since Session 0; decoding is the work — structural validation,
corrupt saves refused whole). Reload resumes exactly, mid-run or at the end
screen; a resumed run plays under its SAVED tuning, so rebalances never
re-score a run in progress; an explicit `?seed=` link outranks the save.
The end screen shows the arc: score big, cause of death, reach, placements,
**biggest pop and WHERE it landed as % of the run** (Gate D's own question,
asked of every run), destinations reached, luck, the **personal best per
world** (NEW BEST called out), and one button — NEW RUN — sharing the same
path as the settings button (clears the save, drops `?seed`/`?ff`).
Gate D still needs its judgment (does the biggest number come near the
end, per Marc's runs), but the screen that answers it now exists.

**Planned this session — P4, thoroughly (`ideas/persistent-world.md`).**
Marc's calls: revealed ground + claimed territories persist; caches/sites
re-arm every run; one world per device with Abandon; unlocks phased as
places-become-features + atlas + territory starting-perks (the roguelite
answer to Gate B). Architecture drafted pure: memory is data INTO newRun,
fog memory is view-level, terrain re-derives from the hash so only keys are
stored. Three phases, one question each. P4a is the next big build.

276 tests green (was 267): save round-trip and refusal, resume, autosave
on every change and only on change, the end screen's numbers and best-line.

**Also: walls no longer read as fog.** Marc asked for blocked ground to be
clearly defined against the void in all skins; the numbers agreed — in all
three handed-down directions the wall's dark band sat within 0.007 L* of
the canvas background, so half of every wall hex melted into the
undiscovered dark. Each wall moved up one value step (dark band to the old
fill, fill a step above), keeping the band texture while clearing the
background by ~0.05–0.09. Pinned as `MIN_WALL_CLEARANCE = 0.045` in
`theme.test.ts` over every colour a wall is painted with — the greyscale
test's move, applied to the fog boundary. Value spacing, not art direction;
Gate E stays shut. 267 tests.

---

### Session 11 — M1: the choice, made real (and what it cost)

**Question:** why does a human take tiles nine times out of ten, and what
change makes both buttons live? Gate B has been failing since Marc's first
full run; M1 of `ROADMAP.md` is the milestone that owes an answer.

**The instrumentation came first, and it indicted the economy, not the
player.** A new probe policy — `chooser`, which prices every pocket both ways
and takes the better, with no rule about which — plus a `%tiles` column in
`pnpm sim` and a per-world record book in the game itself. First reading:

| policy                  | %tiles  |
| ----------------------- | ------- |
| chooser (the optimiser) | 94      |
| bank15 / bank40         | 96 / 98 |
| seeker                  | 95      |

Ninety-four per cent for a player trying to maximise. So Marc's habit was not
a habit — it was the correct play, and no quest, perk or content would have
moved it. The reason, written out during the session and now in
`content/tuning.ts`:

> tiles needed = P × C̄ · tiles income = Nt × T · so the tiles SHARE of all
> harvests ≈ C̄ / (pops-per-placement × tiles-per-popped-tile).

An economy whose only ending is bankruptcy converges on income ≈ cost — that
convergence IS the ending — so the last harvests of every run must be taken
as tiles, at any tuning. The fixed point was the ending itself.

**Three structural changes, swept together (endless only; the bounded game
keeps its original numbers and its Gate C evidence):**

1. **A hard clock.** `runLength: 260` — an expedition, not a slow suffocation.
   Tiles you never get to spend are worth nothing, so survival stops being
   infinitely valuable. It is also, exactly, the constraint Marc asked for.
   A new death, `spent`, and the clock never steals a ripe pocket: at zero you
   may still cash what is ripe, you just cannot build.
2. **Survival funded by walking.** Caches went from a lucky find to the
   engine: one destination per ~6-hex block, 40 tiles a cache (was 12 per
   12-hex block). Median claims per run 1 → 6. Emergency tile-harvests fall,
   and exploration pays the rent — which is the game the endless world was
   always describing.
3. **A cap on the size bonus.** `harvestSizeCap: 20`. The clock alone
   RESURRECTED the mega-bank exploit (bank80 scored 150k risk-free, because a
   known ending makes one giant cash-in arithmetic). Past 20 a pocket earns
   worth but no more multiplier, so cashing well and often beats hoarding.
   The old cliff (bank80 → 0) is gone; the optimum at the cap replaces it.

Plus the **knee**: `costGrace: 120` placements at cost 1, then +1 every 25.
Most of a run now has surplus — which is where a choice can exist at all.

**The result, 40 seeds, shipped endless economy:** lines that harvest as they
go now mix — rush 59% tiles, trickle 64%, bank3 48%, farm 41% — against 94-98%
before. Banking lines stay tiles-heavy by construction (they cash points once
by definition). `bank20` is now the top of the bank family (48.6k) over
bank40 (45.4k) and bank80 (47.8k): an interior optimum AT the cap. Nothing
stalls, every run ends on or before the clock, and arcs sit 0.59–0.92.

**Gate D — PASSED.** Its two conditions: the end screen names the cause of
death in one sentence (it has since Session 1, and now names three), and the
run's biggest number comes near the end. Measured: median arc 0.70–0.92 for
every scoring line, and the clock is why — a run that knows when it ends
saves its biggest pocket for the end. Pinned in `sim.test.ts` ("peaks near
the end"). The end screen now prints each run's own arc, so Marc's runs
report the same statistic the gate was judged on.

**Gate B — structurally fixed, human log pending, and deliberately NOT
flipped to PASSED.** The gate's condition names a human's twenty pops, and no
harness can produce those. What this session can claim: the choice is now
available to make (both sides within reach for anyone who harvests as they
go, pinned as a test), and the game COUNTS the player's own split and prints
it on every end screen ("across 7 runs: 31 harvests, 61% tiles / 39% pts").
The next real session settles the gate with evidence rather than memory. If
it still reads >70%, the gate's own fallback — cut it to a single automatic
payout — is on the table.

**Also built for M1:**

- **Quests.** Claiming a site opens a bounty: pop a pocket of 8+ within 6
  hexes of it AS POINTS and that harvest pays ×3. Deliberately a MULTIPLIER
  on the one scoring channel, never a second income (v1 died of two channels
  that could not be priced against each other). It manufactures a legible
  moment where points is obviously right — and taking that pocket as tiles
  leaves the bounty standing, which is the decision. The pts button wears a ★
  when the selected pocket would collect it; the hint line names the bounty
  and its distance. This is also the answer to the boring mid-run stretch:
  every site is a goal with a payoff.
- **The guide line stopped crying wolf.** "Low on tiles" was a flat multiple
  of the cost; it is now measured in RUNWAY — placements the purse still
  buys — and fires at six, the point where you genuinely cannot start
  something and finish it.
- **LEFT** joins the stat row wherever a clock exists, from the first second,
  because a budget sprung at the end is a trick.

**Verified:** 293 tests green (was 276), including the new economy's pins,
quest mechanics (collected only by pressing points; refuses small or distant
pockets), the record book's two gate readings, and the manual re-writing
itself from the new numbers. Typecheck, lint, format, build clean.

**Uncertainty, noted and carried:** the points scale inflated with the new
caches (a good run now scores tens of thousands). Score is score and nothing
breaks, but if Marc wants human-legible numbers, dividing the points formula
by a constant is a one-line change that affects nothing else. Recorded for
the follow-up rather than guessed at.

---

### Session 12 — M2: the world you keep (P4a)

**Question, from `ideas/persistent-world.md`:** does knowing the world change
where a human pushes — is run two more interesting than run one, not less?
The build is done; the question is Marc's, and it is in the follow-up.

**Done, exactly to the plan Marc's decisions set:**

- **`meta/world.ts` — one world per device.** A seed rolled once and kept,
  the union of every hex ever revealed, the territories ever claimed, and the
  world's own tallies (runs, best, farthest). Only KEYS are stored: terrain
  is a pure function of `(worldSeed, hex)`, so remembering that a hex was
  seen is enough to redraw exactly what was there, and nothing goes stale
  when a tuning number moves.
- **Fog memory, drawn.** Ground the world remembers but this run has not
  grown to is drawn at 30% alpha with no outline and no numbers — a map, not
  a place you can act on. It cannot be built on, cannot be tapped into an
  action, and a hex that is both remembered and live is drawn once, live.
- **Territories persist; caches and sites re-arm.** A held territory arrives
  already claimed, pays nothing again, and its field is live from the moment
  the ground near it is revealed — read from the terrain function rather than
  the board, because its ground can be revealed before the landmark is, and a
  field that switched on late would make the same hex mean two things.
- **The engine stayed pure.** Memory reaches the reducer as a plain
  `claimed: HexKey[]` argument to `newRun`, so a run is still reproducible
  from seed + tuning + that list, and `src/engine/` still knows nothing about
  storage. Saves written before the field exists load fine and default it —
  a save format that eats runs when the game grows is not a save format.
- **The atlas line and Abandon World** in SETTINGS: seed, runs, percent known
  (of a disc the size of your farthest reach — honest rather than
  flattering), hexes seen, territories held, best, farthest. Abandoning is
  the only destructive control in the game, so it arms on first tap and acts
  on the second, and it takes the run in progress with it.
- **`?seed=` still bypasses the world**, in both directions: a shared link
  opens the sender's run, and finishing it does not write your neighbour's
  geography into your own atlas.

**Verified:** 300 tests green (was 293) — memory accumulates and never
shrinks, only claimed territories are kept, a held territory comes back
claimed with its field live, the bounded game ignores all of it, decoding
refuses a broken world whole, and the fraction-known cannot exceed 1.

**Uncertainty, noted:** storage grows with the union of revealed ground
(~200KB after ten long runs as a JSON array). The plan's compaction — a
per-block bitmap — is written down and unbuilt, because at the current rate
it is years of play away from mattering. If the atlas ever reports a world
over ~1MB, that is the moment.
