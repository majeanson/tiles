# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at checkpoints only. The reasoning lives in `LOG.md`; the
rules live in `CLAUDE.md`.

Last checkpoint: **2026-07-31** — Session 1, the run loop and the harness.

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

## The gates

**C is passed** (Session 1, with evidence in `LOG.md`). A is playable but
unjudged — it needs a phone, in portrait, against prod. B has its mechanism
confirmed by the harness but still needs 20 logged pops from a human. D, E and F
are open. **Gate E still blocks all art-direction work** until A–D pass.

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
map routing, biome colour weights, save/resume, and any art direction at all.
No design claim has been proven by a HUMAN playing yet — everything in
`DESIGN.md` marked proven was proven by the harness, which cannot tell you
whether a minute of it is fun.
