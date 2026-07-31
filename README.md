# tiles

A hex placement roguelite for phones. Draft a tile, place it, surround one on
all six sides and it pops. Working title.

Live at **https://tiles.marcportal.com** — testing happens there, on a phone, in
portrait.

## Where things are

| File                | What it is                                           |
| ------------------- | ---------------------------------------------------- |
| `CLAUDE.md`         | The hard rules                                       |
| `STATUS.md`         | Checkpoint ledger — what is done **and verified**    |
| `LOG.md`            | The gates, and one entry per session                 |
| `DESIGN.md`         | Only what play has proven. Deliberately almost empty |
| `ideas/v1-archive/` | The unbuilt v1 design. Reference, not spec           |

## Layout

```
src/
  engine/   pure game logic — no DOM, no randomness outside seeded streams
  content/  every balance number. Imports nothing
  meta/     unlocks and feature flags
  render/   Renderer interface + PixiJS implementation
  sim/      headless balance harness (not started)
```

`content <- engine <- ui / render / sim`, enforced by ESLint rather than by
good intentions.

## Commands

```
pnpm test         # vitest
pnpm typecheck
pnpm lint
pnpm build        # emits dist/ + version.json stamped with the commit
pnpm dev          # rarely used; the phone tests prod
```

Push to `main` → CI runs the checks → deploy → `verify-deploy` proves the live
site serves that exact commit.
