# CLAUDE.md

Read `STATUS.md` first — the checkpoint ledger of what is done **and verified**,
so shipped ground doesn't get re-audited. `LOG.md` holds the gates and the
per-session record. `DESIGN.md` records only what play has actually proven.
`ROADMAP.md` is the finish line — the milestones to 1.0 and the definition of
done Marc set on 2026-08-15; new work should serve the current milestone.

`ideas/v1-archive/` is the unbuilt v1 design (Hearthfall). It is **reference,
not spec** — its economy was never run through a spreadsheet and breaks around
region 3. Mine it for good ideas; do not implement it.

Hard rules:

- **Art direction is decided, and the palette answers to tests.** Gate E opened
  2026-08-15 and closed on torchlit 2026-08-20 (`LOG.md`), so this line no
  longer says "no art direction until A–D pass" — it says what replaced it.
  Every colour lives in `src/theme/` as data; `theme.test.ts` holds the
  greyscale ladder and `contrast.test.ts` holds the reading budget (4.5:1 for
  text, 3:1 for a mark), over **every** direction in the registry. **Do not
  relax a threshold to make a palette pass — darken something.** A new
  direction is a new file plus one line in `theme/index.ts`; it earns its place
  by passing, not by being liked.
- **The engine is pure.** No DOM, no `Math.random`, no `Date`, no async, no
  mutation. ESLint enforces all four — see `eslint.config.js`.
- **Every balance number lives in `src/content/`.** A number that affects
  balance appearing under `src/engine/` is a bug.
- **Every system ships behind a flag** in `src/meta/features.ts` **or a
  tuning dial that zeroes it**, defaulting off. Run one is the smallest game
  there is; depth arrives by unlock — via shrines and the relic shop since
  M3/M4, which is the same principle worn by the game itself. The dial form
  is how a FOUND perk (Stonewalker's `stoneDiscount`, Wallbreaker's
  `wallBuildCostMult`, KEEN NOSE's `findSense`, 2026-08-18) ships off for
  everyone who has not earned it, with no flag to flip and no menu to find —
  the same contract, paid in a number instead of a boolean. (History:
  `world.endless` was the one default-ON exception from 2026-08-14 — Marc
  played both worlds and chose — until 2026-08-16, when the bounded game was
  deleted and the flag with it. One economy, for everybody, so a shared seed
  opens the game its sender was playing.)
- **Plain words.** No invented vocabulary until a concept has earned a name.
  The v1 design had twenty; that was the problem, not the flavour.
- **One question per prototype.** Write it down before building, answer it after
  playing, in `LOG.md`. A prototype that answers nothing was not a prototype.
- **No PR gate**: land on `main`; CI's checks plus `verify-deploy` gate prod.
- **Testing happens on the deployed site**, on a phone, in portrait. Not
  localhost, not a desktop browser window resized to look like a phone.
