import { surface, type Theme } from '../tokens';

/**
 * The placeholder, promoted from a constant to a theme.
 *
 * These are the exact values that shipped in `PixiRenderer.ts`, and they still
 * mean what they meant there: chosen to be TELLABLE APART and obviously
 * provisional, so nobody mistakes them for a brief. Four tile colours that cannot
 * be distinguished is a broken game rather than an ugly one, which is the only
 * reason there is any hue here at all.
 *
 * It stays the DEFAULT until Gate E opens (see LOG.md). Its job now is to be the
 * control: if a change makes the game better under an art direction but worse
 * here, the change was decoration. Pointy-top, no webfont, no vignette — nothing
 * loads, nothing is asserted.
 */
export const PLACEHOLDER: Theme = {
  id: 'placeholder',
  name: 'Placeholder',
  note: 'Not a direction. Four hues you can tell apart, and nothing else claimed. The default until Gate E opens.',
  source: 'src/render/PixiRenderer.ts, sessions 0–1',

  orientation: 'pointy',

  board: {
    background: 0x14161c,
    seam: 0.06,
    edge: 0x3a4150,
    edgeWidth: 0.04,
    legalEdge: 0x59637a,
    ripeEdge: 0xe8ecf4,
    ripeEdgeWidth: 0.1,
    vignette: null,
    // The sensible default (2026-08-19): the placeholder has no mood to carry a
    // bespoke hue with, so home reuses the direction's own `accent` at a width
    // well under `ripeEdgeWidth` — a marker every theme renders something for,
    // not a fifth colour invented for one token.
    home: { ring: 0xe8ecf4, ringWidth: 0.07 },
  },

  ink: {
    bg: 0x14161c,
    ink: 0xe8ecf4,
    inkDim: 0xc3c9d6,
    inkFaint: 0x767d8d,
    accent: 0xe8ecf4,
    // Plain but its own (2026-08-20): even the placeholder must keep the
    // rarities apart from its white accent/selection, or the contract
    // "magic and unique have their own colour" only holds in one theme.
    magic: 0x9d7bd8,
    unique: 0xd8892f,
    danger: 0xc98a6a,
    panel: 0x1e222b,
    panelEdge: 0x3a4150,
    panelEdgeActive: 0xe8ecf4,
  },

  type: {
    display: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    label: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    body: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    labelTracking: '0.04em',
    webfontHref: null,
  },

  motion: {
    popMs: 260,
    popStaggerMs: 45,
    popColour: 0xe8ecf4,
    popAlpha: 0.85,
    popLift: 0.9,
    // The control (WORKPLAN Stage 4, 2026-08-20): `popGlowScale` is the exact
    // `3.2` `PixiRenderer.ts` hand-typed before this was a token, and the
    // ember settle is mild rather than off — a flat straight-line drift
    // would make the placeholder a THIRD opinion (no gravity at all) rather
    // than the plain one torchlit's tuned register is judged against.
    popGlowScale: 3.2,
    emberGravity: 0.4,
    emberLifeMs: 500,
  },

  // The voice (ideas/sound.md): plain sines, no fiction — the placeholder
  // sounds like a tuning fork, which is exactly its job.
  voice: {
    pop: { baseHz: 440, stepHz: 24, decay: 0.18, wave: 'sine' as const },
    claim: { cache: 392, site: 659, territory: 220, shrine: 622, find: 880 },
    claimDecay: 0.5,
    claimWave: 'sine' as const,
    dry: { hz: 110, decay: 1.2 },
    gain: 0.15,
  },

  terrain: {
    green: surface(0x3f7d55),
    yellow: surface(0xa8912f),
    red: surface(0x9c4340),
    // Darkened from the shipped `#3f6291`. The greyscale test caught it: red and
    // blue were 0.006 apart in L*, which is the same tone. Four hues you can name
    // is not the same claim as four tiles you can tell apart, and this palette
    // only ever made the first one.
    blue: surface(0x304a70),
  },
  terrainNames: {
    green: 'GREEN',
    yellow: 'YELLOW',
    red: 'RED',
    blue: 'BLUE',
  },

  wall: surface(0x2b303b),
  stone: surface(0x3c3f47),
  empty: surface(0x1e222b),
  ghost: surface(0xe8ecf4, { alpha: 0.16 }),

  // Flat by design — the placeholder measures layout, not mood.
  light: { radius: 999, fade: 1, floor: 1 },

  // The exact numbers `PixiRenderer` hand-typed before this was a token
  // (2026-08-19). Kept unchanged here on purpose: the placeholder is the
  // control, and moving its fog dim would make it a second opinion instead
  // of one.
  fog: { veil: 0.45, alpha: 0.3 },
};
