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
  | {
      readonly kind: 'bands';
      readonly angleDeg: number;
      readonly a: Rgb;
      readonly b: Rgb;
      readonly width: number;
    };

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
  /** Bitmap slot that supersedes fill and pattern once the file exists. */
  readonly asset: AssetId | null;
  /** 0..1 of the hex radius. A gutter is what makes the grid read as cells. */
  readonly inset: number;
  /** Drawn at this alpha. Only the ghost/preview surface is below 1. */
  readonly alpha: number;
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
};

export type ThemeId = string;

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
};

/**
 * How much lighter the field dots must READ than the ground they sit on, in
 * L* after the alpha is applied. This is the number Marc's report is about:
 * the dots were drawn in each colour's own fill at a flat 0.22 alpha, so
 * their legibility was whatever that colour's contrast happened to be —
 * torchlit's yellow landed at 0.147 and read fine, its blue at 0.039 and was
 * invisible. A field you cannot see is a rule you cannot use.
 */
export const MIN_FIELD_LIFT = 0.12;

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
export function fieldDots(theme: Theme, colour: Colour): { ink: Rgb; alpha: number } {
  const ground = luma(theme.empty.fill);

  let ink = theme.terrain[colour].fill;
  for (let step = 0; step < 12 && luma(ink) - ground < 0.45; step++) {
    ink = mix(ink, 0xffffff, 0.1);
  }

  const gap = Math.max(0.001, luma(ink) - ground);
  return { ink, alpha: Math.min(0.5, Math.max(0.12, MIN_FIELD_LIFT / gap)) };
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
    asset: over.asset ?? null,
    inset: over.inset ?? 0.06,
    alpha: over.alpha ?? 1,
  };
}
