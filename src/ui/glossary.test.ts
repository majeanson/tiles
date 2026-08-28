// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { COLOUR_MARK, CONCEPT_MARK, LANDMARK_GLYPH, TILE_GLYPH } from '@theme/tokens';
import { TORCHLIT } from '@theme/themes/torchlit';
import { TUNING } from '@content/tuning';
import { EMPTY_PROGRESS, TEACH_IDS } from '@meta/progress';
import type { HexKey } from '@engine/hex';
import type { Renderer } from '@render/Renderer';
import { Game, type Elements, type GameHooks } from './game';
import { GLOSSARY, glossaryEntry } from './glossary';

/**
 * The registry (2026-08-27, WORKPLAN's symbol & glossary pipeline, Stage 3):
 * ships no UI change, so what is worth pinning here is that the registry
 * cannot quietly go wrong underneath Stage 4 — a duplicate id, a term that
 * cannot be uppercase-matched, a glyph invented rather than borrowed, a
 * definition nobody could ever tap because the manual never prints its word.
 */

/** A renderer that draws nothing — same stub `game.test.ts` uses to open the manual headless. */
class StubRenderer implements Renderer {
  mount(): Promise<void> {
    return Promise.resolve();
  }
  draw(): void {}
  hitTest(): HexKey | null {
    return null;
  }
  setReducedMotion(): void {}
  zoomBy(): void {}
  panBy(): void {}
  centerOn(): void {}
  flyToHex(): void {}
  flyToFit(): void {}
  resetCamera(): void {}
  zoomLevel(): number {
    return 1;
  }
  zoomMax(): number {
    return 4;
  }
  snapshot(): string | null {
    return null;
  }
  destroy(): void {}
}

/**
 * The same shape `game.test.ts`'s own `openFullManual` builds: a bare DOM,
 * a `Game` with every teach id already met, the manual opened. Reused here
 * rather than imported — `game.test.ts` does not export it — so a term
 * this stage's entries name can be checked against the words a veteran
 * device actually sees, not against this file's own assumptions.
 */
function openFullManual(): string {
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
          <div id="event-card-figure"></div>
          <div id="event-card-rows"></div>
          <button id="event-card-dismiss">GOT IT</button>
        </div>
      </div>
      <div id="help-panel" hidden>
        <div id="help-manual"></div>
        <div id="help-menu"></div>
      </div>
      <div id="term-card" hidden>
        <div id="term-card-panel">
          <p id="term-card-glyph"></p>
          <p id="term-card-name"></p>
          <p id="term-card-text"></p>
          <div id="term-card-figure"></div>
          <button id="term-card-dismiss">GOT IT</button>
        </div>
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
    eventCardFigure: pick('event-card-figure'),
    eventCardRows: pick('event-card-rows'),
    eventCardDismiss: pick<HTMLButtonElement>('event-card-dismiss'),
    termCard: pick('term-card'),
    termCardGlyph: pick('term-card-glyph'),
    termCardName: pick('term-card-name'),
    termCardText: pick('term-card-text'),
    termCardFigure: pick('term-card-figure'),
    termCardDismiss: pick<HTMLButtonElement>('term-card-dismiss'),
  };

  const hooks: GameHooks = {
    shop: {
      read: () => ({ ...EMPTY_PROGRESS, met: [...TEACH_IDS] }),
      write: () => undefined,
    },
    crossing: { dowry: () => 25, cross: () => undefined },
  };

  const game = new Game(new StubRenderer(), el, 5, TORCHLIT, TUNING, hooks);
  game.start();
  el.help.click();
  return el.helpPanel.textContent ?? '';
}

describe('the glossary registry', () => {
  it('has a unique id per entry', () => {
    const ids = GLOSSARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spells every term in capitals, unique across the whole registry', () => {
    const allTerms = GLOSSARY.flatMap((entry) => entry.terms);
    for (const term of allTerms) {
      expect(term, `${term} is not uppercase`).toBe(term.toUpperCase());
    }
    expect(new Set(allTerms).size, 'a term repeats across two entries').toBe(allTerms.length);
  });

  it('orders each entry’s own terms longest first', () => {
    for (const entry of GLOSSARY) {
      const lengths = entry.terms.map((term) => term.length);
      const sorted = [...lengths].sort((a, b) => b - a);
      expect(lengths, `${entry.id}'s terms are not longest-first`).toEqual(sorted);
    }
  });

  it('borrows every glyph from one of the four registries — never a literal', () => {
    const known = new Set<string>([
      ...Object.values(COLOUR_MARK),
      ...Object.values(LANDMARK_GLYPH),
      ...Object.values(CONCEPT_MARK),
      TILE_GLYPH,
    ]);
    for (const entry of GLOSSARY) {
      if (entry.glyph !== undefined) {
        expect(known.has(entry.glyph), `${entry.id}'s glyph is not in the registries`).toBe(true);
      }
    }
  });

  it('defines every entry as non-empty prose, in this run’s own numbers', () => {
    for (const entry of GLOSSARY) {
      const text = entry.define(TUNING, TORCHLIT);
      expect(text.length, `${entry.id} defines nothing`).toBeGreaterThan(0);
    }
  });

  it('names each entry’s primary term where the manual actually prints it', () => {
    const manual = openFullManual();
    for (const entry of GLOSSARY) {
      const primary = entry.terms[0];
      expect(primary, `${entry.id} has no terms`).toBeDefined();
      expect(manual, `the manual never prints ${entry.id}'s term "${primary ?? ''}"`).toContain(
        primary,
      );
    }
  });

  it('leaves no entry for a concept the manual never prints in capitals', () => {
    // `wall` is spoken as "Wall"/"wall" today, never "WALL" — and
    // `lastGasp`'s rule is stated in full sentences, under no name at all.
    // Both stay out per this stage's own rule (see `glossary.ts`'s doc)
    // rather than forcing a manual rewrite this stage does not own.
    expect(glossaryEntry('wall')).toBeUndefined();
    expect(glossaryEntry('lastGasp')).toBeUndefined();
  });
});
