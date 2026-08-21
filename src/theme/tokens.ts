import type { Colour } from '@content/tuning';

/**
 * The visual contract, as data.
 *
 * Everything on screen is going to change — the art direction is not settled and
 * Gate E has not opened (see LOG.md). So the shape of this file matters more than
 * any value in it: a theme is a plain, serialisable description of HOW to paint
 * roles the game already has, and swapping one for another is a single import.
 *
 * Two rules keep it honest:
 *
 *   1. **Roles, never looks.** There is a token for "the tile you must not miss",
 *      not for "white outline". A theme that wants to signal ripeness with a warm
 *      fill instead of an outline changes its own values; no other file learns.
 *   2. **No behaviour.** This is data. It imports one type and nothing else, it
 *      runs nowhere, and `src/theme/theme.test.ts` can check every direction we
 *      have without a canvas, a browser or a phone.
 *
 * A number here may never affect balance — that lives in `src/content/tuning.ts`
 * and is a separate axis on purpose. You can repaint the whole game without
 * re-running the harness, which is the entire point of the split.
 */

/** `0xRRGGBB`. Pixi wants a number; CSS wants a string; `hex()` bridges them. */
export type Rgb = number;

export const hex = (c: Rgb): string => `#${c.toString(16).padStart(6, '0')}`;

export const rgba = (c: Rgb, alpha: number): string =>
  `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${alpha})`;

/** Blend two colours channel-wise. `t` 0 is all `a`, 1 is all `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  const lerp = (shift: number): number => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * k) & 0xff;
  };
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}

/**
 * Perceptual lightness, 0..1 — CIE L* over Rec. 709 relative luminance.
 *
 * Load-bearing rather than a utility. Every art direction we have been handed
 * insists the four terrains must be tellable apart in GREYSCALE — "value spacing
 * does most of the work" — because a hue-only board dies in sunlight and for
 * colour-blind players. That claim is checkable, so `theme.test.ts` checks it.
 *
 * **L*, not luminance, and the difference is the whole point.** Relative
 * luminance is linear in light, so on a board this dark it crowds every terrain
 * into the bottom tenth of its range and reports two plainly different greys as
 * nearly identical. The first version of this function did exactly that and
 * failed all four directions, including the placeholder that had already shipped
 * and is legible. L* applies the cube-root the eye applies, so a fixed threshold
 * means the same thing at the dark end as at the light end — which is the only
 * way one number can be a bar for four directions that share no palette.
 */
export function luma(c: Rgb): number {
  const srgb = [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  const y = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  const f = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  return (116 * f - 16) / 100;
}

/**
 * Which way up the hexes sit.
 *
 * The engine has no opinion — axial coordinates are the same either way, and
 * `DIRECTIONS` still means the same six neighbours. Only the projection to pixels
 * differs, which is why this lives here and not in `engine/hex.ts`. Every art
 * direction we have been given specifies flat-top; the placeholder is pointy-top
 * because that is what shipped. Being able to hold both is the cheapest possible
 * insurance against the decision moving again.
 */
export type Orientation = 'pointy' | 'flat';

/**
 * A procedural surface texture, described rather than drawn.
 *
 * Four kinds, and they are four because that is exactly what the three art
 * directions between them ask for: diagonal hatch (crypt), smooth (cemetery),
 * dotted (burial ground), horizontal rule (catacomb), and opaque alternating
 * bands (blocked ground — the only cross-hatch on the board). Resist adding a
 * fifth until a direction needs it; a texture vocabulary that grows per-tile is
 * a bitmap set with extra steps, and there is a slot for bitmaps already.
 *
 * `hatch` and `dots` are INK OVER the fill, so a theme can change its palette
 * without re-deriving its textures. `bands` replaces the fill, because rubble is
 * not a tint of anything.
 */
export type Pattern =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'hatch';
      readonly angleDeg: number;
      readonly ink: Rgb;
      readonly alpha: number;
      /** Stripe thickness and the clear space after it, in texture pixels. */
      readonly bar: number;
      readonly gap: number;
    }
  | {
      readonly kind: 'dots';
      readonly ink: Rgb;
      readonly alpha: number;
      readonly radius: number;
      /** Centre-to-centre spacing of the dot grid. */
      readonly pitch: number;
    }
  /**
   * A repeating SHAPE rather than a repeating dot (Marc, 2026-08-16: "instead
   * of dots we could have a symbol per color and this symbol could repeat so
   * its coilor + symbol, good for all humans").
   *
   * Colour alone carries the meaning of native ground, and roughly one man in
   * twelve cannot read the green/red half of it. Four hard-edged shapes stay
   * apart at three pixels where four hues do not, and they cost nothing to
   * anyone who can see the hues — the colour is still there, the shape is a
   * second channel saying the same thing.
   */
  | {
      readonly kind: 'glyphs';
      readonly shape: GlyphShape;
      readonly ink: Rgb;
      readonly alpha: number;
      /** Half-extent of one symbol, in texture pixels. */
      readonly size: number;
      /** Centre-to-centre spacing of the grid. */
      readonly pitch: number;
    }
  | {
      readonly kind: 'bands';
      readonly angleDeg: number;
      readonly a: Rgb;
      readonly b: Rgb;
      readonly width: number;
    };

/**
 * The four shapes, chosen for how well they survive being small: a filled
 * circle, a triangle, a square and a diamond differ in silhouette rather than
 * in detail, so they stay apart at the size a native field is drawn.
 */
export type GlyphShape = 'circle' | 'triangle' | 'square' | 'diamond';

export const NO_PATTERN: Pattern = { kind: 'none' };

/**
 * How one kind of cell is painted.
 *
 * Precedence is `asset` beats `pattern` beats `fill`, and the fallbacks are the
 * whole point: a theme is playable with no bitmaps at all, gets better as art
 * lands slot by slot, and never breaks in between. That is the same contract as
 * the design document's drop-target slots, which is where the idea came from.
 */
export type Surface = {
  readonly fill: Rgb;
  /** Vertical gradient end. `null` is a flat fill, which most surfaces are. */
  readonly fillTo: Rgb | null;
  readonly pattern: Pattern;
  /**
   * A second pattern, drawn over the first (2026-08-19, WORKPLAN Stage 3).
   *
   * `pattern` carries the AXIS identity — the thing that keeps MOSS reading
   * as diagonal and TIDE as horizontal at a glance — and stays load-bearing
   * on its own; `overlay` is a second, independent layer at its own kind,
   * ink and alpha that adds material depth without moving the axis a colour
   * is told apart by. Same closed vocabulary (`Pattern`), so nothing new to
   * bake: a hatch over a hatch, dots over dots, or either crossed with the
   * other, is still just `paintPattern` called twice.
   */
  readonly overlay: Pattern;
  /** Bitmap slot that supersedes fill and pattern once the file exists. */
  readonly asset: AssetId | null;
  /** 0..1 of the hex radius. A gutter is what makes the grid read as cells. */
  readonly inset: number;
  /** Drawn at this alpha. Only the ghost/preview surface is below 1. */
  readonly alpha: number;
  /**
   * A soft dark blot off the hex's own centre (2026-08-19, WORKPLAN Stage
   * 3): the one thing that makes `terrain.stone` read as the AFTERMATH of a
   * pop rather than a fourth flavour of furniture. Off for everything else —
   * a scorch mark on live ground would say something happened there that
   * never did.
   */
  readonly scorch: boolean;
};

/**
 * The bitmap slots this game can use, by stable mechanical id.
 *
 * Ids are named for the ROLE in the rules (`terrain.green`), never for what a
 * direction calls it (`crypt`) — the theme supplies the label. Rename the art
 * direction twice more and these ids do not move, which is what lets a folder of
 * PNGs survive a change of mind.
 */
export type AssetId =
  | 'terrain.green'
  | 'terrain.yellow'
  | 'terrain.red'
  | 'terrain.blue'
  | 'terrain.wall'
  | 'terrain.stone'
  | 'terrain.ghost'
  | 'fog.hard'
  | 'fog.soft'
  | 'fx.pop'
  | 'ui.cardFrame'
  | 'ui.logo'
  | 'ui.runEnd';

/** Ink roles. Named for the job, so a direction can move any of them anywhere. */
export type Ink = {
  /** Page and canvas background. */
  readonly bg: Rgb;
  /** Primary reading colour — the big numbers. */
  readonly ink: Rgb;
  /** Secondary — labels, units, the things beside a number. */
  readonly inkDim: Rgb;
  /** Tertiary — the build stamp, hints, anything you should be able to ignore. */
  readonly inkFaint: Rgb;
  /**
   * The direction's one signature colour. Selection, focus, the live edge.
   * Rationed by convention: if everything is accent, nothing is.
   */
  readonly accent: Rgb;
  /**
   * The two rarities' OWN colours (Marc, 2026-08-20: "make sure magic and
   * unique have their own color, distinctive of the normal selected tile
   * color") — in torchlit the selected ring and the accent were the same
   * gold, so a rare card and a selected card were saying different things
   * in one voice. MAGIC is the wild card; UNIQUE the crown — card border,
   * badge, board edge and the placed star all speak these two, and
   * nothing else does.
   */
  readonly magic: Rgb;
  readonly unique: Rgb;
  /**
   * Loss. Every direction reserves one warm colour for the tile count, because
   * the tile count is the thing that kills you. Never used decoratively.
   */
  readonly danger: Rgb;
  /** Chrome behind the controls. */
  readonly panel: Rgb;
  readonly panelEdge: Rgb;
  /** The border of the card you have picked. */
  readonly panelEdgeActive: Rgb;
};

export type Type = {
  /** Numbers and headings. */
  readonly display: string;
  /** Small tracked labels — TILES, POINTS, MAP, COST. */
  readonly label: string;
  /** Sentences. The epitaph, the leave hint. */
  readonly body: string;
  /** Tracking for `label`, as a CSS length. */
  readonly labelTracking: string;
  /**
   * Webfont stylesheet to inject when this theme is applied, or `null`.
   *
   * `null` on the placeholder deliberately: the default theme must not make a
   * cold start wait on a third-party host, and the game has to be playable in a
   * tunnel. A direction that wants Spectral pays for Spectral.
   */
  readonly webfontHref: string | null;
};

/**
 * How the board is composed, as distinct from what the cells look like.
 */
export type Board = {
  readonly background: Rgb;
  /** Gap between hexes, as a fraction of the hex radius. */
  readonly seam: number;
  /** Outline every cell gets. */
  readonly edge: Rgb;
  readonly edgeWidth: number;
  /** Ground you may build on this turn. */
  readonly legalEdge: Rgb;
  /**
   * Ripe. The loudest thing on the board by policy — it is the entire harvest
   * decision, and a player who misses it is playing a different game.
   */
  readonly ripeEdge: Rgb;
  readonly ripeEdgeWidth: number;
  /**
   * Darkening toward the edges of the canvas. Every handed-down direction wants
   * the board to fall off into fog rather than stop at a border; there is no fog
   * mechanic yet, so this is the honest half of it — atmosphere, no information.
   * `null` switches it off entirely.
   */
  readonly vignette: { readonly colour: Rgb; readonly strength: number } | null;
  /**
   * Home (2026-08-19): the origin hex — the thing REACH and every distance-based
   * reward measure from — had no visual identity of its own. A quiet permanent
   * ring, drawn by `PixiRenderer`'s stroke ladder at the LOWEST priority that
   * ladder has: it never competes with a targeted, ripe, unclaimed-landmark or
   * rare-tile edge, all of which are checked first and return before home is
   * ever asked. Every theme gets a value — there is no "off" here, the way there
   * is for the vignette — because a marker every direction can render is the
   * whole point; torchlit's is its own warm ember tone, the rest reuse their own
   * accent, which is the "sensible default" this token exists to make possible
   * without inventing a new colour for directions that never asked for one.
   */
  readonly home: { readonly ring: Rgb; readonly ringWidth: number };
};

/**
 * Timings, in milliseconds.
 *
 * The renderer owns time — the engine is synchronous and has no clock. Kept in
 * the theme because pace is art direction: the same pop is a reward at 90ms and
 * a disturbance at 400ms, and that is a decision the directions disagree on.
 */
export type Motion = {
  /** The harvest flash: how long one popped hex burns for. */
  readonly popMs: number;
  /** Stagger between hexes in one harvest, so a big harvest reads as a cascade. */
  readonly popStaggerMs: number;
  readonly popColour: Rgb;
  /** Peak alpha of the flash. */
  readonly popAlpha: number;
  /**
   * How high a popped tile JUMPS, as a fraction of the hex size; 0 turns the
   * jump off. Marc's answer to prompt.md Q3 was both at once — reward in the
   * energy, disturbance in the meaning — so the tile itself leaps and falls
   * away while the flash burns underneath it.
   */
  readonly popLift: number;
  /**
   * How far the pop's own light spills, as a multiplier of the hex size — the
   * light-pool answering the burst rather than a decal sitting on top of it
   * (WORKPLAN Stage 4, 2026-08-20). Replaces a hand-typed `3.2` that used to
   * live in `PixiRenderer.ts`; the ripen pulse rides the same dial at its own
   * fixed ratio so the two keep the proportion they always had.
   */
  readonly popGlowScale: number;
  /**
   * How hard a rising ember gets pulled back down before it fades, as a
   * fraction of the hex size (WORKPLAN Stage 4). An ember used to drift in a
   * straight line and never come back — reads as smoke, not fire. Zero would
   * restore that straight drift; every direction gives it some gravity so the
   * burn reads as rise-and-settle rather than rise-and-vanish. Never enough
   * to overshoot back past where it started — see `#advanceEmbers`.
   */
  readonly emberGravity: number;
  /**
   * Base lifetime of one ember, in milliseconds, before render-side jitter
   * (WORKPLAN Stage 4). Longer is a slower smoulder, not a bigger burst —
   * the ember count is tuned once in `PixiRenderer.ts` for every direction.
   */
  readonly emberLifeMs: number;
};

export type ThemeId = string;

/**
 * The direction's VOICE (`ideas/sound.md`, built 2026-08-19 behind
 * `ui.sound`, off by default — Marc chose a silent 1.0): three synthesised
 * moments, parameterised as data so sound is art direction like everything
 * else in this file. The greyscale rule's cousin applies — a direction that
 * cannot be told apart with eyes closed has no voice — so each theme states
 * its own numbers. Frequencies in Hz, times in seconds, gains 0..1.
 */
export type Voice = {
  /** The pop: a rising run of bells, one per popped tile. */
  readonly pop: {
    readonly baseHz: number;
    /** Pitch step per extra tile in the pocket — the size, audible. */
    readonly stepHz: number;
    readonly decay: number;
    readonly wave: OscillatorType;
  };
  /** One struck note per claim kind — cache warm, site bright, territory low, shrine strange, find rare. */
  readonly claim: Readonly<Record<'cache' | 'site' | 'territory' | 'shrine' | 'find', number>>;
  readonly claimDecay: number;
  readonly claimWave: OscillatorType;
  /** Running dry: the low fade when the purse first nears the next cost. */
  readonly dry: { readonly hz: number; readonly decay: number };
  /** Master gain — the whole voice's loudness ceiling. */
  readonly gain: number;
};

export type Theme = {
  readonly id: ThemeId;
  readonly name: string;
  /** The mood, in the direction's own words. Shown in the gallery. */
  readonly note: string;
  /** Where this came from, so a value can be argued with rather than guessed at. */
  readonly source: string;

  readonly orientation: Orientation;
  readonly board: Board;
  readonly ink: Ink;
  readonly type: Type;
  readonly motion: Motion;
  /** The direction's voice. Silent until `ui.sound` is switched on. */
  readonly voice: Voice;

  /** The four playable colours. Every key is required — a missing one is a bug. */
  readonly terrain: Readonly<Record<Colour, Surface>>;
  /** What this direction calls them. `CRYPT`, or `GREEN` if it has no fiction. */
  readonly terrainNames: Readonly<Record<Colour, string>>;

  /** Never buildable, never matches. The design documents call it blocked ground. */
  readonly wall: Surface;
  /** A popped tile. Surrounds, never matches — the reason to move on. */
  readonly stone: Surface;
  /** Ground with nothing on it. */
  readonly empty: Surface;
  /** What the selected tile would look like here. Drawn under the preview number. */
  readonly ghost: Surface;

  /**
   * Remembered ground (2026-08-19, promoted out of `PixiRenderer` where both
   * numbers used to be hand-typed constants — the same drift risk `mark.ts`
   * closed for the favicon, paid here instead in two magic numbers nobody
   * could argue with per direction). `veil` is how far a remembered tile's
   * hue is pulled toward the board's own background before drawing (0..1);
   * `alpha` is what the whole tinted sprite then draws at. Two steps because
   * they answer different questions — is this ground memory, and how hard
   * should memory compete with the live board — and every direction gets to
   * answer both.
   */
  readonly fog: Fog;

  /**
   * The torch (2026-08-16; the light the structure carries, 2026-08-18/19).
   * Light falls off with distance from the nearest hex you have actually
   * BUILT — every tile and stone lights its own edge, not just the one you
   * last placed — which is what makes the plane read as a room you are
   * carrying a light through rather than a chart on black. `radius` and
   * `fade` are measured from that edge now; the numbers themselves are
   * unchanged by the mechanism under them.
   *
   * Marc set the rule: DIM, NEVER HIDDEN. Distance drains light, but every
   * number, symbol and beacon stays readable — atmosphere must not cost a
   * player information, and a phone in daylight has to stay playable. That is
   * what `floor` is for, and it is a floor rather than a suggestion.
   */
  readonly light: Light;
};

export type Light = {
  /** Hexes of full brightness around the structure's edge before any falloff starts. */
  readonly radius: number;
  /** Hexes over which brightness falls from full to the floor. */
  readonly fade: number;
  /** The dimmest a cell may ever be drawn, 0-1. Never 0: see above. */
  readonly floor: number;
};

/** See `Theme.fog`'s own doc for what the two numbers mean. */
export type Fog = {
  readonly veil: number;
  readonly alpha: number;
};

/**
 * How much lighter the field dots must READ than the ground they sit on, in
 * L* after the alpha is applied. This is the number Marc's report is about:
 * the dots were drawn in each colour's own fill at a flat 0.22 alpha, so
 * their legibility was whatever that colour's contrast happened to be —
 * torchlit's yellow landed at 0.147 and read fine, its blue at 0.039 and was
 * invisible. A field you cannot see is a rule you cannot use.
 *
 * Raised 0.2 → 0.25 on 2026-08-21 (Marc, on the phone: "make sure biomes
 * when placing tiles are more visible, bump opacity"). The equalising is
 * what this number does — every colour is pushed to the SAME readable lift,
 * whatever its own contrast happens to be — so raising the target raises all
 * four together and cannot re-open the gap between them that it was written
 * to close. The floor and ceiling in `fieldDots` moved with it: the floor
 * because a high-contrast colour clamps there and would otherwise not have
 * moved at all, the ceiling so the low-contrast ones still have somewhere to
 * go.
 */
export const MIN_FIELD_LIFT = 0.25;

/**
 * The same colour at full strength: every channel scaled up until the
 * brightest one is maxed.
 *
 * This is the difference between "lighter" and "brighter", and it is the
 * whole fix for Marc's second report — that blue and green fields were still
 * hard to tell apart. Mixing toward white raises lightness by REMOVING
 * colour, so four brightened terrains converge on four pale greys and the
 * only thing that made a field say its name is the first thing spent. Scaling
 * to full saturation raises lightness while keeping the hue exactly, so blue
 * gets bluer rather than paler.
 */
function vivid(c: Rgb): Rgb {
  const channels = [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
  const peak = Math.max(...channels, 1);
  const scaled = channels.map((v) => Math.min(255, Math.round((v * 255) / peak)));
  return ((scaled[0] ?? 0) << 16) | ((scaled[1] ?? 0) << 8) | (scaled[2] ?? 0);
}

/**
 * The dots that mark ground native to a colour, as ink and alpha.
 *
 * Two jobs at once, and they pull against each other: the dots must SAY which
 * colour owns this ground (so they keep its hue) and must be equally visible
 * for all four (so they cannot keep its lightness — the four terrains are
 * spaced apart in L* on purpose, and that spacing is exactly what made the
 * dark ones vanish).
 *
 * So: brighten toward white, which keeps hue and buys contrast, until the
 * colour clears the ground by a workable margin — then choose the alpha that
 * makes the FINAL lift the same for every colour. Bright fields stop
 * shouting, dark fields become readable, and all four still say their name.
 */
/*
 * COLOUR_GLYPH — a per-colour SHAPE repeated over native ground — lived here
 * from 2026-08-16 to 2026-08-18. Marc asked for it ("a symbol per color")
 * and Marc retired it after playing it: at ground scale the shapes collapsed
 * into lookalike dots ("blue and green are too lookalike"). Fields now carry
 * their colour's own TEXTURE instead — see `fieldPattern` below — which
 * keeps the non-hue channel (orientation survives smallness better than
 * silhouette) and makes ground read as its terrain. The cards keep
 * COLOUR_MARK; the `glyphs` pattern kind stays in the vocabulary, currently
 * unreferenced by any theme.
 */

/** The same four as characters, for the places that draw text rather than textures. */
export const COLOUR_MARK: Readonly<Record<Colour, string>> = {
  green: '▲',
  yellow: '◆',
  red: '■',
  blue: '●',
};

/**
 * The destination glyphs — fixed across directions for the same reason the
 * colour marks are: a symbol language that changes with the art direction is
 * a language nobody learns. `+` pays tiles, `★` pays points, `◈` wakes an
 * unlock, `◆` is ground to claim, `✦` is a hidden find — a four-pointed
 * spark, distinct from the star and both diamonds at the sizes a phone draws
 * them. Keyed by plain strings so the theme layer needs nothing from the
 * engine. A find only ever wears its glyph once REVEALED: the shimmer draws
 * no glyph at all, by design.
 */
export const LANDMARK_GLYPH: Readonly<
  Record<'cache' | 'site' | 'shrine' | 'territory' | 'find', string>
> = {
  cache: '+',
  site: '★',
  shrine: '◈',
  territory: '◆',
  find: '✦',
};

/**
 * How much one elevation band lifts a hex's light, multiplicatively.
 *
 * Deliberately gentle: elevation is Marc's purely-cosmetic call, and a slope
 * that reads louder than the tiles is a board you cannot read. It lives here
 * with `brightness` because the two ride the same channel — and so the
 * gallery can draw the bands with the same number the board uses.
 */
export const BAND_LIFT = 0.06;

export function fieldDots(theme: Theme, colour: Colour): { ink: Rgb; alpha: number } {
  const ground = luma(theme.empty.fill);

  // Full saturation first — hue kept, lightness bought, the four kept apart.
  // Only if that still is not enough does white get involved, and by then the
  // colour is as vivid as it can be, so the wash is as small as possible.
  let ink = vivid(theme.terrain[colour].fill);
  for (let step = 0; step < 12 && luma(ink) - ground < 0.45; step++) {
    ink = mix(ink, 0xffffff, 0.1);
  }

  const gap = Math.max(0.001, luma(ink) - ground);
  // Floor 0.18 → 0.24 with the lift above (2026-08-21): a colour whose own
  // contrast already clears the target sits ON the floor, so leaving it
  // would have made the quietest fields the only ones that did not move.
  //
  // The ceiling is 0.5 rather than the old 0.65, and that is a TIGHTENING:
  // 0.5 is the point past which ground starts reading as a placed tile,
  // which the theme tests have asserted since fields were built while the
  // code allowed 0.65. The invariant belongs in the code that has to hold
  // it — raising the lift is exactly the change that would have found the
  // gap the hard way.
  return { ink, alpha: Math.min(0.5, Math.max(0.24, MIN_FIELD_LIFT / gap)) };
}

/**
 * When a theme's terrain has no pattern of its own, its fields still need a
 * distinct mark — and the fallback keeps all four apart in ANY theme: two
 * hatch angles, verticals, and dots can never collide the way two smooth
 * terrains would.
 */
const FIELD_FALLBACK: Readonly<
  Record<Colour, { kind: 'hatch'; angleDeg: number } | { kind: 'dots' }>
> = {
  green: { kind: 'hatch', angleDeg: 60 },
  yellow: { kind: 'hatch', angleDeg: 90 },
  red: { kind: 'dots' },
  blue: { kind: 'hatch', angleDeg: 0 },
};

/** Fixed ground-weight geometry for a field's own pattern (unchanged since 2026-08-18). */
const FIELD_WEIGHT = { dots: { radius: 1.4, pitch: 6 }, hatch: { bar: 1, gap: 5 } };

/**
 * A second, looser ground-weight geometry for a field's OVERLAY layer
 * (2026-08-20). Deliberately different numbers from `FIELD_WEIGHT` — a
 * field overlay stacked at the same pitch as the field's own pattern would
 * draw the identical dot or bar grid twice in the same spot, which reads as
 * one flat layer rather than the "second frequency" every terrain's own
 * `overlay` is written to add (see `torchlit.ts`'s per-colour comments: "a
 * pitch that shares no common factor with the first"). Wider/lighter than
 * `FIELD_WEIGHT` for the same reason the terrain overlays themselves read
 * looser than their base pattern.
 */
const FIELD_OVERLAY_WEIGHT = { dots: { radius: 1.0, pitch: 11 }, hatch: { bar: 1, gap: 9 } };

/**
 * Thin one geometry (a terrain's `pattern` or its `overlay`) to ground
 * weight, sharing the ink/alpha every field on this theme is equalised to.
 * The shared half of `fieldPattern` and `fieldOverlayPattern` below — one
 * place that turns "a terrain's own texture" into "a whisper about what
 * grows well here", called twice with two different weight tables so the
 * two layers a field can carry never collide.
 */
function thinnedField(
  theme: Theme,
  colour: Colour,
  terrain: Pattern | (typeof FIELD_FALLBACK)[Colour],
  weight: typeof FIELD_WEIGHT,
): Pattern {
  const { ink, alpha } = fieldDots(theme, colour);
  const geometry =
    terrain.kind === 'hatch' || terrain.kind === 'dots' ? terrain : FIELD_FALLBACK[colour];
  return geometry.kind === 'dots'
    ? { kind: 'dots', ink, alpha, radius: weight.dots.radius, pitch: weight.dots.pitch }
    : {
        kind: 'hatch',
        angleDeg: geometry.angleDeg,
        ink,
        alpha,
        bar: weight.hatch.bar,
        gap: weight.hatch.gap,
      };
}

/**
 * The pattern a native field wears: the COLOUR'S OWN terrain texture, thinned
 * to ground weight (Marc, 2026-08-18: "they should use the proper pattern —
 * dots, diagonal, verticals — so its easier on the eyes").
 *
 * A field is a promise about what grows well there, so it speaks the same
 * texture language as the tile it wants: moss ground carries moss's diagonal
 * hatch, ash ground its dots, tide ground its horizontals. Ink and alpha come
 * from `fieldDots`, which equalises how strongly all four read against this
 * theme's ground; the geometry comes from the terrain, with a per-colour
 * fallback where a terrain is smooth. One function, used by the renderer and
 * the gallery both, so the workbench can never disagree with the board.
 */
export function fieldPattern(theme: Theme, colour: Colour): Pattern {
  // Two terrains may share a texture ON THE TILE — EMBER and ASH both lead
  // with dots since 2026-08-20 ("a texture maybe dotted for ember its
  // clearer"), kept apart there by polarity: bright sparks against dark
  // pits. Ground has no polarity — every field's ink is equalised by
  // `fieldDots` — so geometry is the only channel left down here, and a
  // collision falls back to the colour's OWN distinct ground mark. For
  // ember that is the vertical dry grass its sparks sit in, which is also
  // what a field is: the ground a colour grows from, not the gleam on top.
  const own = theme.terrain[colour].pattern;
  const ground = (p: Pattern): string | null =>
    p.kind === 'hatch' ? `hatch:${p.angleDeg}` : p.kind === 'dots' ? 'dots' : null;
  const mine = ground(own);
  const collides =
    mine !== null &&
    (Object.keys(FIELD_FALLBACK) as Colour[]).some(
      (c) => c !== colour && ground(theme.terrain[c].pattern) === mine,
    );
  return thinnedField(theme, colour, collides ? FIELD_FALLBACK[colour] : own, FIELD_WEIGHT);
}

/**
 * The field's second layer: the terrain's own Stage-3 `overlay`
 * (2026-08-19, WORKPLAN Stage 3), thinned the same way `fieldPattern` thins
 * the base texture (2026-08-20, Marc: "the background tiles of territories
 * colors have not switched textures like the others"). Stage 3 gave board
 * TILES a second, deepening layer over their axis pattern; fields carried
 * only the axis, so ground fell one layer behind the tiles standing on it.
 * `NO_PATTERN` where the terrain has no overlay at all — nothing to thin —
 * which is exactly the placeholder direction's case today.
 */
export function fieldOverlayPattern(theme: Theme, colour: Colour): Pattern {
  const overlay = theme.terrain[colour].overlay;
  if (overlay.kind === 'none') return NO_PATTERN;
  const thinned = thinnedField(theme, colour, overlay, FIELD_OVERLAY_WEIGHT);
  // The two layers must stay two GEOMETRIES (fresh-eyes, 2026-08-20):
  // ember's collision fallback made its field base hatch@90 — the same
  // bars its own overlay carries — which is the identical-grid-twice this
  // weight table's doc forbids. When the thinned overlay lands on the
  // base's geometry, the terrain's PATTERN steps in as the second layer
  // instead: ember ground gets its spark dots back over the grass, and
  // the field speaks its tile's full texture again.
  const base = fieldPattern(theme, colour);
  const shape = (p: Pattern): string => (p.kind === 'hatch' ? `hatch:${p.angleDeg}` : p.kind);
  if (shape(thinned) === shape(base)) {
    return thinnedField(theme, colour, theme.terrain[colour].pattern, FIELD_OVERLAY_WEIGHT);
  }
  return thinned;
}

/**
 * The ground a native field draws, WITH slot art or WITHOUT (2026-08-20).
 *
 * Marc's report: Stage 3 gave board tiles baked PNGs and a second procedural
 * `overlay`; `fieldPattern` saw neither, because it only ever read
 * `theme.terrain[colour].pattern`. Territory ground kept the pre-Stage-3
 * look while everything standing on it moved on. This is the one place that
 * decides what a field looks like, so the renderer and `/gallery` derive
 * the identical answer from the identical inputs — a new PNG dropped in a
 * slot, or a token retune, reaches the ground with no other file touched.
 *
 * WITH art (`hasArt` true and the colour's terrain slot names one): the
 * ground wears `theme.empty`'s flat fill with that PNG ghosted over it at
 * `ghostAlpha` — the same file the board's TILES draw at full strength, at
 * a fraction of it, so a claimed hex and the field around it read as one
 * material at two weights rather than two eras of art.
 *
 * WITHOUT: today's `fieldPattern`, plus `fieldOverlayPattern` riding
 * alongside it — the procedural floor, now following the terrain's full
 * two-layer depth rather than only its axis.
 */
export type FieldGround =
  | {
      readonly kind: 'art';
      readonly base: Surface;
      readonly asset: AssetId;
      readonly ghostAlpha: number;
    }
  | { readonly kind: 'procedural'; readonly surface: Surface };

export function fieldGround(theme: Theme, colour: Colour, hasArt: boolean): FieldGround {
  const asset = theme.terrain[colour].asset;
  if (hasArt && asset !== null) {
    // Reuses `fieldDots`' own equalised alpha rather than one flat number
    // for all four colours — the exact reasoning `fieldDots`' doc gives for
    // the dots it was built for: a fixed alpha reads differently against
    // four different ground lightnesses (torchlit's own history: blue at a
    // flat 0.22 was invisible, yellow at the same number shouted). The
    // ghost asks the identical question — "how strongly must this colour's
    // mark show against ITS OWN ground to read the same as the other
    // three" — so it gets the identical answer.
    return { kind: 'art', base: theme.empty, asset, ghostAlpha: fieldDots(theme, colour).alpha };
  }
  return {
    kind: 'procedural',
    surface: {
      ...theme.empty,
      pattern: fieldPattern(theme, colour),
      overlay: fieldOverlayPattern(theme, colour),
    },
  };
}

/**
 * A surface with the boring answers filled in, so a theme states only what it
 * means. Written as a function rather than a spread-able constant because
 * `exactOptionalPropertyTypes` makes partial objects genuinely annoying, and
 * because the defaults are a decision worth having one home for.
 */
export function surface(fill: Rgb, over: Partial<Surface> = {}): Surface {
  return {
    fill,
    fillTo: over.fillTo ?? null,
    pattern: over.pattern ?? NO_PATTERN,
    overlay: over.overlay ?? NO_PATTERN,
    asset: over.asset ?? null,
    inset: over.inset ?? 0.06,
    alpha: over.alpha ?? 1,
    scorch: over.scorch ?? false,
  };
}

/**
 * How brightly a hex `dist` hexes from the torch is drawn, 0-1.
 *
 * Full inside `radius`, falling to `floor` over `fade` hexes, and never below
 * the floor — Marc's rule is dim, never hidden, so this function has no way
 * to reach zero. The curve is squared rather than linear because linear
 * falloff reads as a flat grey disc: the eye wants the light to hold near the
 * source and give way quickly at the edge.
 */
export function brightness(light: Light, dist: number): number {
  if (dist <= light.radius) return 1;
  if (light.fade <= 0) return light.floor;
  const t = Math.min(1, (dist - light.radius) / light.fade);
  return light.floor + (1 - light.floor) * (1 - t) ** 2;
}
