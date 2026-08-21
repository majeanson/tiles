import { Application, Container, Graphics, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import { distance, key, parse, type HexKey } from '@engine/hex';
import {
  BAND_LIFT,
  fieldGround,
  LANDMARK_GLYPH,
  hex,
  mix,
  rgba,
  type AssetId,
  type Orientation,
  type Surface,
  type Theme,
} from '@theme/tokens';
import { AssetBook } from './assets';
import { corners, fitLayout, hexAt, place, zoomCeiling, zoomLayout, type Layout } from './layout';
import type { BoardView, CellView, Renderer } from './Renderer';
import { BakedCache, SurfaceTextures } from './surfaces';

/**
 * The camera's range. 1 is the auto-fit that shows the whole grown world plus
 * its beacons — you can always get everything back on screen — and 4 is close
 * enough that a single hex is unmistakable under a thumb. Interaction bounds,
 * not balance and not art: they live with the renderer that enforces them.
 */
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

/**
 * How long a camera move the GAME makes takes (Marc, 2026-08-20: "do a
 * transition instead of being instantaneous").
 *
 * Long enough to read as travel rather than a cut — the point is that you can
 * see WHERE you went, so the board stays a place instead of becoming a
 * different picture — and short enough that HERE still feels like a button.
 * Only automatic moves use it: a pinch or a drag follows a finger and is
 * never smoothed.
 */
const CAMERA_MS = 320;

/**
 * The same, for the board settling to a new fit size as it grows, and how
 * much of a size change is worth softening at all.
 *
 * Faster than a camera move because it is a correction, not a journey — and
 * it happens on a placement, which the player is already watching. The slop
 * keeps a sub-percent rounding wobble from starting an animation nobody
 * asked for; a real extent change (a beacon appearing, a wall pushing the
 * frontier out) is far larger than this.
 */
const REFIT_MS = 260;
const REFIT_SLOP = 0.01;

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
 * How long the reduced-motion pop glow stays before it is removed. Long
 * enough to register as "that happened", short enough to never read as an
 * animation — which is the whole contract of asking a phone for less motion.
 */
const REDUCED_POP_MS = 200;

/**
 * One full breath of a beacon's halo, in milliseconds — slow, so it reads as
 * a distant light rather than a strobe: "a lighthouse in fog." A renderer
 * constant rather than a theme one, because the pace exists so the pulse
 * never competes with placement, not to carry any direction's mood.
 */
const BEACON_PULSE_MS = 2600;

/**
 * The ember burst (2026-08-19). Torchlit's own motion note promised a pop
 * "falls back to gloom over 700ms with embers" and the flash sprite was
 * carrying that alone. A handful of tiny warm particles per popped hex,
 * riding the existing distance-ordered stagger.
 */
const EMBER_MIN = 4;
const EMBER_MAX = 7;
/**
 * Hard ceiling on sprites the ember pool will ever hold, across every hex
 * popping at once. A big pocket can be dozens of hexes cashed together; at
 * up to 7 embers a hex that is easily an unbounded storm if every hex got
 * its own allocation, so the pool caps TOTAL concurrent particles rather
 * than trusting every harvest to stay small — once spent, the rest of a
 * huge pop simply throws no more embers, which is the render layer degrading
 * quietly instead of a phone's GPU finding out the hard way.
 */
const EMBER_CAP = 140;

/**
 * The ripen pulse's own glow size, as a fraction of the pop's `popGlowScale`
 * (WORKPLAN Stage 4, 2026-08-20) — the exact ratio the two hand-typed sizes
 * (`2.6` and `3.2`) always had, kept as a constant rather than a second theme
 * token: a ripen only ever needs to stay proportionally quieter than a pop,
 * never an independent dial a direction tunes on its own.
 */
const RIPEN_GLOW_RATIO = 2.6 / 3.2;

// BAND_LIFT — how much brighter one contour band draws than the one below —
// moved to @theme/tokens (2026-08-18) so the gallery can draw the bands with
// the same number the board uses.

/**
 * Elevation edges (2026-08-18): which of `corners()`' six edges face the
 * torch and which face away from it, so a band's rim can light one side of a
 * hex rather than stroke the whole outline at one flat alpha — the six-edge
 * version read as noise where it read at all. Edge `i` runs from corner `i`
 * to corner `i + 1`; both orientations are fixed shapes at any position, so
 * this is computed once by hand from `corners()`'s own angles rather than
 * per cell. Flat-top splits cleanly in half (three edges above the centre
 * line, three below); pointy-top has two edges dead level with the centre
 * (the left and right sides), assigned to whichever half their shared
 * corner belongs to.
 */
const EDGE_LIGHT: Readonly<Record<Orientation, readonly number[]>> = {
  flat: [3, 4, 5],
  pointy: [5, 0, 1],
};
const EDGE_SHADE: Readonly<Record<Orientation, readonly number[]>> = {
  flat: [0, 1, 2],
  pointy: [2, 3, 4],
};

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
 * `hold` is the reduced-motion pop: the same glow at a fixed alpha, no
 * movement at all, removed after a beat — feedback without animation.
 * `cover` (2026-08-20, Marc: "tiles are not grey from the start — they go
 * from coloured to grey after the animation") is the tile's own surface
 * held still over the already-painted stone until this cell's beat of the
 * cascade arrives and the jump takes over — same texture, same spot, so
 * the hand-off is invisible and the grey is only ever seen once its tile
 * has actually leapt away.
 */
type Flash = {
  readonly kind: 'glow' | 'jump' | 'hold' | 'cover';
  readonly sprite: Sprite;
  /** Milliseconds until it starts. A harvest staggers so it reads as a cascade. */
  delayMs: number;
  elapsedMs: number;
  readonly lifeMs: number;
  readonly peak: number;
  /** Jump only: rest height and leap height, in pixels. */
  readonly baseY: number;
  readonly liftPx: number;
  /**
   * The sprite's scale right after `setSize` fitted it to the board — the
   * animated kinds multiply THIS instead of calling `scale.set(1 + …)`.
   * `setSize` works by writing `scale`, so an absolute reset silently
   * resizes the sprite back to its texture's native pixels. That was
   * invisible while every texture was baked at board size (scale 1 WAS the
   * fit), and became a full-screen tile the day the 414×358 slot PNGs
   * arrived (found on the phone, 2026-08-20).
   */
  readonly baseScaleX: number;
  readonly baseScaleY: number;
};

/**
 * One ember, pooled rather than allocated per burst — see `#acquireEmber`.
 *
 * Rises fast (an eased curve toward `startY + driftY`), then gravity pulls it
 * back down before it fades (WORKPLAN Stage 4, 2026-08-20) — `sinkPx` is that
 * fall's own size, computed once at spawn from the theme's `emberGravity` so
 * `#advanceEmbers` only ever does arithmetic, never a token lookup, on its
 * hot path.
 */
type Ember = {
  readonly sprite: Sprite;
  /** Scale after `setSize` fitted the dot — `#advanceEmbers` multiplies this,
   * same contract (and same found bug) as `Flash.baseScaleX/Y`. */
  readonly baseScale: number;
  /** Milliseconds until it starts — the same stagger the hex's own flash uses. */
  delayMs: number;
  elapsedMs: number;
  readonly lifeMs: number;
  readonly startX: number;
  readonly startY: number;
  readonly driftX: number;
  readonly driftY: number;
  readonly sinkPx: number;
  readonly peak: number;
};

export class PixiRenderer implements Renderer {
  #app: Application | null = null;
  readonly #cells = new Container();
  readonly #fx = new Container();
  readonly #vignette = new Container();

  #view: BoardView = { cells: [], targetHex: null };
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
  /**
   * The un-zoomed fit (extent + size) from the last draw where it was
   * actually recomputed, and the screen size it was computed FOR — see
   * `#frontierFit` for why this is not simply "the last fit".
   */
  #frontierFit: Layout | null = null;
  #frontierFor: { readonly w: number; readonly h: number } | null = null;
  #panX = 0;
  #panY = 0;
  /** Pending settle: lay the board out at the size the gesture left it. */
  #zoomSettle: ReturnType<typeof setTimeout> | null = null;

  readonly #theme: Theme;
  #assets: AssetBook;
  readonly #surfaces = new SurfaceTextures();
  /**
   * Label textures, cached by what changes their pixels: the text, the
   * rounded font size, and which ink. `#drawLabel` used to create a fresh
   * Pixi Text per labelled cell per draw — a canvas rasterise and a GPU
   * upload each — for a vocabulary this small (worths and previews are small
   * ints, plus five landmark glyphs). Sprites share the cached texture, and
   * the per-draw teardown (`destroy({ children: true })`) does NOT destroy a
   * child sprite's texture — pixi v8 only touches it under `texture: true`,
   * verified in Sprite.destroy — so the cache owns them outright. Evicted
   * beside the surface cache whenever the size settles (`#evictStale`).
   */
  readonly #labels = new BakedCache<Texture>((texture) => {
    texture.destroy(true);
  });
  /** Keys drawn last frame, so a tap is a set lookup, not a linear scan. */
  #drawnKeys: ReadonlySet<HexKey> = new Set();
  #flashTexture: Texture | null = null;
  #vignetteKey = '';
  /** The one vignette sprite currently baked, so its alpha can be nudged by
   * `#vignetteFactor` every draw without rebaking the gradient underneath it. */
  #vignetteSprite: Sprite | null = null;
  #flashes: Flash[] = [];

  /**
   * The camera in flight (Marc, 2026-08-20: "when we automatically need to
   * zoom in or out — new shrine pops, here/fit — do a transition instead of
   * being instantaneous").
   *
   * Only ever set by the moves the GAME makes on the player's behalf. A
   * pinch, a drag and a wheel stay instant forever: they follow a finger, and
   * a finger that its board lags behind reads as broken, not as smooth.
   */
  #camera: {
    readonly fromZoom: number;
    readonly toZoom: number;
    readonly fromPanX: number;
    readonly toPanX: number;
    readonly fromPanY: number;
    readonly toPanY: number;
    elapsed: number;
    readonly ms: number;
  } | null = null;

  /**
   * The refit softener: how much to scale the board by ON TOP of `#zoom`,
   * easing back to 1.
   *
   * At FIT the layout is recomputed from the full extent every draw, so the
   * placement that first reveals a distant beacon shrinks the entire board in
   * one frame — the automatic zoom-out Marc named. Rather than tween the
   * layout itself (every cached texture is keyed by its pixel size), the
   * board keeps drawing at the size it HAD and eases to the size it now
   * wants: `#refitEase` starts at oldSize/newSize and walks to 1.
   */
  #refitEase = 1;
  #refitFrom = 1;
  #refitElapsed = 0;

  /**
   * The ember pool. `#emberFree` holds recycled sprites ready to be reused —
   * checked before `#acquireEmber` ever creates a new one — and
   * `#emberSpriteCount` is the running total ever created, capped at
   * `EMBER_CAP`. The same shape as `#labels`' cache-by-what-changes-the-pixels
   * discipline, applied to a moving sprite instead of a baked texture: create
   * once, reuse forever, never per pop.
   */
  #embersActive: Ember[] = [];
  #emberFree: Sprite[] = [];
  #emberSpriteCount = 0;
  #emberTexture: Texture | null = null;

  /**
   * Beacon halos: a soft additive glow, breathing slowly, over every
   * unrevealed destination in range. Kept keyed by cell rather than rebuilt
   * with `#cells` every draw — `#cells` is torn down wholesale on every
   * action, but the breath has to keep going between actions too, so the
   * sprites live beside the flashes in `#fx` (already ticked every frame)
   * and `draw()` only adds, moves and removes them.
   */
  readonly #beacons = new Map<HexKey, { readonly sprite: Sprite; readonly peak: number }>();
  #beaconClock = 0;

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
      // CAPPED at 2 (2026-08-19, the iOS crash hunt): a DPR-3 phone was
      // rendering 2.25× the pixels of DPR 2 for sharpness nobody can see at
      // arm's length, and iOS reclaims WebGL contexts under exactly that
      // kind of GPU memory pressure — the leading suspect for Marc's
      // "please reload" storms. Every texture bake keys off this same value
      // through the renderer, so the cap halves texture memory too.
      resolution: Math.min(2, window.devicePixelRatio),
      autoDensity: true,
    });

    host.appendChild(app.canvas);
    app.stage.addChild(this.#cells, this.#fx, this.#vignette);
    this.#app = app;

    // WebGL context loss (the same hunt): iOS drops contexts under memory
    // pressure and fires `webglcontextlost` — calling preventDefault is
    // what OPTS IN to restoration, and without it the canvas stays dead
    // and every later frame throws into the error overlay. On restore,
    // every baked texture is stale GPU state: drop the caches whole and
    // draw the current view again — the surfaces re-bake on demand, which
    // is the same path a theme's first frame already takes.
    app.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
    });
    app.canvas.addEventListener('webglcontextrestored', () => {
      // Every sprite that OUTLIVES a draw goes first — flashes, and the
      // beacons that share the flash texture — because a sprite over a
      // destroyed texture is the captured alphaMode crash all over again.
      // The redraw below resyncs the beacons onto a fresh bake.
      this.#clearFlashes();
      for (const { sprite } of this.#beacons.values()) sprite.destroy();
      this.#beacons.clear();
      this.#surfaces.clear();
      this.#labels.clear();
      this.#flashTexture?.destroy(true);
      this.#flashTexture = null;
      this.#emberTexture?.destroy(true);
      this.#emberTexture = null;
      this.draw(this.#view);
    });

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
    // this fires for rotation and for the URL bar collapsing on scroll — but it
    // ALSO fires for every ordinary reflow of the controls beside the board (a
    // harvest button appearing or hiding, a hint line wrapping to a second line,
    // the very toast a pop itself shows), because the host is a flex child whose
    // box shrinks and grows with its siblings. `#clearFlashes` used to run on
    // every one of those too — found by driving a real browser and watching a
    // freshly spawned pop's flash and embers vanish before the next frame,
    // wiped by the ResizeObserver its own toast had just triggered. Flashes now
    // only drop on a true window-level resize (rotation, the URL bar), which
    // `onResize` below cannot tell apart from a sibling's reflow on its own.
    const onResize = (): void => {
      this.draw(this.#view);
      this.#safeEvict();
    };
    const onWindowResize = (): void => {
      // Flashes are positioned in the layout that was current when they were
      // spawned, so a rotation mid-harvest would leave them burning over the
      // wrong hexes. They last a third of a second; dropping them is right.
      this.#clearFlashes();
    };
    const onTick = (ticker: Ticker): void => {
      this.#advanceCamera(ticker.deltaMS);
      this.#advanceFlashes(ticker.deltaMS);
      this.#advanceEmbers(ticker.deltaMS);
      this.#advanceBeacons(ticker.deltaMS);
    };

    app.renderer.on('resize', onResize);
    window.addEventListener('resize', onWindowResize);
    app.ticker.add(onTick);
    this.#detach = () => {
      observer?.disconnect();
      app.renderer.off('resize', onResize);
      window.removeEventListener('resize', onWindowResize);
      app.ticker.remove(onTick);
    };

    this.draw(this.#view);
  }

  draw(view: BoardView): void {
    const previous = this.#view;
    this.#view = view;
    // Rebuilt before any early return, so hitTest always answers about the
    // view it was handed — the same contract the old linear scan kept.
    const keys = new Set<HexKey>();
    for (const cell of view.cells) keys.add(cell.key);
    this.#drawnKeys = keys;

    const app = this.#app;
    if (app === null) return;

    this.#cells.removeChildren().forEach((c) => {
      c.destroy({ children: true });
    });
    if (view.cells.length === 0) return;

    const w = app.screen.width;
    const h = app.screen.height;
    // The frontier fix (Stage 2, WORKPLAN.md's "fit recomputes every draw"):
    // recomputing the extent from the full cell set on every draw is right
    // AT fit — the whole point of FIT is to keep showing everything as the
    // board grows — and wrong once zoomed in. A placement, or a beacon
    // drifting into beacon-horizon range, nudges the extent every draw; that
    // nudge gets multiplied by the zoom, which reads as the world sliding
    // under a camera that never moved rather than as the camera being asked
    // to move. Past FIT the frontier — the extent `fit` was last computed
    // against — is held still until the screen itself resizes (rotation) or
    // the camera returns to FIT, where a fresh extent is exactly what
    // "everything" has to mean.
    const dimsChanged =
      this.#frontierFor === null || this.#frontierFor.w !== w || this.#frontierFor.h !== h;
    const fit =
      this.#zoom <= 1 || this.#frontierFit === null || dimsChanged
        ? fitLayout(view.cells, w, h, 10, this.#theme.orientation)
        : this.#frontierFit;
    if (this.#zoom <= 1 || dimsChanged) {
      this.#frontierFit = fit;
      this.#frontierFor = { w, h };
    }

    // The automatic zoom-out, softened (2026-08-20). At FIT the extent is
    // recomputed every draw, so the placement that first reveals a distant
    // beacon shrinks the whole board between one frame and the next. Keep
    // drawing at the size it HAD and let `#advanceCamera` walk the difference
    // back to 1. Guarded three ways: only at FIT (past it the frontier is
    // held still and there is nothing to soften), only for a real change (a
    // rounding wobble is not a zoom-out), and never under reduced motion or
    // on the first draw, where there is no previous size to ease FROM.
    if (
      !this.#reducedMotion &&
      this.#fitSize > 0 &&
      fit.size > 0 &&
      this.#zoom <= 1 &&
      !dimsChanged &&
      Math.abs(fit.size - this.#fitSize) / this.#fitSize > REFIT_SLOP
    ) {
      this.#refitFrom = (this.#refitEase * this.#fitSize) / fit.size;
      this.#refitEase = this.#refitFrom;
      this.#refitElapsed = 0;
    }
    this.#fitSize = fit.size;
    // The board is laid out at the zoom it is being shown at, so the
    // container transform is identity again until the next camera flight.
    this.#drawnZoom = this.#zoom * this.#refitEase;
    const layout = zoomLayout(fit, this.#drawnZoom, w / 2, h / 2);
    this.#layout = layout;
    if (layout.size <= 0) return;

    for (const cell of view.cells) this.#cells.addChild(this.#drawCell(cell, layout));

    this.#syncBeacons(view.cells, layout);
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

    // TRANSFORMED, not rebuilt (2026-08-21). A pinch delivers a `zoomBy` per
    // pointer event — 60 to 120 a second — and this used to coalesce them to
    // one full board teardown per FRAME, which was still a teardown per
    // frame: at reach 20 that is thousands of display objects rebuilt while
    // a finger is moving, plus a fresh texture bake at every integer pixel
    // size the pinch crosses. Scaling the containers follows the finger for
    // free and keeps the flashes, which scale with the board they are on.
    //
    // The board re-lays out when the gesture SETTLES, below — which is also
    // the moment the labels go sharp again, and the only moment that needs
    // to be exact.
    this.#applyPan();

    // The settle: lay the board out at the size the finger left it, then drop
    // the textures no size is drawing any more. Short enough to feel like the
    // picture sharpening as the gesture ends rather than a second beat, and
    // long enough that a pinch made of many small steps only pays once.
    //
    // The surface and label caches key on rounded pixel size, so before the
    // transform pinch above this was the ONLY cleaner for a gesture that
    // could bake a texture set at every integer size it crossed. Now the
    // gesture bakes exactly one — this one.
    if (this.#zoomSettle !== null) clearTimeout(this.#zoomSettle);
    this.#zoomSettle = setTimeout(() => {
      this.#zoomSettle = null;
      this.draw(this.#view);
      this.#safeEvict();
    }, 140);
  }

  /**
   * Evict ONLY when no flash is alive — THE captured iOS crash (2026-08-19,
   * Marc's overlay screenshot: `t.alphaMode` on null, at a pop). The chain:
   * a pop spawns flash sprites holding the current textures AND its own
   * card reflows the controls; the ResizeObserver fires, the redraw lands
   * on a slightly different layout size, and eviction then destroyed the
   * OLD size's textures — under sprites that Session 25 deliberately keeps
   * alive across sibling reflows. A sprite whose texture is destroyed takes
   * Pixi's whole instruction build down with it, every frame. So: while
   * anything is still burning, defer; the cascade is under two seconds and
   * the eviction was never urgent.
   */
  #safeEvict(): void {
    if (this.#flashes.length > 0) {
      if (this.#zoomSettle !== null) clearTimeout(this.#zoomSettle);
      this.#zoomSettle = setTimeout(() => {
        this.#zoomSettle = null;
        this.#safeEvict();
      }, 400);
      return;
    }
    this.#evictStale();
  }

  /**
   * Drop the textures baked for sizes nobody is drawing at any more — the
   * surfaces and the labels together, keyed by the same settled size, so the
   * two caches cannot drift apart in what they consider current. Callers go
   * through `#safeEvict`; only `destroy` and the context-restore path (which
   * both clear the flashes first) may call this directly.
   */
  #evictStale(): void {
    const size = this.#layout?.size ?? 0;
    this.#surfaces.evictExcept(size, this.#theme.orientation);
    this.#labels.evictExcept(`${labelPx(size)}:`);
  }

  /*
   * `#queueDraw` lived here until 2026-08-21: one coalesced full redraw per
   * animation frame, for every camera move that asked. It was the right
   * answer to the wrong question — no camera move needs a redraw at all now
   * that pinch and flight both scale the containers instead, and coalescing
   * a teardown per frame is still a teardown per frame. Deleted rather than
   * left for a caller that no longer exists.
   */

  panBy(dx: number, dy: number): void {
    // A drag is the one camera move that must never be smoothed, and it also
    // OUTRANKS one in flight: a finger on the board is the player taking the
    // camera back, and a tween still walking toward HERE would fight it.
    this.#camera = null;
    this.#panX += dx;
    this.#panY += dy;
    this.#applyPan();
  }

  /**
   * Ease-in-out, the shape a camera should move in: it starts from rest and
   * arrives at rest, so nothing on screen ever changes speed abruptly.
   */
  static #ease(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  /**
   * Drive whatever the game asked the camera to do, and settle the board back
   * to its true fit size. Both are no-ops on the overwhelming majority of
   * frames, which is why they can sit unconditionally on the ticker.
   */
  #advanceCamera(deltaMS: number): void {
    let moving = false;
    // True on the frame a flight or a refit REACHES its destination, which is
    // the only frame that lays the board out again.
    let landed = false;

    const move = this.#camera;
    if (move !== null) {
      move.elapsed += deltaMS;
      const t = Math.min(1, move.elapsed / move.ms);
      const e = PixiRenderer.#ease(t);
      // Zoom travels geometrically — a camera going 1× → 4× should spend as
      // long on 1→2 as on 2→4, or the second half arrives in a rush.
      this.#zoom = move.fromZoom * (move.toZoom / move.fromZoom) ** e;
      this.#panX = move.fromPanX + (move.toPanX - move.fromPanX) * e;
      this.#panY = move.fromPanY + (move.toPanY - move.fromPanY) * e;
      moving = true;
      if (t >= 1) {
        this.#camera = null;
        landed = true;
      }
    }

    if (this.#refitEase !== 1) {
      this.#refitElapsed += deltaMS;
      const t = Math.min(1, this.#refitElapsed / REFIT_MS);
      const e = PixiRenderer.#ease(t);
      this.#refitEase = this.#refitFrom * (1 / this.#refitFrom) ** e;
      moving = true;
      if (t >= 1) {
        this.#refitEase = 1;
        landed = true;
      }
    }

    // NOTHING is rebuilt in flight (2026-08-21). A camera move does not
    // change what the board is, only how big it looks, so both containers
    // are scaled and the layout is left alone — flashes and embers included,
    // which scale with the board they belong to. `draw()` runs exactly once,
    // on landing, where the caches bake one size instead of every integer
    // size the flight passed through.
    if (moving) this.#applyPan();
    if (landed) {
      this.draw(this.#view);
      // Only now: the caches hold the sizes this flight passed through, and
      // one landing pays for the whole journey instead of every frame of it.
      this.#safeEvict();
    }
  }

  /**
   * Send the camera somewhere, over time. The one entry point for every move
   * the GAME makes — HERE, FIT, and the pan that shows what a POP just did.
   *
   * Reduced motion arrives instantly, as everywhere else in this file: the
   * setting asks for no movement, and a camera is the largest movement there
   * is. An already-running tween is replaced rather than queued, so tapping
   * the camera button twice does not play two journeys end to end.
   */
  #flyTo(zoom: number, panX: number, panY: number): void {
    const toZoom = Math.min(this.#zoomMax(), Math.max(ZOOM_MIN, zoom));
    if (this.#reducedMotion) {
      this.#camera = null;
      this.#zoom = toZoom;
      this.#panX = panX;
      this.#panY = panY;
      this.#clearFlashes();
      this.draw(this.#view);
      this.#safeEvict();
      return;
    }
    this.#camera = {
      fromZoom: this.#zoom,
      toZoom,
      fromPanX: this.#panX,
      toPanX: panX,
      fromPanY: this.#panY,
      toPanY: panY,
      elapsed: 0,
      ms: CAMERA_MS,
    };
  }

  /**
   * Zoom in on one hex — HERE, and the POP that wants to show its own pocket.
   * The pan is computed against the layout THIS zoom will produce, not the
   * one on screen now, or the hex lands off centre by exactly the difference.
   */
  flyToHex(hex: HexKey, zoom: number): void {
    const app = this.#app;
    const fit = this.#frontierFit ?? this.#layout;
    if (app === null || fit === null) return;
    const target = Math.min(this.#zoomMax(), Math.max(ZOOM_MIN, zoom));
    const w = app.screen.width;
    const h = app.screen.height;
    const { x, y } = place(parse(hex), zoomLayout(fit, target, w / 2, h / 2));
    this.#flyTo(target, w / 2 - x, h / 2 - y);
  }

  /** Back out to FIT, over time. The other half of the camera button. */
  flyToFit(): void {
    this.#flyTo(1, 0, 0);
  }

  /**
   * Pan only — zoom is untouched — so `hex` lands at screen centre. Same
   * translation-only cost as `panBy` (no rebuild): find where the hex sits
   * in the CURRENT layout and set the pan that puts it in the middle,
   * clamped by the same rule every other pan obeys.
   */
  centerOn(hex: HexKey): void {
    const app = this.#app;
    const layout = this.#layout;
    if (app === null || layout === null) return;
    const { x, y } = place(parse(hex), layout);
    this.#panX = app.screen.width / 2 - x;
    this.#panY = app.screen.height / 2 - y;
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
  /**
   * The visual scale the drawn layout is being shown at: 1 whenever the board
   * was laid out at the zoom it is currently displaying, and something else
   * only while a camera move is in flight.
   *
   * This is what makes a flown camera affordable (2026-08-21). The tween
   * shipped on 2026-08-20 called `draw()` on every frame it changed zoom, and
   * `draw()` destroys and rebuilds every cell: at reach 20 that is ~3000
   * display objects and well over a thousand `Graphics` per frame, so a
   * 320ms flight rendered about three of its nineteen frames and read as a
   * jump cut with the input frozen. Worse, the surface and label caches key
   * on ROUNDED PIXEL SIZE, so a flight from fit to the ceiling baked a fresh
   * texture set at every integer size it passed through — hundreds of canvas
   * bakes and render-to-texture round-trips inside a third of a second, on
   * exactly the phones least able to afford them.
   *
   * A camera move does not change what the board IS, only how big it looks,
   * and that is a container transform. So the flight scales the two board
   * containers and lays out exactly once, on landing.
   */
  #drawnZoom = 1;

  #applyPan(): void {
    const app = this.#app;
    if (app === null) return;

    const maxX = (app.screen.width / 2) * this.#zoom;
    const maxY = (app.screen.height / 2) * this.#zoom;
    this.#panX = Math.min(maxX, Math.max(-maxX, this.#panX));
    this.#panY = Math.min(maxY, Math.max(-maxY, this.#panY));

    // `zoomLayout` centres the board on the screen's middle, so the drawn
    // layout's own centre is at (w/2, h/2) in container space — which makes
    // that the point the scale has to pivot around for the hex under the
    // middle of the screen to stay under it.
    const scale = (this.#zoom * this.#refitEase) / this.#drawnZoom;
    const cx = app.screen.width / 2;
    const cy = app.screen.height / 2;
    const x = this.#panX + cx * (1 - scale);
    const y = this.#panY + cy * (1 - scale);

    this.#cells.scale.set(scale);
    this.#fx.scale.set(scale);
    this.#cells.position.set(x, y);
    this.#fx.position.set(x, y);
  }

  /**
   * Answered from the SAME layout the last frame was drawn with, rather than
   * recomputed. A board that moved on resize between the draw and the tap would
   * otherwise place a tile somewhere the player never touched.
   */
  hitTest(x: number, y: number): HexKey | null {
    const layout = this.#layout;
    if (layout === null) return null;

    // The pan is a container translation the layout knows nothing about, and
    // since 2026-08-21 a camera in flight adds a SCALE on top of it — so the
    // tap is put back into the drawn layout's own space by undoing both,
    // read off the container rather than recomputed, so there is one source
    // of truth for where the board actually is.
    const scale = this.#cells.scale.x || 1;
    const h = hexAt(
      (x - this.#cells.position.x) / scale,
      (y - this.#cells.position.y) / scale,
      layout,
    );
    const k = key(h.q, h.r);
    return this.#drawnKeys.has(k) ? k : null;
  }

  /**
   * The story, drawn (`ideas/endless-world.md`): a small portrait of the
   * board exactly as it currently sits — camera, pan, the last thing on
   * screen — captured once at the ended transition and never again.
   *
   * `extract.canvas` is asked for the SCALED-DOWN resolution directly
   * (`resolution`, below), rather than raster-then-downscale: cheaper, and it
   * means the temporary render target it builds internally is never larger
   * than the thumbnail actually needs. `clearColor` fills the theme's own
   * board background — the stage has no background layer of its own (the
   * canvas clear colour usually does that job), so an unfilled extraction
   * would otherwise come back transparent and the thumbnail would show
   * whatever sits behind it on the end screen instead of the board's own
   * dark.
   *
   * Pixi's own `canvas()` destroys the temporary texture it builds
   * internally before returning (`ExtractSystem.canvas`, verified against
   * the installed package) — "destroy the extract texture immediately" is
   * already the library's own contract here, not something this method has
   * to do again.
   *
   * `null` whenever nothing is mounted, extraction throws (a context lost
   * mid-run, say), or the resulting canvas has no `toDataURL` — happy-dom's
   * stub renderer never reaches this file at all, so the guard is for a real
   * browser missing a piece of the canvas API, not for tests.
   */
  snapshot(maxPx: number): string | null {
    const app = this.#app;
    if (app === null) return null;

    const w = app.screen.width;
    const h = app.screen.height;
    if (!(w > 0) || !(h > 0)) return null;

    const resolution = Math.min(1, maxPx / Math.max(w, h));

    try {
      const canvas = app.renderer.extract.canvas({
        target: app.stage,
        resolution,
        clearColor: this.#theme.board.background,
      });
      if (typeof canvas.toDataURL !== 'function') return null;
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.#detach?.();
    this.#detach = null;
    this.#clearFlashes();
    for (const { sprite } of this.#beacons.values()) sprite.destroy();
    this.#beacons.clear();
    for (const sprite of this.#emberFree) sprite.destroy();
    this.#emberFree = [];
    this.#emberSpriteCount = 0;
    this.#surfaces.destroy();
    this.#labels.clear();
    this.#flashTexture?.destroy(true);
    this.#flashTexture = null;
    this.#emberTexture?.destroy(true);
    this.#emberTexture = null;
    this.#app?.destroy(true, { children: true });
    this.#app = null;
    this.#layout = null;
  }

  // ---------------------------------------------------------------- cells

  /**
   * A ground's surface plus, for a native field the terrain slot has art
   * for, the ghost to composite over it (2026-08-20's `fieldGround`,
   * `@theme/tokens`). Almost every cell has no ghost — `null` there is the
   * whole rest of the board, unchanged.
   */
  #surfaceFor(cell: CellView): {
    readonly surface: Surface;
    readonly ghost: { readonly asset: AssetId; readonly alpha: number } | null;
  } {
    const theme = this.#theme;
    const plain = (surface: Surface): { surface: Surface; ghost: null } => ({
      surface,
      ghost: null,
    });
    switch (cell.kind) {
      case 'wall':
        return plain(theme.wall);
      case 'stone':
        return plain(theme.stone);
      case 'landmark': {
        // A hidden find's shimmer: the same glow vocabulary, quieter, and
        // saying strictly less — accent dots at low alpha, no glyph, no
        // outline. The player learns that SOMETHING is near, and that is the
        // whole message the sense upgrade sells.
        if (cell.shimmer) {
          return plain({
            ...theme.wall,
            pattern: {
              kind: 'dots' as const,
              ink: theme.ink.accent,
              alpha: 0.22,
              radius: 1.6,
              pitch: 5,
            },
            alpha: 0.3,
          });
        }
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
        return plain(cell.beacon ? { ...base, alpha: 0.55 } : base);
      }
      case 'empty': {
        // Native ground (2026-08-20: `fieldGround` owns the WHOLE decision,
        // not just the pattern — the gallery draws from the same function,
        // so the workbench and the board cannot disagree). With the
        // terrain slot's own art loaded, the ground is `theme.empty` plus
        // that PNG ghosted over it; without, it is the procedural texture
        // fields have always worn, now carrying the terrain's overlay too.
        if (cell.native !== null) {
          const assetId = theme.terrain[cell.native].asset;
          const hasArt = assetId !== null && this.#assets.has(assetId);
          const ground = fieldGround(theme, cell.native, hasArt);
          return ground.kind === 'art'
            ? { surface: ground.base, ghost: { asset: ground.asset, alpha: ground.ghostAlpha } }
            : plain(ground.surface);
        }
        return plain(theme.empty);
      }
      case 'tile':
        // A `tile` with no colour cannot happen — `view.ts` sets colour on every
        // tile — but the view type permits it, and a board that silently vanishes
        // is worse than one that shows stone.
        return plain(cell.colour === null ? theme.stone : theme.terrain[cell.colour]);
    }
  }

  /**
   * Ground beats plain baked ground: real art for a cell's own surface
   * beats the procedural bake exactly as before; a native field's ghost
   * (`ghost`, non-null only from the `'empty'` branch above) rides the
   * SAME baked-and-cached path with the terrain PNG composited in, resolved
   * to a plain drawable via `AssetBook#image` since a 2D canvas cannot draw
   * a GPU-resident Pixi texture. If that resolution fails — the slot's
   * texture has not finished loading, or its resource is a kind `bake.ts`
   * cannot draw — the field falls back to its plain baked ground rather
   * than drawing nothing.
   */
  #groundTexture(
    surface: Surface,
    ghost: { readonly asset: AssetId; readonly alpha: number } | null,
    layout: Layout,
  ): Texture | null {
    if (ghost !== null) {
      const image = this.#assets.image(ghost.asset);
      if (image !== null) {
        return this.#surfaces.get(surface, layout.size, layout.orientation, {
          id: ghost.asset,
          image,
          alpha: ghost.alpha,
        });
      }
    }
    const art = this.#assets.get(surface.asset);
    return art ?? this.#surfaces.get(surface, layout.size, layout.orientation);
  }

  #drawCell(cell: CellView, layout: Layout): Container {
    const theme = this.#theme;
    const group = new Container();
    const { x, y } = place(cell, layout);
    const { surface, ghost } = this.#surfaceFor(cell);

    const texture = this.#groundTexture(surface, ghost, layout);

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
      // A LENSED memory cell brightens past the fog (Marc, Day 2: "the lit
      // shape is subtle") — the biome being studied rises toward live
      // brightness while everything else in the fog steps back, so the
      // known extent reads as one lit shape, not merely a less-dim one.
      const fogAlpha = cell.lensed
        ? Math.min(1, this.#theme.fog.alpha * 1.9)
        : this.#theme.fog.alpha;
      sprite.alpha = surface.alpha * (cell.dimmed ? 0.25 : 1) * (cell.remembered ? fogAlpha : 1);
      // The torch. Tint rather than alpha, because dropping alpha would show
      // the page through the board and turn distance into holes; tinting
      // toward the board's own dark reads as light falling away from you.
      // Height rides on the same channel: a hex a band higher catches a little
      // more of the light, which is what makes contours visible at all.
      if (cell.light < 1 || cell.band > 0 || cell.remembered) {
        const lift = 1 + cell.band * BAND_LIFT;
        let tint = mix(this.#theme.board.background, 0xffffff, Math.min(1, cell.light * lift));
        // The fog veil (2026-08-18; promoted to a theme token 2026-08-19 —
        // see `Theme.fog`'s own doc): the alpha drop alone left every colour
        // and every hue intact, just faint — a dark version of the real
        // thing rather than a memory of it. Mixing the whole sprite further
        // toward the board's own background flattens the hue too, on top of
        // the dimming above, which is the procedural floor `fog.soft` (an
        // empty slot) would otherwise be doing.
        if (cell.remembered) tint = mix(tint, this.#theme.board.background, this.#theme.fog.veil);
        sprite.tint = tint;
      }
      group.addChild(sprite);
    }

    /**
     * The landmark plinth (2026-08-18): wall-texture-plus-dots read as a
     * speckle, not a THING. An unclaimed, on-board destination gets an
     * inset base of its own — darker than the ground it sits on, with a
     * crisp rim in the accent at low alpha — so it reads as something BUILT
     * standing on the plane before the glyph is even drawn. A beacon has no
     * ground to stand on yet (it glows through fog that has not grown), a
     * shimmer must say nothing at all, and a claimed landmark goes quiet —
     * the existing stone treatment already carries that, so it gets no
     * plinth and keeps its plain edge.
     */
    if (
      cell.kind === 'landmark' &&
      !cell.claimed &&
      !cell.beacon &&
      !cell.shimmer &&
      layout.size > 6
    ) {
      const plinth = corners(x, y, layout.size * 0.62, layout.orientation);
      group.addChild(
        new Graphics()
          .poly(plinth)
          .fill({ color: mix(theme.wall.fill, 0x000000, 0.35), alpha: 0.6 })
          .stroke({ width: Math.max(1, layout.size * 0.05), color: theme.ink.accent, alpha: 0.35 }),
      );
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
     *
     * Outline-forward (2026-08-18): the fill alone read as a smudge — a
     * second, fainter sprite at a flat colour, indistinguishable from "this
     * hex is slightly wrong". A stroke in the HELD TILE'S OWN colour, at a
     * decent alpha, says PROPOSED — the shape of what would land, without
     * pretending it already has — and the fill drops further so the stroke
     * is what carries the promise.
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
        over.alpha = theme.ghost.alpha * 0.55;
        group.addChild(over);
      }

      const proposed =
        cell.previewColour !== null ? theme.terrain[cell.previewColour].fill : theme.ink.accent;
      group.addChild(
        new Graphics()
          .poly(corners(x, y, layout.size * (1 - theme.ghost.inset), layout.orientation))
          .stroke({
            width: Math.max(1.5, layout.size * theme.board.ripeEdgeWidth * 0.8),
            color: proposed,
            alpha: 0.75,
            alignment: 1,
          }),
      );
    }

    // Contours (2026-08-18): a hex that sits higher than the board's floor
    // used to get a light rim on ALL SIX edges at one flat alpha — noise
    // where it read at all, since a slope has no single side under a stroke
    // that treats every edge the same. Only the three edges that face the
    // torch get the light rim now; the three that face away get a quieter
    // dark rim instead, so the hex has a lit side and a shadowed one, the
    // way an actual step would. `EDGE_LIGHT`/`EDGE_SHADE` pick the subsets
    // by orientation; cosmetic by Marc's decision — nothing in the rules has
    // ever heard of height.
    if (cell.band > 0 && layout.size > 8 && !cell.remembered) {
      const pts = corners(x, y, layout.size * (1 - surface.inset), layout.orientation);
      const width = Math.max(0.5, layout.size * 0.045);
      const rim = (edges: readonly number[], color: number, alpha: number): void => {
        const g = new Graphics();
        for (const i of edges) {
          const a = i * 2;
          const b = ((i + 1) % 6) * 2;
          g.moveTo(pts[a] ?? 0, pts[a + 1] ?? 0).lineTo(pts[b] ?? 0, pts[b + 1] ?? 0);
        }
        g.stroke({ width, color, alpha, alignment: 1 });
        group.addChild(g);
      };
      rim(
        EDGE_LIGHT[layout.orientation],
        mix(this.#theme.board.background, 0xffffff, 0.55),
        0.16 * cell.band * cell.light,
      );
      rim(
        EDGE_SHADE[layout.orientation],
        mix(this.#theme.board.background, 0x000000, 0.5),
        0.08 * cell.band * cell.light,
      );
    }

    const stroke = this.#strokeFor(cell, layout.size);
    if (stroke !== null) {
      const inset = surface.inset;
      const edge = new Graphics()
        .poly(corners(x, y, layout.size * (1 - inset), layout.orientation))
        .stroke({ width: stroke.width, color: stroke.colour, alignment: 0.5 });
      // The edge steps back WITH its cell (fresh-eyes, 2026-08-20): the
      // surface sprite already dims to 0.25 under the colour lens, and an
      // undimmed stroke over a dimmed cell left the fog full of bright
      // empty outlines — brighter than before the lens, and unreadable.
      edge.alpha = cell.dimmed ? 0.25 : 1;
      group.addChild(edge);
    }

    /**
     * The rare mark (2026-08-19, Marc: "make sure unique and magic are
     * identified on the map too, clearly, after placed"): the quiet accent
     * edge was the only sign, and it vanishes into a full board. A placed
     * rare tile now wears a star above its centre — four points for MAGIC,
     * five and larger for UNIQUE — on a small disc of the board's own dark
     * so the accent reads on pale terrain. Geometry, not text, so it
     * survives FIT zoom where labels stay unreadable; offset upward so a
     * ripe tile's worth number keeps the centre. Same accent every theme
     * already has; wiring here, judged on the phone — nothing visual is
     * tested by this repository.
     */
    if (
      cell.kind === 'tile' &&
      cell.rarity !== null &&
      cell.rarity !== 'common' &&
      !cell.remembered &&
      layout.size > 3
    ) {
      const unique = cell.rarity === 'unique';
      // Floored like the labels (2026-08-19): far out, the star stops
      // shrinking with the hex and rides it like a pin — the whole point is
      // finding rares from a distance. In the rarity's OWN colour since
      // 2026-08-20 (Marc: "their own color") — the star, the card border
      // and the board edge all say the same word now.
      const r = Math.max(3, layout.size * (unique ? 0.22 : 0.18));
      const my = y - layout.size * 0.52;
      const mark = new Graphics()
        .circle(x, my, r * 1.3)
        .fill({ color: theme.board.background, alpha: 0.55 })
        .star(x, my, unique ? 5 : 4, r, r * (unique ? 0.5 : 0.42))
        .fill({ color: unique ? theme.ink.unique : theme.ink.magic, alpha: 0.95 });
      mark.alpha = cell.dimmed ? 0.25 : 1;
      group.addChild(mark);
    }

    // The 12px gate is gone (2026-08-19): it silenced every glyph and number
    // at exactly the zoom where "where is everything?" is the question being
    // asked. `labelPx`'s floor keeps the text legible instead of letting it
    // shrink into mush; only sub-3px hexes — where even a floored label is
    // paint noise over paint noise — stay wordless. Remembered ground stays
    // unlabelled EXCEPT its landmarks (same day, Marc's fog-memory call:
    // memory shows what it saw) — a remembered cache or site draws its
    // glyph faint, so walking back is an informed decision instead of a
    // guess. Remembered SHRINES and TERRITORIES draw at full strength
    // (Marc, 2026-08-20: "make them clearer, its hard to see" — they are
    // the two anchors a next run is oriented by, fixed per world by the
    // hash and remembered forever; see `#strokeFor`'s veiled edge too).
    const label = labelFor(cell);
    if (
      label !== null &&
      layout.size > 3 &&
      !cell.dimmed &&
      (!cell.remembered || cell.kind === 'landmark')
    ) {
      const anchor =
        cell.kind === 'landmark' && (cell.landmark === 'shrine' || cell.landmark === 'territory');
      group.addChild(
        this.#drawLabel(
          cell.remembered && !anchor ? { ...label, faint: true } : label,
          x,
          y,
          layout.size,
        ),
      );
    }

    return group;
  }

  #strokeFor(cell: CellView, size: number): { width: number; colour: number } | null {
    const board = this.#theme.board;
    // The lens outranks the MEMORY rules while it is held (Marc, Day 2:
    // "the lit shape is subtle") — a matching fog cell wears its colour's
    // own edge so the biome reads as one lit shape. Fog only, up here:
    // live tiles keep ripe/targeted louder and take their lensed edge
    // further down the ladder.
    if (cell.lensed && cell.remembered) {
      const own = cell.colour ?? cell.native;
      if (own !== null) {
        return {
          width: Math.max(1.5, size * board.edgeWidth * 1.5),
          colour: mix(this.#theme.terrain[own].fill, this.#theme.ink.ink, 0.45),
        };
      }
    }
    // Memory gets no outline at all — an edge would read as a live cell —
    // EXCEPT the two anchors a next run is oriented by (Marc, 2026-08-20:
    // "we know where shrines are and where territories are — make them
    // clearer, its hard to see"): a remembered shrine or territory wears
    // the accent veiled by the same fog the memory's paint is, so it reads
    // as a waypoint on a map rather than a live cell. Caches and sites
    // stay edgeless (they are stops, not anchors), and a find stays as
    // quiet in memory as it is everywhere else.
    if (cell.remembered) {
      if (
        cell.kind === 'landmark' &&
        (cell.landmark === 'shrine' || cell.landmark === 'territory')
      ) {
        // Half the fog's veil, not the whole of it (2026-08-20, second
        // pass — Marc: "i still dont see clearly"): at torchlit's 0.5
        // veil over 0.26-alpha ground the first cut read as one more
        // ghost. The edge sits closer to the live accent now, a touch
        // wider than ordinary chrome; the ghosted ground under it is
        // still what says "memory, not this run".
        return {
          width: Math.max(1.5, size * board.edgeWidth * 1.5),
          colour: mix(
            this.#theme.ink.accent,
            this.#theme.board.background,
            this.#theme.fog.veil * 0.5,
          ),
        };
      }
      return null;
    }
    // A shimmer is a rumour, not a landmark: no edge, no accent, no promise.
    if (cell.shimmer) return null;
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
    // The lens's positive half on LIVE tiles (Marc: "highlighted with
    // their respective color... distinct from the selected tiles were
    // about to play") — below ripe/targeted so the harvest decision stays
    // loudest; the fog half of the same rule sits at the ladder's top.
    if (cell.lensed) {
      const own = cell.colour ?? cell.native;
      if (own !== null) {
        return {
          width: Math.max(1.5, size * board.edgeWidth * 1.5),
          colour: mix(this.#theme.terrain[own].fill, this.#theme.ink.ink, 0.45),
        };
      }
    }
    // An unclaimed destination is the other thing worth walking toward, so it
    // carries the accent even at beacon distance. Claimed, it drops to chrome.
    if (cell.kind === 'landmark' && !cell.claimed)
      return { width: Math.max(1.5, size * board.ripeEdgeWidth), colour: this.#theme.ink.accent };
    // Magic and unique tiles keep a quiet edge in their OWN colour
    // (2026-08-20 — see `Ink.magic`/`Ink.unique`) so their power stays
    // findable on a full board without shouting over ripe.
    if (cell.kind === 'tile' && cell.rarity !== null && cell.rarity !== 'common')
      return {
        width: Math.max(1, size * board.edgeWidth * 1.5),
        colour: cell.rarity === 'unique' ? this.#theme.ink.unique : this.#theme.ink.magic,
      };
    if (cell.legal) return { width: Math.max(1, size * board.edgeWidth), colour: board.legalEdge };
    if (cell.kind === 'empty') return null;
    // Home (2026-08-19): the quietest permanent mark on the board, checked
    // last of all so it never wins against anything above it — a home cell
    // that ripens, gets targeted, or rolls rare wears THAT edge instead, and
    // goes back to its ring the moment the louder state ends.
    if (cell.home)
      return { width: Math.max(1, size * board.home.ringWidth), colour: board.home.ring };
    return { width: Math.max(1, size * board.edgeWidth), colour: board.edge };
  }

  #drawLabel(
    label: { text: string; faint: boolean },
    x: number,
    y: number,
    size: number,
  ): Container {
    const texture = this.#labelTexture(label, size);
    if (texture !== null) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      return sprite;
    }

    // No renderer to bake with — a state draw() cannot reach, but a label is
    // not worth crashing over. The old per-cell Text is the fallback.
    const text = this.#labelText(label, size);
    text.anchor.set(0.5);
    text.position.set(x, y);
    return text;
  }

  /** The Text a label draws as — one place, so the cache renders exactly it. */
  #labelText(label: { text: string; faint: boolean }, size: number): Text {
    return new Text({
      text: label.text,
      style: {
        fill: label.faint ? this.#theme.ink.inkFaint : this.#theme.ink.ink,
        fontSize: labelPx(size),
        fontFamily: this.#theme.type.display,
      },
    });
  }

  /** The cached texture for a label, rendered once per (text, size, ink). */
  #labelTexture(label: { text: string; faint: boolean }, size: number): Texture | null {
    const app = this.#app;
    if (app === null) return null;

    // A hard bound, defensively: the vocabulary is small by construction, so
    // growing past it means something is generating unbounded strings. The
    // old answer — `clear()` the whole cache and carry on — destroyed
    // textures that sprites added EARLIER IN THIS SAME DRAW still held,
    // which is the same species as the captured alphaMode crash. Now a full
    // cache simply stops caching: `null` sends the caller down its plain
    // per-sprite Text fallback (slower, never shared, perfectly safe), and
    // the settle-time eviction empties the cache without a live referent.
    if (this.#labels.size > 256) return null;

    const key = `${labelPx(size)}:${label.faint ? 'faint' : 'ink'}:${label.text}`;
    return this.#labels.get(key, () => {
      const text = this.#labelText(label, size);
      const texture = app.renderer.generateTexture(text);
      text.destroy(true);
      return texture;
    });
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
    if (previous.cells.length === 0) return;
    // A redraw of the SAME view has nothing to compare (2026-08-21). The
    // camera's landing draw is exactly that, and without this it walked
    // every cell three times, built a Set, a Map and an array, and found
    // nothing — the most expensive way to do nothing available.
    if (previous === next) return;

    const motion = this.#theme.motion;
    const texture = this.#flashTextureFor();
    if (texture === null) return;

    // The ripen pulse (Stage 2, 2026-08-18): one beat, the same glow the pop
    // already uses — reusing the visual language rather than inventing a
    // second one — on any tile that just became RIPE, whether it sat there
    // unripe a moment ago or arrived already surrounded. Checked BEFORE the
    // pop's own early return below, which is gated on something having BEEN
    // ripe — a placement with nothing ripe yet must not lose its own pulse
    // to a guard that has nothing to do with it.
    const ripeBefore = new Set<HexKey>();
    for (const cell of previous.cells) {
      if (cell.kind === 'tile' && cell.ripe) ripeBefore.add(cell.key);
    }
    for (const cell of next.cells) {
      if (cell.kind !== 'tile' || !cell.ripe || ripeBefore.has(cell.key)) continue;
      this.#spawnPulse(cell, layout, texture, motion);
    }

    // Key to colour, so the jump can wear the popped tile's own surface.
    const wasRipe = new Map<HexKey, CellView>();
    for (const cell of previous.cells) {
      if (cell.kind === 'tile' && cell.ripe) wasRipe.set(cell.key, cell);
    }
    if (wasRipe.size === 0) return;

    // Cascade order (2026-08-18): a 12-hex harvest used to stagger by object-key
    // order — a scatter, not a harvest. `previous.targetHex` is the pocket the
    // player actually tapped (or the default biggest pocket, when nothing was
    // tapped), from the frame just before this one popped, so sorting the
    // popped cells by hex distance from it makes the flash ripple outward from
    // the point of contact instead of from board-generation order. Falls back
    // to the existing board order when there is nothing to ripple from — a
    // stub renderer's synthetic frame, say — rather than guessing an origin.
    const popped = next.cells.filter((cell) => cell.kind === 'stone' && wasRipe.has(cell.key));
    const originKey = previous.targetHex;
    if (originKey !== null) {
      const origin = parse(originKey);
      popped.sort((a, b) => distance(a, origin) - distance(b, origin));
    }

    // The ember tint: the pop's own flash colour, pulled toward the theme's
    // accent — the fallback when a cell's colour is unknowable.
    const emberTint = mix(motion.popColour, this.#theme.ink.accent, 0.35);

    let index = 0;
    for (const cell of popped) {
      const { x, y } = place(cell, layout);

      // Each tile bursts in ITS OWN colour (Marc, Day 2: "it could pop or
      // have a little bit more arcade feel when popping with colors"):
      // the popped tile's fill, lifted toward white so it reads as light,
      // then a breath of the theme's flash so the cascade still belongs
      // to the direction. Glow, embers and the reduced-motion hold all
      // share it — a green pocket pops green, a tide pocket pops blue.
      const source = wasRipe.get(cell.key);
      const cellTint =
        source?.colour != null
          ? mix(mix(this.#theme.terrain[source.colour].fill, 0xffffff, 0.45), motion.popColour, 0.2)
          : emberTint;

      // Reduced motion is not NO FEEDBACK — that was the bug: the early
      // return above used to skip everything, so a harvest left the board
      // with no sign anything happened. These players get the same glow at a
      // fixed alpha, no jump, no scale, no stagger, gone after a beat. An
      // accessibility fix, not a feel change: the animated path below is
      // untouched.
      if (this.#reducedMotion) {
        const still = new Sprite(texture);
        still.anchor.set(0.5);
        still.position.set(x, y);
        still.setSize(layout.size * motion.popGlowScale, layout.size * motion.popGlowScale);
        // Additive (WORKPLAN Stage 4): the light-pool answering the burst
        // rather than a decal sitting on top of it — still no motion, still
        // gone after a beat, just warmer where it overlaps the ground under
        // it. Feedback deepened, not feedback added.
        still.blendMode = 'add';
        still.tint = cellTint;
        still.alpha = motion.popAlpha;
        this.#fx.addChild(still);
        this.#flashes.push({
          kind: 'hold',
          sprite: still,
          delayMs: 0,
          elapsedMs: 0,
          lifeMs: REDUCED_POP_MS,
          peak: motion.popAlpha,
          baseY: y,
          liftPx: 0,
          baseScaleX: still.scale.x,
          baseScaleY: still.scale.y,
        });
        continue;
      }

      const delayMs = index * motion.popStaggerMs;

      this.#spawnEmbers(x, y, layout, delayMs, cellTint);

      const glow = new Sprite(texture);
      glow.anchor.set(0.5);
      glow.position.set(x, y);
      glow.setSize(layout.size * motion.popGlowScale, layout.size * motion.popGlowScale);
      // Additive, same reasoning as the reduced-motion glow above: the burst
      // reads as light spilling onto the ground around it rather than a
      // sprite laid over it, and a cascade's glows stack brighter where they
      // overlap instead of just re-covering the same alpha.
      glow.blendMode = 'add';
      glow.tint = cellTint;
      glow.alpha = 0;
      this.#fx.addChild(glow);

      this.#flashes.push({
        kind: 'glow',
        sprite: glow,
        delayMs,
        elapsedMs: 0,
        lifeMs: motion.popMs,
        peak: motion.popAlpha,
        baseScaleX: glow.scale.x,
        baseScaleY: glow.scale.y,
        baseY: y,
        liftPx: 0,
      });

      // The tile itself leaps off its spot and falls away, leaving the stone
      // that is already drawn underneath. Same cached surface texture the board
      // uses, so the thing that jumps is exactly the thing that was there.
      if (motion.popLift > 0 && source !== undefined && source.colour !== null) {
        const surface = this.#theme.terrain[source.colour];
        const tileTexture =
          this.#assets.get(surface.asset) ??
          this.#surfaces.get(surface, layout.size, layout.orientation);
        if (tileTexture !== null) {
          const wide = layout.orientation === 'pointy' ? Math.sqrt(3) : 2;
          const tall = layout.orientation === 'pointy' ? 2 : Math.sqrt(3);

          // The cover: this cell's beat is `delayMs` away, and the board
          // has ALREADY repainted it as stone — deep in a long cascade
          // that was half a second of grey before anything moved (Marc,
          // 2026-08-20). The tile's own surface holds the colour, still
          // and opaque, until the jump takes over; at the bottom of the
          // fx layer so every glow and ember still lights over it.
          if (delayMs > 0) {
            const cover = new Sprite(tileTexture);
            cover.anchor.set(0.5);
            cover.position.set(x, y);
            cover.setSize(layout.size * wide, layout.size * tall);
            this.#fx.addChildAt(cover, 0);
            this.#flashes.push({
              kind: 'cover',
              sprite: cover,
              delayMs: 0,
              elapsedMs: 0,
              // One frame past the jump's own start, so the hand-off can
              // never show a gap of stone between the two sprites.
              lifeMs: delayMs + 17,
              peak: 1,
              baseY: y,
              liftPx: 0,
              baseScaleX: cover.scale.x,
              baseScaleY: cover.scale.y,
            });
          }

          const jumper = new Sprite(tileTexture);
          jumper.anchor.set(0.5);
          jumper.position.set(x, y);
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
            baseScaleX: jumper.scale.x,
            baseScaleY: jumper.scale.y,
          });
        }
      }

      index++;
    }
  }

  /**
   * One beat on a tile that just ripened — quieter and shorter than a pop's
   * glow (a pop is a reward; a ripen is information), and never staggered:
   * a placement ripens at most the handful of tiles it just surrounded, and
   * they light together, not in a queue. Reduced motion keeps the same
   * held-glow contract as the pop's own fallback: feedback without motion,
   * not no feedback.
   */
  #spawnPulse(cell: CellView, layout: Layout, texture: Texture, motion: Theme['motion']): void {
    const { x, y } = place(cell, layout);
    // Rides the pop's own light-spill dial at the same ratio the two sizes
    // (2.6 vs. 3.2) always had, rather than a second theme token for a glow
    // that only ever needs to stay proportionally smaller than the pop's.
    const size = layout.size * motion.popGlowScale * RIPEN_GLOW_RATIO;
    const peak = motion.popAlpha * 0.7;

    if (this.#reducedMotion) {
      const still = new Sprite(texture);
      still.anchor.set(0.5);
      still.position.set(x, y);
      still.setSize(size, size);
      still.blendMode = 'add';
      still.alpha = peak;
      this.#fx.addChild(still);
      this.#flashes.push({
        kind: 'hold',
        sprite: still,
        delayMs: 0,
        elapsedMs: 0,
        lifeMs: REDUCED_POP_MS,
        peak,
        baseY: y,
        liftPx: 0,
        baseScaleX: still.scale.x,
        baseScaleY: still.scale.y,
      });
      return;
    }

    const glow = new Sprite(texture);
    glow.anchor.set(0.5);
    glow.position.set(x, y);
    glow.setSize(size, size);
    glow.blendMode = 'add';
    glow.alpha = 0;
    this.#fx.addChild(glow);
    this.#flashes.push({
      kind: 'glow',
      sprite: glow,
      delayMs: 0,
      elapsedMs: 0,
      lifeMs: Math.round(motion.popMs * 0.6),
      peak,
      baseY: y,
      liftPx: 0,
      baseScaleX: glow.scale.x,
      baseScaleY: glow.scale.y,
    });
  }

  /**
   * Beacon halos, reconciled against the cells this draw actually has.
   *
   * A soft additive glow over every unrevealed destination in range — "a
   * lighthouse in fog, not a strobe": tinted by the destination's own colour
   * where it has one (a territory's field), the theme's accent otherwise,
   * the same fallback `#surfaceFor` already uses for a beacon's dots. Kept
   * as a diff (add / move / drop) rather than rebuilt, so the breath started
   * on an earlier draw keeps its phase instead of restarting every action.
   * A shimmer is never a beacon (`cell.beacon` is false for one) and gets no
   * halo at all — it has to stay clearly dimmer and vaguer than a promise.
   */
  #syncBeacons(cells: readonly CellView[], layout: Layout): void {
    const texture = this.#flashTextureFor();
    const seen = new Set<HexKey>();

    for (const cell of cells) {
      if (cell.kind !== 'landmark' || !cell.beacon || cell.claimed) continue;
      seen.add(cell.key);

      const { x, y } = place(cell, layout);
      const tint =
        cell.colour !== null ? this.#theme.terrain[cell.colour].fill : this.#theme.ink.accent;

      let entry = this.#beacons.get(cell.key);
      if (entry === undefined) {
        if (texture === null) continue;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        entry = { sprite, peak: 0.42 };
        this.#beacons.set(cell.key, entry);
        this.#fx.addChild(sprite);
        // Reduced motion: a fixed soft glow, no pulse — the same contract as
        // the pop's held fallback, feedback without motion rather than none.
        if (this.#reducedMotion) entry.sprite.alpha = entry.peak * 0.8;
      }
      entry.sprite.position.set(x, y);
      entry.sprite.setSize(layout.size * 2.4, layout.size * 2.4);
      entry.sprite.tint = tint;
    }

    for (const [k, entry] of this.#beacons) {
      if (seen.has(k)) continue;
      entry.sprite.destroy();
      this.#beacons.delete(k);
    }
  }

  /** The slow breath: skipped entirely under reduced motion, which keeps its
   * static alpha from `#syncBeacons` instead. */
  #advanceBeacons(deltaMs: number): void {
    if (this.#reducedMotion || this.#beacons.size === 0) return;
    this.#beaconClock = (this.#beaconClock + deltaMs) % BEACON_PULSE_MS;
    const wave = 0.5 + 0.5 * Math.sin((this.#beaconClock / BEACON_PULSE_MS) * Math.PI * 2);
    // Floor kept well above zero — dim, never dark, the same rule the torch
    // itself follows — so a beacon never reads as switched off mid-breath.
    for (const { sprite, peak } of this.#beacons.values()) {
      sprite.alpha = peak * (0.35 + 0.65 * wave);
    }
  }

  #clearFlashes(): void {
    for (const flash of this.#flashes) flash.sprite.destroy();
    this.#flashes = [];
    this.#resetEmbers();
  }

  /**
   * Return every live ember to the pool rather than destroying it — a
   * resize or a zoom happens far more often than a harvest, and a sprite
   * recycled here is one `#acquireEmber` does not have to create fresh a
   * moment later. Kills them exactly where flashes are killed, for the same
   * reason: they were positioned in a layout that just stopped being current.
   */
  #resetEmbers(): void {
    if (this.#embersActive.length === 0) return;
    for (const ember of this.#embersActive) {
      ember.sprite.alpha = 0;
      this.#emberFree.push(ember.sprite);
    }
    this.#embersActive = [];
  }

  /**
   * A burst of tiny warm particles from one popped hex — 4 to 7, each rising
   * away from the hex then settling back under its own theme's gravity (see
   * `Ember` and `#advanceEmbers`), additive-blended so they read as light
   * rather than confetti. `delayMs` rides the same distance-ordered stagger
   * the hex's own glow uses, so the embers of a cascade light up in the same
   * ripple.
   *
   * Randomness here is render-side jitter, not a rule the replay depends
   * on — `Math.random` is legal in `src/render` (only `src/engine` and
   * `src/content` are barred from it, see `eslint.config.js`'s `pure` rules,
   * which this file's config block does not include).
   */
  #spawnEmbers(x: number, y: number, layout: Layout, delayMs: number, tint: number): void {
    const motion = this.#theme.motion;
    const count = EMBER_MIN + Math.floor(Math.random() * (EMBER_MAX - EMBER_MIN + 1));
    for (let i = 0; i < count; i++) {
      const sprite = this.#acquireEmber();
      if (sprite === null) return; // Pool spent; the rest of a huge pop throws no more.

      const size = Math.max(1.5, layout.size * (0.07 + Math.random() * 0.05));
      sprite.tint = tint;
      sprite.scale.set(1);
      sprite.position.set(x, y);
      sprite.setSize(size, size);
      sprite.alpha = 0;

      this.#embersActive.push({
        sprite,
        baseScale: sprite.scale.x,
        delayMs,
        elapsedMs: 0,
        lifeMs: motion.emberLifeMs + Math.random() * 200,
        startX: x,
        startY: y,
        // Mostly sideways drift, and up first — the settle is what pulls it
        // back down, in `#advanceEmbers`.
        driftX: (Math.random() * 2 - 1) * layout.size * 0.6,
        driftY: -layout.size * (0.5 + Math.random() * 0.7),
        sinkPx: layout.size * motion.emberGravity * (0.7 + Math.random() * 0.6),
        peak: 0.8,
      });
    }
  }

  /**
   * A sprite for one ember: a recycled one from an earlier, finished burst
   * if the pool has one waiting, else a freshly created sprite so long as
   * the pool has not hit `EMBER_CAP` — the label-texture cache's discipline
   * (create once, reuse forever) applied to a moving sprite instead of a
   * baked texture. `null` once the cap is spent, or if there is no canvas to
   * bake the ember texture from at all (a state `draw()` cannot reach).
   */
  #acquireEmber(): Sprite | null {
    const recycled = this.#emberFree.pop();
    if (recycled !== undefined) return recycled;
    if (this.#emberSpriteCount >= EMBER_CAP) return null;

    const texture = this.#emberTextureFor();
    if (texture === null) return null;

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.alpha = 0;
    this.#fx.addChild(sprite);
    this.#emberSpriteCount++;
    return sprite;
  }

  #advanceEmbers(deltaMs: number): void {
    if (this.#embersActive.length === 0) return;

    const alive: Ember[] = [];
    for (const ember of this.#embersActive) {
      if (ember.delayMs > 0) {
        ember.delayMs -= deltaMs;
        alive.push(ember);
        continue;
      }

      ember.elapsedMs += deltaMs;
      const t = ember.elapsedMs / ember.lifeMs;
      if (t >= 1) {
        ember.sprite.alpha = 0;
        this.#emberFree.push(ember.sprite);
        continue;
      }

      // Fast in, slower out — the same shape the pop's own glow fades on.
      const curve = t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 1.5);
      ember.sprite.alpha = ember.peak * curve;
      // Rise, then settle (WORKPLAN Stage 4, 2026-08-20): `rise` is an
      // eased climb that reaches its own drift by t≈0.45 and holds — the
      // thermal updraft running out of heat — while `sink` grows from
      // t≈0.3 on, quadratic like a real fall's acceleration, and pulls the
      // ember back down under `driftY` before it fades out. One smooth arc,
      // never a bounce: `sink` only ever grows, so nothing reverses twice.
      const rise = 1 - Math.pow(1 - Math.min(t / 0.45, 1), 2);
      const sink = ember.sinkPx * Math.pow(Math.max(0, (t - 0.3) / 0.7), 2);
      ember.sprite.position.set(
        ember.startX + ember.driftX * t,
        ember.startY + ember.driftY * rise + sink,
      );
      ember.sprite.scale.set(ember.baseScale * (1 - 0.3 * t));
      alive.push(ember);
    }
    this.#embersActive = alive;
  }

  /** A small, colour-neutral round dot — every ember tints it, so one bake
   * serves every pop and every theme this renderer ever draws. */
  #emberTextureFor(): Texture | null {
    if (this.#emberTexture !== null) return this.#emberTexture;

    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.4, '#ffffff');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    this.#emberTexture = Texture.from(canvas);
    return this.#emberTexture;
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

      if (flash.kind === 'hold' || flash.kind === 'cover') {
        // Nothing moves, nothing fades — the reduced-motion glow sits at its
        // alpha, and the pop cover sits as the tile it still looks like,
        // both until the life check above removes them.
      } else if (flash.kind === 'glow') {
        // Fast up, slow down. A symmetric fade reads as a pulsing light; the
        // asymmetry is what makes it read as something having happened.
        const curve = t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 2);
        flash.sprite.alpha = flash.peak * curve;
        const swell = 1 + t * 0.35;
        flash.sprite.scale.set(flash.baseScaleX * swell, flash.baseScaleY * swell);
      } else {
        // The leap: a parabola peaking mid-life, visible at once, fading only
        // on the way down — so it reads as the tile jumping off the board and
        // falling away, not as a ghost drifting up.
        flash.sprite.alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        flash.sprite.position.y = flash.baseY - flash.liftPx * 4 * t * (1 - t);
        const swell = 1 + 0.2 * Math.sin(Math.PI * t);
        flash.sprite.scale.set(flash.baseScaleX * swell, flash.baseScaleY * swell);
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
      this.#vignetteSprite = null;
      return;
    }

    const nextKey = `${Math.round(width)}x${Math.round(height)}:${spec.colour}:${spec.strength}`;
    if (nextKey !== this.#vignetteKey) {
      this.#vignette.removeChildren().forEach((c) => {
        c.destroy();
      });
      this.#vignetteSprite = null;

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (ctx === null) return;

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const outer = Math.hypot(cx, cy);
      // Baked at the theme's own ceiling strength, unscaled — `#vignetteFactor`
      // is applied below as a plain alpha multiply, not folded into the
      // gradient, so honouring "strength is a ceiling" costs nothing further:
      // the drawn strength can only ever be at or under what is baked here.
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
      this.#vignetteSprite = sprite;
      this.#vignetteKey = nextKey;
    }

    // The double-dip (audit finding, 2026-08-19): this screen-space vignette
    // and the world-space torch (`ui/view.ts`'s `structureDistances`) both
    // darken the same board at once — full vignette AND full light falloff
    // over the same dark plane says the same thing twice. `#zoom` is a free,
    // already-computed proxy for how much of the fitted extent the viewport
    // is showing: at FIT (zoom 1) the whole grown world — mostly unlit ground
    // and beacons past the torch — fills the screen, and the vignette earns
    // its full ceiling; zoomed in on a lit structure, that SAME fitted extent
    // has been magnified well past the screen, so the vignette eases rather
    // than doubling what the torch is already doing to the same pixels.
    // Never below a third of the ceiling — this is atmosphere, not a
    // blackout. Applied as a plain alpha multiply on the one sprite that
    // already exists, every draw: no rebake, so a live pinch (which redraws
    // every frame) costs one number instead of a canvas re-render, and
    // reduced motion never touches it — this is a per-draw value derived
    // from the camera, not an animation.
    if (this.#vignetteSprite !== null) this.#vignetteSprite.alpha = this.#vignetteFactor();
  }

  /** See `#drawVignette`'s own comment for what this proxies and why. */
  #vignetteFactor(): number {
    const FLOOR = 0.3;
    return FLOOR + (1 - FLOOR) * Math.min(1, 1 / this.#zoom);
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
 * `+` pays tiles, `★` pays points, `◈` wakes an unlock, `◆` is a territory to
 * claim, `✦` is a hidden find. Words for them live in the HUD hint, where
 * there is room for words.
 */
/**
 * Label font size for a hex of circumradius `size`, in device-independent
 * pixels. One function because three places must agree on it exactly: the
 * Text style, the cache key, and the eviction's keep prefix.
 *
 * FLOORED at 8px (2026-08-19, Marc: "all symbols and numbers can be read
 * whatever the zoom — most of the time it disappears when zoomed out and we
 * can't do much more than zoom back in to check"). Below the floor a glyph
 * physically cannot resolve; above it, a label simply stops shrinking with
 * the hex and spills a little instead — a map pin's behaviour, not a
 * texture's. The floor also collapses every far-out zoom level onto one
 * cached texture per glyph, which is cheaper, not dearer.
 */
const labelPx = (size: number): number => Math.max(8, Math.round(size * 0.7));

function labelFor(cell: CellView): { text: string; faint: boolean } | null {
  // A shimmer carries `landmark: null` and must stay wordless — printing any
  // glyph would tell the player WHAT is out there, which is exactly the thing
  // the sense upgrade does not sell. The old `?? 'territory'` fallback would
  // have done precisely that.
  if (cell.kind === 'landmark') {
    return cell.landmark === null
      ? null
      : { text: LANDMARK_GLYPH[cell.landmark], faint: cell.claimed };
  }
  if (cell.ripe && cell.worth > 0) return { text: String(cell.worth), faint: false };
  if (cell.legal && cell.preview !== null && cell.preview > 0) {
    return { text: String(cell.preview), faint: true };
  }
  return null;
}
