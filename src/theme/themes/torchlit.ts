import { surface, type Theme } from '../tokens';

// SELF-HOSTED since 2026-08-20 (the launch audit): this used to be a
// fonts.googleapis.com link injected at boot — a runtime request to Google
// carrying every player's IP, which made the game's own "nothing leaves
// your phone" claim false, was uncacheable by the service worker
// (cross-origin early-return), and cost first paint a third-party round
// trip. The same two families now live in `public/fonts/` as variable
// woff2, declared in style.css, precached with everything else.
const WEBFONT = null;

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
 * The direction's best idea, BUILT (2026-08-18/19): each placement carries a
 * little light with it, so the pool grows as you build and running out of tiles
 * reads as the light going out. `ui/view.ts`'s `structureDistances` is the
 * mechanism — a multi-source BFS from every tile and stone on the board, not
 * from the one hex you last placed — feeding the same `brightness()` curve
 * below. Was recorded here as unbuilt; is not, any more.
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
    // The hearth (2026-08-19): a warm ember ring on the origin cell, distinct
    // from the gold `accent` every OTHER stroke on this board already wears —
    // torchlit is the one direction where "home" gets its own hue rather than
    // reusing the signature colour, because a torch's own coals read as
    // exactly that. Quiet on purpose: `ringWidth` sits well under
    // `ripeEdgeWidth`, and the stroke ladder in `PixiRenderer.ts` never draws
    // it over anything louder regardless.
    home: { ring: 0xe0803c, ringWidth: 0.065 },
    // The value that was hard-typed in `PixiRenderer` until 2026-08-28. A
    // beacon here fades into black, which keeps it dark — nothing moves.
    beaconFade: 0.55,
    // A torch throws hard light: a bright lip along the top of every cell and a
    // deep one at its foot. These are the numbers `bake.ts` used to hold as
    // constants for every direction; torchlit is the direction they were tuned
    // for, so it keeps them exactly.
    sheen: 0.05,
    shade: 0.08,
  },

  ink: {
    bg: 0x0a0806,
    // Lifted 0xe8d6ae → 0xf2e4c4 on 2026-08-25 (Marc, with a screenshot:
    // "constrast is very bad"). The old ink cleared 4.5:1 on MOSS and STONE
    // and failed everywhere else — ASH's bright end at 3.78:1, TIDE at 2.53,
    // EMBER at **1.46**, which is a number you cannot read at all. The halo
    // below is what rescues EMBER and TIDE; this lift is what lets ASH clear
    // the bar on the ink alone rather than leaning on the outline for a
    // ground the ink ought to manage by itself. Warmer-white rather than
    // white: the direction's gold is the point, and 0xf2e4c4 is still gold.
    ink: 0xf2e4c4,
    inkDim: 0xb9a480,
    // Lifted 0x9a8358 → 0xa28b5e (2026-08-25). Against the board it was already
    // fine at 5.49:1; what it failed was the one place it is drawn on the BOARD
    // rather than in the chrome — a remembered landmark's glyph, over fogged
    // EMBER, at 2.94:1 against a floor of 3. A remembered destination is the
    // thing a next run is oriented by, and "dim, never hidden" is the rule it
    // was breaking. Still the quietest ink here by a wide margin; it just stops
    // disappearing into the one ground that was pale enough to swallow it.
    inkFaint: 0xa28b5e,
    accent: 0xc79a4b,
    // The same gold: on a black board the chrome's signature colour and the
    // "walk here" mark are one colour, which is why the two were one token
    // until a pale direction proved they are two jobs. 6.42:1 on the wall
    // ground a landmark stands on, 7.10 once faded to a beacon.
    lit: 0xc79a4b,
    // The rarities' own voices (2026-08-20, Marc): the selected ring below
    // is the SAME gold as the accent, so a rare card and a selected card
    // were indistinguishable at a glance. MAGIC is moonlit violet — the
    // one cool note on a warm board, the colour of the wild card that
    // matches everything. UNIQUE is open flame — hotter than the torch's
    // own muted gold, redder than the hearth ring, lighter than danger.
    magic: 0xb08fe0,
    unique: 0xf2914a,
    // Raised 0xc1362b → 0xe05244 on 2026-08-25. It sat at 3.65:1 against the
    // board — under the bar, on the ONE number in the game that kills you.
    // Now 5.20:1 on the board and 4.75 on a panel, still the same blood: a
    // lift in value, not a move in hue, and it stays the only warm colour the
    // tile count ever wears. The panel behind it, not the board, is what set
    // the value — 4.62 on the board was already enough, and the same red on
    // `panel` was 4.21.
    danger: 0xe05244,
    panel: 0x1a140e,
    panelEdge: 0x433624,
    panelEdgeActive: 0xc79a4b,
    // The board's own dark, which is already the furthest thing from anything
    // painted on top of it — see `Ink.halo`. EMBER and TIDE are read entirely
    // through this: 9.56:1 and 5.53:1 where the ink itself manages 1.66 and
    // 2.87.
    halo: 0x0a0806,
    haloWidth: 0.1,
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
  // that relights instantly is a strobe rather than a bell. The embers half of
  // that sentence was unbuilt for a long time — the flash alone carried it —
  // until `PixiRenderer.ts`'s pooled ember burst (2026-08-19), which every
  // theme gets, not only this one; the document's own words just named it
  // first.
  motion: {
    popMs: 420,
    popStaggerMs: 80,
    popColour: 0xf7e6be,
    popAlpha: 0.95,
    popLift: 0.8,
    // The register, tuned (WORKPLAN Stage 4, 2026-08-20): the burst's light
    // spills a little further into the pool than the control does, and its
    // embers fall back harder and smoulder a beat longer before they go out
    // — rise, settle, cool, the same arc a real coal takes.
    popGlowScale: 3.6,
    emberGravity: 0.65,
    emberLifeMs: 620,
  },

  // The voice (ideas/sound.md): warm and woody — triangle waves, low bells,
  // a slow ember of a dry-warning. Torchlit sounds like it looks.
  voice: {
    pop: { baseHz: 330, stepHz: 18, decay: 0.25, wave: 'triangle' as const },
    claim: { cache: 262, site: 523, territory: 165, shrine: 466, find: 784 },
    claimDecay: 0.7,
    claimWave: 'triangle' as const,
    dry: { hz: 87, decay: 1.6 },
    gain: 0.18,
  },

  // Every `overlay` below (2026-08-19, WORKPLAN Stage 3) is a SECOND layer
  // at its own kind/ink/alpha, drawn over the axis-defining `pattern` — the
  // axis itself never moves, so red vs blue is still told apart by texture
  // direction rather than brightness. The overlay is what turns "a hatch"
  // into "moss", "grass with light on it" or "ash with soot in it".
  terrain: {
    // CRYPT — rough matte, 60° hatch, moss clumped where it catches the
    // torch. The overlay is a looser, brighter dot grid at a wider pitch
    // than the hatch's own gap — a second frequency reading as clustered
    // growth rather than a second, competing axis.
    green: surface(0x3e4a2e, {
      fillTo: 0x242c1c,
      pattern: { kind: 'hatch', angleDeg: 60, ink: 0x000000, alpha: 0.22, bar: 2, gap: 4 },
      overlay: { kind: 'dots', ink: 0x7a9a5a, alpha: 0.16, radius: 1.3, pitch: 11 },
      asset: 'terrain.green',
    }),
    // CEMETERY — low and dry, the lightest surface under the torch. DOTS
    // lead since 2026-08-20 (Marc, on the phone: "a texture maybe dotted
    // for ember its clearer") — the warm glints that were the overlay are
    // the identity now, bigger and brighter: embers catching in dry grass,
    // which is what the colour is NAMED. The 2026-08-18 verticals argued
    // "four orientations no squint can confuse", and play answered that
    // thin bars at ground scale read as nothing at all; they stay as a
    // faint undertone so the grass is still there under the sparks. Ember
    // stays unconfusable with ASH by polarity, not orientation: bright
    // warm sparks on the LIGHTEST ground against dark pits on dark rust.
    // POLKA since Day 2 (Marc: "ember is too much like ash texture —
    // polka dot it instead"): the spark dots grew into large, REGULAR,
    // well-spaced rounds — ordered where ash's pits are scattered, big
    // where they are small, bright where they are dark. Three separations
    // instead of polarity alone.
    yellow: surface(0xc6b187, {
      fillTo: 0x98865f,
      pattern: { kind: 'dots', ink: 0xffd28a, alpha: 0.34, radius: 2.1, pitch: 14 },
      overlay: { kind: 'hatch', angleDeg: 90, ink: 0x000000, alpha: 0.08, bar: 1, gap: 5 },
      asset: 'terrain.yellow',
    }),
    // BURIAL GROUND — mounded rows, catching the flame on the ridges. The
    // overlay is a second, finer dot layer at a pitch that shares no common
    // factor with the first (9 and 5) so the two grids never line up into a
    // visible lattice — the two together read as mottled ash rather than
    // polka dots.
    // The bright end darkened 0x9a5a32 → 0x915430 on 2026-08-25. ASH is the
    // one terrain that sits in the middle of the value range, which is exactly
    // where a label has no good answer: the ink managed 4.29:1 on it and the
    // halo 3.70, so neither half of the pair cleared the bar and the number on
    // an ash tile was the second-worst on the board. Twenty-seven thousandths
    // of L* buys 4.74. The gradient end, the pattern and the hue are untouched,
    // and the ladder still runs green 0.233 · ash 0.361 · tide 0.451 · ember
    // 0.648 — every gap well past the 0.05 the greyscale rule asks for.
    red: surface(0x915430, {
      fillTo: 0x6b3a1e,
      pattern: { kind: 'dots', ink: 0x000000, alpha: 0.24, radius: 1.5, pitch: 9 },
      overlay: { kind: 'dots', ink: 0x000000, alpha: 0.12, radius: 0.6, pitch: 5 },
      asset: 'terrain.red',
    }),
    // CATACOMB — recessed and specular, the warm rule being reflected water.
    // Darkened from the document's `#2F4A55 → #1A2C35`, which landed 0.001 from
    // crypt in L*: two of the four terrains were literally the same tone. The
    // direction's own answer to this is "identity lives in surface height and
    // finish, because light is already the variable" — but recessed water still
    // has to be darker than matte stone, or the finish is carrying a job value
    // should be doing. The overlay is a second horizontal rule, darker and
    // wider-spaced than the first: two ripples instead of one ruling, so the
    // water reads as moving rather than lined.
    // LIGHTER since 2026-08-21 (Marc, on the phone: "change the tide color
    // to a lighter blue so it has a better contrast vs moss"). It was
    // 0x243b45/0x111f28 — value 0.172 against moss's 0.233, so the tide sat
    // a hair DARKER than the moss and the two read as one dark mass.
    //
    // The choice of how much lighter is not free: ember is 0.374, and the
    // greyscale rule wants 0.05 between neighbours, so the band from 0.324
    // to 0.424 is closed — a tide in there collides with ash instead. That
    // leaves just above moss (~0.30, a small gain) or above ember, and this
    // takes the second: value 0.451, which puts 0.218 of pure value between
    // tide and moss where there were 0.061, and still leaves 0.077 to ember
    // below it and 0.197 to sand above.
    blue: surface(0x578ea3, {
      fillTo: 0x2c5568,
      pattern: { kind: 'hatch', angleDeg: 0, ink: 0xffecc8, alpha: 0.14, bar: 1, gap: 5 },
      overlay: { kind: 'hatch', angleDeg: 0, ink: 0x0a161c, alpha: 0.12, bar: 1, gap: 9 },
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
  //
  // Quieted 2026-08-18: 4px bands at phone scale read as a barber pole, not
  // as rubble. Wider (10, was 4) means a single hex shows at most one seam
  // instead of several; the two band colours were also pulled closer
  // together (was 0x1b1512, a 0.043 L* gap from the fill) so the texture
  // reads as a near-solid dark mass with a whisper of banding rather than
  // alternating stripes. Both colours still clear `MIN_WALL_CLEARANCE`
  // comfortably (0.093 and 0.074 above the background) — this is a contrast
  // change within that floor, not a relaxation of it.
  wall: surface(0x261d16, {
    pattern: { kind: 'bands', angleDeg: 135, a: 0x261d16, b: 0x221912, width: 10 },
    asset: 'terrain.wall',
  }),

  // Dry flagstone, sitting between crypt and burial ground in value. Lighter than
  // the ground it replaces on purpose: under a torch, the spent parts of the map
  // are the bare pale slabs, and a board going pale is the signal to move on.
  // Pitted since 2026-08-18: stone is the single most common cell in the back
  // half of a run and was the one surface with no finish at all — a fine dark
  // stipple reads as worked slab without stealing value from the pale signal.
  //
  // SPENT, finally (2026-08-19, WORKPLAN Stage 3): the pitting alone read as
  // "a fourth flavour of dull rock", not as the aftermath of anything. Two
  // more layers, both keyed to the pop rather than to the material: a
  // `scorch` — the soft dark blot only this surface ever draws, off-centre
  // on purpose so it reads as where the tile SAT rather than as a printed
  // logo — and an `overlay` of sparse, odd-angled hatch (25°, shared by
  // nothing else on the board) standing in for the hairline fractures a
  // burst leaves. "Related to blocked ground but plainly consumed" — the
  // wall's own dark rubble bands, borrowed here as a whisper instead of the
  // wall's full statement.
  stone: surface(0x5a5044, {
    fillTo: 0x453d33,
    pattern: { kind: 'dots', ink: 0x000000, alpha: 0.16, radius: 1.1, pitch: 5 },
    overlay: { kind: 'hatch', angleDeg: 25, ink: 0x1c1712, alpha: 0.14, bar: 1, gap: 9 },
    scorch: true,
    asset: 'terrain.stone',
  }),

  empty: surface(0x151310, { inset: 0.09 }),
  ghost: surface(0xf7dba0, { fillTo: 0x9c7331, alpha: 0.3, asset: 'terrain.ghost' }),

  // One torch in a dark room: a tight pool, a deep falloff, and a floor that
  // keeps the far board readable because Marc set the rule as dim, never
  // hidden. The deepest falloff of the four, because this is the direction
  // whose whole argument is that the map is endless because the darkness is.
  //
  // Tightened 2026-08-19 (WORKPLAN Stage 3): `radius` 4 → 3 makes the full-
  // bright pool itself smaller — a torch, not a floodlight — and `fade` 11 →
  // 14 spends the difference on a longer, gentler transition into it rather
  // than a shorter, harder one. `floor` is untouched: it is what keeps every
  // in-play tile at or above the direction's own 28%-luminance rule, and
  // this stage moves atmosphere, never that floor.
  light: { radius: 3, fade: 14, floor: 0.42 },

  // The fog dim (2026-08-19, WORKPLAN Stage 3): promoted out of
  // `PixiRenderer`'s two hand-typed constants into a token every direction
  // now states for itself — see `Theme.fog`'s own doc. Tuned deeper than the
  // placeholder's control values (veil 0.45 → 0.5, alpha 0.3 → 0.26):
  // memory under a torch should read as embers gone cold, pulled further
  // toward the board's own dark and sitting quieter under the live board
  // than the neutral direction bothers to ask for.
  // Lifted twice on 2026-08-20 (Marc, with a screenshot: "we still cant
  // see grounds clearly in the fog, its too dark"): 0.5/0.26 over the
  // torch falloff was black on black. The falloff no longer applies to
  // memory (view.ts draws the map at full light), and the fog itself
  // thinned — the ghost is legible now and still unmistakably a ghost.
  fog: { veil: 0.3, alpha: 0.45 },
};
