# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at checkpoints only. The reasoning lives in `LOG.md`; the
rules live in `CLAUDE.md`.

Last checkpoint: **2026-08-13** — Session 6: **P3b is built.** Destinations
(cache / site / claimable territory, seeded by the world hash, drawn as
beacons through unrevealed ground, claimed by touch) and rarity in the draft
(magic = wild, unique = wild + double, luck accrued by tiles-harvests raising
the odds, odds printed in the HUD). Shaped by Marc's answers on 2026-08-13 —
territories-not-shrines, draft-rolls-plus-luck, both systems minimal in one
session. All of it tuning-gated: on in `ENDLESS_TUNING` (`?ff=world.endless`),
off in the bounded defaults; `pnpm sim --endless` sweeps the shipped plane.
Harness: nothing stalls; the timing optimum moved 15 → ~40 because caches are
lifelines (bank40: 0 bare → 19,356 shipped; cliff at 80 holds); `seeker`
claims 2 destinations a run and keeps bank15's pace. The two written
questions — does a glow change where a human builds, do the odds ever flip a
harvest to tiles — wait on the phone.

Same day, Session 7, on Marc's asks: **a camera and fewer decisions on
screen.** Zoom `+`/`−`/`FIT` buttons plus pinch (1–4×, 1 = fit-everything),
drag-to-pan past an 8px slop so taps stay taps, worth numbers surfacing as
you zoom (`zoomLayout` in `render/layout.ts`, pure, pinned). A `?` opens one
screen of how-to-play in plain words, per world; the hint line leads with a
one-clause "what now". Harvest buttons exist only while something is ripe,
and the draft marks BEST from the same previews the board draws. 244 tests.

Session 8, same day, on "streamlined but not fun": **character.** Colour
personalities through the one worth channel (GREEN crowds, YELLOW company,
RED feeds on stone, BLUE worth more far from home — one shared `tallyWorth`
so preview and payment cannot diverge), biomes as a third scale of the world
hash (regions ~24 hexes across where every field wears the region's colour),
and a HOLD stash that survives rerolls. All tuning-gated, on in
`ENDLESS_TUNING` only. Harness: nothing stalls, median reach DOUBLED across
policies (exploration pays structurally), every scoring line rose, timing
spine holds. 256 tests. Queued in `ideas/endless-world.md`: pattern shapes,
hidden finds, hazards, quests, quirks, economy re-target. Next: Marc plays
`?ff=world.endless` on the phone — three sessions of build are waiting on
that one play.

## Shipped and settled

- **Repository.** `tiles/` is its own git repo. Nothing here belongs to the
  ecosystem repo rooted at `C:/Users/marc_`.
- **Toolchain.** Vite 8 · TypeScript 5.9 strict · Vitest 4 · ESLint 10 ·
  Prettier · pnpm. TypeScript is pinned below 7 on purpose: `typescript-eslint`
  cannot parse TS 7 yet, and type-aware linting is load-bearing here.
- **The layering rule is machine-enforced.** `content <- engine <- ui/render/sim`.
  The engine additionally cannot reach `Math.random`, `Date`, the DOM or async.
  Probed and confirmed failing-as-designed, not merely configured.
- **`src/engine/hex.ts`** — pointy-top axial. `DIRECTIONS` order is pinned by
  test; ring rules read it as a sequence, so reordering would change the game
  rather than break a build.
- **`src/engine/rng.ts`** — counter-based mulberry32 over plain
  `{ seed, cursor }` data, in named per-concern streams. This is what buys
  replays, golden tests, save files and a headless harness; treat the plainness
  as load-bearing, not as a style choice.
- **`src/meta/features.ts`** — every system is independently switchable and
  defaults OFF. Overridable from the query string (`?ff=id`, `?ff=-id`) because
  prod-on-a-phone is the test environment and the address bar is the only
  console. Corrupt or stale persisted state degrades to defaults.
- **`src/render/`** — `Renderer` is an interface over plain view data; the
  engine never learns pixels exist. `layout.ts` fits any region shape to a
  portrait viewport by full drawn extent (not cell centres), so edge hexes
  cannot clip on a narrow screen.
- **Deploy.** Assets-only Cloudflare Worker, live at
  **https://tiles.marcportal.com** (and `tiles.marc-jeanson.workers.dev`, kept
  as the WAF-free fallback CI verifies against when the zone challenges runner
  IPs). The build stamps `dist/version.json`; `scripts/verify-deploy.ts` proves
  the LIVE site serves that exact commit, retrying per asset because assets
  propagate independently of the version stamp. Green CI is not treated as a
  deploy. Repo: `majeanson/tiles` (private); CI green on `main`.

- **The game is playable end to end.** `src/engine/` is the whole run — place,
  ripen, harvest, leave, die — with tuning carried as data rather than imported,
  so the harness can sweep an economy and a replay knows which one it ran under.
  `src/ui/view.ts` derives everything on screen from the same rules the reducer
  uses, so a preview cannot promise a number the placement will not pay.
- **`src/sim/` is the balance harness.** `pnpm sim` plays seven policies over
  N seeds; `--set costRisesEvery=60` reruns the whole economy from one command.
  Stalls are reported, never hung on. Gate C's clauses are pinned as tests.
- **Rule 7 exists**: you may leave a map only once you have harvested on it.
  Added during implementation because leaving was otherwise free and unlimited,
  which made the map multiplier free with it. See `DESIGN.md`.

- **`src/theme/` holds the whole visual surface as data.** A new enforced layer:
  `content <- theme <- render`, with `engine/` and `content/` forbidden from
  importing it. A theme describes how ROLES are painted, never what they mean, so
  repainting the game cannot change it. Four are loaded — `placeholder` plus the
  three handed-down directions — switchable with `?theme=`, and **the placeholder
  is still the default, asserted by a test**. Gate E is shut; this is the slot a
  direction goes in, not a direction chosen.
- **Art is optional everywhere.** Every bitmap is a slot. Drop a PNG at
  `public/assets/<themeId>/<slotId>.png`, and a build-time scan writes the
  manifest the client reads; missing files are the normal case and cost neither a
  request nor a failure. Procedural surfaces — four pattern kinds, exactly what
  the three directions ask for — are the floor underneath. No art has been
  imported yet: every slot is empty on purpose.
- **Hex orientation is a rendering decision, not an engine one.** Moved into
  `render/layout.ts` and parameterised; the geometry suite runs against both.
  The engine was not touched, because axial coordinates mean the same thing
  either way up.
- **The greyscale rule is a test, not a sentence.** `theme.test.ts` measures the
  four terrains in CIE L* and fails a direction whose values collapse. It found
  three real defects on its first run, one of them in the palette that had
  already shipped — the placeholder's red and blue were the same tone. Do not
  relax the threshold to make a direction pass; darken something.
- **`/gallery`** — the art-direction workbench, drawn by the same baker the
  board uses, shipped with the game so it opens on the phone.

- **The endless world exists in the engine, behind tuning.** `world: 'endless'`
  in `content/tuning.ts` (default `bounded`) turns the run into one unbounded
  plane grown from a seed tile: no LEAVE, harvest pops one connected ripe
  cluster targeted by `HARVEST`'s optional `at`, points multiply with distance
  from home in place of the map number. The plane is grown, not generated —
  every placement materialises the empty ground around itself, so no tile ever
  borders an absent cell and every rule function serves both worlds unchanged.
  Playable behind `?ff=world.endless` (see the P3a bullet below), per
  `ideas/endless-world.md`.
- **The plane has ground under it (P2, answered).** `engine/world.ts` is a pure
  hash of `(worldSeed, hex)`: 6% walls that surround-but-never-match and cannot
  be built on, native fields where a tile of the right colour counts the ground
  as one extra match. The harness says terrain enriches without breaking —
  every scoring policy improves, reach extends, the timing structure holds.
  Walls added the run's second named death, `walled`. Pinned in `sim.test.ts`.
- **P3a: the plane is playable on a phone**, behind `?ff=world.endless`. The
  board auto-fits the grown world (no pan/pinch, so no gesture conflict with
  tap-to-place); tapping a ripe tile targets its pocket — the harvest buttons
  re-price to it and the board outlines it in accent; LEAVE is hidden; the
  third stat reads REACH. Fog, landmarks and hints are P3b, not built.
- **Every decision in prompt.md is answered** — see its ANSWERED section.
  Highlights: P4 (persistent world, fog memory across runs) confirmed as the
  intent; the pop is a JUMP (tile leaps and falls, `popLift` per theme);
  `?hex=flat|pointy` overrides any theme's facing and the picker carries the
  toggle; feature and facing overrides persist across visits.
- **All eleven sim policies play both worlds** — `pnpm sim --set world=endless`
  reruns the identical table under the other economy. The `bank<N>` family
  isolates harvest timing as a dial; 0 stalled, 0 capped everywhere.
- **The draft cards show the tile.** Each card carries the baked hex surface
  the board draws — same baker, same theme — with the flat swatch as the
  no-canvas fallback. Prompted by the first human feedback on the prototype:
  the hand read as "just click there".

## The gates

**C is passed** (Session 1, with evidence in `LOG.md`). A is playable but
unjudged — it needs a phone, in portrait, against prod. B has its mechanism
confirmed by the harness but still needs 20 logged pops from a human. D, E and F
are open. **Gate E still blocks CHOOSING an art direction** until A–D pass, and
nothing has been chosen: the default is still the placeholder. Session 2 built
the mechanism that makes the choice cheap when the gate opens, and loaded the
candidates behind it so the decision can be made from a phone rather than from a
document.

**Nothing visual has been seen by anything.** happy-dom has no 2D canvas, so no
test in this repository has ever rendered the board. Everything Session 2 added
is verified as wiring and unverified as a picture.

## The open design problem — now with a candidate answer

Rule 5's harvest TIMING is a fake decision **on the bounded map**, and Session
3 measured it as worse than first thought: the `bank<N>` line (protect one big
harvest, feed on the rest as tiles) scores monotonically more the longer it
banks, topping out at 4× the old champion with zero risk, because a full map
hands you the cash-in moment for free. Still pinned as a failing design in
`src/sim/sim.test.ts`. Do not author content around rule 5 in the bounded
world.

**The endless world is the candidate fix, and P1 says it works structurally:**
on the plane the same dial has an interior optimum (bank40 ≈ 7,400) with a
cliff past it (bank80 dies with its fortune unpopped, scoring 0), banking-
until-forced ceases to exist as a scoring line, and the beeline exploit cannot
ripen anything. Pinned in the same file. What the harness cannot say: whether
the gradient is FEELABLE by a human — that is P3 (camera, fog, landmarks), and
it has not been built. See `ideas/endless-world.md` for the full ledger.

## Push-to-deploy is armed

A push to `main` runs format/lint/typecheck/test/build, then deploys, then
proves the live site serves that exact commit. Secrets and the `DEPLOY_ENABLED`
variable are set on `majeanson/tiles`.

The Cloudflare token is deliberately narrow — Workers Scripts: Edit, Workers
Routes: Edit pinned to the `marcportal.com` zone, Account Settings: Read. No
D1, KV or R2. Those permissions are **account-scoped, not resource-scoped** in
Cloudflare, so granting D1 here would hand this game's deploy token full edit
rights over jaffre's production database. A token's permissions can be widened
in place later without changing its value, so there is no cost to waiting until
a feature actually needs one.

Manual deploy still works: `pnpm build && pnpm exec wrangler deploy`.

## Not started

Unlocks (the ledger in `DESIGN.md` is a plan, not code), special tiles, perks,
map routing, biome colour weights, and save/resume. No design claim has been
proven by a HUMAN playing yet — everything in `DESIGN.md` marked proven was
proven by the harness, which cannot tell you whether a minute of it is fun.

The handed-down art directions assume four mechanics: an endless scrolling map,
two-tier fog of war, a chained cascade, and a pop choice that pays
`+6 tiles / ×2 points`. As of Session 3 the first has an ENGINE (the endless
world, above) but no UI — no scrolling, no camera — and the fog, cascade and
that pop choice remain unbuilt and unfaked. Their asset slots stay declared and
marked `NO MECHANIC` until the screen catches up with the reducer.
