# Architecture and standards

Read `DESIGN.md` first. This document covers stack, layout, and conventions. Nothing here
is a game rule.

---

## Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript, `strict: true`** | The engine is a state machine with many union types; strictness is doing real work here |
| Build | **Vite** | Fast, zero-config for this shape, first-class PWA plugin later |
| UI | **React 18** + inline SVG | The board is a few hundred SVG hexes; React's reconciliation is adequate and the ecosystem is well known |
| State | **`useReducer` over the pure engine** | The engine already *is* a reducer. Do not add Redux, Zustand, or similar |
| Styling | **CSS modules** or plain CSS with custom properties | No Tailwind, no CSS-in-JS. The UI is small and mostly bespoke |
| Tests | **Vitest** | Same toolchain as Vite; the pure engine makes unit tests trivial |
| Lint/format | **ESLint + Prettier** | Standard config is fine; do not spend time here |
| Package manager | **pnpm** | Preference only; npm is acceptable |

**Deliberately not used:** any game framework (Phaser, PixiJS), any ECS library, any
animation library, canvas rendering, WebGL. The board is under 60 cells and turn-based.
SVG with CSS transitions is sufficient and far easier to debug.

**Do not install a hex library.** The math is thirty lines and is specified in `ENGINE.md`.
Owning it avoids convention mismatches.

---

## Project layout

```
src/
  engine/            pure game logic — no DOM, no imports from ui/ or content/ internals
    state.ts         GameState type and initial state construction
    reduce.ts        the reducer: reduce(state, action) -> state
    actions.ts       Action union type
    phases/          one module per phase transition
      place.ts
      dividend.ts
      levelup.ts
      region.ts
      lastlight.ts
    hex.ts           axial coordinate math
    rng.ts           seeded PRNG streams
    regiongen.ts     procedural region generation
    scoring.ts       placement scoring, enclosure, chain detection
    selectors.ts     derived reads (legalHexes, matchPreview, remainingSpace)
  content/           all data — no logic
    terrains.ts
    affixes.ts
    uniques.ts
    biomes.ts
    contracts.ts
    blessings.ts
    stats.ts
    seals.ts
    tuning.ts        every balance constant in the game
  ui/                React components — no game logic
    App.tsx
    Board.tsx
    DraftBar.tsx
    ContractStrip.tsx
    DividendModal.tsx
    LevelUpModal.tsx
    RegionChoiceModal.tsx
    EndScreen.tsx
    hooks/
  sim/               headless balance harness (see below)
    policies.ts
    run.ts
    report.ts
test/
  engine/            unit and property tests
  golden/            recorded seed+action runs with expected outcomes
```

### The dependency rule

```
content  ←  engine  ←  ui
                   ←  sim
```

`engine` may import from `content`. `content` may import nothing but types. `ui` and `sim`
may import from both. **Nothing imports from `ui`.** Enforce this with an ESLint
`no-restricted-imports` rule — it is the single most valuable piece of tooling in the repo.

---

## Coding standards

**Purity in the engine is absolute.** No `Date.now()`, no `Math.random()`, no mutation of
inputs, no async. Every function in `src/engine/` must be deterministic given its
arguments. If you need randomness, take an RNG stream from state and return the advanced
stream.

**Immutability by convention, not by library.** Return new objects; do not reach for Immer.
The state is small.

**Prefer plain data.** No classes in the engine. `GameState` is a plain object; actions are
plain discriminated unions. This keeps serialisation, testing, and time-travel free.

**Sets and Maps in state must be serialisable.** Either use plain objects keyed by hex
string, or provide explicit serialise/deserialise. The prototype used `Set`; for the real
build prefer `Record<HexKey, T>` and `HexKey[]` so `JSON.stringify` round-trips for golden
tests and save games.

**No magic numbers outside `content/tuning.ts`.** If a number affects balance and it
appears in `src/engine/`, that is a bug. Threshold values, multipliers, costs, weights —
all of it lives in content.

**Name things after the design vocabulary.** Use the glossary in `DESIGN.md`. A reviewer
should be able to read `sealRegion`, `barrenGround`, `enclosed`, `dividend`, `theEbb` and
map each to a documented concept.

---

## Testing strategy

The engine's purity is the point — it makes the game testable without rendering anything.

**Unit tests** for each pure function: `enclosed`, `matchesAt`, `legalPlacement`,
`findChain`, `regionMultiplier`, RNG determinism.

**Property tests** — these catch the bugs that matter:

- budget never goes negative outside the Last Light
- an illegal placement is never accepted by `reduce`
- every generated region is fully connected
- every generated region's waypoint ring is in-region and unblocked
- a region always has at least one boundary cell reachable as an entry
- the same seed and action list always produces the same final state

**Golden tests** — record a seed plus an action list, assert the final score and depth.
These are your regression net when tuning. Keep several: a short run, a long run, a run
that enters and exits the Ebb, a run that seals three regions.

**No UI tests beyond smoke.** The value is in the engine.

---

## The balance harness — build this early

`src/sim/` is a headless runner that plays N complete runs against simple scripted
policies and reports the distribution of depth, score, and cause of death.

Because tuning target is now *the slope of the cost curve*, not run length, you cannot
tune by playing. You need distributions.

Suggested policies:

| Policy | Behaviour |
|---|---|
| `greedy-score` | always takes the highest-match placement, always Harvests |
| `economy` | prioritises refunds and Quarry, leaves regions early |
| `prospector` | builds toward 6/6 enclosures, always Prospects |
| `random-legal` | uniform over legal placements — the floor |

Report per policy: median regions sealed, score distribution, % of runs that entered the
Ebb, % that recovered, median turns per region.

**The tuning signal you are looking for:** `greedy-score` and `economy` should reach
comparable depth by different routes, `random-legal` should die around region two, and no
policy should be able to run forever.

---

## Performance

Not a concern at this scale, with two exceptions:

- **Do not re-render every hex on every state change.** Memoise hex components on their
  own cell state.
- **Chain animation must not block input handling.** Animation is a UI concern layered over
  an already-resolved engine state; the engine resolves a chain instantly and the UI plays
  it back.

---

## What to build first

Follow `ROADMAP.md`. But before milestone 1, get these in place:

1. Repo, TypeScript strict, Vite, Vitest, ESLint with the dependency rule
2. `hex.ts` and `rng.ts` with full unit tests — everything else rests on these
3. `content/tuning.ts` with the constants from `CONTENT.md`, even if unused

Those three are load-bearing and cheap. Do not start on the reducer before hex math is
tested.
