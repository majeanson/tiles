// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLOUR_MARK } from '@theme/tokens';
import { BARE_TUNING, TUNING, type Tuning } from '@content/tuning';
import { distance, key, neighbourKeys, parse, type HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { ripeKeys } from '@engine/rules';
import { destinationAt } from '@engine/world';
import type { Cell, GameState } from '@engine/state';
import { EMPTY_PROGRESS, TEACH_IDS, UPGRADES, type Progress } from '@meta/progress';
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
  zoomBy(factor: number): void {
    this.zoom = Math.min(4, Math.max(1, this.zoom * factor));
  }
  panBy(dx: number, dy: number): void {
    this.pans.push([dx, dy]);
  }
  centerOn(hex: HexKey): void {
    this.centered.push(hex);
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
): { game: Game; renderer: StubRenderer; el: Elements } {
  document.body.innerHTML = `
    <header id="stats"></header>
    <div id="board">
      <div id="camera">
        <button id="help">?</button>
        <button id="camera-toggle">FIT</button>
      </div>
      <div id="toast" hidden></div>
      <div id="event-card" hidden>
        <div id="event-card-panel">
          <p id="event-card-glyph"></p>
          <p id="event-card-text"></p>
          <button id="event-card-dismiss">GOT IT</button>
        </div>
      </div>
      <div id="help-panel" hidden>
        <div id="help-manual"></div>
        <div id="help-meta"></div>
      </div>
    </div>
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
    cameraToggle: pick<HTMLButtonElement>('camera-toggle'),
    help: pick<HTMLButtonElement>('help'),
    helpPanel: pick('help-panel'),
    helpManual: pick('help-manual'),
    toast: pick('toast'),
    eventCard: pick('event-card'),
    eventCardGlyph: pick('event-card-glyph'),
    eventCardText: pick('event-card-text'),
    eventCardDismiss: pick<HTMLButtonElement>('event-card-dismiss'),
  };

  const renderer = new StubRenderer();
  return { game: new Game(renderer, el, seed, undefined, tuning, hooks, claimed), renderer, el };
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

  // REACH · best N (2026-08-18): the world's own farthest reach, read live
  // off `worldStats` — the same hook the end screen's CARRIED OUT strip
  // uses. No prior best (the hook absent, or a fresh world) is plain REACH N.
  it('shows the world’s best reach beside the live one, or nothing new to say', () => {
    const withBest = build(4, TUNING, {
      worldStats: () => ({ territories: 0, knownPct: 0, farthestReach: 18 }),
    });
    withBest.game.start();
    const value = withBest.el.stats.querySelector('[data-stat="map"] .stat-value')?.textContent;
    expect(value).toBe('0 · best 18');

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
    expect(text).toContain(
      `TITHE — convert your whole purse to relics on the spot, at ${Math.round(t.titheRate * 100)}%`,
    );
    expect(text).toContain(`disabled below ${t.titheMin} luck`);
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
  it('still selects the card on an ordinary tap, long-press or not', () => {
    const card = ctx.el.draft.children[0] as HTMLButtonElement;
    card.dispatchEvent(new window.MouseEvent('contextmenu', { cancelable: true }));
    card.click();
    expect(ctx.game.state.selected).toBe(0);
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

    const frontDoorHelp = document.createElement('button');
    document.body.appendChild(frontDoorHelp);

    ctx.game.openHelp(frontDoorHelp);
    expect(ctx.el.helpPanel.hidden).toBe(false);

    ctx.el.helpPanel.click();
    expect(ctx.el.helpPanel.hidden).toBe(true);
    expect(document.activeElement).toBe(frontDoorHelp);
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
    expect(ctx.el.eventCardGlyph.textContent).toBe('◆');
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
    expect(text).toMatch(/POP for tiles: \+\d+/);
    expect(text).toMatch(/worth \d+ × pocket 9 × distance \d+/);
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

  // The odds moved here from the hint line (Stage 2, 2026-08-18) — closed
  // only, since open already shows the priced spends themselves.
  it('carries the rare-tile odds when closed, and steps aside when open', () => {
    const { ctx, toggle } = shop();
    expect(toggle.textContent).toMatch(/magic .+ unique/);
    toggle.click();
    expect(toggle.textContent).not.toMatch(/magic/);
    expect(ctx.el.spends.hidden).toBe(false);
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
    vi.useFakeTimers();
    try {
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

      // Once only: it does not fire again once the toast has cleared. The
      // row is rebuilt on every render, so the card is re-queried — a tap
      // on a NOT-selected card, since tapping the selected one is the
      // colour question now (2026-08-19), not a re-select.
      vi.advanceTimersByTime(6000);
      expect(ctx.el.toast.hidden).toBe(true);
      const fresh = [...ctx.el.draft.children].filter((c) => !c.classList.contains('hold'));
      (fresh[0] as HTMLButtonElement).click();
      expect(ctx.el.toast.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('names what the previous run woke, once, at the start of a fresh run', () => {
    const ctx = build(1, TUNING, { shrineReceipt: ['A fourth draft card'] });
    ctx.game.start();
    expect(ctx.el.toast.textContent).toBe('Awake since your last run: A fourth draft card.');
  });

  it('says nothing about the receipt on a resumed run', () => {
    const ctx = build(1, TUNING, {
      resume: newRun(7, TUNING),
      shrineReceipt: ['A fourth draft card'],
    });
    ctx.game.start();
    expect(ctx.el.toast.hidden).toBe(true);
  });

  it('names the territory why-line at a fresh run’s start, when it changed the purse', () => {
    const claimed = [key(9, 9), key(-9, 9)];
    const ctx = build(1, TUNING, undefined, claimed);
    ctx.game.start();
    expect(ctx.el.toast.textContent).toBe('+12 tiles from territories held.');
  });

  it('joins the shrine receipt and the territory why-line when both fire', () => {
    const claimed = [key(9, 9), key(-9, 9)];
    const ctx = build(1, TUNING, { shrineReceipt: ['A fourth draft card'] }, claimed);
    ctx.game.start();
    expect(ctx.el.toast.textContent).toBe(
      'Awake since your last run: A fourth draft card. +12 tiles from territories held.',
    );
  });

  it('names the cheapest unbought upgrade on the end screen, with the relics gap', () => {
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
    expect(text).toContain(`${cheapest.name} in ${cheapest.cost - 5}`);
  });

  it('shows just the price once the cheapest upgrade is affordable', () => {
    const ended: GameState = { ...newRun(9, TUNING), phase: 'ended', death: 'broke' };
    let progress: Progress = { ...EMPTY_PROGRESS, relics: 999, met: [...TEACH_IDS] };
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
    expect(text).toContain(`${cheapest.name} ${cheapest.cost}`);
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
    expect(button!.textContent).toBe(`TITHE — all luck → ${expected} relics`);
    expect(button!.disabled).toBe(false);

    button!.click();
    expect(ctx.game.state.luck).toBe(0);
    expect(ctx.game.state.relics).toBe(expected);
    expect(ctx.el.toast.textContent).toBe(`Tithed 100 luck for ${expected} relics.`);
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
    expect(ctx.el.end.textContent).toMatch(/◈ goal met — Reach 20 hexes from home \(\+40 relics\)/);
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
    // door is a payout row now (2026-08-18), not a bordered button — RELICS
    // and the purse total, tappable.
    expect(ctx.el.end.querySelector('.end-epitaph')).not.toBeNull();
    expect(ctx.el.end.querySelector('.shop-row')).toBeNull();
    expect(ctx.el.end.querySelector('#end-shop-open')?.textContent).toMatch(/RELICS\d+/);
  });

  it('shows owned perks by name, and names only the COUNT of the rest', () => {
    const ctx = shelf(['stonewalker'], ['stonewalker']);
    const text = ctx.el.end.textContent ?? '';

    expect(text).toMatch(/THE SHELF/);
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
    const again = setup(s.dev.current());
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

    // A second pop, taught, is the ordinary receipt toast.
    const later = setup(s.dev.current());
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
    expect(fresh).not.toContain('+ CACHE');
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
    expect(grown).toContain('+ CACHE');
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

  it('teaches a colour’s personality at its first placement — once, per colour', () => {
    // Biomes off so a native field cannot take the toast; a pinned all-green
    // draft so the placed colour is the test's, not the seed's.
    const T2: Tuning = { ...T, biomeEvery: 0 };
    const dev = device();
    const greens = ['a', 'b', 'c'].map((id) => ({
      id,
      colour: 'green' as const,
      rarity: 'common' as const,
    }));
    const place = () => {
      const base = newRun(7, T2);
      const ctx = build(1, T2, {
        shop: dev.shop,
        resume: { ...base, draft: greens, selected: 0 },
      });
      ctx.game.start();
      ctx.renderer.nextHit = key(1, 0);
      tap(ctx.el.board);
      return ctx;
    };

    const first = place();
    expect(first.el.toast.hidden).toBe(false);
    expect(first.el.toast.textContent).toMatch(/CROWDS/);
    expect(dev.current().met).toContain('colourGreen');

    // The same colour on a taught device teaches nothing more.
    const second = place();
    expect(second.el.toast.textContent ?? '').not.toMatch(/CROWDS/);
  });

  it('explains the selected card’s colour on a second tap', () => {
    const ctx = build();
    ctx.game.start();
    const selected = ctx.el.draft.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(selected).not.toBeNull();
    selected!.click();
    expect(ctx.el.toast.hidden).toBe(false);
    expect(ctx.el.toast.textContent).toMatch(/CROWDS|COMPANY|ASH|TIDE/);
    // A question, not an action: the selection did not move.
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

  it('offers the crossing on a fully-awake shrine — priced, actionable, refusable', () => {
    let crossed = 0;
    const ctx = shrineAt({
      unlockLabel: () => null, // every rung woken: the ledger is done
      crossing: {
        dowry: () => 100,
        cross: () => {
          crossed++;
        },
      },
    });

    expect(ctx.el.eventCard.hidden).toBe(false);
    const text = ctx.el.eventCardText.textContent ?? '';
    expect(text).toMatch(/THE WORLD IS AWAKE/);
    expect(text).toMatch(/100 relics/);
    expect(text).toMatch(/NEW WORLD/);

    // The card grew its choice: CROSS acts, and the dismiss reads as STAY.
    const act = actionButton();
    expect(act.hidden).toBe(false);
    expect(act.textContent).toContain('100');
    expect(ctx.el.eventCardDismiss.textContent).toBe('STAY');

    act.click();
    expect(crossed).toBe(1);
    // The same bubbling click that dismisses every card closed this one too.
    expect(ctx.el.eventCard.hidden).toBe(true);
  });

  it('stays a plain fully-awake card on a replay — a detour has no world to leave', () => {
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
    expect(ctx.el.eventCardText.textContent).toMatch(/fully awake/);
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
