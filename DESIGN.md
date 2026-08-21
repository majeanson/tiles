# DESIGN.md

The working design, as of the 2026-07-31 design pass. This header said
"none of it is proven by a human playing" for five days after that stopped
being true — corrected 2026-08-20, the launch deep-clean: **the design IS
human-proven now** — see "What a human has proven" at the bottom, after
the harness sections, and `LOG.md` for the gates.

**Reading note (2026-08-20):** the body below describes the BOUNDED-MAPS
game this design was written for — maps, LEAVE, the map multiplier, rule
7, the numbers table. That game was deleted on 2026-08-16 (one economy,
for everybody); the endless plane the addenda trace is the shipped game,
and `src/content/tuning.ts` is the only live numbers table. The body is
kept as the record of where the rules came from, not as a description of
what deploys.

`ideas/v1-archive/` is the earlier "Hearthfall" design. Reference, not spec: it
had two scoring channels that could not be priced against each other, and its
economy stops functioning around region 3.

---

## What a run is

You arrive on a small map. You place tiles, arranging colours into pockets.
Tiles that get completely surrounded become **ripe**. You choose when to
**harvest** — every ripe tile pops at once, and a bigger harvest is worth
disproportionately more. Harvesting pays either **tiles** (you live longer) or
**points** (you score), never both.

Popped tiles turn to **stone**. Stone still surrounds things but never matches,
so each harvest makes the map faster to ripen and cheaper in value. Eventually
the map is mostly grey, you take what is left, and you move on — deeper maps
pay more per point.

Placing costs tiles, and the cost rises with every tile you have **ever** placed
this run. It never resets.

## The rules

```
1. Take one of three tiles. Four colours.
2. Place it touching something already on the map.
3. A tile touched on all six sides is RIPE.
   Walls, the map edge, and stone all count as touching.
4. A ripe tile's WORTH = how many of its six neighbours are
   the same colour. Stone and walls never count.
5. HARVEST whenever you like. Every ripe tile pops at once
   and becomes stone. Take either tiles or points.
6. Placing costs tiles. The cost rises the more you have
   placed, all run. At zero: one last tile, one last harvest.
7. LEAVE for a deeper map once you have harvested on this one.
```

Seven rules, zero invented words.

Rule 7 was added during implementation, not designed up front. Leaving had no
cost, so it had no limit: skip to map 40 touching nothing and then farm at a 40×
multiplier. Requiring a harvest first prices depth in the only currency the game
has — you must build something to ripeness and cash it in before you may move on
— and it does so as one sentence rather than as another number to tune. The
alternative, charging tiles to leave, is still open if play dislikes this.

---

## Why this and not v1

v1 scored **twice**: matching neighbours paid on placement, and pops paid again.
Two income streams with no way to price one against the other, which is the root
cause of its broken economy.

Here they are unified. **Matching pays nothing directly — it sets the worth of
the eventual pop.** One channel. Every placement is an investment in a future
payout, and placing one tile visibly raises the worth of up to six neighbours at
once. That tick-up is the moment-to-moment feedback, which is why placement
needs no score popup to feel good.

---

## The escalation dial

The Risk of Rain 2 model needs lingering to be both more rewarding and more
dangerous. It falls out of the rules with nothing added:

**Your half-finished board is stored value.** Every placed tile that is not yet
ripe is a partially-opened chest. The cost counter is global, so time spent
anywhere is spent everywhere.

- **Stay** — cash in setup you already paid for. Efficient. But every placement
  makes every future placement more expensive.
- **Leave** — deeper maps pay more per point, but you abandon an arranged board
  and start from one tile on bare ground.

The pressure to move on **emerges from a single rule** rather than a depletion
meter: popped tiles become stone, stone surrounds but never matches, so the
second harvest on a map ripens faster and is worth less than the first. There is
no hidden counter — the reason to leave is painted on the board.

---

## Why the harvest choice is real

v1's three-way "keystone" had a dominated option. These two sit on different
curves:

| Choice     | Formula                                | Shape                         |
| ---------- | -------------------------------------- | ----------------------------- |
| **Tiles**  | `1 + floor(worth / 2)` per popped tile | **Linear** in harvest size    |
| **Points** | `sum(worth) × count × mapNumber`       | **Quadratic** in harvest size |

Small harvest favours tiles; large favours points. Harvest size changes every
time and proximity to death changes constantly, so **the crossover moves all
run**. Structural, not hopeful.

**The harness confirms this one.** Three policies that differ only in this
choice: always-tiles scores 0 at depth 7, always-points dies on map 1, and only
the mixture reaches map 5 with a real score. If the choice were fake, one of the
two pure strategies would have won. This is the design's strongest joint — and
note that it is the payout choice that works, not the timing choice below.

---

## Numbers

All of these live in `src/content/tuning.ts`, and a run carries its tuning in
its state rather than importing it — so `pnpm sim --set costRisesEvery=60`
reruns the whole economy from one command, and a replay still knows which
economy it was recorded under.

| Constant              | Value                                             |
| --------------------- | ------------------------------------------------- |
| Starting tiles        | 30 — was 40; see the note under this table        |
| Cost per placement    | `1 + floor(placements / 70)` — was `/ 100`        |
| Tiles per popped tile | `1 + floor(worth / 2)` → 1 to 4                   |
| Points per harvest    | `sum(worth) × (1 + bonus × (count − 1)) × mapNo`  |
| Harvest size bonus    | 1 — at 1 the above is the original quadratic      |
| Map size              | radius 4 (61 cells), +1 every 3 maps, capped at 6 |

**2026-08-04 re-target.** The first human session banked 134 tiles without
ever feeling the curve, so the cushion and the curve moved (40→30, 100→70).
At the new numbers random-legal dies on map 1, survivor caps ~325 placements,
and the endless timing optimum shifts from a 40-pocket to a 15-pocket — the
dial answering to tuning, which is what a live decision does. Still unmet:
"competent play reaches map 6–8" (farm reaches 4). Open tuning job.

**These cannot be settled on paper.** Income per placement is
`(pops per placement) × (tiles per pop)`, and pops-per-placement swings between
roughly 0.3 and 1.0 purely on how well the player packs — which is the skill
expression we want, and the reason the harness exists.

The harness has one job: move the `100` and the `/2` until competent play reaches
**map 6–8 in 15–25 minutes** and careless play dies on map 2.

> **Reading note (2026-08-21).** The paragraph above, and the maps it counts,
> belong to the BOUNDED game — deleted 2026-08-16 when the endless plane
> became the only economy. Kept as history, like the rest of this file's
> bounded body. The endless run's own shape, measured: **run one is about
> 120–165 placements, roughly eight minutes**, and a maxed shop climbs to
> ~230–250 and fifteen to twenty. `src/content/tuning.ts` carries the swept
> ladder those come from.

Cost climbs linearly forever; income is capped by geometry at one pop per
placement. **The curves must cross** — death is guaranteed by structure, not by
tuning.

## Rush versus farm

- **Farm** — fill maps completely. Near-perfect ripening, big tile income, long
  run, but you arrive at deep maps expensive.
- **Rush** — one tight blob, harvest, leave. Poor efficiency, but you reach high
  map multipliers while placements are still cheap.

The farmer dies rich and shallow, the rusher poor and deep. Comparable scores by
different routes is the tuning signal.

---

## How complexity arrives

Run one is the seven rules. No stats screen, no tutorial, no glossary.

| Unlock | Adds                                                     |
| ------ | -------------------------------------------------------- |
| 1      | A third harvest option: take a special tile              |
| 2      | Special tiles — one power each, from a list of four      |
| 3      | A choice of two maps when you leave. Routing begins      |
| 4      | A perk pick every few maps                               |
| 5      | Deeper map types with their own wall patterns and shapes |

---

## What the harness proved

Run it yourself with `pnpm sim`. Numbers below are medians over 40 seeds at the
default tuning.

**Rule 5's timing decision is fake, and the reason is worse than we thought.**
`farm` and `trickle` differ in nothing but _when_ they cash in — both pack every
map to exhaustion. Farm banks everything to the end and scores **28031**;
trickle harvests at three ripe and scores **643**. Forty-three times.

The suspected cause was the quadratic term. It is not, or not only: with
`harvestSizeBonus=0`, making points strictly linear in harvest size, farm still
beats trickle 716 to 186. The real cause is the rule we were relying on to
_create_ the tension:

> Popped tiles become stone. Stone surrounds but never matches.

An early harvest does accelerate ripening nearby — but what it accelerates is
the ripening of _low-worth_ tiles, because everything placed against that new
stone can never match it. Harvesting early does not trade value for speed. It
destroys the board's capacity to be worth anything, permanently, and no setting
of `harvestSizeBonus` compensates.

Two dials exist to attack this and neither is right yet:

- `harvestSizeBonus` (0 → 1) moves points from linear to quadratic in harvest
  size. At every value, banking wins.
- `ripeTilesMatch: false` makes a tile that is sitting ripe stop feeding its
  neighbours. It over-corrects violently: a full-map harvest is then worth
  _exactly zero_, farm scores 0, and the decision inverts rather than balancing.

**This is the open design problem.** It is pinned as a failing design in
`src/sim/sim.test.ts`, so a real fix has something to flip.

**2026-08-04 addendum — the fix has a shape, and it is structural.** Session 3
built the endless world (`ideas/endless-world.md`, behind
`world: 'endless'` in tuning): one unbounded plane, harvest pops one connected
ripe cluster, points multiply with distance from home. There the timing dial
has an interior optimum with a cliff past it — bank a pocket to ~40 and cash
it, 7,380; try for 80 and die with it unpopped, 0 — while on the bounded map
the same dial is monotone all the way up to 4× farm's score with no risk.
Banking works on the bounded map because "map full" hands you the cash-in
moment for free; take away the wall and WHEN becomes yours to misjudge. Pinned
in the same test file, harness-proven only — no human has played it, and it
has no UI to be played on yet.

**2026-08-13 addendum — the plane got destinations and loot, and the optimum
moved.** Session 6 built P3b (`ideas/endless-world.md`): destinations
(cache / site / claimable territory) and draft rarity with luck, on only in
the endless tuning. Harness-proven only: caches act as lifelines, so the
sustainable banking pocket grew from ~15 back to ~40 — the timing dial
answered to a STRUCTURAL change this time, cliff intact, exploits still dead.
Still true that no human has played any of it.

## What the harness confirmed

**The tiles-or-points choice is real, and it is the run's spine.** Three
policies differing only in that choice:

| Policy     | Choice        | Depth | Points |
| ---------- | ------------- | ----- | ------ |
| `survivor` | always tiles  | 7     | 0      |
| `hoard`    | always points | 1     | 3921   |
| `farm`     | mixed         | 5     | 28031  |

Always-tiles lives longest and scores nothing; always-points dies on the first
map. Only the mixture gets anywhere. Gate B's "no option taken more than ~70% of
the time" now has a mechanism behind it rather than a hope.

**Packing well is worth 28×.** `blind` places in the first legal hex and scores
986; `farm` reads colour and scores 28031. The skill the board asks for is real.

**Depth is reachable by opposite routes.** `rush` gets to map 5 in 40
placements, `farm` to map 5 in 327. Gate C's third clause holds — though rush
arrives with almost no score, so "comparable scores by different routes" does
not yet.

---

## What a human has proven (2026-08-20, from the two debriefs)

The harness sections above end "no human has played any of it." That went
stale in stages and is corrected here, with the evidence in `LOG.md`
(Session 26 and the 2026-08-15 debrief) and `FOLLOWUP.md`:

- **Placing feels right** — Gate A's condition, met on a full phone run
  against prod (2026-08-15).
- **The run is FUN, and long because of its own systems** — two full runs
  (11k and 4k points, 2026-08-19), "I had fun", the longer run longer
  _because of the tile caches_ — Marc's own attribution. The harness's
  claim that caches act as lifelines is now a human sentence.
- **The rebalance verdict is positive** — the lean start did not read as
  punishing; the far caches fund the push outward exactly as swept.
- **The advantages ARE bought** — luck spent in play, TITHE taken
  deliberately at a run's end (its question closed YES on first contact).
  Whether pop-vs-burn-vs-wait reads as a _timing_ decision is the
  half still open.
- **Score and feel are two separate rewards, by ruling** (2026-08-19) — a
  cache/shrine/find-rich run may feel better than its score says, and
  that is the design, not a bug.
- **Still unproven by any human**: the stranger test — the v1.0 tag's one
  remaining gate — and sound's written question (does the ♪ change WHEN
  players pop?).

---

## Committed constraints

Mobile portrait first, touch. Pure TypeScript engine + canvas renderer. Crunchy,
plain words. Player chooses rush or farm. The chase is score, depth, and
unlocking new things.
