import type { Colour } from '@content/tuning';
import type { HexKey } from '@engine/hex';
import type { LandmarkReward, Rarity } from '@engine/state';

/**
 * The boundary between the game and the screen.
 *
 * The engine produces state; a selector flattens that state into a `BoardView`
 * of plain data; the renderer draws it. The engine never imports this file and
 * never learns that pixels exist — which is what lets the same rules run
 * headless in the balance harness at full speed.
 *
 * `BoardView` is deliberately a description of WHAT is on the board, not HOW to
 * paint it. Colour NAMES appear here because four tiles that cannot be told
 * apart is a broken game rather than a style; which four hues they become is
 * the renderer's business, and Gate E's.
 */

export type CellKind = 'empty' | 'wall' | 'stone' | 'tile' | 'landmark';

export type CellView = {
  readonly key: HexKey;
  readonly q: number;
  readonly r: number;
  readonly kind: CellKind;

  /** Set only on tiles. */
  readonly colour: Colour | null;

  /** Set only on landmarks: what reaching this destination pays. */
  readonly landmark: LandmarkReward | null;
  /** A landmark already reached. Claimed landmarks go quiet. */
  readonly claimed: boolean;
  /**
   * A destination the board has not grown to — drawn as a glow through ground
   * that does not exist yet. The endless world's "somewhere to go". Beacons
   * are not cells of the game state and can never be tapped into an action.
   */
  readonly beacon: boolean;
  /**
   * Ground REMEMBERED from an earlier run in this world (P4a) but not part of
   * this run's board. Drawn faint, never playable — the map you carry in your
   * head, which is the whole meta-progression.
   */
  readonly remembered: boolean;
  /**
   * A hidden find's SHIMMER (`findSense` > 0): something is near, and that is
   * the whole message. Drawn as a dim glow with `landmark` null and no glyph
   * — the player must not learn WHAT is there, only that something is. Never
   * tappable into an action, like a beacon.
   */
  readonly shimmer: boolean;

  /** Set on magic and unique tiles; the board marks them so power stays visible. */
  readonly rarity: Rarity | null;

  /**
   * The colour this EMPTY ground is native to, if any — the endless world's
   * fields, where placing the matching colour earns one extra worth. Null on
   * every other kind and on plain ground.
   */
  readonly native: Colour | null;

  /** A live tile touched on all six sides, waiting to be harvested. */
  readonly ripe: boolean;
  /**
   * Stepped back by the colour lens: a tile of some other colour while one
   * colour's chip is held down. Drawn faded, label withheld.
   */
  readonly dimmed: boolean;
  /**
   * The lens's POSITIVE half (Marc, 2026-08-20): a live tile OF the spotlit
   * colour. Drawn with an edge in its colour's own hue — green, tide-blue,
   * ember-white, ash-red — distinct from the gold that means "selected to
   * place". False everywhere while no lens is held.
   */
  readonly lensed: boolean;
  /**
   * Part of the pocket the harvest buttons are currently pricing. Endless world
   * only — the bounded harvest is the whole board, so nothing is singled out.
   */
  readonly targeted: boolean;
  /** Matching neighbours. Meaningful on tiles; zero everywhere else. */
  readonly worth: number;

  /**
   * This cell is the origin — home, the thing REACH and every distance-based
   * reward measure from. Drawn as a quiet permanent ring, lowest priority in
   * the stroke ladder: a live state (targeted, ripe, an unclaimed landmark, a
   * rare tile) always wins the edge. True for at most one cell on any board.
   */
  readonly home: boolean;

  /**
   * How brightly to draw this hex, 0-1: the torch, already resolved. Computed
   * in the view because it is pure distance arithmetic and testable there;
   * the renderer only paints it.
   */
  readonly light: number;

  /** Which contour band this ground sits in. 0 where the world is flat. */
  readonly band: number;

  /** Empty ground the player may build on right now. */
  readonly legal: boolean;
  /**
   * What the selected tile would be worth here, on legal cells only.
   *
   * The moment-to-moment feedback the whole design rests on: placing raises the
   * worth of up to six neighbours at once, and this is the player seeing it
   * before committing. Null where the question does not apply.
   */
  readonly preview: number | null;
  /**
   * The selected draft tile's own colour, mirrored wherever `preview` is —
   * the ghost used to draw as one fixed tint regardless of what you were
   * actually holding. Null everywhere `preview` is.
   */
  readonly previewColour: Colour | null;
};

export type BoardView = {
  readonly cells: readonly CellView[];
  /**
   * The pocket a harvest would pop right now — the tapped ripe tile's key,
   * or the default (biggest) pocket's. Board-level rather than per-cell: the
   * renderer reads it once, from the PREVIOUS frame, to know where a harvest
   * that just happened was centred, so the pop cascade can ripple outward
   * from the hex the player actually touched instead of from board order.
   */
  readonly targetHex: HexKey | null;
};

export interface Renderer {
  /** Attach to the DOM and prepare the canvas. */
  mount(host: HTMLElement): Promise<void>;
  /** Draw a view. Idempotent — calling it twice with the same view is a no-op visually. */
  draw(view: BoardView): void;
  /**
   * The camera. Zoom multiplies (anchored at the viewport centre, clamped so 1
   * is always the auto-fit), pan slides by screen pixels, reset returns to the
   * fit that shows everything. The renderer owns the clamps and the maths; the
   * UI owns which gesture or button asks for what.
   */
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  resetCamera(): void;
  /**
   * Pan (only — zoom is untouched) so `hex` sits at the centre of the
   * screen. The HERE half of the FIT ⇄ HERE toggle and pan-to-pocket both
   * ride this: a jump to a known point rather than a step in a direction.
   * A no-op before anything has ever been drawn.
   */
  centerOn(hex: HexKey): void;
  /** Current zoom, 1 = fit. For the buttons' disabled states. */
  zoomLevel(): number;

  /**
   * The current zoom ceiling. It RISES as the board grows, because the cap is
   * stated in pixels-per-hex rather than as a multiple of a shrinking fit —
   * so the UI has to ask rather than assume a constant.
   */
  zoomMax(): number;
  /**
   * Which cell is under a point, in CSS pixels relative to the host element.
   * The renderer owns the board's placement on screen, so it is the only thing
   * that can answer this; the alternative is the UI duplicating the layout maths
   * and drifting out of step with what is actually drawn.
   */
  hitTest(x: number, y: number): HexKey | null;
  /**
   * A small portrait of the board, exactly as currently drawn (camera and
   * all), as a PNG data URL — "the map at death is the run's whole story,
   * drawn" (`ideas/endless-world.md`). `maxPx` bounds the longest side of the
   * raster; the renderer decides how to get there. `null` wherever extraction
   * is unavailable — nothing mounted, no 2D context to encode into — which a
   * caller treats as "no picture this time", not an error.
   */
  snapshot(maxPx: number): string | null;
  /** Release GPU resources and detach. */
  destroy(): void;
}
