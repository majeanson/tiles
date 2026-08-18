# Ashwake

An expedition into a dark plane. Place tiles, ripen them, cash them, and push
on before the light runs out.

**Play: [tiles.marcportal.com](https://tiles.marcportal.com)** — it installs to
a phone's home screen and plays offline.

## The game in a minute

You start on one tile in the dark with a small purse of tiles. Every placement
spends from it, placements get dearer the more you make, and the run ends when
you cannot afford another — so how far you get IS the game.

- **Surround a tile on all six sides** and it ripens. Its worth is how many
  neighbours match it.
- **Pop a pocket of ripe tiles** and it pays tiles to keep you going and score
  at the same time — bigger pockets pay more, and pockets farther from home
  pay much more. Or BURN it: no tiles, no score, but relics for the next run.
- **Every colour plays differently.** Moss crowds its own kind, ember scores
  beside strangers, ash feeds on the stone you leave behind, tide is worth
  more the farther out you carry it.
- **Walk to the glows.** Caches pay tiles, sites pay points and set a bounty,
  territories become permanently yours, shrines unlock a system for good.
- **Your world remembers.** One world per device: the ground you uncover stays
  on the map between runs, and territories you claim greet you already yours.
- **Relics buy the climb.** Between runs they buy a deeper purse, keener odds,
  richer worlds, a gentler cost curve — run one is deliberately lean, and the
  shop is how it stops being.

Everything else is explained in the game — tap **?** for the manual, which
writes itself from the live rules and can never describe a different game.

## Working on it

```bash
pnpm install
pnpm dev             # localhost, but see the note below
pnpm test            # the whole suite, 400+ tests
pnpm sim             # the balance harness, 200 seeds per policy
pnpm build && pnpm exec wrangler deploy
```

Testing happens **on the deployed site, on a phone, in portrait** — not
localhost, not a desktop window resized to look like a phone. A push to `main`
runs format/lint/typecheck/test/build, deploys, and then proves the live site
serves that exact commit.

Read `STATUS.md` for what is done and verified, `ROADMAP.md` for where done
is, and `LOG.md` for why every decision was made. The design rules that bind
the code — the pure engine, balance numbers in `content/`, one question per
prototype — are in `CLAUDE.md`.

## Privacy

Ashwake has no backend, no accounts, no analytics and no network calls once
the page has loaded. Your world, your saved run and your records live in your
browser's local storage on your own device, and nothing is ever sent anywhere.
Clearing your browser data, or "Abandon this world" in SETTINGS, deletes them
for good. Sharing a run copies a link containing only a seed — a number the
game can regrow the same world from.

## Licence

Not licensed for reuse. Ask.
