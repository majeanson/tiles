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

## Stage 2 — UI/UX (STATUS: TODO — next up, on Sonnet)

The audit's big five, one coherent pass, plus the small wins:

1. **Front door**: NAME + TAGLINE + BEGIN + quiet HOW TO PLAY over #app;
   the help panel becomes truly modal (cover #app, not #board); returning
   players get "RESUMED — placement N".
2. **End screen as payout**: score broken into pops + reach×40 +
   claims×60 → TOTAL; CARRIED OUT strip (relics banked, perk found,
   territories, world % known); facts as 2×3 label/value grid (drop the
   luck entry — double-counts relics); NEW BEST as headline when true,
   else "N short of best"; shop door demoted from button to payout row
   (RELICS 120 ▸); RUN N printed (book.runs exists unused); SHARE moved
   beside the arc; NEW RUN the only button-shaped thing.
3. **Bottom-third reclaim**: footer stamp only under ?ff=debug.overlay;
   colour chips folded into long-press on draft cards (spotlight + the
   steer purchase can ride the same press); hint line cut to ONE clause
   (guide only — destination signpost moves to the toast on change; the
   odds text moves to the hand/shop; kill the constant-odds clause).
4. **Camera**: cluster bottom-right in thumb arc; FIT ⇄ HERE two-state
   anchored on lastPlaced; pan-to-pocket before popping an off-screen
   target.
5. **Feedback tiers**: event card (held, centred, dismiss) for find/
   shrine/new-best/territory vs one-line receipts (bottom strip);
   one-beat ripen pulse on the hex; POP · N pockets ready count.

Small wins: sticky shop purse + BACK at top; BUY 60 labels; buy
acknowledgment (flash row, "start 22 → 27" effect lines); shelf mystery
line replaces four UNDISCOVERED rows; POP stops leaking pts (tiles +
depth instead) OR points return to header — pick one honestly;
SACRIFICE · 14 relics "for the shop"; REACH 12 · best 18; stash behind a
divider, narrower; selected-card state stronger; SETTINGS reordered
(player things first, dev flags under a fold, atlas as grid); theme
picker moves into SETTINGS; gallery linked from SETTINGS and its play
links stop force-persisting the flag; one voice: POP/SACRIFICE
everywhere (kill harvest/cash/take/burn in player-facing copy).

Tests updated alongside; no palette/art changes; engine untouched.

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
