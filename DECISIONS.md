# Decisions waiting for you — now an answered ledger

Written 2026-08-15 as an open question list; by launch week every item but
one had been answered, and the file had not been told. Corrected wholesale
2026-08-20 (the launch deep-clean): each entry keeps its question and now
states its answer, with the date and where the evidence lives.

**Three open, none gating v1.0 (amended three times on 2026-08-28).** D4 gated
the tag until Marc ruled otherwise (D24): v1.0 is tagged WITHOUT the stranger
test, and D4 becomes v2.0's gate. It is still OPEN and still unattempted —
moved, not answered, and **since D25 it is answered on Ashwake 2, in
`../ashwake`, not here.** D22 (telemetry, and what the privacy line costs) and
D23 (the first-run acknowledgement) were opened on 2026-08-28 and are both
post-tag by construction — D22 needs a backend D13 rules out for 1.0, and D23
is deliberately sequenced after Session C so that it cannot contaminate the
measurement it would otherwise help. Neither may displace D4. **This repo is
frozen at v1.0.0 (D25); new rulings about the game go in
`../ashwake/DECISIONS.md`.**

---

## A. Was blocked on play — play happened (two debriefs, 2026-08-15 and 2026-08-19)

### D1 — Gate B's verdict — RESOLVED: the gate is RETIRED (2026-08-18)

It failed twice in human hands (>70% tiles both times, for opposite
reasons), and its own written fallback — one automatic payout — shipped
2026-08-16 as `singlePayout`. The successor question ("is
pop-vs-burn-vs-wait a real timing decision?") is HALF-ANSWERED
(2026-08-19: luck spent in play, TITHE taken deliberately — the
advantages ARE bought); whether it reads as a real TIMING decision is
still Marc's to feel. `LOG.md` 2026-08-18, `FOLLOWUP.md` §1.

### D2 — The boring stretch — ANSWERED (a): gone (2026-08-19)

The second debrief's two runs (11k and 4k) were long and fun, the longer
one BECAUSE of the tile caches. The 2026-08-18 rebalance plus
destinations, bounties and deep water were the fix. `LOG.md` Session 26.

### D3 — Run 2 vs run 1 — ANSWERED (a): P4a stands (2026-08-19)

The remembered world made runs richer, not duller — caches confirmed as
lifelines in human hands, territories worth holding. Nobody has asked to
unwind the machinery. `LOG.md` Session 26.

### D4 — The stranger test — **OPEN. v2.0's gate since D24 (2026-08-28); it gated v1.0 until then.**

Someone who is not Marc, on their own phone, unaided: do they finish a
run and start another? (a) tags v1.0; (b) names the next milestone.
Marc's own RESET TEACHING pass is the rehearsal (`FOLLOWUP.md` §1).

---

## B. Identity — all three ANSWERED by keeping

### D5 — The name — (a) ASHWAKE (2026-08-15, standing since)

One constant in `src/meta/identity.ts` if ever overruled.

### D6 — The art direction — (a) torchlit, then (d) too (2026-08-15/19)

Torchlit chosen at Gate E; the real-art half happened 2026-08-19 — eight
terrain/fx slots baked by `scripts/terrain.ts`, and cold-survey and
rot-bloom DELETED with a written goodbye (WORKPLAN Stage 1). There is
nothing left to compare against; reversal is still one line.

### D7 — The colour names — (a) MOSS · EMBER · ASH · TIDE (2026-08-15)

Each names its power; taught at first placement since the teaching pack.

---

## C. Economy — all three ANSWERED

### D8 — The points scale — (a) keep it (RULED 2026-08-20)

Big numbers stay. Still one constant to divide — but the reversal window
closes the day strangers post daily scores, so this graduated from
"one-line reversible" to "decided" at launch. `FOLLOWUP.md` §4.

### D9 — Run length — SUPERSEDED by the rebalance (2026-08-18)

The fixed 260-placement clock this question priced no longer exists: the
endless economy's cost curve (lean start, STEADY PACE buying the gentler
curve back) is the run-length dial now, and the debrief called its
lengths fun. A player-picked length was never built — the game chose.

### D10 — Difficulty — ANSWERED (a): right (2026-08-19)

The rebalance verdict was positive; the lean start did not read as
punishing.

This entry used to close "do not retune a working economy days before
launch". **Amended 2026-08-27**: the ruling on DIFFICULTY stands and is not
reopened — what is withdrawn is the blanket sentence after it, which by then
was being read as a freeze on every number in the game rather than as a
finding about this one. A perk that doubled a score on a run's first
placement was not a working economy, and the rule as written would have
shipped it. The replacement is in `PLAYTEST.md`: a retune needs evidence.

---

## D. Scope — all four ANSWERED

### D11 — The bounded game — (a) DELETED (2026-08-16)

One economy for everybody; a shared seed opens the sender's game.

### D12 — Sound — (b), built (2026-08-19), shipped OFF with a door (2026-08-20)

The minimal pass exists exactly as recommended — the pop, the claim,
running dry (`ideas/sound.md`, `src/ui/audio.ts`). The silent 1.0 stands
as the default; the ♪ board-chrome toggle is the way in.

### D13 — A leaderboard — (a) for now, with the door left open

No backend at 1.0. The timeline's storage (2026-08-20) was deliberately
shaped as self-describing dated events a future backend could ingest
unchanged — (b), per-seed, remains the interesting successor.

### D14 — Multiple / shareable worlds — (b) AND (c), both shipped (2026-08-19)

Three world slots per device, and SETTLE THIS WORLD keeps a shared
seed's geography as one of yours — `?seed=` links double as world codes.

---

## E. Process — answered by twenty sessions of practice

### D15 — What the next session is — (a) then whatever Marc's prompts say

The standing rhythm: his play reports and option-set answers steer;
`FOLLOWUP.md` carries what waits on him.

### D16 — Autonomy — (a) for building, (c) for what the game IS

Exactly as recommended, and how every session since has run: long
autonomous stretches, with Marc's forks put to him as option sets
(the memory of this preference is now explicit).

---

## F. Launch-week rulings (2026-08-20, Day 1 — prompted, answered, shipped same day)

### D17 — The daily's #1 — launch day

`DAILY_EPOCH` moved to 2026-08-25 (the planned tag day): the first daily
strangers ever see and share is #1. Rehearsal-week dailies stay playable
(`DAILY_FIRST`) and print their DATE instead of a #0. If the launch day
moves, the epoch moves WITH the tag commit — and never after a stranger
has shared a line.

### D18 — What gates the tag — the stranger test alone — **SUPERSEDED by D24 (2026-08-28)**

True of v1.0 until Marc tagged without it; the sentence below now describes
v2.0's gate rather than v1.0's.

Gate B's successor question (pop-vs-burn-vs-wait timing) is a standing
v1.1 question, answered over weeks of real play. ROADMAP and FOLLOWUP
used to disagree with this file about it; the ruling reconciled them.

### D19 — Reborn ground pays no relics

Spent shrines and finds re-arm each run as caches/sites (Marc's Day-1
feature) — they pay their tiles and points, never the claim relic, so
the 2026-08-20 relic tightening stays intact and relics stay about
ground never reached before.

---

## G. Past the planned day (2026-08-26 — prompted as option sets, answered)

### D20 — The tag slipped its day; the epoch does not move

2026-08-25 passed untagged — the stranger test, the one gate, has not run.
Ruled: `DAILY_EPOCH` stays 2026-08-25. Dailies #1 and #2 have already
fired, and D17's own closing clause — "never after a stranger has shared a
line" — was written for exactly this. v1.0 tags whenever Session C passes,
on whatever date that is; nothing renumbers.

**Half superseded by D24 (2026-08-28):** v1.0 tagged WITHOUT Session C. The
part that still holds is the part that mattered — the tag is dateless, the
epoch stays 2026-08-25, and nothing renumbers.

### D21 — The OG image is the board, not the brand

For a game whose only distribution is people sharing links, the unfurl IS
the storefront, and the brand card showed no gameplay. Ruled: a board
scene — a torchlit pocket of real tiles, fogged memory trailing off,
beacons in the dark — with no mark on it; the name travels in `og:title`
directly under the image. Baked by `scripts/social.ts` from the same
terrain art the live board serves, deterministic like every other bake.
The same sitting kept the onward-share line (one quiet end-screen
sentence for a run that arrived by `?seed=`, shipped in Session 44).

### D22 — Telemetry, and what the privacy line costs — OPEN, post-1.0

Marc, 2026-08-28: "id like to be able to gather game data to balance things out
once people play." Recorded as OPEN rather than ruled, because it is a promise
question before it is an engineering one.

The promise exists and is on screen, in SETTINGS, in words a player reads:
**"Nothing leaves your phone: no account, no analytics, no server."** So there
are only two honest options, and picking one is Marc's:

- **(a) Keep the line, take no analytics.** Balance stays answered by the sim
  harness and by the runs players choose to send by hand.
- **(b) Amend the line in the same commit that adds collection**, and make the
  collection consent-first the way `meta/report.ts` already is: a report leaves
  the device only when a human taps SEND REPORT, nothing at boot or on a timer,
  and SETTINGS says so.

There is no third option where the line stays and data flows. This project has
already made that mistake once: a fonts.googleapis.com link carried every
player's IP to Google while the README claimed otherwise, until the fonts were
self-hosted on 2026-08-20.

Two facts that make (b) cheap when it is chosen. D13's own note records that
the timeline was "deliberately shaped as self-describing dated events a future
backend could ingest unchanged" — the data model was built for this. And the
right payload is the TIMELINE, not the world blobs: it is the part that answers
balance questions and the part that carries no map.

What (b) still needs is a backend, which D13 rules out for 1.0 and explicitly
leaves the door open for after. So: post-tag either way.

### D23 — The first-run acknowledgement — OPEN, sequenced after Session C

Marc, 2026-08-28: "could we have a congratulations you played your first game
(either first world or daily) then based on this we unlock new features?"

Not ruled on content. Ruled on TIMING, and the reason is worth keeping: the
v1.0 gate is "did they finish a run AND start another", and this feature is a
mechanism for converting the first half into the second. Shipping it before
Session C means a stranger who starts a second run tells us nothing — the game
and the confetti cannot be separated — and Session A's clean pass of 2026-08-28
would no longer cover the build they met. **A stranger is a one-shot resource;
they meet the game for the first time exactly once.**

The recommendation on content, for when it is ruled: probably not a third
unlock axis. `CLAUDE.md` already says "run one is the smallest game there is;
depth arrives by unlock", and run one already opens the shop door and mints
relics. What is missing is the ACKNOWLEDGEMENT, not the unlock — an end-screen
beat on the first finished run that names what just opened. See `ROADMAP.md`'s
parking lot.

### D24 — v1.0 tags without the stranger; Session C becomes v2.0's gate

Marc, 2026-08-28: **"tag now, v 2.0 will be session C with our refactor."**

This overturns his own 2026-08-20 ruling (D18, and `ROADMAP.md`'s "tagging
without the stranger would be the first cut corner in twenty sessions"), and it
is his to overturn — he set that bar and he is entitled to move it. Recorded in
full because a reversal that is not written down reads later as an oversight.

**What changed is the meaning of the number, not the state of the game.** The
old plan made v1.0 mean "validated by someone who is not Marc". The new plan
makes v1.0 mean "everything code can produce is produced and verified, and
Marc has played it" — which is true today, on evidence — and moves the stranger
to v2.0 alongside the React work. That is a legitimate versioning philosophy
rather than a corner cut for schedule: nothing is being called done that is not
done.

**So the definition of done was rewritten rather than scored 6/7.**
`ROADMAP.md` now says what v1.0 actually asserts and, explicitly, what it does
not: no stranger has played this. **D4 stays OPEN.** `PLAYTEST.md` Session C
stays exactly as written, now as v2.0's gate. Neither is marked done, and the
checklist entry carries `[→]` rather than `[x]` so nobody reading it later
mistakes a move for a pass.

**What the tag does not move.** D20 already ruled the tag dateless and the
daily epoch fixed — `DAILY_EPOCH` stays 2026-08-25, nothing renumbers, and that
holds whichever day the tag lands on. D8's reversal window on the points scale
was never keyed to the tag either; it closes when strangers post daily scores,
and the game has been publicly deployed since launch week regardless.

**The one risk, stated so it is not a surprise later.** A tag is a promise to
whoever finds it that this is the version to start from. Nobody outside this
repository has played it. If Session C then finds something that changes the
first minute, v1.1 will be a real release rather than a polish pass — which is
fine, and is the cost of tagging first, and is worth naming now rather than
discovering it in a changelog.

### D25 — v2.0 is a second body in a second repo; this one is frozen

Marc, 2026-08-28, planning v2.0 from `ideas/v2-react.md`'s brief: **"I'm not
locked to React, I just want a nice game"** · "my only requirement is web app,
game oriented, maybe even some 3D or game engine library" · **"the game was fun,
I want to replicate it in a new repo with the same rules and different
visuals"** · "extract concepts, unify components, DRY — but logic and
similarities stay."

Five rulings, each put to him as an option set and answered:

1. **Body: a 3D board in Three.js + React Three Fiber, chrome in React 19.**
   Godot/Unity web exports rejected (20–40MB loads, iOS threading limits, the
   TypeScript rules would have to be rewritten); Phaser rejected (2D, fights
   DOM chrome); Babylon.js judged viable but heavier than a hex board needs.
2. **Repo: a new pnpm monorepo, `../ashwake` (`majeanson/ashwake`) —
   `packages/core` + `apps/game`.** The core is this repo's DOM-free half
   lifted verbatim (646 tests) with `pnpm sim` byte-identical to `42d4da3`,
   diffed by its CI on every push. **This repo is frozen at v1.0.0**: the
   deployed game, the fallback, ledger commits only.
3. **The stranger is held for v2.** Session C, never run, is spent on the new
   body. D4 stays OPEN and is Ashwake 2's gate.
4. **The clean pass comes before the stranger** — it is the port.
5. **No React in this chrome**, and the argument is in `ideas/v2-react.md`'s
   resolution: `resetShell()`'s list is "every id the markup declares
   `hidden`", a one-line snapshot in vanilla, and it already misses three ids.

The playtest console lives in the new app as a `/playtest` route with COPY
SHEET; live sync was deliberately not built (the no-coaching rule leaves nothing
to act on mid-run). Deploy: `ashwake.marcportal.com` during the build;
tiles.marcportal.com cuts over at the v2.0 tag. The v1 → v2 bridge for a
player's worlds is BACK UP MY WORLDS → RESTORE A BACKUP; the daily epoch does
not move (D20).
