import { surface, type Theme } from '../tokens';

/**
 * Torchlit, turned up. "The same room, with the lamps lit."
 *
 * Not a fourth art direction and not an argument against the third. Gate E chose
 * torchlit on 2026-08-20 and this does not re-open that: same fiction, same four
 * names, same hues, same textures, same voice. What moves is VALUE — the ladder
 * the four terrains sit on is stretched at both ends, the ink goes to warm white,
 * the chrome goes up a step, and the torch stops being a torch.
 *
 * It exists because a direction whose whole argument is "the map is endless
 * because the darkness is" has a cost, and the cost is paid by whoever is playing
 * on a bus in the sun, or has asked their operating system for more contrast, or
 * simply cannot read a dull gold number on dark ground. `pickForScheme` hands
 * them this without either of us having to call the atmospheric version a
 * mistake.
 *
 * The three numbers that carry it, and why they are the three:
 *
 *   - `light.floor` 0.42 -> 0.72. The torch's falloff is the single biggest
 *     eater of contrast on the board, because it multiplies the GROUND while the
 *     label above it is drawn at full strength. A high floor is the honest way
 *     to say "there is a lamp in this room" without deleting the falloff, which
 *     is still what makes the built structure read as lit.
 *   - `vignette.strength` 0.72 -> 0.28. Same reasoning, at the frame instead of
 *     the cell.
 *   - `fog.alpha` 0.45 -> 0.62. Remembered ground is the other place the dark
 *     wins; memory here is a faded photograph rather than a shape in the gloom.
 *
 * Every value below is checked by `theme.test.ts` and `contrast.test.ts` exactly
 * as torchlit's are — this direction earns its place by passing, not by being a
 * variant of one that does.
 */
export const TORCHLIT_BRIGHT: Theme = {
  id: 'torchlit-bright',
  name: 'Torchlit — Lamps Lit',
  note: 'Torchlit with the lamps lit. Same grim room, same gold and blood, but the light reaches the corners: a wide value ladder, warm-white ink, and a falloff that dims the far map without swallowing it. For sunlight, for tired eyes, and for anyone whose phone asked for more contrast.',
  source: 'Art Directions.dc.html §2c (torch2), widened for contrast 2026-08-25',

  orientation: 'flat',

  board: {
    // True black rather than torchlit's near-black. The ladder below needs every
    // step of range it can get at the bottom, and this is the cheapest one.
    background: 0x000000,
    seam: 0.04,
    edge: 0x2e2419,
    edgeWidth: 0.04,
    legalEdge: 0xf0c069,
    ripeEdge: 0xfffaf0,
    // Louder than torchlit's 0.12. Ripe is the whole harvest decision, and this
    // is the direction for people who are having trouble seeing it.
    ripeEdgeWidth: 0.15,
    vignette: { colour: 0x000000, strength: 0.28 },
    home: { ring: 0xff9440, ringWidth: 0.07 },
    // A brighter room throws a harder highlight and a shorter shadow.
    sheen: 0.07,
    shade: 0.1,
  },

  ink: {
    bg: 0x000000,
    ink: 0xfff6e6,
    inkDim: 0xe4d5b4,
    inkFaint: 0xc9b48b,
    accent: 0xf0c069,
    magic: 0xc9a8ff,
    unique: 0xffa259,
    danger: 0xff6a58,
    panel: 0x100c08,
    panelEdge: 0x574733,
    panelEdgeActive: 0xf0c069,
    // Black, and a thicker outline than torchlit's: EMBER is the palest ground
    // in the game and this direction makes it paler still, so the halo is doing
    // more of the work here than anywhere else.
    halo: 0x000000,
    haloWidth: 0.2,
  },

  type: {
    display: "Cinzel, 'Trajan Pro', Georgia, serif",
    label: "Cinzel, 'Trajan Pro', Georgia, serif",
    body: "'EB Garamond', Garamond, Georgia, serif",
    labelTracking: '0.18em',
    webfontHref: null,
  },

  motion: {
    popMs: 420,
    popStaggerMs: 80,
    popColour: 0xfffaf0,
    popAlpha: 0.95,
    popLift: 0.8,
    popGlowScale: 3.6,
    emberGravity: 0.65,
    emberLifeMs: 620,
  },

  // Torchlit's voice, unchanged. Contrast is a thing you see.
  voice: {
    pop: { baseHz: 330, stepHz: 18, decay: 0.25, wave: 'triangle' as const },
    claim: { cache: 262, site: 523, territory: 165, shrine: 466, find: 784 },
    claimDecay: 0.7,
    claimWave: 'triangle' as const,
    dry: { hz: 87, decay: 1.6 },
    gain: 0.18,
  },

  /*
   * The ladder, stretched: moss 0.203 / ash 0.376 / tide 0.543 / ember 0.774,
   * against torchlit's 0.233 / 0.361 / 0.451 / 0.648. Every gap is past 0.15
   * where the greyscale rule asks for 0.05, so these four survive not just
   * greyscale but a bad screen at half brightness in daylight.
   *
   * Hues and textures are torchlit's, deliberately unchanged — a player who
   * switches mid-run must not have to relearn which colour is which.
   */
  terrain: {
    green: surface(0x35431f, {
      fillTo: 0x1d2713,
      pattern: { kind: 'hatch', angleDeg: 60, ink: 0x000000, alpha: 0.24, bar: 2, gap: 4 },
      overlay: { kind: 'dots', ink: 0x8fb468, alpha: 0.18, radius: 1.3, pitch: 11 },
      asset: 'terrain.green',
    }),
    yellow: surface(0xe8d3a4, {
      fillTo: 0xbca87a,
      pattern: { kind: 'dots', ink: 0xfff0c4, alpha: 0.36, radius: 2.1, pitch: 14 },
      overlay: { kind: 'hatch', angleDeg: 90, ink: 0x000000, alpha: 0.1, bar: 1, gap: 5 },
      asset: 'terrain.yellow',
    }),
    red: surface(0x9c5b2e, {
      fillTo: 0x6a3a1a,
      pattern: { kind: 'dots', ink: 0x000000, alpha: 0.26, radius: 1.5, pitch: 9 },
      overlay: { kind: 'dots', ink: 0x000000, alpha: 0.14, radius: 0.6, pitch: 5 },
      asset: 'terrain.red',
    }),
    blue: surface(0x6fa8bf, {
      fillTo: 0x3b6b80,
      pattern: { kind: 'hatch', angleDeg: 0, ink: 0xfffaf0, alpha: 0.16, bar: 1, gap: 5 },
      overlay: { kind: 'hatch', angleDeg: 0, ink: 0x0a161c, alpha: 0.14, bar: 1, gap: 9 },
      asset: 'terrain.blue',
    }),
  },
  terrainNames: {
    green: 'MOSS',
    yellow: 'EMBER',
    red: 'ASH',
    blue: 'TIDE',
  },

  // Lifted with everything else, and by more than everything else: against a
  // true-black board a wall has further to climb before it stops reading as a
  // hole in the world. Bands kept close together, as torchlit's are, so it
  // reads as a dark mass with a whisper of rubble rather than a barber pole.
  wall: surface(0x2a2018, {
    pattern: { kind: 'bands', angleDeg: 135, a: 0x2a2018, b: 0x241a12, width: 10 },
    asset: 'terrain.wall',
  }),

  // Pale flagstone, and paler than torchlit's — "the board going pale is the
  // signal to move on" is a signal worth making loud in the loud direction. It
  // sits at 0.466, threaded between ash at 0.376 and tide at 0.543.
  stone: surface(0x847a67, {
    fillTo: 0x6a6151,
    pattern: { kind: 'dots', ink: 0x000000, alpha: 0.18, radius: 1.1, pitch: 5 },
    overlay: { kind: 'hatch', angleDeg: 25, ink: 0x1c1712, alpha: 0.16, bar: 1, gap: 9 },
    scorch: true,
    asset: 'terrain.stone',
  }),

  empty: surface(0x0f0d0a, { inset: 0.09 }),
  ghost: surface(0xfff0d0, { fillTo: 0xb08a44, alpha: 0.34, asset: 'terrain.ghost' }),

  // A lamp, not a torch. The falloff is still here — the built structure still
  // carries its own light, which is the direction's best idea and the reason
  // this is a variant rather than a flat repaint — but it bottoms out at 72%
  // instead of 42%, so the far map is dimmer rather than nearly gone.
  light: { radius: 4, fade: 12, floor: 0.72 },

  // Memory as a faded photograph rather than a shape in the gloom.
  fog: { veil: 0.2, alpha: 0.62 },
};
