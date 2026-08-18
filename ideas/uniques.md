# Uniques — the brainstorm

Marc, 2026-08-15: _"unique perks like diablo 2 uniques can determine a build"_,
and then: _"lets brainstorm ideas together thoroughly"_.

**RESOLVED — every entry decided by Marc, 2026-08-18, on option sets.** The
decisions, in full:

- **Uniques are FOUND, never bought.** A new, rare landmark — the hidden
  find — grants one unowned perk when your growing ground reveals it. It
  never beacons: no glow through the dark, no atlas entry, you stumble onto
  it. Marc's words: _"theyre often hidden from plain sight, you need to
  stumble on it."_ The shop keeps only the boring upgrades, plus one new
  boring one: a SENSE upgrade that makes hidden finds shimmer faintly when
  your ground grows near — the shop sells the nose, never the prize.
- **Rootbound and Second Wind convert to found-in-world.** They leave the
  shop; anyone who already bought them keeps them owned.
- **Strictly ONE perk carried, always.** The SECOND SLOT upgrade is deleted
  and its relics refunded on load. A run has one identity; combinations are
  where Diablo's balance went to die, and this game is not going there.
- **Built (findable pool):** Rootbound · Second Wind · **Stonewalker** ·
  **Wallbreaker** · **Open Hand**.
- **Killed:** **Tidecaller** — the closest thing on the list to "a number
  bigger": blue's identity handed to everyone is less identity, not more.
  Offered twice, chosen never.
- **Tier 1 parked post-1.0, whole** (Ashbound Seal, Everbloom, Leap, The
  Hoard) — rejected on scope, not merit; see `ROADMAP.md`'s parking lot.
  They can return when found-in-world has proven itself.
- **The sizing question is answered by the slots decision**: one.

Tier 3 was already rejected in writing. The brainstorm below is kept as the
record of what was considered and why.

**Built the same day** — hidden finds, the findable pool, KEEN NOSE, the
one-slot shelf and the slot refund all shipped 2026-08-18; see `LOG.md`,
Session 22. The written question ("does a hidden find change how a player
grows their ground?") waits on the phone.

## What makes a unique a unique

A Diablo 2 unique is not a bigger number. It is an item that **breaks a rule
the whole game was built on**, and in exchange asks you to build your entire
character around the hole it makes. Enigma gives teleport to a class that
cannot teleport; you then build for it. The test is:

> Does having this change what I do on the very next placement, and keep
> changing it for the whole run?

A perk that only makes a number bigger fails that test. It is an upgrade, and
this game already has upgrades (starting tiles, permanent odds, richer worlds).
Those should stay boring on purpose, so the uniques can be strange.

Two constraints from the project's own rules:

- **Plain words.** A unique earns its name by being played, not by sounding
  like it belongs in a fantasy novel. The names below are placeholders and
  most of them should probably become shorter and duller.
- **Behind a flag, defaulting off.** Each of these is a system.

## The rules available to break

The whole game is eight rules. A unique is worth building roughly in
proportion to how load-bearing the rule it breaks is.

1. A tile may only be placed **adjacent to built ground**.
2. A tile **ripens when it is fully surrounded** by solid things.
3. Popping a pocket **leaves stone**, which surrounds but never matches.
4. Every placement **costs tiles**, and the cost **rises** all run.
5. Worth comes from **matching neighbours**, plus each colour's own power.
6. You choose from a **draft of three**, rerolled every placement.
7. **Walls cannot be built on.**
8. You die when you **cannot afford a placement**.

---

## Tier 1 — the ones that clearly make a build

### Ashbound Seal — _stone matches every colour_

Breaks rule 3. Your popped wake stops being dead ground and becomes the best
ground on the map, for everything, not just red.

**The build:** pop early, pop constantly, and build back across your own
ruins. Turns the whole game inside out — normally you flee your own stone,
here you farm it. Pairs viciously with anything that pops small and often,
which is exactly the play style the luck purse already rewards.

**Risk:** may simply be the best perk in the game and end the discussion.
Wants a cost — perhaps stone matches count for worth but pay no tiles.

### Everbloom — _pops leave open ground, not stone_

Breaks rule 3 from the other side. The same land can be worked forever.

**The build:** one small territory, ploughed over and over, never walking far.
The opposite of every run played so far, which is what makes it interesting —
it turns an exploration game into a gardening game for one run.

**Risk:** an infinite loop if the same pocket can be rebuilt at a profit. Needs
the cost curve to be the thing that eventually kills you, which it already is,
but this wants checking in the harness before it is believed.

### Leap — _place anywhere within 3 hexes of built ground_

Breaks rule 1, the most load-bearing rule there is. Adjacency is the reason the
board is a slow-growing organism instead of a scatter.

**The build:** seed several pockets at once, far apart, and grow them together.
Completely changes the shape of a run on the very first placement, which is the
strongest possible mark in this perk's favour.

**Risk:** the biggest re-write. Ripeness, legality and the beacon logic all
assume contiguity. Probably the most expensive thing on this page to build.

### The Hoard — _no size cap, but only one pocket may be ripe at a time_

Breaks the `harvestSizeCap` that exists purely to stop the mega-bank exploit.
Gives it back — with a leash, because a second ripe pocket forces your hand.

**The build:** one enormous slow-cooking pocket and the nerve to keep feeding
it while the cost curve climbs. High risk, high ceiling, and it directly
attacks the finding that patience is monotonically better — here patience is
also dangerous.

**Risk:** it re-opens an exploit that was closed deliberately. The leash is the
whole design and it must be measured, not assumed.

---

## Tier 2 — good, smaller, cheaper to build

### Tidecaller — _every colour counts distance from home as worth_

Breaks rule 5 by giving blue's power to everything. **Build:** run in a
straight line and let the map pay for the walk. Cheap to build — the mechanic
exists, it is one flag on which colours read it.

### Rootbound — _native ground counts double; off-native counts nothing_

Breaks rule 5 hard. **Build:** read the world before you build, chase biomes,
and let whole regions be worthless to you. Makes the terrain layer the main
character for one run.

### Stonewalker — _placements next to stone cost one less_

Breaks rule 4 locally. **Build:** hug your own wake to stay solvent, which is
in tension with fleeing it for fresh matches. A quiet perk that changes every
placement without changing any rule's shape.

### Wallbreaker — _walls may be built on, at double cost_

Breaks rule 7. **Build:** straight lines through terrain that used to divert
you, and an answer to the `walled` death. Small, legible, and it makes the
world's own obstacles into a resource.

### Second Wind — _the first time you would die, refill to 20 tiles_

Breaks rule 8, once. **Build:** play recklessly early, knowing the floor is
there. Not build-defining so much as tempo-defining, but it changes how much
risk is correct, which is a real change.

### Open Hand — _draft of five, but no held tile_

Breaks rule 6. **Build:** wide choice, no planning ahead. The mirror of the
stash. Trivially cheap to build — both numbers already exist in tuning.

---

## Tier 3 — recorded, and probably wrong

Kept because a list that only contains good ideas is not a brainstorm.

- **Monochrome** — every tile you draw is one colour you name, and green's
  crowd bonus applies to all colours. Reads as a build, but it deletes the
  draft decision entirely, and a run with no choice in hand is a run with
  nothing to do.
- **Half-Ripe** — a pocket ripens with one side still open. Sounds elegant,
  but `ripeTilesMatch: false` already taught us that touching ripeness rules
  collapses the economy in ways nobody predicts.
- **Miser** — pops pay double luck and half tiles. This is a slider, not a
  unique. It makes a number bigger and another smaller and asks nothing.
- **Cartographer** — claimed territories double their radius. A genuine
  upgrade, and it belongs in the boring shop, not here.

---

## The open question the list cannot answer

How many uniques does a run carry? One is cleanest — the run has an identity,
you build to it, and two runs with different uniques are different games. Two
or three invites combinations, which is where Diablo's depth actually lives,
and also where its balance goes to die.

The honest answer is that one is right until a run with one is boring, and
that is a phone question.
