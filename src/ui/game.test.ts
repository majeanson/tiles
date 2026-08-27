// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLOUR_MARK, LANDMARK_GLYPH } from '@theme/tokens';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import { BARE_TUNING, COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { ripeKeys } from '@engine/rules';
import { destinationAt } from '@engine/world';
import type { Cell, GameState, LandmarkReward, Rarity } from '@engine/state';
import { EMPTY_PROGRESS, TEACH_IDS, UPGRADES, type Progress, type TeachId } from '@meta/progress';
import type { BoardView, Renderer } from '@render/Renderer';
import type { ShareCardData } from '@render/shareCard';
import { Game, type Elements, type GameHooks } from './game';
import { rememberedNativeAt } from './view';

/**
 * The wiring, checked without a canvas.
 *
 * Everything worth thinking about lives in the engine and the selector, and is
 * tested there. What is left here is the part that fails silently: an element id
 * that does not match the HTML, a listener never attached, a button that stays
 * live after the run is over. None of that shows up in a type error, and all of
 * it turns a phone-testing session into a blank screen.
 */

/** A renderer that draws nothing and can be told what the next tap will hit. */
class StubRenderer implements Renderer {
  views: BoardView[] = [];
  nextHit: HexKey | null = null;

  /** Camera calls, recorded. The stub clamps like the real one so the
      toggle's own logic (FIT ⇄ HERE) can be exercised without a canvas. */
  zoom = 1;
  pans: [number, number][] = [];
  resets = 0;
  centered: HexKey[] = [];

  mount(): Promise<void> {
    return Promise.resolve();
  }
  draw(view: BoardView): void {
    this.views.push(view);
  }
  hitTest(): HexKey | null {
    return this.nextHit;
  }
  setReducedMotion(): void {
    // The stub draws nothing, so there is nothing to calm down.
  }
  zoomBy(factor: number): void {
    this.zoom = Math.min(4, Math.max(1, this.zoom * factor));
  }
  panBy(dx: number, dy: number): void {
    this.pans.push([dx, dy]);
  }
  centerOn(hex: HexKey): void {
    this.centered.push(hex);
  }
  /**
   * The glided moves (2026-08-20) record exactly what the instant ones did —
   * these tests are about WHICH hex the game asked for and at what zoom, and
   * the easing between here and there is the renderer's own business.
   */
  flyToHex(hex: HexKey, zoom: number): void {
    this.centered.push(hex);
    this.zoom = Math.min(this.max, Math.max(1, zoom));
  }
  flyToFit(): void {
    this.zoom = 1;
    this.resets++;
  }
  resetCamera(): void {
    this.zoom = 1;
    this.resets++;
  }
  zoomLevel(): number {
    return this.zoom;
  }
  /** A grown board raises the ceiling; the stub just states one. */
  max = 4;
  zoomMax(): number {
    return this.max;
  }
  /**
   * happy-dom has no 2D canvas, so the real renderer's own `null` guard
   * (nothing to extract from) is the honest answer here too — not a special
   * case for tests, the SAME path a browser without canvas support would
   * take. A picture is set here explicitly in the one test that wants one.
   */
  picture: string | null = null;
  snapshot(): string | null {
    return this.picture;
  }
  destroy(): void {}

  get last(): BoardView {
    const view = this.views[this.views.length - 1];
    if (view === undefined) throw new Error('nothing drawn');
    return view;
  }
}

function build(
  seed = 4,
  tuning?: Tuning,
  hooks?: GameHooks,
  claimed: readonly HexKey[] = [],
  wakeAt: HexKey | null = null,
): { game: Game; renderer: StubRenderer; el: Elements } {
  document.body.innerHTML = `
    <header id="stats"></header>
    <div id="board">
      <div id="camera">
        <button id="lens-clear" hidden>✕</button>
        <button id="help">?</button>
        <button id="camera-toggle">FIT</button>
      </div>
      <div id="toast" hidden></div>
      <div id="event-card" hidden>
        <div id="event-card-panel">
          <p id="event-card-glyph"></p>
          <p id="event-card-text"></p>
          <div id="event-card-rows"></div>
          <button id="event-card-dismiss">GOT IT</button>
        </div>
      </div>
      <div id="help-panel" hidden>
        <div id="help-manual"></div>
        <div id="help-menu"></div>
      </div>
    </div>
    <p id="hint" hidden></p>
    <div id="controls"><div id="hand"><div id="draft"></div>
      <div id="stash"></div></div></div>
    <button id="harvest-tiles"></button>
    <button id="harvest-points"></button>
    <button id="harvest-treasure" hidden></button>
    <button id="harvest-burn" hidden></button>
    <div id="actions-more"></div>
    <div id="purse" hidden><button id="purse-toggle"></button><div id="spends" hidden></div></div>
    <p id="end" hidden></p>`;

  const pick = <T extends HTMLElement>(id: string): T => {
    const found = document.getElementById(id);
    if (found === null) throw new Error(`#${id}`);
    return found as T;
  };

  const el: Elements = {
    board: pick('board'),
    stats: pick('stats'),
    hint: pick('hint'),
    hand: pick('hand'),
    draft: pick('draft'),
    stash: pick('stash'),
    spends: pick('spends'),
    purse: pick('purse'),
    purseToggle: pick<HTMLButtonElement>('purse-toggle'),
    actionsMore: pick('actions-more'),
    controls: pick('controls'),
    harvestTiles: pick<HTMLButtonElement>('harvest-tiles'),
    harvestPoints: pick<HTMLButtonElement>('harvest-points'),
    harvestTreasure: pick<HTMLButtonElement>('harvest-treasure'),
    harvestBurn: pick<HTMLButtonElement>('harvest-burn'),
    end: pick('end'),
    cameraToggle: pick<HTMLButtonElement>('camera-toggle'),
    lensClear: pick<HTMLButtonElement>('lens-clear'),
    help: pick<HTMLButtonElement>('help'),
    helpPanel: pick('help-panel'),
    helpManual: pick('help-manual'),
    helpMenu: pick('help-menu'),
    toast: pick('toast'),
    eventCard: pick('event-card'),
    eventCardGlyph: pick('event-card-glyph'),
    eventCardText: pick('event-card-text'),
    eventCardRows: pick('event-card-rows'),
    eventCardDismiss: pick<HTMLButtonElement>('event-card-dismiss'),
  };

  const renderer = new StubRenderer();
  return {
    game: new Game(renderer, el, seed, undefined, tuning, hooks, claimed, [], wakeAt),
    renderer,
    el,
  };
}

/** A pointer event with a stable id, so gestures can be composed by hand. */
const pointer = (el: HTMLElement, type: string, x: number, y: number, pointerId = 1): void => {
  el.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, pointerId }));
};

/** A real tap is a press and a lift that never moved. */
const tap = (el: HTMLElement): void => {
  pointer(el, 'pointerdown', 0, 0);
  pointer(el, 'pointerup', 0, 0);
};

describe('the game loop', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
    ctx.game.start();
  });

  const stat = (id: string): string =>
    ctx.el.stats.querySelector(`[data-stat="${id}"] .stat-value`)?.textContent ?? '';

  it('draws and fills the hud on start', () => {
    expect(ctx.renderer.views.length).toBeGreaterThan(0);
    expect(stat('tiles')).toBe(String(ctx.game.state.tiles));
    // LUCK has its own slot (it shared one with the score until 2026-08-20),
    // and depth is REACH. The stash rides at the end of the draft row.
    expect(stat('luck')).toBe('0');
    expect(stat('map')).toBe('0');
    expect(stat('cost')).toBe('−1');
    expect(ctx.el.draft.children.length).toBeGreaterThanOrEqual(ctx.game.state.draft.length);
  });

  // REACH is THIS run's, and only this run's (Marc, 2026-08-20: "show our
  // best in the settings but not in the header — only show current reach,
  // like tiles, luck, cost"). The world's farthest is a RECORD, and it lives
  // with the other records in the MENU tab's atlas; between 2026-08-18 and
  // now it rode along inside the live number as "· best N", which put two
  // different kinds of fact in one slot.
  it('shows the live reach alone, whatever the world’s best happens to be', () => {
    const withBest = build(4, TUNING, {
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 18 }),
    });
    withBest.game.start();
    const value = withBest.el.stats.querySelector('[data-stat="map"] .stat-value')?.textContent;
    expect(value).toBe('0');

    // And identically where there is no best to have said anything about.
    const fresh = build(4, TUNING, {
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 0 }),
    });
    fresh.game.start();
    const freshValue = fresh.el.stats.querySelector('[data-stat="map"] .stat-value')?.textContent;
    expect(freshValue).toBe('0');

    // No hook at all (the gallery, a bare game.test.ts build()) is the same
    // plain number, not an error.
    expect(stat('map')).toBe('0');
  });

  // POINTS and LUCK stopped sharing one slot on 2026-08-20 (Marc: "we could
  // show current points too"). Both are live numbers; the score being the
  // thing a run is FOR, it must not be the one that gets hidden.
  it('shows the score and the purse at once, not one instead of the other', () => {
    expect(stat('points')).toBe(String(ctx.game.state.points));
    expect(stat('luck')).toBe(String(ctx.game.state.luck));
  });

  // The draft cards carry the theme's word for a colour, not the colour id. The
  // default theme has no fiction, so it says GREEN — but the lookup is the thing
  // being checked, because a direction that renames all four must not produce
  // four blank buttons.
  it('names each draft card in the vocabulary of the active theme', () => {
    // The name span specifically — cards also carry BEST/MAGIC badges now.
    const labels = [...ctx.el.draft.children]
      .filter((c) => !c.classList.contains('hold'))
      .map((c) => c.querySelector('.tile-name')?.textContent ?? '');
    expect(labels.every((l) => l.length > 0)).toBe(true);

    // Symbol AND name, three channels for one fact: a card says which colour
    // it is by hue, by word and by shape, so no single channel has to carry
    // it — which is the point for anyone who cannot separate two of the hues.
    const colours = ctx.game.state.draft.map((t) => t.colour);
    expect(labels.map((l) => l.split(' ')[1]?.toLowerCase())).toEqual(colours);
    expect(labels.map((l) => l.split(' ')[0])).toEqual(colours.map((c) => COLOUR_MARK[c]));
  });

  it('places a tile where the tap landed', () => {
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    expect(ctx.game.state.placements).toBe(1);
    expect(ctx.game.state.cells[key(1, 0)]?.kind).toBe('tile');
  });

  // A tap on empty space beyond the board must not cost a tile.
  it('ignores a tap that hits no cell', () => {
    ctx.renderer.nextHit = null;
    tap(ctx.el.board);
    expect(ctx.game.state.placements).toBe(0);
  });

  it('redraws only when the action changed something', () => {
    const before = ctx.renderer.views.length;
    ctx.renderer.nextHit = key(0, 0); // occupied by the seed tile
    tap(ctx.el.board);
    expect(ctx.renderer.views).toHaveLength(before);
  });

  it('selects a draft tile, and the board preview follows it', () => {
    // At the start the only tile down is the seed, so a draft tile matching its
    // colour previews 1 next to it and every other colour previews 0. Seed 4 is
    // chosen because its opening draft contains both cases.
    const state = ctx.game.state;
    const seedCell = state.cells[key(0, 0)];
    const matching = state.draft.findIndex(
      (t) => seedCell?.kind === 'tile' && t.colour === seedCell.colour,
    );
    expect(matching).toBeGreaterThanOrEqual(0);

    const bestPreview = (): number =>
      Math.max(...ctx.renderer.last.cells.filter((c) => c.legal).map((c) => c.preview ?? 0));

    (ctx.el.draft.children[matching] as HTMLButtonElement).click();
    expect(ctx.game.state.selected).toBe(matching);
    expect(bestPreview()).toBe(1);

    const mismatched = state.draft.findIndex(
      (t) => seedCell?.kind === 'tile' && t.colour !== seedCell.colour,
    );
    expect(mismatched).toBeGreaterThanOrEqual(0);
    (ctx.el.draft.children[mismatched] as HTMLButtonElement).click();
    expect(bestPreview()).toBe(0);
  });

  it('keeps both payouts priced and disabled until something is ripe', () => {
    expect(ctx.el.harvestTiles.disabled).toBe(true);
    expect(ctx.el.harvestPoints.disabled).toBe(true);
  });

  it('marks no card BEST — the board’s preview numbers are the advice now', () => {
    // The badge was removed on Marc's call (2026-08-19): the previews print
    // every card's worth where it would land, and the extra word was noise.
    const marked = [...ctx.el.draft.children].filter((c) => (c.textContent ?? '').includes('BEST'));
    expect(marked).toHaveLength(0);
  });

  it('shows the epitaph and goes dead once the run ends', () => {
    // Spend the run down without ever banking tiles.
    for (let i = 0; i < 2000 && ctx.game.state.phase === 'placing'; i++) {
      const spot = ctx.renderer.last.cells.find((c) => c.legal);
      if (spot === undefined) {
        if (!ctx.el.harvestTiles.disabled) ctx.el.harvestTiles.click();
        else break;
        continue;
      }
      ctx.renderer.nextHit = spot.key;
      tap(ctx.el.board);
    }

    expect(ctx.game.state.phase).toBe('ended');
    expect(ctx.el.end.hidden).toBe(false);
    // The epitaph is a pool now (2026-08-26) — whatever framing this run
    // drew, the screen carries the sentence the view wrote for it.
    expect(ctx.el.end.querySelector('.end-epitaph')?.textContent).toContain(
      String(ctx.game.state.placements),
    );
    expect(ctx.el.harvestTiles.disabled).toBe(true);

    // And the board stops accepting taps.
    const placements = ctx.game.state.placements;
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.game.state.placements).toBe(placements);
  });
});

describe('the endless world, under a thumb', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build(7, TUNING);
    ctx.game.start();
  });

  /** Ring the seed tile so it ripens: the smallest pocket the plane can make. */
  const ripenTheSeed = (): void => {
    for (const n of neighbourKeys(0, 0)) {
      ctx.renderer.nextHit = n;
      tap(ctx.el.board);
    }
    expect(ripeKeys(ctx.game.state.cells)).toContain(key(0, 0));
  };

  it('never leaves an empty payout button where the fork was removed', () => {
    // Marc's phone showed a blank button between POP and TREASURE: the
    // single-payout branch hid the points button, and a line two statements
    // later un-hid it again the moment a pocket was ripe.
    const single = build(7, { ...TUNING, singlePayout: true });
    single.game.start();
    for (const n of neighbourKeys(0, 0)) {
      single.renderer.nextHit = n;
      tap(single.el.board);
    }

    expect(single.el.harvestTiles.hidden).toBe(false);
    expect(single.el.harvestTiles.textContent).toContain('POP');
    expect(single.el.harvestPoints.hidden).toBe(true);
  });

  it('takes the dead controls off the screen when the run ends', () => {
    // The end screen carries the shop now, so leaving a live hand and a live
    // luck row under it pushed the page past the viewport — and the board,
    // being positioned, painted over both (Marc's second screenshot).
    expect(ctx.el.controls.hidden).toBe(false);

    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    const over = build(1, TUNING, { resume: ended });
    over.game.start();
    expect(over.el.controls.hidden).toBe(true);
    expect(over.el.end.hidden).toBe(false);
  });
  it('reports REACH, the only depth there is', () => {
    const label = ctx.el.stats.querySelector('[data-stat="map"] .stat-label')?.textContent;
    expect(label).toBe('REACH');
  });

  it('prices the pocket, outlines it, and a tap on ripe asks rather than places', () => {
    ripenTheSeed();

    // The button prices the pocket without any tap — biggest is the default.
    expect(ctx.el.harvestTiles.disabled).toBe(false);
    expect(ctx.el.harvestPoints.hidden).toBe(true);
    const targeted = ctx.renderer.last.cells.filter((c) => c.targeted).map((c) => c.key);
    expect(targeted).toContain(key(0, 0));

    // Tapping the ripe tile is a question, not a placement.
    const placements = ctx.game.state.placements;
    ctx.renderer.nextHit = key(0, 0);
    tap(ctx.el.board);
    expect(ctx.game.state.placements).toBe(placements);

    // And the answer pops exactly that pocket.
    ctx.el.harvestTiles.click();
    expect(ctx.game.state.cells[key(0, 0)]?.kind).toBe('stone');
  });

  // A GAIN flashes (2026-08-26): the pop just paid tiles, so the TILES
  // value wears `rose` for a breath — and COST, which never celebrates,
  // does not, whatever it did.
  it('flashes a stat that rose, and never the routine ones', () => {
    ripenTheSeed();
    const before = ctx.game.state.tiles;
    ctx.el.harvestTiles.click();
    expect(ctx.game.state.tiles).toBeGreaterThan(before);
    const tiles = ctx.el.stats.querySelector('[data-stat="tiles"] .stat-value');
    expect(tiles?.classList.contains('rose')).toBe(true);
    const cost = ctx.el.stats.querySelector('[data-stat="cost"] .stat-value');
    expect(cost?.classList.contains('rose')).toBe(false);
  });

  // Pan-to-pocket (Stage 2, 2026-08-18): pressing POP with nothing tapped
  // prices the DEFAULT (biggest) pocket, which could be anywhere on a grown
  // board — the camera has to show what it is about to pop, not leave the
  // player finding out after the fact.
  it('pans the camera to the pocket before popping it', () => {
    ripenTheSeed();
    expect(ctx.renderer.centered).toHaveLength(0);
    ctx.el.harvestTiles.click();
    expect(ctx.renderer.centered).toEqual([key(0, 0)]);
  });
});

describe('the hint line, cut to one clause', () => {
  // The destination signpost and the rare-tile odds used to live on the
  // persistent hint line alongside the guide; both moved off it (Stage 2,
  // 2026-08-18) — the signpost to a toast on change, the odds to the purse.
  it('never carries the destination signpost, even with one to show', () => {
    const base = newRun(7, TUNING);
    const near = key(2, 0);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: { ...base.cells, [near]: { kind: 'landmark', reward: 'cache', claimed: false } },
      },
    });
    ctx.game.start();
    expect(ctx.el.hint.textContent).not.toMatch(/glows/);
    // No toast either: the FIRST render primes silently rather than
    // greeting a resumed run with a toast about ground it already knew.
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('never carries the rare-tile odds', () => {
    const ctx = build(7, TUNING);
    ctx.game.start();
    expect(ctx.el.hint.textContent).not.toMatch(/magic .+ unique/);
  });

  // A claim's own toast always wins the beat it happens on — the signpost
  // must never clobber it.
  it('lets a claim toast win over the signpost on the same placement', () => {
    const base = newRun(7, TUNING);
    const near = key(2, 0);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: { ...base.cells, [near]: { kind: 'landmark', reward: 'cache', claimed: false } },
      },
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/CACHE CLAIMED/);
    expect(ctx.el.toast.textContent).not.toMatch(/glows/);
  });
});

describe('the camera, and staying oriented', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build(7, TUNING);
    ctx.game.start();
  });

  it('pans on a drag and never mistakes it for a placement', () => {
    ctx.renderer.nextHit = key(1, 0);
    pointer(ctx.el.board, 'pointerdown', 0, 0);
    pointer(ctx.el.board, 'pointermove', 40, 0);
    pointer(ctx.el.board, 'pointerup', 40, 0);

    expect(ctx.renderer.pans.length).toBeGreaterThan(0);
    expect(ctx.game.state.placements).toBe(0);
  });

  it('treats movement inside the slop as a tap', () => {
    ctx.renderer.nextHit = key(1, 0);
    pointer(ctx.el.board, 'pointerdown', 0, 0);
    pointer(ctx.el.board, 'pointermove', 3, 0);
    pointer(ctx.el.board, 'pointerup', 3, 0);

    expect(ctx.renderer.pans).toHaveLength(0);
    expect(ctx.game.state.placements).toBe(1);
  });

  it('zooms on a pinch and swallows both lifts', () => {
    ctx.renderer.nextHit = key(1, 0);
    pointer(ctx.el.board, 'pointerdown', 0, 0, 1);
    pointer(ctx.el.board, 'pointerdown', 100, 0, 2);
    pointer(ctx.el.board, 'pointermove', 150, 0, 2);
    pointer(ctx.el.board, 'pointerup', 150, 0, 2);
    pointer(ctx.el.board, 'pointerup', 0, 0, 1);

    expect(ctx.renderer.zoom).toBeGreaterThan(1);
    expect(ctx.game.state.placements).toBe(0);
  });

  it('leaves presses on board-mounted buttons alone — they are not taps', () => {
    // The camera stack and help panel live INSIDE the board element. A press
    // there must not be captured as a gesture or lifted as a placement —
    // that is exactly how every board-mounted button died on desktop.
    ctx.renderer.nextHit = key(1, 0);
    pointer(ctx.el.cameraToggle, 'pointerdown', 5, 5);
    pointer(ctx.el.cameraToggle, 'pointerup', 5, 5);
    expect(ctx.game.state.placements).toBe(0);

    ctx.el.help.click();
    pointer(ctx.el.helpPanel, 'pointerdown', 50, 50);
    pointer(ctx.el.helpPanel, 'pointerup', 50, 50);
    expect(ctx.game.state.placements).toBe(0);
  });

  it('zooms on the wheel, for desktops and trackpads', () => {
    ctx.el.board.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -100 }));
    expect(ctx.renderer.zoom).toBeGreaterThan(1);
    ctx.el.board.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 100 }));
    ctx.el.board.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 100 }));
    expect(ctx.renderer.zoom).toBe(1);
  });

  it('is a two-state toggle: HERE jumps in on the torch, FIT is the way back', () => {
    // At fit, the label names the destination a tap goes to — HERE — not
    // the state the camera is currently in.
    expect(ctx.el.cameraToggle.textContent).toBe('HERE');

    ctx.el.cameraToggle.click();
    expect(ctx.renderer.zoom).toBeGreaterThan(1);
    // Centred on the torch — `state.lastPlaced`, or the origin before the
    // first placement — the same point the light already centres on.
    expect(ctx.renderer.centered).toHaveLength(1);
    expect(ctx.renderer.centered[0]).toBe(ctx.game.state.lastPlaced ?? key(0, 0));
    expect(ctx.el.cameraToggle.textContent).toBe('FIT');

    ctx.el.cameraToggle.click();
    expect(ctx.renderer.zoom).toBe(1);
    expect(ctx.renderer.resets).toBe(1);
    expect(ctx.el.cameraToggle.textContent).toBe('HERE');
  });

  it('opens the manual as tabs, one panel at a time, and closes on a tap', () => {
    expect(ctx.el.helpPanel.hidden).toBe(true);
    ctx.el.help.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);

    const tabs = [...ctx.el.helpPanel.querySelectorAll('button.help-tab')] as HTMLButtonElement[];
    // Four tabs since 2026-08-18 (Marc: "less sections, more info per words
    // read") — BOARD merged into PLAY, BUILD into AFTER.
    expect(tabs.map((tab) => tab.textContent)).toEqual(['START', 'PLAY', 'HAND', 'AFTER']);

    // Exactly one panel is showing, and it is the first tab's — the quick
    // start, which is the tab a stranger reads before their first placement.
    const panels = [...ctx.el.helpPanel.querySelectorAll('.help-panel-body')] as HTMLElement[];
    expect(panels.filter((p) => !p.hidden)).toHaveLength(1);
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[0]?.textContent).toContain('WHAT YOU SEE');

    // Tapping a tab swaps the panel and moves the marker, and does NOT close
    // the manual on the way past — the panel closes on any tap, so a control
    // that let its tap through would read as broken.
    tabs[1]?.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);
    expect(panels[0]?.hidden).toBe(true);
    expect(panels[1]?.hidden).toBe(false);
    expect(tabs[1]?.dataset['on']).toBe('true');
    expect(tabs[0]?.dataset['on']).toBeUndefined();

    ctx.el.helpPanel.click();
    expect(ctx.el.helpPanel.hidden).toBe(true);
  });

  it('keeps the arithmetic folded away, and reads it from the live tuning', () => {
    ctx.el.help.click();
    const t = ctx.game.state.tuning;

    // Folded by default: short manual, complete on demand.
    const folds = [
      ...ctx.el.helpPanel.querySelectorAll('details.help-more'),
    ] as HTMLDetailsElement[];
    expect(folds.length).toBeGreaterThan(4);
    expect(folds.every((fold) => !fold.open)).toBe(true);
    expect(folds.every((fold) => fold.querySelector('summary')?.textContent === 'NUMBERS')).toBe(
      true,
    );

    // Every number is the run's own tuning rather than prose that can go stale.
    const numbers = folds.map((fold) => fold.textContent ?? '').join(' ');
    expect(numbers).toContain(`+1 for every ${t.costRisesEvery}`);
    expect(numbers).toContain(`${t.blueTideEvery} hexes from home`);
    expect(numbers).toContain(`past ${t.harvestSizeCap} tiles`);
    // The bounty's numbers left the fold on Marc's 2026-08-19 ruling — they
    // are priced where they happen now: the site's claim note and the tapped
    // pocket's own line. The fold keeps only decision numbers with no
    // on-screen referent, and the bounty is not one any more.
    expect(numbers).not.toContain(`POP a pocket of ${t.questNeed}+`);

    // A payout a player needs BEFORE deciding where to walk is a fact, not
    // arithmetic, so it stays on the visible line rather than in a fold.
    expect(ctx.el.helpPanel.textContent).toContain(`CACHE — ${t.cachePays} tiles`);

    // The headline lines stay free of arithmetic — that is the whole split.
    const lead = ctx.el.helpPanel.querySelector('.help-panel-body p')?.textContent ?? '';
    expect(lead).not.toMatch(/\d/);

    // And a fold opens without closing the manual under it.
    folds[0]?.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ctx.el.helpPanel.hidden).toBe(false);
  });

  it('names the build from the run itself, so it cannot go stale', () => {
    ctx.el.help.click();
    const text = ctx.el.helpPanel.textContent ?? '';
    expect(text).toContain(`seed ${ctx.game.state.rootSeed}`);
    expect(text).toMatch(/In play: .*destinations/);
  });

  // TITHE (2026-08-18) is the fourth luck spend, and the LUCK IS A PURSE
  // section named the other three by price without it — a manual that
  // describes a purse and leaves out one of the four things it does is
  // exactly the staleness this section otherwise guards against.
  it('names TITHE among what luck buys, at its live rate and floor', () => {
    ctx.el.help.click();
    const t = ctx.game.state.tuning;
    const text = ctx.el.helpPanel.textContent ?? '';
    // Shortened 2026-08-21 (it ran ~44 words and said its middle clause
    // twice); what the test pins is unchanged — the LIVE rate and the LIVE
    // floor, so the sentence cannot drift from the dials it describes.
    expect(text).toContain(
      `SACRIFICE LUCK — turn your whole purse into relics now, at ${Math.round(t.titheRate * 100)}%`,
    );
    expect(text).toContain(`Needs ${t.titheMin} luck`);
  });

  it('says nothing about TITHE when its dial is zeroed, same as the other spends', () => {
    const off = build(7, BARE_TUNING);
    off.game.start();
    off.el.help.click();
    expect(off.el.helpPanel.textContent ?? '').not.toContain('TITHE');
  });

  // The footer stamp moved behind ?ff=debug.overlay (Stage 2, 2026-08-18) —
  // THIS BUILD keeps "which build is this" answerable regardless of it.
  it('states the build sha in the manual, whether or not the footer shows it', () => {
    const withSha = build(4, TUNING, { buildSha: 'abc1234' });
    withSha.game.start();
    withSha.el.help.click();
    expect(withSha.el.helpPanel.textContent).toContain('abc1234');

    const withoutSha = build(4, TUNING);
    withoutSha.game.start();
    withoutSha.el.help.click();
    expect(withoutSha.el.helpPanel.textContent).toMatch(/unlabelled build/);
  });

  // The colour lens folded off its own row and into a long-press on the
  // draft card wearing that colour (2026-08-18, "bottom-third reclaim") —
  // `contextmenu` is the ONE native event long-press, right-click AND the
  // keyboard's own context-menu key all fire, so the gesture is free of a
  // hand-rolled timer and free for a keyboard user at the same time.
  it('long-presses a draft card to spotlight its colour and explain it', () => {
    // A card of the SEED's own colour, forced rather than hoped for — the
    // draft is random, and the point of the test is the gesture, not
    // whether a seed happened to draw a matching card.
    const seed = ctx.game.state.cells[key(0, 0)];
    if (seed?.kind !== 'tile') throw new Error('no seed');
    const colour = seed.colour;
    const forced = build(4, TUNING, {
      resume: {
        ...ctx.game.state,
        draft: [{ ...ctx.game.state.draft[0]!, colour }, ...ctx.game.state.draft.slice(1)],
      },
    });
    forced.game.start();

    // `#renderDraft` rebuilds the row wholesale on every render (comment on
    // the method: rebuilt rather than diffed), so the card has to be
    // re-queried after each press — the DOM node the first press fired on
    // no longer exists once the spotlight re-renders it.
    const firstCard = forced.el.draft.children[0] as HTMLButtonElement;
    expect(firstCard.dataset['colour']).toBe(colour);

    firstCard.dispatchEvent(new window.MouseEvent('contextmenu', { cancelable: true }));
    const spotlit = forced.el.draft.children[0] as HTMLButtonElement;
    expect(spotlit.classList.contains('spotlit')).toBe(true);
    // The hint line carries the calculation, in the theme's word for it —
    // and each colour's OWN power, so no two colours read the same.
    expect(forced.el.hint.textContent).toMatch(/standing/);
    expect(forced.el.hint.textContent).toMatch(/worth × pocket size × distance/);
    expect(forced.el.hint.textContent).toMatch(/crowds|company|ash|tide/);

    // Other-coloured tiles dim on the board; the studied colour does not.
    const drawn = forced.renderer.last.cells.filter((c) => c.kind === 'tile');
    for (const cell of drawn) {
      expect(cell.dimmed).toBe(cell.colour !== colour);
    }

    // A second long-press on the same (re-rendered) card lets go.
    spotlit.dispatchEvent(new window.MouseEvent('contextmenu', { cancelable: true }));
    const released = forced.el.draft.children[0] as HTMLButtonElement;
    expect(released.classList.contains('spotlit')).toBe(false);
    expect(forced.renderer.last.cells.some((c) => c.dimmed)).toBe(false);
  });

  // The long-press does not steal the ordinary tap: `contextmenu` and
  // `click` are different events, and a normal press must still select.
  // (An UNselected card — tapping the selected one puts it down instead,
  // 2026-08-20, covered by its own test below.)
  it('still selects the card on an ordinary tap, long-press or not', () => {
    const card = ctx.el.draft.children[1] as HTMLButtonElement;
    card.dispatchEvent(new window.MouseEvent('contextmenu', { cancelable: true }));
    card.click();
    expect(ctx.game.state.selected).toBe(1);
  });

  it('speaks only when it has something to say, and hides the harvest until it exists', () => {
    // No standing default line any more (2026-08-26): the teaching cards own
    // "surround one on all six sides", and a quiet board keeps a quiet hint —
    // the row is HIDDEN, not blank, so it spends no height.
    expect(ctx.el.hint.textContent).toBe('');
    expect(ctx.el.hint.hidden).toBe(true);
    expect(ctx.el.harvestTiles.hidden).toBe(true);
    expect(ctx.el.harvestPoints.hidden).toBe(true);

    for (const n of neighbourKeys(0, 0)) {
      ctx.renderer.nextHit = n;
      tap(ctx.el.board);
    }
    expect(ripeKeys(ctx.game.state.cells).length).toBeGreaterThan(0);
    expect(ctx.el.harvestTiles.hidden).toBe(false);
    expect(ctx.el.hint.textContent).toMatch(/pocket ready/i);
  });
});

describe('keeping the run, and ending it properly', () => {
  it('resumes a saved state instead of starting fresh', () => {
    let saved: GameState = newRun(9, TUNING);
    saved = reduce(saved, { type: 'PLACE', hex: key(1, 0) });

    const ctx = build(1, TUNING, { resume: saved });
    ctx.game.start();
    expect(ctx.game.state).toBe(saved);
    expect(ctx.game.state.placements).toBe(1);
  });

  it('offers every change to the shell, so a crash costs one tap at most', () => {
    const kept: GameState[] = [];
    const ctx = build(7, TUNING, { onChange: (s) => kept.push(s) });
    ctx.game.start();

    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(ctx.game.state);

    // An illegal tap changes nothing and saves nothing.
    ctx.renderer.nextHit = key(0, 0);
    tap(ctx.el.board);
    expect(kept).toHaveLength(1);
  });

  it('shows the arc, the best, and the way to go again', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    let starts = 0;
    const ctx = build(1, TUNING, {
      resume: ended,
      finish: () => {
        return { runs: 4, best: 999, isNewBest: false };
      },
      newRun: () => {
        starts++;
      },
    });
    ctx.game.start();

    expect(ctx.el.end.hidden).toBe(false);
    const text = ctx.el.end.textContent ?? '';
    expect(text).toMatch(/0 pts/);
    // Not a new best: a DISTANCE from it, not a restatement of the number —
    // "best 999 pts" beside a run that scored 0 answered a question nobody
    // asked. `book.runs` (2026-08-18: "exists unused") gets its own line.
    expect(text).toMatch(/999 short of best/);
    expect(text).toMatch(/RUN 4/);
    expect(text).toMatch(/placements/);
    // The tally left with the gate (2026-08-18) — singlePayout removed the
    // fork it measured, so the end screen has nothing left to print here.
    expect(text).not.toMatch(/% tiles/);

    const again = ctx.el.end.querySelector('#end-new-run');
    expect(again).not.toBeNull();
    (again as HTMLButtonElement).click();
    expect(starts).toBe(1);
  });

  it('celebrates a new best as one', () => {
    const ended: GameState = {
      ...newRun(9, TUNING),
      phase: 'ended',
      death: 'broke',
      points: 500,
    };
    const ctx = build(1, TUNING, {
      resume: ended,
      finish: () => ({ runs: 1, best: 500, isNewBest: true }),
    });
    ctx.game.start();
    // A new best is the HEADLINE now, not a restatement beside the score —
    // its own line, and the score line still says the number plainly.
    expect(ctx.el.end.querySelector('.end-headline')?.textContent).toBe('NEW BEST');
    expect(ctx.el.end.textContent).toMatch(/500 pts/);
  });

  // Stage 2, 2026-08-18: the end screen's payout breakdown is where points
  // are LEARNED (`hidePoints` keeps the running total off the HUD the whole
  // run through). The three terms have to be the exact ones `endingBonus`
  // pays — reach × endReachBonus, claims × endClaimBonus — and they have to
  // sum to the total actually shown, not merely to some plausible number.
  it('breaks the score into pops, reach and claims — and they sum to the total', () => {
    const t = TUNING;
    const base = newRun(9, t);
    const reach = 3;
    const claims = 1;
    const pops = 120;
    const cells: Record<string, Cell> = {
      ...base.cells,
      [key(reach, 0)]: { kind: 'tile', colour: 'green' },
      [key(-1, 0)]: { kind: 'landmark', reward: 'site', claimed: true },
    };
    const ended: GameState = {
      ...base,
      cells,
      phase: 'ended',
      death: 'broke',
      points: pops + reach * t.endReachBonus + claims * t.endClaimBonus,
    };
    const ctx = build(1, t, { resume: ended });
    ctx.game.start();

    const text = ctx.el.end.textContent ?? '';
    expect(text).toContain(`POPS${pops}`);
    expect(text).toContain(`REACH ${reach} × ${t.endReachBonus}+${reach * t.endReachBonus}`);
    expect(text).toContain(`CLAIMS ${claims} × ${t.endClaimBonus}+${claims * t.endClaimBonus}`);
    expect(text).toContain(`TOTAL${ended.points}`);
  });

  // CARRIED OUT: what outlives the run. Relics and a found perk are THIS
  // run's; territories and world-knowledge are the WORLD's, read fresh from
  // `worldStats` rather than snapshotted, so a claim from a moment ago is
  // never shown as unclaimed.
  it('states what the run carries out — this run’s and the world’s', () => {
    const ended: GameState = {
      ...newRun(9, TUNING),
      phase: 'ended',
      death: 'broke',
      relics: 40,
    };
    const ctx = build(1, TUNING, {
      resume: ended,
      worldStats: () => ({ territories: 2, knownPct: 0.35, farthestReach: 18 }),
    });
    ctx.game.start();
    const text = ctx.el.end.textContent ?? '';
    expect(text).toMatch(/CARRIED OUT/);
    expect(text).toMatch(/40 relics banked/);
    expect(text).toMatch(/2 territories held/);
    expect(text).toMatch(/35% of the world known/);
  });

  // Buying in the shop used to redraw the whole screen with no sign anything
  // had happened beyond a price going quiet — the row now flashes and the
  // button confirms before the redraw settles.
  it('acknowledges a shop purchase before the screen redraws under it', () => {
    vi.useFakeTimers();
    try {
      // A taught device (met: everything), so the teaching pack stays quiet
      // and this test keeps proving only what it always proved.
      let progress: Progress = { ...EMPTY_PROGRESS, relics: 999, met: [...TEACH_IDS] };
      const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
      const ctx = build(1, TUNING, {
        resume: ended,
        shop: {
          read: () => progress,
          write: (p) => {
            progress = p;
          },
        },
      });
      ctx.game.start();
      (ctx.el.end.querySelector('#end-shop-open') as HTMLButtonElement).click();

      const buy = [...ctx.el.end.querySelectorAll<HTMLButtonElement>('.shop-buy')].find(
        (b) => !b.disabled,
      );
      expect(buy).not.toBeUndefined();
      buy!.click();
      expect(buy!.textContent).toBe('BOUGHT');
      expect(buy!.closest('.shop-row')?.classList.contains('bought')).toBe(true);

      vi.runAllTimers();
      // The purchase actually happened, once the redraw settles.
      expect(progress.relics).toBeLessThan(999);
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws the run as an arc chart, with the biggest pop in accent', () => {
    const base = newRun(9, TUNING);
    const ended: GameState = {
      ...base,
      phase: 'ended',
      death: 'broke',
      placements: 100,
      points: 430,
      log: {
        ...base.log,
        harvests: [
          { at: 20, count: 3, choice: 'tiles', tiles: 5, points: 40 },
          { at: 60, count: 5, choice: 'tiles', tiles: 8, points: 90 },
          { at: 90, count: 8, choice: 'tiles', tiles: 12, points: 300 },
        ],
      },
    };
    const ctx = build(1, TUNING, { resume: ended });
    ctx.game.start();

    // The screen says whose run it is, and shows the run as a picture.
    expect(ctx.el.end.querySelector('.end-title')?.textContent?.length).toBeGreaterThan(0);
    const svg = ctx.el.end.querySelector('svg.end-arc');
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll('rect.end-arc-bar')).toHaveLength(3);
    // One bar wears the accent: the biggest pop, which landed late — Gate D
    // read off a chart instead of a buried percentage.
    expect(svg!.querySelectorAll('rect.best')).toHaveLength(1);
  });

  it('draws a ghost baseline for the standing best, and stretches the scale to fit it', () => {
    const base = newRun(9, TUNING);
    const ended: GameState = {
      ...base,
      phase: 'ended',
      death: 'broke',
      placements: 100,
      points: 430,
      log: {
        ...base.log,
        harvests: [
          { at: 20, count: 3, choice: 'tiles', tiles: 5, points: 40 },
          { at: 90, count: 8, choice: 'tiles', tiles: 12, points: 300 },
        ],
      },
    };
    // A standing best bigger than this run's own biggest pop: the ghost
    // line has to sit ABOVE the tallest bar rather than coincide with it.
    const ctx = build(1, TUNING, {
      resume: ended,
      finish: () => ({ runs: 3, best: 900, isNewBest: false, previousBest: 900 }),
    });
    ctx.game.start();

    const svg = ctx.el.end.querySelector('svg.end-arc');
    expect(svg).not.toBeNull();
    const ghost = svg!.querySelector('line.end-arc-ghost');
    expect(ghost).not.toBeNull();

    const ghostY = Number(ghost!.getAttribute('y1'));
    const bestBar = svg!.querySelector('rect.best')!;
    const barTop = Number(bestBar.getAttribute('y'));
    // The run's own biggest pop (300) is short of the standing best (900):
    // the bar's top must sit BELOW (numerically greater y than) the line.
    expect(barTop).toBeGreaterThan(ghostY);
  });

  it('draws no ghost baseline without a standing best to show', () => {
    const ended: GameState = {
      ...newRun(9, TUNING),
      phase: 'ended',
      death: 'broke',
      placements: 100,
      log: {
        ...newRun(9, TUNING).log,
        harvests: [
          { at: 20, count: 3, choice: 'tiles', tiles: 5, points: 40 },
          { at: 90, count: 8, choice: 'tiles', tiles: 12, points: 300 },
        ],
      },
    };
    // No `finish` hook at all — the gallery and headless callers' own case.
    const ctx = build(1, TUNING, { resume: ended });
    ctx.game.start();
    const svg = ctx.el.end.querySelector('svg.end-arc');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('line.end-arc-ghost')).toBeNull();
  });

  it('skips the arc chart when one pop could not make a shape', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    const ctx = build(1, TUNING, { resume: ended });
    ctx.game.start();
    expect(ctx.el.end.querySelector('svg.end-arc')).toBeNull();
  });

  // The story, drawn (`ideas/endless-world.md`): a small portrait of the
  // board on the end screen, framed between the arc and the facts grid.
  it('shows the board portrait when the renderer provides one', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    const ctx = build(1, TUNING, { resume: ended });
    ctx.renderer.picture = 'data:image/png;base64,AAAA';
    ctx.game.start();

    const img = ctx.el.end.querySelector<HTMLImageElement>('img.end-snapshot');
    expect(img).not.toBeNull();
    expect(img!.src).toBe('data:image/png;base64,AAAA');
    // Decorative: everything the picture shows is already stated as text and
    // as the arc chart above it, and tap on it opens nothing.
    expect(img!.alt).toBe('');
  });

  it('shows no board portrait wherever the renderer has none — happy-dom, or a real one with no canvas', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    const ctx = build(1, TUNING, { resume: ended });
    // The stub's default — exactly what a real renderer with no 2D context
    // returns too.
    expect(ctx.renderer.picture).toBeNull();
    ctx.game.start();
    expect(ctx.el.end.querySelector('img.end-snapshot')).toBeNull();
  });

  it('writes the record book exactly once per ended run', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    let writes = 0;
    const ctx = build(1, TUNING, {
      resume: ended,
      finish: () => {
        writes++;
        return { runs: 1, best: 0, isNewBest: false };
      },
    });
    ctx.game.start();
    ctx.game.render();
    ctx.game.render();
    expect(writes).toBe(1);
  });
});

describe('the clock, the bounty, and the guide', () => {
  it('marks the pts button when it would collect the bounty, and says so', () => {
    // A ripe pocket at the origin, with a bounty standing on it.
    const base = newRun(7, TUNING);
    const cells: Record<string, Cell> = {};
    const pocket: string[] = [];
    for (let i = 0; i < TUNING.questNeed; i++) pocket.push(key(i, 0));
    for (const k of pocket) cells[k] = { kind: 'tile', colour: 'green' };
    for (let i = 0; i < TUNING.questNeed; i++) {
      for (const n of neighbourKeys(i, 0)) if (!pocket.includes(n)) cells[n] = { kind: 'stone' };
    }
    const ready: GameState = {
      ...base,
      cells,
      quest: {
        at: key(2, 0),
        need: TUNING.questNeed,
        radius: TUNING.questRadius,
        bonus: TUNING.questBonus,
      },
    };

    const ctx = build(1, TUNING, { resume: ready });
    ctx.game.start();
    expect(ctx.el.harvestTiles.textContent).toMatch(/★/);
    expect(ctx.el.harvestTiles.classList.contains('bounty')).toBe(true);
    expect(ctx.el.hint.textContent).toMatch(/BOUNTY READY/);

    // Popping it collects it; the button goes plain again.
    ctx.el.harvestTiles.click();
    expect(ctx.game.state.log.questsDone).toBe(1);
    expect(ctx.el.harvestTiles.classList.contains('bounty')).toBe(false);
  });

  it('warns about tiles by runway, not by a flat count', () => {
    const base = newRun(7, TUNING);
    // Ten tiles at cost 1 is ten placements of runway: not a warning.
    const rich: GameState = { ...base, tiles: 10 };
    const ctxRich = build(1, TUNING, { resume: rich });
    ctxRich.game.start();
    expect(ctxRich.el.hint.textContent).not.toMatch(/Low on tiles/);

    // The same ten tiles deep into the run, when a placement costs five.
    const late: GameState = { ...base, tiles: 10, placements: TUNING.costGrace + 100 };
    const ctxLate = build(1, TUNING, { resume: late });
    ctxLate.game.start();
    expect(ctxLate.el.hint.textContent).toMatch(/Low on tiles/);
  });
});

describe('the remembered world on screen', () => {
  it('draws remembered ground faint, unplayable, and never twice', () => {
    const base = newRun(7, TUNING);
    const onBoard = Object.keys(base.cells)[0]!;
    const remembered = key(20, -5);

    const ctx = build(1, TUNING, {
      resume: base,
      memory: [onBoard, remembered],
    });
    ctx.game.start();

    const drawn = ctx.renderer.last.cells;
    // The remembered hex appears once, marked, and cannot be built on.
    const ghosts = drawn.filter((c) => c.remembered);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.key).toBe(remembered);
    expect(ghosts[0]!.legal).toBe(false);

    // A hex that is BOTH remembered and on the board is drawn once, live.
    expect(drawn.filter((c) => c.key === onBoard)).toHaveLength(1);
    expect(drawn.find((c) => c.key === onBoard)?.remembered).toBe(false);
  });

  it('turns the colour lens on known fog ground with a tap, and off with another', () => {
    // The fog lens (Marc, 2026-08-20): tapping remembered ground whose
    // native colour the fog shows lights every known patch of that colour.
    // Scan outward for a hex this seed's terrain makes native — the world
    // hash is deterministic, so the walk always lands somewhere.
    const base = newRun(7, TUNING);
    let known: HexKey | null = null;
    outer: for (let q = -14; q <= 14; q++) {
      for (let r = -14; r <= 14; r++) {
        const k = key(q, r);
        if (base.cells[k] !== undefined) continue;
        if (rememberedNativeAt(base, k) !== null) {
          known = k;
          break outer;
        }
      }
    }
    expect(known).not.toBeNull();

    const ctx = build(1, TUNING, { resume: base, memory: [known!] });
    ctx.game.start();

    ctx.renderer.nextHit = known;
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/every known patch of it is lit/i);

    // Off again on the same tap — and the toast says so.
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/lens is off/i);
  });
});

describe('a stranger arriving', () => {
  // A stranger's first minute used to be greeted by the manual auto-opening
  // over a board they had not seen yet. Stage 2 replaced that with the front
  // door (main.ts, untested here — it is plain DOM wiring outside this
  // class), which opens the SAME dialog via `Game#openHelp` rather than a
  // second one built to match it. `firstVisit` no longer does anything on
  // its own, so it is gone from GameHooks; what is left to pin here is that
  // the panel never opens by itself, and that opening it FROM elsewhere
  // (an external "opener" button) returns focus to that exact button.
  it('never opens the manual by itself', () => {
    const ctx = build();
    ctx.game.start();
    expect(ctx.el.helpPanel.hidden).toBe(true);
  });

  it('opens for an external opener, and returns focus to it on close', () => {
    const ctx = build();
    ctx.game.start();

    const moreHelp = document.createElement('button');
    document.body.appendChild(moreHelp);

    ctx.game.openHelp(moreHelp);
    expect(ctx.el.helpPanel.hidden).toBe(false);

    ctx.el.helpPanel.click();
    expect(ctx.el.helpPanel.hidden).toBe(true);
    expect(document.activeElement).toBe(moreHelp);
  });

  it('offers a share only when the shell can share, and sends the run', () => {
    const bare = build(4, TUNING, {
      resume: { ...newRun(4, TUNING), phase: 'ended', death: 'spent' },
    });
    bare.game.start();
    expect(bare.el.end.querySelector('#end-share')).toBeNull();

    let shared: GameState | null = null;
    const sharing = build(4, TUNING, {
      resume: { ...newRun(4, TUNING), phase: 'ended', death: 'spent', points: 120 },
      share: (state) => {
        shared = state;
        return Promise.resolve('copied' as const);
      },
    });
    sharing.game.start();
    const button = sharing.el.end.querySelector('#end-share');
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    expect(shared).not.toBeNull();
    expect(shared!.points).toBe(120);
  });

  it('acknowledges a clipboard copy on the button itself', async () => {
    // The clipboard path is invisible; until 2026-08-18 the button silently
    // did nothing on browsers without a share sheet.
    const ctx = build(4, TUNING, {
      resume: { ...newRun(4, TUNING), phase: 'ended', death: 'spent', points: 9 },
      share: () => Promise.resolve('copied' as const),
    });
    ctx.game.start();
    const button = ctx.el.end.querySelector('#end-share') as HTMLButtonElement;
    button.click();
    await Promise.resolve();
    expect(button.textContent).toBe('LINK COPIED');
  });

  // The share card (2026-08-19, WORKPLAN Stage 2): built from the exact
  // `hud`/`recordLines`/`runNumber` fields the screen itself just drew from
  // — "one source of truth" means these cannot be re-derived independently
  // and drift, so this pins the actual values the button hands over.
  it('hands the share card the same facts the screen just drew', () => {
    const base = newRun(9, TUNING);
    const ended: GameState = {
      ...base,
      phase: 'ended',
      death: 'broke',
      points: 430,
      log: {
        ...base.log,
        harvests: [
          { at: 20, count: 3, choice: 'tiles', tiles: 5, points: 40 },
          { at: 90, count: 8, choice: 'tiles', tiles: 12, points: 300 },
        ],
      },
    };
    let sent: ShareCardData | null = null;
    const ctx = build(1, TUNING, {
      resume: ended,
      finish: () => ({ runs: 3, best: 430, isNewBest: true }),
      share: (_state, card) => {
        sent = card;
        return Promise.resolve('copied' as const);
      },
    });
    ctx.game.start();
    (ctx.el.end.querySelector('#end-share') as HTMLButtonElement).click();

    expect(sent).not.toBeNull();
    expect(sent!.points).toBe(430);
    expect(sent!.arc).toEqual([40, 300]);
    expect(sent!.headline).toBe('NEW BEST');
    expect(sent!.topLine).toBe('RUN 3');
    expect(sent!.footerLine).toBe(`SEED ${ended.rootSeed}`);
  });

  // The onward-share invitation (2026-08-26, POLISH.md "Worth doing"): a
  // recipient of a `?seed=` link got the same SHARE button as everyone, but
  // nothing ever said the world could travel on again.
  it('says nothing about a link by default, even with SHARE available', () => {
    const ctx = build(4, TUNING, {
      resume: { ...newRun(4, TUNING), phase: 'ended', death: 'spent' },
      share: () => Promise.resolve('copied' as const),
    });
    ctx.game.start();
    expect(ctx.el.end.querySelector('#end-onward')).toBeNull();
  });

  it('invites the run onward when this run was itself opened from a link', () => {
    const ctx = build(4, TUNING, {
      resume: { ...newRun(4, TUNING), phase: 'ended', death: 'spent' },
      share: () => Promise.resolve('copied' as const),
      fromLink: true,
    });
    ctx.game.start();
    const onward = ctx.el.end.querySelector('#end-onward');
    expect(onward).not.toBeNull();
    expect(onward!.textContent).toContain('link');
  });

  it('never invites onward when SHARE itself is unavailable, even from a link', () => {
    const ctx = build(4, TUNING, {
      resume: { ...newRun(4, TUNING), phase: 'ended', death: 'spent' },
      fromLink: true,
    });
    ctx.game.start();
    expect(ctx.el.end.querySelector('#end-onward')).toBeNull();
  });

  it('gives the daily its own ladder line and no seed, on the share card', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    let sent: ShareCardData | null = null;
    const ctx = build(1, TUNING, {
      resume: ended,
      daily: { label: () => 'DAILY #47 · best 520 · 4 tries', retry: () => {} },
      share: (_state, card) => {
        sent = card;
        return Promise.resolve('copied' as const);
      },
    });
    ctx.game.start();
    (ctx.el.end.querySelector('#end-share') as HTMLButtonElement).click();

    expect(sent).not.toBeNull();
    expect(sent!.topLine).toBe('DAILY #47 · best 520 · 4 tries');
    expect(sent!.footerLine).toBe('');
  });

  // `ui.runEnd` (2026-08-19, WORKPLAN Stage 2): the same drop-target
  // contract `ui.logo` wired in Stage 1 — the hero's own CSS gradient by
  // default, a PNG supersedes it as the backdrop the moment it is set.
  it('wears the hero block plain until `ui.runEnd` art is set', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke', points: 12 };
    const ctx = build(1, TUNING, { resume: ended });
    ctx.game.start();
    const hero = ctx.el.end.querySelector('.end-hero');
    expect(hero).not.toBeNull();
    expect(hero!.classList.contains('art')).toBe(false);

    ctx.game.setRunEndArt('/assets/torchlit/ui.runEnd.png');
    const heroAfter = ctx.el.end.querySelector('.end-hero') as HTMLElement;
    expect(heroAfter.classList.contains('art')).toBe(true);
    expect(heroAfter.style.getPropertyValue('--run-end-art')).toContain('ui.runEnd.png');
  });

  // The hand follows the board (2026-08-20, the pipeline's fresh-eyes
  // review): the board prefers a terrain slot's PNG the moment assets load,
  // and the card's whole reason to carry art is to show the tile the board
  // draws — so `setCardArt` must dress the already-rendered hand in the
  // same files. Before the fix, Stage 3's PNGs split the two surfaces: the
  // board drew the baked art while the cards kept the procedural bake.
  it('dresses the hand in the board’s own terrain art when it lands', () => {
    const ctx = build(1, TUNING);
    ctx.game.start();
    // happy-dom has no 2D canvas, so the procedural bake yields no art here
    // — which is exactly the blank slate this needs.
    expect(ctx.el.draft.querySelector('.tile-art')).toBeNull();

    ctx.game.setCardArt({
      green: '/assets/torchlit/terrain.green.png',
      yellow: '/assets/torchlit/terrain.yellow.png',
      red: '/assets/torchlit/terrain.red.png',
      blue: '/assets/torchlit/terrain.blue.png',
    });

    const cards = [...ctx.el.draft.querySelectorAll<HTMLButtonElement>('.tile[data-colour]')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const img = card.querySelector<HTMLImageElement>('.tile-art');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toContain(`terrain.${card.dataset['colour']}.png`);
    }
  });

  it('names the run’s ending when the clock runs out', () => {
    const spent: GameState = {
      ...newRun(4, TUNING),
      phase: 'ended',
      death: 'spent',
      placements: TUNING.runLength,
    };
    const ctx = build(4, TUNING, { resume: spent });
    ctx.game.start();
    expect(ctx.el.end.textContent).toMatch(/expedition is over/i);
  });

  it('keeps every control reachable by name, for a screen reader', () => {
    const ctx = build(4, TUNING);
    ctx.game.start();
    for (const el of [ctx.el.help, ctx.el.cameraToggle]) {
      expect(el.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
    for (const card of [...ctx.el.draft.children]) {
      expect(card.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /**
   * WCAG 2.5.3, "Label in Name": a control's accessible name must contain
   * its visible text, or voice control cannot address it by what it says.
   * `#camera-toggle` broke this once (its label said "zoom in on your last
   * placement" while its face said HERE) and was fixed on 2026-08-21; this
   * is the rule held rather than remembered.
   *
   * Icon-only controls are exempt by the same standard — a glyph is not a
   * text label — which is the project's consistent pattern for ?, ♪ and ✕.
   */
  it('never hides a visible word from the accessible name (WCAG 2.5.3)', () => {
    const ctx = build(4, TUNING);
    ctx.game.start();
    const GLYPHS = new Set(['?', '♪', '✕']);
    for (const el of [ctx.el.cameraToggle, ctx.el.help, ctx.el.lensClear]) {
      const label = el.getAttribute('aria-label') ?? '';
      const face = (el.textContent ?? '').trim();
      if (face === '' || GLYPHS.has(face)) continue;
      expect(label.toLowerCase(), `${face} is not in its own name`).toContain(face.toLowerCase());
    }
  });

  /**
   * The two-line action buttons (`actButton`) state their name rather than
   * letting the DOM compute one (2026-08-27). Whether a browser joins two
   * `display: block` children with a space is browser-dependent, and WebKit
   * concatenates — so VoiceOver read the bar as "POP5 tiles · 6 pts". The
   * last assertion is the one that catches a regression to that.
   */
  it('names every two-line action button in one readable string', () => {
    const ctx = build(4, TUNING);
    ctx.game.start();
    let checked = 0;
    for (const b of [ctx.el.harvestTiles, ctx.el.harvestPoints, ctx.el.purseToggle]) {
      const verb = b.querySelector('.act-label')?.textContent ?? '';
      const value = b.querySelector('.act-value')?.textContent ?? '';
      if (verb === '') continue;
      checked++;
      const label = b.getAttribute('aria-label') ?? '';
      expect(label.startsWith(verb), `${verb} does not lead its own name`).toBe(true);
      expect(label).toContain(value);
      expect(label).not.toContain(`${verb}${value}`);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('the manual as a dialog', () => {
  it('declares itself: role, modality, and a name', () => {
    const ctx = build(7, TUNING);
    ctx.game.start();
    expect(ctx.el.helpPanel.getAttribute('role')).toBe('dialog');
    expect(ctx.el.helpPanel.getAttribute('aria-modal')).toBe('true');
    expect(ctx.el.helpPanel.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
  });

  it('moves focus in on open and back to the ? button on close', () => {
    const ctx = build(7, TUNING);
    ctx.game.start();

    ctx.el.help.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);
    expect(document.activeElement).toBe(ctx.el.helpPanel);

    // The close-on-any-tap behaviour stays, and it returns focus too.
    ctx.el.helpPanel.click();
    expect(ctx.el.helpPanel.hidden).toBe(true);
    expect(document.activeElement).toBe(ctx.el.help);
  });

  it('closes on Escape — the keyboard path the tap never offered', () => {
    const ctx = build(7, TUNING);
    ctx.game.start();
    ctx.el.help.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.el.helpPanel.hidden).toBe(true);
    expect(document.activeElement).toBe(ctx.el.help);

    // Escape with the panel already closed is a no-op, not a crash.
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.el.helpPanel.hidden).toBe(true);
  });

  it('announces the toast and the hint without moving focus', () => {
    // Stated by the game, like the aria-labels, so the markup cannot lose
    // them: the popup and the reorientation line are the two places words
    // appear on their own, and a screen reader should hear both.
    const ctx = build(7, TUNING);
    ctx.game.start();
    expect(ctx.el.toast.getAttribute('aria-live')).toBe('polite');
    expect(ctx.el.hint.getAttribute('aria-live')).toBe('polite');
  });

  it('names every stat stably, and never makes the row a live region', () => {
    // The stats row is rebuilt wholesale each render, which would defeat a
    // live region — so each box carries a constant name instead, and the row
    // itself stays silent.
    const ctx = build(7, TUNING);
    ctx.game.start();
    const boxes = [...ctx.el.stats.children];
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    for (const box of boxes) {
      expect(box.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
    expect(ctx.el.stats.getAttribute('aria-live')).toBeNull();

    // Stable across renders: the same names, in the same order.
    const before = boxes.map((b) => b.getAttribute('aria-label'));
    ctx.game.render();
    expect([...ctx.el.stats.children].map((b) => b.getAttribute('aria-label'))).toEqual(before);
  });
});

describe('the curtain, and contextual help', () => {
  it('takes no gesture at all while the manual is open', () => {
    const ctx = build(7, TUNING);
    ctx.game.start();
    ctx.el.help.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);

    // A tap that lands on the live 8px frame around the panel used to reach
    // the board and place a tile as the manual closed.
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.game.state.placements).toBe(0);

    // Dragging and the wheel are just as ignored.
    pointer(ctx.el.board, 'pointerdown', 0, 0);
    pointer(ctx.el.board, 'pointermove', 60, 0);
    pointer(ctx.el.board, 'pointerup', 60, 0);
    expect(ctx.renderer.pans).toHaveLength(0);

    // Closed again, the board answers as usual.
    ctx.el.helpPanel.click();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.game.state.placements).toBe(1);
  });

  it('explains a glyph you tap instead of doing nothing', () => {
    const base = newRun(7, TUNING);
    const site = key(4, 0);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: { ...base.cells, [site]: { kind: 'landmark', reward: 'site', claimed: false } },
      },
    });
    ctx.game.start();

    ctx.renderer.nextHit = site;
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(false);
    expect(ctx.el.toast.textContent).toMatch(/★/);
    expect(ctx.el.toast.textContent).toMatch(/SITE/);
    expect(ctx.el.toast.textContent).toMatch(/bounty/i);
    // Explaining is not playing.
    expect(ctx.game.state.placements).toBe(0);

    // And it goes away when you tap it.
    ctx.el.toast.click();
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('describes walls, stone and native ground in the direction’s words', () => {
    const base = newRun(7, TUNING);
    const wall = key(6, 0);
    const stone = key(7, 0);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: { ...base.cells, [wall]: { kind: 'wall' }, [stone]: { kind: 'stone' } },
      },
    });
    ctx.game.start();

    ctx.renderer.nextHit = wall;
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/wall/i);

    ctx.renderer.nextHit = stone;
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/spent ground/i);
  });

  it('announces a claim as an EVENT CARD, and names what a shrine woke', () => {
    // A shrine one hex from a legal spot: placing beside it claims it. A
    // shrine changes what the NEXT run starts with, so it is event-card
    // worthy (Stage 2, 2026-08-18) — held, not a timed-out toast.
    const base = newRun(7, TUNING);
    const shrine = key(2, 0);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: { ...base.cells, [shrine]: { kind: 'landmark', reward: 'shrine', claimed: false } },
      },
      unlockLabel: (nth) => (nth === 0 ? 'A fourth draft card' : null),
    });
    ctx.game.start();

    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    expect(ctx.el.toast.hidden).toBe(true);
    expect(ctx.el.eventCard.hidden).toBe(false);
    // The leading claim's glyph now lives in its own element, large above
    // the words (2026-08-19) — see `#showEventCard`.
    expect(ctx.el.eventCardGlyph.textContent).toBe('◈');
    expect(ctx.el.eventCardText.textContent).toMatch(/SHRINE WOKEN/);
    expect(ctx.el.eventCardText.textContent).toMatch(/A fourth draft card/);
    expect(ctx.el.eventCardText.textContent).toMatch(/next run/i);

    // Held until dismissed — not gone on its own, and gone on a tap.
    ctx.el.eventCard.click();
    expect(ctx.el.eventCard.hidden).toBe(true);
  });

  it('event-cards a territory claim too, and closes it on Escape', () => {
    const base = newRun(7, TUNING);
    const territory = key(2, 0);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: {
          ...base.cells,
          [territory]: { kind: 'landmark', reward: 'territory', claimed: false, colour: 'green' },
        },
      },
    });
    ctx.game.start();

    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.eventCard.hidden).toBe(false);
    expect(ctx.el.eventCardGlyph.textContent).toBe('❖');
    expect(ctx.el.eventCardText.textContent).toMatch(/TERRITORY CLAIMED/);

    // While it is up, the board takes no gesture — the same curtain the
    // manual keeps.
    ctx.renderer.nextHit = key(3, 0);
    tap(ctx.el.board);
    expect(ctx.game.state.placements).toBe(1);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(ctx.el.eventCard.hidden).toBe(true);
  });
});

describe('special tiles and what a pop did', () => {
  /** A ripe green pocket of `size`, with a magic tile in it, on a bare board. */
  const rarePocket = (size: number): GameState => {
    const base = newRun(7, TUNING);
    const cells: Record<string, Cell> = {};
    const members = new Set<string>();
    for (let i = 0; i < size; i++) members.add(key(i, 0));
    for (const k of members) cells[k] = { kind: 'tile', colour: 'green' };
    cells[key(0, 0)] = { kind: 'tile', colour: 'green', rarity: 'magic' };
    for (let i = 0; i < size; i++) {
      for (const n of neighbourKeys(i, 0)) if (!members.has(n)) cells[n] = { kind: 'stone' };
    }
    return { ...base, cells };
  };

  it('explains a rare tile’s power when you tap it', () => {
    // Given an open neighbour so the tile is NOT ripe — a ripe one is a
    // pocket, and tapping it prices the pocket instead (covered below).
    const base = newRun(7, TUNING);
    const spot = key(9, 9);
    const ctx = build(1, TUNING, {
      resume: {
        ...base,
        cells: {
          ...base.cells,
          [spot]: { kind: 'tile', colour: 'blue', rarity: 'unique' },
          [key(10, 9)]: { kind: 'empty' },
        },
      },
    });
    ctx.game.start();

    ctx.renderer.nextHit = spot;
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/UNIQUE/);
    expect(ctx.el.toast.textContent).toMatch(/double/i);
  });

  it('prices a pocket you tap, and says where the numbers come from', () => {
    const ctx = build(1, TUNING, { resume: rarePocket(9) });
    ctx.game.start();

    ctx.renderer.nextHit = key(0, 0);
    tap(ctx.el.board);
    const text = ctx.el.toast.textContent ?? '';
    expect(text).toMatch(/POCKET OF 9/);
    // One price, not a fork (2026-08-21): the note used to read "POP for
    // tiles" and "POP for pts" as if they were buttons to choose between,
    // and the points button has been hidden since the payout became single.
    expect(text).toMatch(/POP pays \+\d+ tiles and \d+ pts/);
    expect(text).toMatch(/The score: worth \d+ × pocket 9 × distance \d+/);
    expect(text).toMatch(/1 rare tile/);
    // The pocket bar (2026-08-18): the count against the size bonus's cap,
    // once the pocket is big enough for the bar to be worth reading (2+).
    expect(text).toMatch(new RegExp(`POCKET 9/${TUNING.harvestSizeCap}`));
  });

  it('keeps the pocket bar off a lone tile — 1/N is noise, not news', () => {
    const ctx = build(1, TUNING, { resume: rarePocket(1) });
    ctx.game.start();
    ctx.renderer.nextHit = key(0, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).not.toMatch(/POCKET \d+\//);
  });

  // `hidePoints` keeps the score off the HUD until the run ends; the single
  // POP button used to print the points figure on itself regardless, which
  // leaked the exact number the setting exists to hide. DEPTH — the same
  // distance multiplier the pocket is about to be scored at — replaces it;
  // the points themselves are learned on the end screen's payout breakdown.
  it('shows depth, not points, on POP while points are hidden', () => {
    const pocketUnder = (tuning: Tuning): GameState => ({ ...rarePocket(9), tuning });

    const hidden = build(1, TUNING, {
      resume: pocketUnder({ ...TUNING, singlePayout: true, hidePoints: true }),
    });
    hidden.game.start();
    hidden.renderer.nextHit = key(0, 0);
    tap(hidden.el.board);
    expect(hidden.el.harvestTiles.textContent).toMatch(/deep/);
    expect(hidden.el.harvestTiles.textContent).not.toMatch(/pts/);

    const shown = build(1, TUNING, {
      resume: pocketUnder({ ...TUNING, singlePayout: true, hidePoints: false }),
    });
    shown.game.start();
    shown.renderer.nextHit = key(0, 0);
    tap(shown.el.board);
    expect(shown.el.harvestTiles.textContent).toMatch(/pts/);
  });

  it('shows the arithmetic of a pop', () => {
    const tiles = build(1, TUNING, { resume: rarePocket(9) });
    tiles.game.start();
    tiles.renderer.nextHit = key(0, 0);
    tap(tiles.el.board);
    tiles.el.harvestTiles.click();
    expect(tiles.el.toast.textContent).toMatch(/POPPED 9/);
    expect(tiles.el.toast.textContent).toMatch(/\+\d+ tiles/);
    // 9 pockets popped from luck 0: flat luckPerPop (9) + count (9) × luckPerTile
    // (0.5) = 13.5, rounded to 14 — reduce.ts's own arithmetic, not the pocket
    // count the line used to print (they only ever coincided by luck, so to
    // speak).
    expect(tiles.el.toast.textContent).toMatch(/Luck \+14\./);
    // TUNING's luck does not move the draft's odds (luckMagicPerPop and
    // luckUniquePerPop are both 0 in the shipped economy) — the claim must
    // not appear when it would be false.
    expect(tiles.el.toast.textContent).not.toMatch(/odds/i);
  });

  it('claims the odds line only when luck actually moves them', () => {
    // `resume` carries its OWN tuning (a resumed run plays under the numbers
    // it was saved with) — the tuning passed to `build` only seeds a fresh
    // run, so the pocket's tuning has to be overridden directly.
    const rare = { ...TUNING, luckMagicPerPop: 0.001, luckUniquePerPop: 0.0005 };
    const tiles = build(1, TUNING, { resume: { ...rarePocket(9), tuning: rare } });
    tiles.game.start();
    tiles.renderer.nextHit = key(0, 0);
    tap(tiles.el.board);
    tiles.el.harvestTiles.click();
    expect(tiles.el.toast.textContent).toMatch(/Luck \+14\. Your rare-tile odds just rose\./);
  });
});

describe('tiles you cannot spend', () => {
  /** A ripe pocket, with the purse and the clock set by hand. */
  const rich = (tiles: number, placements: number): GameState => {
    const base = newRun(7, TUNING);
    const cells: Record<string, Cell> = {};
    const members = new Set<string>();
    for (let i = 0; i < 4; i++) members.add(key(i, 0));
    for (const k of members) cells[k] = { kind: 'tile', colour: 'green' };
    for (let i = 0; i < 4; i++) {
      for (const n of neighbourKeys(i, 0)) if (!members.has(n)) cells[n] = { kind: 'stone' };
    }
    return { ...base, cells, tiles, placements };
  };

  it('says nothing of the sort while the purse still matters', () => {
    const ctx = build(1, TUNING, { resume: rich(30, 10) });
    ctx.game.start();
    expect(ctx.el.harvestTiles.textContent).not.toMatch(/SPARE/);
    expect(ctx.el.hint.textContent).not.toMatch(/more tiles than you can spend/i);
  });
});

describe('the purse, folded', () => {
  /**
   * Marc: "adjust the visuals so its less crammed up, more ui ux user
   * friendly." Six shop buttons wrapping to a second row under the hand were
   * the crammed thing. They fold now — and the fold is not merely tidier: he
   * finished a run with 166 luck unspent while every price sat on screen the
   * whole time, so an always-open shop was not advertising itself either.
   * Closed, the toggle says what you carry and lights up when you can buy.
   */
  const shop = (): { ctx: ReturnType<typeof build>; toggle: HTMLButtonElement } => {
    const ctx = build(7, TUNING);
    ctx.game.start();
    return { ctx, toggle: ctx.el.purseToggle };
  };

  it('starts closed, with the prices out of the way', () => {
    const { ctx, toggle } = shop();
    expect(ctx.el.purse.hidden).toBe(false);
    expect(ctx.el.spends.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toMatch(/LUCK/);
  });

  it('opens on a tap and closes on the next', () => {
    const { ctx, toggle } = shop();
    toggle.click();
    expect(ctx.el.spends.hidden).toBe(false);
    expect(ctx.el.spends.children.length).toBeGreaterThan(0);

    toggle.click();
    expect(ctx.el.spends.hidden).toBe(true);
    // Emptied as well as hidden: the fold's first phone test caught the grid
    // still drawn after closing — #spends' display rule outranked [hidden]
    // (a CSS fact this DOM-only harness cannot see), so the close path must
    // not leave buttons behind for it to draw.
    expect(ctx.el.spends.children.length).toBe(0);
  });

  it('stays quiet while nothing is affordable', () => {
    const { toggle } = shop();
    // A fresh run has no luck at all: the shop is a goal, not an option.
    expect(toggle.classList.contains('live')).toBe(false);
    expect(toggle.textContent).toMatch(/next \d+/);
  });

  it('names the cheapest thing it could sell you, so the fold is not a mystery', () => {
    const { toggle } = shop();
    const cheapest = Math.min(TUNING.luckRerollCost, TUNING.luckSteerCost, TUNING.luckForgeCost);
    expect(toggle.textContent).toContain(String(cheapest));
  });

  /**
   * The odds have moved twice, both times because the surface under them ran
   * out of room. Off the hint line onto the closed toggle (Stage 2,
   * 2026-08-18); off the toggle into the OPEN drawer (2026-08-27), when the
   * toggle became one button in a shared bar and "0 LUCK MAGIC 7% · UNIQUE
   * 1.5% · NEXT 12 ▸" stopped fitting on a quarter of a phone row.
   *
   * The drawer is where they were always most useful: FORGE is priced right
   * under them, and the odds are exactly the number that says whether buying
   * a rare beats waiting to be dealt one.
   */
  it('shows the rare-tile odds in the drawer, beside the prices they inform', () => {
    const { ctx, toggle } = shop();
    // Closed, the bar's button carries the purse and the next price only.
    expect(toggle.textContent).not.toMatch(/magic/i);
    expect(toggle.textContent).toMatch(/LUCK/);

    toggle.click();
    expect(ctx.el.spends.hidden).toBe(false);
    const odds = ctx.el.spends.querySelector('.spend-odds');
    expect(odds).not.toBeNull();
    expect(odds?.textContent ?? '').toMatch(/magic .+ unique/i);
  });
});

describe('the moments pack (2026-08-18)', () => {
  it('announces NEW GROUND once, the first time this run passes the world’s own best', () => {
    const T = { ...TUNING, destinationChance: 0, magicChance: 0, uniqueChance: 0, worldWalls: 0 };
    const ctx = build(1, T, {
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 0 }),
    });
    ctx.game.start();
    expect(ctx.el.toast.hidden).toBe(true);

    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(false);
    expect(ctx.el.toast.textContent).toBe('NEW GROUND — farther than this world has ever reached.');

    // Once only: a second placement, farther still, says nothing new here.
    ctx.el.toast.hidden = true;
    ctx.renderer.nextHit = key(2, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('never announces NEW GROUND on a ?seed= replay', () => {
    const T = { ...TUNING, destinationChance: 0, magicChance: 0, uniqueChance: 0, worldWalls: 0 };
    const ctx = build(1, T, {
      replay: true,
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 0 }),
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('explains UNIQUE once, the moment one first enters the hand', () => {
    // No fake timers any more (2026-08-27): no tip times out, so "once" is
    // proved by dismissing the toast BY TAP and watching it stay gone.
    {
      const T = { ...TUNING, magicChance: 0, uniqueChance: 0 };
      const base = newRun(7, T);
      const withUnique: GameState = {
        ...base,
        draft: base.draft.map((tile, i) =>
          i === 1 ? { ...tile, rarity: 'unique' as const } : tile,
        ),
      };
      const ctx = build(1, T, { resume: withUnique });
      ctx.game.start();
      expect(ctx.el.toast.hidden).toBe(true);

      // SELECT does not redraw the hand — the unique tile is still the one
      // that entered it, and choosing it is a real, distinct action.
      const cards = [...ctx.el.draft.children].filter((c) => !c.classList.contains('hold'));
      (cards[1] as HTMLButtonElement).click();
      expect(ctx.el.toast.textContent).toBe('UNIQUE — every match counts double, both ways.');

      // The tap that dismisses it — the only way out a tip has now.
      ctx.el.toast.click();
      expect(ctx.el.toast.hidden).toBe(true);

      // Once only: it does not fire again. The row is rebuilt on every
      // render, so the card is re-queried — a tap on a NOT-selected card,
      // since tapping the selected one is the colour question now
      // (2026-08-19), not a re-select.
      const fresh = [...ctx.el.draft.children].filter((c) => !c.classList.contains('hold'));
      (fresh[0] as HTMLButtonElement).click();
      expect(ctx.el.toast.hidden).toBe(true);
    }
  });

  // announceArrival is the shell's to call when BEGIN lifts the front door
  // (fresh-eyes finding 9, 2026-08-19): fired at boot, the toast played its
  // five seconds to the back of the door and the receipt died unseen.
  it('names what the previous run woke, once BEGIN is actually looking', () => {
    const ctx = build(1, TUNING, { shrineReceipt: ['A fourth draft card'] });
    ctx.game.start();
    // Boot alone says nothing — the door is still up.
    expect(ctx.el.toast.hidden).toBe(true);
    ctx.game.announceArrival();
    expect(ctx.el.toast.textContent).toBe('Awake since your last run: A fourth draft card.');
  });

  it('says nothing about the receipt on a resumed run', () => {
    const ctx = build(1, TUNING, {
      resume: newRun(7, TUNING),
      shrineReceipt: ['A fourth draft card'],
    });
    ctx.game.start();
    ctx.game.announceArrival();
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('names the territory why-line at a fresh run’s start, when it changed the purse', () => {
    const claimed = [key(9, 9), key(-9, 9)];
    const ctx = build(1, TUNING, undefined, claimed);
    ctx.game.start();
    ctx.game.announceArrival();
    expect(ctx.el.toast.textContent).toBe('+12 tiles from territories held.');
  });

  it('joins the shrine receipt and the territory why-line when both fire', () => {
    const claimed = [key(9, 9), key(-9, 9)];
    const ctx = build(1, TUNING, { shrineReceipt: ['A fourth draft card'] }, claimed);
    ctx.game.start();
    ctx.game.announceArrival();
    expect(ctx.el.toast.textContent).toBe(
      'Awake since your last run: A fourth draft card. +12 tiles from territories held.',
    );
  });

  // The next-rung line these two tests used to pin ("DEEPER PURSE in 15" /
  // its bare price when affordable, 2026-08-18) was REMOVED on Marc's
  // report (2026-08-20): at "DEEPER PURSE in 56" it read as noise, and the
  // shelf inside prices every rung already. The door itself carries the
  // emphasis now — count and GO BUY — pinned here in the rung line's place.
  it('never teases the next rung; the door itself says the count and GO BUY', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    let progress: Progress = { ...EMPTY_PROGRESS, relics: 5, met: [...TEACH_IDS] };
    const ctx = build(1, TUNING, {
      resume: ended,
      shop: {
        read: () => progress,
        write: (p) => {
          progress = p;
        },
      },
    });
    ctx.game.start();

    const cheapest = [...UPGRADES].sort((a, b) => a.cost - b.cost)[0]!;
    const text = ctx.el.end.textContent ?? '';
    expect(text).not.toContain(`${cheapest.name} in ${cheapest.cost - 5}`);
    expect(ctx.el.end.querySelector('#end-shop-open')?.textContent).toBe('RELICS5 · GO BUY ▸');
  });
});

describe('TITHE (2026-08-18)', () => {
  it('lists the row, and converts the whole purse to relics on tap', () => {
    const rich: GameState = { ...newRun(7, TUNING), luck: 100 };
    const ctx = build(1, TUNING, { resume: rich });
    ctx.game.start();
    ctx.el.purseToggle.click();

    const button = [...ctx.el.spends.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.dataset['spend'] === 'tithe',
    );
    expect(button).not.toBeUndefined();
    const expected = Math.floor(100 * TUNING.titheRate);
    expect(button!.textContent).toBe(`SACRIFICE LUCK — all → ${expected} relics`);
    expect(button!.disabled).toBe(false);

    button!.click();
    expect(ctx.game.state.luck).toBe(0);
    expect(ctx.game.state.relics).toBe(expected);
    expect(ctx.el.toast.textContent).toBe(`Sacrificed 100 luck for ${expected} relics.`);
  });

  it('disables the row under titheMin, the same "goal not a trap" floor the engine keeps', () => {
    const poor: GameState = { ...newRun(7, TUNING), luck: TUNING.titheMin - 1 };
    const ctx = build(1, TUNING, { resume: poor });
    ctx.game.start();
    ctx.el.purseToggle.click();

    const button = [...ctx.el.spends.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.dataset['spend'] === 'tithe',
    );
    expect(button!.disabled).toBe(true);
  });
});

describe('the survey, in the shell (2026-08-18)', () => {
  it('announces a newly-met goal as a toast', () => {
    const T = { ...TUNING, destinationChance: 0, magicChance: 0, uniqueChance: 0, worldWalls: 0 };
    const ctx = build(1, T, {
      checkGoals: () => 'Reach 20 hexes from home (+40 relics)',
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toBe('GOAL MET — Reach 20 hexes from home (+40 relics)');
  });

  it('says nothing when the hook has nothing to report', () => {
    const T = { ...TUNING, destinationChance: 0, magicChance: 0, uniqueChance: 0, worldWalls: 0 };
    // A `worldStats` hook with a farthest reach this placement cannot pass —
    // otherwise NEW GROUND (also silent-by-default) would fire instead, and
    // the test would prove the wrong thing.
    const ctx = build(1, T, {
      checkGoals: () => null,
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 100 }),
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('mentions a goal met this run in the end screen’s CARRIED OUT strip', () => {
    const T = { ...TUNING, destinationChance: 0, magicChance: 0, uniqueChance: 0, worldWalls: 0 };
    const dying: GameState = { ...newRun(7, T), tiles: 1 };
    const ctx = build(1, T, {
      resume: dying,
      checkGoals: () => 'Reach 20 hexes from home (+40 relics)',
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    expect(ctx.game.state.phase).toBe('ended');
    expect(ctx.el.end.textContent).toMatch(/✓ goal met — Reach 20 hexes from home \(\+40 relics\)/);
  });
});

describe('hidden finds in the shell', () => {
  /** A run with an unclaimed find planted one placement from the clearing. */
  const withFind = (hooks: GameHooks = {}): ReturnType<typeof build> & { find: HexKey } => {
    const base = newRun(7, TUNING);
    const find = key(2, 0);
    const ctx = build(1, TUNING, {
      ...hooks,
      resume: {
        ...base,
        cells: { ...base.cells, [find]: { kind: 'landmark', reward: 'find', claimed: false } },
      },
    });
    ctx.game.start();
    return { ...ctx, find };
  };

  it('announces the claim once, with the granted perk name, and only once', () => {
    const granted: HexKey[] = [];
    const ctx = withFind({
      findLabel: (hex) => {
        granted.push(hex);
        return 'STONEWALKER';
      },
    });

    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    expect(granted).toEqual([ctx.find]);
    // A find changes what the NEXT run starts with — event-card worthy
    // (Stage 2, 2026-08-18), not the timed-out toast.
    expect(ctx.el.toast.hidden).toBe(true);
    expect(ctx.el.eventCard.hidden).toBe(false);
    expect(ctx.el.eventCardGlyph.textContent).toBe('✦');
    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/FOUND — STONEWALKER/);
    expect(text).toMatch(/THE SHOP/i);

    // Rendering again must not grant again — the card fired on the claim,
    // not on the frame.
    ctx.game.render();
    ctx.game.render();
    expect(granted).toHaveLength(1);
  });

  it('claims two landmarks from one placement — both side effects run, rarest first', () => {
    // The old `#claimNote` returned on the FIRST claim it saw, which ate a
    // find's grant (or a shrine's counter) whenever the same placement also
    // reached something else. One tile beside a cache AND a find must fire
    // both: the perk is granted, and the card says so — the find leads, so
    // the WHOLE note (cache included) is event-card worthy.
    const base = newRun(7, TUNING);
    const find = key(2, 0);
    const cache = key(2, -1);
    const granted: HexKey[] = [];
    const ctx = build(1, TUNING, {
      findLabel: (hex) => {
        granted.push(hex);
        return 'STONEWALKER';
      },
      resume: {
        ...base,
        cells: {
          ...base.cells,
          [find]: { kind: 'landmark', reward: 'find', claimed: false },
          [cache]: { kind: 'landmark', reward: 'cache', claimed: false },
        },
      },
    });
    ctx.game.start();

    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    expect(granted).toEqual([find]);
    expect(ctx.el.toast.hidden).toBe(true);
    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/FOUND — STONEWALKER/);
    expect(text).toMatch(/CACHE CLAIMED/);
    // The find is the rarer claim (find > shrine > territory > site > cache)
    // and leads the note; the cache follows after a blank line.
    expect(text.indexOf('FOUND')).toBeLessThan(text.indexOf('CACHE'));
  });

  it('says the vault was empty honestly when nothing is granted', () => {
    const ctx = withFind({ findLabel: () => null });
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.eventCardText.textContent).toMatch(/Nothing new inside/);
  });

  it('describes a tapped find without giving the mystery away', () => {
    const ctx = withFind();
    ctx.renderer.nextHit = ctx.find;
    tap(ctx.el.board);
    const text = ctx.el.toast.textContent ?? '';
    expect(text).toMatch(/Something is here/);
    // No perk name, no reward, no odds — the mystery is the design.
    expect(text).not.toMatch(/perk/i);
  });
});

describe('the shelf', () => {
  /** An ended run whose shop reads a live progress object. */
  const shelf = (found: string[], equipped: string[]) => {
    let progress: Progress = {
      ...EMPTY_PROGRESS,
      found: found as Progress['found'],
      equipped: equipped as Progress['equipped'],
      // A taught device, so the shelf tests stay about the shelf — and the
      // shop door stays rendered for the walk-through below even at 0 relics.
      met: [...TEACH_IDS],
    };
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    const ctx = build(1, TUNING, {
      resume: ended,
      shop: {
        read: () => progress,
        write: (p) => {
          progress = p;
        },
      },
    });
    ctx.game.start();
    // The shop lives behind its own door since the end/spend split — the
    // shelf is inside it, so these tests walk through first.
    (ctx.el.end.querySelector('#end-shop-open') as HTMLButtonElement).click();
    return { ...ctx, current: () => progress };
  };

  it('keeps the run screen and the shop apart, one door between them', () => {
    const ctx = shelf([], []);
    // We are in the shop (the helper opened the door): rows, no epitaph.
    expect(ctx.el.end.querySelector('.shop-row')).not.toBeNull();
    expect(ctx.el.end.querySelector('.end-epitaph')).toBeNull();

    (ctx.el.end.querySelector('#end-shop-back') as HTMLButtonElement).click();
    // Back on the run screen: the picture, the door, and no shop rows. The
    // door is a promoted row (Marc, 2026-08-20) — the count and GO BUY,
    // tappable, accent-forward — and the next-rung tease that sat under it
    // ("DEEPER PURSE in 56") is gone by the same report: the shelf inside
    // prices every rung already.
    expect(ctx.el.end.querySelector('.end-epitaph')).not.toBeNull();
    expect(ctx.el.end.querySelector('.shop-row')).toBeNull();
    const door = ctx.el.end.querySelector('#end-shop-open');
    expect(door?.textContent).toMatch(/RELICS\d+ · GO BUY/);
    expect(door?.classList.contains('end-shop-door')).toBe(true);
    // The rung line was always an UPPERCASE upgrade name + "in N" or its
    // bare price — no end-facts line should carry that shape any more.
    const facts = [...ctx.el.end.querySelectorAll('.end-facts')].map((f) => f.textContent ?? '');
    expect(facts.some((f) => /^[A-Z][A-Z ]+ (in )?\d+$/.test(f))).toBe(false);
  });

  it('shows owned perks by name, and names only the COUNT of the rest', () => {
    const ctx = shelf(['stonewalker'], ['stonewalker']);
    const text = ctx.el.end.textContent ?? '';

    expect(text).toMatch(/THE SHELF · 1\/5 FOUND/);
    expect(text).toMatch(/STONEWALKER/);
    expect(text).toMatch(/beside stone cost 1 less/i);
    // Four perks unowned: one line naming the count, not four identical
    // UNDISCOVERED rows — and not one of their names, still.
    expect(text).toMatch(/4 more/);
    expect(text).not.toMatch(/UNDISCOVERED/);
    for (const name of ['ROOTBOUND', 'SECOND WIND', 'WALLBREAKER', 'OPEN HAND']) {
      expect(text).not.toContain(name);
    }
    expect(text).toMatch(/One perk may be worn at a time/);
  });

  it('keeps the worn count at one: wearing a second replaces the first', () => {
    const ctx = shelf(['stonewalker', 'wallbreaker'], ['stonewalker']);
    const wear = [...ctx.el.end.querySelectorAll<HTMLButtonElement>('.shop-buy')].find(
      (b) => b.textContent === 'WEAR',
    );
    expect(wear).not.toBeUndefined();
    wear!.click();

    expect(ctx.current().equipped).toEqual(['wallbreaker']);
  });
});

describe('teaching, drop by drop (2026-08-19)', () => {
  /**
   * The drip (`ideas/teaching.md`): a fresh device meets each concept once,
   * as a card or a toast, at the moment it first happens — and the ledger,
   * the manual and the HUD all read the same `met` list. The quiet economy
   * below (no stray landmarks, walls or rares) keeps every trigger in the
   * test's own hands.
   */
  const T: Tuning = {
    ...TUNING,
    destinationChance: 0,
    magicChance: 0,
    uniqueChance: 0,
    worldWalls: 0,
  };

  /** A live progress store, the same shape main.ts lends the game. */
  const device = (progress: Progress = EMPTY_PROGRESS) => {
    let current = progress;
    return {
      shop: {
        read: () => current,
        write: (p: Progress) => {
          current = p;
        },
      },
      current: () => current,
    };
  };

  /**
   * A run one placement from its first ripe tile: `pocket` has five of six
   * neighbours tiled, and placing `lastSide` surrounds it. `spare` is plain
   * materialised ground beside a filler tile, for the quiet placement an
   * armed moment fires on.
   */
  const nearlyRipe = () => {
    const base = newRun(7, T);
    const pocket = key(3, 0);
    const sides = neighbourKeys(3, 0);
    const lastSide = sides[5]!;
    const cells: Record<HexKey, Cell> = {
      ...base.cells,
      [pocket]: { kind: 'tile', colour: 'green' },
    };
    for (const side of sides.slice(0, 5)) cells[side] = { kind: 'tile', colour: 'green' };
    cells[lastSide] = { kind: 'empty' };
    const spare = neighbourKeys(4, 0).find((k) => !(k in cells))!;
    cells[spare] = { kind: 'empty' };
    return { state: { ...base, cells }, lastSide, spare };
  };

  /** The same ledger, plus ids this test is not the subject of. */
  const taughtAlso = (progress: Progress, ...ids: TeachId[]): Progress => ({
    ...progress,
    met: [...new Set([...progress.met, ...ids])],
  });

  const setup = (progress?: Progress, extraHooks: GameHooks = {}) => {
    const fixture = nearlyRipe();
    const dev = device(progress);
    const ctx = build(1, T, { resume: fixture.state, shop: dev.shop, ...extraHooks });
    ctx.game.start();
    return { ...ctx, lastSide: fixture.lastSide, spare: fixture.spare, dev };
  };

  it('teaches RIPE on the placement that makes the first ripe tile — once, ever', () => {
    const s = setup();
    s.renderer.nextHit = s.lastSide;
    tap(s.el.board);

    expect(s.el.eventCard.hidden).toBe(false);
    expect(s.el.eventCardText.textContent).toMatch(/RIPENS and lights up/);
    expect(s.dev.current().met).toContain('ripe');

    // The same moment on a taught device says nothing of the sort — and the
    // quiet beat goes back to the moments that were always there (this board
    // out-reaches a fresh world, so NEW GROUND rightly takes the slot).
    // `colours` too (2026-08-27): the four grounds are a CARD on a virgin
    // ledger, and they would rightly take this beat. What is under test is
    // that RIPE does not repeat, so everything else this run would teach is
    // marked taught first.
    const again = setup(taughtAlso(s.dev.current(), 'colours'));
    again.renderer.nextHit = again.lastSide;
    tap(again.el.board);
    expect(again.el.eventCard.hidden).toBe(true);
    expect(again.el.toast.textContent ?? '').not.toMatch(/RIPENS/);
  });

  it('folds the first pop’s receipt into its own card, then gets out of the way', () => {
    const s = setup();
    s.renderer.nextHit = s.lastSide;
    tap(s.el.board);
    s.el.eventCard.click(); // dismiss the RIPE card

    s.el.harvestTiles.click(); // the first pop this device has ever made
    expect(s.el.eventCard.hidden).toBe(false);
    const text = s.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/YOUR FIRST POP/);
    // The receipt rode along on the card — the arithmetic was not lost to it.
    expect(text).toMatch(/POPPED/);
    expect(s.dev.current().met).toContain('pop');

    // A second pop, taught, is the ordinary receipt toast. `colours` too —
    // see the RIPE test above for why.
    const later = setup(taughtAlso(s.dev.current(), 'colours'));
    later.renderer.nextHit = later.lastSide;
    tap(later.el.board);
    later.el.harvestTiles.click();
    expect(later.el.eventCard.hidden).toBe(true);
    expect(later.el.toast.textContent).toMatch(/POPPED/);
  });

  it('keeps LUCK armed through the pop that earned it, and speaks on the next quiet action', () => {
    const s = setup();
    s.renderer.nextHit = s.lastSide;
    tap(s.el.board);
    s.el.eventCard.click();
    s.el.harvestTiles.click(); // pays the first luck; the pop card wins the beat
    expect(s.game.state.luck).toBeGreaterThan(0);
    expect(s.dev.current().met).not.toContain('luck');
    s.el.eventCard.click();

    s.renderer.nextHit = s.spare; // a quiet placement
    tap(s.el.board);
    expect(s.el.eventCard.hidden).toBe(false);
    expect(s.el.eventCardText.textContent).toMatch(/LUCK/);
    expect(s.dev.current().met).toContain('luck');
  });

  it('hides the LUCK stat and the purse fold until luck exists — and never hides real money', () => {
    const s = setup();
    expect(s.el.stats.querySelector('[data-stat="luck"]')).toBeNull();
    expect(s.el.purse.hidden).toBe(true);

    // Earned luck shows the stat at once, taught or not.
    s.renderer.nextHit = s.lastSide;
    tap(s.el.board);
    s.el.eventCard.click();
    s.el.harvestTiles.click();
    expect(s.el.stats.querySelector('[data-stat="luck"]')).not.toBeNull();

    // A taught device shows both from frame one, even at zero.
    const taught = setup({ ...EMPTY_PROGRESS, met: [...TEACH_IDS] });
    expect(taught.el.stats.querySelector('[data-stat="luck"]')).not.toBeNull();
    expect(taught.el.purse.hidden).toBe(false);
  });

  it('grows the manual with the ledger, and says so in one quiet foot line', () => {
    const s = setup();
    s.game.openHelp();
    const fresh = s.el.helpManual.textContent ?? '';
    expect(fresh).not.toContain('RARE TILES');
    expect(fresh).not.toContain('LUCK IS A PURSE');
    expect(fresh).not.toContain('RELICS AND THE SHOP');
    expect(fresh).not.toContain('✚ CACHE');
    expect(fresh).toContain('More appears here as you meet it.');
    // START stays whole — it is the stranger's tab.
    expect(fresh).toContain('WHAT YOU SEE');

    // Met everything: today's manual, whole, no foot line.
    s.dev.shop.write({ ...s.dev.current(), met: [...TEACH_IDS] });
    s.game.openHelp();
    const grown = s.el.helpManual.textContent ?? '';
    expect(grown).toContain('RARE TILES');
    expect(grown).toContain('LUCK IS A PURSE');
    expect(grown).toContain('RELICS AND THE SHOP');
    // The destination rows wear the glyph the BOARD draws, read from the
    // registry rather than typed in (2026-08-27): the mark is its own
    // element now, so `textContent` runs them together.
    expect(grown).toContain(`${LANDMARK_GLYPH.cache}CACHE`);
    expect(grown).not.toContain('More appears here as you meet it.');
  });

  it('names the worn perk under WHAT YOU CARRY, mid-run — and not on a replay', () => {
    const worn: Progress = {
      ...EMPTY_PROGRESS,
      found: ['stonewalker'],
      equipped: ['stonewalker'],
      met: [...TEACH_IDS],
    };
    const s = setup(worn);
    s.game.openHelp();
    const text = s.el.helpManual.textContent ?? '';
    expect(text).toContain('WHAT YOU CARRY');
    expect(text).toContain('STONEWALKER');
    expect(text).toMatch(/beside stone cost 1 less/i);

    // A replay plays the plain economy; claiming the perk works would lie.
    const replayed = setup(worn, { replay: true });
    replayed.game.openHelp();
    expect(replayed.el.helpManual.textContent ?? '').not.toContain('WHAT YOU CARRY');
  });

  it('says what a found perk DOES on its card, and that it is already worn', () => {
    const dev = device({
      ...EMPTY_PROGRESS,
      found: ['stonewalker'],
      equipped: ['stonewalker'],
      met: [...TEACH_IDS],
    });
    const base = newRun(7, T);
    const find = key(2, 0);
    const ctx = build(1, T, {
      findLabel: () => 'STONEWALKER',
      shop: dev.shop,
      resume: {
        ...base,
        cells: { ...base.cells, [find]: { kind: 'landmark', reward: 'find', claimed: false } },
      },
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/FOUND — STONEWALKER/);
    expect(text).toMatch(/beside stone cost 1 less/i);
    expect(text).toMatch(/Already worn/);
  });

  it('tells an unworn find where WEAR lives instead', () => {
    const dev = device({ ...EMPTY_PROGRESS, met: [...TEACH_IDS] });
    const base = newRun(7, T);
    const find = key(2, 0);
    const ctx = build(1, T, {
      findLabel: () => 'STONEWALKER',
      shop: dev.shop,
      resume: {
        ...base,
        cells: { ...base.cells, [find]: { kind: 'landmark', reward: 'find', claimed: false } },
      },
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/WEAR it in THE SHOP/);
    expect(text).not.toMatch(/Already worn/);
  });

  it('explains a tapped stat where it sits, in the run’s own numbers', () => {
    const ctx = build();
    ctx.game.start();
    const cost = ctx.el.stats.querySelector<HTMLElement>('[data-stat="cost"]');
    expect(cost).not.toBeNull();
    // A div wearing the button role — the global button chrome must not
    // restyle the stat row, but the keyboard path still has to exist.
    expect(cost!.getAttribute('role')).toBe('button');
    expect(cost!.tabIndex).toBe(0);

    cost!.click();
    expect(ctx.el.toast.hidden).toBe(false);
    expect(ctx.el.toast.textContent).toMatch(/clock that ends every run/);
  });

  it('keeps the shop door off the end screen until relics have ever existed', () => {
    const dev = device();
    const ended: GameState = { ...newRun(9, T), phase: 'ended', death: 'broke' };
    const ctx = build(1, T, { resume: ended, shop: dev.shop });
    ctx.game.start();

    expect(ctx.el.end.querySelector('#end-shop-open')).toBeNull();
    expect(ctx.el.eventCard.hidden).toBe(true);
  });

  it('teaches relics at the ended transition that banked the first ones, and opens the door', () => {
    const dev = device({ ...EMPTY_PROGRESS, relics: 5 });
    const ended: GameState = { ...newRun(9, T), phase: 'ended', death: 'broke' };
    const ctx = build(1, T, { resume: ended, shop: dev.shop });
    ctx.game.start();

    expect(ctx.el.eventCard.hidden).toBe(false);
    expect(ctx.el.eventCardText.textContent).toMatch(/RELICS/);
    expect(dev.current().met).toContain('relic');
    expect(ctx.el.end.querySelector('#end-shop-open')).not.toBeNull();
  });

  it('upgrades the FIRST site claim to the held card; later sites stay toasts', () => {
    const claimSite = (progress?: Progress) => {
      const dev = device(progress);
      const base = newRun(7, T);
      const ctx = build(1, T, {
        shop: dev.shop,
        resume: {
          ...base,
          cells: {
            ...base.cells,
            [key(2, 0)]: { kind: 'landmark', reward: 'site', claimed: false },
          },
        },
      });
      ctx.game.start();
      ctx.renderer.nextHit = key(1, 0);
      tap(ctx.el.board);
      return { ctx, dev };
    };

    const first = claimSite();
    expect(first.ctx.el.eventCard.hidden).toBe(false);
    expect(first.ctx.el.eventCardText.textContent).toMatch(/SITE CLAIMED/);
    expect(first.dev.current().met).toContain('site');

    const second = claimSite(first.dev.current());
    expect(second.ctx.el.eventCard.hidden).toBe(true);
    expect(second.ctx.el.toast.textContent).toMatch(/SITE CLAIMED/);
  });

  it('teaches nothing at all where no ledger exists to remember it', () => {
    // No shop hook — the gallery, a bare build. A card that repeats forever
    // is worse than none, so the drip stays silent and everything shows.
    const fixture = nearlyRipe();
    const ctx = build(1, T, { resume: fixture.state });
    ctx.game.start();
    ctx.renderer.nextHit = fixture.lastSide;
    tap(ctx.el.board);
    expect(ctx.el.eventCard.hidden).toBe(true);

    ctx.game.openHelp();
    const manual = ctx.el.helpManual.textContent ?? '';
    expect(manual).toContain('LUCK IS A PURSE');
    expect(manual).not.toContain('More appears here as you meet it.');
  });

  it('tells a genuinely virgin device how to place, once, when the door lifts', () => {
    // The very first lesson (2026-08-20): an EMPTY ledger — fresh install or
    // RESET TEACHING — gets one card at announceArrival. Any prior teaching
    // marks the device a veteran: the `place` id arrived after launch-week
    // ledgers existed, and none of them may be greeted like a stranger.
    const dev = device();
    const first = build(1, T, { shop: dev.shop });
    first.game.start();
    first.game.announceArrival();
    expect(first.el.eventCard.hidden).toBe(false);
    expect(first.el.eventCardText.textContent).toMatch(/glowing hex/);
    expect(dev.current().met).toContain('place');

    const veteran = device({ ...EMPTY_PROGRESS, met: ['ripe'] });
    const again = build(1, T, { shop: veteran.shop });
    again.game.start();
    again.game.announceArrival();
    expect(again.el.eventCard.hidden).toBe(true);
  });

  it('explains the whole purse — and that you can lose it all — on its first opening', () => {
    // Marc, 2026-08-20: "when the first time we expand the luck toggle
    // explain all and that you can lose it all too." The rows print their
    // prices; the card carries what a price cannot say.
    const dev = device();
    const ctx = build(1, T, { shop: dev.shop });
    ctx.game.start();

    ctx.el.purseToggle.click();
    expect(ctx.el.eventCard.hidden).toBe(false);
    expect(ctx.el.eventCardText.textContent).toMatch(/lose it all/i);
    expect(ctx.el.eventCardText.textContent).toMatch(/mostly gone|lost outright/);
    expect(dev.current().met).toContain('purse');

    // Taught is taught: close the card, fold and reopen — no second card.
    ctx.el.eventCard.click();
    ctx.el.purseToggle.click();
    ctx.el.purseToggle.click();
    expect(ctx.el.eventCard.hidden).toBe(true);
  });

  /**
   * THE FOUR GROUNDS, taught together, the first time any of them is seen
   * (Marc, 2026-08-27: "teach all tiles at one in a beautiful tip"). The
   * shape changed twice in three days — first-placement, then first-sight
   * per colour, then all four on one card — and the reason the last one wins
   * is that the four only mean anything AGAINST each other: every hand is a
   * choice between them, and a player told about one on action 1 and another
   * on action 4 never holds the comparison the choice needs.
   */
  it('teaches all four grounds on one card, the first time any is in hand', () => {
    const T2: Tuning = { ...T, biomeEvery: 0 };
    const dev = device();
    const base = newRun(7, T2);
    const ctx = build(1, T2, {
      shop: dev.shop,
      // Everything already met but the grounds, so the card under test owns
      // the beat rather than queueing behind RIPE or the first-placement card.
      resume: { ...base, selected: 0 },
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 99 }),
    });
    ctx.game.start();
    // A virgin ledger opens on THE EXPEDITION; clear it so the next action's
    // moment is the one being measured.
    ctx.el.eventCard.click();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);

    expect(ctx.el.eventCard.hidden).toBe(false);
    expect(ctx.el.eventCardText.textContent).toMatch(/THE FOUR GROUNDS|four/i);

    // One row per colour whose personality is actually live, each carrying
    // that ground's own sentence and its own swatch.
    const rows = [...ctx.el.eventCardRows.querySelectorAll('.tip-row')];
    expect(rows).toHaveLength(4);
    const all = rows.map((r) => r.textContent ?? '').join(' | ');
    expect(all).toMatch(/CROWDS/);
    expect(all).toMatch(/COMPANY/);
    expect(all).toMatch(/ASH/);
    expect(all).toMatch(/TIDE/);
    for (const colour of ['green', 'yellow', 'red', 'blue']) {
      expect(
        ctx.el.eventCardRows.querySelector(`.tip-swatch[data-colour="${colour}"]`),
      ).not.toBeNull();
    }
    // Name, hue AND symbol — the draft card's own three channels (2026-08-27),
    // so the channel that survives colour blindness is present here too.
    for (const colour of COLOURS) expect(all).toContain(COLOUR_MARK[colour]);
    expect(dev.current().met).toContain('colours');
  });

  it('leaves the grounds card out where no personality is switched on', () => {
    // The bare game: four names and no reasons is not a lesson.
    const dev = device();
    const bare: Tuning = {
      ...BARE_TUNING,
      greenCrowdBonus: 0,
      yellowCompanyBonus: 0,
      redAshMatches: false,
      blueTideEvery: 0,
    };
    const ctx = build(1, bare, { shop: dev.shop, resume: newRun(7, bare) });
    ctx.game.start();
    ctx.el.eventCard.click();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    expect(ctx.el.eventCardRows.children).toHaveLength(0);
    expect(dev.current().met).not.toContain('colours');
  });

  it('puts the selected card down on a second tap, explaining it as it goes', () => {
    const ctx = build();
    ctx.game.start();
    const selected = ctx.el.draft.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(selected).not.toBeNull();
    selected!.click();
    expect(ctx.el.toast.hidden).toBe(false);
    expect(ctx.el.toast.textContent).toMatch(/CROWDS|COMPANY|ASH|TIDE/);
    // The hand empties (Marc, 2026-08-20: "we can always unselect a selected
    // tile by tapping it again") — and a tap on any card picks back up.
    expect(ctx.game.state.selected).toBe(-1);
    const card = ctx.el.draft.children[0] as HTMLButtonElement;
    card.click();
    expect(ctx.game.state.selected).toBe(0);
  });

  it('names a tapped placed tile’s personality where it sits', () => {
    const base = newRun(7, T);
    const ctx = build(1, T, {
      resume: {
        ...base,
        cells: { ...base.cells, [key(2, 0)]: { kind: 'tile', colour: 'blue' } },
      },
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(2, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.textContent).toMatch(/TIDE/);
    expect(ctx.el.toast.textContent).toMatch(/hexes from home/);
  });

  it('teaches the last-gasp rule the first time a placement costs more than you hold', () => {
    // Everything else met, so the one toast in question owns the beat.
    const dev = device({
      ...EMPTY_PROGRESS,
      met: TEACH_IDS.filter((id) => id !== 'lastGasp'),
    });
    const fixture = nearlyRipe();
    // 200 placements in: the cost curve is far past the single tile held.
    const broke: GameState = { ...fixture.state, tiles: 1, placements: 200 };
    const ctx = build(1, T, { resume: broke, shop: dev.shop });
    ctx.game.start();
    ctx.renderer.nextHit = fixture.lastSide;
    tap(ctx.el.board);

    expect(ctx.game.state.tiles).toBe(0);
    expect(ctx.el.toast.textContent).toMatch(/forgiven at zero/);
    expect(dev.current().met).toContain('lastGasp');
  });
});

describe('the crossing (2026-08-19)', () => {
  /** A run one placement from an unclaimed shrine, under the given hooks. */
  const shrineAt = (hooks: GameHooks) => {
    const base = newRun(7, TUNING);
    const ctx = build(1, TUNING, {
      ...hooks,
      resume: {
        ...base,
        cells: {
          ...base.cells,
          [key(2, 0)]: { kind: 'landmark', reward: 'shrine', claimed: false },
        },
      },
    });
    ctx.game.start();
    ctx.renderer.nextHit = key(1, 0);
    tap(ctx.el.board);
    return ctx;
  };

  const actionButton = (): HTMLButtonElement =>
    document.getElementById('event-card-action') as HTMLButtonElement;

  it('offers the crossing on a fully-awake shrine — priced, armed, refusable', () => {
    const carriedOut: number[] = [];
    const ctx = shrineAt({
      unlockLabel: () => null, // every rung woken: the ledger is done
      crossing: {
        dowry: () => 100,
        cross: (carried) => {
          carriedOut.push(carried);
        },
      },
    });

    expect(ctx.el.eventCard.hidden).toBe(false);
    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/THE WORLD IS AWAKE/);
    expect(text).toMatch(/100 relics/);
    expect(text).toMatch(/NEW WORLD/);
    // The honest half (2026-08-20): a world's shop is its own now, so
    // crossing spends it, and this card is the last place to say so.
    expect(text).toMatch(/BOUGHT in this world stay behind/);
    expect(text).toMatch(/perks come with you/);

    // The card grew its choice: CROSS acts, and the dismiss reads as STAY.
    const act = actionButton();
    expect(act.hidden).toBe(false);
    // The button names the TOTAL — dowry plus what the run is carrying — so
    // the number on it is the number that lands in the purse.
    expect(act.textContent).toContain(String(100 + ctx.game.state.relics));
    expect(ctx.el.eventCardDismiss.textContent).toBe('STAY');

    // ARMED, since 2026-08-20: crossing forgets a world, and every other
    // control that does has always taken two taps. The first is swallowed —
    // the card's own close-on-any-tap must not dismiss the offer instead.
    act.click();
    expect(carriedOut).toEqual([]);
    expect(act.textContent).toMatch(/TAP AGAIN/);
    expect(ctx.el.eventCard.hidden).toBe(false);

    act.click();
    // It carries the run's own relics out, not only the dowry: the crossing
    // is the one run-ending that never goes through `finish`, so before this
    // the run's earnings died with the world.
    expect(carriedOut).toEqual([ctx.game.state.relics]);
    // The same bubbling click that dismisses every card closed this one too.
    expect(ctx.el.eventCard.hidden).toBe(true);
  });

  it('speaks a detour shrine honestly — no home ledger, no crossing to offer', () => {
    // Fresh-eyes finding 5 (2026-08-19): a daily shrine used to narrate the
    // HOME world's next unlock, or claim "fully awake", when a detour
    // records nothing anywhere. It says what shrines ARE now.
    const ctx = shrineAt({
      unlockLabel: () => null,
      replay: true,
      crossing: {
        dowry: () => 9,
        cross: () => {
          throw new Error('a replay must never cross');
        },
      },
    });
    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/On your own world/);
    expect(text).toMatch(/shared run keeps nothing/i);
    expect(text).not.toMatch(/fully awake/);
    expect(actionButton().hidden).toBe(true);
    expect(ctx.el.eventCardDismiss.textContent).toBe('GOT IT');
  });

  it('never competes with a real unlock — rungs first, the way onward after', () => {
    const ctx = shrineAt({
      unlockLabel: () => 'A fourth draft card',
      crossing: {
        dowry: () => 9,
        cross: () => {
          throw new Error('an unfinished ledger must never cross');
        },
      },
    });
    expect(ctx.el.eventCardText.textContent).toMatch(/A fourth draft card/);
    expect(actionButton().hidden).toBe(true);
  });
});

describe('fog memory, and the divining rod it must not be (2026-08-19)', () => {
  /** A hashed destination beyond the beacon horizon of a fresh run, if any. */
  const farDestination = (seed: number): HexKey | null => {
    for (let q = -40; q <= 40; q++) {
      for (let r = -40; r <= 40; r++) {
        if (distance({ q, r }, { q: 0, r: 0 }) <= TUNING.beaconHorizon + 2) continue;
        if (destinationAt(seed, q, r, TUNING) !== null) return key(q, r);
      }
    }
    return null;
  };

  it('keeps unseen fog dark on tap, and names what memory has actually seen', () => {
    const far = farDestination(7);
    expect(far).not.toBeNull();
    const { q, r } = parse(far!);
    expect(distance({ q, r }, { q: 0, r: 0 })).toBeGreaterThan(TUNING.beaconHorizon);

    // Never seen, beyond the horizon: tap-scanning must not identify it.
    const dark = build(1, TUNING, { resume: newRun(7, TUNING) });
    dark.game.start();
    dark.renderer.nextHit = far;
    tap(dark.el.board);
    expect(dark.el.toast.textContent).toMatch(/Dark ground/);
    expect(dark.el.toast.textContent).not.toMatch(/CACHE|SITE|SHRINE|TERRITORY/);

    // Remembered from an earlier run: memory shows what it saw.
    const seen = build(1, TUNING, { resume: newRun(7, TUNING), memory: [far!] });
    seen.game.start();
    seen.renderer.nextHit = far;
    tap(seen.el.board);
    expect(seen.el.toast.textContent).toMatch(/CACHE|SITE|SHRINE|TERRITORY/);
  });
});

describe('camps (waypoints, 2026-08-19)', () => {
  const T: Tuning = {
    ...TUNING,
    destinationChance: 0,
    magicChance: 0,
    uniqueChance: 0,
    worldWalls: 0,
  };

  it('wakes at the camp, measures reach from it, and retires the origin-anchored rider', () => {
    const camp = key(20, 0);
    const ctx = build(
      1,
      T,
      {
        worldStats: () => ({ territories: 1, knownPct: 0.1, farthestReach: 30 }),
      },
      [],
      camp,
    );
    ctx.game.start();

    // The run grew its seed tile at the camp, not at the origin.
    expect(ctx.game.state.cells[camp]).toMatchObject({ kind: 'tile' });
    expect(ctx.game.state.cells[key(0, 0)]).toBeUndefined();

    // REACH reads plain — comparing a camp-anchored reach to the world's
    // origin-anchored best would be two rulers on one line.
    const reach = ctx.el.stats.querySelector('[data-stat="map"] .stat-value')?.textContent ?? '';
    expect(reach).toBe('0');
    expect(reach).not.toContain('best');

    // One placement out from the camp: reach 1, and NEW GROUND stays quiet —
    // a camp run cannot out-reach the world by standing where it woke.
    ctx.renderer.nextHit = key(21, 0);
    tap(ctx.el.board);
    expect(ctx.el.stats.querySelector('[data-stat="map"] .stat-value')?.textContent).toBe('1');
    expect(ctx.el.toast.textContent ?? '').not.toMatch(/NEW GROUND/);
  });
});

describe('the daily’s end screen (2026-08-19)', () => {
  it('wears its badge, offers TRY AGAIN, and names where the exit goes', () => {
    let retried = 0;
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    const ctx = build(1, TUNING, {
      resume: ended,
      replay: true,
      newRun: () => undefined,
      finish: () => ({ runs: 3, best: 900, isNewBest: false, previousBest: 900 }),
      daily: {
        label: () => 'DAILY #1 · best 900 · 3 tries',
        retry: () => {
          retried++;
        },
      },
    });
    ctx.game.start();

    const text = ctx.el.end.textContent ?? '';
    // Tries read as TRY N — the counted, confessed retries of the design.
    expect(text).toContain('TRY 3');
    expect(text).toContain('DAILY #1 · best 900 · 3 tries');

    (ctx.el.end.querySelector('#end-retry') as HTMLButtonElement).click();
    expect(retried).toBe(1);
    expect(ctx.el.end.querySelector('#end-new-run')?.textContent).toBe('BACK TO YOUR WORLD');
  });
});

describe('SETTLE on the end screen (2026-08-20)', () => {
  const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
  const withSettle = (go: (slot: number) => void): ReturnType<typeof build> =>
    build(1, TUNING, {
      resume: ended,
      replay: true,
      newRun: () => undefined,
      finish: () => ({ runs: 3, best: 900, isNewBest: false, previousBest: 900 }),
      settle: {
        slots: () => [
          { slot: 1, holds: '12 runs · 30% known · best 4000' },
          { slot: 2, holds: null },
          { slot: 3, holds: '2 runs · 3% known · best 110' },
        ],
        go,
      },
    });

  it('opens into the three worlds, and takes an EMPTY one on one tap', () => {
    const taken: number[] = [];
    const ctx = withSettle((slot) => taken.push(slot));
    ctx.game.start();

    // Folded away until asked for: the end screen's actions must not become a
    // wall of four worlds for a button most runs never press.
    const slots = ctx.el.end.querySelector('#end-settle-slots') as HTMLElement;
    expect(slots.hidden).toBe(true);
    (ctx.el.end.querySelector('#end-settle') as HTMLButtonElement).click();
    expect(slots.hidden).toBe(false);

    const empty = slots.querySelector('[data-slot="2"]') as HTMLButtonElement;
    expect(empty.textContent).toContain('empty');
    empty.click();
    expect(taken).toEqual([2]);
  });

  it('arms before forgetting a world that holds something', () => {
    const taken: number[] = [];
    const ctx = withSettle((slot) => taken.push(slot));
    ctx.game.start();
    (ctx.el.end.querySelector('#end-settle') as HTMLButtonElement).click();

    const held = ctx.el.end.querySelector('[data-slot="1"]') as HTMLButtonElement;
    expect(held.textContent).toContain('12 runs');
    // The two-tap contract NEW WORLD and RESET ALL keep: nothing that forgets
    // a world happens on a single press.
    held.click();
    expect(taken).toEqual([]);
    expect(held.textContent).toContain('TAP AGAIN');
    held.click();
    expect(taken).toEqual([1]);
  });

  it('is absent in your own world, which is already settled', () => {
    const ctx = build(1, TUNING, {
      resume: ended,
      newRun: () => undefined,
      finish: () => ({ runs: 3, best: 900, isNewBest: false, previousBest: 900 }),
    });
    ctx.game.start();
    expect(ctx.el.end.querySelector('#end-settle')).toBeNull();
  });
});

describe('the teaching order a stranger meets (2026-08-21)', () => {
  /**
   * The GLOW card only ever needed a quiet beat, so it landed within the
   * first few placements — while RIPE needs six tiles around one. The game
   * was therefore telling a stranger to "build your chain out and touch the
   * light" BEFORE it had said what ripening is: the beeline the harness
   * names as the run-one killer (an arm encloses nothing, so nothing ever
   * ripens, and the run dies at placement 22 having done as it was told).
   *
   * The launch gate is whether a stranger finishes a run and starts another,
   * so the order these two arrive in is worth a test.
   */
  it('says nothing about distant lights until ripening has been taught', () => {
    // A ledger that has met NOTHING — a genuinely virgin device, which is
    // the only state this ordering is about.
    let progress: Progress = { ...EMPTY_PROGRESS, met: [] };
    const ctx = build(5, TUNING, {
      shop: {
        read: () => progress,
        write: (p) => {
          progress = p;
        },
      },
    });
    ctx.game.start();
    if (!ctx.el.eventCard.hidden) ctx.el.eventCardDismiss.click();

    // Play a handful of placements — enough beats for the old card to have
    // fired several times over — without ever completing a pocket.
    for (const hex of [key(1, 0), key(2, 0), key(3, 0), key(4, 0), key(5, 0)]) {
      ctx.renderer.nextHit = hex;
      tap(ctx.el.board);
      if (!ctx.el.eventCard.hidden) ctx.el.eventCardDismiss.click();
    }

    const seen = ctx.game.state;
    expect(seen.placements).toBeGreaterThan(0);
    // The concept is untaught, so neither the card nor its recurring toast
    // has spoken about a light this run.
    expect(ctx.el.eventCardText.textContent ?? '').not.toMatch(/A LIGHT IN THE DARK/);
  });
});

/**
 * The manual covers what the game IS (2026-08-21).
 *
 * An audit found nine shipped concepts explained nowhere a player could look
 * them up — POCKET (the manual's most-used noun) undefined, the bounty's rule
 * living only in a five-second toast, the daily and the survey and camps
 * absent entirely — plus four lines that were flatly untrue after a dial
 * moved under them. Prose has no type checker, so this is the closest thing:
 * a list of words the manual must contain once the concept is met.
 *
 * It reads the manual with a FULL teaching ledger, which is what a veteran
 * sees. Sections that grow with the ledger are covered by the drip tests
 * above; this one is about whether the words exist at all.
 */
describe('every shipped concept is written down somewhere', () => {
  const openFullManual = (): string => {
    const ctx = build(5, TUNING, {
      shop: {
        read: () => ({ ...EMPTY_PROGRESS, met: [...TEACH_IDS] }),
        write: () => undefined,
      },
      crossing: { dowry: () => 25, cross: () => undefined },
    });
    ctx.game.start();
    ctx.el.help.click();
    return ctx.el.helpPanel.textContent ?? '';
  };

  it('names each of them, in the words the screen uses', () => {
    const text = openFullManual();
    for (const term of [
      'POCKET', // the most-used noun, undefined until today
      'SIZE BONUS', // used as a term, its rule never stated
      'BOUNTY', // the rule lived only in a transient toast
      'TREASURE', // a third thing to spend a pocket on, buried in a fold
      'SACRIFICE',
      'THE DAILY', // a front-door button the manual never mentioned
      'THE SURVEY', // five goals that pay relics, described nowhere
      'CAMP', // a shipped unlock named only in the shrine ledger
      'NATIVE FIELD',
      'BIOMES',
      'REACH',
      'COST',
      'TILES',
      'crossing',
    ]) {
      expect(text, `the manual never says ${term}`).toContain(term);
    }
  });

  it('does not contradict the economy it is describing', () => {
    const text = openFullManual();
    // Each of these was in the manual on 2026-08-20 and each was false.
    expect(text).not.toContain('one per device'); // three worlds since 08-19
    expect(text).not.toContain('hoarding luck is a real alternative'); // 5% is not
    expect(text).not.toContain('Textured ground'); // the board draws dots
    expect(text).not.toMatch(/\b1 relics\b/); // burnRelics is 1
    // The points button has been hidden since the payout became single.
    expect(text).not.toContain('POP for pts');
  });
});

/**
 * Pins for the refactor moving `#rarityLine`, `#purseLesson`, `#statNote`,
 * `#colourLesson` and `#powerOf` out of `Game` into `view.ts` as exported,
 * explicit-argument functions (`#pocketNote` and `#harvestNote` have their
 * own pins already, above: 'prices a pocket you tap...' and 'shows the
 * arithmetic of a pop'). Written against TODAY's private methods, reached
 * the only way anything private can be reached — through the doors the game
 * already opens them by — so the exact words are locked down before the
 * move, not re-derived after it.
 */
describe('five more text builders, pinned ahead of their move to view.ts', () => {
  const LAST_GASP =
    'You may place while ANY tiles remain — the difference is forgiven at zero, and it cannot chain: only a pop can lift you back above zero.';

  // `#colourLesson` and `#rarityLine` share one door: a second tap on the
  // already-selected draft card puts it down and explains it (Marc,
  // 2026-08-20) — the cheapest place both fire from without a canvas.
  const putDownCard = (colour: Colour, rarity: Rarity, tuning: Tuning): string => {
    const base = newRun(9, tuning);
    const ctx = build(1, tuning, {
      resume: {
        ...base,
        draft: [{ ...base.draft[0]!, colour, rarity }, ...base.draft.slice(1)],
        selected: 0,
      },
    });
    ctx.game.start();
    (ctx.el.draft.children[0] as HTMLButtonElement).click();
    return ctx.el.toast.textContent ?? '';
  };

  it('names a wild tile’s power, and a colour’s personality, exactly', () => {
    expect(putDownCard('green', 'magic', TUNING)).toBe(
      'GREEN — CROWDS. Wants one big mob of its own colour: +1 worth per GREEN neighbour past the first.\n' +
        'MAGIC — wild: it matches every neighbouring tile, whatever the colour, and they match it back.',
    );
    expect(putDownCard('yellow', 'unique', TUNING)).toBe(
      'YELLOW — COMPANY. Scores in messy mixed ground: +1 worth per differently-coloured neighbour.\n' +
        'UNIQUE — wild and heavy: every match it is part of counts DOUBLE, for both sides.',
    );
    expect(putDownCard('blue', 'magic', TUNING)).toBe(
      'BLUE — TIDE. Worth little at home, a lot on the frontier: +1 worth per 6 hexes from home.\n' +
        'MAGIC — wild: it matches every neighbouring tile, whatever the colour, and they match it back.',
    );
  });

  it('says nothing extra for an ordinary tile of a personality colour', () => {
    // No second line: `#rarityLine(undefined-ish 'common')` is null, so the
    // lesson stands alone.
    expect(putDownCard('red', 'common', TUNING)).toBe(
      'RED — ASH. Stone and walls count as matches for it: it feeds on the spent ground everyone else abandons.',
    );
  });

  it('falls back to the plain sentence once a colour’s power dial is off', () => {
    const off = { ...TUNING, greenCrowdBonus: 0 };
    expect(putDownCard('green', 'common', off)).toBe(
      'GREEN — worth one per matching neighbour when it ripens.',
    );
  });

  // `#powerOf` rides the long-pressed draft card's reorientation line — the
  // fresh board's zero-count phrasing keeps every character deterministic.
  const spotlightHint = (colour: Colour, tuning: Tuning): string => {
    const base = newRun(9, tuning);
    // No pre-existing tile of any colour (the seed's own starting tile can
    // land on any colour) — `#powerOf`'s "nothing standing yet" branch needs
    // a genuinely empty board to stay deterministic.
    const cells = Object.fromEntries(
      Object.entries(base.cells).filter(([, cell]) => cell.kind !== 'tile'),
    );
    const ctx = build(1, tuning, {
      resume: { ...base, cells, draft: [{ ...base.draft[0]!, colour }, ...base.draft.slice(1)] },
    });
    ctx.game.start();
    const card = ctx.el.draft.children[0] as HTMLButtonElement;
    card.dispatchEvent(new window.MouseEvent('contextmenu', { cancelable: true }));
    return ctx.el.hint.textContent ?? '';
  };

  it('spells out each colour’s power clause on the spotlight line', () => {
    expect(spotlightHint('green', TUNING)).toBe(
      'GREEN: nothing standing yet · crowds: +1 worth per green neighbour past the first',
    );
    expect(spotlightHint('yellow', TUNING)).toBe(
      'YELLOW: nothing standing yet · company: +1 worth per differently-coloured neighbour',
    );
    expect(spotlightHint('red', TUNING)).toBe(
      'RED: nothing standing yet · ash: stone and walls beside red count as matches',
    );
    expect(spotlightHint('blue', TUNING)).toBe(
      'BLUE: nothing standing yet · tide: +1 worth per 6 hexes from home',
    );
  });

  it('adds nothing to the spotlight line once the power dial is off', () => {
    const off = { ...TUNING, greenCrowdBonus: 0 };
    expect(spotlightHint('green', off)).toBe('GREEN: nothing standing yet');
  });

  /**
   * The hand's grid, pinned as Marc drew it (2026-08-27):
   *
   *     c c h
   *     c c h
   *
   * The held cards are the last COLUMN, one per row — not both on the bottom
   * row at either side, which is what "1 at each end of the row" was first
   * read as. Asserted through flex `order`, since that is what positions
   * them: DOM order is the whole draft then the whole stash, and moving them
   * in the document would cost the tab order its shape.
   */
  it('lays the hand out as dealt cards with the stash down the right edge', () => {
    // Four dealt and two held is the shape he drew: the widened draft (the
    // first shrine's unlock) and both stash slots (the second's).
    const T: Tuning = { ...TUNING, draftWidth: 4, holdSlots: 2 };
    const base = newRun(9, T);
    const ctx = build(1, T, {
      resume: { ...base, held: [base.draft[0]!, base.draft[1]!] },
    });
    ctx.game.start();

    const draft = [...ctx.el.draft.children] as HTMLElement[];
    const stash = [...ctx.el.stash.children] as HTMLElement[];
    expect(draft).toHaveLength(4);
    expect(stash).toHaveLength(2);

    expect(ctx.el.hand.style.getPropertyValue('--hand-cols')).toBe('3');
    // Row 1 ends on a held card, and so does row 2.
    expect(stash.map((c) => c.style.order)).toEqual(['2', '5']);
    // The dealt cards fill everything else, in the order they were dealt.
    expect(draft.map((c) => c.style.order)).toEqual(['0', '1', '3', '4']);
  });

  /**
   * The lens's way out (Marc, 2026-08-27: "when the lens is on, make sure we
   * add a button on top of ? to clear the lens easily, sometimes its hard
   * with tiles in hand").
   *
   * The lens is released by REPEATING whatever lit it — a long-press on the
   * same card — and with a full hand that card is the fiddly thing to find
   * again. This button is the exit that does not require remembering the
   * entrance, so it has to appear exactly while there is something to exit.
   */
  it('offers a way out of the lens, only while the lens is on', () => {
    const base = newRun(9, TUNING);
    const ctx = build(1, TUNING, {
      resume: { ...base, draft: [{ ...base.draft[0]!, colour: 'green' }, ...base.draft.slice(1)] },
    });
    ctx.game.start();

    // Nothing lit: no way out on screen.
    expect(ctx.el.lensClear.hidden).toBe(true);

    const card = ctx.el.draft.children[0] as HTMLButtonElement;
    card.dispatchEvent(new window.MouseEvent('contextmenu', { cancelable: true }));
    expect(ctx.el.lensClear.hidden).toBe(false);
    // It names the ground it would let go of, not a generic dismissal.
    expect(ctx.el.lensClear.getAttribute('aria-label')).toContain(PLACEHOLDER.terrainNames.green);

    // The lens is really ON: the board is drawn with cells stepped back, or
    // lit, by it. (Asserted through the VIEW rather than the button, so the
    // test cannot pass on a button that toggles and does nothing.)
    const lit = ctx.renderer.views[ctx.renderer.views.length - 1]!;
    expect(Object.values(lit.cells).some((c) => c.dimmed || c.lensed)).toBe(true);

    ctx.el.lensClear.click();
    expect(ctx.el.lensClear.hidden).toBe(true);
    expect(ctx.el.toast.textContent).toBe('The lens is off.');
    // And the board is redrawn without it, which is the whole point.
    const off = ctx.renderer.views[ctx.renderer.views.length - 1]!;
    expect(Object.values(off.cells).some((c) => c.dimmed || c.lensed)).toBe(false);
  });

  // `#purseLesson` is the purse fold's first-contact card — armed only once
  // a shop hook exists to remember it was met (without one, `#met` answers
  // vacuously true and the card never fires).
  const purseCard = (tuning: Tuning): { readonly lead: string; readonly rows: string[] } => {
    const ctx = build(1, tuning, {
      shop: { read: () => ({ ...EMPTY_PROGRESS, met: [] }), write: () => undefined },
    });
    ctx.game.start();
    ctx.el.purseToggle.click();
    return {
      lead: ctx.el.eventCardText.textContent ?? '',
      rows: [...ctx.el.eventCardRows.querySelectorAll('.tip-row')].map(
        (row) => row.textContent ?? '',
      ),
    };
  };

  /**
   * Every row names the BUTTON it is about (2026-08-27). The card used to
   * teach a REROLL and a STEER, and the drawer has never had either — the
   * buttons read REDRAW and the four ground names. A card that explains
   * every action in words matching no action explains none of them, which
   * is why this asserts the literal button faces rather than a paraphrase.
   */
  it('teaches the whole purse on its first fold, naming each button as it reads', () => {
    const n = PLACEHOLDER.terrainNames;
    const t = TUNING;
    const card = purseCard(t);

    // The lead says the one thing every row shares, and the one thing no
    // price on screen ever says: luck is use-it-or-lose-it.
    expect(card.lead).toBe(
      'LUCK IS FOR SPENDING\n' +
        'Every button under your hand is priced in luck — and you CAN lose it all: ' +
        "the run's end pays back only 5% of whatever is left, so a full purse you die " +
        'on is mostly gone. Spend it.',
    );

    /**
     * One row per BUTTON, in the order the drawer draws them (2026-08-27,
     * Marc: "make sure the luck is for spending card is explained with new
     * lines, not a whole paragraph"). The four steers were a parenthesised
     * list inside a semicolon list inside a clause; they are four buttons on
     * screen, so they are four lines here — each wearing its ground's mark.
     */
    expect(card.rows).toEqual([
      `REDRAW · ${t.luckRerollCost} — throw this hand away for a new one.`,
      ...COLOURS.map(
        (c) =>
          `${COLOUR_MARK[c]} ${n[c]} · ${t.luckSteerCost} — a hand leaning ${n[c]}, ` +
          `and the next ${t.colourBiasDraws} draws with it.`,
      ),
      `FORGE · ${t.luckForgeCost} — turn the card you have selected UNIQUE.`,
      `SACRIFICE LUCK — the WHOLE purse traded for relics at ${Math.round(t.titheRate * 100)}%, better than dying on it.`,
    ]);
  });

  /**
   * The card names every button the drawer actually shows, and invents none.
   * This is the assertion that would have caught the original defect: the
   * old text passed every prose pin above while naming a REROLL and a STEER
   * that no button has ever worn.
   */
  it('names every drawer button and invents none', () => {
    const base = newRun(1, TUNING);
    const ctx = build(1, TUNING, {
      shop: { read: () => ({ ...EMPTY_PROGRESS, met: [] }), write: () => undefined },
      // The fold arrives with the purse; without luck there is nothing to
      // open and nothing to name.
      resume: { ...base, luck: 500 },
    });
    ctx.game.start();
    // One click: the fold opens AND the card fires, which is the single
    // state where both the words and the buttons exist together.
    ctx.el.purseToggle.click();
    // The rows are where the buttons are named now, so the card is both
    // halves read together — the lead carries no button face at all.
    const card = [
      ctx.el.eventCardText.textContent ?? '',
      ...[...ctx.el.eventCardRows.querySelectorAll('.tip-row')].map((r) => r.textContent ?? ''),
    ].join('\n');
    const faces = [...ctx.el.spends.querySelectorAll('button')].map(
      (b) => (b.textContent ?? '').trim().split(' ')[0] ?? '',
    );
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) expect(card).toContain(face);
    // And the two words the card used to invent are gone for good.
    expect(card).not.toContain('REROLL');
    expect(card).not.toContain('STEER');
  });

  it('keeps the lesson honest with every row and TITHE off', () => {
    const card = purseCard(BARE_TUNING);
    expect(card.lead).toBe(
      'LUCK IS FOR SPENDING\n' +
        'Every button under your hand is priced in luck — and you CAN lose it all: ' +
        'whatever is left when the run ends is lost outright. Spend it.',
    );
    // No priced button, no rows: a list of nothing is worse than no list.
    expect(card.rows).toEqual([]);
  });

  it('names just the rows that are actually priced', () => {
    const card = purseCard({ ...BARE_TUNING, luckRerollCost: 12 });
    expect(card.rows).toEqual(['REDRAW · 12 — throw this hand away for a new one.']);
  });

  // `#statNote` — the tap-a-symbol contract on the stat row itself.
  const statText = (id: string, tuning: Tuning): string => {
    const ctx = build(1, tuning);
    ctx.game.start();
    const box = ctx.el.stats.querySelector(`[data-stat="${id}"]`) as HTMLElement;
    box.click();
    return ctx.el.toast.textContent ?? '';
  };

  it('explains the plain stats word for word', () => {
    expect(statText('tiles', TUNING)).toBe(
      'TILES — what keeps you alive. Every placement spends them; pops, caches and territories pay them back. At zero with nothing ripe to pop, the run ends.',
    );
    expect(statText('points', TUNING)).toBe(
      'POINTS — the score. A pocket popped for points pays its worth × its size × its distance from home.',
    );
    expect(statText('map', TUNING)).toBe(
      'REACH — how far from home you have built. Every 3 hexes out raises the distance multiplier by 1, so the same pocket scores more the deeper it pops.',
    );
  });

  it('explains LEFT, on a run that has a clock to count down', () => {
    // TUNING (the tiles-only economy) runs with no clock at all — `left` is
    // null and the stat does not render — so this one needs a run that has
    // one, same as `runLength` ever did before the pivot.
    expect(statText('left', { ...TUNING, runLength: 260 })).toBe(
      'LEFT — placements remaining in the expedition. At zero it ends; anything already ripe can still be popped.',
    );
  });

  it('says where unspent luck goes, only when it goes anywhere', () => {
    expect(statText('luck', TUNING)).toBe(
      'LUCK — a purse, not a score. The row under your hand spends it; whatever is left when the run ends comes home as relics, at 5%.',
    );
    expect(statText('luck', { ...TUNING, luckToRelics: 0 })).toBe(
      'LUCK — a purse, not a score. The row under your hand spends it.',
    );
  });

  it('states the cost curve, with and without a grace period', () => {
    expect(statText('cost', TUNING)).toBe(
      `COST — the next placement's price: 1. It rises +1 every 22 placed, and it never comes back down — the clock that ends every run. ${LAST_GASP}`,
    );
    expect(statText('cost', { ...TUNING, costGrace: 120, costRisesEvery: 25 })).toBe(
      `COST — the next placement's price: 1. It stays 1 for the first 120 placements, then rises +1 every 25 placed, and it never comes back down — the clock that ends every run. ${LAST_GASP}`,
    );
  });
});

/**
 * Pins for `#describe`'s inner `destination()` closure — the words a tap
 * gives for each of the five landmark glyphs, claimed and unclaimed, ahead
 * of the move that turns `#describe` into `describeHexOf(ctx, hex)` in
 * view.ts. A landmark cell already ON the board reaches `destination()`
 * directly (`case 'landmark': return destination(...)`, no suffix), which
 * isolates the closure from the outer function's beacon/memory/shimmer
 * branches — those are exercised elsewhere ('keeps unseen fog dark on tap,
 * and names what memory has actually seen').
 */
describe('#describe’s destination() closure, pinned ahead of its move to view.ts', () => {
  const HEX = key(0, 0);

  const tapLandmark = (
    reward: LandmarkReward,
    claimed: boolean,
    colour: Colour | null,
    hooks: GameHooks = {},
  ): string => {
    const base = newRun(1, TUNING);
    const ctx = build(1, TUNING, {
      ...hooks,
      resume: {
        ...base,
        cells: {
          ...base.cells,
          [HEX]: { kind: 'landmark', reward, claimed, ...(colour !== null ? { colour } : {}) },
        },
      },
    });
    ctx.game.start();
    ctx.renderer.nextHit = HEX;
    tap(ctx.el.board);
    return ctx.el.toast.textContent ?? '';
  };

  it('prices a cache, before and after it is claimed', () => {
    // TUNING.cachePays is 6, and `HEX` sits at distance 0 from home, where
    // `cachePaysPerRing`'s per-ring bonus is exactly zero.
    expect(tapLandmark('cache', false, null)).toBe(
      '✚ CACHE — build a tile touching it to claim 6 tiles on the spot.',
    );
    expect(tapLandmark('cache', true, null)).toBe('✚ CACHE — already claimed. It gave its tiles.');
  });

  it('prices a site, before and after it is claimed', () => {
    expect(tapLandmark('site', false, null)).toBe(
      '★ SITE — claim it for 25 pts × its distance, and it opens a bounty worth ×3.',
    );
    expect(tapLandmark('site', true, null)).toBe('★ SITE — already claimed.');
  });

  it('names a find as mystery, before and after it is spent', () => {
    expect(tapLandmark('find', false, null)).toBe('✦ Something is here. Touch it with a tile.');
    expect(tapLandmark('find', true, null)).toBe('✦ A hidden find — spent. It gave what it had.');
  });

  it('names a territory’s field, with and without a known colour, claimed or not', () => {
    expect(tapLandmark('territory', false, null)).toBe(
      '❖ TERRITORY — claim it and the ground within 2 hexes becomes native to a colour, for good.',
    );
    expect(tapLandmark('territory', true, null)).toBe(
      '❖ TERRITORY — yours. The ground within 2 hexes is native to a colour.',
    );
    expect(tapLandmark('territory', false, 'green')).toBe(
      '❖ TERRITORY — claim it and the ground within 2 hexes becomes native to GREEN, for good.',
    );
    expect(tapLandmark('territory', true, 'green')).toBe(
      '❖ TERRITORY — yours. The ground within 2 hexes is native to GREEN.',
    );
  });

  it('narrates a shrine plainly on a detour — no ledger, no crossing', () => {
    const hooks: GameHooks = {
      replay: true,
      unlockLabel: () => 'unreachable on a detour',
      crossing: { dowry: () => 9, cross: () => undefined },
    };
    expect(tapLandmark('shrine', false, null, hooks)).toBe(
      '◈ SHRINE — touch it with a tile. On your own world, waking one switches a system on for good.',
    );
    expect(tapLandmark('shrine', true, null, hooks)).toBe(
      '◈ SHRINE — woken. On your own world, this switches a system on for good.',
    );
  });

  it('names the shrine’s unlock, and what a woken one already did', () => {
    const hooks: GameHooks = { unlockLabel: () => 'A fourth draft card' };
    expect(tapLandmark('shrine', false, null, hooks)).toBe(
      '◈ SHRINE — claim it to unlock A fourth draft card for this world, permanently.',
    );
    expect(tapLandmark('shrine', true, null, hooks)).toBe(
      '◈ SHRINE — woken. It switched a system on for this world.',
    );
  });

  it('offers the crossing once every ledger rung is gone', () => {
    const hooks: GameHooks = {
      unlockLabel: () => null,
      crossing: { dowry: () => 9, cross: () => undefined },
    };
    expect(tapLandmark('shrine', false, null, hooks)).toBe(
      '◈ SHRINE — this world is fully awake, so reaching it offers the crossing: a NEW WORLD, with 9 relics carried for what you leave.',
    );
  });

  it('falls back to “a system” once fully awake with no crossing to offer', () => {
    const hooks: GameHooks = { unlockLabel: () => null };
    expect(tapLandmark('shrine', false, null, hooks)).toBe(
      '◈ SHRINE — claim it to unlock a system for this world, permanently.',
    );
  });
});

describe('which game this is — your world, the daily, a shared run (2026-08-26)', () => {
  /**
   * Marc: "make sure going in to a daily, sharing, etc is explicit for
   * dailies only and world is world only, make sure its clear which one is
   * which and which one is the current world."
   *
   * The manual was where the two leaked into each other. Every promise it
   * makes — banking, remembering, the survey, the shop, SACRIFICE — belongs
   * to the HOME world, and a detour read all of them anyway, because the
   * only gates were the DEVICE's teaching ledger (which says nothing about
   * which mode is running) and tuning dials nobody had zeroed yet. START is
   * the first tab, so a shared link's recipient met those sentences before
   * their first placement: the most-read false copy the game had.
   *
   * The contract is stated from BOTH sides on purpose. An absence test
   * alone passes just as well when the words disappear from every mode, so
   * each one also proves the words are still there at home.
   */
  const VETERAN: Progress = { ...EMPTY_PROGRESS, met: [...TEACH_IDS], relics: 30 };

  /** Exactly the dials main.ts zeroes for a detour: no relic faucet at all. */
  const DETOUR_TUNING: Tuning = {
    ...TUNING,
    burnRelics: 0,
    claimRelics: 0,
    luckToRelics: 0,
    titheRate: 0,
  };

  const manualOf = (tuning: Tuning, hooks: GameHooks): string => {
    const ctx = build(4, tuning, {
      shop: {
        read: () => VETERAN,
        write: () => undefined,
      },
      ...hooks,
    });
    ctx.game.start();
    ctx.game.openHelp();
    return ctx.el.helpManual.textContent ?? '';
  };

  const home = (): string => manualOf(TUNING, {});
  const daily = (): string =>
    manualOf(DETOUR_TUNING, {
      replay: true,
      daily: { label: () => 'DAILY 1 · 1st try', retry: () => undefined },
    });
  const shared = (): string => manualOf(DETOUR_TUNING, { replay: true, fromLink: true });

  it('names the mode on the screen, and never a second one beside it', () => {
    expect(home()).toContain('RIGHT NOW you are playing YOUR OWN WORLD');
    expect(daily()).toContain('RIGHT NOW you are playing THE DAILY');
    expect(shared()).toContain('RIGHT NOW you are playing A SHARED RUN');

    // Exactly ONE of the three is ever claimed. A screen naming two is the
    // confusion this whole split exists to end.
    for (const text of [home(), daily(), shared()]) {
      const named = ['YOUR OWN WORLD', 'THE DAILY', 'A SHARED RUN'].filter((mode) =>
        text.includes(`RIGHT NOW you are playing ${mode}`),
      );
      expect(named).toHaveLength(1);
    }
  });

  it('promises the climb at home, and an honest visit on a detour', () => {
    expect(home()).toContain('Your world remembers');
    expect(home()).toContain('playing the climb');
    for (const text of [daily(), shared()]) {
      expect(text).not.toContain('Your world remembers');
      expect(text).not.toContain('playing the climb');
      expect(text).toContain('this run is a visit');
    }
  });

  it('keeps remembered ground a promise only the home world makes', () => {
    expect(home()).toContain('stays drawn faint on later runs');
    for (const text of [daily(), shared()]) {
      expect(text).not.toContain('stays drawn faint on later runs');
      expect(text).toContain('Nothing here is remembered');
    }
  });

  it('never speaks a relic, a sacrifice, the survey or a tithe on a detour', () => {
    // Marc's daily verdict: "completely remove anything relic related or
    // sacrifice related" — on a daily you optimise POINTS, and every relic
    // word is a system that mode does not have. The four zeroed dials do
    // most of this by construction; the survey and the shop door needed
    // their own guards, because neither has a dial.
    for (const text of [daily(), shared()]) {
      expect(text).not.toMatch(/relic/i);
      expect(text).not.toMatch(/sacrifice/i);
      // Named in full (2026-08-27): TITHE was renamed SACRIFICE LUCK, so
      // `/sacrifice/i` above would now pass for the pocket burn alone and
      // this one would pass on a word the game no longer says. The phrase
      // is what keeps the two apart.
      expect(text).not.toContain('SACRIFICE LUCK');
      expect(text).not.toContain('THE SURVEY');
    }

    // And every one of them is still at home, or the absences above would
    // pass on a manual that had simply lost the words.
    const at = home();
    expect(at).toMatch(/relic/i);
    expect(at).toMatch(/sacrifice/i);
    expect(at).toContain('SACRIFICE LUCK');
    expect(at).toContain('THE SURVEY');
  });

  it('takes SACRIFICE off the screen on a detour, not just out of the manual', () => {
    // The dial does this without a guard: `harvestBurn` is zero when both
    // `burnRelics` and `burnLuck` are, and a zero burn hides the button.
    // Pinned because it is the one relic surface a THUMB reaches for.
    const detour = build(4, DETOUR_TUNING, { replay: true });
    detour.game.start();
    expect(detour.el.harvestBurn.hidden).toBe(true);
  });

  it('points at the MENU tab for what that tab actually holds here', () => {
    expect(home()).toContain('holds your world’s own numbers');
    for (const text of [daily(), shared()]) {
      expect(text).not.toContain('holds your world’s own numbers');
      expect(text).toContain('says which game this is');
    }
  });

  it('says a found perk belongs to THIS world, never to the device', () => {
    // The per-world split's copy (2026-08-26). The manual said "yours for
    // good" on every world while the shelf had already moved onto the world
    // — the exact promise the split was made to stop making.
    const worn: Progress = {
      ...EMPTY_PROGRESS,
      found: ['stonewalker'],
      equipped: ['stonewalker'],
      met: [...TEACH_IDS],
    };
    const ctx = build(4, TUNING, {
      shop: { read: () => worn, write: () => undefined },
    });
    ctx.game.start();
    ctx.game.openHelp();
    const text = ctx.el.helpManual.textContent ?? '';
    expect(text).toContain('WHAT YOU CARRY');
    expect(text).toContain('Found out in THIS world');
    expect(text).not.toContain('yours for good. One perk');
    expect(text).not.toContain('on every world. WEAR it');
  });
});

describe('a tip waits for you (2026-08-27)', () => {
  /**
   * Marc: "make sure all tips are tapped on to exit, no autoexit on any so
   * people have time to read."
   *
   * Every tip used to hold for 5.2 seconds — one number, guessed once, applied
   * equally to a six-word claim and a forty-word explanation. Now nothing
   * expires: a card leaves by GOT IT, a toast by a tap on it. The cost of that
   * is the second test below, which is the bug the change would otherwise
   * have introduced.
   */
  const T2: Tuning = { ...TUNING, destinationChance: 0, magicChance: 0, uniqueChance: 0 };

  it('never takes a tip away on a timer, however long it is left', () => {
    vi.useFakeTimers();
    try {
      const base = newRun(7, T2);
      const ctx = build(1, T2, {
        resume: {
          ...base,
          cells: { ...base.cells, [key(2, 0)]: { kind: 'tile', colour: 'blue' } },
        },
      });
      ctx.game.start();
      ctx.renderer.nextHit = key(2, 0);
      tap(ctx.el.board);
      expect(ctx.el.toast.hidden).toBe(false);

      // Far past the 5.2s the game used to allow itself, and past any
      // plausible replacement for it.
      vi.advanceTimersByTime(120_000);
      expect(ctx.el.toast.hidden).toBe(false);

      // The one way out, and it works.
      ctx.el.toast.click();
      expect(ctx.el.toast.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the last tip when an action happens, so none can pile up', () => {
    // The regression the timeout used to hide: with nothing expiring, a
    // toast from one placement would still be over the board many
    // placements later, because a quiet action has nothing to say and so
    // never wrote the toast at all. An action supersedes what the last one
    // said — including a sticky explanation the player tapped for.
    const base = newRun(7, T2);
    const ctx = build(1, T2, {
      resume: {
        ...base,
        cells: { ...base.cells, [key(2, 0)]: { kind: 'tile', colour: 'blue' } },
      },
      // A veteran ledger: no teaching moment is armed, so the placement
      // below is genuinely a QUIET action with nothing of its own to say.
      shop: {
        read: () => ({ ...EMPTY_PROGRESS, met: [...TEACH_IDS] }),
        write: () => undefined,
      },
      // And no NEW GROUND, which would legitimately speak on this beat.
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 99 }),
    });
    ctx.game.start();

    ctx.renderer.nextHit = key(2, 0);
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(false);

    // A placement that claims nothing, pops nothing and teaches nothing.
    const empty = Object.keys(ctx.game.state.cells).find(
      (k) => ctx.game.state.cells[k]?.kind === 'empty',
    );
    expect(empty).toBeDefined();
    ctx.renderer.nextHit = empty ?? null;
    tap(ctx.el.board);
    expect(ctx.el.toast.hidden).toBe(true);
  });
});
