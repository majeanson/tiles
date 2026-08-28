# NEXT.md — the follow-up polish, and who each item needs

Written 2026-08-27, on Marc's ask: "do all you can do without my help from
what you identified, rest will be in a follow-up polish." Everything that
could be done without him **was** done that day (`LOG.md` Session 57); this
file is the rest, sorted by who it actually needs.

The other ledgers keep their jobs: `POLISH.md` is the launch-week audit and
its open-defect list, `FOLLOWUP.md` the human questions, `PLAYTEST.md` the
phone scripts, `ROADMAP.md` the finish line, `DECISIONS.md` the rulings. This
file exists because after two days of refactoring, "what is actually left"
was spread across five files and three of them were stale.

---

## 1. The gate — Marc, and only Marc

**Session C, the stranger test.** One person who is not Marc, on their own
phone, unaided: do they finish a run and **start another**? Script in
`PLAYTEST.md`; it answers `DECISIONS.md` D4 and the v1.0 tag follows.

This is the **only** unchecked box in `ROADMAP.md`'s definition of done, and
by the 2026-08-20 ruling the only one that gates the tag. It has been the
only one since 2026-08-21. Nothing in this file may displace it.

**Owed first: one more rehearsal pass** (`PLAYTEST.md` Session A). Not
bookkeeping — 2026-08-27 changed the first minute a third time, and the
2026-08-26 re-run that passed with an empty fix list was measuring a screen
that no longer exists: the bottom is one hand and one action bar, held cards
sit in the hand, the teaching cards are marked lists, TITHE is SACRIFICE
LUCK, and the board is a fifth larger.

## 2. The phone pass on two days of unplayed work — Marc

818 tests, 27 e2e, desktop screenshots at 390×844, every commit deployed and
confirmed live — and **not one minute of it played by a human**. Per
`CLAUDE.md` that is not the gate; the deployed site on a phone in portrait is.

The four checks worth being deliberate about, in risk order:

1. **A crossing, with the app backgrounded DURING the departure fade**, then
   reopened. This is the exact shape of the 2026-08-19 infinite relic farm, on
   the platform that found it. The `dropped` latch should make it
   structurally impossible now; that claim has only ever been tested in
   happy-dom.
2. **Five theme flips mid-run**, then check the ♪ pop still sounds. Watches
   for a WebGL context refused on the fifth rebuild (iOS caps them) and for an
   AudioContext that did not get closed.
3. **A PWA swipe-back out of the daily** — History routing on a real installed
   app, not a headless browser.
4. **One ordinary run**, for the question the numbers cannot answer: does the
   bigger board and the reshaped hand actually feel better, and is a 68px card
   at a five-card hand still readable at arm's length?

`FOLLOWUP.md` §2 carries the full by-looking list this batch created.

## 3. Judgement calls that are still open — Marc

- **`FOLLOWUP.md` §2** — the eleven look-at-its, of which three were settled
  live on 2026-08-20 and the rest have never been seen, plus eight items that
  shipped after the list was written, plus the 2026-08-27 batch.
- **`FOLLOWUP.md` §3** — eight open play questions (deep water's mid-run
  shape, the survey's pull, sound's timing effect, the daily's hold, the
  crossing and BEGIN AT CAMP, hidden finds, the worn perk, the timeline's
  spine). None gate the tag; D18 explicitly rules the pop-vs-burn-vs-wait
  successor a standing v1.1 question.
- **The first-60-seconds design review** — the last of `POLISH.md`'s three
  unfinished sweeps. The other two were run on 2026-08-27; this one cannot be
  run by code, because it is a by-looking judgement. It IS Session A.
- **Render feel on a real mid-range phone.** The scaling question is answered
  — per-frame cost does not grow with the board (16.7ms at vsync, unchanged
  from an opening board, and 16.8ms under 6× CPU throttling). Whether it feels
  smooth on a weak GPU is not a thing a desktop can report.

## 4. Known and deliberately not done — no one blocked

- **`src/main.ts` has no unit tests** — largely overtaken: it is ~90 lines
  now, and its old body is `src/shell/`, of which `keeper.ts` and the pure
  `meta/route.ts` are tested. `shell/session.ts` is the large untested file
  today, and the honest fix is the one that has worked twice: extract the
  pure decision into `meta/`, leave wiring at the edge.
- **A CVD / greyscale test.** `theme.test.ts` asserts luminance separation,
  which is not deuteranopia. Every colour meaning already carries a second
  channel (names, marks, textures), so this would pin a property the game
  already has rather than find a bug.
- **A source-level test that every `min-height` under 44px appears in the
  hit-area block.** Would have caught the `<summary>` gap fixed on
  2026-08-27, in the same "assert the data" shape `theme.test.ts` uses. Worth
  it only to hold the class permanently.
- **Everything in `ROADMAP.md`'s parking lot** — Tier-1 uniques, the sound
  pass, a leaderboard, store wrappers, the waypoint-perk earn, world mood,
  ground-feeds-draft, storage compaction. Deferred by ruling; do not reopen.

## 5. The standing constraint

**The tuning freeze is gone (2026-08-27, Marc).** This section used to quote
`PLAYTEST.md`'s "nothing retunes after Session B" and treat it as the wall
every pre-tag session had to stop at. Play knocked it down: ROOTBOUND arrived
at full strength on a run's first placement, doubled a score before it had
been earned, and produced a 52k high that measured the perk rather than the
run. Shipping that to strangers to protect a schedule is a worse outcome than
moving a number, so the number moved.

What survives is the part of the freeze that was actually load-bearing: **a
retune needs evidence, not taste.** Play found it, or the harness did. That
bar is met by a phone report and by a sim run; it is not met by "this feels
high". `PLAYTEST.md`'s standing rules carry the same sentence.

And the way the pre-tag window closes has not changed: a phone pass and
Session C, not another feature.
