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

## Stage 2 — UI/UX (STATUS: DONE — `8e25a63` `091749c` `b2edce4` `478c6cb` `b50b38d`)

The audit's big five, in four commits, plus every small win named in the
brief. Full account in `LOG.md`'s 2026-08-18 addendum; the short version:

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
5. **The last four small wins** (`b50b38d`, on Marc's "finish them now"):
   REACH · best N on the LIVE stat row, threaded through `worldStats`
   (which already carried `farthestReach`) — no prior best prints plain
   REACH N. SETTINGS reordered: player things first (YOUR WORLD's atlas,
   now a `.facts-grid` in the stat row's own language, plus ABANDON), the
   two flags folded under a DEVELOPER `<details>` (the manual's own NUMBERS
   pattern, restated). The theme picker relocated into that fold, inside
   the `ui.themePicker` row's own area — `#themes` is declared once in
   `index.html` and physically reparented into `#help-meta` the moment
   SETTINGS first paints, before the first real frame. The gallery linked
   beside it, and its own "Play in X" links stopped force-appending
   `&ff=ui.themePicker` (that flag STICKS — a plain visit used to turn the
   picker on for the device permanently); a second, explicit "with the
   picker on" link carries it instead.

**Adapted from the brief, decided and written down:**

- NEW BEST's "event card" treatment IS the end screen's own held, centred
  headline (item 2) — a second transient card layered on top of the very
  screen already announcing it would have been redundant chrome, not
  better feedback.

Tests: 458 → 474 (net +16). No palette/art changes; engine untouched;
`pnpm sim` byte-identical to Stage 1's table at every commit.

## Stage 3 — new systems (STATUS: DONE — `60003a8` `9d97d91` `7f54538` `42c9ec8`)

Each with a written question in LOG and a harness sweep before shipping.
Full account in `LOG.md`'s 2026-08-18 addendum; the short version:

1. **Moments pack** (`60003a8`, all XS, zero balance change): NEW GROUND
   toast once per run when reach passes world.farthestReach · pocket bar
   "POCKET 14/20" on the priced pocket · first-unique explainer fires
   when a unique ENTERS THE HAND (draw or forge) · shrine receipt on
   next run's first frame · territory why-line (`startingPerk`, joined
   with the receipt when both fire) · end-screen what-still-glows ·
   shop door names the next rung ("STEADY PACE in 12"). 485 tests (+11).
2. **Deep water** (`9d97d91`): destination reward MIX tilts with block
   distance — caches thin toward `cacheShareFar` past
   `deepWaterRampBlocks`, site/territory/shrine thicken in their own
   near-water ratio. Positions pinned unchanged; old saves pinned
   unchanged (`deepWaterRampBlocks > 0` gates the whole cluster). Swept
   at 40 seeds, bank20/spender/seeker/rush/farm: 0 stalled/0 capped,
   medians unmoved, best-of-batch depths rose (farm 13618 → 19346). 489
   tests (+4).
3. **The survey and TITHE** (`7f54538`): five world-scale goals (reach
   20 · 4 territories · 40% known · every shrine · every perk), each
   paying relics once per world, ledger in SETTINGS' YOUR WORLD; and a
   fourth luck price, TITHE, converting the whole purse to relics at 25%
   (better than death's 10%), floored at `titheMin` so a token tithe
   cannot be a trap. 509 tests (+20).
4. **Where-you-wake prototype** (`42c9ec8`, harness only): **VERDICT —
   FAIL.** A far spawn CAN exploit spawn geometry for a free score
   advantage — not through `distanceMultiplierAt`/`harvestMultiplier`
   (both fixed, both hold), but through `tallyWorth`'s BLUE TIDE bonus
   (hardcoded true-origin distance, never threaded through the new
   `homeOf(state)`) and, more softly, deep water's and the destination
   density ramp's own block distance, both still keyed to true origin
   rather than the wake hex. bank20's median points climbed 3338 (origin)
   → 15564 (dist30) at 40 seeds; disabling blue tide alone collapsed the
   gap to ordinary seed variance. Full table and the isolating sweeps in
   LOG.md. The engine support (`newRun`'s `wakeAt`, `rules.ts`'s
   `homeOf`) stays exactly as harness-only as it arrived — unreachable
   from any UI, off by default — kept only so the negative result can be
   re-run. 515 tests (+6).

**Pipeline complete.** Stage 1 (correctness) → Stage 2 (UI/UX) → Stage 3
(new systems), one stage at a time on the same tree, as Marc green-lit on
2026-08-18. 515 tests total (was 458 before Stage 1). Every gate green at
every commit; `pnpm sim` checked and reported at each.

## After the pipeline

Phone playtest (FOLLOWUP.md §1) · stranger test · v1.0 tag. Sound and
daily seed are designed in ideas/, unbuilt by choice. Where-you-wake stays
parked as a failed prototype (see Stage 3 item 4) unless a future session
wants to take on auditing every distance-based rule for an implicit
ORIGIN — a bigger job than this one.
