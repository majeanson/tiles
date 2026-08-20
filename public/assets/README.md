# Drop art here

Every bitmap the game can use is an optional **slot**. The game is complete and
playable with this folder empty, and each PNG you add replaces one procedural
surface with real art. Nothing needs wiring up.

**Torchlit's eight terrain/fx slots are filled** (2026-08-19, WORKPLAN Stage 3):
`terrain.green/yellow/red/blue/wall/stone/ghost` and `fx.pop`, baked by
`scripts/terrain.ts` — a deterministic, offline Node script in the same spirit
as `scripts/icons.ts` and `scripts/social.ts`, reading colour and pattern
straight off `TORCHLIT` rather than a hand-copied palette. Regenerate with
`pnpm exec tsx scripts/terrain.ts` after the theme moves. No CC0 texture
assets were used to seed any layer — the decision of record permits it, and
this session judged procedural generation (reading the theme's own tokens
rather than a stock photo, with no network fetch or licence bookkeeping to
verify) the better fit at this size. `fog.hard`, `fog.soft`, `ui.cardFrame`
stay empty — no mechanic reads them yet, and shipping art for a slot nothing
draws would be a beautiful lie.

## The workflow

```
public/assets/<themeId>/<slotId>.png
```

Drop the file, rebuild, done. `vite.config.ts` scans this folder at build time
and writes `assets/manifest.json`; the client fetches that one file and loads
only what exists. There is no list to keep in sync, and a slot with no file costs
no request.

- **`<themeId>`** — the theme's `id`: `placeholder` or `torchlit` (`cold-survey`
  and `rot-bloom` were deleted 2026-08-19, WORKPLAN Stage 1's goodbye). Art is
  per-direction on purpose. Two directions that both want a crypt want two
  different crypts, and sharing a folder would make switching direction mean
  moving files.
- **`<slotId>`** — an id from `ASSET_SLOTS` in `src/theme/assets.ts`, which is
  also the authority on export size and on what each piece has to do.

## Slot ids, and the two things worth knowing

Ids are named for the ROLE in the rules (`terrain.green`), never for what a
direction calls it (`crypt`). Rename the fiction twice more and the filenames do
not move.

| Slot                                                          | Size    | State                 |
| ------------------------------------------------------------- | ------- | --------------------- |
| `terrain.green` `terrain.yellow` `terrain.red` `terrain.blue` | 414×358 | used, **art filled**  |
| `terrain.wall` `terrain.stone` `terrain.ghost`                | 414×358 | used, **art filled**  |
| `fx.pop`                                                      | 256×256 | used, **art filled**  |
| `ui.logo`                                                     | 876×450 | used, drawn treatment |
| `ui.runEnd`                                                   | 876×330 | used, CSS gradient    |
| `fog.hard` `fog.soft`                                         | 512×512 | **no mechanic yet**   |
| `ui.cardFrame`                                                | 288×288 | **no screen yet**     |

Things worth knowing:

1. **`terrain.stone` had no reference art** — the design document never drew
   one, though it is the most common cell in the back half of a run. Baked
   2026-08-19: a dark off-centre **scorch** blot and radiating **crack**
   lines out of it, on top of the existing dot pitting — the aftermath of a
   pop, not a fourth flavour of furniture. See `theme/themes/torchlit.ts`'s
   own `stone` surface and its `scorch`/`overlay` fields.
2. **The bottom three slots are not read by anything.** They describe fog and
   a nine-slice card frame, neither of which exist. A beautiful PNG in one of
   those changes nothing on screen. `/gallery` marks them `NO MECHANIC` so
   this stays visible rather than becoming a surprise.
3. **`ui.logo` and `ui.runEnd` are wired (2026-08-19)** but have no PNG here
   yet — both draw a live treatment (mark-and-name lockup; a CSS gradient
   hero) that a file at this slot would supersede.

## Orientation

Terrain art is drawn to a **flat-top** hex for torchlit and a **pointy-top**
hex for the placeholder — `theme.orientation`, per direction. Art is scaled to
the hex's bounding box, so a file drawn to the wrong orientation will be
visibly squashed rather than subtly wrong.

## Checking it landed

Open `/gallery`. Every slot lists as `LOADED`, `EMPTY` or `NO MECHANIC`, per
direction, from the same manifest the game reads.
