import { surface, type Theme } from '../tokens';

const WEBFONT =
  'https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,500;0,700;1,400' +
  '&family=Barlow+Condensed:wght@500;600&display=swap';

/**
 * 2a — Cold Survey. "A real map, drawn at dawn."
 *
 * A burial landscape surveyed in cold morning light: muted, beautiful, slightly
 * forensic. The pleasure is meant to be looking at ground you are READING rather
 * than at a game board, which is why nothing here is saturated and the only warm
 * colour on the whole screen is your dwindling tile count.
 *
 * Values are transcribed from the design document's `THEMES2.mist` and its stated
 * palette; the mapping from its four terrain names to our four colour ids is
 * recorded in `terrainNames` and is arbitrary but fixed.
 *
 * Its own legibility claim, which `theme.test.ts` enforces: four separated
 * greyscale values plus one texture direction each — crypt diagonal hatch,
 * cemetery smooth, burial ground dotted, catacomb horizontal rule. Blocked is the
 * only cross-hatch and the only pure neutral.
 */
export const COLD_SURVEY: Theme = {
  id: 'cold-survey',
  name: 'Cold Survey',
  note: 'A burial landscape surveyed in cold morning light. Muted, beautiful, slightly forensic — the pleasure is looking at ground you are reading rather than a game board. Nothing bright, nothing cute; the only warm colour on screen is your dwindling tile count.',
  source: 'Art Directions.dc.html §2a (mist)',

  orientation: 'flat',

  board: {
    background: 0x0d1214,
    seam: 0.045,
    edge: 0x1b2426,
    edgeWidth: 0.03,
    legalEdge: 0x6d7f81,
    ripeEdge: 0xdce3e1,
    ripeEdgeWidth: 0.11,
    vignette: { colour: 0x05080a, strength: 0.82 },
  },

  ink: {
    bg: 0x0d1214,
    ink: 0xdce3e1,
    inkDim: 0x9eabac,
    inkFaint: 0x6e7c7e,
    accent: 0xaec0c4,
    danger: 0xc9765a,
    panel: 0x141b1d,
    panelEdge: 0x2c3436,
    panelEdgeActive: 0xc9765a,
  },

  type: {
    display: "Spectral, 'Iowan Old Style', Georgia, serif",
    label: "'Barlow Condensed', 'Helvetica Neue', Arial, sans-serif",
    body: "Spectral, 'Iowan Old Style', Georgia, serif",
    labelTracking: '0.2em',
    webfontHref: WEBFONT,
  },

  // "90ms per link, easing to 60ms" — a measured collapse, not a firework. The
  // reward the direction names is that the fog line pushes outward and you can
  // suddenly see further, which is not buildable yet; the pale dust is.
  motion: {
    popMs: 340,
    popStaggerMs: 90,
    popColour: 0xe8eeea,
    popAlpha: 0.8,
    popLift: 0.7,
  },

  terrain: {
    // CRYPT — rough matte stone, raised slab edge, darkest of the four.
    green: surface(0x3c5348, {
      fillTo: 0x2c3e36,
      pattern: { kind: 'hatch', angleDeg: 48, ink: 0x000000, alpha: 0.16, bar: 2, gap: 5 },
      asset: 'terrain.green',
    }),
    // CEMETERY — bone-pale dry grass, upright markers, lightest value.
    yellow: surface(0xcfc7ae, { fillTo: 0xb3a98e, asset: 'terrain.yellow' }),
    // BURIAL GROUND — turned earth in mounded rows, mid value.
    red: surface(0x9c7a52, {
      fillTo: 0x7a5c3c,
      pattern: { kind: 'dots', ink: 0x000000, alpha: 0.2, radius: 1.4, pitch: 8 },
      asset: 'terrain.red',
    }),
    // CATACOMB — recessed and specular, black standing water, sunken opening.
    // Darkened from the document's `#2E4560 → #203044`, which sat 0.048 from
    // crypt in L* and read as one tone with it. §2a's own board text says
    // "cemetery is the light one, catacomb the dark one"; this is that, meant.
    blue: surface(0x294058, {
      fillTo: 0x1b2b3d,
      pattern: { kind: 'hatch', angleDeg: 0, ink: 0xffffff, alpha: 0.16, bar: 1, gap: 5 },
      asset: 'terrain.blue',
    }),
  },
  terrainNames: {
    green: 'CRYPT',
    yellow: 'CEMETERY',
    red: 'BURIAL GROUND',
    blue: 'CATACOMB',
  },

  // Lifted 2026-08-15: the dark band sat 0.001 above the canvas background in
  // L*, so half of every wall melted into the fog. The whole wall moved up one
  // step — dark band to the old fill, fill one step above — keeping the band
  // contrast while clearing the background by the terrain bar. Value spacing,
  // not a new hue; `theme.test.ts` pins it.
  wall: surface(0x21252a, {
    pattern: { kind: 'bands', angleDeg: 135, a: 0x21252a, b: 0x191c1f, width: 4 },
    asset: 'terrain.wall',
  }),

  // Not in the reference sheet. Read as the aftermath of a harvest rather than as
  // furniture: the crypt's own stone, drained of its hatch and its green, and
  // sitting BELOW every live terrain in value — spent ground is the darkest thing
  // on the board that is not a wall, so a map filling up with it visibly dims.
  stone: surface(0x2a302f, { fillTo: 0x1e2322, asset: 'terrain.stone' }),

  empty: surface(0x111819, { inset: 0.09 }),
  ghost: surface(0xe8eeea, { fillTo: 0x8fa79c, alpha: 0.28, asset: 'terrain.ghost' }),

  // Forensic daylight: the survey is lit from everywhere, so distance costs
  // almost nothing. Present so the direction states its own answer rather
  // than inheriting one.
  light: { radius: 10, fade: 14, floor: 0.78 },
};
