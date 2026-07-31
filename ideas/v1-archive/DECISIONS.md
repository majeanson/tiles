# Decision log

Settled decisions and the reasoning behind them. **Consult this before changing a rule
that seems arbitrary — most of them are load-bearing.**

---

## D1 — No adversary

Pressure is impersonal and systemic. Nothing hunts the player.

*Why:* the game is cozy by intent, and an enemy would fight that tone. Vampire Survivors
demonstrates that pressure without agency still creates tension — density rises on a
schedule, indifferent to you. Our equivalent is the cost curve.

*Consequence:* score has to be interesting enough to chase on its own, and the run needs a
peak rather than a fade. That is why the Last Light exists.

---

## D2 — The burst dividend is the keystone

Every burst forces a choice between tiles, score, and loot. Never all three.

*Why:* it makes the economy self-balancing. A static table pricing loot against tiles would
always be wrong, because value is a curve over the run — a tile is worth little at 25 in
budget and everything at 1. The dividend lets the player reprice live against their own
position.

*It is also where playstyles come from.* Repeated allocation choices produce archetypes;
stat text does not.

**Do not add a fourth option, and do not let any effect grant two dividends at once.**

---

## D3 — Blocked and barren count toward enclosure but never match

*Why:* this single ruling generates the entire spatial strategy layer. Nooks become cheap
bursts with poor loot; open ground becomes expensive bursts with great loot. Terrain shape
therefore tells the player what kind of run a region wants to be, at zero authoring cost.

**This is the highest-leverage rule in the game. Do not soften it.**

---

## D4 — Barren ground is a move, not a punishment

Zero-match placements produce barren ground. No penalty framing, no extra cost.

*Why:* placing with zero matches is often correct — bridging to a waypoint, reaching an
exit edge, manufacturing a nook deliberately. Treating a legitimate tactical option as a
failure state made it feel like noise rather than a decision.

*Guards:* match preview before commitment is mandatory, barren counts half toward fill, and
Masonry 15 turns deliberate barren-laying into a viable engine.

---

## D5 — Regions are bounded; the world is not

*Why:* bounded regions make space a second currency that does not convert into tiles, which
is what allows genuinely different builds. And the emptiness renders the depletion meter
for free — no hidden counter.

Nothing traps the player: there is always an exit, and `LEAVE_REGION_UNSEALED` exists
precisely so a hard seal condition can never soft-lock a run.

---

## D6 — Cost rises per region, not per tile

*Why:* per-tile cost is Risk of Rain's clock and punishes lingering directly. Per-region
cost makes lingering free — which would be a flaw except that **spatial depletion supplies
the anti-lingering pressure instead.**

Depletion is better here: it is diegetic (the land is spent), cozy-compatible (nothing
chases you), and it reframes the window decision from "how long can I afford to stay" into
"is anything left here worth the price of the next region?"

---

## D7 — Both advancement gates

Contracts open the waypoint; resolving the waypoint seals the region.

*Why:* they are the two halves of Risk of Rain's teleporter — charging it and fighting the
boss. The gap between them is the window, which is the best decision in the game and costs
nothing extra to build.

---

## D8 — The Ebb is recoverable, with two guards

*Why:* comebacks are the best stories a roguelite produces, and a one-way spiral makes the
last stretch of every run a formality.

*Guards:* hysteresis (enter <5, exit >12) prevents flicker, and each survived Ebb raising
future cost prevents free drama. The result is that **the player's own near-death
experiences are what eventually kill them.**

---

## D9 — Stats are allocatable and permanent; blessings are drafted

*Why:* Diablo 2 had both for a reason. Stats give deliberate long-term commitment;
blessings give the Vampire Survivors snowball. The combination makes a build feel authored
rather than dealt.

**No respec.** Breakpoints rather than smooth curves, because "+2% per point" is
unplannable and "Husbandry 15 unlocks Abundance" is a goal.

---

## D10 — Endless, with inevitable death

No final region, no victory screen.

*Why:* it makes the tuning target the *slope of the cost curve* rather than a run duration.
A great build should feel like it is outrunning the curve for a stretch before being reeled
in. That window is the whole game.

---

## D11 — Six affix hooks, hard cap

`match`, `aura`, `wild`, `draw`, `luck`, `burst`.

*Why:* the cap keeps tooltips readable and the scoring engine honest. Every proposed
seventh hook so far has been one of the six renamed.

**To add one, remove one.**

---

## Cut, and why

| Cut | Reason |
|---|---|
| In-run shop | Level-up blessings do the same job more often with better pacing |
| Chapter modifier draft | Same |
| Aftershock (spent tiles paying bonuses) | Spent tiles are the game's only spatial cost; making dead space profitable removes it |
| Adversary of any kind | See D1 |
| Terrain height / waterfalls | A Z-axis on a 2D hex game: large complexity, modest payoff |
| `echo` and `anchor` affixes | `echo` is `luck` renamed; `anchor` implies negative chain effects that do not exist |
| Global time-based cost clock | Replaced by per-region cost plus spatial depletion, which is diegetic. See D6 |
| Hard map bounds | Regions are bounded; the world is not. See D5 |
| Persistent cross-run map | Score-attack wants a fresh board. The campaign lives in environmental logs instead |
| Static power-budget balance table | Superseded by the dividend. See D2 |

---

## Reference lineage

Useful when a decision seems strange — most have a precedent that explains them.

| System | Borrowed from |
|---|---|
| Tile placement, region completion satisfaction | Dorfromantik |
| Rarity tiers, affix rolls, uniques, stat requirements, stat points | Diablo 2 |
| Level-up draft, six slots, evolutions, snowball | Vampire Survivors |
| Draft one of three, the Wake | board game drafting (7 Wonders, Res Arcana) |
| Endless regions, difficulty as a curve, the window, seal-as-boss | Risk of Rain |
| Route planning with limited lookahead | Slay the Spire |
| Environmental storytelling via logs | Risk of Rain, Dark Souls |
