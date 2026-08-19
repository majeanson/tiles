# The daily seed — designed 2026-08-18, BUILT 2026-08-19

Marc picked this path to scout on 2026-08-18, then settled every fork the
scout surfaced, on option sets, the same day — and called the build on
2026-08-19, answering the fresh-worlds question ("why would we not want a
new seed every time?") with this plus the crossing. **No backend** — which
is the whole reason it fits this game. As built: `meta/daily.ts` (pure
civil-date math, the seed hash, the ladder, the sparkline — all pinned by
test), `?daily=YYYY-MM-DD` in the shell, and a DAILY door on the front
door's new playstyle menu. The open UX question below answered itself: the
front door IS the title screen now, and the daily lives on it.

One thing the build corrected: the scouting note claimed replay seeds
already bypassed the autosave path. They did not — the run save was written
unconditionally, so a `?seed=` detour could overwrite the home run. The
guard exists now, for replays and dailies both.

## The decisions (all Marc's, 2026-08-18)

- **Seed = hash of the LOCAL date** (`YYYY-MM-DD`), numbered from a fixed
  epoch ("Ashwake #47"). Wordle's rule: the ritual is "new one when I wake
  up", and it beats UTC's global comparability. Friends across timezones
  occasionally compare different days; that costs nothing real.
- **Loadout: STRICTLY PLAIN.** No relic upgrades, no perk, no shrine
  unlocks — the shipped `?seed=` rule (a shared seed plays the plain
  economy) extended to its logical end. The consequence is the design's
  best property: every daily score ever posted is on ONE ladder — a score
  from March is comparable to a score from October.
- **Retries: unlimited, counted, and confessed.** Play as often as you
  like; the share text carries the attempt number ("2nd try"). No
  enforcement theater — with no backend, enforcement is a lie waiting to be
  caught, and this game refuses lies on every other surface. Honesty by
  construction instead.
- **Share: text plus the arc as block characters.**
  `Ashwake #47 · 4,120 pts · reach 13 · ▂▁▅▃█▂ · 2nd try · beat it: <link>`
  — the run's shape as a Wordle-style sparkline, derived from the same
  harvest log the end screen already draws. Recognizable in a group chat,
  zero images, zero backend.
- **Local records**: best-per-date and a played-streak counter, in the
  existing record-book pattern.

## Rejected alternative, recorded

**The featured find** — everyone carries the same perk, rotated by date
hash ("today's daily carries WALLBREAKER"). Proposed because it showcases
the perk pool and makes Tuesday play unlike Wednesday; rejected by Marc for
strictly-plain. What plain buys instead: the one permanent ladder above,
and a daily that doubles as the stranger's first game — the bare economy IS
the daily economy, so a shared daily link is also the cleanest possible
first-run invitation.

## Verified while scouting

A daily detour cannot eat the real run: replay seeds already bypass the
autosave path (`main.ts` guards every write on the asked seed), so the
world run resumes untouched afterwards. Hidden finds exist in a daily world
but grant nothing there — the same replay guard, already shipped with the
finds system.

## Costs when built

Small: the date hash + daily numbering (pure functions, tested), a DAILY
entry point, the share-text variant with the sparkline encoder, a per-date
local best + streak. The one open UX question: where the DAILY button
lives — there is still no title screen, and the daily may be the feature
that finally earns one.
