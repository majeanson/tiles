# The daily seed — scouted 2026-08-18, not built

Marc picked this path to scout on 2026-08-18. One shared world per day, same
for everyone, scores comparable by screenshot. **No backend** — which is the
whole reason it fits this game.

## The mechanism, in full

- Seed = a pure hash of the UTC date (`hashAt(SALT, year, dayOfYear)` — the
  function already exists in `engine/world.ts`). Everyone who opens the
  daily on the same date plays the identical plane: same walls, fields,
  biomes, caches, shrines, hidden finds.
- Entry: a DAILY button (start surface or settings), which is sugar for
  `?seed=<today's>` plus a marker that names it a daily. The `?seed=` replay
  machinery already exists and already does the important thing.
- The end screen already carries SHARE with a seed link; a daily share reads
  "Ashwake daily, {date}: {points} pts — beat it", and the receiver's link
  opens the same world. Comparison is social, not server-side; the record
  book can keep a separate best-per-date line locally.

## The one design question, flagged for Marc

**Whose economy does the daily play?** The `?seed=` precedent is already
decided and shipped: a shared seed plays the PLAIN economy, because a replay
scored under this device's upgrades would not be a replay of anything
(`main.ts`). The honest default is the same rule — the daily is FAIR, every
player on the plain tuning, no purse/odds/pace upgrades, no perk. The
alternative (your upgrades apply, scores incomparable but "yours") breaks
the only thing a daily is for. Recommendation: plain economy, perk allowed
but shown in the share text ("with STONEWALKER") so a claim is honest.

## Costs when built

Small: the seed derivation (one pure function + test), the entry button, the
daily marker on the end screen and share text, a per-date local best. The
open UX question is where the button lives — there is still no title screen,
and the daily may be the thing that finally earns one.
