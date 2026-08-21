# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at checkpoints only. The reasoning lives in `LOG.md`; the
rules live in `CLAUDE.md`.

Last checkpoint: **2026-08-21, small hours — launch week Day 2 closed, and
its audits with it.** Eighteen commits since the Day-1 entry below, every one
shipped and verified live. Four strands.

**Marc's phone verdicts, built.** Daily shrines reborn as caches and sites (a
world with no unlock ledger has no use for a door); the fog lens made legible
and easy to let go of; pops bursting in their own colour; EMBER as polka
rounds; the pop-timing fork retimed to the RIPE card; UNIQUE taught its own
card; the bounty and site numbers said out loud. Then, from the same sessions:
a daily can be PUT DOWN and picked up (its own key, guarded by its date,
offered back from the home door because a relaunched PWA carries no
`?daily=`); the economy SPLIT on his option-set answer — relics travel to
every world, what you buy with them stays where you bought it; a MENU tab
first in the `?` panel holding the exits and the atlas, showing YOUR WORLD or
THE DAILY and never both; a header of live numbers only; the camera flown
rather than cut; SETTLE moved to the end screen, offered on dailies, able to
trade a full slot; the SECOND STASH SLOT made real; a scoring pop that can
never score zero; biomes ~25% more opaque; and a lighter TIDE — value 0.451
against moss's 0.233, where the two used to sit 0.061 apart with the tide the
DARKER of them.

**Six bugs that cost players something.** The crossing never went through
`finish`, so a run that walked to the shrine rich arrived poor and nothing
said so. The harvest tally filed every burn and treasure as a POINTS harvest —
the third time a two-way test stood in for a four-way choice. The map could
stick in pinch forever on one missed pointer lift. Under `singlePayout`,
TREASURE cleared a bounty and paid nothing for it. The quota ladder could
merge a foreign geography into a fresh world. And five places measured from
world ORIGIN while `reachOf` measured from home — all live for anyone who had
woken the camp shrine, including a goal that paid 25 relics for standing
still.

**The data-loss cluster, closed, plus the door out.** The shed ladder never
touches the world being played and each rung says what it took; both merges
are seed-guarded; `decodeWorld` and `decodeProgress` salvage rather than
returning null (which the shell answered by minting a fresh world OVER the old
blob on the same tick); both SETTLE paths share one footprint-clearing helper;
`persist()` is asked at boot. And BACK UP MY WORLDS / RESTORE A BACKUP — the
only one of these that makes loss SURVIVABLE rather than merely less likely,
with no backend and Safari evicting a non-persisted origin after a week.

**The audit pass.** Eight parallel sweeps across two rounds. Every P0 fixed
the evening it was written. The manual gained nine concepts it had never
explained (POCKET — its own most-used noun — the bounty's rule, THE DAILY, THE
SURVEY, CAMPS, the fog lens, LEFT, and that REACH scores at the end) and lost
four sentences that had become false; a test now asserts every shipped concept
is named and that none of the four has come back. One contract for every panel
that covers the game — before it, `inert` appeared once in the whole codebase
and only to CLEAR it, so the hall of fame sat over a still-tabbable front door.
`public/sw.js` is linted (it had been reaching production with no lint, no
types and no test). `verify-deploy` no longer passes when the custom domain is
broken. And the shop's prose reads its magnitudes from `src/content/`, so it
cannot describe something the player is not buying.

**648 tests; 11 e2e; sim 18 policies, 0 stalled — unmoved but for the
one-point score floor.** `POLISH.md` is the schedule and the open-defect list;
`FOLLOWUP.md` the human questions; `PLAYTEST.md` the phone sessions. **The one
gate is still the stranger test.** Two things remain Marc's alone: where a
stranger's crash report should be SENT, and the Session B and C runs.

Previous checkpoint: **2026-08-20, evening — launch week Day 1 closed.** The
afternoon's prompts and audits, all shipped and deployed (Sessions 33
addenda 4–8 and Session 34, LOG.md): the relic economy HALVED (burn 1,
claims 2, ending conversion 5%, TITHE 15% — the 3× ratio kept; survey
155, crossing 25+10; measured before and after with the harness's new
`relics` column: 24-47 → 13-24 median a run) and reborn ground pays none
of it; spent shrines and finds REBORN each run as randomized caches/
sites (`rearmedSpent`, `GameState.rearmed`, `REARM` in content —
fully-awake worlds keep their shrines as the crossing's doors); the fog
finally LEGIBLE (memory draws at map light, not torch light; veil
thinned) with held-territory fields painted and a tappable colour LENS
that lights one biome's known extent; EMBER leads with spark dots
(rebaked); MAGIC violet and UNIQUE flame everywhere rarity speaks —
cards, held card, board edges, stars, and the WORDS; the pop cascade
holds colour until each tile's own leap; the hall of fame's rows (both
tabs) unfold into the end screen each night kept (`RunDetail`, epitaph
included); Marc's three Day-1 rulings (daily #1 = launch day
2026-08-25 with rehearsal dates named by date; the stranger test ALONE
gates the tag; reborn pays no relics — DECISIONS.md D17-19); and the
strangers'-first-click batch: self-hosted fonts (the Google link made
"nothing leaves your phone" false — pinned so it cannot return), an
honest sentence for iOS ≤16.3 instead of a dead BEGIN, the door
re-dating itself across midnight, worker update checks on interval and
foreground, a real one-tap Android INSTALL button, an in-app-browser
warning, the share card on the desktop CLIPBOARD, a slimmer virgin door
(empty hall of fame hidden, fresh-world mode line), canonical/og meta,
manifest identity, immutable asset caching, AA contrast on the faint
ink. Two fresh-eyes audits of the week's own diff found and closed
fourteen defects between them. 607 tests; 7 e2e; sim 18 policies
0 stalled. **FOLLOWUP.md is the launch-week script now; PLAYTEST.md the
phone sessions; the one gate is the Day-4 stranger test.**

Previous checkpoint: **2026-08-20, midday** — launch week opened. Three
audits (code, parked work, public surface), three rulings by Marc (points
scale stays;
the timeline is ALWAYS ON — `fame.timeline` deleted a week after its
birth, launch day being the only clean epoch; sound ships off with an
easy way in), and the stranger-proofing batch: the front door scrolls
instead of clipping small phones, a virgin device gets one first-contact
card ("tap a card, then tap a glowing hex"), a second tap on the selected
card puts it down (engine `SELECT -1`) while showing its lesson, share
links stop carrying the sender's `?ff=`/`?theme=` test rig into
receivers' storage forever, the ♪ board-chrome toggle flips `ui.sound`
mid-run, the failure overlay tells a WebGL-less browser the truth (and
grew COPY REPORT; stray non-Error rejections no longer raise it), first
paint has a name/tagline/`<noscript>`, the update note is tappable while
the front door is up, offline precaches the torchlit art it silently
skipped, storage-full triage sheds the diary before the world, an
install nudge speaks iOS's manual path once ever, desktop gets a
centred phone-width frame and rotated phones a real landscape rail, the
share card PNG names tiles.marcportal.com, and the gallery is
noindexed. Full account: LOG.md Session 32. The same day (Session 33):
**the paper caught up and the harness learned to be a person** — the
docs deep-clean (sound.md and waypoints.md open with their resolutions;
DECISIONS.md is an answered ledger with only D4 the stranger test open;
DESIGN.md carries "What a human has proven" and the bounded-body reading
note; the parking lot holds its four homeless items; **Gate E stamped
PASSED**, every M5 condition having quietly come true), five e2e menu
specs (home door, first-contact card once-only, RESET ALL's full round
trip, fame tabs, the ♪ wire), and three player-profile policies —
timid / greedy / tourist beside chooser's veteran — with seven balance
pins: timidity survivable, greed a legible lesson, wandering paid in
distance, the veteran on top, run one real, the maxed ladder worth its
relics, every perk stall-free. 594 tests then; 7 e2e; `pnpm sim` 18 policies,
0 stalled/capped. (The blocker line this checkpoint closed with is
superseded above: the rehearsal is Day 2's script, and the stranger test
is the one gate.)

Previous checkpoint: **2026-08-19** — the second debrief; the game learned to
teach itself; the day then kept going: the balance batch, the daily, the
crossing, three world slots, and the no-phone program. 568 tests.

- **The rest of 2026-08-19, in one paragraph** (full accounts in LOG.md's
  addenda): colours teach themselves at first placement and placed rares
  wear a star; labels survive every zoom; base rare odds halved and
  shrines thinned 8% → 5% (finds rescaled with them), swept at 200
  runs/policy; the error panel became a reporting overlay (LAST ERROR
  under DEVELOPER) for what was then an unresolved iOS crash — **the
  crash itself is FIXED** (same day: the renderer caps DPR at 2,
  `#safeEvict` guards texture eviction, and WebGL context loss is
  survived; this line kept calling it "unresolved" a day after the fix
  landed, corrected 2026-08-20); fog memory shows what it
  saw and the tap-scan divining rod is closed; the deliberate last-gasp
  rule is taught; BEST left the draft cards. Then the fresh-worlds
  answer: the DAILY (one shared plain world per local date, own ladder,
  sparkline share), the CROSSING (a fully-awake world's shrines offer a
  new world with a relic dowry), a front door that is a playstyle MENU,
  THREE world slots (slot 1 = legacy keys, no migration) and SETTLE THIS
  WORLD (keep a shared seed's geography as your own). A fresh-eyes
  reviewer then audited the day whole and found ten defects — the
  crossing un-crossing itself into an infinite relic farm the worst —
  all fixed; the origin audit closed blue tide's origin-read and
  unblocked waypoints (`ideas/waypoints.md`); the renderer caps DPR at 2
  and survives WebGL context loss; and sound is BUILT behind `ui.sound`,
  off by default, voiced per theme.

- **Marc's second debrief (two long runs, 11k/4k, "I had fun") moved three
  written questions**: the rebalance verdict is positive (caches confirmed
  as lifelines in human hands), TITHE's question closed YES on first
  contact, and score-vs-feel was RULED two separate rewards. One defect: a
  found perk could not be inspected mid-run. Full record: LOG.md Session 26.
- **The teaching pack shipped whole the same day** (`ideas/teaching.md`,
  designed on Marc's option-set answers and built in one pass): a per-device
  `met` ledger in `Progress` fires its first-contact moments once each (thirteen when this was written; TWENTY by launch week — the four colours, the last-gasp rule, place and purse joined; corrected in place 2026-08-20)
  — cards for ripe/pop/glow/rare/luck/relic, toasts for cost-rise/wall/
  native-field, claims teaching through their own notes with a first SITE
  upgraded to the held card; the manual GROWS with the ledger (one quiet
  foot line where something is hidden) and repaints on every open; the LUCK
  stat, purse fold, shop door and survey row appear on first relevance;
  NUMBERS folds pruned to decision numbers only; every stat tappable to
  explain itself in place. Old saves decode the ledger as ALL MET — no
  existing player sees any of it (the FOUND-perk dial contract, paid in
  data); RESET TEACHING in the developer fold previews the stranger's first
  minute. The find card now says what the perk does and whether it is
  already worn, and WHAT YOU CARRY in the manual closes the debrief's
  defect. Engine and content untouched; `pnpm sim` byte-identical by
  stash-and-rerun. **The stranger test waits on Marc's own RESET TEACHING
  pass**: can a stranger's first run teach itself?

Previous checkpoint: **2026-08-18** — Sessions 15–22, the same-day audit's
fix pass, the three-stage pipeline (`WORKPLAN.md`) it green-lit, and the
fresh-eyes review that closed the pipeline out, all in one run. 518 tests.

- **The fresh-eyes review** (`WORKPLAN.md`'s own final line) read the whole
  pipeline as one body of work rather than four separate diffs, and found
  what a stage working alone could not see: two balance numbers (the
  survey's thresholds, deep water's near-home reward split) had escaped
  `src/content` into `src/meta` and `src/engine` respectively, in direct
  contradiction of a rule one of those same files' own docstring restated;
  TITHE's own tooltip called its rate "worse" than death's when it is
  2.5× better; TITHE and the survey were both live, on-by-default systems
  the manual never named; and the fix for the first of those (reading the
  near-share tuning fields straight off `t`) would have made an old save
  decode them as `undefined` and silently turn every destination into a
  shrine — caught before it shipped. `firstVisit`, dead since the front
  door absorbed its job, is gone. Five commits, full account in `LOG.md`'s
  addendum; `pnpm sim` byte-identical throughout.

- **The pipeline shipped whole.** Stage 1 (correctness, `1e09a89`) closed the
  triple audit's eighteen bugs. Stage 2 (UI/UX, four commits) rebuilt the
  screen without touching balance: a front door before the board, the end
  screen broken into its exact payout (POPS + REACH×bonus + CLAIMS×bonus),
  bottom-third chrome reclaimed behind a FIT⇄HERE camera toggle, and two
  feedback tiers (a one-line toast vs. a held event card for anything that
  changes the next run). Stage 3 (new systems, four commits) shipped the
  moments pack (seven once-per-run truths), deep water (the destination
  reward MIX tilting with depth, not just its density), the survey (five
  world-scale goals paying relics once each) and TITHE (a fourth luck price,
  converting the whole purse at a multiple of what death pays on unspent luck — 25%/10% when written, 15%/5% since the 2026-08-20 relic tightening; corrected in place). Full account
  in `LOG.md`'s 2026-08-18 addenda; `WORKPLAN.md` carries the commit hashes.
- **Where-you-wake was prototyped and FAILED** (`42c9ec8`, harness only —
  see "Not started" below for the verdict). Kept as dead engine code on
  purpose, so the negative result can be re-run.
- **Gate B is RETIRED, not passed.** The gate asked whether tiles-or-points
  was a real choice; it failed twice in human hands (94-98% tiles either
  way), and `singlePayout` — the gate's OWN written fallback, "cut it to a
  single automatic payout" — shipped 2026-08-16. `gateB()` and its tests are
  deleted; the record book still stores the tallies. **The successor
  question is open and human-owned**: Marc's own framing (2026-08-18) is
  that waiting should be the score line and popping should buy small
  advantages (luck, steering) — whether those advantages feel worth taking
  under the lean economy is the thing the phone answers, not the harness.
- **The rebalance** (2026-08-18, "make it easier gradually with relics, not
  at the start"): run one starts lean — `startingTiles` 22, cost +1 every 22
  placed — and the shop's **STEADY PACE** buys the old 30-placement curve
  back, a level at a time. Three flat numbers became gradual formulas over
  distance from home: caches pay 6 at the doorstep + 4/ring (RICHER WORLDS
  still raises the base, so a maxed ring-2 cache pays the pre-rebalance 26),
  a harvest pays a quarter-tile extra per pop per ring, and destination
  density ramps in over two blocks so run one still meets its first claim.
  Swept at 40 seeds a rung: reach across the shop ladder grew 12 → 18 where
  the flat world managed 14 → 16.
- **Perks are FOUND, never bought** (resolves `ideas/uniques.md`). A hidden
  find is a landmark that never beacons — not even to KEEN NOSE's shimmer,
  which stops two hexes short of the beacon horizon on purpose — revealed
  only when growth touches its ground, on its own hash layer rarer than a
  shrine. Reaching one grants a deterministic, unowned perk from a
  five-strong pool (Rootbound, Second Wind, Stonewalker, Wallbreaker, Open
  Hand) and auto-equips it if nothing is worn. **Exactly one perk is carried
  at a time** — SECOND SLOT is deleted and its 400 relics refunded on load.
  The shop sells only the boring floor (a deeper purse, better odds, richer
  worlds, a gentler curve) plus KEEN NOSE; it never sells a perk. Closed
  2026-08-18: a claimed find is now remembered per world
  (`WorldMemory.finds`) so the same hex cannot be walked into on a later run
  to farm a different still-unowned perk.
- **The end screen and the shop split apart**, one door between them rather
  than an always-open row competing with the run for space; the `?` manual
  went from six tabs / nineteen sections to four (START · PLAY · HAND ·
  AFTER) / thirteen, each section still reading its numbers from the run's
  own live tuning so it cannot describe an economy it is not playing.
- **Accessibility, PWA and performance shipped as their own audited
  packages**, zero balance changes in any of them: dialog semantics + Escape
  - live regions on the manual and the toast, `:focus-visible`, every
    control at a real or invisible-hit-area 44px, `prefers-contrast`,
    reduced-motion gets its own pop back instead of nothing; a 2.5s network
    budget on the worker plus an update banner; camera draws coalesced to one
    per frame and a render pass (`renderContext`) that computes ripeness,
    target, reach and every draft preview ONCE instead of three-to-five times.
- **Terrain speaks per colour.** Per-colour ground SHAPES (tried
  2026-08-16) were retired by the same authority that ordered them — they
  collapsed into lookalike specks at ground scale — and native fields now
  wear their own colour's texture instead (moss diagonal, ash dots, tide
  horizontals, ember verticals); EMBER got the finish it had been missing
  since Gate E opened.

**Several "Shipped and settled" bullets below were stale and are corrected
in place**, not just here: the bounded map and its flag were deleted
2026-08-16 (one economy, for everyone) but a bullet still described the
endless world as living "behind tuning"; the P3a bullet still said "no
pan/pinch" a full session after Session 7 built the camera; and "Not
started" still listed perks and save/resume as unbuilt, sessions after both
shipped. **Gate B's retirement and the stranger test are the two things
code cannot produce — they lead the human follow-up**, alongside the open
pop-vs-burn-vs-wait question above.

Earlier — **2026-08-15** — **the game is ASHWAKE, and M1–M6 of
`ROADMAP.md` were built.** Sessions 11–16 in one run: Gate B fixed
structurally at the time (a hard 260-placement clock, survival funded by
caches, a cap on the size bonus — the tiles share of harvests fell from
94-98% to 41-64% for lines that harvest as they go; **superseded above —
the gate is now RETIRED**), **Gate D passed** on the arc evidence and still
stands, the remembered world (fog memory + territories that stay yours),
the roguelite spine (territory perks, the treasure payout, zero unwired
flags), shrines as the unlock ledger and the whole content queue emptied —
one system deleted after its sweep said so — **Gate F passed**, **Gate E
opened** with torchlit chosen and the four colours renamed MOSS · EMBER ·
ASH · TIDE, and the game made installable, offline, shareable and safe for
a stranger's first minute. 314 tests.

Earlier — **2026-08-13** — Session 6: **P3b is built.** Destinations
(cache / site / claimable territory, seeded by the world hash, drawn as
beacons through unrevealed ground, claimed by touch) and rarity in the draft
(magic = wild, unique = wild + double, luck accrued by tiles-harvests raising
the odds, odds printed in the HUD). Shaped by Marc's answers on 2026-08-13 —
territories-not-shrines, draft-rolls-plus-luck, both systems minimal in one
session. All of it tuning-gated: on in `ENDLESS_TUNING` (`?ff=world.endless`),
off in the bounded defaults; `pnpm sim --endless` sweeps the shipped plane.
Harness: nothing stalls; the timing optimum moved 15 → ~40 because caches are
lifelines (bank40: 0 bare → 19,356 shipped; cliff at 80 holds); `seeker`
claims 2 destinations a run and keeps bank15's pace. The two written
questions — does a glow change where a human builds, do the odds ever flip a
harvest to tiles — wait on the phone.

Same day, Session 7, on Marc's asks: **a camera and fewer decisions on
screen.** Zoom `+`/`−`/`FIT` buttons plus pinch (1–4×, 1 = fit-everything),
drag-to-pan past an 8px slop so taps stay taps, worth numbers surfacing as
you zoom (`zoomLayout` in `render/layout.ts`, pure, pinned). A `?` opens one
screen of how-to-play in plain words, per world; the hint line leads with a
one-clause "what now". Harvest buttons exist only while something is ripe,
and the draft marks BEST from the same previews the board draws. 244 tests.

Session 8, same day, on "streamlined but not fun": **character.** Colour
personalities through the one worth channel (GREEN crowds, YELLOW company,
RED feeds on stone, BLUE worth more far from home — one shared `tallyWorth`
so preview and payment cannot diverge), biomes as a third scale of the world
hash (regions ~24 hexes across where every field wears the region's colour),
and a HOLD stash that survives rerolls. All tuning-gated, on in
`ENDLESS_TUNING` only. Harness: nothing stalls, median reach DOUBLED across
policies (exploration pays structurally), every scoring line rose, timing
spine holds. 256 tests. Queued in `ideas/endless-world.md`: pattern shapes,
hidden finds, hazards, quests, quirks, economy re-target. Same day: the `?`
became a full manual whose numbers are read from the live tuning (257
tests).

**2026-08-14 — the endless world is the shipped default** (Session 9's
one-line decision): tiles.marcportal.com now opens the plane, no query
string. Session 4 said the worlds question would be decided by playing;
Marc played both and chose. `?ff=-world.endless` is the bounded game;
feature storage moved to v2 so stale persisted defaults cannot shadow the
new one.

**2026-08-15 — GATE A PASSED; Gate B failing in human hands; the run is
kept.** Marc's full-run debrief: placing feels right (A's condition, met);
harvests were almost all TILES — over B's 70% line — because points felt
worthless early and never safe ("add roguelite elements maybe"); worst
moment was a boring mid-run stretch (next content session's target, quests
the queued candidate). Built: save/resume (`meta/save.ts`, autosave every
action, corrupt saves refused whole, resumed runs keep their saved tuning)
and Gate D's end screen (score, arc — biggest pop and where it landed —
claims, luck, personal best per world, NEW RUN). Planned:
`ideas/persistent-world.md` — P4 in three phases from Marc's decisions
(ground + territories persist, caches re-arm, one world per device,
territory starting-perks as the Gate B roguelite fix). Powers rebalanced
same day (red+walls, yellow-counts-all — spread halved) and walls lifted
clear of the fog in all skins, pinned. 276 tests.

**Same day — the finish line exists: `ROADMAP.md`.** Marc set the goal:
1.0 is a public web release — real name, PWA, offline, share-your-wins,
silent (audio post-1.0), no backend. Six milestones with per-milestone
definitions of done: M1 Gates B+D (quests, choice instrumentation), M2 the
remembered world (P4a), M3 roguelite spine (P4b, registry honesty), M4
places + content queue (Gate F), M5 identity (Gate E, a real name), M6
shipped to strangers (PWA, onboarding, share, the stranger test). The 1.0
checklist is in the roadmap; estimates 11–18 sessions. **Current
milestone: M1.**

## Shipped and settled

- **Repository.** `tiles/` is its own git repo. Nothing here belongs to the
  ecosystem repo rooted at `C:/Users/marc_`.
- **Toolchain.** Vite 8 · TypeScript 5.9 strict · Vitest 4 · ESLint 10 ·
  Prettier · pnpm. TypeScript is pinned below 7 on purpose: `typescript-eslint`
  cannot parse TS 7 yet, and type-aware linting is load-bearing here.
- **The layering rule is machine-enforced.** `content <- engine <- ui/render/sim`.
  The engine additionally cannot reach `Math.random`, `Date`, the DOM or async.
  Probed and confirmed failing-as-designed, not merely configured.
- **`src/engine/hex.ts`** — pointy-top axial. `DIRECTIONS` order is pinned by
  test; ring rules read it as a sequence, so reordering would change the game
  rather than break a build.
- **`src/engine/rng.ts`** — counter-based mulberry32 over plain
  `{ seed, cursor }` data, in named per-concern streams. This is what buys
  replays, golden tests, save files and a headless harness; treat the plainness
  as load-bearing, not as a style choice.
- **`src/meta/features.ts`** — every system is independently switchable and
  defaults OFF. Overridable from the query string (`?ff=id`, `?ff=-id`) because
  prod-on-a-phone is the test environment and the address bar is the only
  console. Corrupt or stale persisted state degrades to defaults.
- **`src/render/`** — `Renderer` is an interface over plain view data; the
  engine never learns pixels exist. `layout.ts` fits any region shape to a
  portrait viewport by full drawn extent (not cell centres), so edge hexes
  cannot clip on a narrow screen.
- **Deploy.** Assets-only Cloudflare Worker, live at
  **https://tiles.marcportal.com** (and `tiles.marc-jeanson.workers.dev`, kept
  as the WAF-free fallback CI verifies against when the zone challenges runner
  IPs). The build stamps `dist/version.json`; `scripts/verify-deploy.ts` proves
  the LIVE site serves that exact commit, retrying per asset because assets
  propagate independently of the version stamp. Green CI is not treated as a
  deploy. Repo: `majeanson/tiles` (private); CI green on `main`.

- **The game is playable end to end.** `src/engine/` is the whole run — place,
  ripen, harvest, leave, die — with tuning carried as data rather than imported,
  so the harness can sweep an economy and a replay knows which one it ran under.
  `src/ui/view.ts` derives everything on screen from the same rules the reducer
  uses, so a preview cannot promise a number the placement will not pay.
- **`src/sim/` is the balance harness.** `pnpm sim` plays seven policies over
  N seeds; `--set costRisesEvery=60` reruns the whole economy from one command.
  Stalls are reported, never hung on. Gate C's clauses are pinned as tests.
- **Rule 7 exists**: you may leave a map only once you have harvested on it.
  Added during implementation because leaving was otherwise free and unlimited,
  which made the map multiplier free with it. See `DESIGN.md`.

- **`src/theme/` holds the whole visual surface as data.** A new enforced layer:
  `content <- theme <- render`, with `engine/` and `content/` forbidden from
  importing it. A theme describes how ROLES are painted, never what they mean, so
  repainting the game cannot change it. **This bullet used to say four themes
  were loaded and "the placeholder is still the default, asserted by a
  test"** — true through Session 14, stale the moment Gate E opened the next
  day and stale twice over now: **two directions are loaded**
  (`placeholder`, `torchlit`; `cold-survey` and `rot-bloom` were deleted
  2026-08-19, WORKPLAN Stage 1's goodbye — the registry never had more than
  two losing directions to begin with, and neither is coming back), and
  **torchlit is the default**, asserted by the very test this bullet cited.
  Switchable with `?theme=`. Gate E is opened, not shut; see the gates table
  below.
- **Art is optional everywhere.** Every bitmap is a slot. Drop a PNG at
  `public/assets/<themeId>/<slotId>.png`, and a build-time scan writes the
  manifest the client reads; missing files are the normal case and cost neither a
  request nor a failure. Procedural surfaces are the floor underneath. **This
  bullet used to end "no art has been imported yet: every slot is empty on
  purpose" — stale since 2026-08-19, corrected 2026-08-20 by the pipeline's
  fresh-eyes review**: torchlit's eight terrain/fx slots are FILLED, baked by
  `scripts/terrain.ts` (deterministic, offline, regenerable — verified
  byte-identical on rerun) per WORKPLAN Stage 3, and `verify-deploy` now
  proves every file the live manifest names actually serves. `ui.logo` and
  `ui.runEnd` are wired with live drawn/CSS defaults and no PNG yet;
  `fog.hard`, `fog.soft` and `ui.cardFrame` stay empty because no mechanic
  reads them.
- **Hex orientation is a rendering decision, not an engine one.** Moved into
  `render/layout.ts` and parameterised; the geometry suite runs against both.
  The engine was not touched, because axial coordinates mean the same thing
  either way up.
- **The greyscale rule is a test, not a sentence.** `theme.test.ts` measures the
  four terrains in CIE L* and fails a direction whose values collapse. It found
  three real defects on its first run, one of them in the palette that had
  already shipped — the placeholder's red and blue were the same tone. Do not
  relax the threshold to make a direction pass; darken something.
- **`/gallery`** — the art-direction workbench, drawn by the same baker the
  board uses, shipped with the game so it opens on the phone.

- **The endless world IS the game.** `world: 'endless'` was the only tuning
  left after 2026-08-16 (Marc: "officialize some decisions... so all players
  play the same game when shared") — the bounded map and the flag that chose
  between them are both deleted, so this bullet no longer describes an
  opt-in. One unbounded plane grown from a seed tile: no LEAVE, harvest pops
  one connected ripe cluster targeted by `HARVEST`'s optional `at`, points
  multiply with distance from home in place of the map number. The plane is
  grown, not generated — every placement materialises the empty ground
  around itself, so no tile ever borders an absent cell and every rule
  function serves the one world unchanged. Per `ideas/endless-world.md`.
- **The plane has ground under it (P2, answered).** `engine/world.ts` is a pure
  hash of `(worldSeed, hex)`: 6% walls that surround-but-never-match and cannot
  be built on, native fields where a tile of the right colour counts the ground
  as one extra match. The harness says terrain enriches without breaking —
  every scoring policy improves, reach extends, the timing structure holds.
  Walls added the run's second named death, `walled`. Pinned in `sim.test.ts`.
- **P3a: the plane is playable on a phone.** The board auto-fits the grown
  world on first load; tapping a ripe tile targets its pocket — the harvest
  buttons re-price to it and the board outlines it in accent; LEAVE does not
  exist here; the third stat reads REACH. Fog, landmarks and hints (P3b)
  shipped the same week this bullet was first written. **This bullet used to
  say "no pan/pinch, so no gesture conflict with tap-to-place" — Session 7,
  days later, built exactly that camera**: `+`/`−`/FIT buttons plus pinch
  (1–4×) and one-finger drag past an 8px slop so a placement tap still reads
  as a tap. The claim was true for one session and stale for every one after.
- **Every decision in prompt.md is answered** — see its ANSWERED section.
  Highlights: P4 (persistent world, fog memory across runs) confirmed as the
  intent; the pop is a JUMP (tile leaps and falls, `popLift` per theme);
  `?hex=flat|pointy` overrides any theme's facing and the picker carries the
  toggle; feature and facing overrides persist across visits.
- **All eleven sim policies play both worlds** — `pnpm sim --set world=endless`
  reruns the identical table under the other economy. The `bank<N>` family
  isolates harvest timing as a dial; 0 stalled, 0 capped everywhere.
- **The draft cards show the tile.** Each card carries the hex surface the
  board draws — the terrain slot's baked PNG once assets load (2026-08-20,
  the fresh-eyes review: Stage 3's art briefly split the two surfaces, board
  on PNG, cards on the procedural bake), the procedural bake as the floor,
  the flat swatch as the no-canvas fallback. Prompted by the first human
  feedback on the prototype: the hand read as "just click there".
- **Native fields follow the board's own art too.** Marc, 2026-08-20: "the
  background tiles of territories colors have not switched textures like
  the others." Stage 3 gave TILES a baked PNG and a second procedural
  `overlay`; `fieldPattern` only ever read a terrain's base `pattern`, so
  territory ground kept the pre-Stage-3 look while everything standing on
  it moved on. `fieldGround` (`theme/tokens.ts`) is now the one function
  `PixiRenderer` and `/gallery` both call: with the slot's PNG loaded, a
  field wears that same file ghosted over `theme.empty`'s fill at an alpha
  `fieldDots` equalises per colour (its own contrast maths, reused rather
  than a flat number); without, the procedural floor now carries the
  terrain's overlay layer too, not just its axis pattern. The gallery's
  FIELD row states which path it drew — "wearing terrain.green art" or
  "procedural floor" — so the claim stays checkable by looking, which is
  the other half of Marc's ask.

## The gates

Current state (full evidence in `LOG.md`'s gate table): **A passed**
(2026-08-15, a full run on the phone against prod) · **B retired**
(2026-08-18 — its own fallback shipped; see the top checkpoint's successor
question) · **C passed** (Session 1) · **D passed** (2026-08-18, on the arc
evidence) · **E PASSED** (opened 2026-08-15 with torchlit chosen and the
four colours renamed MOSS · EMBER · ASH · TIDE; stamped PASSED 2026-08-20
— the losing directions deleted, the art slots baked and served, the name
everywhere, the palette tests green, and Marc's own "nothing left to
compare against"; full reasoning in `ROADMAP.md`) · **F passed**
(2026-08-15). Every gate that can close without a human has closed; the
stranger test is what is left.

**Nothing visual is tested by this repository.** happy-dom has no 2D canvas,
so no test here has ever rendered the board. Everything visual is verified
as wiring (the selectors that decide what to draw) and unverified as a
picture — that half is what "against prod, on a phone" buys.

## The open design problem — resolved, kept as history

Rule 5's harvest TIMING was a fake decision **on the bounded map**: the
`bank<N>` line scored monotonically more the longer it banked, because a
full map handed the cash-in moment over for free. The endless world (P1)
fixed it structurally — an interior optimum with a real cliff past it — and
P3 (camera, fog, landmarks, all built by Session 7) made the gradient
something a human could feel. The bounded map itself was deleted 2026-08-16;
there is only one world now, so "the bounded map" is no longer a live
concept this file needs to warn anyone off. Full ledger in
`ideas/endless-world.md`; the sim pins for both shapes lived in
`src/sim/sim.test.ts` until the bounded side of them went with the map.

## Push-to-deploy is armed

A push to `main` runs format/lint/typecheck/test/build, then deploys, then
proves the live site serves that exact commit. Secrets and the `DEPLOY_ENABLED`
variable are set on `majeanson/tiles`.

The Cloudflare token is deliberately narrow — Workers Scripts: Edit, Workers
Routes: Edit pinned to the `marcportal.com` zone, Account Settings: Read. No
D1, KV or R2. Those permissions are **account-scoped, not resource-scoped** in
Cloudflare, so granting D1 here would hand this game's deploy token full edit
rights over jaffre's production database. A token's permissions can be widened
in place later without changing its value, so there is no cost to waiting until
a feature actually needs one.

Manual deploy still works: `pnpm build && pnpm exec wrangler deploy`.

## Not started

Everything above this line has shipped. What has not, honestly:

- **Sound — BUILT, this bullet was stale.** It said "scoped, not built" two
  checkpoints after `ui/audio.ts` shipped (2026-08-19, behind `ui.sound`,
  voiced per theme). Corrected 2026-08-20, the day the ♪ board-chrome
  toggle made it one tap away; it still SHIPS silent — the silent-1.0
  ruling stands as the default.
- **The daily — LIVE, this bullet was stale.** It said "build parked until
  Marc calls it"; he called it and it shipped 2026-08-19 (DAILY on the
  front door, one shared plain world per local date, counted retries, the
  sparkline share). Corrected 2026-08-20.
- **Tier-1 uniques.** Parked whole, post-1.0, per the 2026-08-18 uniques
  design session — scope, not merit; see `ideas/uniques.md`.
- **A leaderboard.** No backend exists to hold one; not designed past being
  named as a gap.
- **Where-you-wake.** Built and swept 2026-08-18 as a harness-only
  prototype (`WORKPLAN.md` Stage 3 item 4) — and it FAILED: a far spawn
  can exploit spawn geometry for a free score advantage, through
  `tallyWorth`'s blue-tide bonus and (more softly) deep water's and the
  destination density ramp's own block distance, none of which read the
  new `homeOf(state)` the prototype's two named functions were fixed to
  use. Full table in `LOG.md`'s Stage 3 addendum. The engine support
  (`newRun`'s `wakeAt`) stays in the tree, unreachable from any UI, off by
  default — parked, not merely not-started, unless a future session wants
  to audit every distance-based rule in the engine for an implicit
  ORIGIN before trying again.
