# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at checkpoints only. The reasoning lives in `LOG.md`; the
rules live in `CLAUDE.md`.

Last checkpoint: **2026-07-31** — Session 2, the theme layer and the art slots.

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

## The open design problem

Rule 5's harvest TIMING is currently a fake decision: banking every pop until
the map is finished beats harvesting as you go by 43×, and still wins with the
quadratic term flattened to zero. The cause is that stone never matches, so an
early harvest permanently poisons the worth of everything placed beside it.
Neither `harvestSizeBonus` nor `ripeTilesMatch` fixes it — the latter
over-corrects to the point that a full-map harvest is worth exactly zero. This
is written down as a failing design in `src/sim/sim.test.ts` and is the first
thing the next design pass should attack. Do not author content around rule 5
until it is settled.

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

The handed-down art directions assume four mechanics this game does not have: an
endless scrolling map, two-tier fog of war, a chained cascade, and a pop choice
that pays `+6 tiles / ×2 points` rather than a whole-board harvest. None were
built and none were faked. Their asset slots are declared and marked
`NO MECHANIC`, in the code and on the gallery page. `prompt.md` opens with this.
