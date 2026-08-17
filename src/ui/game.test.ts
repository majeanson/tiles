// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { COLOUR_MARK } from '@theme/tokens';
import { TUNING, type Tuning } from '@content/tuning';
import { key, neighbourKeys, type HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { ripeKeys } from '@engine/rules';
import type { Cell, GameState } from '@engine/state';
import type { BoardView, Renderer } from '@render/Renderer';
import { Game, type Elements, type GameHooks } from './game';

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
  /** A grown board raises the ceiling; the stub just states one. */
  max = 4;
  zoomMax(): number {
    return this.max;
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
): { game: Game; renderer: StubRenderer; el: Elements } {
  document.body.innerHTML = `
    <header id="stats"></header>
    <div id="board">
      <div id="camera">
        <button id="help">?</button>
        <button id="zoom-in">+</button>
        <button id="zoom-out">−</button>
        <button id="zoom-fit">FIT</button>
      </div>
      <div id="toast" hidden></div>
      <div id="help-panel" hidden>
        <div id="help-manual"></div>
        <div id="help-meta"></div>
      </div>
    </div>
    <div id="colours"></div>
    <p id="hint" hidden></p>
    <div id="controls"><div id="draft"></div></div>
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
    colours: pick('colours'),
    draft: pick('draft'),
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
    zoomIn: pick<HTMLButtonElement>('zoom-in'),
    zoomOut: pick<HTMLButtonElement>('zoom-out'),
    zoomFit: pick<HTMLButtonElement>('zoom-fit'),
    help: pick<HTMLButtonElement>('help'),
    helpPanel: pick('help-panel'),
    helpManual: pick('help-manual'),
    toast: pick('toast'),
  };

  const renderer = new StubRenderer();
  return { game: new Game(renderer, el, seed, undefined, tuning, hooks), renderer, el };
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
    // Score is off screen while a run is alive; LUCK holds that slot, and
    // depth is REACH. The stash rides at the end of the draft row.
    expect(stat('luck')).toBe('0');
    expect(stat('map')).toBe('0');
    expect(stat('cost')).toBe('−1');
    expect(ctx.el.draft.children.length).toBeGreaterThanOrEqual(ctx.game.state.draft.length);
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
    expect(ctx.el.end.textContent).toMatch(/out of tiles/i);
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

  it('opens the manual as tabs, one panel at a time, and closes on a tap', () => {
    expect(ctx.el.helpPanel.hidden).toBe(true);
    ctx.el.help.click();
    expect(ctx.el.helpPanel.hidden).toBe(false);

    const tabs = [...ctx.el.helpPanel.querySelectorAll('button.help-tab')] as HTMLButtonElement[];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['PLAY', 'BOARD', 'HAND', 'AFTER', 'BUILD']);

    // Exactly one panel is showing, and it is the first tab's.
    const panels = [...ctx.el.helpPanel.querySelectorAll('.help-panel-body')] as HTMLElement[];
    expect(panels.filter((p) => !p.hidden)).toHaveLength(1);
    expect(panels[0]?.hidden).toBe(false);
    expect(panels[0]?.textContent).toContain('THE LOOP');

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
    expect(numbers).toContain(`pop a pocket of ${t.questNeed}+`);

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
    // The hint line carries the calculation, in the theme's word for it —
    // and each colour's OWN power, so no two colours read the same.
    expect(ctx.el.hint.textContent).toMatch(/standing/);
    expect(ctx.el.hint.textContent).toMatch(/worth × pocket size × distance/);
    expect(ctx.el.hint.textContent).toMatch(/crowds|company|ash|tide/);

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
        return { runs: 4, best: 999, isNewBest: false, pops: 30, tilesShare: 0.5 };
      },
      newRun: () => {
        starts++;
      },
    });
    ctx.game.start();

    expect(ctx.el.end.hidden).toBe(false);
    const text = ctx.el.end.textContent ?? '';
    expect(text).toMatch(/0 pts/);
    expect(text).toMatch(/best 999 pts/);
    expect(text).toMatch(/placements/);
    // Gate B's tally, printed where the player will actually read it.
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
      finish: () => ({ runs: 1, best: 500, isNewBest: true, pops: 0, tilesShare: null }),
    });
    ctx.game.start();
    expect(ctx.el.end.textContent).toMatch(/NEW BEST — 500 pts/);
  });

  it('writes the record book exactly once per ended run', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    let writes = 0;
    const ctx = build(1, TUNING, {
      resume: ended,
      finish: () => {
        writes++;
        return { runs: 1, best: 0, isNewBest: false, pops: 0, tilesShare: null };
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
});

describe('a stranger arriving', () => {
  it('opens the manual on a first visit, and not otherwise', () => {
    const first = build(4, TUNING, { firstVisit: true });
    first.game.start();
    expect(first.el.helpPanel.hidden).toBe(false);

    const returning = build(4, TUNING, { firstVisit: false });
    returning.game.start();
    expect(returning.el.helpPanel.hidden).toBe(true);
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
      },
    });
    sharing.game.start();
    const button = sharing.el.end.querySelector('#end-share');
    expect(button).not.toBeNull();
    (button as HTMLButtonElement).click();
    expect(shared).not.toBeNull();
    expect(shared!.points).toBe(120);
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
    for (const el of [ctx.el.help, ctx.el.zoomIn, ctx.el.zoomOut, ctx.el.zoomFit]) {
      expect(el.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
    for (const card of [...ctx.el.draft.children]) {
      expect(card.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
    for (const chip of [...ctx.el.colours.children]) {
      expect(chip.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0);
    }
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

  it('announces a claim, and names what a shrine woke', () => {
    // A shrine one hex from a legal spot: placing beside it claims it.
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

    expect(ctx.el.toast.hidden).toBe(false);
    expect(ctx.el.toast.textContent).toMatch(/◈/);
    expect(ctx.el.toast.textContent).toMatch(/SHRINE WOKEN/);
    expect(ctx.el.toast.textContent).toMatch(/A fourth draft card/);
    expect(ctx.el.toast.textContent).toMatch(/next run/i);
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
    expect(text).toMatch(/Take tiles: \+\d+/);
    expect(text).toMatch(/worth \d+ × pocket 9 × distance \d+/);
    expect(text).toMatch(/1 rare tile/);
  });

  it('shows the arithmetic of a pop', () => {
    const tiles = build(1, TUNING, { resume: rarePocket(9) });
    tiles.game.start();
    tiles.renderer.nextHit = key(0, 0);
    tap(tiles.el.board);
    tiles.el.harvestTiles.click();
    expect(tiles.el.toast.textContent).toMatch(/POPPED 9/);
    expect(tiles.el.toast.textContent).toMatch(/\+\d+ tiles/);
    expect(tiles.el.toast.textContent).toMatch(/Luck \+9/);
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
});
