import { newRun, reduce } from '@engine/reduce';
import type { Action, GameState } from '@engine/state';
import type { Renderer } from '@render/Renderer';
import { toBoardView, toHudView, type HudView } from './view';

/**
 * The loop: hold a state, turn taps into actions, redraw.
 *
 * All the thinking lives in the engine and in `view.ts`; this file is wiring
 * and is meant to stay that way. Anything here that starts deciding what a
 * number means belongs in the selector, where it can be tested without a phone.
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

export class Game {
  #state: GameState;
  readonly #renderer: Renderer;
  readonly #el: Elements;

  constructor(renderer: Renderer, elements: Elements, seed: number) {
    this.#renderer = renderer;
    this.#el = elements;
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
    this.#el.stats.textContent = [
      `${hud.tiles} tiles`,
      `${hud.points} pts`,
      `map ${hud.mapNumber}`,
      `−${hud.cost}/place`,
    ].join('   ');

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

  #renderDraft(hud: HudView): void {
    // Rebuilt rather than diffed: three buttons, redrawn a few hundred times a
    // run. A diffing scheme here would be more code than the thing it speeds up.
    this.#el.draft.replaceChildren(
      ...hud.draft.map((tile, index) => {
        const button = document.createElement('button');
        button.className = 'tile';
        button.dataset['colour'] = tile.colour;
        button.setAttribute('aria-pressed', String(tile.selected));
        button.addEventListener('click', () => {
          this.#dispatch({ type: 'SELECT', index });
        });
        return button;
      }),
    );
  }
}
