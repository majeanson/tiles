// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDialog, dialogOpen, openDialog, resetDialogs } from './dialog';

/**
 * The panel contract. Before this existed, "modal" was a paint job: nothing
 * was ever made inert, so the hall of fame sat over the front door with BEGIN
 * and RESET ALL still tabbable and clickable behind it — and three separate
 * document-level Escape handlers all fired on one keypress.
 */

const el = (id: string): HTMLElement => {
  const node = document.createElement('div');
  node.id = id;
  document.body.append(node);
  return node;
};

describe('a panel covers what it covers', () => {
  beforeEach(() => {
    resetDialogs();
    document.body.replaceChildren();
  });

  it('makes what it covers inert, and gives it back on close', () => {
    const panel = el('panel');
    const board = el('board');
    const door = el('door');

    openDialog({ panel, covers: [board, door], close: () => closeDialog(panel) });
    expect(board.hasAttribute('inert')).toBe(true);
    expect(door.hasAttribute('inert')).toBe(true);
    expect(dialogOpen()).toBe(true);

    closeDialog(panel);
    expect(board.hasAttribute('inert')).toBe(false);
    expect(door.hasAttribute('inert')).toBe(false);
    expect(dialogOpen()).toBe(false);
  });

  it('leaves alone what was ALREADY inert', () => {
    // The front door leaves `#game-shell` inert while it is up. A manual
    // opened over that must not clear it on the way out — which is why the
    // stack remembers what it changed rather than what it covered.
    const panel = el('panel');
    const shell = el('shell');
    shell.setAttribute('inert', '');

    openDialog({ panel, covers: [shell], close: () => closeDialog(panel) });
    closeDialog(panel);
    expect(shell.hasAttribute('inert')).toBe(true);
  });

  it('nests, and unwinds in the right order', () => {
    const first = el('first');
    const second = el('second');
    const board = el('board');

    openDialog({ panel: first, covers: [board], close: () => closeDialog(first) });
    openDialog({ panel: second, covers: [board, first], close: () => closeDialog(second) });
    expect(first.hasAttribute('inert')).toBe(true);

    closeDialog(second);
    // The inner panel gave back only what IT took: the board stays inert
    // because the outer panel still holds it.
    expect(first.hasAttribute('inert')).toBe(false);
    expect(board.hasAttribute('inert')).toBe(true);

    closeDialog(first);
    expect(board.hasAttribute('inert')).toBe(false);
  });

  it('returns focus to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const panel = el('panel');

    openDialog({ panel, covers: [], opener, close: () => closeDialog(panel) });
    closeDialog(panel);
    expect(document.activeElement).toBe(opener);
  });

  it('does not chase a focus target that has left the document', () => {
    // A panel can outlive the button that opened it — the stats row is
    // rebuilt wholesale on every render.
    const opener = document.createElement('button');
    document.body.append(opener);
    const panel = el('panel');

    openDialog({ panel, covers: [], opener, close: () => closeDialog(panel) });
    opener.remove();
    expect(() => {
      closeDialog(panel);
    }).not.toThrow();
  });

  it('closes twice without undoing anything the second time', () => {
    // Every close path here can be reached twice — a tap and an Escape
    // racing, or a button whose click also bubbles to the panel behind it.
    const panel = el('panel');
    const board = el('board');
    openDialog({ panel, covers: [board], close: () => closeDialog(panel) });
    closeDialog(panel);
    board.setAttribute('inert', '');
    closeDialog(panel);
    expect(board.hasAttribute('inert')).toBe(true);
  });
});

describe('Escape reaches the top panel only', () => {
  beforeEach(() => {
    resetDialogs();
    document.body.replaceChildren();
  });

  it('closes one panel per keypress, never two', () => {
    const closed: string[] = [];
    const first = el('first');
    const second = el('second');

    openDialog({
      panel: first,
      covers: [],
      close: () => {
        closed.push('first');
        closeDialog(first);
      },
    });
    openDialog({
      panel: second,
      covers: [],
      close: () => {
        closed.push('second');
        closeDialog(second);
      },
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toEqual(['second']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toEqual(['second', 'first']);
  });

  it('ignores every other key, and an empty stack', () => {
    const closed: string[] = [];
    const panel = el('panel');
    openDialog({
      panel,
      covers: [],
      close: () => {
        closed.push('panel');
        closeDialog(panel);
      },
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(closed).toEqual([]);

    closeDialog(panel);
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
  });
});
