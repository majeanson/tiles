# DESIGN.md

The working design, as of the 2026-07-31 design pass. **Not yet proven by play** —
see "What is fragile" at the bottom, and `LOG.md` for the gates.

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
```

Six rules, zero invented words.

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

---

## Numbers

| Constant              | Value                                |
| --------------------- | ------------------------------------ |
| Starting tiles        | 40                                   |
| Cost per placement    | `1 + floor(placements / 100)`        |
| Tiles per popped tile | `1 + floor(worth / 2)` → 1 to 4      |
| Points per harvest    | `sum(worth) × count × mapNumber`     |
| Map size              | ~50 usable cells, growing with depth |

**These cannot be settled on paper.** Income per placement is
`(pops per placement) × (tiles per pop)`, and pops-per-placement swings between
roughly 0.3 and 1.0 purely on how well the player packs — which is the skill
expression we want, and the reason the harness exists.

The harness has one job: move the `100` and the `/2` until competent play reaches
**map 6–8 in 15–25 minutes** and careless play dies on map 2.

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

Run one is the six rules. No stats screen, no tutorial, no glossary.

| Unlock | Adds                                                     |
| ------ | -------------------------------------------------------- |
| 1      | A third harvest option: take a special tile              |
| 2      | Special tiles — one power each, from a list of four      |
| 3      | A choice of two maps when you leave. Routing begins      |
| 4      | A perk pick every few maps                               |
| 5      | Deeper map types with their own wall patterns and shapes |

---

## What is fragile

**Is there ever a reason to harvest early?** Points scale quadratically with
harvest size, so banking everything until the map is finished looks strictly
better. The counter-argument is real but may not be strong enough: harvesting
early turns tiles into stone, stone accelerates ripening nearby, so an early
harvest can yield more total pops.

If that does not hold, rule 5 collapses into "harvest when the map is done" and
the timing decision is fake. **First thing the harness must test.** Likely fix:
ripe tiles stop counting as matching neighbours, so banking costs you worth.

---

## Committed constraints

Mobile portrait first, touch. Pure TypeScript engine + canvas renderer. Crunchy,
plain words. Player chooses rush or farm. The chase is score, depth, and
unlocking new things.
