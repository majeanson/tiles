# v2.0 — React, and where it actually belongs

Written 2026-08-28, the day v1.0.0 was tagged, on Marc's ask for a fresh brief
he could hand to a new session. Two things it is trying to do at once: carry
the measurements so nobody re-derives them, and leave the conclusion genuinely
open — including the conclusion that most of this should not be built.

## Why this file exists

Marc has raised React twice. The first time (2026-08-27) the real need turned
out to be "remove every page reload", which vanilla + the History API answered
without a dependency — recorded in `LOG.md` Session 56, along with his own
"minimal-deps is no longer a requirement for me". The second time (2026-08-28)
it came bundled with something new: a live playtest console he ticks on his
phone while an AI reads what he ticked.

That second ask is the interesting one, and it is not really a refactor. It is
a NEW SURFACE, and it happens to be the surface that unblocks the only thing
v2.0 actually needs — a stranger playing the game (`PLAYTEST.md` Session C,
`DECISIONS.md` D4: still open, never attempted).

So the honest framing is not "port the game to React". It is: **build the one
thing React is obviously right for, then decide with evidence whether the rest
earns its cost.** A tag exists now, which means for the first time there is a
safe point to fall back to and this work can afford to be bold.

## What is already measured

Do not spend a session re-deriving these; they were counted on 2026-08-28 and
are recorded in `LOG.md` Session 68.

| | |
| --- | --- |
| Chrome, production lines | ~15,900 (`ui` 7,780 · `shell` 4,840 · `style.css` 3,329) |
| ...of which actually build DOM nodes | ~8,675 (~3,984 executable) |
| `src/ui/view.ts` | 1,913 lines, **zero DOM** — already the props layer |
| The board | Pixi, behind a 14-method `Renderer` interface, on one stable `#board` div |
| Existing components | `dialog.ts`, `panelDoor`, `shopParts`, `tipRows` |
| Tests coupled to imperative markup | `game.test.ts` 4,164 lines + e2e 1,790 lines, 57 id selectors |
| Bundle cost | ~+45KB gzip on 129KB |
| Runtime dependencies today | `pixi.js`, and nothing else |

**The honest argument FOR React**, and it is a real one: `shell/session.ts`'s
`resetShell()` hand-maintains a list of 30 element ids it must re-hide on every
scene change, plus every `hidden`/`inert`/`classList` reconciliation around it.
That is manual state-keeping React makes free — not ported, DELETED.

**The honest argument against**, equally real: 5,954 lines of test rewrite and
45KB of bundle, for zero user-visible change, on a game whose whole pitch is
that it opens instantly on a phone and works offline.

**The trap:** `#board` must not remount, or every re-render destroys the WebGL
context. Whatever shape this takes, that host div is held by a ref and never
re-created.

## The prompt

Pasteable as-is into a fresh session.

```
Ashwake — the v2.0 refactor. I want React in, and I want you to tell me
where it actually belongs.

Start by reading CLAUDE.md, then STATUS.md, NEXT.md §3b/§3c, and
ROADMAP.md's v2.0 definition of done. LOG.md sessions 66–69 are the recent
history and DECISIONS.md D22/D23/D24 are the open questions. The measured
numbers you need are in ideas/v2-react.md — don't re-derive them.

Context: v1.0.0 is tagged and deployed (tiles.marcportal.com). That tag is
a safe fallback, so this work can be bold in a way nothing before it could
be. It's a phone-first hex game — pure engine, Pixi board, hand-rolled DOM
chrome, pixi.js the only runtime dependency.

My instinct, which I want you to challenge if it's wrong: build the
playtest console FIRST. It's a new surface with no legacy — a live,
tickable Session A/B/C checklist I work through on my phone while you read
what I tick and write findings back into LOG.md. Checkboxes, notes, live
sync: genuinely what React is good at, and it unblocks the one thing v2.0
actually needs, which is a stranger playing the game (PLAYTEST.md Session
C, DECISIONS.md D4 — still open, never attempted).

Then decide, with evidence rather than taste, whether porting the game
chrome earns its cost at all. I'd rather you talk me out of it than do it
because I asked.

Questions I'd like answered in your plan: where does the console live —
same bundle like gallery.html, or its own thing? How do you and I actually
talk through it? And does any of this touch the game, or stay strictly
beside it?

Land on main, keep the gates green, and put option-set questions to me on
any fork where two answers would mean genuinely different work.
```

## What would make this idea resolved

Per the standing contract, an `ideas/` file is closed by being built-and-kept
or rejected in writing. Three outcomes are all fine:

1. **The console ships and the chrome stays vanilla.** The likeliest good
   answer: React earns its place on the surface it suits, the game keeps its
   instant load, and `resetShell()`'s 30-id list survives as a known wart.
2. **Both happen.** The console proves the ergonomics, and the chrome port is
   then argued on its own evidence rather than on enthusiasm.
3. **Neither, and it is written down why.** Also a result. `gallery.html` is
   the precedent for a second page that ships beside the game with no
   framework at all, and a static `playtest.html` with `localStorage`
   checkboxes is half a session.

The one thing that would make this a bad session is a chrome rewrite begun
because it was asked for, without the argument being made first.
