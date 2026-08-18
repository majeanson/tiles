# LOG.md — the gates, and the record

## The gates

Established before any code, so that no work is done twice and no polish lands
on an unproven design. **A gate is not passed until it is written down here as
passed, with its evidence.**

| Gate                         | Rule                                                                               | Passes when                                                                                                                    | State                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **A — The minute is fun**    | No pops, no regions, no meta until placing a tile feels good                       | 20 consecutive placements with placeholder art feel good, on the phone                                                         | **PASSED (2026-08-15)**                                                      |
| **B — The decision is real** | The pop payout must be a genuine choice                                            | Across 20 logged pops, no option is taken more than ~70% of the time. If it is: fix it, or cut it to a single automatic payout | **RETIRED (2026-08-18) — its own fallback shipped; successor question open** |
| **C — The economy closes**   | No content authoring before the headless harness reports                           | No scripted policy runs forever; `random-legal` dies early; two different policies reach comparable depth by different routes  | **passed (session 1)**                                                       |
| **D — The run has an arc**   | A run must peak and then end legibly                                               | The end screen names the cause of death in one sentence, and the run's biggest number came near the end                        | **PASSED (2026-08-15)**                                                      |
| **E — Design freeze**        | No art direction until A–D pass                                                    | A–D signed off here                                                                                                            | **OPENED (2026-08-15) — torchlit**                                           |
| **F — Content last**         | Biomes, specials, perks and unlock tables are cheap to write, expensive to balance | Gate C passed with placeholder content only                                                                                    | **PASSED (2026-08-15)**                                                      |

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

---

### Session 13 — M3: the roguelite spine, and a registry that tells the truth

**Question:** does a world you have conquered make the next run's start safe
enough to change how it is played — and can the registry stop listing things
that do not exist?

**Territory perks (P4b).** Every territory the world holds adds 6 tiles to
the next run's purse, capped at 24. Deliberately small and bounded: it is
aimed at Marc's exact words ("I never felt SAFE enough to take points"), and
safety at the START is the only kind that can change a decision without
changing an ending. Swept at 30 seeds against a fully-perked world: every
scoring line gains 10-18% points, run length does not move (239-260, the
clock holds), nothing stalls, and the tiles share drifts DOWN (chooser 84 →
82, rush 59 → 56) — the intended direction, small.

**`pop.treasure` wired, not deleted.** Declared in Session 0 and empty ever
since. It is now the third payout: a pocket of 10+ can be cashed as a MAGIC
tile straight into the stash, 20+ as UNIQUE. It earns its place by being a
third answer to the same question rather than a bonus — taking it forfeits
both the tiles and the points, and at 20 it means giving up the best points
harvest in the game for a tile you chose. Off by default: run one is still
the smallest game there is, and this is the first thing worth unlocking.

**`debug.overlay` wired too.** Seed, cell count, placements, purse, score,
luck and both rng cursors under the board — everything needed to turn "it
did something odd on my phone" into a reproducible report, on a device with
no console.

**The registry now holds zero unwired flags**, which was M3's other half. The
`wired` field and its test (an unwired flag may never default on) stay, for
the next flag that is declared before it is built.

**Verified:** 305 tests green (was 300): the perk's arithmetic and its cap,
the perk reaching the purse a run starts with, treasure's thresholds, its
refusal below them (a button that quietly pays something else is worse than
one that does nothing), and its forfeit of both currencies.

**Uncertainty, noted:** treasure's colour is taken from the selected draft
card, so the tile you get is "this colour, but rare". An alternative — let
the player pick the colour — is a second tap on a third button, and this
build prefers the terse version. Worth watching in play.

---

### Session 14 — M4: places, the atlas, and the queue emptied

**Question:** can the unlock ledger become geography, and does the rest of
the content queue earn its place — each item kept or killed with a reason?

**Shrines: the unlock ledger, addressed as places.** 8% of destinations are
shrines (◈). Reaching one switches a system on for the WORLD, permanently,
from a fixed five-entry ledger: the treasure payout · a fourth draft card · a
second stash slot · double rare-tile odds · double beacon range. Fixed order
rather than random, so a world's progression is a story you can tell; short
rather than endless, because five is a world's worth of reasons to go and
look. The engine only marks a shrine claimed — WHICH system it grants is the
shell's business, because an unlock outlives the run that found it and
`src/engine/` may not know runs have a past. Unlocks become tuning in
`applyUnlocks` at the edge, so the manual describes them automatically.

**The atlas.** SETTINGS now carries the world: seed, runs, percent known,
hexes seen, territories held, best, farthest — and the unlock ledger with the
locked entries still readable, because a reason to explore has to be legible
before it is earned.

**The queue, emptied — one built, five killed, all in writing** (the full
reasoning is in `ideas/endless-world.md`):

- **Hazards: built, swept, DELETED the same session.** Unstable ground cost
  +3 tiles and paid +2 worth. It reads as a decision and measures as a trap:
  at 12% density the value-following policy died at 27 placements with 517
  points against a 38,753 baseline; at 25% two more lines collapsed. The
  cause is structural — the REWARD is on the preview number, the game's
  central teaching signal and the one Gate A passed on, and the COST is not,
  so every player who has learned to read the board is walked into
  bankruptcy by having learned it. Deleted rather than parked at zero, per
  the roadmap's contract.
- **Hidden finds, tile quirks, perk tiles, scout tiles, pattern shapes:
  killed unbuilt**, each because another system already occupies its slot
  and does the job better — caches at 6-hex density, rarity, territory
  perks, fog memory plus the beacon shrine, and the colour powers'
  geometry respectively. Five paragraphs of reasons rather than five
  half-built systems.

**Gate F — PASSED.** Its condition: "Gate C passed with placeholder content
only." That is a matter of record — Gate C was signed in Session 1 with four
unnamed colours, no biomes, no specials, no perks and no unlock table. What
this session adds is the evidence that the discipline held afterwards: every
content system since (terrain, destinations, rarity, powers, biomes, quests,
perks, treasure, shrines) shipped as numbers in `content/`, swept by the
harness before it shipped, and one of them was deleted this session BECAUSE
the sweep said so. Content stayed cheap to write and priced before sale,
which is the whole point of the gate.

**Verified:** 309 tests green (was 305): shrines remembered once and never
beyond the ledger, walked-past shrines ignored, unlocks handed out in order,
worlds written before shrines existed still load. Typecheck, lint, format,
build clean; the 30-seed sweep with shrines in the mix is unchanged within
noise (bank20 43.6k, chooser 39.2k, seeker 28.3k, rush 6.5k, 6 claims/run).

---

### Session 15 — M5: the gate opens, and the game gets its name

**Gate E — OPENED, and the direction is TORCHLIT.** The gate's condition is
A–D signed. A passed on Marc's own run (S10), C in Session 1, D this week on
the arc evidence (S11). B is the one asterisk: structurally fixed and
measured, waiting only on a human's twenty logged pops, which the game now
counts for him. Opening on three-and-a-half of four is a judgement call, and
it is recorded as one — with the note that the decision costs nothing to
reverse, because every direction is still loaded and `?theme=` still
switches in one tap. A default is a decision, not a cage.

**Why torchlit, on fit rather than taste.** The direction's own note says
"the map is endless because the darkness is" — and the map became endless.
Its light-pool was written to do the fog-of-war job, and fog memory (M2)
needs exactly that: lit where you are, dim where you have been, destinations
glowing through the dark. Its register is Diablo's, and the rarity system
speaks it already — magic and unique are that game's words, borrowed on
purpose in Session 6. The other two directions are good and neither is this
game: cold-survey's forensic daylight fights a plane lit by one torch, and
rot-bloom's creeping wrongness has no mechanic to attach to now that hazards
are deleted.

**Four colours renamed, and this is a real fix.** Torchlit's reference words
were CRYPT / CEMETERY / BURIAL GROUND / CATACOMB — four graveyard synonyms,
atmospheric on a sheet and unusable on a card you read in half a second.
They are now **MOSS · EMBER · ASH · TIDE**: same register, four distinct
silhouettes, and each word says what its colour DOES (moss crowds, embers
keep company, ash is the wake, the tide carries you out). Pinned by a test
that no direction may give two colours confusable names.

**The game is called ASHWAKE.** "tiles" was a directory name that became a
title by inertia. The wake is the trail of spent ground you leave behind;
ash is what it is made of, and the word the red tile's power already used.
Nothing in the rules was renamed to fit the title — the title was named after
the rules, which is the no-invented-vocabulary rule holding. It lives in
`meta/identity.ts` with the tagline and an inline-SVG mark (a hex with a
spark; no request, cannot 404), so renaming the game is one constant — which
matters, because this is the decision most likely to be overruled by the
person whose game it is.

**Also:** the manual now speaks the direction's words for the colours rather
than "GREEN", because the cards, chips and lens all do — a manual that says
GREEN beside a card that says MOSS is a manual for a different game. The page
title, description, social preview and theme-colour all name the game, and
the browser chrome matches torchlit's own background so the page has no seam.

**Verified:** 310 tests green (was 309), including the default-direction pin
flipped with its reason, the new confusable-names test, and the greyscale and
wall-clearance tests still green under the direction that is now the default.

**Uncertainty, noted for the follow-up:** the name and the direction are the
two decisions in this whole roadmap that are purely Marc's taste, and both
were made without him. Both are one line to change (`DEFAULT_THEME_ID`,
`NAME`), and the alternatives are still in the build.

---

### Session 16 — M6: shipped to strangers

**Question:** would someone who is not Marc, on their own phone, with no
explanation, get through a run and want another?

**Installable and offline.** A manifest, two SVG icons (one maskable, so a
launcher that crops to a circle never clips the hex), and a service worker
with the boring, correct strategy: navigations network-first so a player who
is online always gets the build that just deployed, everything else
cache-first because Vite fingerprints it. `/version.json` is never cached —
it is the file that answers "which build is this", and a cached answer is a
wrong answer. The cache name carries the build sha, so deploying evicts the
old cache wholesale.

The stamping is done in `closeBundle`, not `generateBundle`, and that
distinction cost a build: files in `public/` are COPIED rather than passed
through the bundle, so the first version shipped a worker whose cache name
was the literal `__BUILD_SHA__` — a name that never changes, which is a
phone that never sees another build. It now throws if there is nothing to
stamp, because that failure is invisible and permanent.

**A stranger's first minute.** A device with no world, no records and no
saved run opens with the manual already up — once, ever, closed by the same
tap as always. The alternative was a board of glowing hexes and no
explanation, which is a puzzle rather than a game.

**Share your wins.** The end screen offers SHARE THIS RUN: the score, how it
ended, and a link carrying the seed. No backend and no account — a seed IS
the record, which is what the engine's determinism has been for since
Session 0. Web Share where it exists, clipboard where it does not, silence
when the player cancels.

**Polish and honesty.** The camera and help controls now get their
accessible names from the GAME rather than only from the markup (a label
that lives in one file and is required in another goes missing the first
time the markup is rewritten — pinned by test). `verify-deploy` now proves
the manifest, the worker and both icons serve 200, because a missing install
surface breaks nothing visible and would therefore go unnoticed. The README
is written for a human who has never seen the game, and states the privacy
position plainly: no backend, no accounts, no analytics, nothing leaves the
device.

**Verified:** 314 tests green (was 310); typecheck, lint, format, build
clean; `dist/` carries the manifest, both icons and a service worker whose
cache name is this commit.

**NOT verified, and this is the one thing the milestone cannot close: the
stranger test.** `ROADMAP.md` asks for a person who is not Marc, on their own
phone, unaided, finishing a run and starting another. No amount of code
produces that evidence. It is the first item in the human follow-up.

---

### Session 17 — Fields you can actually see

**Marc, on the deployed build:** the dotted ground is hard to see on some
colours. Correct, and measurable: the dots were drawn in each colour's OWN
fill at a flat 0.22 alpha, so their legibility was whatever that colour's
contrast against the empty ground happened to be. In torchlit, effective
lift over the ground: yellow 0.147 (fine), red 0.085, green 0.052, **blue
0.038 — invisible.** The four terrains are spaced apart in L* on purpose,
and that spacing is exactly what made the dark ones disappear.

This matters more than decoration. A native field is a RULE — a tile of the
right colour there is worth one more, and a claimed territory unfurls one —
so a field you cannot see is a rule you cannot use.

**Fixed by `fieldDots(theme, colour)` in `theme/tokens.ts`**, which does two
jobs that pull against each other: keep the hue (a field must say WHICH
colour owns the ground) while equalising visibility (all four must read the
same). So it brightens toward white — hue kept, contrast bought — until the
colour clears the ground by a workable margin, then picks the alpha that
makes the FINAL lift identical for every colour. Dots are also a little
larger and tighter (1.4px on a 6px pitch, was 1.1 on 7): at phone scale the
old texture was something you had to hunt for.

Every colour in every direction now lifts exactly 0.120 over its own ground
— blue 3× more visible than before, yellow quieter than before, and the four
inks still distinct so a field still names its colour. Pinned by two tests
per direction, in the same idiom as the greyscale and wall-clearance rules:
a floor on the effective lift, and a check that brightening never converges
the four on one pale grey.

**Verified:** 322 tests green (was 314); lint, types, build clean.

---

### Session 18 — Four things a play session found

All four came from Marc playing the deployed build, and three of them were
bugs no test could have caught because no test has a thumb.

**1. The manual was a curtain with a hole in it.** The help panel is inset
inside `#board`, so its 8px frame was live board the whole time: closing the
manual could place a tile you never meant, and taps near the edge went
straight through. Gestures now refuse EVERYTHING while the panel is open —
tap, drag, pinch, wheel. Pinned by test.

**2. The field dots, again.** Session 17 equalised their brightness by mixing
toward white, which raises lightness by REMOVING colour — so the four
brightened terrains converged on four pale greys and blue and green read as
each other. Fixed properly: `vivid()` scales every channel until the
brightest one is maxed, which raises lightness while keeping the hue exactly,
and the lift floor went 0.12 → 0.20. Blue is now a vivid blue rather than a
pale one. The distinctness test got teeth: every pair of field inks must be
at least 60 apart in summed RGB, not merely unequal.

**3. Claiming something said nothing, and a shrine said least of all.** A
shrine's whole payoff lands on the NEXT run, so waking one looked like
nothing happening. Every claim now announces itself in a **popup over the
board**, glyph first — `★  SITE CLAIMED` and what the bounty now wants,
`◈  SHRINE WOKEN` and the name of the system it just switched on. Marc's
words: it was unclear that the star was the thing giving the power, so the
glyph leads and the words follow it. Five seconds, or a tap.

**4. Contextual help, from a gesture that did nothing.** Tapping a hex you
cannot build on was a silent no-op — the engine returned the same state and
the screen said nothing, which is the worst possible answer to a deliberate
action. That tap now EXPLAINS the hex: each destination glyph and what
reaching it pays (including ones still glowing in the dark), walls, spent
ground, native fields, an unripe tile and its worth, and ground the world
only remembers. In the direction's words and this run's numbers, like
everything else. It stays until you dismiss it, because you asked for it.

**Verified:** 326 tests green (was 322). Typecheck, lint, format, build
clean.

---

### Session 19 — The tiles-only run, behind a flag

**Marc's pivot, in his words:** "build around the tiles only, have a maximum
of tiles (or if you're lucky your run goes farther), and points could be used
roguelite style to unlock better things… start with 30 tiles, get tiles along
the way if you're good/lucky to continue, die when you don't have any (dry)."

**Why this is not a retreat.** Gate B failed twice in a row for OPPOSITE
reasons: first tiles dominated 94-98% because an economy that ends in
bankruptcy makes every marginal harvest a survival harvest; then M1's clock
fixed that and Marc promptly found the mirror image — 202 tiles with 167
placements left, the tiles button dead for the entire back half of a run.
Two failures, opposite directions, same fork. The gate's own written fallback
is "fix it, or cut it to a single automatic payout", and this is that,
arrived at by evidence rather than by giving up.

**Built behind `run.tilesonly`** (off; play it against the shipped game):

- **One payout.** A pop always pays TILES and scores automatically, at
  `pointsPerPop` (0.35) of the old points formula. `tiles` and `points` are
  now the same instruction, so every saved run, replay and policy written
  before the pivot still means what it meant.
- **No clock.** `runLength: 0` — you die dry, so a good or lucky run
  genuinely goes farther, which was the whole point. The cost curve is what
  guarantees an ending: income is capped by geometry at about one pop per
  placement while cost climbs forever. `costGrace: 0` too — with no clock the
  curve IS the clock and it has to start working immediately.
- **BURN.** A ripe pocket can be sacrificed for `burnLuck` (3) luck per tile
  instead of taken: no tiles, no score, better draws. Marc's "sacrifice the
  run to get better tiles", and it costs the only thing keeping you alive.
- **Points as the final state.** Sites and bounties still pay them mid-run,
  pops trickle them, and the ending adds `endReachBonus` per hex reached and
  `endClaimBonus` per destination — an expedition is worth something for
  having gone far, not only for what it cashed.
- `cachePays` 40 → 26, because without a clock a cache that hands over more
  than a placement costs is a purse that outgrows the run — the 202-tile
  state again.

**Swept before shipping.** `pnpm sim --tilesonly`. `costRisesEvery` at 22
gave ~140-placement runs (8 minutes), 38 gave ~270 (16); **30 lands a good
run near 200 placements — about twelve minutes** — with careless play dead at
111 and random play at 32. Nothing stalls, nothing caps, and `farm` and
`survivor` now produce IDENTICAL runs, which is the tell that the fork is
really gone rather than merely hidden.

**Verified:** 339 tests green (was 331), including that the shipped endless
game still forks exactly as before — the prototype is additive, not a
replacement, until playing says otherwise.

**Open, and deliberately not built yet:** the shrine that sells odds for
tiles (Marc asked for both sacrifices; the burn is the one that needed no new
UI), and the roguelite spending screen — points buying the five shrine
unlocks, better base odds and richer worlds. Those wait for a play session
that says the core loop is right.

**Addendum, same day — "why would you wait to pop vs popping insta?"**

Marc asked the question the whole design turns on, and the harness answered
it against the tiles-only build: **waiting paid 5-7× and nothing punished
it.** Popping at 3 scored 2,843; at 20, 16,341; at 40, 18,953 — and bank40
and bank80 scored IDENTICALLY, which means the greedy threshold never even
bound. Waiting was free, and free is fake.

Two candidate taxes were measured before choosing. `ripeTilesMatch: false` —
ripe tiles stop feeding their neighbours — was catastrophic exactly as it was
in the bounded game years of sessions ago: every line collapsed to ~830
points, runs halved, pops-per-placement fell 0.75 → 0.38. Rejected with
numbers rather than with taste.

**Marc's answer was better than either of mine:** make the ODDS the lever.
"Maybe odds for better colours depending? or magic/unique" plus "early pops
pay luck". So popping early now buys two things a monster cannot:

- **Luck is mostly FLAT per pop** (`luckPerPop` 9, plus 0.5 a tile), so three
  4-pockets pay 33 luck where one 12-pocket pays 15. Small-and-often is the
  loot line; big-and-late is the score line.
- **A pop steers the draft.** The colour you just cashed runs hot for the
  next six draws (`colourBiasDraws`), so popping a green pocket is how you
  get the green to build the next one. Cashing is now a REQUEST, which is a
  reason to pop that has nothing to do with survival.

**Measured after:** bank3 2,843 → 3,655 (+29%), and the shape acquired an
interior optimum — bank20 15,600 now edges bank40 15,258, where before more
patience was always better. Nothing stalls; 343 tests green.

**Still true and worth saying plainly:** on SCORE alone, big pockets still
win by ~4×. Small-and-often buys tempo, luck and the colours you need, not
points. Whether those are worth the trade is a phone question, and the luck
numbers are one constant each if they should be louder.

**Addendum, same day — Marc played the steering build, and luck was a bar**

Two reports, one bug behind both. He never burnt a pocket once ("popping
often gave more luck than burning anyway"), and he never played for points
("I thought if I go on more I would have more points anyway").

He was right twice. **Burn was strictly dominated the moment luck went
flat-per-pop**: a 6-pocket burned pays 18 luck, popped it pays 12 luck AND
the 6 tiles AND the score — six tiles spent to buy six luck. I broke it the
same hour I shipped it, by repricing luck without repricing the thing that
sold luck. Switched off (`burnLuck: 0`), kept in the engine.

Worse, and only visible in the numbers: **`luckCap` is 150 and a pop paid 9,
so luck maxed out about fifteen pops into a hundred-and-forty-pop run.** For
nine tenths of every run, popping early bought exactly nothing. The mechanic
built to answer "why pop early" died before the run got going.

So luck stopped being a bar and became a **purse** (Marc's call, from four
options). It no longer raises the odds passively at all — `luckMagicPerPop`
and `luckUniquePerPop` are zero here, and permanent odds are bought with
points between runs instead. One number, one job. It buys three things:

- REDRAW (12) — a fresh hand.
- A colour's name (30) — a new hand drawn under that colour, and the next six
  draws leaning with it. Not a bet on later: you see what you bought.
- FORGE (75) — the selected card becomes UNIQUE. The only way to have a rare
  exactly when you need one.

And **points left the HUD** (`hidePoints`), because Marc was correct that they
were furniture: score is what a run is worth when it ends, not a number to
play against. The slot goes to LUCK, which is what the game is now played
against. The end screen still shows the score.

**Measured, 200 runs.** A new `spender` policy plays bank20 and spends its
luck; it scores 15,000 against bank20's 14,217 — **the shop pays about 5.5%**
at the same patience. That is the whole evidence that it is worth its prices.

**A correction to what I told Marc last addendum.** I reported an interior
optimum — bank20 beating bank40 — from a 30-run sample. At 200 runs it is
gone: bank20 14,217, bank40 15,427, bank80 15,766, and bank40/bank80 still
share a best run, so the threshold still never binds. **Patience is still
monotonically better on score.** It was noise and I called it a result.

Open, and now downstream of the meta economy rather than this build: score
still rewards waiting, so the timing decision is a survival decision and a
shopping decision but not a scoring one.

**Addendum, same day — the roguelite layer, and a currency that is not points**

Marc answered four questions and the meta economy fell out of them.

The important one was the currency. Asked how points should be spent, he
refused the question: _"a new currency so you need to decide vs a good point
game vs advancing roguelite."_ So **RELICS** exist, and they are deliberately
not points. Points are the score a run is worth; relics buy the next run;
both come out of the same pockets. That is a decision on every ripe pocket
rather than a menu at the end.

It also answered the burn question he had left open ("3 or 4, not too sure").
Burning pays relics now: no tiles, no score, no luck — you give up the run to
buy the ones after it. Option 4 turned out to need the shop to exist before it
meant anything, which is why it could not be settled when he was asked.

Three sources, all his: **burn** (2 a tile), **reaching somewhere new** (3,
and the only one that costs no sacrifice), and **10% of unspent luck at
death**, so hoarding the purse is a real alternative to spending it.

The shop is on the end screen, and what it sells carries into every world —
both his calls. Three deliberately BORING upgrades (deeper purse, keener eye,
richer worlds), because they are the floor that makes run 20 unlike run 1 and
they are boring so the perks can be strange.

**The perks.** Asked to pick from a brainstorm of sixteen, he parked all four
big rule-breakers — _"skip uniques for now im not convinced"_ — and took two
of the cheap six, with an amendment of his own:

- **ROOTBOUND** — native ground pays double, ground that is not yours pays
  NOTHING. Where you may build well is decided by terrain before you draw.
- **SECOND WIND** — _"4. with half chance to still die"_. He turned a
  guaranteed floor into a coin flip, and the amendment is what makes it
  interesting: a floor tells you how much risk is correct, a coin flip only
  tells you whether you dared.

One perk worn at a time until the second slot is bought (400 relics), which
is what makes owning both a decision rather than an accumulation.

`ideas/uniques.md` holds all sixteen, tiered, including the four parked ones
and the four I argued against. Reference, not spec.

372 tests. The prices are guesses and are meant to be: the shop cannot be
balanced before anyone has spent anything in it.

**Addendum, same day — the manual, rebuilt as tabs**

Marc, while going off to play: _"rework the help with sections, tabs, etc.
and rework to be concise and precise. if extra calculations are wanted,
toggle to expand."_

The manual had grown to fourteen sections of paragraphs — everything true and
nothing findable, because every system that shipped added its paragraph to the
bottom of the same scroll. Two rules replace it:

- **Five tabs**, ordered as a run meets them: PLAY (the loop, placing,
  ripening, popping), BOARD (colours, ground, where to go, reading the
  screen), HAND (rare tiles, the luck purse, the stash), AFTER (relics, the
  shop, how it ends, your world), BUILD (this run's own numbers).
- **Every formula behind a NUMBERS fold.** A section says what a thing IS in
  a line or two; the prices, thresholds and multipliers are one tap away.
  Short by default, complete on demand.

The tabs and folds swallow their own taps, because the panel closes on any
tap and a control that let its tap through reads as a broken button — the
same treatment the settings rows already had. Sections are gated on the
systems that actually exist in the run, so the bounded game has four tabs and
no stash section rather than a manual describing features it does not have.

Still derived from live tuning, which was the point of writing it that way:
the numbers in the folds are the same object the reducer pays with.

**Addendum, same day — the zoom ceiling fell as the world grew**

Marc, on a phone: _"there is a point on mobile where the map grows and i cant
zoom in to see numbers anymore, there is a max zoom in and its not enough."_

Real, and the maths says exactly why. `ZOOM_MAX` was **4 — a multiple of
FIT** — and fit shrinks as the world grows. Early in a run the board fits at
about 40px a hex and 4× is enormous. By reach 16, with the beacon horizon
stretching the fitted extent another 8 hexes past the built ground, roughly 49
hexes span a 390px screen: fit is ~4.6px a hex, and 4× of that is 18px. Worth
numbers are drawn from size 12 up, so they were being rendered and could not
be read. **The more board there was, the less the camera could lean in**,
which is precisely backwards.

Fixed by stating the ceiling in PIXELS rather than as a multiple of a moving
target: `zoomCeiling(fitSize, floor, maxHexPx)` returns whatever zoom gets a
hex to 34px of radius — about a thumb across, the size the layout was designed
around — and never less than the old 4×, so a small board keeps the range it
had. The ceiling now RISES to meet the board.

Two follow-ons the fix needed. ZOOM IN is disabled at the ceiling, which means
the UI has to ASK for the ceiling rather than assume a constant. And `render()`
resyncs the camera buttons, because a placement can move the ceiling and the
old code only resynced when a camera button was pressed — so the button would
sit dead a placement longer than it should.

The maths lives in `layout.ts` rather than the renderer so it is testable
without a canvas; five tests pin it, including the phone's own numbers.

**Addendum, 2026-08-16 — three bugs off Marc's screenshots, and a symbol per colour**

Two photographs of a real run, and three things wrong in them.

**A blank button.** Between POP and TREASURE sat an empty box. The
single-payout branch hid the points button and a line two statements later
un-hid it (`harvestPoints.hidden = !hud.canHarvest`) the moment a pocket was
ripe. The fix is one condition; the lesson is that a branch which hides
something must own the unconditional line that shows it again.

**The end screen was drawn over the board.** The hand and the luck row stayed
live under a finished run, and now that the end screen carries the shop the
page grew past the viewport — and `#board`, being positioned, paints above
its static siblings. Dead controls now come off the screen when the run ends,
`#end` scrolls in its own box and takes the room they gave back, and `#board`
clips whatever the canvas happens to be sized at mid-relayout.

**Text describing a game nobody is playing.** The guide line still said "tap
it, then take tiles or pts", and the end screen still reported "19 tiles /
1 pts taken" and "89% tiles / 11% pts" — Gate B's own measurement of a fork
that `singlePayout` removed. All three now speak the single payout, and the
end screen counts pockets popped and relics carried out instead.

**And Marc's own improvement:** _"instead of dots we could have a symbol per
color and this symbol could repeat so its coilor + symbol, good for all
humans."_ Native ground was hue alone, and roughly one man in twelve cannot
read the green/red half of that. There is now one shape per colour —
▲ moss, ◆ ember, ■ ash, ● tide — repeating across the ground it belongs to,
and printed on the colour chips and the draft cards as well.

Fixed rather than themed, because a symbol language that changes with the art
direction is a language nobody learns; a test names all four explicitly so a
later direction cannot quietly reassign them. Shapes over letters because a
silhouette survives three pixels where a glyph does not, and the texture is
laid on an offset grid so a field reads as texture rather than graph paper.

The colours already had distinct patterns on the tiles themselves — this
closes the last place where hue was carrying meaning alone.

**Addendum, 2026-08-16 — the bounded world is deleted**

The second half of officialising the decisions, and much the larger half.
`world: 'bounded' | 'endless'` is gone from `Tuning`, and with it:

- `src/engine/map.ts` and the four tuning fields only it read
  (`mapBaseRadius`, `mapGrowsEvery`, `mapMaxRadius`, `wallDensity`).
- The `LEAVE` action, `canLeave`, the LEAVE button, and the rule that you may
  only leave a map you have harvested.
- `GameState.mapNumber`, `HarvestRecord.mapNumber` and
  `log.placementsAtMapStart`. Depth is REACH and only REACH.
- Every `world === 'endless'` fork: sixteen of them across the engine, the
  view, the UI, the policies and the harness.

Three constants became one. `TUNING` is now the game — the tiles-only economy
— built in two named layers that are still worth reading separately, and
`BARE_TUNING` is exported as the zeroed skeleton every rule test isolates
against. That last one earned its place immediately: a dozen tests had been
using the old bare `TUNING` as their baseline without saying so, and turning
the default into a real economy made all of them fail at once.

**Two real bugs fell out of the deletion**, which is the argument for doing it:

- `harvestValue` branched on the world, so with the field gone it silently
  took the bounded path and popped the WHOLE BOARD instead of one pocket. A
  test that put two pockets on a board caught it. A `t.world` that returns
  `undefined` compares false to `'endless'` — the type system caught the
  field, not the meaning.
- The bounty was gated on `choice === 'points'`, a button the single payout
  had already removed. Bounties were **uncollectable** in the shipped game and
  no test had noticed, because the test asserting they were NOT collected by
  the tiles button was passing for the wrong reason. Now a bounty is collected
  by the pop that scores it, and forfeited by a sacrifice, which scores
  nothing.

`sim.test.ts` was three suites guarding three economies; it is one suite
guarding one. Everything asking about the tiles-or-points fork, the clock or
the map number was deleted rather than adapted — a green test for a deleted
rule is worse than no test. What survives: every policy's run ends by itself,
random play dies early, opposite strategies reach comparable depth, packing
pays, patience still pays (the known open shape, recorded so a change that
flattens it is visible), and the luck shop beats hoarding.

367 tests, down from 379 — twelve fewer because twelve rules stopped existing.

**Addendum, 2026-08-16 — the torch, and the shape of the land**

Marc: _"whats our next steps for visuals? real terrains? 3d like topography?"_
He picked two of four and set the constraint on both.

**The torch, first — because the direction that won Gate E had never been
built.** Torchlit's own note promises "a warm pool over the middle of the map,
deep falloff, everything past it dark and blurred", and says in as many words
that it was "recorded in `prompt.md`, not faked here". What was on screen was
a static vignette and remembered ground at 30% alpha: a chart with a dark
border, not a light being carried through a room.

So the light is real now. `GameState.lastPlaced` is the torch — state rather
than a UI guess, because a run reloaded from storage has to light up where it
went dark — and `brightness(light, dist)` falls from full to a floor over the
direction's own `fade`. Squared rather than linear: linear falloff reads as a
flat grey disc, and the eye wants light to hold near the source and give way
at the edge.

**Marc's rule, and it is a rule: DIM, NEVER HIDDEN.** The floor is a floor —
`brightness` has no way to reach zero, and a test asserts that no hex on any
board is ever dimmed to nothing. Atmosphere may not cost a player information,
and a phone in daylight has to stay playable. Every direction states its own
light: torchlit is the deepest (floor 0.42), cold-survey's forensic daylight
barely falls off at all (0.78), and the placeholder is flat, because it
measures layout rather than mood.

Painted as TINT, not alpha. Dropping alpha would show the page through the
board and turn distance into holes; tinting toward the board's own dark reads
as light falling away.

**Then topography, and the honest version of it.** Elevation is a pure hash
like every other terrain layer — two octaves, banded into five contours — so
it costs nothing to store and every run on a world agrees where the hills are.
It rides the same light channel: a hex a band higher catches a little more of
the torch, with a faint rim on its upper edges. `BAND_LIFT` is 0.06, small on
purpose, because a board whose hills are louder than its tiles is a board you
cannot read.

**Cosmetic, by Marc's decision.** Nothing in the rules has ever heard of
height, and the economy took four sessions to settle — a look does not get to
move it.

**What was argued against and not built:** a tilted 2.5D board. It fights
three things this game is already committed to — portrait phones, thumb-sized
targets, and worth numbers that stay readable at every zoom, which we fixed a
bug about yesterday. Tiles with real thickness occlude each other, and a board
you cannot read at a glance is a board you cannot plan on. Lighting and bevels
buy most of the depth for a fraction of the cost and none of the occlusion.

Painted terrain art per biome is still unbuilt and still the obvious next
thing, now that there is light to paint it under. 382 tests.

**Addendum, 2026-08-16 — the black screen, and the class of bug behind it**

Marc opened the game to nothing: no board, no stats, three empty card
outlines. Not darkness — a crash on the first frame.

`lastPlaced` shipped an hour earlier with no fill in `decodeRun`. A run saved
before that field existed decodes with `lastPlaced: undefined`, and
`undefined === null` is FALSE — so the guard written to catch "no torch yet"
waved it through into `parse(undefined)`, which threw, and the render died
with it. Every device with a saved run was affected. Mine, entirely.

**The class matters more than the instance.** `decodeRun` was tolerant of
exactly one late-arriving field (`claimed`, with a comment explaining why
tolerance is the whole difference between a save format that evolves and one
that eats a run every time the game grows) and then five more fields were
added without joining it. Two of them — `bias` and `lastPlaced` — crash on
property access when absent; the rest merely lie.

So the block now fills all of them: `lastPlaced`, `bias`, `quest`, `held`,
`luck`, `relics`, `usedSecondWind`. `relics` and `held` also stopped being
hard REJECTS — a run written before relics existed was being thrown away
outright, which is the same bug wearing a politer face.

The view is defensive too, checking `typeof lastPlaced === 'string'` rather
than trusting a decoder. Both, because this one cost a black screen.

Tests strip each late field one at a time and then all together, and require
the run to come back, draw, and keep playing. The render half lives in
`view.test.ts` because the layering forbids `meta/` importing `ui/` — the
lint caught me putting it in the wrong file, which is the rule doing its job.

**The standing rule from here:** anything added to `GameState` joins that fill
block in the same commit.

**Addendum, same day — the ghost was hiding the reason for its own number**

Marc: _"when were hovering a red, we cant see the red terrain underneath."_

The preview ghost REPLACED the ground surface rather than sitting on it. So
the moment a cell became worth placing on, its native field — the colour and,
since this morning, the symbol saying whose ground it is — disappeared. The
ghost was covering the exact fact that explains its own number: place a red
tile on red ground and it gains a match, which is _why_ the preview says what
it says, and the highlight was hiding it.

Now the ghost is a second sprite drawn over the ground at its own 30% alpha,
so the field reads through it. Deliberately not tinted by the torch: it marks
where you may act, and a legal cell is by definition beside what you just
built, so it is never far enough out for full strength to look wrong.

Whether it READS is a phone question. What the tests pin is the contract
underneath — a previewed cell still reports its native colour, so there is
something for the renderer to draw through.

**Addendum, same day — run one was already the best run**

Marc, mid-run at 166 tiles on placement 61: _"feels like early on we can
advance alot with only 30 tiles with all the caches and stuff, maybe we can
tone it down and balance a bit so after a few runs with bought relics item its
back to what it is now."_

He was right, and the harness said something worse than he did. **Run one was
already sitting where a MAXED run should be.** Every upgrade in the shop,
bought to the last level for 2,415 relics, moved bank20 from reach 16 / 186
placements / 14,153 points to reach 18 / 239 / 28,807 — two hexes of reach for
the entire ladder. A roguelite whose first run is nearly its best run has a
shop for decoration.

So the floor came down: **22 starting tiles** (was 30), **caches pay 14** (was
26), **destinations 0.45 of blocks** (was 0.70). Measured at 40 seeds a rung:

```
run 1                       reach 14 · 166 placements ·  7,795 pts
+2 purse            (60)    reach 15 · 174 · 10,801
+4 purse, eye, world (285)  reach 15 · 188 · 12,248   ← about today's run one
+6 purse, 3 eye, 2 world    reach 16 · 211 · 17,422
maxed             (2,415)   reach 16 · 237 · 23,265
```

The shop climbs back through today's numbers at the middle rung — a few
hundred relics, which is a few runs — and goes past it after. Exactly the
shape he asked for.

**And the restoration is literal.** RICHER WORLDS now buys cache VALUE as well
as density, +3 a level, so four levels return caches to the 26 tiles they paid
this morning. Maxed DEEPER PURSE passes the old 30-tile start, and maxed
RICHER WORLDS passes the old 0.70 density. Four tests pin all three, because
"we can put it back" is a promise that rots silently.

**What was deliberately not done.** Steepening the cost curve as well (24
rather than 30) tested beautifully as a nerf and terribly as a design: it put
the MAXED ceiling _below_ today's floor. That is not toning down, it is a
different and smaller game.

The full sweep under the new numbers is clean — no stalls, no caps, random
play dead at 26 placements against 167 for competent lines, and `spender`
still ahead of `bank20`, so the luck shop still pays for itself.

**One test was passing by missing.** The save-mangle test looked for the
literal string `"tiles":30` to corrupt; the new starting purse is 22, so the
mangle stopped finding its target and the assertion "this mangle broke the
save" silently tested nothing. It derives the number from the run now.

**Addendum, same day — hierarchy, not smaller things**

Marc: _"adjust the visuals so its less crammed up, more ui ux user friendly."_

The crowding had a shape worth naming: **five rows of equal-weight controls**
under the board, none of them saying which mattered. Four payout buttons
wrapping their own labels onto three lines each ("SACRIFICE for 30 relics"),
then six shop buttons wrapping onto a second row, then chips, then a hint that
ran to three lines with the debug overlay on. Everything was the same size, so
nothing was the answer.

The fix is not shrinking things:

- **POP owns its row.** It is the decision; the others are variations on it.
  TREASURE and SACRIFICE moved to a quieter second row, smaller and dimmer,
  and that row hides itself entirely when neither applies.
- **Labels stopped repeating their verbs.** `SACRIFICE  30 relics`,
  `TAKE  1 MAGIC`, `POP  79 tiles · 6300 pts`. The numbers are the message.
- **The purse folds.** Closed it is one line: what you carry, and either
  `· SPEND` or `· next 12`. Open it is the shop, on a three-column grid rather
  than a wrapping row.
- **The hint line is capped at two lines** and scrolls inside them, rather
  than pushing the hand down the screen when the debug overlay is on.

**The fold is not only tidiness.** Marc finished a run with 166 luck unspent
while every price sat on screen the whole time — an always-open shop was not
advertising itself either. Closed, the toggle wears the accent colour the
moment anything is affordable, so it speaks up exactly when it can be used and
stays quiet when it cannot.

One thing tried and reverted inside the same pass: making the colour chips
bigger for "breathing room". They were already the most compact thing on the
screen, and the change made the crowding worse. Room comes from the rows that
were fighting, not from the row that was behaving.

### Session 20 — The ladder gets a bottom rung, and the world gets gradual

Marc, playing: _"i always wait to pop no matter what it feels. also the game
advances too quickly, is too easy. i want it to become easier gradually with
relics, not at the start."_ And mid-session: _"also check for gradual formulas
instead of constants for our distance, pop / tiles, shrine density, etc."_

**The question, written before building:** which difficulty ramp makes run one
feel earned without shrinking the maxed game — a steeper cost curve the shop
buys back, poorer pops, a lower floor, or income graded by distance?

**On the pop timing, a design decision first.** Asked the fork, Marc flipped
it: _"maybe we always want the user to wait then. more points if you wait vs
if you pop, but if you pop you can get small advantages or smthing."_ So
waiting is not the bug — it is the intended score line, and popping early is
supposed to buy tactical advantages (luck, steering). No stick was added. The
open question is whether those advantages FEEL worth taking once the economy
is tight, and that waits on the phone, deliberately after this rebalance
rather than before it.

**The sweep (40 seeds a rung, bank20/spender, shop rungs modeled as
`applyProgress` would produce them):**

| candidate                    | run 1                 | maxed                  |
| ---------------------------- | --------------------- | ---------------------- |
| baseline (2026-08-16 floor)  | 166 pl · r14 · 7,795  | 237 · r16 · 23,265     |
| A — buyable cost curve 22→30 | 117 · r12 · 3,450     | 237 · r16 · 23,265     |
| B — poorer pops 3→2          | 108 · r10 · 3,007     | 237 · r16 · 23,265     |
| C — floor further down       | 169 · r14 · 7,398     | 230 · r16 · 20,478     |
| D — gradual formulas         | 184 · r15 · 7,496     | 248 · r18 · 23,201     |
| **A+D, ramp 2 (shipped)**    | **123 · r12 · 3,338** | **248 · r18 · 23,201** |

Two findings inside the table. **C is exhausted**: pushing the same floor
dials further (caches 10, destinations 0.35) barely moved run one — that
lever has nothing left. **D alone makes the game EASIER** — depth-graded
income out-pays the sparse near-world — but it is the only candidate that
grows REACH, which is the point of the game. So the shipped answer is the
combination: A's steep curve makes run one lean, D's grading points the lean
run outward. Marc delegated the pick to the harness ("sweep all three,
harness picks"), and the harness picked the widest ladder: placements double
run1→maxed, reach goes 12→18 where the flat world managed 14→16, points 7×.
Ramp 4 was rejected for ramp 2 because it zeroed run one's median claims — a
first run that never meets a cache is barren, not hard.

**Shipped:**

- `costRisesEvery` 30→22, and **STEADY PACE** in the shop: +2 a level, four
  levels, the old 30 exactly at max. Last session rejected a steeper curve
  because it sank the maxed ceiling; a buyable curve removes the objection —
  the steepening IS the ladder now.
- Three gradual dials, engine formulas with numbers in content, all neutral
  at zero (and old saves' missing keys decode as zero-shaped `undefined`
  behind `> 0` guards, so a pre-session run resumes under its own flat
  economy): `cachePaysPerRing` (cache = 6 base + 4/ring; maxed RICHER WORLDS
  base 18, so a ring-2 cache maxed pays the pre-rebalance 26 — the
  restoration moved outward but stays literal, re-pinned in
  `progress.test.ts`), `popTilesPerRing` (0.25/pop/ring), and
  `destinationRampBlocks` (2 — density climbs from home to the horizon).
- `cachePaysAt` exported from `rules.ts` so the payment, the claim toast, the
  tap description and the beacon hint all say the same graded number — the
  tallyWorth rule applied to caches.
- The manual grew the gradient lines conditionally, and the harvest toast
  prints `+N for the depth` only when depth actually paid, so the arithmetic
  on screen still sums to the number on screen.
- **A quick start** (Marc: the help has "too much words going on for not much
  information"): a START tab, first and default — WHAT YOU SEE · WHAT YOU DO
  · HOW YOU SCORE, three lines each, no NUMBERS fold. The stranger's tab;
  everything it says is said properly in the tabs after.

**Re-pinned honestly rather than loosened quietly:** the patience factor 2→1.5
(the tighter curve compresses the gap; still 2.6× at 40 seeds) and seeker's
"real run" floor from an absolute 100 placements to 60% of bank20's — every
rebalance moves run length, and the claim was never about the number 100.
Notable: bank40 now plays identically to bank20 — under the 22-curve a
40-pocket never forms, which is the pressure doing its job.

Full sweep clean: 15 policies × 200 seeds, 0 stalled, 0 capped, random dead
at 24 placements, spender still ahead of bank20, seeker still the top
claimer. 401 tests.

**What waits on the phone:** does run one now feel like a floor instead of a
ceiling; does STEADY PACE feel worth its 30 relics; do the far caches pull;
and Marc's reframed pop question — are the pop advantages worth taking now
that tiles are scarce? Gate B's twenty logged pops and the stranger test
still lead the human follow-up.

### Session 21 — The audit, the bugs, and Gate B retired

Marc: _"what can we advance before i play on my phone? explore the codebase
for improvements, cut corners, things or visuals to implement for real."_
Three parallel audits (cut corners, visuals, quality/resilience) swept the
repo. Headline: zero TODOs in the code — the rot was in the gap between the
shipped tuning and the records, plus eight real bugs. Marc green-lit four
packages; this session shipped the first two.

**The bug package (all balance-neutral):**

- **An ended run was re-banked on every reload** — the run stayed in storage,
  `resume` picked it up, and `finish` banked its relics and counted it again,
  repeatable forever. The run leaves storage the moment it is recorded.
- **`mergeRun` bumped the run count once per TAP** (it runs after every
  action), so the atlas called every action a run — while its own docblock
  said "everything EXCEPT the run count". Pinned by a new test.
- **`decodeRun` hardened**: finite numbers only (NaN tiles resumed into a run
  that could never be played), and every cell's `kind` validated — the
  renderer's switches are exhaustive with no default, so one unknown kind was
  a black screen on every load with the only escape behind a panel that
  needs the game booted.
- **Quota shedding**: a full-storage autosave now drops the regenerable world
  memory to save the unregenerable run before giving up.
- **An error boundary exists**: a boot or loop crash paints a plain-DOM panel
  that says the truth — the run is saved, reload resumes it — instead of a
  silent blank page.
- **Pinch-zoom redrew the whole board per pointer event** (60–120 full
  teardowns a second at reach 12+) and leaked a baked texture set at every
  intermediate zoom size. Camera draws coalesce to one per frame; the cache
  evicts when the gesture settles. `destinationsWithin` — O(blocks²), asked
  identically twice per render — is cached.
- **Offline needed two visits**: the worker precached everything EXCEPT the
  bundle, and it registers after the first frame, so visit one's JS never
  entered the cache and an offline return white-screened. The build stamps
  the hashed asset list into PRECACHE and asserts the stamp took.
- **iOS ignored the SVG `apple-touch-icon`** — a home-screen install got a
  page screenshot on the exact device class this game targets. Real PNGs
  now (180/192/512 + maskable, `scripts/icons.ts` regenerates them), plus
  `og:image` so a shared link unfurls with the mark.
- **The clipboard share fallback was silent** — on any browser without a
  share sheet the button appeared to do nothing. It says LINK COPIED now,
  and the hook reports its outcome honestly.

Also, Marc's ask mid-session: **console-like touch** — long-pressing text
popped the OS selection loupe over the game. `user-select: none` +
`-webkit-touch-callout: none`; nothing on screen is prose to quote, and the
seed travels via SHARE.

**The honesty sweep.** Two rebalances had invalidated prose everywhere and
nobody swept behind them: SETTINGS told players to type `?ff=world.endless`
(a flag deleted two days earlier) in the very panel built on "a toggle that
lies is worse than no toggle"; the README's first concrete claim was a
260-placement clock that no longer exists; `persistent-world.md` said "PLAN,
nothing built" about three shipped phases; `endless-world.md` said P2/P3
"remain unbuilt"; `uniques.md` said "nothing here is built" while two of its
entries were purchasable in the shop; the gallery said Gate E was shut; the
ROADMAP checked "every ideas/ file resolved" while omitting `uniques.md` by
name — **that box is unchecked now and stays so until the eight open uniques
are decided.** All corrected to say what is true today, with the corrections
dated.

**GATE B IS RETIRED — Marc's call, made on the option set.** The gate asked
whether tiles-or-points was a real choice. It failed twice in human hands for
opposite reasons, and `singlePayout` — the gate's own written fallback, "cut
it to a single automatic payout" — shipped on 2026-08-16. A gate cannot stay
open on a fork that no longer exists; worse, its end-screen evidence line was
suppressed by the very tuning that retired it, so three documents pointed at
a blank space. `gateB()` and its tests are deleted (the record book still
stores the tallies — storage formats outlive questions), the end screen keeps
pops and biggest-pop in the facts line, and the ROADMAP row reads RETIRED
with the reasoning. **The successor question is open and belongs to the
phone: is pop-vs-burn-vs-wait a real timing decision?** Marc's own framing
(2026-08-18): waiting should be the score line; popping should buy small
advantages. Whether the advantages feel worth taking under the lean economy
is the thing to answer before 1.0.

Still queued from the audit, green-lit and not yet built: the end screen as
a picture (sparkline arc, title treatment), stone's texture, and the gallery
strips for light falloff, elevation and landmarks.

**Addendum, same day — the other two packages: the end screen becomes a
picture, and the gallery catches up to the game**

- **The end screen says whose run it is and draws the arc.** ASHWAKE in the
  display face at the top; then an inline SVG — one bar per harvest, placed
  where it landed in the run, as tall as its score against the run's biggest,
  which alone wears the accent. Gate D's question ("did the big number come
  near the end?") is now answered by the shape of the chart instead of a
  percentage buried in a fact line. No asset, themed through CSS variables,
  survives a screenshot at any width — which was the roadmap's actual ask.
- **Stone got a finish.** The most common cell in the back half of a run was
  the one surface with no texture at all: a fine dark stipple now (dots,
  alpha 0.16), quiet enough to keep "the board going pale" as the signal.
- **The gallery shows the systems the game grew after it was written.** Four
  new strips per direction: the torch (brightness by distance, through the
  same `brightness()` and the same multiply-tint arithmetic the board uses —
  the light values are arguable from a phone now, without a run), elevation
  (five bands at the light floor, where contours actually live — at full
  light they clamp invisible by design and the strip says so), destinations
  (all four glyphs over their ground, unclaimed and spent), and native
  fields (each colour's shape at the ink `fieldDots` equalises). To keep the
  truth in one place, `BAND_LIFT` and the landmark glyph map moved from the
  renderer into `@theme/tokens` beside `brightness()` — the gallery and the
  board now read the same numbers by construction.

406 tests. Deployed. What waits on the phone is unchanged — and the gallery
just made two of those questions (field legibility, the torch pool)
answerable without playing a full run.

**Addendum, same day — the audit's third package: accessibility and the PWA
seams**

Zero balance changes, and the default game — normal motion, default text
size, default contrast — renders the same picture it did this morning. Every
change is for a hand, an eye or a connection the defaults quietly assumed.

- **The manual is a dialog now, and says so**: `role="dialog"`, `aria-modal`,
  a name, Escape to close, and focus that moves into the panel on open and
  back to the `?` button on close — however it closes. The close-on-any-tap
  behaviour is untouched; the keyboard is an addition, not a replacement.
- **The board speaks.** `#toast` and `#hint` are `aria-live="polite"`, so a
  claim announced over the board is heard, not only seen. The stats row is
  deliberately NOT a live region — it is rebuilt wholesale every render and
  would re-announce four numbers per tap — so each box carries a stable
  `aria-label` instead, findable by name.
- **Keyboard focus exists**: `:focus-visible` in the theme's accent. There
  were zero focus styles in the file and the tap highlight is transparent,
  so a keyboard user had no cursor at all.
- **Every control reaches the file's own 44px rule.** Where a control is
  deliberately small to look at — the colour chips (grown once, reverted:
  "hierarchy, not smaller things"), the camera stack, the folded purse row —
  the visual footprint stays and a transparent `::before` grows the HIT AREA
  to 44px invisibly. Where there was room (`quiet` buttons, the manual's
  tabs, the theme swatches), the button grows for real.
- **Font sizes are rem, mapped 1:1** (13px = 0.8125rem): identical at
  default settings, and the OS text-size preference finally does something.
  Spacing and layout stay px — the board is geometry, not prose.
- **`prefers-contrast: more` lifts the faintest text** to the dim ink, which
  passes AA against torchlit's ground. The palette itself does not move;
  Gate E's values stay pinned by the theme tests.
- **Reduced motion gets its pop back.** The early return in `#spawnFlashes`
  gave those players NOTHING — a harvest left no sign on the board at all.
  They get the same glow at a fixed alpha now, held 200ms and removed: no
  jump, no scale, no stagger. The animated path is byte-identical.
- **The worker's navigation fetch has a 2.5s budget.** A phone on one bar
  used to hang on the browser's own 30s+ timeout with a complete game
  sitting in the cache. The network still wins whenever it answers in time,
  and a late response still refreshes the cache for next time.
- **An update announces itself.** `skipWaiting` + `claim` means a new worker
  takes over mid-session, and until now it did so silently.
  `controllerchange` — guarded so a first install stays quiet, because the
  page had no controller to change — surfaces one line above the stamp:
  NEW VERSION — TAP TO RELOAD. The autosave means the reload costs nothing.
- **`navigator.storage.persist()`**, asked once, after the first run save
  has actually succeeded — so iOS stops treating the world as evictable
  cache. Guarded for absence, never awaited, never thrown.
- **Deliberately not done**: `user-scalable=no` stays, and text selection
  stays off. WCAG disagrees; Marc chose console-like touch on 2026-08-18,
  and that decision outranks the checklist here.

411 tests. The dialog semantics, Escape, the live regions and the stat names
are pinned in `game.test.ts`; the worker has no test rig and was verified by
reading, plus the build's own stamp assertions.

**Addendum, same day — the audit's fourth package: the performance debt**

Zero balance changes, proven the strong way: `pnpm sim` is byte-identical
before and after (the engine was never touched), and a scripted 120-placement
board's full board+HUD view dumps byte-identical JSON across the refactor.
What changed is how many times the same answers get computed.

- **One context per render.** A single render used to resolve the harvest
  target three times, walk the ripe set five times, measure reach three
  times and re-derive every draft preview the board had already computed —
  full board passes, per tap, on a board that only grows. `renderContext`
  computes each once and threads through both selectors explicitly (an
  argument, not a module cache — the one last-value destinations cache
  predates this and stays). Both selectors still work standalone; the game
  loop builds one context and passes it twice. Measured on a real spender
  board (seed 11, stopped live at 120 placements, 174 cells; 500 renders,
  Node): **0.55ms → 0.34ms per render, ~1.6× faster** — and the win grows
  with the board, because the passes eliminated are the O(cells) ones. The
  honest footnote: calling ONE selector alone now costs about what the old
  pair did (~0.54ms), since the context computes previews for every card;
  only event-time singles (a button press pricing a pocket) take that path.
- **The keeper stopped re-writing the world per tap.** `onChange` ran
  `mergeRun` over every cell and stringified the whole revealed array to
  localStorage on EVERY action, and asked `askedSeed()` — a fresh
  URLSearchParams — three times per action across hooks. Now: the seed
  question is asked once (the URL cannot change without a reload); the merge
  runs only when the world could have changed (one cheap counting pass —
  cells only ever grow, claims only ever accrue); and the write coalesces to
  every tenth action **with a flush on pagehide/visibilitychange and at
  finish** — the flush is the load-bearing part, so closing the tab mid-run
  still cannot lose a claim. The in-memory world stays exact per merge; only
  the localStorage write is debounced.
- **Labels are textures now.** `#drawLabel` created a fresh Pixi Text per
  labelled cell per draw — a canvas rasterise and a GPU upload each — for a
  vocabulary of small ints and four glyphs. They render once into a cached
  texture (keyed text · size · ink) and every cell is a Sprite sharing it.
  Verified in pixi v8's source before trusting it: the per-draw
  `destroy({ children: true })` does NOT destroy a child sprite's texture
  (only `texture: true` does), so the cache owns them outright, evicted
  beside the surface cache when the size settles, with a hard 256-entry cap
  in case a theme's vocabulary is ever wilder than expected.
- **A tap is a set lookup.** `hitTest` ran `.some()` over every drawn cell;
  `draw()` keeps the key set now.
- **The texture cache's bookkeeping is finally under test.** The audit
  caught that `surfaces.test.ts` only ever exercised the null path —
  happy-dom has no 2D canvas, so the cache never populated and the eviction
  had nothing to evict. The bookkeeping (`BakedCache`) is split from Texture
  creation the way baking was split from surfaces, with the baker and the
  disposer injected: cache hits, key separation, failed bakes, prefix
  eviction and disposal are all pinned with plain objects now.
- **Left alone, on purpose**: `corners()` still allocates a fresh array per
  stroke per cell per draw. Reusing a scratch buffer would hand layout.ts a
  mutable output for an allocation the label cache already made irrelevant
  at per-action draw rates.

416 tests, `view.test.ts` and `game.test.ts` passing unmodified — the
"preview cannot disagree with payment" invariants never moved.

**Addendum, same day — the uniques design session, decided on option sets**

While the a11y/PWA and perf packages ran in the background (their addenda
above), Marc settled `ideas/uniques.md` in the foreground — every open item,
in three rounds of option sets:

- **Uniques are FOUND, never bought.** A hidden find: a rare landmark that
  never beacons — revealed only when growing ground touches it. "Youre often
  hidden from plain sight, you need to stumble on it." Revealing ground
  becomes a lottery ticket, which the lean economy already makes deliberate.
- **The shop sells the nose, never the prize**: a new boring SENSE upgrade
  makes near finds shimmer; at level zero a find is pure surprise.
- **Strictly one perk carried** — SECOND SLOT dies, refunded. Rootbound and
  Second Wind convert to findable (owners keep them). Stonewalker,
  Wallbreaker and Open Hand join the findable pool. Tidecaller killed in
  writing. All of Tier 1 parked post-1.0, whole — none chosen, scope not
  merit.
- Two paths scouted into `ideas/`: **sound.md** (three moments, Web Audio,
  zero assets, sound as theme data) and **daily.md** (date-hash seed, plain
  economy per the shipped `?seed=` precedent, no backend).

The build is specced and next: engine finds as their own pure hash layer
(separate salt and dials, so existing worlds keep every destination exactly
where it was), perks split from shop upgrades in `meta/progress.ts`, the
grant following the shrine pattern (engine marks, shell grants), and the
whole thing swept before it ships. The written question: **does a hidden
find change how a player grows their ground?** — the phone answers after
the build.
