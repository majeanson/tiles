# PLAYTEST.md — the launch-week phone script

Rewritten 2026-08-20. The previous version of this file was a 2026-08-15
script for a game that no longer exists — a fixed 260-placement clock,
Gate B's tally, theme URLs for directions since deleted — and it was
actively misleading with a launch five days out. This is the live script;
`FOLLOWUP.md` carries the full question list this file walks.

**Always against https://tiles.marcportal.com, on the phone, in
portrait.** Reload twice first (or tap NEW VERSION) so the build is
today's.

## Session A — the stranger rehearsal — ✅ PLAYED 2026-08-20, ✅ RE-RUN 2026-08-26, ✅ RE-RUN 2026-08-28

**2026-08-28, on build `148b219`: clean. Marc played it and wrote down
nothing** — no moment where the screen failed to say what he needed.

That is the third consecutive empty fix list, and this time it was owed
hardest: the first minute had changed twice since the last rehearsal and once
more the same day. The bottom of the screen became one hand and one action bar
(2026-08-27), and then the teaching itself changed (2026-08-28) — the RIPE card
carries the six-around-one figure now, the four-grounds card shows the real
baked tiles instead of flat swatches, THE COLOURS stopped reading "■ ASH —
ash.", and the daylight palette was repainted from the ladder up. **None of
that had been seen by a human before this run.** It has now, and it holds.

The four risk checks from `NEXT.md` §2 rode along with it.

**The re-run's verdict (LOG Session 47): the first run teaches itself.**
Every card at its moment, no gaps written down. The script below stays for
the next time a build changes the first minute.

Marc played it and reported as he went; everything he named was built the
same night (LOG.md Sessions 35–38, and the audit batches after them). Kept
below as the script, because it is the one to re-run after a build that
changes the first minute — which the Day-2 batch did, twice.

**Re-run it before Session C.** The first minute is not the one this
rehearsal saw: HOW TO PLAY opens the tutorial again, the GLOW card waits for
RIPE, SACRIFICE waits until relics have a name, NEW RUN sits under the score
instead of two screens below it, and the first pop can no longer score zero.

**Owed again after 2026-08-27**, which changed the first minute a third time
and is the largest of the three: the bottom of the screen is one hand and one
action bar (the board went from ~53% to 69–73%), held cards sit in the hand
rather than on their own row, the four-grounds and purse cards teach as
marked lists, TITHE is SACRIFICE LUCK in red, and a ✕ above `?` drops the
colour lens. None of it has been seen by a human on a phone.

1. `?` ▸ MENU ▸ SETTINGS ▸ **RESET TEACHING** (it forgets only
   the lessons; your game survives). SETTINGS is its own screen since
   2026-08-25 — reachable there, or from MORE on the front door.
2. **BEGIN DAILY.** Play it cold. This is the closest thing to a
   stranger's run one that exists on your phone: plain economy, full fog,
   first-contact card and all.
3. Write down every moment you needed something the screen did not say —
   those sentences are Day 3's fixes.
4. One **home** run after, for the relic/purse lessons the daily
   deliberately suppresses.
5. The eleven look-at-its (`FOLLOWUP.md` §2) in one sweep on the same
   world: fog, anchors, lens, reborn landmarks, ember, rarity colours,
   pop cascade, wording, shelf count, fame folds, relic pace.

## Session B — the verdict run — ✅ PLAYED 2026-08-26, ✅ RE-CONFIRMED 2026-08-28

**Both answers in (LOG Session 47): pop-vs-burn-vs-wait FELT LIKE A
DECISION (first datapoint on the standing v1.1 question), and the relic
pace EARNS.**

**Both still hold on 2026-08-28**, which is a confirmation rather than a
re-test and should be read as one: `pnpm sim` is byte-identical across every
commit since, so not one number in `content/` or `engine/` has moved. What
changed is the screen. A second datapoint on the standing v1.1 question, from
the same player — worth exactly what that is worth, and no more.

**The freeze this session declared was LIFTED on 2026-08-27**, by Marc,
after playing ROOTBOUND to a 52k high and asking for it repriced. See
"Standing rules" below.

One long home-world run, two questions:

- **Pop-vs-burn-vs-wait** — does WHEN feel like a decision? (A standing
  v1.1 question by your ruling; still worth the first datapoint.)
- **The relic pace** — `FOLLOWUP.md` §4 has the numbers; do early runs
  feel like they earn?

## Session C — the stranger test (was the v1.0 gate; **v2.0's gate, on Ashwake 2**)

**A and B are paid as of 2026-08-28. This is the only thing left — and by
`DECISIONS.md` D25 it is run on the new body in `../ashwake`, not on this one.**
The script and the sheet below are unchanged and carried over there.

One person who is not you. Their phone. Send the link, say nothing
beyond "try this". Watch the first minute only, then leave them alone.

- Record: did they place without help? pop? finish? **start another?**
- The last one is the gate. Evidence goes in `LOG.md`; `DECISIONS.md` D4
  gets its answer; the tag follows on Day 5.

### The sheet — filled in as it happens, not from memory afterwards

Written before the run rather than during it, because the one thing that
cannot be recovered is what a person did in their first minute. Four facts and
a list; nothing here needs a verdict at the time.

```
DATE / DEVICE            ______________  (iOS or Android, and roughly which)
SKIN IT OPENED IN        ______________  (auto picks: light phone → daylight)

1. PLACED A TILE UNAIDED                    yes / no      after how long? ____
2. POPPED A POCKET UNAIDED                  yes / no
3. FINISHED THE RUN                         yes / no
4. STARTED ANOTHER            ← THE GATE    yes / no

EVERY QUESTION THEY ASKED OUT LOUD  (each one is a bug, verbatim)
  -
  -

EVERY PLACE THEY HESITATED, AND FOR HOW LONG
  -
  -

WHAT THEY DID THAT THE GAME DID NOT EXPECT
  -
```

**The two rules that make it worth anything.** No coaching — a question they
ask IS the bug, and answering it destroys the datapoint you are there to
collect. And a confusing moment is a FINDING, not a failure: one sentence
each, no fixes at the table.

**If they start another run**, that is D4 answered and the tag follows. **If
they do not**, the reason they stopped is the most valuable sentence this
project has ever collected, and it names the next milestone rather than
failing the game.

## Standing rules

- A confusing moment is a FINDING, not a failure — one sentence each.
- No coaching during the stranger test. A question they ask IS the bug.
- **The tuning freeze is lifted (2026-08-27).** This line used to read
  "nothing retunes after Session B; launch-day changes are copy and
  crashes only", and it was a good rule right up until play disagreed
  with a number. Marc found ROOTBOUND, doubled his score on the first
  placement of a run, scored a 52k high, and asked for it repriced — and
  a rule that would have shipped a known-broken perk to strangers in
  order to protect a schedule is the wrong rule. What replaces it is not
  "retune freely": it is that a change to a number now needs the thing
  the freeze was standing in for, which is EVIDENCE. Play found it, or
  the harness did. A retune argued from taste alone still does not land.
