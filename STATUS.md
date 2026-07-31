# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at checkpoints only. The reasoning lives in `LOG.md`; the
rules live in `CLAUDE.md`.

Last checkpoint: **2026-07-31** — Session 0, foundation.

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

## The gates

All six open. See `LOG.md`. **Gate E blocks all UI/UX and art-direction work**
until A–D pass.

## Not armed yet

The CI deploy job exists but is gated off. To arm it: set the
`CLOUDFLARE_API_TOKEN` secret (Workers Scripts: Edit + Workers Routes: Edit on
the `marcportal.com` zone) and the `DEPLOY_ENABLED` repository variable to
`true`. `CLOUDFLARE_ACCOUNT_ID` is already set. Until then, deploys are manual:
`pnpm build && pnpm exec wrangler deploy`.

## Not started

Game state, the reducer, placement, scoring, pops, regions, escalation, the
balance harness, the unlock ledger. No design claim has been proven by play yet
— `DESIGN.md` is deliberately almost empty and should stay that way until it
isn't.
