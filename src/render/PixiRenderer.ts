import { Application, Container, Graphics, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { key, type HexKey } from '@engine/hex';
import { hex, rgba, type Surface, type Theme } from '@theme/tokens';
import { AssetBook } from './assets';
import { corners, fitLayout, hexAt, place, type Layout } from './layout';
import type { BoardView, CellView, Renderer } from './Renderer';
import { SurfaceTextures } from './surfaces';

/**
 * The board, drawn from a theme.
 *
 * Nothing about how the game looks is decided in this file any more. It takes a
 * `Theme` and paints the roles the rules already have — ripe, legal, stone, one
 * of four colours — using whatever that theme says those roles look like. Swapping
 * the whole art direction is a different argument to the constructor, which is
 * the property this session was asked to build for, because everything visual is
 * expected to change and most of it twice.
 *
 * Three layers, in draw order, and the split is what makes the flash possible:
 * cells are rebuilt wholesale on every action (cheap, and the state is small),
 * effects persist across draws and animate on their own clock, and the vignette
 * sits over both and only changes when the canvas resizes.
 */

/** One popped hex, burning. */
type Flash = {
  readonly sprite: Sprite;
  /** Milliseconds until it starts. A harvest staggers so it reads as a cascade. */
  delayMs: number;
  elapsedMs: number;
  readonly lifeMs: number;
  readonly peak: number;
};

export class PixiRenderer implements Renderer {
  #app: Application | null = null;
  readonly #cells = new Container();
  readonly #fx = new Container();
  readonly #vignette = new Container();

  #view: BoardView = { cells: [] };
  #layout: Layout | null = null;
  #detach: (() => void) | null = null;

  readonly #theme: Theme;
  #assets: AssetBook;
  readonly #surfaces = new SurfaceTextures();
  #flashTexture: Texture | null = null;
  #vignetteKey = '';
  #flashes: Flash[] = [];

  /**
   * `reducedMotion` is read once at construction rather than per frame. A player
   * who has asked their phone for less movement is not asking for a board that
   * decides per animation — and the pop flash is the one place this game moves.
   */
  readonly #reducedMotion: boolean;

  constructor(theme: Theme, assets: AssetBook = AssetBook.empty(), reducedMotion = false) {
    this.#theme = theme;
    this.#assets = assets;
    this.#reducedMotion = reducedMotion;
  }

  /** Art can arrive after the first frame; the board simply gets better. */
  useAssets(assets: AssetBook): void {
    this.#assets = assets;
    this.draw(this.#view);
  }

  async mount(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      background: this.#theme.board.background,
      antialias: true,
      resizeTo: host,
      // A hex edge at phone scale is a couple of physical pixels; without
      // device-pixel resolution the whole board reads as soft and cheap.
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });

    host.appendChild(app.canvas);
    app.stage.addChild(this.#cells, this.#fx, this.#vignette);
    this.#app = app;

    // `resizeTo` only watches WINDOW resizes, but the host is a flex child: it
    // changes size with no window event at all when the chrome around it does —
    // the draft cards filling in on the first render, the end screen appearing,
    // the theme picker mounting. Without observing the element itself, the
    // canvas keeps its stale first measurement and sits oversized across the
    // controls until something happens to nudge the window (opening devtools
    // was how it was caught). The observer closes that gap.
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            app.resize();
          })
        : null;
    observer?.observe(host);

    // `resizeTo` resizes the canvas but knows nothing about board layout, so the
    // fit has to be recomputed and the board redrawn on every resize. On a phone
    // this fires for rotation and for the URL bar collapsing on scroll.
    const onResize = (): void => {
      // Flashes are positioned in the layout that was current when they were
      // spawned, so a rotation mid-harvest would leave them burning over the
      // wrong hexes. They last a third of a second; dropping them is right.
      this.#clearFlashes();
      this.draw(this.#view);
      this.#surfaces.evictExcept(this.#layout?.size ?? 0, this.#theme.orientation);
    };
    const onTick = (ticker: Ticker): void => {
      this.#advanceFlashes(ticker.deltaMS);
    };

    app.renderer.on('resize', onResize);
    app.ticker.add(onTick);
    this.#detach = () => {
      observer?.disconnect();
      app.renderer.off('resize', onResize);
      app.ticker.remove(onTick);
    };

    this.draw(this.#view);
  }

  draw(view: BoardView): void {
    const previous = this.#view;
    this.#view = view;

    const app = this.#app;
    if (app === null) return;

    this.#cells.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    if (view.cells.length === 0) return;

    const layout = fitLayout(
      view.cells,
      app.screen.width,
      app.screen.height,
      10,
      this.#theme.orientation,
    );
    this.#layout = layout;
    if (layout.size <= 0) return;

    for (const cell of view.cells) this.#cells.addChild(this.#drawCell(cell, layout));

    this.#spawnFlashes(previous, view, layout);
    this.#drawVignette(app.screen.width, app.screen.height);
  }

  /**
   * Answered from the SAME layout the last frame was drawn with, rather than
   * recomputed. A board that moved on resize between the draw and the tap would
   * otherwise place a tile somewhere the player never touched.
   */
  hitTest(x: number, y: number): HexKey | null {
    const layout = this.#layout;
    if (layout === null) return null;

    const h = hexAt(x, y, layout);
    const k = key(h.q, h.r);
    return this.#view.cells.some((c) => c.key === k) ? k : null;
  }

  destroy(): void {
    this.#detach?.();
    this.#detach = null;
    this.#clearFlashes();
    this.#surfaces.destroy();
    this.#flashTexture?.destroy(true);
    this.#flashTexture = null;
    this.#app?.destroy(true, { children: true });
    this.#app = null;
    this.#layout = null;
  }

  // ---------------------------------------------------------------- cells

  #surfaceFor(cell: CellView): Surface {
    const theme = this.#theme;
    switch (cell.kind) {
      case 'wall':
        return theme.wall;
      case 'stone':
        return theme.stone;
      case 'empty':
        // Ghosted where the tile you are holding would actually be WORTH
        // something — not on every legal cell, which is most of the board and
        // would read as noise. "Matching pays nothing directly; it sets the
        // worth of the eventual pop" is the design's central claim, and this is
        // that claim painted: the cells that light up are the ones where the
        // thing in your hand does work. The number beside it says how much.
        return cell.legal && cell.preview !== null && cell.preview > 0 ? theme.ghost : theme.empty;
      case 'tile':
        // A `tile` with no colour cannot happen — `view.ts` sets colour on every
        // tile — but the view type permits it, and a board that silently vanishes
        // is worse than one that shows stone.
        return cell.colour === null ? theme.stone : theme.terrain[cell.colour];
    }
  }

  #drawCell(cell: CellView, layout: Layout): Container {
    const group = new Container();
    const { x, y } = place(cell, layout);
    const surface = this.#surfaceFor(cell);

    const art = this.#assets.get(surface.asset);
    const texture = art ?? this.#surfaces.get(surface, layout.size, layout.orientation);

    if (texture !== null) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      // Real art is authored to the hex's bounding box, so it is scaled to the
      // same extent the procedural bake fills. One code path, either source.
      const wide = layout.orientation === 'pointy' ? Math.sqrt(3) : 2;
      const tall = layout.orientation === 'pointy' ? 2 : Math.sqrt(3);
      sprite.setSize(layout.size * wide, layout.size * tall);
      sprite.alpha = surface.alpha;
      group.addChild(sprite);
    }

    const stroke = this.#strokeFor(cell, layout.size);
    if (stroke !== null) {
      const inset = surface.inset;
      group.addChild(
        new Graphics()
          .poly(corners(x, y, layout.size * (1 - inset), layout.orientation))
          .stroke({ width: stroke.width, color: stroke.colour, alignment: 0.5 }),
      );
    }

    const label = labelFor(cell);
    if (label !== null && layout.size > 12) {
      group.addChild(this.#drawLabel(label, x, y, layout.size));
    }

    return group;
  }

  #strokeFor(cell: CellView, size: number): { width: number; colour: number } | null {
    const board = this.#theme.board;
    // Ripe is the one thing the player must never miss — it is the entire
    // harvest decision — so it gets the loudest outline on the board.
    if (cell.ripe)
      return { width: Math.max(1.5, size * board.ripeEdgeWidth), colour: board.ripeEdge };
    if (cell.legal) return { width: Math.max(1, size * board.edgeWidth), colour: board.legalEdge };
    if (cell.kind === 'empty') return null;
    return { width: Math.max(1, size * board.edgeWidth), colour: board.edge };
  }

  #drawLabel(label: { text: string; faint: boolean }, x: number, y: number, size: number): Text {
    const text = new Text({
      text: label.text,
      style: {
        fill: label.faint ? this.#theme.ink.inkFaint : this.#theme.ink.ink,
        fontSize: Math.round(size * 0.7),
        fontFamily: this.#theme.type.display,
      },
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    return text;
  }

  // ---------------------------------------------------------------- effects

  /**
   * A harvest, seen.
   *
   * The engine has no events and no clock — it returns a new board, and that is
   * all it is ever going to do. So the flash is derived by comparing the board we
   * are about to draw with the one we last drew: a cell that WAS a ripe tile and
   * IS now stone was just popped. Nothing in the engine learns that the screen
   * exists, and no event bus has to stay in sync with the reducer.
   */
  #spawnFlashes(previous: BoardView, next: BoardView, layout: Layout): void {
    if (this.#reducedMotion || previous.cells.length === 0) return;

    const wasRipe = new Set<HexKey>();
    for (const cell of previous.cells) {
      if (cell.kind === 'tile' && cell.ripe) wasRipe.add(cell.key);
    }
    if (wasRipe.size === 0) return;

    const motion = this.#theme.motion;
    const texture = this.#flashTextureFor();
    if (texture === null) return;

    let index = 0;
    for (const cell of next.cells) {
      if (cell.kind !== 'stone' || !wasRipe.has(cell.key)) continue;

      const { x, y } = place(cell, layout);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.setSize(layout.size * 3.2, layout.size * 3.2);
      sprite.alpha = 0;
      this.#fx.addChild(sprite);

      this.#flashes.push({
        sprite,
        delayMs: index * motion.popStaggerMs,
        elapsedMs: 0,
        lifeMs: motion.popMs,
        peak: motion.popAlpha,
      });
      index++;
    }
  }

  #clearFlashes(): void {
    for (const flash of this.#flashes) flash.sprite.destroy();
    this.#flashes = [];
  }

  #advanceFlashes(deltaMs: number): void {
    if (this.#flashes.length === 0) return;

    const alive: Flash[] = [];
    for (const flash of this.#flashes) {
      if (flash.delayMs > 0) {
        flash.delayMs -= deltaMs;
        alive.push(flash);
        continue;
      }

      flash.elapsedMs += deltaMs;
      const t = flash.elapsedMs / flash.lifeMs;
      if (t >= 1) {
        flash.sprite.destroy();
        continue;
      }

      // Fast up, slow down. A symmetric fade reads as a pulsing light; the
      // asymmetry is what makes it read as something having happened.
      const curve = t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 2);
      flash.sprite.alpha = flash.peak * curve;
      flash.sprite.scale.set(1 + t * 0.35);
      alive.push(flash);
    }
    this.#flashes = alive;
  }

  #flashTextureFor(): Texture | null {
    if (this.#flashTexture !== null) return this.#flashTexture;

    const art = this.#assets.get('fx.pop');
    if (art !== null) {
      this.#flashTexture = art;
      return art;
    }

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;

    const colour = hex(this.#theme.motion.popColour);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.28, colour);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    this.#flashTexture = Texture.from(canvas);
    return this.#flashTexture;
  }

  // ---------------------------------------------------------------- vignette

  /**
   * The edge of the world, without lying about it.
   *
   * Every art direction handed down wants the map to fall away into fog rather
   * than stop at a border. There is no fog mechanic — the map is a bounded island
   * and every cell of it is known — so this is strictly atmosphere: a darkening
   * toward the canvas edge that carries no information and hides no cell.
   *
   * `strength` is a CEILING rather than a target, which is Torchlit's stated hard
   * rule made mechanical: no in-play tile drops below (1 − strength) of its own
   * luminance no matter how far into the falloff it sits. Darkness hides the
   * space, never the ground you have built.
   */
  #drawVignette(width: number, height: number): void {
    const spec = this.#theme.board.vignette;
    if (spec === null) {
      this.#vignette.removeChildren().forEach((c) => {
        c.destroy();
      });
      this.#vignetteKey = '';
      return;
    }

    const nextKey = `${Math.round(width)}x${Math.round(height)}:${spec.colour}:${spec.strength}`;
    if (nextKey === this.#vignetteKey) return;

    this.#vignette.removeChildren().forEach((c) => {
      c.destroy();
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const outer = Math.hypot(cx, cy);
    const gradient = ctx.createRadialGradient(cx, cy, outer * 0.42, cx, cy, outer);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.72, rgba(spec.colour, spec.strength * 0.45));
    gradient.addColorStop(1, rgba(spec.colour, spec.strength));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sprite = new Sprite(Texture.from(canvas));
    sprite.width = width;
    sprite.height = height;
    this.#vignette.addChild(sprite);
    this.#vignetteKey = nextKey;
  }
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
