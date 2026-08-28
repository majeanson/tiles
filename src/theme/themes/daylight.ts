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
    // Darkened 0xf2ece0 → 0xe8dcc4 on 2026-08-25, same day it shipped (Marc,
    // from the phone: "light is too light") — from bright cream to aged paper,
    // with every ink and the ground pulled down in step so the whole budget
    // stayed green rather than one number moving alone.
    background: 0xe8dcc4,
    seam: 0.04,
    // Darkened 0xbfb096 → 0x9c8f74 and widened 0.04 → 0.05 on 2026-08-28,
    // alongside the ladder below. A pale board has a ceiling the dark ones do
    // not: the paper is at 0.881 L* and four terrains need ~0.3 of ladder
    // under it, so the topmost colour can never be more than ~0.15 from the
    // page however it is repainted. What carries a tile's SILHOUETTE at that
    // range is its outline, and this one was a whisper — the cheapest half of
    // the answer to "ember has no contrast", and the half that helps every
    // terrain rather than only the top rung.
    edge: 0x9c8f74,
    edgeWidth: 0.05,
    // On a pale board the loudest edge is the DARKEST one. Both of these are
    // dark, which is why `theme.test.ts` had to start measuring distance from
    // the background rather than raw lightness.
    legalEdge: 0x64491c,
    ripeEdge: 0x24180a,
    ripeEdgeWidth: 0.14,
    // No vignette. There is no dark for the board to fall off into, and a pale
    // board with darkened corners reads as a stain rather than as distance.
    vignette: null,
    home: { ring: 0x9a5a1e, ringWidth: 0.07 },
    // Nearly solid, where every dark direction fades to 0.55 (2026-08-28).
    // The fade is toward the BOARD, and this board is vellum: at 0.55 the
    // landmark's dark tablet came out at 0.59 L* — a mid-grey that swallowed
    // the gold mark on it, the dark glyph in it, and any sense that the thing
    // was live. Held near-solid, a beacon here reads the way it reads on a
    // real survey: a bold marked point on unfinished ground, told apart from
    // a drawn destination by its slow halo breath rather than by dissolving.
    beaconFade: 0.88,
    // A drawing, not a lit room: barely any modelling on the cells at all, or
    // the vellum starts looking like plastic.
    sheen: 0.03,
    shade: 0.05,
  },

  ink: {
    bg: 0xe8dcc4,
    // Very nearly black, and warm rather than neutral. It is doing the same job
    // torchlit's pale gold does — reading against seven different grounds — and
    // the further it sits from the middle of the range, the more grounds it can
    // carry on its own.
    ink: 0x0e0b07,
    inkDim: 0x40382a,
    inkFaint: 0x5c5342,
    accent: 0x64491c,
    // The one place this direction needs a colour its accent cannot be. The
    // accent above is read as TEXT on vellum, so it is dark; a destination is
    // a mark on the wall's dark tablet, so it must be light. Gold rather than
    // white because the mark means "worth walking to" in every direction, and
    // gold is the word this game has always used for that — 4.34:1 on the
    // solid tablet, 3.31 once faded to a beacon, against a floor of 3.
    lit: 0xe8b551,
    magic: 0x532e8a,
    unique: 0x8e3a0a,
    danger: 0x9c1f16,
    panel: 0xdccfb2,
    panelEdge: 0xab9c7e,
    panelEdgeActive: 0x64491c,
    // White, not the background: the halo's whole job is to be the furthest
    // thing from whatever the label sits on, and on a pale board that means
    // going past the board. It is what carries the number over the wall and
    // over the darker end of ASH.
    halo: 0xffffff,
    haloWidth: 0.1,
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
   * The ladder runs the other way up: ash 0.453 / moss 0.529 / tide 0.611 /
   * ember 0.736, all measured against a ground at 0.881. Ash is the darkest
   * terrain here where it is the second-darkest in torchlit, which is what a
   * pale board does — the colour with the most pigment ends up furthest from
   * the paper.
   *
   * **The whole ladder came down on 2026-08-28** (Marc, from the phone:
   * "ember in light skin has no contrast compared to torchlit"), and he was
   * describing a measurement: EMBER's bright end was 0xf4e2b6 at **0.022 L\*
   * from the paper — 1.06:1**, which is a tile you cannot see the SHAPE of,
   * never mind read a number on. TIDE's was 0.071. Both passed every test in
   * the project, because `theme.test.ts` asked whether the four terrains were
   * tellable apart from EACH OTHER and nothing asked whether they were
   * tellable from the BOARD — a question no dark direction could ever fail,
   * since black is the furthest thing from every colour they own. The rule
   * exists now (`MIN_GROUND_CLEARANCE`), and this is the palette that pays
   * it: ember was the offender, but the three above ash all had to come down
   * together or the 0.05 the greyscale rule wants between neighbours would
   * have closed. Hue, saturation, pattern and gradient depth are untouched —
   * only value moved, and it moved by the same construction for all six ends.
   *
   * ASH is redder than torchlit's (0xc45a2c against 0x915430) and that is not a
   * taste decision: `fieldDots` deepens each colour to full saturation before
   * inking a field with it, and on this board ash and ember deepened into each
   * other — 54 apart in RGB where the field rule wants 60. Rotating ash away
   * from yellow buys 67 and keeps ember the only sandy thing on the map.
   * Rotated a step further when the paper darkened (2026-08-25): the darker
   * ground re-ran fieldDots' equalisation and ember/ash collided again at 54
   * where the rule wants 60.
   */
  terrain: {
    green: surface(0x78925e, {
      fillTo: 0x5f7b44,
      pattern: { kind: 'hatch', angleDeg: 60, ink: 0x2c3a1c, alpha: 0.2, bar: 2, gap: 4 },
      overlay: { kind: 'dots', ink: 0x3f5626, alpha: 0.14, radius: 1.3, pitch: 11 },
      asset: 'terrain.green',
    }),
    yellow: surface(0xcdbd98, {
      fillTo: 0xbba67d,
      pattern: { kind: 'dots', ink: 0xa8791f, alpha: 0.3, radius: 2.1, pitch: 14 },
      overlay: { kind: 'hatch', angleDeg: 90, ink: 0x8a6d2e, alpha: 0.1, bar: 1, gap: 5 },
      asset: 'terrain.yellow',
    }),
    red: surface(0xc45a2c, {
      fillTo: 0x9e401c,
      pattern: { kind: 'dots', ink: 0x4a2210, alpha: 0.22, radius: 1.5, pitch: 9 },
      overlay: { kind: 'dots', ink: 0x4a2210, alpha: 0.12, radius: 0.6, pitch: 5 },
      asset: 'terrain.red',
    }),
    blue: surface(0x87a6b3, {
      fillTo: 0x648ba0,
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

  empty: surface(0xd8cba9, { inset: 0.09 }),
  ghost: surface(0x715723, { fillTo: 0xb59a5e, alpha: 0.28, asset: 'terrain.ghost' }),

  // Daylight. The floor is nearly the ceiling, so the falloff survives only as a
  // hint that built ground is the subject of the drawing. This is the one place
  // the direction gives something up rather than translating it.
  light: { radius: 6, fade: 10, floor: 0.94 },

  // Memory as a lighter pencil: pulled toward the paper and drawn faintly, which
  // is the same idea as torchlit's embers-gone-cold in the opposite medium.
  fog: { veil: 0.42, alpha: 0.5 },
};
