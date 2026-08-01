// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { key, type HexKey } from '@engine/hex';
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

  mount(): Promise<void> {
    return Promise.resolve();
  }
  draw(view: BoardView): void {
    this.views.push(view);
  }
  hitTest(): HexKey | null {
    return this.nextHit;
  }
  destroy(): void {}

  get last(): BoardView {
    const view = this.views[this.views.length - 1];
    if (view === undefined) throw new Error('nothing drawn');
    return view;
  }
}

function build(seed = 4): { game: Game; renderer: StubRenderer; el: Elements } {
  document.body.innerHTML = `
    <header id="stats"></header>
    <div id="board"></div>
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
    draft: pick('draft'),
    harvestTiles: pick<HTMLButtonElement>('harvest-tiles'),
    harvestPoints: pick<HTMLButtonElement>('harvest-points'),
    leave: pick<HTMLButtonElement>('leave'),
    end: pick('end'),
  };

  const renderer = new StubRenderer();
  return { game: new Game(renderer, el, seed), renderer, el };
}

const tap = (el: HTMLElement): void => {
  el.dispatchEvent(new window.PointerEvent('pointerup', { clientX: 0, clientY: 0 }));
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
    const labels = [...ctx.el.draft.children].map((c) => c.textContent);
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
