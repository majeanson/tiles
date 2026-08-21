# ROADMAP.md — the road to 1.0, with no corners cut

Set 2026-08-15 with Marc, on his ask: "what are all the next steps for full
idea completion? set a goal so it's thoroughly done." This file is the goal.
`STATUS.md` says where we are; this says where DONE is. A milestone is not
complete until its **Done means** list is true with evidence in `LOG.md` —
the same contract as the gates, because it is the same idea.

**What 1.0 is (Marc's calls, 2026-08-15):** a **public web release** — a
real game with a real name at its own URL, installable on a phone (PWA,
plays offline), polished enough for a stranger. **Silent** (audio is
post-1.0). Social is **share links + a share-your-wins end screen** — no
backend, no accounts.

## The standing contract (applies to every milestone)

Every feature, always: gated (flag or tuning, off where it isn't the game),
one written question before building, swept by the harness before shipping,
tested, recorded in `LOG.md`, and verified on the deployed site on a phone.
Anything that fails its question is **deleted with a written reason** — a
kept corpse is a cut corner. The no-staleness surfaces (manual, THIS BUILD,
SETTINGS, colour tips) must cover every live system at all times.

---

## M1 — The choice is real, and the run has an arc (Gates B + D)

The two open design gates. Gate B is failing in human hands (Marc takes
tiles >70%: points feel worthless early and never safe); the mid-run boring
stretch is the same problem wearing a different hat.

- Instrument the human: the run log already records every harvest's choice —
  surface the tiles/points ratio on the end screen and count it across
  saved runs, so Gate B's "20 logged pops" is measured, not recalled.
- **Quests at landmarks** (the queued candidate): mid-run goals with real
  payoffs — the boring stretch's answer and an early taste of points.
- Audit the guide line (does "low on tiles" cry wolf?) and the early points
  economy (small pocket pts vs their felt cost); sweep any change.
- Re-debrief Marc; judge Gate D from the arc stats his end screens now show.

**Done means:** Gate B row reads PASSED with logged-pop evidence · Gate D
row reads PASSED (biggest number near the end, across real runs) · the
boring stretch has a shipped answer or a written rejection · all pins green.
_Estimate: 2–3 sessions._

## M2 — The remembered world (P4a)

Per `ideas/persistent-world.md`, already planned in full: fixed world seed,
fog memory drawn from stored keys, territories persist claimed with fields
active, caches/sites re-arm, Abandon World in settings, atlas line in THIS
BUILD.

**Done means:** P4a's question answered by Marc (run two is MORE interesting
than run one) · memory survives reload and respects Abandon · storage stays
within budget · engine purity untouched (memory is data in) · tests and
ledger. _Estimate: 1–2 sessions._

## M3 — The roguelite spine (P4b + an honest registry)

- Territory starting-perks (numbers in content, swept at run-N starts,
  capped) — the structural Gate B support Marc asked for.
- `pop.treasure`, declared since Session 0, gets **wired or deleted** — 1.0
  ships zero unwired flags; NOT BUILT is a plan, not a residence.
- Rarity/luck felt-check with Marc: do magic draws land as events?

**Done means:** perks shipped and swept without breaking the clock or the
cliff · Gate B re-verified still passing WITH perks · the feature registry
contains only wired flags · ledger. _Estimate: 1–2 sessions._

## M4 — Places and things (P4c + the content queue, then Gate F)

Places-as-features (unlocks you can see in the fog), the atlas screen, then
the queue — each behind its gate with its question, each kept or killed:
hidden finds · hazards · tile quirks · scout tiles · perk tiles · pattern
shapes. Content becomes tables (Gate F's subject): cheap to write, priced
by the harness.

**Done means:** every queued idea is shipped-and-kept or rejected-in-writing
· unlock progression plays from a fresh device to full depth · Gate F row
reads PASSED · the manual grew with every kept system. _Estimate: 3–5
sessions._

## M5 — Identity (Gate E opens)

A–D signed means the freeze lifts. Decisions made by LOOKING, on the phone,
in daylight, via the gallery that has been waiting since Session 2:

- Choose the art direction (or commission the placeholder's successor);
  facing, motion pass, the pop as the chosen direction wants it.
- **A real name.** "tiles" is a variable name, not a title. Name, icon,
  title treatment on the end/start surfaces, theme-colour, social preview.
- Real art into the slots that have been declared empty on purpose; losing
  directions deleted from the bundle with a written goodbye.

**Done means:** Gate E row reads PASSED with the chosen direction as
default · the name exists everywhere the game says its own name · no empty
slot the direction wanted filled · greyscale and wall-clearance tests still
green under the final palette. _Estimate: 2–3 sessions._

## M6 — Shipped to strangers (1.0)

- **PWA**: manifest, icons, service worker — installs to the home screen
  and plays offline (the game has been client-only since day one).
- **First-run onboarding**: a stranger's first minute, decided and tested —
  the manual exists; the question is what greets run one.
- **Share your wins**: the end screen gets a share action (Web Share API —
  score, reach, and a `?seed=` link so "beat my run" is one tap); the
  screen itself made screenshot-worthy.
- Performance pass on a weak phone at big-board sizes; error resilience (a
  crash must never eat the save); accessibility sweep (targets, contrast,
  reduced-motion audit); a zero-tracking privacy note; README for humans.
- The **stranger test**: at least one person who is not Marc, on their own
  phone, unaided — finishes a run and starts another. Evidence in LOG.
- Decide the bounded game's fate (kept flag or deleted); tag **v1.0**.

**Done means:** installable, offline, shareable · stranger test passed ·
every checklist above checked · `verify-deploy` green on the tag.
_Estimate: 2–3 sessions._

---

## The 1.0 definition of done (the whole goal, checkable)

- [ ] All six gates read PASSED in `LOG.md`, each with evidence.
- [ ] Zero unwired feature flags; every system on the board is in the
      manual, the settings, and the tests.
- [ ] Every `ideas/` file resolved: built-and-kept, or closed with reasons.
- [ ] `DESIGN.md` claims are all human-verified, not just harness-verified.
- [ ] The game has a name, an icon, an art direction, and installs offline.
- [ ] A stranger finished a run and chose to start another.
- [ ] Post-1.0 parking lot recorded (sound pass · leaderboard · store
      wrappers · shareable/multiple worlds · whatever M1–M6 taught us).

Sessions estimated honestly: **11–18 from here.** The estimates are the only
soft numbers in this file; the checkboxes are not.

---

## Where this stands, 2026-08-21

M1–M6 are built, verified and deployed. What the checklist actually says now:

- [x] **All six gates** — A passed (S10), C passed (S1), D passed (S11),
      F passed (S14). **E: PASSED (stamped 2026-08-20, the launch
      deep-clean)** — it read "opened" since S15 while every condition in
      M5's own "Done means" quietly came true: torchlit is the default
      (asserted by test), the losing directions are DELETED with a written
      goodbye (2026-08-19), the direction's art slots are baked and served
      (`scripts/terrain.ts`, verified live by `verify-deploy`), the name is
      everywhere the game says its own name, and greyscale/wall-clearance
      tests are green under the final palette. Marc's 2026-08-19
      correction in `FOLLOWUP.md` §4 — "there is nothing left to compare
      against" — is the human half of the evidence. **B is RETIRED
      (2026-08-18, Marc's call)**: it failed twice in human hands for
      opposite reasons, and `singlePayout` — the gate's own prescribed
      fallback, "cut it to a single automatic payout" — shipped. A gate
      cannot stay open on a fork that no longer exists. Its successor
      question is open and human-owned: **is pop-vs-burn-vs-wait a real
      timing decision?** (LOG, 2026-08-18.)
- [x] **Zero unwired feature flags.** `pop.treasure` and `debug.overlay` were
      wired in M3; the registry's `wired` field and its test remain for the
      next flag declared before it is built.
- [x] **Every `ideas/` file resolved.** `endless-world.md` carries the queue
      with each item built-and-kept or killed-in-writing;
      `persistent-world.md`'s P4a and P4b are built, P4c is built as shrines
      and the atlas. **`uniques.md` resolved 2026-08-18**, every entry by
      Marc on option sets and the build shipped the same day: perks are
      found-in-world (hidden finds, the shrine contract, the shop selling
      only the nose), Stonewalker/Wallbreaker/Open Hand joined
      Rootbound/Second Wind in the findable pool, Tier 1 is parked whole in
      the lot below, and Tidecaller is killed in writing.
- [x] **`DESIGN.md` claims human-verified** — closed 2026-08-20: the file
      grew "What a human has proven" (two debriefs: placing feels right,
      the run is fun and long because of the caches, the rebalance
      verdict, TITHE taken, score-vs-feel ruled) and a reading note
      marking the bounded-game body as history, not description. The two
      claims still humanly unproven are named there and are exactly the
      open items below: the stranger test, and sound's written question.
- [x] **A name, an icon, a direction, and it installs offline.** Ashwake,
      torchlit, an inline mark, a service worker whose cache name is the
      build.
- [ ] **A stranger finished a run and chose to start another.** The one item
      no amount of code produces.
- [x] **Post-1.0 parking lot** — below.

**v1.0 is deliberately untagged.** The definition of done requires the
stranger test — **and the stranger test alone** (Marc's ruling,
2026-08-20: Gate B's successor question, pop-vs-burn-vs-wait timing, is a
standing v1.1 question answered over weeks of real play, not a tag gate.
This paragraph used to list both while `DECISIONS.md` disagreed; the
ruling reconciles them). Tagging without the stranger would be the first
cut corner in twenty sessions. Planned tag day: **2026-08-25** — the
daily epoch is pinned to it; if the day moves, `DAILY_EPOCH` moves with
the tag commit.

## Post-1.0 parking lot

- **Tier 1 uniques** (`ideas/uniques.md`): Ashbound Seal, Everbloom, Leap,
  The Hoard. Parked whole on 2026-08-18 — Marc chose to build none of the
  four for 1.0. Rejected on scope, not merit: each is a real build-definer
  and each is expensive (Leap rewrites contiguity; the other three need
  harness proof their exploits stay closed). Revisit once found-in-world
  perks have proven the acquisition system.

- **Sound — LEFT THE LOT (built 2026-08-19).** All three moments shipped
  behind `ui.sound`, voiced per theme; the 2026-08-20 ruling keeps the
  silent default with the ♪ board-chrome toggle as the door. What remains
  parked is only its written question (does sound change WHEN players
  pop?) — `ideas/sound.md`.
- **A leaderboard.** Needs a backend, score validation and an abuse model —
  all deliberately out of a no-backend 1.0. The timeline's storage
  (2026-08-20) is already shaped as events a backend could ingest.
- **Shareable and multiple worlds — LEFT THE LOT (built 2026-08-19).**
  Three world slots and SETTLE THIS WORLD; a `?seed=` link doubles as a
  world code. (This bullet said "both deferred" a day after both shipped.)
- **Store wrappers.** Only if the web release finds players who want them.
- **The points scale — RULED 2026-08-20, kept as is.** Still one constant
  to divide, but the window closes when strangers post daily scores;
  see `DECISIONS.md` D8.
- **The waypoint-perk earn** (`ideas/waypoints.md`): camps shipped as a
  shrine rung; the perk-shaped second earn ("a camp where you fell")
  stays parked until BEGIN AT CAMP proves the appetite.
- **World mood** (a per-run tilt): PARKED explicitly post-playtest (LOG,
  2026-08-18) — no run-to-run variable before the fixed economy has been
  played by strangers.
- **Ground-feeds-draft** (native ground biasing the draw toward its own
  colour): offered 2026-08-18 and NOT chosen — Marc kept the draft blind.
  Written down so nobody builds it on a hunch it was implicitly approved.
- **Where-you-wake's negative result** (2026-08-18, harness-only): a far
  spawn exploited origin-anchored scoring. Not a plan — a RECORD, kept
  because the origin audit that fixed it (2026-08-19) is what made camps
  safe to ship; re-run `wake.test.ts` before any rule reads distance from
  a bare origin again.
- **Storage compaction.** Revealed ground is stored as keys; a per-block
  bitmap is written down in `ideas/persistent-world.md` for the day an atlas
  reports a world past ~1MB.
- **The bounded game.** Deleted outright on 2026-08-16 when the decisions
  were officialised — one economy for everybody, so a shared seed opens the
  same game its sender was playing. (This bullet said "still shipped behind
  `?ff=-world.endless`" until 2026-08-18; the flag had already been gone for
  two days.)
