import { Application, Container, Graphics } from 'pixi.js';
import { corners, fitLayout, place, type Layout } from './layout';
import type { BoardView, CellKind, CellView, Renderer } from './Renderer';

/**
 * PLACEHOLDER PALETTE.
 *
 * Art direction is deliberately undecided and is gated behind the design work
 * (see LOG.md, gate E). These are neutral greys chosen to be legible and to be
 * obviously provisional, so that nobody mistakes them for a brief. Do not build
 * a visual language on top of this object — replace it.
 */
const PLACEHOLDER = {
  background: 0x14161c,
  cell: { empty: 0x1e222b, blocked: 0x2b303b, barren: 0x33383f, tile: 0x4a5162 },
  edge: 0x3a4150,
} as const;

const fillFor = (kind: CellKind): number => PLACEHOLDER.cell[kind];

export class PixiRenderer implements Renderer {
  #app: Application | null = null;
  #board = new Container();
  #view: BoardView = { cells: [] };
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
      c.destroy();
    });
    if (view.cells.length === 0) return;

    const layout = fitLayout(view.cells, app.screen.width, app.screen.height, 10);
    if (layout.size <= 0) return;

    for (const cell of view.cells) this.#board.addChild(drawCell(cell, layout));
  }

  destroy(): void {
    this.#detachResize?.();
    this.#detachResize = null;
    this.#app?.destroy(true, { children: true });
    this.#app = null;
  }
}

function drawCell(cell: CellView, layout: Layout): Graphics {
  const { x, y } = place(cell, layout);
  // A small inset leaves a visible gutter between hexes, so the grid reads as
  // discrete cells rather than one continuous surface.
  const pts = corners(x, y, layout.size * 0.94);
  return new Graphics()
    .poly(pts)
    .fill({ color: fillFor(cell.kind) })
    .stroke({ width: Math.max(1, layout.size * 0.04), color: PLACEHOLDER.edge, alignment: 0.5 });
}
