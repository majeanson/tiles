import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import type { HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { isRipe } from '@engine/rules';
import type { Action, GameState } from '@engine/state';
import { bakeSurface } from '@render/bake';
import type { Renderer } from '@render/Renderer';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import type { Theme } from '@theme/tokens';
import { toBoardView, toHudView, type HudView } from './view';

/**
 * The loop: hold a state, turn taps into actions, redraw.
 *
 * All the thinking lives in the engine and in `view.ts`; this file is wiring
 * and is meant to stay that way. Anything here that starts deciding what a
 * number means belongs in the selector, where it can be tested without a phone.
 *
 * The theme reaches this file for exactly two reasons: the draft cards need the
 * direction's NAME for a colour ("CRYPT" rather than "green"), and the stat row
 * needs to know which number is the one that kills you. Colours themselves never
 * appear here — they arrive as CSS custom properties, written once by
 * `applyTheme`, so the chrome and the canvas cannot drift apart.
 */

export type Elements = {
  readonly board: HTMLElement;
  readonly stats: HTMLElement;
  readonly hint: HTMLElement;
  readonly draft: HTMLElement;
  readonly harvestTiles: HTMLButtonElement;
  readonly harvestPoints: HTMLButtonElement;
  readonly leave: HTMLButtonElement;
  readonly end: HTMLElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomFit: HTMLButtonElement;
  readonly help: HTMLButtonElement;
  readonly helpPanel: HTMLElement;
};

/** One zoom-button step. Three taps from fit to full close-up. */
const ZOOM_STEP = 1.6;

/** Movement under this many pixels is still a tap; past it, a drag. */
const TAP_SLOP = 8;

/** Label, value, and whether this is the number counting down to the end. */
type Stat = { readonly id: string; readonly label: string; readonly value: string };

/** Circumradius of the hex drawn on a draft card, in CSS pixels. */
const HAND_HEX_SIZE = 24;

export class Game {
  #state: GameState;
  readonly #renderer: Renderer;
  readonly #el: Elements;
  readonly #theme: Theme;
  /**
   * The four terrain surfaces, baked once to data URLs so a draft card shows the
   * tile EXACTLY as the board will draw it — same baker, same theme, same
   * texture. A card that shows a flat swatch while the board shows a hatched hex
   * is promising one thing and placing another. Empty where no 2D canvas exists
   * (happy-dom, a broken context); the flat swatch is the fallback, not an error.
   */
  readonly #art: Partial<Record<Colour, string>> = {};

  /**
   * The pocket the player last tapped, on the plane. UI state, not game state:
   * the engine only learns about it when a harvest button carries it as `at`.
   * The selector re-resolves it every render, so a stale tap (the pocket got
   * popped) degrades to the biggest pocket rather than to a dead button.
   */
  #harvestAt: HexKey | null = null;

  constructor(
    renderer: Renderer,
    elements: Elements,
    seed: number,
    theme: Theme = PLACEHOLDER,
    tuning: Tuning = TUNING,
  ) {
    this.#renderer = renderer;
    this.#el = elements;
    this.#theme = theme;
    this.#state = newRun(seed, tuning);

    for (const colour of COLOURS) {
      try {
        const baked = bakeSurface(theme.terrain[colour], HAND_HEX_SIZE, theme.orientation);
        if (baked !== null) this.#art[colour] = baked.toDataURL();
      } catch {
        // No canvas here. The card keeps its coloured background and its word.
      }
    }
  }

  get state(): GameState {
    return this.#state;
  }

  start(): void {
    this.#mountGestures();

    this.#el.zoomIn.addEventListener('click', () => {
      this.#renderer.zoomBy(ZOOM_STEP);
      this.#syncCamera();
    });
    this.#el.zoomOut.addEventListener('click', () => {
      this.#renderer.zoomBy(1 / ZOOM_STEP);
      this.#syncCamera();
    });
    this.#el.zoomFit.addEventListener('click', () => {
      this.#renderer.resetCamera();
      this.#syncCamera();
    });

    // The help panel is static text, written once: how to play, in the order
    // a run asks the questions. It closes on any tap because the only thing
    // to do with it is stop reading it.
    this.#el.helpPanel.replaceChildren(
      ...this.#helpLines().map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
    this.#el.help.addEventListener('click', () => {
      this.#el.helpPanel.hidden = !this.#el.helpPanel.hidden;
    });
    this.#el.helpPanel.addEventListener('click', () => {
      this.#el.helpPanel.hidden = true;
    });

    this.#el.harvestTiles.addEventListener('click', () => {
      this.#harvest('tiles');
    });
    this.#el.harvestPoints.addEventListener('click', () => {
      this.#harvest('points');
    });
    this.#el.leave.addEventListener('click', () => {
      this.#dispatch({ type: 'LEAVE' });
    });

    this.#syncCamera();
    this.render();
  }

  /**
   * One finger taps or, past a small slop, pans. Two fingers pinch. Placement
   * only ever happens on a lift that never crossed the slop — so the board
   * can be dragged and zoomed freely without a stray tile appearing, which is
   * the gesture war P3a sidestepped by having no camera at all.
   *
   * `pointerup` rather than `click` for the tap: a click is synthesised
   * ~300ms after a touch on some mobile browsers, and placing a tile a third
   * of a second after the thumb lifts is the difference between crisp and
   * mushy.
   */
  #mountGestures(): void {
    const board = this.#el.board;
    const down = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinch = 0;

    const spread = (): number => {
      const [a, b] = [...down.values()];
      return a !== undefined && b !== undefined ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    board.addEventListener('pointerdown', (event) => {
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (down.size === 2) pinch = spread();
      try {
        board.setPointerCapture(event.pointerId);
      } catch {
        // No capture support (old browser, test DOM). Gestures still work;
        // a drag that leaves the element just ends early.
      }
    });

    board.addEventListener('pointermove', (event) => {
      const from = down.get(event.pointerId);
      if (from === undefined) return;

      if (down.size >= 2) {
        down.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const d = spread();
        if (pinch > 0 && d > 0) {
          this.#renderer.zoomBy(d / pinch);
          this.#syncCamera();
        }
        pinch = d;
        moved = true;
        return;
      }

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      moved = true;
      this.#renderer.panBy(dx, dy);
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });

    const lift = (event: PointerEvent): void => {
      const had = down.delete(event.pointerId);
      if (down.size > 0) {
        // One finger of a pinch lifted; the other continues as a pan.
        pinch = 0;
        return;
      }
      const tapped = had && !moved && event.type === 'pointerup';
      moved = false;
      pinch = 0;
      if (tapped) this.#tap(event);
    };
    board.addEventListener('pointerup', lift);
    board.addEventListener('pointercancel', lift);
  }

  #tap(event: PointerEvent): void {
    const rect = this.#el.board.getBoundingClientRect();
    const hex = this.#renderer.hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (hex === null) return;

    // On the plane a tap on a ripe tile is a QUESTION — "what is this pocket
    // worth?" — not a placement. The harvest buttons re-price to that pocket
    // and the board outlines it. Everywhere else a tap stays a placement.
    if (this.#state.tuning.world === 'endless' && isRipe(this.#state.cells, hex)) {
      this.#harvestAt = hex;
      this.render();
      return;
    }
    this.#dispatch({ type: 'PLACE', hex });
  }

  /** Zooming out below fit is meaningless, so those two buttons say so. */
  #syncCamera(): void {
    const atFit = this.#renderer.zoomLevel() <= 1.001;
    this.#el.zoomOut.disabled = atFit;
    this.#el.zoomFit.disabled = atFit;
  }

  /**
   * How to play, in plain words, in the order a run asks the questions.
   * Static per world; rules are quoted, never re-derived, so this text can
   * not drift from the engine without someone editing a sentence on purpose.
   */
  #helpLines(): string[] {
    const endless = this.#state.tuning.world === 'endless';
    return [
      'Tap a card, then a glowing hex. Placing costs tiles, and the cost rises all run.',
      'Surround a tile on all six sides to ripen it. Its worth = matching neighbours.',
      endless
        ? 'Tap a ripe pocket, then take tiles (live longer) or pts (score — farther from home pays more).'
        : 'Harvest pops every ripe tile: take tiles (live longer) or pts (score — deeper maps pay more).',
      'Popped tiles turn to stone. Stone surrounds but never matches — keep moving.',
      ...(endless
        ? [
            'Glows in the dark are destinations: + pays tiles, ★ pays pts, ◆ claims the land around it. Build out and touch them.',
            'MAGIC tiles match any colour; UNIQUE ones count double. Taking tiles from big pockets raises the odds.',
          ]
        : ['Once you have harvested here, you may move on — deeper maps pay more.']),
      'Zoom with + and −, drag to pan, FIT to see everything.',
      'Out of tiles ends the run. Tap to close this.',
    ];
  }

  /**
   * Harvest what the buttons are pricing. The selector owns which pocket that
   * is (`hud.harvestAt`), so the dispatch and the price cannot disagree.
   */
  #harvest(choice: 'tiles' | 'points'): void {
    const at = toHudView(this.#state, this.#harvestAt).harvestAt;
    this.#dispatch(at === null ? { type: 'HARVEST', choice } : { type: 'HARVEST', choice, at });
  }

  #dispatch(action: Action): void {
    const next = reduce(this.#state, action);
    // The engine returns the same state for anything illegal, so this is also
    // the "that did nothing" check — no need to ask permission before acting.
    if (next === this.#state) return;
    this.#state = next;
    this.render();
  }

  render(): void {
    this.#renderer.draw(toBoardView(this.#state, this.#harvestAt));
    this.#renderHud(toHudView(this.#state, this.#harvestAt));
  }

  #renderHud(hud: HudView): void {
    this.#renderStats(hud);
    this.#renderDraft(hud);

    // The reorientation line: what to do now, then the nearest destination,
    // then the odds. One string, collapsing to nothing when all are silent.
    const hint = [hud.guide, hud.hint, hud.odds].filter((s) => s !== null).join(' · ');
    this.#el.hint.textContent = hint;
    this.#el.hint.hidden = hint === '';

    // The harvest buttons exist only while the choice does. A pair of dead
    // buttons pricing an impossible harvest at 0 was two decisions on screen
    // that were not decisions; their appearing IS the "pocket ready" signal,
    // and when they appear both payouts show their real numbers — the choice
    // is only a choice if you can see what you are giving up.
    this.#el.harvestTiles.textContent = `Take ${hud.harvestTiles} tiles`;
    this.#el.harvestPoints.textContent = `Take ${hud.harvestPoints} pts`;
    this.#el.harvestTiles.hidden = !hud.canHarvest;
    this.#el.harvestPoints.hidden = !hud.canHarvest;
    this.#el.harvestTiles.disabled = !hud.canHarvest;
    this.#el.harvestPoints.disabled = !hud.canHarvest;

    this.#el.leave.hidden = !hud.showLeave;
    this.#el.leave.textContent = hud.leaveHint;
    this.#el.leave.disabled = !hud.canLeave;

    this.#el.end.hidden = !hud.ended;
    if (hud.epitaph !== null) this.#el.end.textContent = hud.epitaph;
  }

  /**
   * Four numbers, each with its label above it.
   *
   * It was one concatenated line before, which was legible on a laptop and a
   * smear on a phone. The structure is the same in every art direction handed
   * down — tiles and points on the left, map and cost on the right — and cost is
   * on it because cost is the thing that eventually kills you.
   *
   * `data-stat="tiles"` carries the one piece of meaning the CSS needs: that is
   * the number counting down, and every direction paints it in its one warm
   * colour for that reason.
   */
  #renderStats(hud: HudView): void {
    const stats: readonly Stat[] = [
      { id: 'tiles', label: 'TILES', value: String(hud.tiles) },
      { id: 'points', label: 'POINTS', value: String(hud.points) },
      { id: 'map', label: hud.depthLabel, value: String(hud.depthValue) },
      { id: 'cost', label: 'COST', value: `−${hud.cost}` },
    ];

    this.#el.stats.replaceChildren(
      ...stats.map((stat) => {
        const box = document.createElement('div');
        box.className = 'stat';
        box.dataset['stat'] = stat.id;

        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = stat.label;

        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = stat.value;

        box.append(label, value);
        return box;
      }),
    );
  }

  #renderDraft(hud: HudView): void {
    // Rebuilt rather than diffed: three buttons, redrawn a few hundred times a
    // run. A diffing scheme here would be more code than the thing it speeds up.
    this.#el.draft.replaceChildren(
      ...hud.draft.map((tile, index) => {
        const button = document.createElement('button');
        button.className = 'tile';
        button.dataset['colour'] = tile.colour;
        button.dataset['rarity'] = tile.rarity;
        button.setAttribute('aria-pressed', String(tile.selected));

        // The direction's name for this colour, or the colour itself when the
        // direction has no fiction. Written into the card rather than left to
        // hue alone: four blocks of colour with no words is a memory test, and
        // it is also unplayable for anyone who cannot separate two of them.
        const name = this.#theme.terrainNames[tile.colour];
        button.setAttribute(
          'aria-label',
          tile.rarity === 'common' ? `${name} tile` : `${tile.rarity} ${name} tile`,
        );

        const art = this.#art[tile.colour];
        if (art !== undefined) {
          const img = document.createElement('img');
          img.className = 'tile-art';
          img.src = art;
          img.alt = '';
          img.draggable = false;
          button.classList.add('has-art');
          button.append(img);
        }

        const label = document.createElement('span');
        label.className = 'tile-name';
        label.textContent = name;
        button.append(label);

        // Rarity is written on the card, not just hinted: MAGIC matches every
        // colour and UNIQUE counts double, and a power you might not notice is
        // a power that might as well not exist.
        if (tile.rarity !== 'common') {
          const badge = document.createElement('span');
          badge.className = 'tile-rarity';
          badge.textContent = tile.rarity.toUpperCase();
          button.append(badge);
        }

        // The card whose best placement pays the most, marked so choosing a
        // card starts from an answer instead of an audit. The selector decides
        // which one from the same previews the board draws.
        if (tile.best) {
          const badge = document.createElement('span');
          badge.className = 'tile-best';
          badge.textContent = 'BEST';
          button.append(badge);
        }

        button.addEventListener('click', () => {
          this.#dispatch({ type: 'SELECT', index });
        });
        return button;
      }),
    );
  }
}
