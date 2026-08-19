# Waypoints — a new drop-point on your own world

Marc's ask, 2026-08-19, mid-session: "we need a way to create, in a seeded
map, a new droppoint for future runs — maybe a unique perk that on death
lets you keep this new spawn (or keep the last)?"

**Recorded, not built — because this exact ground holds a buried negative
result.** Where-you-wake was prototyped and FAILED on 2026-08-18
(`WORKPLAN.md` Stage 3 item 4, verdict in `LOG.md` and `STATUS.md`): a far
spawn exploits spawn geometry for a free score advantage, because the
engine's distance-based rules read an implicit ORIGIN, not the run's home —
`tallyWorth`'s blue-tide bonus, deep water's block distance, and the
destination density ramp all pay MORE the farther the coordinates sit from
(0,0), wherever the run actually started. The engine support (`newRun`'s
`wakeAt`) is still in the tree, unreachable, kept so the negative result
can be re-run.

## Why the idea is still good

It is the remembered world's missing verb. Ground persists, territories
persist, caches re-arm — but every run walks the same first ten hexes out
of the same doorstep, and by run ten the near world is solved. A waypoint
turns deep ground into a FRONTIER you can start from, which is the same
promise the fog memory just started keeping ("memory shows what it saw"),
one step further: memory you can stand on.

## The prerequisite (the whole cost lives here)

Audit every distance-based rule in the engine for the implicit origin and
make each one read `homeOf(state)` — or decide, per rule, that it SHOULD
stay world-anchored:

- `distanceMultiplierAt` — the score multiplier. The big question (below).
- blue tide (`blueTideEvery`) — worth per hexes from home.
- deep water (`deepWaterRampBlocks`) — block distance tilting the mix.
- destination density ramp (`destinationRampBlocks`).
- cache grading (`cachePaysPerRing`) and `popTilesPerRing`.
- the survey's `reach20`, the HUD's REACH, `endReachBonus`.

**The design question the audit cannot answer:** should the score
multiplier anchor to THIS RUN's waypoint (every camp is a fresh climb — the
exploit dies, but deep ground stops being worth more than the doorstep
was), or stay anchored to the world origin (deep camps farm deep
multipliers — the exploit becomes the feature, and the economy needs a
price that makes it fair)? That is a Marc fork, and the interesting one.

## The shape, if it ships

A candidate consistent with everything else: **a waypoint is EARNED where
you fell** — a perk (found, never bought — pool of five becomes six) or a
deep-shrine unlock whose grant is "on death, this run's farthest claimed
territory becomes a camp; NEW RUN offers HOME or CAMP". Territories are
already the ground a world keeps, so camping on one adds no new persistence
machinery — `WorldMemory` gains one key. One camp at a time, replaced on
purpose, never accumulated — the one-perk-slot philosophy applied to
geography.

Parked behind the audit. When a session picks this up: re-run the wake
harness first (`wakeAt` still works), fix the origin-readers, re-sweep,
THEN design the earn.
