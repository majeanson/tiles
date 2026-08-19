# WORKPLAN — the 2026-08-18 pipeline

Live tracker for the three-stage work pipeline Marc green-lit on 2026-08-18.
Whoever picks this up (any session, any agent): execute stages in order, one
at a time — same working tree, so no parallel stages. Every stage: gates
(`pnpm exec vitest run` · `pnpm typecheck` · `pnpm lint` · `pnpm format:check`
· `pnpm sim` 0 stalled/0 capped), commit to main in the repo's voice, push,
CI green, then mark it here and start the next.

## Decisions of record (Marc, 2026-08-18, on option sets)

- Find re-farm: **CLOSED** — the world remembers claimed finds like
  territories; once per world, ever.
- World mood (per-run tilt): **PARKED** — post-playtest.
- Ground-feeds-draft (native ground biases the draw): **offered, not
  chosen** — do not build unless he asks.
- Where-you-wake (start at held territories): **prototype, harness-first** —
  prove the distance multiplier cannot be beelined from a far spawn before
  any UI exists.

## Stage 1 — correctness (STATUS: DONE, commit `1e09a89`)

Seam/bug fixes from the 2026-08-18 triple audit: the find-grant eaten by
`#claimNote`'s early return · stale find-toast copy ("end screen" → THE
SHOP) · hint line calling a shrine "a territory to claim" · the false
"odds just rose" pop line (print real luck gained) · OPEN HAND × treasure
collision (no treasure offer when holdSlots ≤ 0) · retire the no-op
'treasure' shrine unlock · memoize the KEEN NOSE shimmer scan into
RenderContext · fix `<= 0` guards vs undefined in world.ts finds + save
fill for the eight new tuning keys · THIS BUILD/atlas/debug coverage of
finds/perks · close the find re-farm (WorldMemory.finds) · STATUS.md
checkpoint rewrite · CLAUDE.md flag-rule amendment · doc/test comment
sweep · call or delete `startingPerk`.

All eighteen items landed in `1e09a89` ("stage 1: the audit closes — every
claim counted, every find spent once"): 458 tests (was 451), typecheck/
lint/format clean, `pnpm sim` byte-identical to the last balance sweep (0
stalled, 0 capped, 200 seeds × 15 policies). Full account in `LOG.md`'s
2026-08-18 addendum. Pushed; CI green on `main`.

## Stage 2 — UI/UX (STATUS: DONE, commits `8e25a63`, `091749c`, `b2edce4`, `478c6cb`)

The audit's big five, in four commits, plus most of the small wins. Full
account in `LOG.md`'s 2026-08-18 addendum; the short version:

1. **Front door** (`8e25a63`): NAME + TAGLINE + BEGIN (RESUME — PLACEMENT N
   when a run is saved) + quiet HOW TO PLAY over #app, painted as static
   markup so it costs the first frame nothing. `Game#openHelp` made public
   so the door opens the SAME manual the in-game ? does. `#help-panel`
   moved to `position: fixed` and OUT of `#game-shell` (which starts
   `inert`) — an inert ancestor makes every descendant unfocusable
   regardless of z-index, so the manual had to sit outside it to still open
   from the door.
2. **End screen as payout** (`091749c`): score broken into POPS +
   REACH×`endReachBonus` + CLAIMS×`endClaimBonus` → TOTAL, read off the
   exact fields `endingBonus` computed with; CARRIED OUT strip (relics,
   a perk found this run, territories held and world-known via a new
   `worldStats` hook); facts as a fixed 2×3 grid, LUCK dropped; NEW BEST a
   headline, else "N short of best"; RUN N printed; shop door demoted to a
   payout row; SHARE moved beside the arc; NEW RUN the only button-shaped
   control. The POP-button points leak fixed here too, picked honestly per
   the brief: tiles + the pocket's DEPTH multiplier when `hidePoints` is on,
   never the points figure the setting exists to hide.
3. **Bottom-third reclaim + camera** (`b2edce4`): footer stamp behind
   `?ff=debug.overlay` (THIS BUILD states the sha unconditionally instead —
   the no-staleness contract); colour chips folded into a `contextmenu`
   long-press on draft cards (the ONE native event a touch hold, a
   right-click AND a keyboard's context-menu key all fire — free keyboard
   parity, no hand-rolled timer); the STEER purchase stays in the purse,
   decided and documented (a priced spend belongs where every other price
   already lives); hint line cut to one clause, the signpost moved to a
   toast-on-change, odds moved to the purse toggle. Camera: FIT ⇄ HERE
   replaces four buttons with one toggle in the bottom-right thumb arc, a
   new `centerOn` on `Renderer` backs both HERE and pan-to-pocket-before-
   popping. The frontier fix: `PixiRenderer.draw()` held the fit still past
   FIT (only a resize or returning to FIT recomputes it), which is what
   stops the world sliding under a zoomed camera.
4. **Feedback tiers + words** (`478c6cb`): a new event-card dialog (held,
   centred, dismissed on tap/Escape/button) for find/shrine/territory —
   `#claimNote` returns `{ text, eventWorthy }` now, ranked exactly as
   before; cache/site stay the one-line toast. A one-beat ripen pulse
   (quieter/shorter than the pop glow, reusing its texture) on any tile
   that just became ripe. One voice: every player-facing "take"/"cash"/
   "burn" became POP/SACRIFICE, including the game's own TAGLINE.

**Adapted from the brief, decided and written down:**

- NEW BEST's "event card" treatment IS the end screen's own held, centred
  headline (item 2) — a second transient card layered on top of the very
  screen already announcing it would have been redundant chrome, not
  better feedback.
- "REACH 12 · best 18" on the LIVE stat row: not done. It would need
  world-level data threaded into a row whose test currently pins an exact
  `String(hud.depthValue)` equality, for a small win — the cost didn't
  clear the bar this pass.
- SETTINGS reorder, the theme picker moving into SETTINGS, and the gallery
  link: not done. None touch the big five and the stage was already large;
  left for a dedicated pass rather than squeezed in.

Tests: 458 → 473 (net +15: several deletions where behaviour moved —
`firstVisit`'s auto-open, the standalone colour chips, the `+`/`−` zoom
buttons, `questLine` — outnumbered by new coverage for the front door,
the payout breakdown, the camera toggle, the long-press and the event
card). No palette/art changes; engine untouched; `pnpm sim` byte-identical
to Stage 1's table at every commit.

## Stage 3 — new systems (STATUS: TODO — Sonnet, after stage 2)

Each with a written question in LOG and a harness sweep before shipping:

- **Moments pack** (all XS): NEW GROUND toast once per run when reach
  passes world.farthestReach · pocket bar "POCKET 14/20" on the priced
  pocket · first-unique explainer fires when a unique ENTERS THE HAND
  (draw or forge) · shrine receipt on next run's first frame ("the
  fourth card is yours") · territory why-line (call startingPerk: "+12
  from territories held") · end-screen "a cache still glows 6 past your
  edge" (what-still-glows) · shop door names the next rung ("STEADY
  PACE in 12").
- **Deep water**: destination reward MIX tilts with block distance
  (caches thin, sites/territories/shrines thicken) — new tuning dial(s),
  engine expression in blockDestination's kind split, swept at 40 seeds
  (seeker/bank20 must hold; no stalls; note claims curve).
- **The survey**: five world-scale goals (reach 20 · hold 4 territories
  · know 40% · wake all shrines · find all perks), each paying relics
  once per world; ledger in SETTINGS/atlas, legible from run one; facts
  not places (never name a find location). Rides WorldMemory + the
  UNLOCKS pattern.
- **TITHE**: fourth luck price — convert luck→relics mid-run at a rate
  better than death's 10% (tuning dial, e.g. 20-25%); rides the SPEND
  action; sweep that spender-style policies don't collapse; purse row
  gets the price.
- **Where-you-wake prototype**: HARNESS ONLY. Engine flag/tuning to
  start a run at a held territory hex; distance multiplier MUST measure
  from the wake hex (or prove why origin-anchored is safe); sweep
  bank20/seeker/random from far spawns vs origin — if any line beats
  origin-play by exploiting spawn distance, write the failure down and
  stop. Report the table in LOG; no UI.

## After the pipeline

Phone playtest (FOLLOWUP.md §1) · stranger test · v1.0 tag. Sound and
daily seed are designed in ideas/, unbuilt by choice.
