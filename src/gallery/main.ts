import { COLOURS } from '@content/tuning';
import { bakeSurface } from '@render/bake';
import { ASSET_SLOTS, decodeManifest, manifestHas, type AssetManifest } from '@theme/assets';
import { themeCssVars } from '@theme/css';
import { THEMES } from '@theme/index';
import { hex, luma, type Surface, type Theme } from '@theme/tokens';

/**
 * The art-direction workbench.
 *
 * One card per direction: its mood in its own words, its ink, its type, every
 * surface drawn by the SAME baker the board uses, the greyscale check the design
 * documents keep asking for, and the state of every asset slot. Then a link that
 * launches the game in it.
 *
 * There is no editing UI and that is on purpose. The thing you edit is the theme
 * file — one object of plain values with the reasoning written beside it — and
 * this page is the mirror. A colour picker here would put the truth in two places
 * and let the important half, the argument for a value, go unwritten.
 */

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function labelled(label: string): HTMLDivElement {
  return el('div', 'section-label', label);
}

/** The surfaces a board is made of, in the order they appear during a run. */
function surfaceList(theme: Theme): readonly (readonly [string, Surface])[] {
  return [
    ...COLOURS.map((c) => [theme.terrainNames[c], theme.terrain[c]] as const),
    ['BLOCKED', theme.wall] as const,
    ['STONE', theme.stone] as const,
    ['EMPTY', theme.empty] as const,
    ['GHOST', theme.ghost] as const,
  ];
}

function surfaceCard(
  name: string,
  surface: Surface,
  theme: Theme,
  showValue: boolean,
): HTMLElement {
  const box = el('div', 'surface');

  const canvas = bakeSurface(surface, 23, theme.orientation);
  if (canvas !== null) box.appendChild(canvas);

  box.appendChild(el('span', 'surface-name', name));
  if (showValue) {
    const mid =
      surface.fillTo === null
        ? luma(surface.fill)
        : (luma(surface.fill) + luma(surface.fillTo)) / 2;
    box.appendChild(el('span', 'surface-value', mid.toFixed(3)));
  }
  return box;
}

function inkRow(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  const entries: readonly (readonly [string, number])[] = [
    ['bg', theme.ink.bg],
    ['ink', theme.ink.ink],
    ['inkDim', theme.ink.inkDim],
    ['inkFaint', theme.ink.inkFaint],
    ['accent', theme.ink.accent],
    ['danger', theme.ink.danger],
    ['panel', theme.ink.panel],
    ['panelEdge', theme.ink.panelEdge],
  ];

  for (const [name, colour] of entries) {
    const chip = el('div', 'chip');
    const swatch = el('i');
    swatch.style.background = hex(colour);
    chip.append(swatch, el('span', undefined, `${name}\n${hex(colour)}`));
    row.appendChild(chip);
  }
  return row;
}

function typeBlock(theme: Theme): HTMLElement {
  const box = el('div');

  const display = el('div', 'type-sample');
  display.append(el('div', 'type-display', '2340'), el('div', 'type-label', 'POINTS'));

  const label = el('div', 'type-sample');
  label.append(el('div', 'type-label', 'TILES · MAP · COST · HARVEST'));

  const body = el('div', 'type-sample');
  body.append(
    el(
      'div',
      'type-body',
      'Out of tiles on map 4, after 312 placements. They cost 4 each by the end.',
    ),
  );

  box.append(display, label, body);
  if (theme.type.webfontHref === null) {
    box.appendChild(el('div', 'surface-value', 'system faces only — nothing to load'));
  }
  return box;
}

/**
 * Every slot, and the truth about it.
 *
 * Three states, and the third is the one worth having: `unwired` means the slot
 * is declared because the art direction assumes a mechanic the game does not have
 * — fog, a title screen, a nine-slice card frame. Dropping a beautiful PNG into
 * one of those changes nothing on screen, and the honest place to say so is here
 * rather than in a conversation six weeks from now.
 */
function slotList(theme: Theme, manifest: AssetManifest): HTMLElement {
  const list = el('div', 'slots');

  for (const slot of ASSET_SLOTS) {
    const present = manifestHas(manifest, theme.id, slot.id);
    const state = !slot.wired ? 'unwired' : present ? 'present' : 'empty';

    const row = el('div', 'slot');
    row.dataset['state'] = state;
    row.append(
      el('span', 'slot-id', slot.id),
      el('span', 'slot-size', `${slot.size[0]}×${slot.size[1]}`),
      el('span', 'slot-note', slot.note),
      el(
        'span',
        'slot-state',
        state === 'present' ? 'LOADED' : state === 'empty' ? 'EMPTY' : 'NO MECHANIC',
      ),
    );
    list.appendChild(row);
  }
  return list;
}

function themeCard(theme: Theme, manifest: AssetManifest): HTMLElement {
  const card = el('section', 'theme');
  for (const [name, value] of Object.entries(themeCssVars(theme))) {
    card.style.setProperty(name, value);
  }

  const head = el('div', 'theme-head');
  head.append(
    el('span', 'theme-name', theme.name),
    el('span', 'theme-id', theme.id),
    el('span', 'theme-source', theme.source),
  );

  const surfaces = surfaceList(theme);

  const colour = el('div', 'row');
  for (const [name, surface] of surfaces)
    colour.appendChild(surfaceCard(name, surface, theme, true));

  // The same four terrains with the hue taken away. If they stop being four
  // things here, the direction fails on a phone in sunlight and for anyone who
  // cannot separate two of them — and no amount of extra colour will fix it.
  const grey = el('div', 'row greyscale');
  for (const c of COLOURS) {
    grey.appendChild(surfaceCard(theme.terrainNames[c], theme.terrain[c], theme, false));
  }
  grey.appendChild(surfaceCard('BLOCKED', theme.wall, theme, false));
  grey.appendChild(surfaceCard('STONE', theme.stone, theme, false));

  const play = el('a', 'play', `Play in ${theme.name} →`);
  play.href = `/?theme=${encodeURIComponent(theme.id)}&ff=ui.themePicker`;

  card.append(
    head,
    el('p', 'theme-note', theme.note),
    labelled(`SURFACES · ${theme.orientation.toUpperCase()}-TOP · 46PX · LUMA UNDER EACH`),
    colour,
    labelled('THE SAME FOUR WITHOUT HUE'),
    grey,
    labelled('INK'),
    inkRow(theme),
    labelled('TYPE'),
    typeBlock(theme),
    labelled('ASSET SLOTS'),
    slotList(theme, manifest),
    play,
  );
  return card;
}

function header(): HTMLElement {
  const head = el('div', 'page-head');
  const title = el('h1', undefined, 'Art directions');
  const intro = el(
    'p',
    undefined,
    'Every direction the game can load, drawn by the same code that draws the board. ' +
      'Values live in src/theme/themes/ — one object each, with the argument for every ' +
      'number written beside it. Edit there; this page is the mirror.',
  );
  const gate = el(
    'p',
    'gate',
    'Gate E is shut: no art direction is chosen until gates A–D pass. These are loaded and ' +
      'switchable so the decision can be made from play on a real phone, not from a document. ' +
      'The placeholder remains the default until LOG.md says otherwise.',
  );
  head.append(title, intro, gate);
  return head;
}

async function main(): Promise<void> {
  const host = document.getElementById('gallery');
  if (host === null) return;

  let manifest: AssetManifest = {};
  try {
    const response = await fetch('/assets/manifest.json');
    if (response.ok) manifest = decodeManifest(await response.json());
  } catch {
    // No art yet is the state this repository ships in, and the honest thing for
    // the page to show is a column of EMPTY rather than an error.
  }

  host.append(header(), ...THEMES.map((theme) => themeCard(theme, manifest)));
}

void main();
