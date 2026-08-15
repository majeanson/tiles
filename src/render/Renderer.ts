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
   * Part of the pocket the harvest buttons are currently pricing. Endless world
   * only — the bounded harvest is the whole board, so nothing is singled out.
   */
  readonly targeted: boolean;
  /** Matching neighbours. Meaningful on tiles; zero everywhere else. */
  readonly worth: number;

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
};

export type BoardView = {
  readonly cells: readonly CellView[];
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
  /** Current zoom, 1 = fit. For the buttons' disabled states. */
  zoomLevel(): number;
  /**
   * Which cell is under a point, in CSS pixels relative to the host element.
   * The renderer owns the board's placement on screen, so it is the only thing
   * that can answer this; the alternative is the UI duplicating the layout maths
   * and drifting out of step with what is actually drawn.
   */
  hitTest(x: number, y: number): HexKey | null;
  /** Release GPU resources and detach. */
  destroy(): void;
}
