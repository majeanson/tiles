import { surface, type Theme } from '../tokens';

const WEBFONT =
  'https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,500;0,700;1,400' +
  '&family=Barlow+Condensed:wght@500;600&display=swap';

/**
 * 2b — Rot Bloom. "Beautiful and wrong."
 *
 * The same landscape logic as Cold Survey, but the ground is diseased: sickly
 * greens, bruised violet earth, standing black water, bone-pale grass. Creeping
 * dread rather than shock — nothing jumps out, it just gets worse the further you
 * go.
 *
 * **This is the direction its own author flagged as the risky one**, and it is the
 * reason `theme.test.ts` exists. Running dark and desaturated by design puts crypt
 * and catacomb close together in greyscale, and the document prescribes the fix
 * rather than leaving it to taste: force cemetery to bone (highest value on the
 * board, no exceptions), pull burial ground lighter than catacomb, and carry
 * identity in silhouette. The values below are the document's, with burial ground
 * lightened from `#6B4258 → #472A3B` to clear catacomb by a measurable margin —
 * the prescribed fix, applied, with a test that fails if anyone reverts it.
 */
export const ROT_BLOOM: Theme = {
  id: 'rot-bloom',
  name: 'Rot Bloom',
  note: 'Beautiful and wrong. The ground is diseased: sickly greens, bruised violet earth, standing black water, bone-pale grass. The fog is not weather, it is something breathing at the edge of the map. Creeping dread rather than shock.',
  source: 'Art Directions.dc.html §2b (rot)',

  orientation: 'flat',

  board: {
    background: 0x080a09,
    seam: 0.05,
    edge: 0x151a15,
    edgeWidth: 0.03,
    legalEdge: 0x7e9b62,
    ripeEdge: 0xc8f0a8,
    ripeEdgeWidth: 0.12,
    vignette: { colour: 0x040605, strength: 0.88 },
    // The sensible default (2026-08-19): reuses the direction's own `accent`
    // at a width well under `ripeEdgeWidth` — see `placeholder.ts`'s home
    // token for the reasoning this and cold-survey's both follow.
    home: { ring: 0xc8f0a8, ringWidth: 0.055 },
  },

  ink: {
    bg: 0x080a09,
    ink: 0xd9e2ce,
    inkDim: 0x8e9c88,
    inkFaint: 0x5d6b5b,
    accent: 0xc8f0a8,
    danger: 0xb4485c,
    panel: 0x11150f,
    panelEdge: 0x252b21,
    panelEdgeActive: 0x7e9b62,
  },

  type: {
    display: "Spectral, 'Iowan Old Style', Georgia, serif",
    label: "'Barlow Condensed', 'Helvetica Neue', Arial, sans-serif",
    body: "Spectral, 'Iowan Old Style', Georgia, serif",
    labelTracking: '0.22em',
    webfontHref: WEBFONT,
  },

  // "100ms then 85, 70, 60, 50 — accelerating, so it feels chased." The stagger
  // is the shortest of the three directions for that reason; this is the one
  // where a big harvest should feel like something getting away from you.
  motion: {
    popMs: 300,
    popStaggerMs: 62,
    popColour: 0xc8f0a8,
    popAlpha: 0.9,
    popLift: 1,
  },

  terrain: {
    // CRYPT — diseased green, diagonal hatch.
    green: surface(0x44502c, {
      fillTo: 0x2a3220,
      pattern: { kind: 'hatch', angleDeg: 70, ink: 0x000000, alpha: 0.24, bar: 2, gap: 4 },
      asset: 'terrain.green',
    }),
    // CEMETERY — bone. Highest value on the board, no exceptions.
    yellow: surface(0xb9b79a, { fillTo: 0x8c8a72, asset: 'terrain.yellow' }),
    // BURIAL GROUND — bruised violet earth. Lightened from the source values so
    // it clears catacomb in greyscale; the document asks for exactly this.
    red: surface(0x8a5a72, {
      fillTo: 0x643d53,
      pattern: { kind: 'dots', ink: 0x000000, alpha: 0.26, radius: 1.5, pitch: 9 },
      asset: 'terrain.red',
    }),
    // CATACOMB — standing black water, horizontal rule.
    blue: surface(0x1f3a3a, {
      fillTo: 0x132424,
      pattern: { kind: 'hatch', angleDeg: 0, ink: 0xbedcd2, alpha: 0.14, bar: 1, gap: 5 },
      asset: 'terrain.blue',
    }),
  },
  terrainNames: {
    green: 'CRYPT',
    yellow: 'CEMETERY',
    red: 'BURIAL GROUND',
    blue: 'CATACOMB',
  },

  // Lifted 2026-08-15: the dark band was 0.004 above the background in L* —
  // walls read as holes in the world. Same move as every value fix here: up a
  // step, band contrast kept, pinned in `theme.test.ts`.
  wall: surface(0x1d1f24, {
    pattern: { kind: 'bands', angleDeg: 135, a: 0x1d1f24, b: 0x15161a, width: 4 },
    asset: 'terrain.wall',
  }),

  // Scorched: the one place the bloom will not touch, which is what the direction
  // says about blocked ground and is truer still of ground you have already spent.
  // Lifted to sit between catacomb and crypt in value rather than on top of
  // catacomb, where the greyscale test found it.
  stone: surface(0x3a3c33, { fillTo: 0x2c2e27, asset: 'terrain.stone' }),

  empty: surface(0x0e100f, { inset: 0.09 }),
  ghost: surface(0xc8f0a8, { fillTo: 0x4e6b2e, alpha: 0.26, asset: 'terrain.ghost' }),

  // Overcast and close: less a torch than a horizon that stops caring.
  light: { radius: 6, fade: 12, floor: 0.55 },
};
