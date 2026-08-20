# Sound — BUILT (2026-08-19), exactly as scouted

**Resolved.** The scout below was built in one pass on 2026-08-19
(`src/ui/audio.ts`, behind `ui.sound` in the registry) — all three
moments, Web Audio synthesis, zero assets, every parameter in the THEME's
`voice` (torchlit and the placeholder each have their own). This file
said "nothing here is built" for a day after that stopped being true;
corrected 2026-08-20, the launch deep-clean.

**The launch ruling (Marc, 2026-08-20):** the silent 1.0 stands as the
DEFAULT, and the ♪ button in the board chrome (beside FIT⇄HERE) is the
easy way in — one tap mid-run, the same `ui.sound` flag SETTINGS'
switch flips, a confirmation bell on enable. The flag's own registry
note carries the decision.

**Still open — the written question at the bottom**: does sound change
WHEN players pop? Unanswerable until someone plays with the ♪ on; the
harness cannot hear.

---

The scout as written (2026-08-15/18), kept because the build followed it
line by line:

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
