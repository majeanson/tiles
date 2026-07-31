# Hearthfall — game design

The complete rules. Every other document assumes this one.

---

## 0. Identity

**Pitch:** a cozy map-builder with a loot problem.

**The feeling to protect:** calm input, chaotic output. You never act faster. The map just
answers louder. One decision per turn, and it gets more consequential every level.

**No adversary.** Nothing hunts you. Pressure is impersonal and systemic — you versus the
game. Score and depth are the only opponents.

**Endless.** There is no final region and no victory screen. The cost curve guarantees
death; skill determines where on the curve you die.

---

## 1. The turn

1. **Draft** — three tiles face up. Take one; the other two go to the Wake.
2. **Place** — into the current region, adjacent to something already built. Costs tiles.
3. **Resolve** — scoring, bursts, chains, contracts, XP. All automatic except the dividend.

Drafting is the board-game spine: it turns each turn from "solve this" into "choose, then
solve this."

**The Wake.** Undrafted tiles accumulate in a discard pile. Periodically a draft is served
from the Wake instead of fresh. Every rejection is a deposit — and it is the safety net
for tiles discarded because they weren't legally placeable yet.

---

## 2. Tiles

Terrain plus rarity. Rarity determines affix count.

| Rarity | Affixes | Base weight | Placement gate | Stat requirement |
|---|---|---|---|---|
| Common | 0 | 55% | any legal hex | — |
| Magic | 1 | 30% | 1+ placed neighbour | — |
| Rare | 2 | 12% | 2+ placed neighbours | — |
| Unique | 2 fixed, named | 3% | 3+ placed neighbours | yes (see §9) |

Base terrains: **Woodland, Meadow, Hamlet, Water.** Biomes weight these differently.

### Affix hooks

Six hooks only. Every affix is one of these with a number. The cap keeps tooltips readable
and the scoring engine honest. **Do not add a seventh without removing one.**

| Hook | Effect |
|---|---|
| `match` | +N score per matching neighbour |
| `aura` | neighbours score +N% |
| `wild` | counts as matching any terrain |
| `draw` | +N tiles to budget when placed |
| `luck` | +N% loot rarity from bursts on or beside this tile |
| `burst` | bursts on this tile score ×N |

---

## 3. Placement

A tile must go in the current region, on empty unblocked ground, adjacent to something
already built (a tile or barren ground).

### Rarity gates placement

Power costs freedom, not currency. Gate thresholds are in the table above and are reduced
by the Masonry stat.

Three consequences, all intentional:

- **Difficulty curves itself.** Strong tiles need a developed map, so early power is
  self-limiting with no tuning knobs.
- **Commons stop being filler.** They are the infrastructure that builds sockets for
  everything else.
- **Uniques become puzzles, not gifts.** A Vault unique in your opening hand is
  anticipation, not a head start.

### When nothing is placeable

If no drafted tile has a legal hex, the player discards the draft and it **costs one
tile**. Positional failure isn't a separate death — it bleeds you toward the same one.
Keeping your map placeable is a real skill with a visible price.

### Match preview is mandatory

Every legal hex must display the number of matches the selected tile would score there,
before commitment. This is not a convenience feature — it is what makes barren ground
(§5) a decision rather than an accident.

---

## 4. Scoring a placement

```
matches = placed neighbours sharing this terrain (wild counts as any)
base    = matches × (10 + sum of `match` affixes on this tile)
final   = base × (1 + sum of neighbour `aura` values / 100)
                × (1 + Craft stat bonus)
                × (1 + blessing bonuses)
```

**Refund:** matches ≥ refundThreshold grants +1 tile. Base threshold is 4; the Husbandry
stat lowers it to 3, then 2.

---

## 5. Barren ground

**A placement scoring zero matches produces barren ground instead of a tile.**

This is **not a punishment mechanic.** Placing with zero matches is often correct — you
are bridging toward a distant waypoint, reaching an exit edge, or deliberately
manufacturing a nook. The cost is implicit and sufficient: you spent a tile, scored
nothing, and permanently gave up a hex.

Barren ground:

- counts toward **enclosure** (it is solid)
- **never matches** terrain
- scores nothing, satisfies no contract
- counts **half** toward the region fill multiplier
- can never burst

**Masonry 15 (Drystone)** makes barren ground count as matching terrain for enclosure
quality — which turns deliberate barren-laying into a viable engine and creates the Mason
playstyle. A mechanic that is neutral by default, costly if careless, and a weapon if you
build for it.

---

## 6. Bursts, nooks, and chains

A tile **fully enclosed on all six sides** detonates. "Enclosed" counts placed tiles,
blocked terrain, barren ground, and the region boundary — anything solid.

```
score = 60 × (1 + matching neighbours) × `burst` multiplier
```

**Loot rarity floor comes from matching neighbours only:**

| Matching neighbours | Floor |
|---|---|
| 0–3 | Magic |
| 4–5 | Rare |
| 6 | **Unique, guaranteed** |

The Fortune stat reduces the matching requirement for each floor by one.

### Nooks — the most important geometric consequence

Blocked terrain and barren ground count toward enclosure but never match. Therefore:

- A hex in a three-sided alcove needs only three placements to burst — **cheap**.
- Stone matches nothing, so its rarity floor is low — **poor loot**.
- A burst in open ground costs six placements but can hit 6/6 — **guaranteed unique**.

**Nooks are for quarrying. Open ground is for prospecting.** A player can read a region's
shape and know what kind of run it wants to be. This is the single highest-leverage rule
in the game and must not be softened.

### Chains

A burst propagates to adjacent tiles **already fully enclosed but not yet burst**, and
onward. Chain reach comes from Masonry 10 and the Ley Lines blessing.

The constraint is load-bearing: **chains only travel through work already done patiently.**
The cascade pays out stored effort; it never replaces it.

**Chains are a savings account.** A loaded board is visible wealth. Players will
deliberately *not* trigger a chain, letting it grow, waiting until they know whether
they're starving for tiles or hunting a unique. Each tile bursts once per run.

---

## 7. The burst dividend — the keystone

When a burst or chain fires, the player **chooses one payout**:

| Choice | Pays | Horizon |
|---|---|---|
| **Quarry** | tiles | the present |
| **Harvest** | score and XP | the mid-run |
| **Prospect** | a loot tile into the draft, and the Vault | the future |

Never two. **A chain is allocated as one block**, which makes chain-building a commitment
rather than a free lunch.

This is the answer to game balance. There is no static table pricing loot against tiles,
because **the player prices them live against their own position.** A tile is worth little
at 25 in budget and everything at 1. XP is worthless once another level is unreachable.
Loot decays toward its Vault floor as the run ends. The dividend lets the player act on
that instead of the designer guessing it.

It is also where playstyles come from: repeated allocation choices, not flavour text.

---

## 8. Regions

A region is a **bounded space**. That is the entire depletion mechanic — the emptiness is
the meter, and it is already on screen. No hidden counter.

- **Edge entry.** You arrive at one edge, which gives every region a spine and makes the
  far side genuinely far.
- **Blocked terrain inside.** Cliffs, chasms, standing stones. Density varies by biome.
- **Exits sit at specific edges**, so choosing your next region means committing to build
  across this one in that direction. The choice costs hexes.

### Space is the second currency

> **Tiles are your time. Space is your opportunity.**

You can be rich in tiles and out of room, or have acres of empty region and nothing legal
to place. Different failure states, different play. This is where distinct playstyles
actually come from — two scarcities that don't convert into each other.

### Region shape is free content

A region is a *shape*, not just a biome. A long narrow valley makes compact 6/6 bursts
hard and pushes toward chains and roads. A wide basin rewards dense pockets. A gap-riddled
region forces awkward packing. Same rules, completely different play, generated by
geometry alone at zero authoring cost.

### The end of a region is a packing puzzle

The last eight hexes are much harder than the first eight — options narrow and rarity
gates bite, because leftover holes may not offer enough neighbours. A difficulty curve
that emerges from geometry and needs no tuning.

### Sealing

Resolving the waypoint seals the region. **Sealed regions freeze**: nothing fires, no
chains propagate in, no auras reach out. Otherwise late chains become one map-wide bomb
and the numbers stop meaning anything.

Their **quality pays at the end**: each sealed region contributes a final-tally multiplier
from how completely it was filled and how well-matched it was. Building beautifully in
region one costs no chain power and compounds many regions later — which is what keeps
careful, pretty building worthwhile in a game otherwise pushing you to optimise.

```
regionMultiplier = 1 + fillFraction × 0.4 + matchedFraction × 0.2
finalScore = baseScore × product(all sealed region multipliers)
```

---

## 9. Stats — allocatable points

Blessings are random draws. **Stats are deliberate, permanent commitment.** Both exist for
the same reason they both existed in Diablo 2: the combination is what makes a build feel
authored rather than dealt.

**Five stats, one per resource the game actually has.**

| Stat | Owns |
|---|---|
| **Husbandry** | tiles — economy and runway |
| **Craft** | score — matching, auras, burst value |
| **Fortune** | loot — luck, rarity floors, prospect quality |
| **Survey** | information — visibility, draft width, foresight |
| **Masonry** | space — placement gates, chains, geometry |

**On level-up: 2 stat points. Every third level also grants a blessing draft.** Continuous
small allocation punctuated by occasional large random choices.

**No respec.** Commitment is permanent within a run.

### Breakpoints, not curves

Every five points unlocks a named effect. Far more legible than "+2% per point," and
vastly more satisfying to plan toward. Full table in `CONTENT.md`.

**Husbandry 20 (Endurance) — cost rises every *second* region — roughly doubles possible
depth and is the most build-defining node in the game. Treat it as the balance anchor.**

### Stat requirements on uniques

Every unique carries a stat requirement (e.g. Ashfall Plains needs Fortune 12).

**If unmet, the tile still places — but its affixes stay dormant.** The player can see what
it would do and knows they are four points away.

This makes the Vault loadout a build commitment rather than free power, gives stat
investment a concrete pull, and means the same unique is a different card in different
builds.

---

## 10. Advancement — two gates and a window

Both gates, in sequence. They are the two halves of Risk of Rain's teleporter.

**1. Contracts charge it.** Two active at all times, drawn from the region's deck.
Completing two reveals and activates the waypoint. Until then the waypoint hex cannot be
placed on.

**2. The waypoint is the boss.** Place on it, satisfy the region's **seal condition**, and
the whole thing fires as one enormous burst (×2.5 pot) whose dividend the player
allocates. Then the region seals.

### Seal conditions scale with depth

These are the boss fight. They work because they are **inhospitable to normal play** — a
single-terrain ring means hoarding drafts for six or twelve turns while the budget drains.
A period of deliberate vulnerability for a large payoff.

| Depth | Seal condition |
|---|---|
| 1 | Enclose the waypoint, any terrain |
| 2 | Enclose it with at least 4 matching |
| 3 | The ring must be all one terrain |
| 4 | Ring all one terrain, no barren ground touching it |
| 5 | Ring all one terrain, and it must be the region's rarest terrain |
| 6+ | Ring of 12 (two hexes deep), all one terrain |

Masonry 20 (Keystone) reduces the required ring by one hex.

**Walking away from an unsealed waypoint must remain legal.** If the seal is not worth its
cost, the player should be able to leave via an exit edge at a penalty (no region
multiplier for that region). This prevents soft-locks and makes the seal a real decision.

### The window

Between "the way opens" and "you take it" is the best decision in the game. Nothing forces
you through. You can keep building, bursting, farming.

---

## 11. Region economy — when to leave

**Placement cost rises per region entered, not per tile placed.** Within a region, cost is
flat.

```
cost = 1 + (regionNumber - 1) + ebbsSurvived
```

That alone would make lingering free, so **regions deplete spatially** (§8). The two
pressures become:

> Staying yields less and less. Advancing costs more and more.

Depletion beats a global timer here because it is **diegetic** (the land being spent is a
real thing), **cozy-compatible** (nothing chases you; the place is just quiet now), and it
sharpens the window decision from "how long can I afford to stay" into *"is anything left
here worth the price of the next region?"*

**Leaving immediately is always wrong.** There is a floor of value in every region that
must be extracted before moving is worth it. That is what stops rushing from being
degenerate now that no clock is doing it.

---

## 12. The world

Endless. You are routing through it, not completing it.

### Biome adjacency graph

Biomes connect to specific other biomes, so a run is a **route** — "go through the marsh,
because marsh is the only way to bone-fields, and bone-fields is where the Ossuary sits."
Structurally this is Slay the Spire's map expressed as geography: it gives the player a
plan to have, then makes them improvise around it.

### Biomes are parameter sets, not places

An infinite world cannot be hand-authored. A biome is six or eight numbers: tile pool
weights, blocked density, region shape bias, contract deck, palette, landmark table.

Hand-author the first dozen as the recognisable ones, and let deep biomes be **procedural
hybrids and mutations** of those parameters. Depth gets stranger because the numbers drift
into combinations no human placed, which reads as genuinely remote.

### Visibility is a stat

Almost every roguelite treats map information as a fixed constant. Making it a build axis
means information has a price you can choose to pay, and a player can decide to be *the
person who knows things* instead of the person who hits hard.

Three dimensions, all owned by Survey:

| Dimension | What it buys |
|---|---|
| **Depth** | how many tiers of the world graph you see ahead |
| **Detail** | whether you know a region's shape, waypoint position, blocked density |
| **In-region fog** | how much of the current region is revealed before you build into it |

**In-region fog makes placement an act of exploration.** Outline and waypoint are always
visible so a plan is always possible; blocked terrain and landmarks inside stay hidden
until tiles get close.

### Hidden realms

Rare, far off the path, appearing sometimes. Reaching one costs a large fraction of a run,
so it must pay something a normal run cannot produce — a unique that only drops there, a
permanent unlock, a blessing not otherwise draftable.

---

## 13. The Ebb and the Last Light

### The death model

Two curves race for the whole run. **Cost** climbs per region and never stops. **Income** —
refunds, bursts, contracts — climbs with the build but is *geometrically capped*: a
placement touches six neighbours and sets off only so many chains. Income plateaus; cost
doesn't. The crossing is the death horizon.

**Tune the slope, not the length.** A great build should feel like it is outrunning the
curve for a stretch before being reeled in. That window is the whole game.

A good roguelite death needs three properties. Plain "budget hits zero" has none:

- **Legible cause** — you know what killed you
- **Visible approach** — you could see it coming and fight it
- **Agency at the end** — the last moments are decisions

### The Ebb — visible approach

When budget drops below the entry threshold, the game says so: the board desaturates, the
budget readout changes character, a label appears.

**Recoverable, with two guards:**

- **Hysteresis.** Enter below 5, exit above 12. Otherwise the state flickers and stops
  meaning anything. The Ebb should be a place you are genuinely *in*.
- **Scarring the future.** Every Ebb survived raises subsequent region cost by 1
  permanently. Two or three comebacks are possible; each mortgages the future.

The elegance: **your own near-death experiences are what eventually kill you.**

### The Last Light — agency at the end

Budget hits zero and the player gets **one final free placement.** Every loaded chain on
the board fires at once, allocated to a single dividend.

The last act is the biggest decision of the run: where does this tile go to maximise the
cascade? Runs end on their largest number, not their smallest.

### The end screen

Shows both curves, the crossing, and a marker on the turn the Ebb was entered. *"You
lingered eleven tiles too long in region three."* Legible cause is what starts the next run.

---

## 14. Meta-progression

- **The Vault.** Every unique found persists across runs. Slot up to 3 into the next run's
  starting deck, where they appear in early drafts — which is what makes a stat
  requirement worth climbing toward inside a single run.
- **Gold → permanent upgrades.** Starting budget, starting stat points, Vault slots, draft
  rerolls.
- **The campaign is environmental.** Logs drop at landmarks, the best ones in hidden
  realms. No cutscenes, no dialogue, no scripted sequences — the story assembles across
  dozens of runs, and finding a log is itself an unlock. Diablo 2's exploration feeling
  delivered as text files: the version that actually ships.
- **Keepers (starting classes).** Deferred, not cut. Each would carry a starting bias — one
  begins with a unique, one drafts four tiles, one gets bigger chains and a smaller budget.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Barren ground** | result of a zero-match placement; solid, matches nothing |
| **Budget** | tiles remaining; the run's life total |
| **Chain** | a burst propagating through already-enclosed neighbours |
| **Contract** | a regional objective; two completions open the waypoint |
| **Dividend** | the one-of-three choice a burst forces |
| **The Ebb** | the visible decline state when budget falls below threshold |
| **Enclosed** | a tile with all six neighbours solid |
| **Last Light** | the final free placement at budget zero |
| **Nook** | a hex partly surrounded by blocked or barren ground |
| **Region** | a bounded generated space; the unit of progression |
| **Seal** | resolving a waypoint, freezing a region and banking its multiplier |
| **Solid** | placed tile, blocked terrain, barren ground, or outside the region |
| **The Wake** | the discard pile of undrafted tiles |
| **Waypoint** | the region's boss hex; must be enclosed to seal |
