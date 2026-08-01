# LOG.md — the gates, and the record

## The gates

Established before any code, so that no work is done twice and no polish lands
on an unproven design. **A gate is not passed until it is written down here as
passed, with its evidence.**

| Gate                         | Rule                                                                               | Passes when                                                                                                                    | State                     |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **A — The minute is fun**    | No pops, no regions, no meta until placing a tile feels good                       | 20 consecutive placements with placeholder art feel good, on the phone                                                         | **playable, unjudged**    |
| **B — The decision is real** | The pop payout must be a genuine choice                                            | Across 20 logged pops, no option is taken more than ~70% of the time. If it is: fix it, or cut it to a single automatic payout | open, mechanism confirmed |
| **C — The economy closes**   | No content authoring before the headless harness reports                           | No scripted policy runs forever; `random-legal` dies early; two different policies reach comparable depth by different routes  | **passed (session 1)**    |
| **D — The run has an arc**   | A run must peak and then end legibly                                               | The end screen names the cause of death in one sentence, and the run's biggest number came near the end                        | open                      |
| **E — Design freeze**        | No art direction until A–D pass                                                    | A–D signed off here                                                                                                            | open                      |
| **F — Content last**         | Biomes, specials, perks and unlock tables are cheap to write, expensive to balance | Gate C passed with placeholder content only                                                                                    | open                      |

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
