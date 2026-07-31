# Hearthfall

A cozy hex map-builder with a loot problem. You place one tile at a time, carefully. By
the end of a run, one tile makes the whole map detonate.

**Lineage:** Dorfromantik's placement · Diablo's drop tables and stat points · Vampire
Survivors' snowball · a board game's drafting · Risk of Rain's endless run structure.

**Target:** mobile-first web app (portrait, touch), installable as a PWA. Single player,
offline-capable, no backend required for v1.

---

## Status

Design is settled and documented. **No production code exists yet.** There is a
throwaway single-file prototype in `prototype/` that validates the core loop feel — treat
it as a sketch to play, not as code to extend.

Your job in this session: stand up the repository, choose and install the toolchain,
establish standards, then implement toward the roadmap.

---

## Read in this order

| # | Document | What it's for | Read when |
|---|---|---|---|
| 1 | `DESIGN.md` | What the game is and why each rule exists | First, fully. Everything else assumes it. |
| 2 | `ARCHITECTURE.md` | Stack, project layout, coding standards, testing | Before writing any code |
| 3 | `ENGINE.md` | State shape, schemas, resolution pipeline, determinism | Before implementing the engine |
| 4 | `CONTENT.md` | Every content table — terrains, affixes, biomes, stats, blessings | When building `src/content/` |
| 5 | `ROADMAP.md` | Milestones with acceptance criteria | To plan the work |
| 6 | `DECISIONS.md` | What was decided, what was cut, and why | When tempted to change something |
| 7 | `OPEN-QUESTIONS.md` | What is genuinely undecided | When you hit a gap |

`prototype/prototype.html` — open it in a browser to feel the loop before building.

---

## The one-sentence loop

> Draft one tile of three → place it → matches and bursts pay out → **choose one dividend
> from each burst** → contracts open the waypoint → seal the region → move on, at higher
> cost → repeat until the cost curve kills you.

---

## The three things that matter most

If you internalise nothing else from `DESIGN.md`:

**1. The burst dividend is the keystone.** Every burst forces a choice between tiles,
score, and loot. Never all three. This is what makes builds diverge and what makes the
economy self-balancing — the player prices resources against their own position, live.

**2. Blocked terrain and barren ground count toward enclosure but never match terrain.**
This one ruling creates the game's entire spatial strategy: nooks are cheap bursts with
poor loot, open ground is expensive bursts with great loot.

**3. Death is a curve, not an event.** Placement cost rises per region forever; income is
geometrically capped. The crossing is guaranteed. Skill decides where it happens.

---

## Non-negotiables

- **The engine is pure.** No DOM, no timers, no randomness outside the seeded streams in
  state. `reduce(state, action) -> state` and nothing else. See `ENGINE.md`.
- **Content is data.** Every number, name, and table lives in `src/content/`. If a
  balance value appears in a `.ts` file under `src/engine/`, that's a bug.
- **Mobile portrait first.** Design the layout for a 390×844 viewport and let it grow.
- **No visual polish yet.** The prototype's look is a placeholder chosen for speed, not a
  brief. Build the systems; art direction comes later.
