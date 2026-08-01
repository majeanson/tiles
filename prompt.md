# prompt.md — the session we go through together

Written at the end of Session 2, for a session where you are available to answer.
Everything below is either **a decision only you can make** or **a thing I did
that you should look at and confirm or reverse**.

Read `LOG.md` Session 2 for what was built and why. This file is only the
questions.

**Before anything else, open it on your phone.** Two links:

- `https://tiles.marcportal.com/?ff=ui.themePicker` — the game, with a row of
  direction buttons under the build stamp. Tap through all four.
- `https://tiles.marcportal.com/gallery` — every direction's surfaces, ink,
  type and asset slots on one page.

Nothing visual in this repository has ever been rendered by anything. happy-dom
has no 2D canvas, so 188 passing tests prove the wiring and **not one pixel**.
Your eyes are the first ones on it.

---

## Part 0 — The thing that is bigger than art direction

**The design document describes a different game from the one that exists.**

I did not bend either one to fit. Nothing was faked, and the mismatches are
marked `NO MECHANIC` in the code and on the gallery page so they stay visible.

| The art direction assumes             | The game actually is                            |
| ------------------------------------- | ----------------------------------------------- |
| Endless map, scrolls, drag and pinch  | A bounded island, radius 4–6, fits one screen   |
| Two-tier fog of war, permanent memory | Every cell known from the moment you arrive     |
| A six-hex chain that pops in sequence | Every ripe tile pops at once, one action        |
| `+6 tiles` / `×2 points` after a pop  | `Take N tiles` / `Take N pts`, always on screen |
| Blocked ground as terrain vocabulary  | `wallDensity: 0` — there are no walls yet       |

This is not a rendering question. Fog and an endless map are **the run's whole
structure** — they change what a map is, what leaving means, and whether rule 7
still makes sense. Gate E is about art; this is Gates A–D.

**Q0. Which way does this resolve?**

- **(a) The art gets re-cut to the game we have.** The directions' mood, palette,
  type and surface language all survive a bounded island — only fog, scrolling
  and the cascade are lost. Cheapest, and it does not touch a design the harness
  has already validated.
- **(b) The game becomes the map-game the art assumes.** Bigger and genuinely
  interesting — fog turns "leave" into exploration — but it reopens Gate C. The
  economy was closed against a bounded map, and an endless one changes the cost
  curve's relationship to space.
- **(c) Park it.** Ship (a) now, revisit (b) as an unlock after Gate D.

**My recommendation: (c).** Session 1 left a real open design problem — rule 5's
harvest TIMING is fake, banking beats trickling by 43× and neither existing dial
fixes it — and `DESIGN.md` says not to author content around rule 5 until it is
settled. Rebuilding the map around fog before that is settled is building on
ground that is still moving.

---

## Part 1 — Decisions that need you

### Q1. Which direction, if any?

All three are loaded and switchable. Gate E says the choice waits for A–D, so
the honest answer today may be "none yet" — but if one is plainly dead on a
phone, killing it now saves carrying it.

- **Cold Survey** (`?theme=cold-survey`) — muted, forensic, dawn light. The
  safest and the most legible.
- **Rot Bloom** (`?theme=rot-bloom`) — diseased, dread, spore-green. Its own
  author flagged it as the risky one for legibility.
- **Torchlit Map** (`?theme=torchlit`) — Diablo 2, gold and blood, light doing
  the fog's job. The most atmospheric and the darkest.

**What I would ask you to answer:** not "which is prettiest" but **which one is
still readable in daylight, held at arm's length, at half brightness.**

### Q2. Flat-top or pointy-top?

All three directions specify flat-top at 46px. The placeholder is pointy-top,
which is what shipped. Both work and both are tested; a theme picks one.

This is not neutral: at a fixed portrait width the two orientations fit different
numbers of hexes, so it changes how big the board reads. Worth deciding by
looking, not by argument.

### Q3. Is a pop a reward, or a disturbance?

The design document raises this and refuses to answer it. Every cascade note in
it is written as **reward** — light, gold, bells. Reading it as _something being
woken_ keeps the palettes and inverts the motion and the sound entirely.

I built it as reward: a warm flash, fast up and slow down, staggered so a big
harvest reads as a cascade. It is four numbers in `theme.motion` and inverting it
is cheap — **now**. It stops being cheap once sound exists.

### Q4. Does blocked ground exist, and does it spread?

`wallDensity` is 0, so there are no walls. The tuning dial is real and the art
exists in every direction. The document's own open question: is blocked ground
fixed map furniture, or does it get denser as maps escalate? If it spreads it
needs a second visual state (fresh vs. long-dead) and the terrain count goes from
four to five.

Note it interacts with the economy, not just the picture: walls make a map ripen
FASTER (they surround) but pay LESS (they never match). That is a Gate C question
before it is an art one.

### Q5. Do the four colours get fiction names?

The draft cards currently say `GREEN`, `YELLOW`, `RED`, `BLUE` under the
placeholder and `CRYPT`, `CEMETERY`, `BURIAL GROUND`, `CATACOMB` under the three
directions. `CLAUDE.md` says plain words and no invented vocabulary until a
concept has earned a name — these are English words for real things, so I read
that as allowed, but you may disagree.

The green→crypt, yellow→cemetery, red→burial, blue→catacomb mapping is arbitrary
and fixed. Say if you want it different; it is one object per theme.

### Q6. Do we import the reference PNGs?

I deliberately did not. Two reasons: they are drawn for flat-top hexes against a
default that is pointy-top, and empty slots are a truer starting state than art
that half fits. The slots are all wired and the workflow is one drop:

```
public/assets/<themeId>/<slotId>.png   →   rebuild   →   it appears
```

**If you want them in, say so and it is a ten-minute job** — but answer Q2 first,
because the orientation decides whether they fit.

One piece has **no reference art at all**: `terrain.stone`, the harvested tile.
It is the most common cell in the back half of a run and the design document
never drew one. It needs a brief: it must read as _spent_ — the aftermath of
something, not furniture.

### Q7. Webfonts from Google, or self-hosted?

The three directions load Spectral / Barlow Condensed / Cinzel / EB Garamond from
`fonts.googleapis.com`. The placeholder loads nothing, on purpose, so a cold start
never waits on a third party. Every font stack ends in a system face, so a failed
load is ugly rather than blank.

If a direction wins, I would self-host its two faces: one fewer origin, no
third-party request from a game that is otherwise entirely first-party, and it
works in a tunnel.

---

## Part 2 — Things I decided. Confirm or reverse.

**2.1 — I changed the placeholder palette.** `CLAUDE.md` says the placeholder
must not be built on, and I moved one of its values anyway. The greyscale test
found its red and blue were **0.006 apart in perceptual lightness** — the same
tone, in the palette whose entire stated job is being tellable apart. Blue went
`#3f6291 → #304a70`. I think this is a bug fix rather than art direction, but it
is your call.

**2.2 — Two directions' values differ from the document.** Torchlit's crypt and
catacomb were **0.001 apart** as written; Cold Survey's were under the bar. Both
fixed by darkening the catacomb, which is what both documents prescribe: "if it
fails the sunlight test, the fix is value spacing, not more hue." The originals
are in the source comments if you want them back.

**2.3 — Legal cells no longer all tint.** Only cells where the tile in your hand
would be worth **more than zero** get the ghost surface. Tinting every legal cell
was most of the board and read as noise. This makes the board answer "where does
this tile do work" at a glance — but it is a change to what the board says, not
just how it looks.

**2.4 — The stat row is four labelled numbers, not one line.** `TILES POINTS` left,
`MAP COST` right, tiles in the direction's one warm colour because tiles is the
number that kills you. Structure copied from all three directions.

**2.5 — The gallery ships to production.** `/gallery`, ~4KB, no Pixi. It is
reachable by anyone with the URL. Say if you would rather it were dev-only.

**2.6 — `harvestSizeBonus` and the rest of `tuning.ts` were not touched.** The
open design problem from Session 1 is still open and still blocks content.

---

## Part 3 — The phone script

Fifteen minutes, in daylight, in portrait. This is also Gate A, which has been
waiting since Session 1.

1. Open `?ff=ui.themePicker`. Play twenty placements in the **placeholder**. Does
   the minute feel good? That is Gate A and nothing else in this document matters
   more.
2. Switch to each direction in turn. For each: can you tell all four tile colours
   apart **without thinking**? Can you find the ripe tiles instantly?
3. Fill a map and harvest. Watch the flash. Reward, or disturbance? (Q3)
4. Note which direction you keep wanting to switch back to.
5. Open `/gallery` and look at the greyscale strip for the one you liked.

If the answer to (1) is no, everything else in this file is premature and the
next session is a design session, not an art one.

---

## Where things live

| What                            | Where                                            |
| ------------------------------- | ------------------------------------------------ |
| A direction's values            | `src/theme/themes/<id>.ts` — one object each     |
| The contract they satisfy       | `src/theme/tokens.ts`                            |
| Adding a direction              | one file, plus one line in `src/theme/index.ts`  |
| The legibility test             | `src/theme/theme.test.ts`                        |
| Procedural surfaces             | `src/render/bake.ts`                             |
| Art slots and their briefs      | `src/theme/assets.ts`, `public/assets/README.md` |
| The default (still placeholder) | `DEFAULT_THEME_ID` in `src/theme/index.ts`       |

**Do not relax `MIN_SEPARATION` in the legibility test to make a direction pass.**
Darken something instead. It found three real defects on its first run, one of
them in code that had already shipped.
