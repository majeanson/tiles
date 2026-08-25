/**
 * One contract for every panel that covers the game.
 *
 * The game had four when this was written: the front door, the manual, the
 * hall of fame and the event card — six since the door went lean on
 * 2026-08-25 and grew WORLDS, MORE and SETTINGS, three of which open over
 * another panel rather than over the board. Each grew its own open/close,
 * and by 2026-08-21 they agreed on
 * almost nothing — three had a document-level Escape handler that fired
 * whether or not that panel was the one on top, one scoped Escape to the
 * panel itself (so tabbing out of it stranded you with no keyboard way back),
 * and **none of them made anything inert**. The word appeared exactly once in
 * the whole codebase, and only to clear it.
 *
 * That last one is not a nicety. A panel drawn over the board with nothing
 * inert underneath is a panel you can TAB through and CLICK through: the hall
 * of fame sat over the front door with BEGIN and RESET ALL still reachable
 * behind it. "Modal" was a paint job.
 *
 * So: a stack. Opening a panel makes what it covers inert and remembers what
 * it changed; closing restores exactly that and returns focus where it came
 * from; and Escape reaches only the panel on TOP, because one keypress
 * closing two dialogs is the other half of the same bug.
 *
 * Deliberately not a component — these are four hand-built panels in two
 * files, and the thing they needed was a shared RULE, not a shared widget.
 */

type Open = {
  readonly panel: HTMLElement;
  /** Only what THIS panel made inert, so nesting restores correctly. */
  readonly inerted: readonly HTMLElement[];
  /**
   * Whether the panel was inert when it opened — because something BELOW it
   * on the stack had covered it (2026-08-25). See `openDialog`.
   */
  readonly reInert: boolean;
  readonly opener: HTMLElement | null;
  readonly close: () => void;
};

const stack: Open[] = [];

let listening = false;

/**
 * Installed once, on first use. Escape closes the TOP panel only — the old
 * per-panel handlers all fired on the same keypress, so opening the manual
 * from a screen that already had one open closed both.
 */
function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (top === undefined) return;
    event.stopPropagation();
    top.close();
  });
}

/**
 * `inert` as the ATTRIBUTE rather than the property: the attribute is what
 * the browser honours, and it is also readable, which is what lets a nested
 * panel tell "I made this inert" from "it already was" — the front door
 * leaves `#game-shell` inert, and the manual opened over it must not clear
 * that on the way out.
 */
const isInert = (el: HTMLElement): boolean => el.hasAttribute('inert');

export function openDialog(options: {
  readonly panel: HTMLElement;
  /** Everything this panel covers. Already-inert elements are left alone. */
  readonly covers: readonly HTMLElement[];
  /** Where focus goes when it closes. */
  readonly opener?: HTMLElement | null;
  /** How to close it — called by Escape. Must end in `closeDialog`. */
  readonly close: () => void;
}): void {
  listen();
  // A panel being opened is LIVE, whatever the panel below it decided
  // (2026-08-25). `covers` is siblings, so the moment one panel opens over
  // another — MORE, then the manual or the hall of fame or SETTINGS from
  // inside it — the one about to open is already wearing the inert the first
  // one put on it, and would arrive visible, focusable-looking and
  // completely dead to touch. Cleared here and put BACK on close, because
  // the panel underneath is still open and still covering it.
  const reInert = isInert(options.panel);
  if (reInert) options.panel.removeAttribute('inert');
  const inerted = options.covers.filter((el) => !isInert(el));
  for (const el of inerted) el.setAttribute('inert', '');
  stack.push({
    panel: options.panel,
    inerted,
    reInert,
    opener: options.opener ?? null,
    close: options.close,
  });
}

/**
 * Undo exactly what `openDialog` did, and hand focus back. Safe to call for a
 * panel that is not open — every close path in the game can be reached twice
 * (a tap and an Escape racing, a button that also bubbles).
 */
export function closeDialog(panel: HTMLElement): void {
  const index = stack.findIndex((open) => open.panel === panel);
  if (index < 0) return;
  const [open] = stack.splice(index, 1);
  if (open === undefined) return;
  for (const el of open.inerted) el.removeAttribute('inert');
  // Back under the cover it came out from: whatever inerted this panel is
  // still open below it, and handing it back live would leave a hidden panel
  // tabbable behind the one the reader is looking at.
  if (open.reInert) open.panel.setAttribute('inert', '');
  // Only if it is still in the document: a panel can outlive the button that
  // opened it (the stats row is rebuilt wholesale every render).
  if (open.opener !== null && open.opener.isConnected) open.opener.focus();
}

/** Whether anything is covering the game right now. */
export const dialogOpen = (): boolean => stack.length > 0;

/**
 * Everything a panel covers, derived rather than listed: its own siblings.
 *
 * A hand-written list is a list that goes stale the next time something is
 * added to the page — which is exactly how the manual came to sit over a
 * still-clickable front door. Asking the DOM means a new sibling is covered
 * the day it appears.
 */
export function siblingsOf(panel: HTMLElement): HTMLElement[] {
  const parent = panel.parentElement;
  if (parent === null) return [];
  return [...parent.children].filter(
    (child): child is HTMLElement => child !== panel && child instanceof HTMLElement,
  );
}

/** Test seam: forget every open panel without touching the DOM. */
export function resetDialogs(): void {
  for (const open of stack) {
    for (const el of open.inerted) el.removeAttribute('inert');
    if (open.reInert) open.panel.setAttribute('inert', '');
  }
  stack.length = 0;
}
