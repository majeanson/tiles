import { surface, type Theme } from '../tokens';

const WEBFONT =
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700' +
  '&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap';

/**
 * 2c — Torchlit Map. "The Diablo 2 one."
 *
 * Everything is LIT rather than coloured: one warm pool above the middle of the
 * screen, deep falloff to near-black at the edges, dull gold chrome, and one blood
 * red that only ever means loss. Identity lives in surface height and finish
 * because light is already the variable — crypt rough matte, cemetery low and dry,
 * burial ground mounded, catacomb recessed and specular.
 *
 * The direction states one hard rule and the renderer honours it: **no in-play
 * tile ever drops below 28% luminance no matter how far into the falloff it
 * sits.** Darkness hides the space, never the ground you have built. That is why
 * `vignette.strength` here is a ceiling the vignette is clamped to rather than a
 * free gradient — see `PixiRenderer`.
 *
 * The direction's best idea is one we cannot build yet: each placement carries a
 * little light with it, so the pool grows as you build and running out of tiles
 * reads as the light going out. Recorded in `prompt.md`, not faked here.
 */
export const TORCHLIT: Theme = {
  id: 'torchlit',
  name: 'Torchlit Map',
  note: 'Torchlight in a dark room. The light source is doing the fog-of-war job: a warm pool over the middle of the map, deep falloff, everything past it dark and blurred. Grim, heavy, gold-and-blood chrome; the map is endless because the darkness is.',
  source: 'Art Directions.dc.html §2c (torch2)',

  orientation: 'flat',

  board: {
    background: 0x0a0806,
    seam: 0.04,
    edge: 0x18120d,
    edgeWidth: 0.035,
    legalEdge: 0xc79a4b,
    ripeEdge: 0xf7e6be,
    ripeEdgeWidth: 0.12,
    vignette: { colour: 0x070503, strength: 0.72 },
  },

  ink: {
    bg: 0x0a0806,
    ink: 0xe8d6ae,
    inkDim: 0xb9a480,
    inkFaint: 0x8a7452,
    accent: 0xc79a4b,
    danger: 0xc1362b,
    panel: 0x1a140e,
    panelEdge: 0x433624,
    panelEdgeActive: 0xc79a4b,
  },

  type: {
    display: "Cinzel, 'Trajan Pro', Georgia, serif",
    label: "Cinzel, 'Trajan Pro', Georgia, serif",
    body: "'EB Garamond', Garamond, Georgia, serif",
    labelTracking: '0.18em',
    webfontHref: WEBFONT,
  },

  // "80ms per link easing to 60 ... falls back to gloom over 700ms with embers."
  // The longest tail of the three: here the pop is a room lighting up, and a room
  // that relights instantly is a strobe rather than a bell.
  motion: {
    popMs: 420,
    popStaggerMs: 80,
    popColour: 0xf7e6be,
    popAlpha: 0.95,
    popLift: 0.8,
  },

  terrain: {
    // CRYPT — rough matte, 60° hatch.
    green: surface(0x3e4a2e, {
      fillTo: 0x242c1c,
      pattern: { kind: 'hatch', angleDeg: 60, ink: 0x000000, alpha: 0.22, bar: 2, gap: 4 },
      asset: 'terrain.green',
    }),
    // CEMETERY — low and dry, the lightest surface under the torch.
    yellow: surface(0xc6b187, { fillTo: 0x98865f, asset: 'terrain.yellow' }),
    // BURIAL GROUND — mounded rows, catching the flame on the ridges.
    red: surface(0x9a5a32, {
      fillTo: 0x6b3a1e,
      pattern: { kind: 'dots', ink: 0x000000, alpha: 0.24, radius: 1.5, pitch: 9 },
      asset: 'terrain.red',
    }),
    // CATACOMB — recessed and specular, the warm rule being reflected water.
    // Darkened from the document's `#2F4A55 → #1A2C35`, which landed 0.001 from
    // crypt in L*: two of the four terrains were literally the same tone. The
    // direction's own answer to this is "identity lives in surface height and
    // finish, because light is already the variable" — but recessed water still
    // has to be darker than matte stone, or the finish is carrying a job value
    // should be doing.
    blue: surface(0x243b45, {
      fillTo: 0x111f28,
      pattern: { kind: 'hatch', angleDeg: 0, ink: 0xffecc8, alpha: 0.14, bar: 1, gap: 5 },
      asset: 'terrain.blue',
    }),
  },
  /**
   * The direction's own words were CRYPT / CEMETERY / BURIAL GROUND /
   * CATACOMB — four graveyard synonyms, which is atmospheric on a reference
   * sheet and unusable on a card you must read in half a second. Renamed
   * 2026-08-15, when Gate E opened and the colours had powers to be named
   * after: each word now says what its colour DOES. Moss crowds, embers keep
   * company, ash is what the wake is, the tide is what carries you out.
   * Same register, four distinct silhouettes, and a name that teaches.
   */
  terrainNames: {
    green: 'MOSS',
    yellow: 'EMBER',
    red: 'ASH',
    blue: 'TIDE',
  },

  // Lifted 2026-08-15: the dark band was 0.007 above the background in L* —
  // under a torch, blocked ground vanished into the dark instead of blocking.
  // Up a step, band contrast kept, pinned in `theme.test.ts`.
  wall: surface(0x261d16, {
    pattern: { kind: 'bands', angleDeg: 135, a: 0x261d16, b: 0x1b1512, width: 4 },
    asset: 'terrain.wall',
  }),

  // Dry flagstone, sitting between crypt and burial ground in value. Lighter than
  // the ground it replaces on purpose: under a torch, the spent parts of the map
  // are the bare pale slabs, and a board going pale is the signal to move on.
  stone: surface(0x5a5044, { fillTo: 0x453d33, asset: 'terrain.stone' }),

  empty: surface(0x151310, { inset: 0.09 }),
  ghost: surface(0xf7dba0, { fillTo: 0x9c7331, alpha: 0.3, asset: 'terrain.ghost' }),
};
