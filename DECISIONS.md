# Decisions waiting for you

Written 2026-08-15. Everything here is a call I either made on your behalf or
deliberately left open. Each one lists the options and my recommendation, so
you can answer in a word — "D3: b" is a complete reply, and I will do the
rest. Grouped by what has to happen first.

**Nothing here is urgent except group A**, which is blocked on one play
session (`PLAYTEST.md`).

---

## A. Blocked on your next play

### D1 — Gate B's verdict

Read the tally line on the end screen after two runs.

- **a.** Neither side over ~70% → the gate passes, I write it into `LOG.md`
  with your number as the evidence, and Gate B closes for good.
- **b.** Still 80%+ one way → the gate's own fallback: cut the payout to ONE
  automatic choice and delete the other button. Painful but honest.
- **c.** Close but not clean (70–80%) → one more tuning pass on the clock and
  the cache density, then re-measure.

_Recommendation: whatever the number says. This is the one decision I refuse
to pre-judge._

### D2 — The boring stretch

- **a.** Gone — bounties fixed it.
- **b.** Still there → next build adds a mid-run escalation (the plane gets
  harder or richer past a threshold) rather than more content.
- **c.** Worse — too much is happening now.

_Recommendation: none. This is a report, not a choice._

### D3 — Run 2 vs run 1 (P4a's question)

- **a.** Better — knowing the map makes the second run richer. P4a stands.
- **b.** A commute — the world remembering makes it duller. Then fog memory
  becomes optional, or worlds get retired after N runs.

_Recommendation: (a) if it is close, because the alternative is a lot of
machinery to unwind. But (b) honestly if it is dull._

### D4 — The stranger test

Someone who is not you, on their own phone, unaided.

- **a.** They finished and started another → **I tag v1.0.**
- **b.** They bounced → tell me where, and that becomes the next milestone.
- **c.** Skip it; tag v1.0 anyway on your own judgement.

_Recommendation: (a) or (b). It is the last item on the roadmap's definition
of done, and it is the only one no amount of code can produce._

---

## B. Identity — mine to propose, yours to veto

### D5 — The name

- **a.** Keep **ASHWAKE**.
- **b.** Something else (tell me the word; it is one constant in
  `src/meta/identity.ts`).
- **c.** Go back to "tiles".

_Recommendation: (a). The wake is the spent ground you leave, ash is what it
is made of, and the rules named the title rather than the other way round._

### D6 — The art direction

- **a.** Keep **torchlit** — dark, gold, one torch, endless because the dark
  is.
- **b.** **cold-survey** — forensic daylight, muted, beautiful.
- **c.** **rot-bloom** — diseased greens, creeping wrongness.
- **d.** Keep torchlit but commission real art for its slots (every slot is
  declared and empty on purpose).

_Recommendation: (a), and (d) eventually. Compare on the phone first:
`?theme=cold-survey`, `?theme=rot-bloom`, `?theme=torchlit`._

### D7 — The colour names

- **a.** Keep **MOSS · EMBER · ASH · TIDE** — each names its power.
- **b.** Back to torchlit's originals (CRYPT / CEMETERY / BURIAL GROUND /
  CATACOMB).
- **c.** Plain colours (GREEN / YELLOW / RED / BLUE).

_Recommendation: (a). The originals are four graveyard synonyms; plain
colours teach nothing._

---

## C. Economy — cosmetic to structural

### D8 — The points scale

A good run scores tens of thousands.

- **a.** Leave it — big numbers are fine in a scoring game.
- **b.** Divide by 10 (a good run ≈ 3,000).
- **c.** Divide by 100 (a good run ≈ 300).

_Recommendation: (b) if the numbers feel meaningless on screen, (a)
otherwise. One constant either way._

### D9 — Run length

Currently 260 placements, about 15 minutes.

- **a.** Right.
- **b.** Shorter (200 ≈ 11 min) — tighter, more runs per sitting.
- **c.** Longer (320 ≈ 19 min).
- **d.** Make it a setting the player picks.

_Recommendation: (a) until you have played two full runs; (d) is tempting and
also the way a game avoids choosing._

### D10 — Difficulty

- **a.** Right.
- **b.** Too easy — I tighten the cache density or the cost knee.
- **c.** Too punishing.

_Recommendation: none; this needs your hands._

---

## D. Scope — what the game is, and is not

### D11 — The bounded game

The original bounded-maps game still exists behind `?ff=-world.endless`, with
its own passing tests, and no route to it from the UI.

- **a.** Delete it. One world, one game, less to maintain and explain.
- **b.** Keep it as a hidden mode.
- **c.** Give it a real entry in SETTINGS as a second way to play.

_Recommendation: (a), after the stranger test — strangers only ever see the
plane, so it is dead weight the moment 1.0 ships._

### D12 — Sound

You chose a silent 1.0.

- **a.** Stay silent.
- **b.** Minimal pass: the pop, the claim, the clock running out.
- **c.** Full pass designed with the art direction.

_Recommendation: (b) as the first post-1.0 job. The pop is the game's one
moment of release and it currently makes no noise._

### D13 — A leaderboard

- **a.** No — share links are enough.
- **b.** Yes, per-seed ("beat my run on this world") — small backend, real
  abuse questions.
- **c.** Yes, global — bigger backend, bigger abuse questions.

_Recommendation: (a) for now. (b) is the interesting one because the seed
already makes runs comparable._

### D14 — Multiple / shareable worlds

- **a.** One world per device, as now.
- **b.** Shareable world codes (`?world=N`) so a world can move between your
  phone and desktop, or be raced.
- **c.** Save slots for several worlds.

_Recommendation: (b) eventually — it is cheap and it makes "my world" a thing
you can hand to someone._

---

## E. Process — how we work from here

### D15 — What the next session is

- **a.** Whatever your play report says is broken.
- **b.** Post-1.0 polish (sound, share art, the app-store question).
- **c.** A new system entirely (say which).
- **d.** Nothing — sit with it and play for a while.

_Recommendation: (a), then (d). The game has had sixteen sessions of building
and about forty minutes of playing._

### D16 — Autonomy

- **a.** Keep going as in this run: long autonomous stretches, decisions
  noted and made, follow-up at the end.
- **b.** Smaller batches with a check-in per milestone.
- **c.** Ask before anything structural.

_Recommendation: (a) for building, (c) for anything that changes what the
game IS — the clock and the cost knee in M1 were arguably (c) decisions that
I made under (a)._
