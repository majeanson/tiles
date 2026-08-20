# Waypoints — SHIPPED as camps (2026-08-19), one earn still parked

Marc's ask, 2026-08-19, mid-session: "we need a way to create, in a seeded
map, a new droppoint for future runs — maybe a unique perk that on death
lets you keep this new spawn (or keep the last)?"

**Resolved and LIVE the same day** — this file said "recorded, not built"
for a day after camps shipped; corrected 2026-08-20, the launch deep-clean:

- **Marc answered the fork below with the anchor call: every camp
  restarts the climb.** Score anchors to `homeOf(state)` — the run's own
  wake hex — so deep camps are a frontier, never a multiplier farm. The
  exploit the 2026-08-18 prototype found is dead by design, not by price.
- **The earn shipped as a fifth shrine rung** (`camp` in `UNLOCKS`), not
  as a perk: wake every shrine plus one more, and **BEGIN AT CAMP** on
  the front door starts a fresh run at the world's farthest territory.
  Detours never camp; a resumed run keeps its own wake.
- **The perk-shaped earn below ("a camp where you fell") stays PARKED**
  in `ROADMAP.md`'s lot — a second, run-earned way to place a camp,
  worth revisiting only if BEGIN AT CAMP proves the appetite.

Everything below is the record that got it there — the buried negative
result, the origin audit that un-buried it, and the fork as it was put to
Marc.

---

**The buried negative result.** Where-you-wake was prototyped and FAILED on 2026-08-18
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

## The prerequisite — DONE (the origin audit, 2026-08-19, same day)

Every RUN-anchored rule now reads `homeOf(state)`, and every WORLD-anchored
rule was ruled world-anchored on purpose:

- **Blue tide read the world origin inside `tallyWorth` — the named
  exploit. Fixed**: `worthOf`/`previewWorth` carry a `home` parameter
  (defaulting to origin), `harvestValue` passes `homeOf(state)`, and the
  UI's every worth read, reach measure and share line passes it too — the
  preview keeps its promise under any home. Pinned in `wake.test.ts`: a
  blue tile at distance 30 pays tide 6 from origin and tide 0 from a wake
  hex standing on it, same board, only home moved.
- `distanceMultiplierAt`, `cachePaysAt`, `harvestMultiplier`, REACH and
  `endReachBonus` already read `homeOf` from the prototype's own pass.
- **Ruled world-anchored, deliberately**: destination density, the deep
  water mix, biomes, native fields, walls — the world's GEOGRAPHY does not
  re-arrange around a camp; only the rewards anchor to it. With scoring
  home-anchored, a deep camp's richer neighbourhood is the point of
  camping, not an exploit.
- `pnpm sim` proven byte-identical by stash-and-rerun: home IS the origin
  in every shipped run, so the audit changed nothing anyone plays today.

**The design question the audit cannot answer:** should the score
multiplier anchor to THIS RUN's waypoint (every camp is a fresh climb — the
exploit dies, but deep ground stops being worth more than the doorstep
was), or stay anchored to the world origin (deep camps farm deep
multipliers — the exploit becomes the feature, and the economy needs a
price that makes it fair)? That is a Marc fork, and the interesting one.

## The perk-shaped earn — the one piece that stayed parked

What shipped instead is the shrine rung above; this candidate remains a
second, run-earned door to the same ground: **a waypoint is EARNED where
you fell** — a perk (found, never bought — pool of five becomes six) or a
deep-shrine unlock whose grant is "on death, this run's farthest claimed
territory becomes a camp; NEW RUN offers HOME or CAMP". Territories are
already the ground a world keeps, so camping on one adds no new persistence
machinery — `WorldMemory` gains one key. One camp at a time, replaced on
purpose, never accumulated — the one-perk-slot philosophy applied to
geography.

**The fork, as it stood when Marc answered it** (he took the first horn —
the anchor call at the top of this file): does a camp restart the climb —
which is what the engine now does naturally — or should crossings-of-depth
pay a priced multiplier? The session that followed was exactly the "one
session, mostly shell work" this paragraph predicted.
