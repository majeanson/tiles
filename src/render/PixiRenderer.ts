import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Colour } from '@content/tuning';
import { key, type HexKey } from '@engine/hex';
import { corners, fitLayout, hexAt, place, type Layout } from './layout';
import type { BoardView, CellView, Renderer } from './Renderer';

/**
 * PLACEHOLDER PALETTE.
 *
 * Art direction is deliberately undecided and is gated behind the design work
 * (see LOG.md, gate E). These are chosen to be TELLABLE APART and obviously
 * provisional, so that nobody mistakes them for a brief. Four tile colours that
 * cannot be distinguished is a broken game rather than an ugly one, which is the
 * only reason there is any hue here at all. Do not build a visual language on
 * top of this object — replace it.
 */
const PLACEHOLDER = {
  background: 0x14161c,
  empty: 0x1e222b,
  wall: 0x2b303b,
  stone: 0x3c3f47,
  edge: 0x3a4150,
  /** Ripe tiles are outlined, not recoloured — the colour still has a job. */
  ripeEdge: 0xe8ecf4,
  legalEdge: 0x59637a,
  text: 0xd7dce6,
  faint: 0x767d8d,
  tile: {
    green: 0x3f7d55,
    yellow: 0xa8912f,
    red: 0x9c4340,
    blue: 0x3f6291,
  } satisfies Record<Colour, number>,
} as const;

const fillFor = (cell: CellView): number => {
  if (cell.kind === 'tile')
    return cell.colour === null ? PLACEHOLDER.stone : PLACEHOLDER.tile[cell.colour];
  return PLACEHOLDER[cell.kind];
};

export class PixiRenderer implements Renderer {
  #app: Application | null = null;
  #board = new Container();
  #view: BoardView = { cells: [] };
  #layout: Layout | null = null;
  #detachResize: (() => void) | null = null;

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      background: PLACEHOLDER.background,
      antialias: true,
      resizeTo: host,
      // A hex edge at phone scale is a couple of physical pixels; without
      // device-pixel resolution the whole board reads as soft and cheap.
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });

    host.appendChild(app.canvas);
    app.stage.addChild(this.#board);
    this.#app = app;

    // `resizeTo` resizes the canvas but knows nothing about board layout, so the
    // fit has to be recomputed and the board redrawn on every resize. On a phone
    // this fires for rotation and for the URL bar collapsing on scroll.
    const onResize = (): void => {
      this.draw(this.#view);
    };
    app.renderer.on('resize', onResize);
    this.#detachResize = () => {
      app.renderer.off('resize', onResize);
    };

    this.draw(this.#view);
  }

  draw(view: BoardView): void {
    this.#view = view;
    const app = this.#app;
    if (app === null) return;

    this.#board.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    if (view.cells.length === 0) return;

    const layout = fitLayout(view.cells, app.screen.width, app.screen.height, 10);
    this.#layout = layout;
    if (layout.size <= 0) return;

    for (const cell of view.cells) this.#board.addChild(drawCell(cell, layout));
  }

  /**
   * Answered from the SAME layout the last frame was drawn with, rather than
   * recomputed. A board that moved on resize between the draw and the tap would
   * otherwise place a tile somewhere the player never touched.
   */
  hitTest(x: number, y: number): HexKey | null {
    const layout = this.#layout;
    if (layout === null) return null;

    const hex = hexAt(x, y, layout);
    const k = key(hex.q, hex.r);
    return this.#view.cells.some((c) => c.key === k) ? k : null;
  }

  destroy(): void {
    this.#detachResize?.();
    this.#detachResize = null;
    this.#app?.destroy(true, { children: true });
    this.#app = null;
    this.#layout = null;
  }
}

function drawCell(cell: CellView, layout: Layout): Container {
  const group = new Container();
  const { x, y } = place(cell, layout);

  // A small inset leaves a visible gutter between hexes, so the grid reads as
  // discrete cells rather than one continuous surface.
  const pts = corners(x, y, layout.size * 0.94);
  const stroke = strokeFor(cell, layout.size);
  group.addChild(
    new Graphics()
      .poly(pts)
      .fill({ color: fillFor(cell) })
      .stroke(stroke),
  );

  const label = labelFor(cell);
  if (label !== null && layout.size > 12) {
    const text = new Text({
      text: label.text,
      style: {
        fill: label.faint ? PLACEHOLDER.faint : PLACEHOLDER.text,
        fontSize: Math.round(layout.size * 0.7),
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      },
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    group.addChild(text);
  }

  return group;
}

function strokeFor(cell: CellView, size: number): { width: number; color: number } {
  const width = Math.max(1, size * 0.04);
  // Ripe is the one thing the player must never miss — it is the entire
  // harvest decision — so it gets the loudest outline on the board.
  if (cell.ripe) return { width: width * 2.5, color: PLACEHOLDER.ripeEdge };
  if (cell.legal) return { width, color: PLACEHOLDER.legalEdge };
  return { width, color: PLACEHOLDER.edge };
}

/**
 * Numbers on the board, and only the two that drive a decision: what a ripe
 * tile is worth, and what the selected tile would be worth here. A zero is
 * silence rather than a "0" — an empty hex that gains you nothing should read as
 * nothing, not as a choice with a number attached.
 */
function labelFor(cell: CellView): { text: string; faint: boolean } | null {
  if (cell.ripe && cell.worth > 0) return { text: String(cell.worth), faint: false };
  if (cell.legal && cell.preview !== null && cell.preview > 0) {
    return { text: String(cell.preview), faint: true };
  }
  return null;
}
