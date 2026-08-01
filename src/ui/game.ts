import { newRun, reduce } from '@engine/reduce';
import type { Action, GameState } from '@engine/state';
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
  readonly draft: HTMLElement;
  readonly harvestTiles: HTMLButtonElement;
  readonly harvestPoints: HTMLButtonElement;
  readonly leave: HTMLButtonElement;
  readonly end: HTMLElement;
};

/** Label, value, and whether this is the number counting down to the end. */
type Stat = { readonly id: string; readonly label: string; readonly value: string };

export class Game {
  #state: GameState;
  readonly #renderer: Renderer;
  readonly #el: Elements;
  readonly #theme: Theme;

  constructor(renderer: Renderer, elements: Elements, seed: number, theme: Theme = PLACEHOLDER) {
    this.#renderer = renderer;
    this.#el = elements;
    this.#theme = theme;
    this.#state = newRun(seed);
  }

  get state(): GameState {
    return this.#state;
  }

  start(): void {
    // `pointerup` rather than `click`: a click is synthesised ~300ms after a
    // touch on some mobile browsers, and placing a tile a third of a second
    // after the thumb lifts is the difference between crisp and mushy.
    this.#el.board.addEventListener('pointerup', (event) => {
      const rect = this.#el.board.getBoundingClientRect();
      const hex = this.#renderer.hitTest(event.clientX - rect.left, event.clientY - rect.top);
      if (hex !== null) this.#dispatch({ type: 'PLACE', hex });
    });

    this.#el.harvestTiles.addEventListener('click', () => {
      this.#dispatch({ type: 'HARVEST', choice: 'tiles' });
    });
    this.#el.harvestPoints.addEventListener('click', () => {
      this.#dispatch({ type: 'HARVEST', choice: 'points' });
    });
    this.#el.leave.addEventListener('click', () => {
      this.#dispatch({ type: 'LEAVE' });
    });

    this.render();
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
    this.#renderer.draw(toBoardView(this.#state));
    this.#renderHud(toHudView(this.#state));
  }

  #renderHud(hud: HudView): void {
    this.#renderStats(hud);
    this.#renderDraft(hud);

    // Both payouts are always on screen with their real numbers. The choice is
    // only a choice if you can see what you are giving up.
    this.#el.harvestTiles.textContent = `Take ${hud.harvestTiles} tiles`;
    this.#el.harvestPoints.textContent = `Take ${hud.harvestPoints} pts`;
    this.#el.harvestTiles.disabled = !hud.canHarvest;
    this.#el.harvestPoints.disabled = !hud.canHarvest;

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
      { id: 'map', label: 'MAP', value: String(hud.mapNumber) },
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
        button.setAttribute('aria-pressed', String(tile.selected));

        // The direction's name for this colour, or the colour itself when the
        // direction has no fiction. Written into the card rather than left to
        // hue alone: four blocks of colour with no words is a memory test, and
        // it is also unplayable for anyone who cannot separate two of them.
        const name = this.#theme.terrainNames[tile.colour];
        button.textContent = name;
        button.setAttribute('aria-label', `${name} tile`);

        button.addEventListener('click', () => {
          this.#dispatch({ type: 'SELECT', index });
        });
        return button;
      }),
    );
  }
}
