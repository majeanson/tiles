import { surface, type Theme } from '../tokens';

/**
 * Daylight. "The same expedition, written up afterwards."
 *
 * The first direction in this game that is not dark, and the first that had to
 * teach `theme/` what a pale board even is — several rules in `tokens.ts` were
 * written as "lighter than the background" when they meant "further from it",
 * which is the same sentence on a dark board and the opposite one here. See
 * `clearance` and `isLight`.
 *
 * The fiction is deliberately NOT torchlit inverted. Torchlit is being in the
 * dark plane with a torch; this is the survey you draw when you get back — ink
 * on vellum, ground tinted rather than lit, everything legible because a map is
 * a thing you read rather than a place you stand in. The four colours keep their
 * names and their textures, because a player switching directions must not have
 * to relearn the board.
 *
 * Two consequences worth knowing before touching a value here:
 *
 *   1. **There is no torch.** `light.floor` is 0.94 — daylight falls on
 *      everything. The falloff is not deleted (the structure still carries a
 *      faint lift, so built ground reads as the subject of the drawing) but it
 *      is a whisper. This direction gives up torchlit's best idea on purpose;
 *      it is the price of being readable in the sun.
 *   2. **The label pair runs the other way.** `ink` is near-black and `halo` is
 *      white, so a mid-value ground is read by the INK and a dark one by the
 *      HALO — the mirror of every dark direction. That leaves a dead band
 *      around L* 0.50 where neither clears 4.5:1, and every terrain end below
 *      is placed to miss it. `contrast.test.ts` is what stops that being
 *      forgotten.
 */
export const DAYLIGHT: Theme = {
  id: 'daylight',
  name: 'Daylight Survey',
  note: 'The expedition written up afterwards: ink on vellum, ground tinted rather than lit, nothing hidden. No torch and no gloom — a map is a thing you read. For bright sun, for anyone whose phone is set to light, and for eyes that would rather not hunt for a number.',
  source:
    'Authored 2026-08-25 for the contrast pass; register borrowed from the retired cold-survey direction.',

  orientation: 'flat',

  board: {
    // Warm vellum, not white. A pure-white board is a torch of its own at night,
    // and this direction is meant to be the comfortable one.
    background: 0xf2ece0,
    seam: 0.04,
    edge: 0xcabfa9,
    edgeWidth: 0.04,
    // On a pale board the loudest edge is the DARKEST one. Both of these are
    // dark, which is why `theme.test.ts` had to start measuring distance from
    // the background rather than raw lightness.
    legalEdge: 0x715723,
    ripeEdge: 0x24180a,
    ripeEdgeWidth: 0.14,
    // No vignette. There is no dark for the board to fall off into, and a pale
    // board with darkened corners reads as a stain rather than as distance.
    vignette: null,
    home: { ring: 0x9a5a1e, ringWidth: 0.07 },
    // A drawing, not a lit room: barely any modelling on the cells at all, or
    // the vellum starts looking like plastic.
    sheen: 0.03,
    shade: 0.05,
  },

  ink: {
    bg: 0xf2ece0,
    // Very nearly black, and warm rather than neutral. It is doing the same job
    // torchlit's pale gold does — reading against seven different grounds — and
    // the further it sits from the middle of the range, the more grounds it can
    // carry on its own.
    ink: 0x0e0b07,
    inkDim: 0x453d2f,
    inkFaint: 0x6b6150,
    accent: 0x715723,
    magic: 0x5b3396,
    unique: 0x9c400b,
    danger: 0xa4231a,
    panel: 0xe6ddcb,
    panelEdge: 0xbfb29a,
    panelEdgeActive: 0x715723,
    // White, not the background: the halo's whole job is to be the furthest
    // thing from whatever the label sits on, and on a pale board that means
    // going past the board. It is what carries the number over the wall and
    // over the darker end of ASH.
    halo: 0xffffff,
    haloWidth: 0.18,
  },

  type: {
    display: "Cinzel, 'Trajan Pro', Georgia, serif",
    label: "Cinzel, 'Trajan Pro', Georgia, serif",
    body: "'EB Garamond', Garamond, Georgia, serif",
    labelTracking: '0.18em',
    webfontHref: null,
  },

  // A pop on paper is ink blooming, not a room lighting up: shorter, and its
  // flash is DARK, because on a pale board a bright flash is invisible.
  motion: {
    popMs: 320,
    popStaggerMs: 70,
    popColour: 0x6b4a1e,
    popAlpha: 0.7,
    popLift: 0.8,
    popGlowScale: 3.2,
    emberGravity: 0.65,
    emberLifeMs: 520,
  },

  // Brighter and drier than torchlit's woody bells — the same three moments in
  // a room with the windows open.
  voice: {
    pop: { baseHz: 392, stepHz: 22, decay: 0.2, wave: 'triangle' as const },
    claim: { cache: 294, site: 587, territory: 196, shrine: 494, find: 880 },
    claimDecay: 0.6,
    claimWave: 'triangle' as const,
    dry: { hz: 98, decay: 1.4 },
    gain: 0.18,
  },

  /*
   * The ladder runs the other way up: ash 0.474 / moss 0.606 / tide 0.726 /
   * ember 0.847, all measured against a ground at 0.936. Ash is the darkest
   * terrain here where it is the second-darkest in torchlit, which is what a
   * pale board does — the colour with the most pigment ends up furthest from
   * the paper.
   *
   * ASH is redder than torchlit's (0xc06a38 against 0x915430) and that is not a
   * taste decision: `fieldDots` deepens each colour to full saturation before
   * inking a field with it, and on this board ash and ember deepened into each
   * other — 54 apart in RGB where the field rule wants 60. Rotating ash away
   * from yellow buys 67 and keeps ember the only sandy thing on the map.
   */
  terrain: {
    green: surface(0x8fae70, {
      fillTo: 0x6a8a4c,
      pattern: { kind: 'hatch', angleDeg: 60, ink: 0x2c3a1c, alpha: 0.2, bar: 2, gap: 4 },
      overlay: { kind: 'dots', ink: 0x3f5626, alpha: 0.14, radius: 1.3, pitch: 11 },
      asset: 'terrain.green',
    }),
    yellow: surface(0xf4e2b6, {
      fillTo: 0xd9c191,
      pattern: { kind: 'dots', ink: 0xa8791f, alpha: 0.3, radius: 2.1, pitch: 14 },
      overlay: { kind: 'hatch', angleDeg: 90, ink: 0x8a6d2e, alpha: 0.1, bar: 1, gap: 5 },
      asset: 'terrain.yellow',
    }),
    red: surface(0xc06a38, {
      fillTo: 0x9a4a22,
      pattern: { kind: 'dots', ink: 0x4a2210, alpha: 0.22, radius: 1.5, pitch: 9 },
      overlay: { kind: 'dots', ink: 0x4a2210, alpha: 0.12, radius: 0.6, pitch: 5 },
      asset: 'terrain.red',
    }),
    blue: surface(0xa9cfe0, {
      fillTo: 0x74a2ba,
      pattern: { kind: 'hatch', angleDeg: 0, ink: 0x27505f, alpha: 0.16, bar: 1, gap: 5 },
      overlay: { kind: 'hatch', angleDeg: 0, ink: 0x27505f, alpha: 0.1, bar: 1, gap: 9 },
      asset: 'terrain.blue',
    }),
  },
  terrainNames: {
    green: 'MOSS',
    yellow: 'EMBER',
    red: 'ASH',
    blue: 'TIDE',
  },

  // Blocked ground is the DARKEST thing on this board, which is the inversion in
  // one object: on a dark board a wall has to be lifted clear of the fog, and
  // here it has to be pushed down clear of the paper. `MIN_WALL_CLEARANCE` is
  // the same 0.045 either way now that it measures distance.
  wall: surface(0x574e40, {
    pattern: { kind: 'bands', angleDeg: 135, a: 0x574e40, b: 0x605648, width: 10 },
    asset: 'terrain.wall',
  }),

  // Spent ground goes toward the paper here, not away from it — the same signal
  // torchlit sends by going pale, sent by going blank. A tile that popped leaves
  // the map looking undrawn.
  stone: surface(0xd4cbb8, {
    fillTo: 0xbab09a,
    pattern: { kind: 'dots', ink: 0x8a806c, alpha: 0.18, radius: 1.1, pitch: 5 },
    overlay: { kind: 'hatch', angleDeg: 25, ink: 0x8a806c, alpha: 0.14, bar: 1, gap: 9 },
    scorch: true,
    asset: 'terrain.stone',
  }),

  empty: surface(0xe9e1d1, { inset: 0.09 }),
  ghost: surface(0x715723, { fillTo: 0xb59a5e, alpha: 0.28, asset: 'terrain.ghost' }),

  // Daylight. The floor is nearly the ceiling, so the falloff survives only as a
  // hint that built ground is the subject of the drawing. This is the one place
  // the direction gives something up rather than translating it.
  light: { radius: 6, fade: 10, floor: 0.94 },

  // Memory as a lighter pencil: pulled toward the paper and drawn faintly, which
  // is the same idea as torchlit's embers-gone-cold in the opposite medium.
  fog: { veil: 0.42, alpha: 0.5 },
};
