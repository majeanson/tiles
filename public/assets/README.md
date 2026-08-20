# Drop art here

Every bitmap the game can use is an optional **slot**. The game is complete and
playable with this folder empty — that is the state it ships in — and each PNG
you add replaces one procedural surface with real art. Nothing needs wiring up.

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

| Slot                                                          | Size    | State               |
| ------------------------------------------------------------- | ------- | ------------------- |
| `terrain.green` `terrain.yellow` `terrain.red` `terrain.blue` | 414×358 | used                |
| `terrain.wall` `terrain.stone` `terrain.ghost`                | 414×358 | used                |
| `fx.pop`                                                      | 256×256 | used                |
| `ui.logo`                                                     | 876×450 | used                |
| `fog.hard` `fog.soft`                                         | 512×512 | **no mechanic yet** |
| `ui.cardFrame` `ui.runEnd`                                    | varies  | **no screen yet**   |

Two things the reference art sheet does not cover:

1. **`terrain.stone` has no reference art.** It is the most common cell in the
   back half of a run — every harvest makes more of it — and the design document
   never drew one. It has to read as _spent_: the aftermath of something, not
   furniture.
2. **The bottom four slots are not read by anything.** They describe fog, a
   run-end screen and a card frame, none of which exist. A beautiful PNG in one
   of those changes nothing on screen. `/gallery` marks them `NO MECHANIC` so
   this stays visible rather than becoming a surprise.
3. **`ui.logo` is wired (2026-08-19).** Drop a PNG here and it supersedes the
   drawn mark-and-name treatment on the front door AND the end screen — one
   file, both surfaces, same drop-target contract as everything else.

## Orientation

Terrain art is drawn to a **flat-top** hex for the three art directions and a
**pointy-top** hex for the placeholder — `theme.orientation`, per direction. Art
is scaled to the hex's bounding box, so a file drawn to the wrong orientation
will be visibly squashed rather than subtly wrong.

## Checking it landed

Open `/gallery`. Every slot lists as `LOADED`, `EMPTY` or `NO MECHANIC`, per
direction, from the same manifest the game reads.
