# Human follow-up — after M1–M6

Written 2026-08-15, at the end of the autonomous run through
`ROADMAP.md` M1–M6. Everything here needs Marc, not code. Ordered by what
unblocks the most.

## 1. Play a run. This is the only blocker left.

**https://tiles.marcportal.com** — the bare URL, on the phone, in portrait.
Two things ride on it:

- **Gate B's verdict.** The game now counts your harvest choices and prints
  the tally on every end screen: _"across N runs: X harvests, Y% tiles / Z%
  pts"_. The gate wants twenty pops with neither side over ~70%. Play two or
  three runs and read the line. If it still says 80%+ tiles, the gate's own
  fallback — cut the payout to one automatic choice — is on the table and I
  would rather cut it than pretend.
- **The stranger test.** Someone who is not you, on their own phone, with no
  explanation: do they finish a run and start another? `ROADMAP.md`'s
  definition of done requires it, and it is why **v1.0 is untagged**. The tag
  is one command once you say the word.

## 2. Two decisions I made that are purely yours

Both are one line to change, and the alternatives are still in the build.

- **The name: ASHWAKE.** The wake is the spent ground you leave; ash is what
  it is made of, and the word red's power already used. Lives in
  `src/meta/identity.ts` — change `NAME` and the whole game renames itself.
- **The art direction: torchlit.** Chosen on fit, not taste: its own note
  says "the map is endless because the darkness is", its light-pool does the
  fog job, and its Diablo register is the one the rarity system speaks.
  `?theme=cold-survey` or `?theme=rot-bloom` to compare on the phone;
  `DEFAULT_THEME_ID` in `src/theme/index.ts` to change your mind.

I also renamed the four colours to **MOSS · EMBER · ASH · TIDE**, because
torchlit's own words were CRYPT / CEMETERY / BURIAL GROUND / CATACOMB — four
graveyard synonyms nobody can tell apart at a glance on a card.

## 3. Things I changed that you should know changed

- **The run has a hard clock: 260 placements (~15 min).** This is the fix for
  Gate B, and it was structural, not cosmetic — an economy that only ends in
  bankruptcy makes the last harvest of every run a survival harvest, at any
  tuning. Tiles you never spend are now worth nothing, which is what makes
  taking points a real option.
- **Caches fund survival now** (one every ~6 hexes, 40 tiles). Exploration
  pays the rent so harvests can be about scoring.
- **The size bonus caps at 20.** Hoarding one monster pocket no longer beats
  cashing well and often.
- **I deleted a feature after building it.** Hazards (unstable ground, +cost
  +worth) measured as a trap: the reward sits on the preview number and the
  cost does not, so it punishes players for having learned to read the board.
  Full reasoning in `ideas/endless-world.md`.
- **Five queued ideas were killed unbuilt**, each because another system
  already owns its slot: hidden finds, tile quirks, perk tiles, scout tiles,
  pattern shapes. Reasons are written down; say the word on any of them and I
  will make the case again or build it.

## 4. Open questions I answered myself, flagged for review

- **Gate E opened on three-and-a-half of four gates** (B being the half). If
  you would rather the art freeze had held until B's human verdict, the
  direction reverts in one line.
- **Points inflated.** A good run scores tens of thousands. Nothing breaks;
  it is just big. One constant divides it if you want human-sized numbers.
- **Treasure takes the colour of your selected card.** Letting you pick the
  colour is another tap on a third button; I chose terse.
- **`?ff=-world.endless` still plays the original bounded game.** It has no
  route from the UI. Keep it as a curiosity or delete it — after the stranger
  test, since strangers only ever see the plane.

## 5. What is ready and waiting

- **v1.0 tag** — one command, blocked only on §1.
- **Sound** — you chose a silent 1.0; the pop, the claim and the clock are
  the three moments that most want a noise.
- The rest of the parking lot is at the bottom of `ROADMAP.md`.
