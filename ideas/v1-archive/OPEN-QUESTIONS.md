# Open questions

Genuinely undecided. Each lists the options, the tradeoff, and a recommendation so you are
never blocked — **but flag it rather than silently deciding, if the choice would be
expensive to reverse.**

---

## Q1 — What happens when a waypoint burst fails its seal condition?

The player places on the waypoint and encloses it, but the ring does not satisfy the depth's
seal condition (say it needs one terrain and has three).

| Option | Consequence |
|---|---|
| **A.** The burst still fires and pays a dividend, but the region does not seal. The waypoint is spent and can never seal. | Harsh. One misplacement can cost a whole region multiplier. |
| **B.** The waypoint cannot be *placed on* until `canSeal(state)` is true. | Safest. The UI simply refuses, and the player is never surprised. |
| **C.** The burst fires at reduced value and the region seals with no multiplier. | Middle ground; adds a failure state without a dead end. |

**Recommendation: B.** It makes the seal condition a visible target rather than a trap, and
it composes with `canSeal` which the UI needs anyway. Revisit if it makes sealing feel
automatic.

---

## Q2 — Should visibility stats compete for the same points as power?

Survey currently sits in the same five-stat pool as Craft and Husbandry.

*The tension:* if Survey competes, choosing to know things means giving up power, and the
cartographer becomes a real archetype with a real cost. That is the better game. It is also
a worse first impression — a new player who dumps points into Survey will have a bad run
and not understand why.

**Recommendation: keep it competing.** But surface the effects clearly and consider having
early gold upgrades grant a free point of Survey so nobody is punished for curiosity.
Revisit after the harness reports whether Survey-heavy policies are viable.

---

## Q3 — How much lookahead is right?

One clear tier plus one dim tier lets a player plan two moves and be surprised by the
third. Full visibility to the run's end makes routing a solved puzzle. Less than one tier
means there is no plan to make.

**Recommendation:** one clear, one dim, with Survey 5 adding a tier. Ship it and see
whether anyone actually uses the information.

---

## Q4 — When does the Wake serve a draft?

The Wake collects undrafted tiles, and periodically a draft comes from it instead of fresh.
"Periodically" is undefined.

| Trigger | Note |
|---|---|
| Every Nth draft | Predictable, easy to reason about, easy to game |
| On contract completion | Thematic, but possibly too rare to matter |
| On entering a new region | Gives every region a "here is what you passed on" moment |

**Recommendation:** on entering a new region, plus every 8th draft. Cheap to change.

---

## Q5 — Do hidden realms consume a region slot?

Off-graph (a detour that does not advance `regionNumber`, so cost does not rise) makes them
feel special and rewards the diversion. On-graph is simpler to reason about and prevents
infinite farming.

**Recommendation:** on-graph, but with reduced cost growth. Off-graph risks a degenerate
loop where players only ever visit hidden realms.

---

## Q6 — Does the seal ring scale past what budget allows?

A depth-6 ring of 12 single-terrain hexes, at 6+ tiles per placement, may cost more than
any realistic budget. The seal could become mathematically unreachable before the cost
curve kills the player, which would make deep regions pointless rather than hard.

**Recommendation:** cap the ring requirement by available budget, or scale seal difficulty
on a slower curve than cost. **Watch this in the harness at M6** — it is the most likely
place the design breaks.

---

## Q7 — Art direction

Entirely unaddressed. The prototype's look — dark chrome, vellum board, Fraunces and Space
Mono, loot in gemstone colours — was chosen for speed by the assistant, not briefed by the
designer.

Directions worth considering: cozier and softer (Dorfromantik's own register), more occult
and cartographic, papercraft and cut-paper, or genuine antique-map pastiche.

**Do not build significant UI polish until this is decided.** Structure and layout are safe
to build; palette, type, and texture are not.

---

## Q8 — Session length target

Deliberately not set, because the run is endless and death is a curve (see `DECISIONS.md`
D10). But there is still an implied median, and it drives `startingBudget`, region size,
and cost slope.

**Recommendation:** aim the harness at a median of 10–15 minutes for a competent policy,
with strong runs reaching 25+. Report the actual distribution before tuning anything else.

---

## Q9 — Do chained bursts pay full loot?

Currently the whole chain resolves into one dividend using the best matching count in the
chain. That means a single 6/6 anywhere in a twelve-tile chain guarantees a unique.

Possibly too generous once Ley Lines ranks up. The alternative is that only the
*initiating* burst sets the loot floor, and chained bursts contribute to the pot and tile
count but not to rarity.

**Recommendation:** ship as-is, watch it at M6. If prospector policies dominate the
harness, this is the first knob to turn.
