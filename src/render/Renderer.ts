import type { HexKey } from '@engine/hex';

/**
 * The boundary between the game and the screen.
 *
 * The engine produces state; a selector flattens that state into a `BoardView`
 * of plain data; the renderer draws it. The engine never imports this file and
 * never learns that pixels exist — which is what lets the same rules run
 * headless in the balance harness at full speed.
 *
 * `BoardView` is deliberately a description of WHAT is on the board, not HOW to
 * paint it. Colour, easing and texture belong to the renderer, so art direction
 * can change without the game changing.
 */

export type CellKind = 'empty' | 'blocked' | 'barren' | 'tile';

export type CellView = {
  readonly key: HexKey;
  readonly q: number;
  readonly r: number;
  readonly kind: CellKind;
};

export type BoardView = {
  readonly cells: readonly CellView[];
};

export interface Renderer {
  /** Attach to the DOM and prepare the canvas. */
  mount(host: HTMLElement): Promise<void>;
  /** Draw a view. Idempotent — calling it twice with the same view is a no-op visually. */
  draw(view: BoardView): void;
  /** Release GPU resources and detach. */
  destroy(): void;
}
