import type { LandmarkReward } from '@engine/state';
import type { Voice } from '@theme/tokens';

/**
 * The three moments, sounded (`ideas/sound.md`, built 2026-08-19 behind
 * `ui.sound` — off by default, because Marc chose a silent 1.0 and a phone
 * game that surprises a quiet room is uninstalled).
 *
 * Web Audio synthesis, zero assets: one lazy `AudioContext` (created inside
 * the first user-gesture-driven call, which is what autoplay policy demands
 * anyway), one oscillator + gain envelope per note, everything voiced by the
 * THEME's own numbers — sound is art direction, and torchlit does not sound
 * like the placeholder. Nothing here throws past its own walls: a browser with
 * no Web Audio, or an iOS context that refuses to resume, degrades to the
 * silence the game shipped with.
 */
export class Sound {
  readonly #voice: Voice;
  #ctx: AudioContext | null = null;
  #broken = false;

  constructor(voice: Voice) {
    this.#voice = voice;
  }

  /**
   * The pop: a rising run of bells, one per popped tile, on the same
   * stagger the flash cascade uses — a big harvest SOUNDS like what it
   * looks like. Capped at twelve bells: past that the run reads as one
   * shimmer anyway, and forty oscillators is a phone speaker's worst day.
   */
  pop(count: number): void {
    const ctx = this.#ensure();
    if (ctx === null) return;
    const v = this.#voice;
    const bells = Math.min(12, Math.max(1, count));
    for (let i = 0; i < bells; i++) {
      this.#note(ctx, v.pop.baseHz + i * v.pop.stepHz, v.pop.decay, v.pop.wave, i * 0.045);
    }
  }

  /** The claim: a single struck note, one pitch per landmark kind. */
  claim(kind: LandmarkReward): void {
    const ctx = this.#ensure();
    if (ctx === null) return;
    const v = this.#voice;
    this.#note(ctx, v.claim[kind], v.claimDecay, v.claimWave, 0);
  }

  /**
   * Running dry: a low fade when the purse first sinks toward the next
   * placement's cost. Not a death sting — death stays silent; the dread is
   * the sound. The CALLER owns the "first time" edge (it has the HUD).
   */
  dry(): void {
    const ctx = this.#ensure();
    if (ctx === null) return;
    const v = this.#voice;
    this.#note(ctx, v.dry.hz, v.dry.decay, 'sine', 0);
  }

  #note(ctx: AudioContext, hz: number, decay: number, wave: OscillatorType, delay: number): void {
    try {
      const at = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(hz, at);
      // A short attack so the note strikes instead of clicking, then an
      // exponential fall — the whole envelope of a struck thing.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(this.#voice.gain, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + decay + 0.05);
      osc.addEventListener('ended', () => {
        osc.disconnect();
        gain.disconnect();
      });
    } catch {
      // One bad note is not worth a broken run.
    }
  }

  /**
   * Give the context back (2026-08-27, the reload-removal refactor).
   *
   * A page load used to be the only way a Sound ended, and the document going
   * away took its context with it. Now a session ends in place and the next
   * one builds its own voice, so an unclosed context would simply accumulate
   * — and iOS caps how many a page may hold at around four, after which
   * `new AudioContext()` throws and the game goes permanently silent. Closing
   * costs nothing: `#ensure` builds a fresh one lazily on the next gesture,
   * which is what autoplay policy wants anyway.
   */
  close(): void {
    const ctx = this.#ctx;
    this.#ctx = null;
    try {
      void ctx?.close().catch(() => undefined);
    } catch {
      // A context that objects to being closed is one we are dropping the
      // reference to regardless.
    }
  }

  #ensure(): AudioContext | null {
    if (this.#broken) return null;
    if (this.#ctx !== null) {
      // iOS suspends contexts freely; every play call is a user gesture, so
      // resuming here is exactly what the platform wants.
      if (this.#ctx.state === 'suspended') void this.#ctx.resume().catch(() => undefined);
      return this.#ctx;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) {
        this.#broken = true;
        return null;
      }
      this.#ctx = new Ctor();
      return this.#ctx;
    } catch {
      this.#broken = true;
      return null;
    }
  }
}
