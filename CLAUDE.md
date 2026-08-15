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

- **No UI/UX or art direction until gates A–D pass** (`LOG.md`). Layout and
  structure are fine; palette, type and texture are not.
- **The engine is pure.** No DOM, no `Math.random`, no `Date`, no async, no
  mutation. ESLint enforces all four — see `eslint.config.js`.
- **Every balance number lives in `src/content/`.** A number that affects
  balance appearing under `src/engine/` is a bug.
- **Every system ships behind a flag** in `src/meta/features.ts`, defaulting
  off. Run one is the smallest game there is; depth arrives by unlock. One
  recorded exception: `world.endless` defaults ON since 2026-08-14 — the
  worlds question belonged to play (Session 4), and Marc played both and
  chose (LOG, Session 9). `?ff=-world.endless` is the bounded game.
- **Plain words.** No invented vocabulary until a concept has earned a name.
  The v1 design had twenty; that was the problem, not the flavour.
- **One question per prototype.** Write it down before building, answer it after
  playing, in `LOG.md`. A prototype that answers nothing was not a prototype.
- **No PR gate**: land on `main`; CI's checks plus `verify-deploy` gate prod.
- **Testing happens on the deployed site**, on a phone, in portrait. Not
  localhost, not a desktop browser window resized to look like a phone.
