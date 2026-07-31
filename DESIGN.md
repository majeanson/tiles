# DESIGN.md

**This file records only what play has proven.** Intentions go in `LOG.md` as
questions; they graduate to this file once a prototype has answered them.

It is nearly empty on purpose. The predecessor design (`ideas/v1-archive/`) ran
to 2,600 words of confident specification without a single validated claim, and
its economy stops functioning around region 3. Confidence on paper is not
evidence.

---

## Proven

Nothing yet.

---

## Committed constraints

Not proven, but decided and expensive to reverse — so they are written down.

- **Mobile portrait first** (390×844), touch. Desktop is occasional.
- **Pure TypeScript engine, canvas renderer** (PixiJS). The engine runs headless
  at full speed, which the balance harness requires.
- **Crunchy roguelite, plain words.** Depth comes from few rules interacting,
  not from many systems. Simple on run one; deeper by unlock.
- **Risk of Rain 2 run structure.** The player chooses whether a session is a
  rush or a farm. This is the shape, not yet a mechanic.
- **The chase is score, depth, and unlocking new things.**

---

## The candidate core

Front-runner, inherited from v1 and not yet validated:

- A hex board, bounded per region.
- Draft one tile of three; place it adjacent to something already there.
- Matching neighbours score.
- A tile enclosed on all six sides **pops**, paying out a choice.
- **Solid is not the same as matching.** Blocked ground and dead ground count
  toward enclosure but never match terrain. This is the single rule most worth
  keeping from v1: it makes the shape of a map legible as strategy at zero
  authoring cost.
- Placing costs tiles; tiles are the run's life total.

The payout starts as **two options — tiles or points**. A third is the game's
first unlock, not part of the base game. v1 shipped three and called the choice
its keystone; the arithmetic suggests one of the three was dominated.

---

## The open problem

**Nothing yet makes lingering both more rewarding and more dangerous.** Risk of
Rain 2 works because both curves rise together. v1 only depleted — staying
yielded less and less — which turns "when do I leave" into arithmetic rather
than a decision.

Three candidates, to be built off one shared core and played back to back:

| Variant          | The dial                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Depth**        | Cost rises per region; regions merely deplete. The v1 baseline, kept as the control                       |
| **Consumption**  | One meter driven by tiles placed and space consumed. It raises cost _and_ raises payout, and never resets |
| **Encroachment** | Dead ground spreads the longer you stay, closing space. Containing it pays well                           |

This is the most important unanswered question in the project.
