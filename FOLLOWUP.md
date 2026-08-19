# Human follow-up

Rewritten 2026-08-18 — the 2026-08-15 version described a game that has since
been rebalanced twice (the clock is gone, the payout is single, run one is
deliberately lean). Everything here needs Marc, not code. Ordered by what
unblocks the most.

## 1. Play a run on the phone. Still the only blocker.

**https://tiles.marcportal.com** — the bare URL, on the phone, in portrait.
What rides on it now:

- **The rebalance verdict.** Run one came down hard on your ask (22 tiles,
  cost rises every 22 placements, caches 6 + 4 a ring, sparse near-world):
  does it feel earned rather than punishing? Does STEADY PACE feel worth its
  30 relics? Do the far caches pull you outward?
- **Gate B's successor question.** The gate itself is retired — `singlePayout`
  was its own prescribed fallback and it shipped. The open question is yours
  to answer in play: **is pop-vs-burn-vs-wait a real timing decision?** You
  said waiting should be the score line and popping should buy small
  advantages — with tiles scarce now, are the advantages (luck, steering,
  the reroll/steer/forge prices) finally worth taking?
- **The stranger test.** Someone who is not you, on their own phone, unaided:
  do they finish a run and start another? The v1.0 tag stays blocked on it.

## 2. Hidden finds are built — the question is yours to play

You resolved `ideas/uniques.md` on 2026-08-18 and the build shipped the same
day: perks are found, never bought — a rare hidden landmark (rarer than a
shrine, never glowing) grants an unowned perk when your ground stumbles onto
it; the shop sells only KEEN NOSE, the shimmer; one perk carried, the second
slot refunded. The written question waits on the phone: **does a hidden find
change how a player grows their ground?** Sub-questions while you play — did
the first find land as an event, does KEEN NOSE feel worth 40 relics, and do
Stonewalker/Wallbreaker/Open Hand each change your next placement the way a
unique should?

## 3. Stage 3 shipped three more written questions — same phone, same run

The 2026-08-18 pipeline's new-systems stage (`WORKPLAN.md`, `LOG.md`'s Stage
3 addendum) added three systems each with its own open question, none of
them answerable by the harness:

- **Deep water.** The destination reward MIX now tilts with how far you've
  pushed, not just how often one shows up — does that give the middle of a
  run a shape the income ramp alone didn't?
- **The survey.** Five world-scale goals (reach 20, hold 4 territories, know
  40%, wake every shrine, find every perk), each paying relics once and
  listed in SETTINGS' YOUR WORLD — does a legible ledger of what the world
  has proven change the line you take through it?
- **TITHE.** A fourth luck price: convert the whole purse to relics on the
  spot, at a better rate than death pays on what's left unspent — does
  having a live way to cash out make hoarding the purse an actual decision?

## 4. Standing decisions that remain one line to reverse

- **The name: ASHWAKE** (`src/meta/identity.ts`).
- **The art direction: torchlit** (`DEFAULT_THEME_ID` in `src/theme/index.ts`;
  `?theme=cold-survey` / `?theme=rot-bloom` to compare on the phone).
- **The points scale.** Good runs score tens of thousands; one constant
  divides it if you ever want human-sized numbers.

## 5. What is ready and waiting

- **v1.0 tag** — one command, blocked on §1's stranger test and Gate B's
  successor question.
- **Sound** — you chose a silent 1.0; the pop, the claim and running dry are
  the three moments that most want a noise.
- The rest of the parking lot is at the bottom of `ROADMAP.md`.
