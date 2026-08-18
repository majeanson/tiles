# Sound — the post-1.0 pass, scouted early

Marc chose a **silent 1.0** (2026-08-15) and confirmed the scout on
2026-08-18: decide WHICH moments get a noise and HOW, so the pass costs a day
when the silence lifts. This file is that decision's homework. Nothing here
is built; nothing here is a commitment to build.

## The three moments (from the parking lot, unchanged)

1. **The pop.** The loudest thing that happens in a run. One synthesised
   tone whose PITCH rises with pocket size (the size is on the button
   already), fired per popped tile on the same stagger the flash cascade
   uses — so a big harvest sounds like a run of bells, which is what it
   looks like. Hook: where `PixiRenderer.#spawnFlashes` decides a pop
   happened, or one level up in `game.ts` where the harvest note is built
   (better — the renderer should stay deaf).
2. **The claim.** A single struck note, one timbre per landmark kind (cache
   warm, site bright, territory low, shrine strange). Hook: the claim
   announcement switch in `game.ts` — the place that already knows which
   kind it was.
3. **Running dry.** Not a sting at death — a low fade that begins when the
   purse first drops below the next placement's cost + a small margin (the
   HUD already computes affordability). Death itself stays silent; the dread
   is the sound.

## How: Web Audio synthesis, zero assets

- One `AudioContext`, created lazily on first user gesture (autoplay policy
  requires it anyway). Oscillator + gain envelope per note; no samples, no
  files, nothing for the service worker to cache, works offline by
  construction.
- All parameters (frequencies, envelope times, per-kind timbres) live in the
  THEME, not in content — sound is art direction, torchlit gets its own
  voice, and the greyscale rule's cousin applies: a direction that cannot be
  told apart with eyes closed has no voice.
- Behind a flag (`ui.sound`), defaulting off even post-1.0 first — a toggle
  in SETTINGS beside the theme picker, because a phone game that surprises a
  quiet room is uninstalled.

## The question to write before building

Does sound change WHEN players pop? (It might — a rising bell run rewards
bigger pockets viscerally, which leans on the wait-to-pop scale.) The
harness cannot answer it; the phone session after the sound pass must.
