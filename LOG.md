# LOG.md — the gates, and the record

## The gates

Established before any code, so that no work is done twice and no polish lands
on an unproven design. **A gate is not passed until it is written down here as
passed, with its evidence.**

| Gate                         | Rule                                                                               | Passes when                                                                                                                    | State |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **A — The minute is fun**    | No pops, no regions, no meta until placing a tile feels good                       | 20 consecutive placements with placeholder art feel good, on the phone                                                         | open  |
| **B — The decision is real** | The pop payout must be a genuine choice                                            | Across 20 logged pops, no option is taken more than ~70% of the time. If it is: fix it, or cut it to a single automatic payout | open  |
| **C — The economy closes**   | No content authoring before the headless harness reports                           | No scripted policy runs forever; `random-legal` dies early; two different policies reach comparable depth by different routes  | open  |
| **D — The run has an arc**   | A run must peak and then end legibly                                               | The end screen names the cause of death in one sentence, and the run's biggest number came near the end                        | open  |
| **E — Design freeze**        | No art direction until A–D pass                                                    | A–D signed off here                                                                                                            | open  |
| **F — Content last**         | Biomes, specials, perks and unlock tables are cheap to write, expensive to balance | Gate C passed with placeholder content only                                                                                    | open  |

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
fails as designed; production build emits `version.json`.
