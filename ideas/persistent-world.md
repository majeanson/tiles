# The persistent world — P4, planned 2026-08-15

Status: **BUILT — all three phases (updated 2026-08-18).** P4a (the remembered
world) and P4b (territory perks) shipped in M2/M3; P4c shipped as shrines and
the atlas in M4. The per-block bitmap compaction stays deferred, parked in
`ROADMAP.md`'s post-1.0 lot. The plan below is kept as the record of the
decisions, which were all Marc's. This is the roguelite layer: one world per
player, remembered between runs. Every decision below is Marc's, given
2026-08-15 via prompts; the architecture is drafted to the repo's rules
(pure engine, numbers in content, one question per prototype). It lives in
`ideas/` because `DESIGN.md` records only what play has proven.

## The decisions, recorded

| Question | Marc's call |
| --- | --- |
| What persists between runs? | **Revealed ground + claimed territories.** Tiles and stone reset each run; the map you know stays known; territories stay yours. |
| Caches (+) and sites (★) on later runs? | **Re-arm every run.** Known ground stays worth revisiting; a good route through your world is a strategy you refine. Territories are the once-ever part. |
| What does exploring unlock? | **All three, phased:** places-as-features, an atlas, and starting perks from held territories. |
| World lifecycle | **One world per device, plus "Abandon world"** (confirmation required) in SETTINGS. Shareable/multiple worlds deliberately deferred. |
| Why (the fun problem it serves) | Marc's Gate B debrief: points felt worthless early and risking them felt like dying with nothing — "we should add roguelite elements maybe." Territory perks soften the start; a remembered world makes every run's exploration COUNT beyond its own score. |

## What a run becomes

You always play the same world. The first run is exactly today's game. Every
run after that starts at the same home hex, with the ground you have ever
revealed drawn as **memory** — visible terrain you cannot build on until your
chain grows there again this run — and every territory you have ever claimed
already yours, its field active the moment growth reaches it. Caches and
sites glow again. You know where the red country is. You know a cache sits
nine out to the north-east. The question stops being "what is out there" and
becomes "what is the best line through MY world" — and each run can push the
known edge a little farther.

## Architecture (drafted, not built)

The engine stays pure; persistence is DATA IN, DATA OUT at the edges, the
same split as save/resume (`meta/save.ts`) and the flags.

- **`WorldMemory`** (new, `meta/` + storage `tiles.world.v1`):
  `{ worldSeed, revealed: HexKey[] (or per-block bitmap when size demands),
  territories: HexKey[], stats: { runs, bestPoints, farthestReach, claims } }`.
  Written by the shell when a run ends (merge `Object.keys(state.cells)`
  into `revealed`, claimed territories into `territories`).
- **Seed**: `worldSeed` is rolled once and stored; `newRun` uses it instead
  of a per-run seed. Draft/loot streams still vary per run (mix a run nonce
  into the NON-world streams only, so terrain stays eternal while draws
  differ). `?seed=` keeps meaning "exact replay" and bypasses the world.
- **Territories into the engine, as data**: `newRun(seed, tuning, memory?)`
  where `memory.territories` is plain data. `revealCell` consults it: a
  landmark hex in the list arrives `claimed: true` (no re-payout), and its
  field unfurls through the existing `claimedFields` scan. No storage, no
  globals — a replay is reproducible from seed + tuning + memory.
- **Fog memory is view-level**: remembered-but-not-grown cells are drawn
  faint by the renderer from `WorldMemory.revealed` (terrain re-derived from
  the pure hash — only KEYS are stored). The engine board still holds only
  grown ground; "no tile borders an absent cell" stays true.
- **Storage budget**: ~2,500 cells revealed per long run; ten runs ≈ 25k
  keys ≈ 200KB as a JSON array. Acceptable to ~50 runs; the per-block
  bitmap (64 cells/entry) is the planned compaction when the atlas says a
  world has grown past ~1MB. Never a blocker for P4a.

## The phases, one question each

- **P4a — the remembered world.** Fixed world seed, fog memory drawn,
  territories persist (claimed, fields active, no re-payout), caches/sites
  re-arm, "Abandon world" in SETTINGS, atlas LINE in THIS BUILD ("world:
  run 7 · 31% of a 40-hex circle known · 3 territories").
  *Question: does knowing the world change where a human pushes — is run
  two more interesting than run one, not less?*
- **P4b — territory perks (the roguelite dial).** Each held territory pays
  a small run-start bonus; first candidate `+2 startingTiles` per territory,
  capped (numbers in `content/`, swept before shipping — the harness gets a
  `memory` input so policies can play run N). Directly answers Gate B's
  "never felt safe enough to take points."
  *Question: does a softer start actually move the human's harvest choice
  toward points (re-run the Gate B debrief)?*
- **P4c — places as features + the atlas screen.** Rare landmark kinds that
  switch features on when first reached (the unlock ledger becomes
  geography: a shrine → 4th draft card, a far ruin → scout tiles), and a
  proper atlas panel (world stats, best runs, territories held).
  *Question: does an unlock you can SEE in the fog pull harder than one on
  a list?*

## Risks, written down before building

- **Familiar ≠ fun**: a remembered world can make run five feel like a
  commute. The re-arming caches and the pushed frontier are the counter;
  P4a's question exists to catch it early.
- **Perk inflation**: +tiles per territory compounds across the map's
  territory supply. The cap is load-bearing; the harness sweeps run-N
  starts before any number ships.
- **Save interplay**: an in-progress run saved under world seed A must
  survive "Abandon world" (it keeps ITS seed; the new world starts on the
  next NEW RUN). Same carried-tuning principle as save/resume.
- **The bounded game** ignores all of this — P4 is endless-only, gated like
  everything else.
