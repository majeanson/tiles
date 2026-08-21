# POLISH.md — the two weeks around launch

Written 2026-08-20, after the Day-2 shipping run (Sessions 35–38) and a
five-front audit of the tree at `049d9cb`. This file is the **schedule and the
open-defect list**. `FOLLOWUP.md` holds the human questions, `PLAYTEST.md` the
phone scripts, `ROADMAP.md` the finish line, `DECISIONS.md` the rulings.

Read the structural fact first, because it governs everything below:

> **Launch is 2026-08-25 — five days out, not two weeks.** `DAILY_EPOCH` is
> pinned to it (`src/meta/daily.ts:22`, asserted by `src/meta/daily.test.ts`).
> So this is **five days of hardening, a tag, then nine days of reacting to
> real strangers.** Week 2 is deliberately provisional: the strangers rewrite
> it.

---

## The one thing that gates the tag

Six of the seven boxes in `ROADMAP.md:122-132` are ticked. One is not:

> `ROADMAP.md:182` — **"A stranger finished a run and chose to start
> another."** The one item no amount of code produces.

Ruled 2026-08-20 as the **sole** gate (`ROADMAP.md:186-192`, `DECISIONS.md`
D18). Nothing here may displace Session C.

**The rule that should settle every argument in week 1:** does this raise the
odds that one stranger, unaided, finishes a run and starts another? If not, it
is week 2.

---

# WEEK 1 — five days to the tag (Aug 21 → 25)

## P0 — fix before the stranger test — ✅ ALL DONE 2026-08-20

Every item in this section was fixed the evening the audit was written, in
one batch, with the balance untouched (`pnpm sim` byte-identical — none of it
reaches the economy). Kept in full rather than deleted: each one is a failure
mode that can recur, and the reasoning is the part worth keeping.

### 1. HOW TO PLAY no longer opens the tutorial — a regression from today ✅ FIXED

**Fixed 2026-08-20 in the same commit as this file** (`a495bf5`): `openHelp`
now names the tab it wants, the front door asks for `start`, the in-run `?`
keeps MENU, and an e2e test pins both halves. Left written up in full because
the failure mode — a tab bar whose first seat silently changes what a door
opens onto — will recur the next time a tab is added.

`src/ui/game.ts:1686-1695` puts the **MENU** tab first whenever `#help-menu`
has children, and `paintSettings()` runs before the `Game` is constructed
(`src/main.ts:2657` vs `:2863`) — so it always has children. A first-time
visitor tapping **HOW TO PLAY** on the front door now lands on tab 0 = MENU:
an atlas grid (`WORLD / SEED / RUNS / KNOWN / SEEN / …`), the `◇` unlock
ledger, `0 of N perks found`, and three navigation buttons. The actual
tutorial is **START**, one tap to the right.

I introduced this today (Session 36) fixing a different problem. It aims the
only tutorial door on the front door at a screen of zeroes, four days before
the stranger test.

**The general lesson, worth keeping:** the front door and the in-run panel are
two different doors that happen to share a dialog. Anything added to that
dialog has to be checked from both.

### 2. The crossing silently eats the run that reached it ✅ FIXED

`src/main.ts:881-906`. `cross()` appends the timeline tick, adds the dowry,
then `dropWorld()` and navigates — it **never calls `finish`**, so
`bankRelics(state)` (`:560-564`, `:1045`) never runs. The relics _this run_
earned, its score, and its record tick are all lost, and `dropWorld` deletes
world, run, receipt **and the world's whole shop build**.

The card offering it (`src/ui/game.ts:1452-1463`) says "This run ends at the
crossing" and "carry {dowry} relics out" — it never says the run's own
earnings do not come with you, nor that your purchases die. And it is a
**single tap**, no arming, inside a modal that appeared unrequested because a
tile touched a shrine.

**Done:** `crossing.cross` takes what the run is carrying and banks it with
the dowry, so the button now names the total that actually lands in the
purse. The card says what stays behind — including, in as many words,
everything bought in that world. And it ARMS: the event card grew an
optional armed label, the first tap is swallowed (the card's own
close-on-any-tap would otherwise dismiss the offer), and the second acts.
Pinned by the crossing test.

### 3. Two strings still promise the old economy, at the two exits that break it ✅ FIXED

Both contradict the 2026-08-20 per-world rule _at the moment a player decides
to leave a world_ — i.e. they actively mislead into losing a build:

- `src/main.ts:1535` — NEW WORLD's arm-confirm: _"…your shop and perks
  travel"_. It does not any more. (The comment at `:1520-1522` too.)
- `src/ui/game.ts:1460` — the crossing card: _"your shop and your perks
  travel"_, seconds before the shop is deleted.

Copy-only, so this stays legal after the Day-3 freeze.

**Done:** both now say that what you BOUGHT stays with the world, and that
relics and perks are what travel.

### 4. Accessibility items that are also plain mobile bugs ✅ FIXED

- **The six-stat header overflows a narrow phone.** `src/style.css:535-541`:
  flex, no `flex-wrap` outside the landscape query, no `min-width:0`. All six
  stats at `.stat-value` 1.5rem ≈ **337px on a 320px viewport**; POINTS
  reaching four digits with LUCK visible is what breaks it, and the page then
  gains a sideways pan because nothing sets `overflow-x: hidden`. Fails on
  every phone at 200% OS text. **This is the row I added POINTS to today.**
  Fix: `flex-wrap: wrap`, `.stat { min-width: 0 }`,
  `.stat-value { font-size: clamp(1rem, 5.5vw, 1.5rem) }`.
- **`user-scalable=no`** (`index.html:11-14`) — guaranteed Lighthouse a11y
  failure and a WCAG 1.4.4 fail. Its stated reasons are already covered by
  `touch-action: manipulation` on body and `touch-action: none` on `#board`.
  Delete it.
- **Stat numbers are invisible to screen readers.** `src/ui/game.ts:3708`
  sets `aria-label` to the label alone on a `role="button"`, which _overrides_
  the children — VoiceOver reads "TILES, button", never the number.
- **BEGIN drops focus to `<body>`** (`src/main.ts:2563-2570`).
- **The event card never restores focus** (`src/ui/game.ts:2546-2551`), unlike
  the manual, which does it correctly.
- **`#front-door` has `role="dialog"` with no accessible name**
  (`index.html:91`).

**Done:** `#stats` wraps with `min-width: 0` and a `clamp()` value that still
obeys OS text size; `user-scalable=no` is gone; the stat's `aria-label` names
its number as well as its label; BEGIN moves focus into the shell; the event
card remembers where focus came from and gives it back (the board is
`tabindex="-1"` so it can receive it); the front door is `aria-labelledby`
its own name. Two more from the same sweep while I was in there: `RESET ALL`
is `hidden` in the markup rather than removed by JS — the pre-JS first paint
was showing a stranger a wipe button — and `#hint`, an `aria-live` region
written on every tap, is only written when the text actually changed.

### 5. The launch-day blind spot ✅ MOSTLY FIXED — one decision left for you

**Zero telemetry, by design and by promise** — verified: nothing in `src/`
makes a network call but asset fetches. Errors are caught
(`src/main.ts:3237-3250`) into `tiles.lasterror.v1`, readable only under
SETTINGS ▸ DEVELOPER. **If a stranger's phone throws, you will never know.**

The promise ("nothing leaves your phone") is worth keeping, so the fix is not
analytics — it is making the existing report reachable by someone who is not
you.

**Done:** the failure panel already had a prominent COPY REPORT (the audit
was wrong that it lived only behind DEVELOPER). What it lacked was context a
stranger could not add themselves, so the copied report now carries the
build, the mode (own world / daily / shared seed), the repeat count and the
user-agent alongside the stack. Nothing about it identifies a player.

**Left for you — and it is a decision, not code:** the report has nowhere to
go. A stranger can copy it and has no idea who to send it to. Pick a
destination you are willing to put on the failure screen (an email, a form,
a GitHub issues link) and it is a one-line change. **Do it before Session C**
— that is the first time this code meets a phone you do not own.

## The play sessions (already scripted in `PLAYTEST.md`)

**Day 3 — Session B, then the balance freeze.** The verdict run:
pop-vs-burn-vs-wait, and the relic pace against `FOLLOWUP.md` §4 (median
13–18 a run; STEADY PACE rung 1 ≈ 2 runs; the whole shop ≈ 95–175 runs).

One number in that section is now **stale in a way only your hands can
settle**: shop levels went per-world today while the purse stayed device-wide,
so the ladder is re-bought per world and the effective sink across three
worlds is roughly triple what §4 quotes. Worse, there is **no refund
anywhere** (`grep refund src/` finds only the 2026-08-18 SECOND SLOT one-off),
so crossing or abandoning destroys up to **2,285 relics** of purchases against
13–18 a run. Either that reads as three fresh starts worth having, or the
shop reads as confiscated. **If it needs a dial, it moves Day 3 and never
after** (D10).

**Day 3–4 — the eleven look-at-its.** `FOLLOWUP.md:36-55`, all shipped, none
formally recorded as judged (though Sessions 35–38 rebuilt several off your
live reactions). Sweep the rest, one sentence each, and **reconcile the file**
— it still reads "none judged" for things judged hours later. Add the four
that shipped after the list was written and nobody has seen on glass: the
camera easing, the six-stat header in portrait, the MENU tab, and SETTLE's
slot list.

**Day 4 — Session C, the stranger test.** The gate. Answer goes to
`DECISIONS.md` D4 and `LOG.md`.

**Day 5 — tag, and the windows that close.** Irreversible once a stranger
shares a line (`DECISIONS.md:130-133`): the **points scale** (D8), the
**`DAILY_EPOCH`**, the **name and direction**. Second-guess them before Day 5
or not at all.

---

# WEEK 2 — nine days after the tag (Aug 26 → Sep 3)

Provisional. Whatever real players hit outranks all of it.

## The data-loss cluster — ✅ A–F FIXED 2026-08-20, G still open

No backend, no account, and Safari evicts non-persisted origins after 7 days.
Losing a world is the worst thing this game can do. The audit found six ways
it could happen; all six are closed. **G — export/import — is the one that
matters most and is still open**, because it is the only item on this list
that makes the others _survivable_ rather than merely less likely.

**A. Quota rung 2 corrupts the replacement world.** ✅ FIXED — `src/main.ts:945` sheds
`keys.world` but leaves `keys.run`. Next boot mints a fresh random world, then
resumes the old run — whose `rootSeed` no longer matches. `onChange`'s merge
has **no seed guard** (`:969-982`), so `mergeRun` unions a foreign geography
into the new world's `revealed`/`territories`, and `finish`'s `rememberRun`
commits it. Fog memory showing ground that was never there.
_Fix:_ shed run/receipt/shop with the world, and guard `mergeRun`/
`rememberRun` on `state.rootSeed === current.worldSeed`.

**B. The shed ladder is ordered wrong and its note is dishonest.** ✅ FIXED —
(`:943-946`, `:3048-3061`.) It deletes the diary in full, then **the world you
are standing in**, while the _other two slots'_ worlds — the same unbounded
`revealed` arrays — are never touched, and `tiles.lasterror.v1` isn't either.
Both rungs print the same "some history was cleared". Rung 2 is not history.
It is also thrash: `current` is still in memory and `flushWorld` writes it
straight back. _Ordered fix:_ lasterror → inactive slots' receipt/shop → trim
the timeline rather than delete it → inactive slots' worlds, named → **never**
the active world; stop autosaving and say so honestly instead. One distinct
sentence per rung.

**C. `decodeWorld` is all-or-nothing and overwrites the evidence.** ✅ FIXED —
(`src/meta/world.ts:132`, `src/main.ts:625-630`.) One bad element in
`revealed` returns `null`, and boot mints a new world _over the old blob on
the same tick_ — which is exactly the shape of a truncated write from an iOS
kill. Contrast `decodeTimeline`, which refuses per entry. _Fix:_ filter
element-wise; on hard failure copy the raw string aside before replacing it.

**D. `decodeProgress` wipes relics and found perks on any bad field.** ✅ FIXED —
(`src/meta/progress.ts:379-389.`) Salvage field-by-field instead.

**E. Front-door SETTLE leaks the old slot's keys** ✅ FIXED — (`src/main.ts:2088`) where
the end-screen path (`:2836-2848`) wipes them properly — feeding the same
foreign-merge corruption as (A). One shared helper for both.

**F. `persist()` is asked too late and too narrowly** ✅ FIXED — (`:738-749`, `:927-928`):
only from the home `onChange` after a successful run save, so a daily-only
visitor never asks, and neither does someone who boots and closes the tab. On
Safari the install nudge _is_ the persistence mechanism, yet it lives only on
the end screen, once ever, and burns its marker whether or not it was read
(`src/ui/game.ts:3070`). _Fix:_ ask at boot right after `loadWorld`; don't
burn the nudge until it has survived one interaction.

**What A–F came to, in one paragraph.** The shed ladder is four rungs now and
never touches the world being played: a diagnostic record, then other slots'
receipts, then the diary, then other slots' worlds — each rung saying its own
sentence out loud in a `role="status"` region, because "some history was
cleared" was a fair description of the diary and a lie about a world. Both
merges are seed-guarded, so a run can only ever fold into the world it was
played on whatever else goes wrong. `decodeWorld` and `decodeProgress`
salvage field-by-field instead of returning null — which mattered because the
shell's answer to null is to mint a fresh world _over_ the old blob on the
same tick, so refusing a damaged world was deleting it. Both SETTLE doors go
through one `settleSlot` helper that takes the old slot's whole footprint.
And `persist()` is asked at boot, right after `loadWorld`, rather than after
a home run's first successful save — a daily-only player never reached the
old call at all.

**G. The one thing missing entirely: export/import.** With no backend, 7-day
eviction, and in-app browsers that discard storage wholesale, a single
**EXPORT MY WORLDS** button — one JSON blob of every `tiles.*` key through the
`navigator.share` ladder already built at `src/main.ts:1206-1243` — is smaller
than most fixes above and is the only one that makes the others _survivable_.
Strong candidate to pull into week 1.

## Accessibility, second pass

`6` no focus trap and **nothing is ever made `inert`** (the word appears once
in the codebase, only to clear it) — four surfaces claim `aria-modal` without
one; the fame panel over the front door leaves BEGIN and RESET ALL tabbable.
`7` `#hint` re-announces on every render (`src/ui/game.ts:2815`). `9` settings
toggles announce as "ON, toggle button". `11` three notes set `role="status"`
on detached nodes, which AT misses; `#storage-note` has no role at all. `12`
`.stat::after { inset: -8px }` against a 12px gap overlaps adjacent targets.
Also: `#camera-toggle` reads "HERE" but its accessible name is a sentence
(WCAG 2.5.3), and no greyscale/CVD test exists — `theme.test.ts` asserts
luminance, which is not deuteranopia.

**Verified good, so nobody re-audits it:** every colour meaning has a second
channel (terrain names, baked per-colour textures, patterned native fields,
inked MAGIC/UNIQUE words); contrast passes on torchlit; type is entirely
rem-based (zero `px` font sizes); safe areas handled throughout; rotation
re-fits properly; and **reduced motion has no escapes** — every animation sits
inside `no-preference` and the renderer branches on it (one caveat: sampled
once at boot, `src/main.ts:2660`, with no `change` listener).

## The stranger's actual path — smaller findings

- **`RESET ALL` is painted in the pre-JS first paint.** No `hidden` in the
  markup (`index.html:128`); JS removes it (`src/main.ts:1977-1986`). On a
  slow first load a stranger's first screen shows a red RESET ALL.
- **TITHE converts the entire purse on one tap** (`src/ui/view.ts:873-881`)
  at 15%, explained only by a `title` attribute — invisible on a phone. Its
  card fires only on a deliberate purse open and **never on a detour**, so a
  daily-first player meets it cold.
- **No onward-share invitation.** The recipient of a `?seed=` link gets the
  same SHARE button and the chain propagates, but nothing anywhere invites
  them to pass it on. This is the only distribution mechanism the game has.
- **The OG image shows no gameplay** (`public/og-image.png`) — a handsome
  brand card where the scroll-past hook could be a board: fog, a lit pocket,
  beacons in the dark. Most-seen image the project has.

## Structural debt

**`src/main.ts` has no unit tests.** ~2,800 lines holding every storage
helper, the slot system, the daily-run wiring, the shop split, SETTLE's
overwrite and the quota ladder — covered only by 8 e2e tests. Every finding in
the data-loss cluster lives there. The fix is not "test main.ts": it is to
keep doing what today did twice — **extract the pure decision into `meta/`
and leave only wiring at the edge**. `decodeDailyRun`/`dailyRunFor` is the
worked example; the shop-inherit rule, the settle footprint and the shed
ladder are the next three.

**Nothing visual is tested, and the project says so** (`STATUS.md:454-457`).
Tolerable when one person saw every build; less so with strangers playing and
a camera that now animates. A handful of Playwright screenshot assertions —
not pixel diffing, just "the board rendered something" — is the cheap floor.

**`shareCard.test.ts` has 2 tests** for the artifact carrying the entire
distribution mechanism.

## Documentation debt (this repo runs on its documents)

- **`STATUS.md` is four sessions stale** — says 607 tests and names the Day-4
  gate; the tree is 615 tests, 8 e2e, plus `shrinesReborn`, per-world shop
  levels, camera tweens, the MENU tab, end-screen SETTLE. `CLAUDE.md` tells
  every future session to read it first. **Checkpoint before the tag.**
- `FOLLOWUP.md` / `PLAYTEST.md` still schedule a rehearsal that happened.
- `ideas/persistent-world.md:20` calls multiple worlds "deferred"; shipped
  2026-08-19 (D14).
- `ROADMAP.md:139` is headed "Where this stands, 2026-08-15" over a
  2026-08-20 body.
- `prompt.md` is a fully-answered Session-2/3/4 artifact, still at root.
- `DESIGN.md:152` still carries a bounded-map run length ("6–8 in 15–25
  minutes"); the endless run is ~8 min at run one, 15–20 maxed.

## Deferred by ruling — do not reopen

`ROADMAP.md:196-241`: Tier-1 uniques, the sound pass, a leaderboard (needs a
backend, D13), store wrappers, the waypoint-perk earn, world mood,
ground-feeds-draft, storage compaction, the timeline's spine-vs-✦ question,
and pop-vs-burn-vs-wait (D18 — answered over weeks of play, not before a tag).

---

## What was verified as already fine

- **Launch surfaces are done.** canonical, full og:*, twitter card, 1200×630
  image, robots.txt, manifest (id/scope/lang/categories/portrait/maskable).
  All live.
- **The service worker is correct on prod** — cache name carries the build
  (`ashwake-049d9cbec9ef`), 27 assets precached, network-first navigations
  with a 2.5s timer, update check on foreground and every 15 min.
- **Deploy is honest and fast** — CI gates prod, `verify-deploy` proves the
  live site serves the exact commit, push-to-live ≈ 4 minutes.
- **Storage will not overflow from normal play** — revealed-hex growth
  dominates and is small: reach 20 ≈ 11KB, reach 40 ≈ 43KB per world, three
  worlds ≈ 130KB against a multi-MB budget. The quota ladder is a safety net,
  not a thing you will hit — which is _why_ its bugs are week-2 and not week-1.
- **The icon reads at size.**
- **Starting a daily and backing out costs no try** — `recordDaily` runs only
  inside `finish`, and the front door refuses to call an untouched board a
  resume.

## Coverage gap in this audit

Three of eight sweeps died on a session limit before reporting: **cut corners
in the source** (TODO/FIXME, swallowed catches, drifted duplicate logic,
balance numbers outside `src/content/`), **render performance and the new
per-frame camera draw**, and **the first-60-seconds design review**. The
performance one matters most — the camera tween added today calls `draw()`
per frame while zooming, and nobody has measured that on a mid-range phone.
**Re-run those three before treating this list as complete.**

---

# STILL OPEN — the list as it stands 2026-08-21

Everything above this line is done. These are what is left, in the order I
would take them.

## Two decisions only Marc can make

**1. The second shrine grants nothing.** `src/meta/world.ts:95` promises
"A second stash slot" and `applyUnlocks` delivers `holdSlots: 2` — but
`GameState.held` is `readonly held: Tile | null`, a single tile, and every
reader tests `holdSlots > 0` as a boolean (`reduce.ts:423`, `rules.ts:475`,
`view.ts:782`). The manual even contradicts the shrine in words: "The dashed
HOLD card keeps one tile for later."

This is the SECOND of five rungs, so nearly every returning player walks to
it and receives nothing. It is the same shape as the 'treasure payout' entry
retired on 2026-08-18 for exactly this reason. Three ways out, and the choice
is a design one:

- **Relabel the rung** to something `holdSlots + 1` actually does — but it
  does nothing at all, so this means finding it a different gift.
- **Implement the second slot** — a real engine change (`held` becomes a
  list) four days from launch. Against it: CLAUDE.md's every-system-behind-a
  -dial rule, and the size.
- **Retire the rung and shift the ledger down**, the precedent the file
  already set once, with the same one-time generosity.

**2. The first pop can score literally zero.** `scored = floor(points ×
0.35)`, so a first pocket of worth 2 at ×1 depth banks 0 — and the FIRST POP
card celebrates "+0 pts" after six tiles were spent to build it. Reads as a
punished action at the exact moment the loop is being taught. Either
`pointsPerPop` moves (a dial, and **the freeze is after Session B**), or the
display never prints a 0 for a scoring pop. I did not touch it: it is a
balance number, and those are yours.

## The camp cluster — one afternoon, post-launch unless camp gets played

`?camp=1` is reachable once the camp shrine is woken, and five places still
measure from world origin instead of `homeOf(state)`:

- `cachePaysAt`'s own docblock says it exists so "the payment, the claim
  announcement and the tap description can never disagree" — and all three UI
  callers drop the origin argument (`game.ts:1440`, `game.ts:1588`,
  `view.ts:1084`). With `cachePaysPerRing: 4` the announced tiles are off by
  4 per ring of camp offset. The SITE line fifteen lines away does it right.
- `view.ts:1062` `nearestUnclaimed` and `view.ts:1116` `whatGlows` mix
  origin-based distance with home-based reach.
- `view.ts:457` KEEN NOSE scans from origin while `beaconsFor` compensates —
  at ring 15 with reach 5, no shimmer draws at all.
- `meta/goals.ts:25` (`reach20`) and `meta/timeline.ts:271` compute reach
  from ORIGIN, so a camp start at ring 15 pays the reach-20 relic for
  standing still. `game.ts:2518` guards for this; these two do not.

## Copy that disagrees with the shipped rules

- `game.ts:2793` teaches "a WALL cannot be built on" with no WALLBREAKER
  branch, where two other sites branch correctly.
- `game.ts:1927` says stone/walls/edge "none of them match" — false under
  the shipped `redAshMatches`; the same sentence at `game.ts:1991` is right.
- The manual promises TREASURE that `treasureFor` refuses while OPEN HAND is
  worn (`game.ts:1968` gates on `treasureNeed`, `rules.ts:475` also needs a
  stash).
- "NEW BEST" is computed from device-wide records in one place
  (`main.ts:1287`) and per-world memory in another (`timeline.ts:270`) —
  they diverge for anyone with a second slot or a crossing.
- THE SURVEY renders `w.goalsMet` directly instead of `metGoalIds`, which
  `goals.ts:12` says exists precisely so the panel and the tests share one
  question. It has zero non-test callers.

## Structural, post-launch

- **`src/main.ts` has no unit tests** (~3,500 lines, every storage helper).
  Keep extracting the pure decision into `meta/` — `backup.ts` and
  `dailyRunFor` are the worked examples.
- **Nothing visual is tested** (`STATUS.md:454-457`). A few Playwright
  screenshot assertions — not pixel diffing, just "the board drew something".
- **`shareCard.test.ts` has 2 tests** for the whole distribution mechanism.
- **The OG image shows no gameplay** — the most-seen image the project has.
- **`fx.pop.png` is 47KB** and an audit called it a redundant radial
  gradient. It is not: it has rays and speckles the procedural fallback does
  not draw. Deleting it is an art call, not a free win — left alone.

## Documentation debt — do the first one before the tag

- **`STATUS.md` is now six sessions stale.** It says 607 tests; the tree is 630. `CLAUDE.md` tells every future session to read it FIRST.
- `FOLLOWUP.md` / `PLAYTEST.md` still schedule the rehearsal that happened.
- `ideas/persistent-world.md:20` calls multiple worlds "deferred" (shipped
  2026-08-19). `ROADMAP.md:139` is headed 2026-08-15 over a 2026-08-20 body.
- `DESIGN.md:152` carries a bounded-map run length; the endless run is ~8
  minutes at run one.
- `prompt.md` is a fully-answered Session-2/3/4 artifact still at root.
