# Teaching, drop by drop

Designed 2026-08-19, on Marc's observation after his second debrief: "this
game will be mega confusing for a stranger — concepts and context should be
given drop by drop. Even our NUMBERS expandables are often meaningless."

He is right, and the inventory proves it. The shrine ledger gates four
quality-of-life dials, but every CONCEPT is live from placement one on a
fresh device: four colour personalities, native fields, biomes, walls, four
destination kinds, bounties, magic/unique, the stash, luck, TITHE, the
survey, deep water, hidden finds — roughly fifteen ideas in a stranger's
first run, and the only explanation for any of them is a manual they must
choose to open. The game teaches by pull; a stranger needs push.

**The question this build must answer** (written before building, per the
prototype rule): *can a stranger's first run teach itself — no manual
opened, no concept met unexplained?* Measured at the stranger test, which is
the v1.0 blocker anyway: watch them play, count the stalls and the
questions. The design below is Marc's three chosen mechanisms
(2026-08-19, on the option set) plus the NUMBERS ruling.

---

## 1. First-contact cards

The first time this DEVICE meets a concept, one short card says what it is —
at the moment it happens, where it happens, once, never again.

**The ledger.** `Progress` (meta/progress.ts) gains `met: readonly string[]`
— per device, like relics and perks, because confusion is a property of the
player, not the world. Abandoning a world does not re-teach; a new phone
does.

**The off-by-default contract, honored the dial way.** A decoded `Progress`
that PREDATES the field seeds `met` as ALL MET — a device that has already
played is not a stranger, so every existing player pays nothing and sees
nothing, with no flag to flip. A fresh device decodes to an empty ledger and
gets the drip. (Same shape as the FOUND-perk dials: the contract paid in
data instead of a boolean. The fresh-eyes review's save-decode lesson
applies verbatim — a missing field must decode to a deliberate value, never
to `undefined`.) The DEVELOPER fold in SETTINGS gets one button, RESET
TEACHING, so Marc can replay the drip on his own phone.

**The moments.** Each is armed until shown; if two trigger on one action,
the higher one fires and the other stays armed for its next natural
occurrence. At most one teaching card per action, ever.

| id          | fires when                                            | tier  |
| ----------- | ----------------------------------------------------- | ----- |
| `ripe`      | first tile ripens                                     | card  |
| `pop`       | first pop lands (stone appears)                       | card  |
| `costRise`  | first time the placement cost ticks up                | toast |
| `glow`      | first destination beacon enters the revealed view     | card  |
| `cache`     | first cache claimed                                   | toast |
| `site`      | first site claimed (the bounty!)                      | card  |
| `territory` | first territory claimed                               | card  |
| `wall`      | first wall revealed against the frontier              | toast |
| `field`     | first placement onto a native field                   | toast |
| `rare`      | first magic or unique card in hand                    | card  |
| `luck`      | first luck in the purse                               | card  |
| `relic`     | first relic earned                                    | card  |
| `colour*`   | first placement of each of the four colours           | toast |

Shrines and finds already have their cards; death already has the end
screen. Each text is one or two lines, plain words, present tense, in the
manual's existing voice — and each card carries the same sentence the
manual will grow (see §2), so the two can never disagree: the card IS the
manual line, delivered early.

**The find card gets its fix here too** (the 2026-08-19 defect): when a
find auto-equips, the card must say what the perk DOES and that it is
already worn — not instruct an equip that already happened.

## 2. The manual grows with the world

The `?` shows what this device has met, keyed off the same ledger plus the
run's tuning (which already gates sections today — `holdSlots`,
`luckRerollCost`, `burnRelics` folds exist only when live).

- **START stays whole, always.** It is the stranger's tab; gutting it would
  defeat it.
- **PLAY**: PLACE AND RIPEN, POP, THE COLOURS and THE SCREEN stay whole —
  they describe every hand from placement one. THE WORLD keeps its opening
  line and grows a line per destination kind as each is met (`cache`,
  `site`, `territory`, shrine-met via WorldMemory); the walls line appears
  with `wall`; the hidden-find tease line stays always — it is deliberately
  a mystery.
- **HAND**: RARE TILES appears with `rare`; the stash line already rides
  `holdSlots`. LUCK IS A PURSE appears with `luck`.
- **AFTER**: RELICS AND THE SHOP appears with `relic`. HOW IT ENDS and THIS
  BUILD stay whole.
- One quiet line at the foot of any tab that is hiding something: "More
  appears here as you meet it." No per-section placeholders, no counts.
- **HAND gains WHAT YOU CARRY** — the worn perk's name and its one
  sentence, present whenever a perk is worn. This is the mid-run perk
  inspection the second debrief demanded, put where a player already looks
  for answers; the shop shelf stays the place to equip and unequip between
  runs.

## 3. The HUD appears as it matters

Chrome materializes on first relevance, paired with its teaching card so
the appearance IS the event:

- **LUCK** (the stat and the folded spend row) — hidden until `luck` is
  met. The row already hides when no prices exist; this extends the same
  wire.
- **The shop door / RELICS** on the end screen — hidden until `relic` is
  met. First death usually earns relics, so the door appears at the moment
  it first means something.
- **The survey row** in SETTINGS' YOUR WORLD — appears at first nonzero
  progress toward any goal (Marc's own wording on the option set).
- TILES, COST and REACH stay from frame one: they price the very first
  action.

## 4. NUMBERS, pruned

Marc's ruling: demote to tap-the-thing, keep only the real numbers that
matter, otherwise prose. The board is the manual; a number belongs where
its referent is. "Tapping any symbol explains it where it sits" is already
shipped — this extends that pattern and shrinks the folds to the few
numbers that price a DECISION and have no on-screen referent:

**Keep (a fold, or one number in prose):**

- The cost curve — "+1 per N placed, never comes back down" is the clock;
  its numbers are the run's one strategic constant.
- The depth multiplier's step — the WHY of the whole game, one number.
- Territory starting-tiles and the end-of-run luck % — the two numbers a
  player weighs BETWEEN runs (hold vs. push, hoard vs. TITHE).

**Demote to the thing itself:**

- Spend prices — already printed on the buttons; delete the fold's price
  list, keep TITHE's one explanatory sentence.
- Pop payout arithmetic — the buttons already price the exact pocket as a
  promise; the fold's formula becomes one prose line saying exactly that.
- Site pay, bounty numbers, territory radius — tap-the-symbol already
  explains these in place; make sure each carries its numbers, then delete
  the fold lines.
- "You start with N tiles" — it is on the HUD.
- Tapping a STAT (TILES / COST / REACH / LUCK) explains it where it sits,
  same as symbols — new, small, closes the loop.

**Colour numbers** stay behind their fold — they are real, they price
placements, and the cards' lens already shows worth per placement live.

---

## What this is not

No balance number moves — every content number is untouched; the ledger is
meta, the cards are UI copy. The engine is untouched. No new vocabulary
reaches the screen: "first contact", "ledger" and "drip" appear only in
this file. No tutorial mode, no scripted first run, no overlay arrows — the
game plays normally from tap one; it just explains each thing once, when it
first becomes real.

## Build order (next session)

1. **The ledger + the cards** — `met` in Progress with the seeded-full
   migration and refusal-safe decode; the twelve moments wired through the
   existing toast/card tiers; RESET TEACHING in the developer fold. Tests:
   decode seeds full for old saves and empty for fresh; each moment fires
   once and only once; one card per action; armed moments survive.
2. **The manual grows + the HUD gates** — sections keyed to the ledger;
   the foot line; WHAT YOU CARRY; LUCK / shop door / survey row gating.
   Tests: a fresh ledger hides exactly the listed sections and chrome; a
   full ledger shows today's manual verbatim.
3. **NUMBERS pruned + tap-the-stat** — the audit above applied; stat taps
   explain in place. Tests: fold count and the kept numbers pinned.

Each stage lands alone and leaves the game whole. Stage 1 is the one that
must exist before the stranger test; 2 and 3 make it honest.

---

## Addendum, same day — two gaps Marc caught in the built pack

**"The colors are not explained (each tiles)."** True: the pack taught every
system and never the four personalities a stranger holds from tap one — the
manual section is pull, and the long-press lens is a gesture nobody is told
about. Four moments joined the ledger (`colourGreen/Yellow/Red/Blue`): each
colour teaches itself as a toast at its FIRST placement, in one sentence
shared by three doors so they cannot drift — the toast, a second tap on the
already-selected card (which used to be a silent no-op and is now the
question it looks like), and a tap on any placed tile, which now names its
colour's personality beside its worth. A colour whose power dial is zeroed
teaches nothing. Devices seeded ALL MET that morning re-arm exactly these
four — one toast each, once, the right cost for words nobody had been shown.

**"Make sure unique and magic are identified on the map too, clearly, after
placed."** The quiet accent edge was the only sign and it vanishes into a
full board. A placed rare tile now wears a STAR above its centre — four
points for magic, five and larger for unique — on a small disc of the
board's own dark so the accent reads on pale terrain. Geometry, not text,
so it survives FIT zoom where labels stay unreadable; offset upward so a
ripe tile's worth number keeps the centre. The rare card and the manual's
RARE TILES line both say the star exists, so the mark is taught by the same
moment that introduces the tile.
