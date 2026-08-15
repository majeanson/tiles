// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ENDLESS_TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from '@engine/hex';
import { ripeKeys } from '@engine/rules';
import type { BoardView, Renderer } from '@render/Renderer';
import { Game, type Elements } from './game';

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
      buttons' disabled logic can be exercised without a canvas. */
  zoom = 1;
  pans: [number, number][] = [];
  resets = 0;

  mount(): Promise<void> {
    return Promise.resolve();
  }
  draw(view: BoardView): void {
    this.views.push(view);
  }
  hitTest(): HexKey | null {
    return this.nextHit;
  }
  zoomBy(factor: number): void {
    this.zoom = Math.min(4, Math.max(1, this.zoom * factor));
  }
  panBy(dx: number, dy: number): void {
    this.pans.push([dx, dy]);
  }
  resetCamera(): void {
    this.zoom = 1;
    this.resets++;
  }
  zoomLevel(): number {
    return this.zoom;
  }
  destroy(): void {}

  get last(): BoardView {
    const view = this.views[this.views.length - 1];
    if (view === undefined) throw new Error('nothing drawn');
    return view;
  }
}

function build(seed = 4, tuning?: Tuning): { game: Game; renderer: StubRenderer; el: Elements } {
  document.body.innerHTML = `
    <header id="stats"></header>
    <div id="board">
      <div id="camera">
        <button id="help">?</button>
        <button id="zoom-in">+</button>
        <button id="zoom-out">−</button>
        <button id="zoom-fit">FIT</button>
      </div>
      <div id="help-panel" hidden>
        <div id="help-manual"></div>
        <div id="help-meta"></div>
      </div>
    </div>
    <div id="colours"></div>
    <p id="hint" hidden></p>
    <div id="draft"></div>
    <button id="harvest-tiles"></button>
    <button id="harvest-points"></button>
    <button id="leave"></button>
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
    colours: pick('colours'),
    draft: pick('draft'),
    harvestTiles: pick<HTMLButtonElement>('harvest-tiles'),
    harvestPoints: pick<HTMLButtonElement>('harvest-points'),
    leave: pick<HTMLButtonElement>('leave'),
    end: pick('end'),
    zoomIn: pick<HTMLButtonElement>('zoom-in'),
    zoomOut: pick<HTMLButtonElement>('zoom-out'),
    zoomFit: pick<HTMLButtonElement>('zoom-fit'),
    help: pick<HTMLButtonElement>('help'),
    helpPanel: pick('help-panel'),
    helpManual: pick('help-manual'),
  };

  const renderer = new StubRenderer();
  return { game: new Game(renderer, el, seed, undefined, tuning), renderer, el };
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
    expect(stat('points')).toBe('0');
    expect(stat('map')).toBe('1');
    expect(stat('cost')).toBe('−1');
    expect(ctx.el.draft.children).toHaveLength(ctx.game.state.draft.length);
  });

  // The draft cards carry the theme's word for a colour, not the colour id. The
  // default theme has no fiction, so it says GREEN — but the lookup is the thing
  // being checked, because a direction that renames all four must not produce
  // four blank buttons.
  it('names each draft card in the vocabulary of the active theme', () => {
    // The name span specifically — cards also carry BEST/MAGIC badges now.
    const labels = [...ctx.el.draft.children].map(
      (c) => c.querySelector('.tile-name')?.textContent,
    );
    expect(labels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    expect(labels.map((l) => l?.toLowerCase())).toEqual(ctx.game.state.draft.map((t) => t.colour));
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
    expect(ctx.el.leave.disabled).toBe(true);
    expect(ctx.el.leave.textContent).toMatch(/harvest/i);
  });

  it('marks exactly the draft card whose placement pays the most', () => {
    // Seed 4's opening draft holds the seed tile's colour (asserted by the
    // select test above), so next to a lone seed exactly one card can pay —
    // and exactly one card carries the BEST word.
    const marked = [...ctx.el.draft.children].filter((c) => (c.textContent ?? '').includes('BEST'));
    expect(marked).toHaveLength(1);
    const seedCell = ctx.game.state.cells[key(0, 0)];
    const index = [...ctx.el.draft.children].indexOf(marked[0]!);
    expect(ctx.game.state.draft[index]?.colour).toBe(
      seedCell?.kind === 'tile' ? seedCell.colour : 'never',
    );
  });

  it('runs a whole map: fill, harvest, then move on', () => {
    for (let i = 0; i < 400; i++) {
      const spot = ctx.renderer.last.cells.find((c) => c.legal);
      if (spot === undefined) break;
      ctx.renderer.nextHit = spot.key;
      tap(ctx.el.board);
    }

    expect(ripeKeys(ctx.game.state.cells).length).toBeGreaterThan(0);
    expect(ctx.el.harvestPoints.disabled).toBe(false);
    expect(ctx.el.harvestPoints.textContent).toMatch(/Take \d+ pts/);
    expect(ctx.el.harvestTiles.textContent).toMatch(/Take \d+ tiles/);

    // Tiles, not points: a first map paid out entirely in points leaves nothing
    // to place with, and the run ends there. The harness found the same thing —
    // its always-points policy dies on map 1 every time.
    ctx.el.harvestTiles.click();
    expect(ctx.game.state.tiles).toBeGreaterThan(0);

    // Harvesting is what unlocks the exit, and the label says so.
    expect(ctx.el.leave.disabled).toBe(false);
    ctx.el.leave.click();
    expect(ctx.game.state.mapNumber).toBe(2);
  });

  it('shows the epitaph and goes dead once the run ends', () => {
    // Spend the run down without ever banking tiles.
    for (let i = 0; i < 2000 && ctx.game.state.phase === 'placing'; i++) {
      const spot = ctx.renderer.last.cells.find((c) => c.legal);
      if (spot === undefined) {
        if (!ctx.el.harvestPoints.disabled) ctx.el.harvestPoints.click();
        else if (!ctx.el.leave.disabled) ctx.el.leave.click();
        else break;
        continue;
      }
      ctx.renderer.nextHit = spot.key;
      tap(ctx.el.board);
    }

    expect(ctx.game.state.phase).toBe('ended');
    expect(ctx.el.end.hidden).toBe(false);
    expect(ctx.el.end.textContent).toMatch(/out of tiles/i);
    expect(ctx.el.harvestTiles.disabled).toBe(true);
    expect(ctx.el.leave.disabled).toBe(true);

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
    ctx = build(7, ENDLESS_TUNING);
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

  it('hides LEAVE and reports REACH instead of MAP', () => {
    expect(ctx.el.leave.hidden).toBe(true);
    const label = ctx.el.stats.querySelector('[data-stat="map"] .stat-label')?.textContent;
    expect(label).toBe('REACH');
  });

  it('prices the pocket, outlines it, and a tap on ripe asks rather than places', () => {
    ripenTheSeed();

    // The buttons price the pocket without any tap — biggest is the default.
    expect(ctx.el.harvestPoints.disabled).toBe(false);
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
});

describe('the camera, and staying oriented', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build(7, ENDLESS_TUNING);
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
    pointer(ctx.el.zoomIn, 'pointerdown', 5, 5);
    pointer(ctx.el.zoomIn, 'pointerup', 5, 5);
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

  it('drives the camera from the buttons, with FIT the way back', () => {
    expect(ctx.el.zoomOut.disabled).toBe(true);

    ctx.el.zoomIn.click();
    expect(ctx.renderer.zoom).toBeGreaterThan(1);
    expect(ctx.el.zoomOut.disabled).toBe(false);

    ctx.el.zoomFit.click();
    expect(ctx.renderer.zoom).toBe(1);
    expect(ctx.renderer.resets).toBe(1);
    expect(ctx.el.zoomOut.disabled).toBe(true);
  });

  it('opens the full manual, numbers from the live tuning, and closes on a tap', () => {
    expect(ctx.el.helpPanel.hidden).toBe(true);
    ctx.el.help.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);

    // Every endless system has its section…
    const text = ctx.el.helpPanel.textContent ?? '';
    for (const section of [
      'THE LOOP',
      'PLACING',
      'RIPE AND WORTH',
      'HARVEST',
      'THE COLOURS',
      'THE GROUND',
      'DESTINATIONS',
      'RARE TILES AND LUCK',
      'THE STASH',
      'READING THE SCREEN',
      'HOW IT ENDS',
      'THIS BUILD',
    ]) {
      expect(text).toContain(section);
    }
    // THIS BUILD is derived, not written: the seed and the systems list come
    // from the run itself.
    expect(text).toContain(`seed ${ctx.game.state.rootSeed}`);
    expect(text).toMatch(/Systems in play: .*destinations/);
    // …and the numbers are the run's own tuning, not prose that can go stale.
    const t = ctx.game.state.tuning;
    expect(text).toContain(`${t.cachePays} tiles`);
    expect(text).toContain(`every ${t.costRisesEvery} tiles`);
    expect(text).toContain(`${t.blueTideEvery} hexes`);

    ctx.el.helpPanel.click();
    expect(ctx.el.helpPanel.hidden).toBe(true);
  });

  it('keeps the bounded manual to the bounded game', () => {
    const bounded = build();
    bounded.game.start();
    bounded.el.help.click();
    const text = bounded.el.helpPanel.textContent ?? '';
    expect(text).toContain('THE LOOP');
    expect(text).toContain('MOVE ON');
    expect(text).not.toContain('DESTINATIONS');
    expect(text).not.toContain('THE STASH');
  });

  it('shows a chip per colour, and a held chip spotlights and explains', () => {
    const chips = [...ctx.el.colours.children] as HTMLButtonElement[];
    expect(chips).toHaveLength(4);

    // Grow the seed tile a same-coloured neighbour so one colour has worth.
    const seed = ctx.game.state.cells[key(0, 0)];
    if (seed?.kind !== 'tile') throw new Error('no seed');
    const colour = seed.colour;

    const chip = chips.find((c) => c.dataset['colour'] === colour);
    if (chip === undefined) throw new Error('no chip for the seed colour');

    chip.click();
    expect(chip.getAttribute('aria-pressed')).toBe('false'); // rebuilt below
    const pressed = [...ctx.el.colours.children].find(
      (c) => c.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed).toBeDefined();
    // The hint line carries the calculation, in the theme's word for it.
    expect(ctx.el.hint.textContent).toMatch(/tiles standing/);
    expect(ctx.el.hint.textContent).toMatch(/worth × pocket size × distance/);

    // Other-coloured tiles dim on the board; the studied colour does not.
    const drawn = ctx.renderer.last.cells.filter((c) => c.kind === 'tile');
    for (const cell of drawn) {
      expect(cell.dimmed).toBe(cell.colour !== colour);
    }

    // Tapping the pressed chip again lets go.
    (pressed as HTMLButtonElement).click();
    expect(ctx.renderer.last.cells.some((c) => c.dimmed)).toBe(false);
  });

  it('always says what to do now, and hides the harvest until it exists', () => {
    expect(ctx.el.hint.textContent).toMatch(/place tiles/i);
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
