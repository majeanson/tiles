import { Application, Container, Graphics, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { key, type HexKey } from '@engine/hex';
import { COLOUR_GLYPH, fieldDots, hex, mix, rgba, type Surface, type Theme } from '@theme/tokens';
import { AssetBook } from './assets';
import { corners, fitLayout, hexAt, place, zoomCeiling, zoomLayout, type Layout } from './layout';
import type { BoardView, CellView, Renderer } from './Renderer';
import { SurfaceTextures } from './surfaces';

/**
 * The camera's range. 1 is the auto-fit that shows the whole grown world plus
 * its beacons — you can always get everything back on screen — and 4 is close
 * enough that a single hex is unmistakable under a thumb. Interaction bounds,
 * not balance and not art: they live with the renderer that enforces them.
 */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

/**
 * How big a hex may be got to, in pixels of radius, however large the world
 * has grown.
 *
 * The bug this fixes (Marc, on a phone, 2026-08-15: "there is a point on
 * mobile where the map grows and i cant zoom in to see numbers anymore"):
 * ZOOM_MAX was a multiple of FIT, and fit shrinks as the world grows. Early
 * on, fit is ~40px a hex and 4x is enormous. By reach 16 — with the beacon
 * horizon stretching the fitted extent another 8 hexes past that — fit is
 * about 5px a hex, so the same 4x cap tops out around 18px and the worth
 * numbers (drawn from size 12 up) are technically present and practically
 * unreadable. The ceiling has to be absolute, not relative to a board that
 * keeps getting bigger.
 *
 * 34px of radius is a hex about a thumb across, which is the size the whole
 * layout was designed around in the first place.
 */
const HEX_PX_MAX = 34;

/**
 * How much brighter one contour band draws than the one below it.
 *
 * Small on purpose: height is scenery, and a board where the hills are louder
 * than the tiles is a board you cannot read. Marc chose purely cosmetic
 * elevation, and this number is what keeps it honest about that.
 */
const BAND_LIFT = 0.06;

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

/**
 * One popped hex, animating. `glow` is the warm flash; `jump` is the tile
 * itself leaping and falling away — Marc's Q3 answer, reward and disturbance
 * at once. Both run on the same stagger so a big harvest reads as a cascade.
 */
type Flash = {
  readonly kind: 'glow' | 'jump';
  readonly sprite: Sprite;
  /** Milliseconds until it starts. A harvest staggers so it reads as a cascade. */
  delayMs: number;
  elapsedMs: number;
  readonly lifeMs: number;
  readonly peak: number;
  /** Jump only: rest height and leap height, in pixels. */
  readonly baseY: number;
  readonly liftPx: number;
};

export class PixiRenderer implements Renderer {
  #app: Application | null = null;
  readonly #cells = new Container();
  readonly #fx = new Container();
  readonly #vignette = new Container();

  #view: BoardView = { cells: [] };
  #layout: Layout | null = null;
  #detach: (() => void) | null = null;

  /**
   * The camera: zoom baked into the layout (cell size changes, so zooming
   * redraws and the worth numbers appear as you lean in), pan applied as a
   * plain translation on the containers (nothing about a cell changes, so
   * panning never rebuilds anything — it has to survive a thumb dragging at
   * 60Hz on a phone).
   */
  #zoom = 1;
  /** The fitted hex size from the last draw — what the zoom ceiling is in. */
  #fitSize = 0;
  #panX = 0;
  #panY = 0;

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

    const fit = fitLayout(
      view.cells,
      app.screen.width,
      app.screen.height,
      10,
      this.#theme.orientation,
    );
    this.#fitSize = fit.size;
    const layout = zoomLayout(fit, this.#zoom, app.screen.width / 2, app.screen.height / 2);
    this.#layout = layout;
    if (layout.size <= 0) return;

    for (const cell of view.cells) this.#cells.addChild(this.#drawCell(cell, layout));

    this.#applyPan();
    this.#spawnFlashes(previous, view, layout);
    this.#drawVignette(app.screen.width, app.screen.height);
  }

  // ---------------------------------------------------------------- camera

  /**
   * The zoom ceiling for the board as it stands: enough to get a hex to
   * HEX_PX_MAX, and never less than the flat ZOOM_MAX a small board had.
   * It RISES as the world grows, which is the whole point — a fixed multiple
   * of a shrinking fit is a ceiling that falls.
   */
  #zoomMax(): number {
    return zoomCeiling(this.#fitSize, ZOOM_MAX, HEX_PX_MAX);
  }

  zoomBy(factor: number): void {
    const next = Math.min(this.#zoomMax(), Math.max(ZOOM_MIN, this.#zoom * factor));
    if (next === this.#zoom) return;

    // Anchoring at the screen centre means the pan scales with the zoom —
    // the hex under the middle of the screen stays under the middle.
    const applied = next / this.#zoom;
    this.#zoom = next;
    this.#panX *= applied;
    this.#panY *= applied;

    // Flashes were positioned in the old layout; a third of a second of glow
    // is not worth drawing in the wrong place. Same reasoning as resize.
    this.#clearFlashes();
    this.draw(this.#view);
  }

  panBy(dx: number, dy: number): void {
    this.#panX += dx;
    this.#panY += dy;
    this.#applyPan();
  }

  resetCamera(): void {
    this.#zoom = 1;
    this.#panX = 0;
    this.#panY = 0;
    this.#clearFlashes();
    this.draw(this.#view);
  }

  zoomLevel(): number {
    return this.#zoom;
  }

  zoomMax(): number {
    return this.#zoomMax();
  }

  /**
   * Clamp the pan so at least half the viewport always shows board, then move
   * both world containers. A translation changes nothing about any cell, so
   * this is the whole cost of a drag — no rebuild, no re-measure.
   */
  #applyPan(): void {
    const app = this.#app;
    if (app === null) return;

    const maxX = (app.screen.width / 2) * this.#zoom;
    const maxY = (app.screen.height / 2) * this.#zoom;
    this.#panX = Math.min(maxX, Math.max(-maxX, this.#panX));
    this.#panY = Math.min(maxY, Math.max(-maxY, this.#panY));

    this.#cells.position.set(this.#panX, this.#panY);
    this.#fx.position.set(this.#panX, this.#panY);
  }

  /**
   * Answered from the SAME layout the last frame was drawn with, rather than
   * recomputed. A board that moved on resize between the draw and the tap would
   * otherwise place a tile somewhere the player never touched.
   */
  hitTest(x: number, y: number): HexKey | null {
    const layout = this.#layout;
    if (layout === null) return null;

    // The pan is a container translation the layout knows nothing about, so
    // the tap is translated back before the layout answers.
    const h = hexAt(x - this.#panX, y - this.#panY, layout);
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
      case 'landmark': {
        // A destination wears the wall's ground — it is solid, and it should
        // read as a THING standing on the plane — lit with the theme's accent
        // while unclaimed, gone quiet once reached. A beacon is the same
        // surface faded, glowing through ground that is not drawn yet. All of
        // it derives from tokens every direction already has; Gate E is shut
        // and these values are structure, not art.
        const base = cell.claimed
          ? theme.stone
          : {
              ...theme.wall,
              pattern: {
                kind: 'dots' as const,
                // A territory glows in the colour of the field claiming it
                // unfurls, so the walk is toward a known reward.
                ink: cell.colour !== null ? theme.terrain[cell.colour].fill : theme.ink.accent,
                alpha: 0.45,
                radius: 1.6,
                pitch: 5,
              },
            };
        return cell.beacon ? { ...base, alpha: 0.55 } : base;
      }
      case 'empty': {
        // Native ground shows as a whisper of its colour — dots faint enough to
        // read as terrain, not as a tile. Derived entirely from tokens the theme
        // already has, so repainting the direction repaints the fields with it;
        // the pattern numbers are PROVISIONAL placeholder values (Gate E), and a
        // direction that wants its own field texture overrides `empty` per se.
        if (cell.native !== null) {
          // Ink and alpha come from `fieldDots`, which equalises how strongly
          // all four read against this theme's ground — drawing each colour
          // in its own fill at one flat alpha made the bright fields shout
          // and the dark ones disappear. Slightly larger and tighter than
          // before, too: at phone scale a 1.1px dot on a 7px pitch is a
          // texture you have to hunt for.
          // A SHAPE rather than a dot, one per colour, so which field this is
          // survives being read by someone who cannot tell the hues apart —
          // and reads faster for everyone else, because a silhouette is
          // recognised before a colour is judged. Slightly larger and more
          // spaced than the dots were: a symbol has to be big enough to have
          // a shape at all, which a 1.4px dot did not.
          const dots = fieldDots(theme, cell.native);
          return {
            ...theme.empty,
            pattern: {
              kind: 'glyphs',
              shape: COLOUR_GLYPH[cell.native],
              ink: dots.ink,
              alpha: dots.alpha,
              size: 2.1,
              pitch: 9,
            },
          };
        }
        return theme.empty;
      }
      case 'tile':
        // A `tile` with no colour cannot happen — `view.ts` sets colour on every
        // tile — but the view type permits it, and a board that silently vanishes
        // is worse than one that shows stone.
        return cell.colour === null ? theme.stone : theme.terrain[cell.colour];
    }
  }

  #drawCell(cell: CellView, layout: Layout): Container {
    const theme = this.#theme;
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
      // The colour lens steps other colours back rather than hiding them —
      // the shape being studied still needs its surroundings to mean anything.
      // Remembered ground is the faintest thing on the board on purpose: it
      // is a map, not a place you can act on, and it must never compete with
      // the run you are actually playing.
      sprite.alpha = surface.alpha * (cell.dimmed ? 0.25 : 1) * (cell.remembered ? 0.3 : 1);
      // The torch. Tint rather than alpha, because dropping alpha would show
      // the page through the board and turn distance into holes; tinting
      // toward the board's own dark reads as light falling away from you.
      // Height rides on the same channel: a hex a band higher catches a little
      // more of the light, which is what makes contours visible at all.
      if (cell.light < 1 || cell.band > 0) {
        const lift = 1 + cell.band * BAND_LIFT;
        sprite.tint = mix(this.#theme.board.background, 0xffffff, Math.min(1, cell.light * lift));
      }
      group.addChild(sprite);
    }

    /**
     * The ghost: where the tile in your hand would be worth something.
     *
     * Drawn OVER the ground rather than instead of it (Marc, 2026-08-16: "when
     * were hovering a red, we cant see the red terrain underneath"). It used to
     * replace the surface, which meant the native field — the colour and the
     * symbol saying whose ground this is — vanished at exactly the moment you
     * were deciding whether to use it. The ghost was hiding the reason for its
     * own number.
     *
     * Not tinted by the torch: it marks where you may act, and a legal cell is
     * by definition next to what you have just built, so it is never far enough
     * out for full strength to look wrong.
     */
    if (cell.legal && cell.preview !== null && cell.preview > 0 && !cell.remembered) {
      const ghost = this.#assets.get(theme.ghost.asset);
      const ghostTexture =
        ghost ?? this.#surfaces.get(theme.ghost, layout.size, layout.orientation);
      if (ghostTexture !== null) {
        const over = new Sprite(ghostTexture);
        over.anchor.set(0.5);
        over.position.set(x, y);
        const wide = layout.orientation === 'pointy' ? Math.sqrt(3) : 2;
        const tall = layout.orientation === 'pointy' ? 2 : Math.sqrt(3);
        over.setSize(layout.size * wide, layout.size * tall);
        over.alpha = theme.ghost.alpha;
        group.addChild(over);
      }
    }

    // Contours: a hex that sits higher than the board's floor gets a light
    // rim on its upper edges, so a slope reads as a slope rather than as a
    // colour change. Cosmetic by Marc's decision — nothing in the rules has
    // ever heard of height.
    if (cell.band > 0 && layout.size > 8 && !cell.remembered) {
      const pts = corners(x, y, layout.size * (1 - surface.inset), layout.orientation);
      group.addChild(
        new Graphics().poly(pts).stroke({
          width: Math.max(0.5, layout.size * 0.045),
          color: mix(this.#theme.board.background, 0xffffff, 0.55),
          alpha: 0.1 * cell.band * cell.light,
          alignment: 1,
        }),
      );
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
    if (label !== null && layout.size > 12 && !cell.dimmed && !cell.remembered) {
      group.addChild(this.#drawLabel(label, x, y, layout.size));
    }

    return group;
  }

  #strokeFor(cell: CellView, size: number): { width: number; colour: number } | null {
    const board = this.#theme.board;
    // Memory gets no outline at all — an edge would read as a live cell.
    if (cell.remembered) return null;
    // The pocket being priced outranks even ripe: on the plane the harvest
    // buttons answer for exactly these cells, and the outline is that promise.
    if (cell.targeted)
      return {
        width: Math.max(2, size * board.ripeEdgeWidth * 1.4),
        colour: this.#theme.ink.accent,
      };
    // Ripe is the one thing the player must never miss — it is the entire
    // harvest decision — so it gets the loudest outline on the board.
    if (cell.ripe)
      return { width: Math.max(1.5, size * board.ripeEdgeWidth), colour: board.ripeEdge };
    // An unclaimed destination is the other thing worth walking toward, so it
    // carries the accent even at beacon distance. Claimed, it drops to chrome.
    if (cell.kind === 'landmark' && !cell.claimed)
      return { width: Math.max(1.5, size * board.ripeEdgeWidth), colour: this.#theme.ink.accent };
    // Magic and unique tiles keep a quiet accent edge so their power stays
    // findable on a full board without shouting over ripe.
    if (cell.kind === 'tile' && cell.rarity !== null && cell.rarity !== 'common')
      return { width: Math.max(1, size * board.edgeWidth * 1.5), colour: this.#theme.ink.accent };
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

    // Key to colour, so the jump can wear the popped tile's own surface.
    const wasRipe = new Map<HexKey, CellView>();
    for (const cell of previous.cells) {
      if (cell.kind === 'tile' && cell.ripe) wasRipe.set(cell.key, cell);
    }
    if (wasRipe.size === 0) return;

    const motion = this.#theme.motion;
    const texture = this.#flashTextureFor();
    if (texture === null) return;

    let index = 0;
    for (const cell of next.cells) {
      if (cell.kind !== 'stone' || !wasRipe.has(cell.key)) continue;

      const { x, y } = place(cell, layout);
      const delayMs = index * motion.popStaggerMs;

      const glow = new Sprite(texture);
      glow.anchor.set(0.5);
      glow.position.set(x, y);
      glow.setSize(layout.size * 3.2, layout.size * 3.2);
      glow.alpha = 0;
      this.#fx.addChild(glow);

      this.#flashes.push({
        kind: 'glow',
        sprite: glow,
        delayMs,
        elapsedMs: 0,
        lifeMs: motion.popMs,
        peak: motion.popAlpha,
        baseY: y,
        liftPx: 0,
      });

      // The tile itself leaps off its spot and falls away, leaving the stone
      // that is already drawn underneath. Same cached surface texture the board
      // uses, so the thing that jumps is exactly the thing that was there.
      const popped = wasRipe.get(cell.key);
      if (motion.popLift > 0 && popped !== undefined && popped.colour !== null) {
        const surface = this.#theme.terrain[popped.colour];
        const tileTexture =
          this.#assets.get(surface.asset) ??
          this.#surfaces.get(surface, layout.size, layout.orientation);
        if (tileTexture !== null) {
          const jumper = new Sprite(tileTexture);
          jumper.anchor.set(0.5);
          jumper.position.set(x, y);
          const wide = layout.orientation === 'pointy' ? Math.sqrt(3) : 2;
          const tall = layout.orientation === 'pointy' ? 2 : Math.sqrt(3);
          jumper.setSize(layout.size * wide, layout.size * tall);
          jumper.alpha = 0;
          this.#fx.addChild(jumper);

          this.#flashes.push({
            kind: 'jump',
            sprite: jumper,
            delayMs,
            elapsedMs: 0,
            // A touch longer than the glow so the tile lands after the light.
            lifeMs: motion.popMs * 1.25,
            peak: 1,
            baseY: y,
            liftPx: layout.size * motion.popLift,
          });
        }
      }

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

      if (flash.kind === 'glow') {
        // Fast up, slow down. A symmetric fade reads as a pulsing light; the
        // asymmetry is what makes it read as something having happened.
        const curve = t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 2);
        flash.sprite.alpha = flash.peak * curve;
        flash.sprite.scale.set(1 + t * 0.35);
      } else {
        // The leap: a parabola peaking mid-life, visible at once, fading only
        // on the way down — so it reads as the tile jumping off the board and
        // falling away, not as a ghost drifting up.
        flash.sprite.alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        flash.sprite.position.y = flash.baseY - flash.liftPx * 4 * t * (1 - t);
        flash.sprite.scale.set(1 + 0.12 * Math.sin(Math.PI * t));
      }
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
 * Numbers on the board, and only the ones that drive a decision: what a ripe
 * tile is worth, what the selected tile would be worth here, and what kind of
 * destination is glowing. A zero is silence rather than a "0" — an empty hex
 * that gains you nothing should read as nothing, not as a choice with a number
 * attached.
 *
 * Landmark glyphs are deliberately the plainest marks that survive a tiny hex:
 * `+` pays tiles, `★` pays points, `◆` is a territory to claim. Words for them
 * live in the HUD hint, where there is room for words.
 */
function labelFor(cell: CellView): { text: string; faint: boolean } | null {
  if (cell.kind === 'landmark') {
    const glyph =
      cell.landmark === 'cache'
        ? '+'
        : cell.landmark === 'site'
          ? '★'
          : cell.landmark === 'shrine'
            ? '◈'
            : '◆';
    return { text: glyph, faint: cell.claimed };
  }
  if (cell.ripe && cell.worth > 0) return { text: String(cell.worth), faint: false };
  if (cell.legal && cell.preview !== null && cell.preview > 0) {
    return { text: String(cell.preview), faint: true };
  }
  return null;
}
