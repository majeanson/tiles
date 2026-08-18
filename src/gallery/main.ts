import { COLOURS } from '@content/tuning';
import { bakeSurface } from '@render/bake';
import { ASSET_SLOTS, decodeManifest, manifestHas, type AssetManifest } from '@theme/assets';
import { themeCssVars } from '@theme/css';
import { THEMES } from '@theme/index';
import {
  BAND_LIFT,
  LANDMARK_GLYPH,
  brightness,
  fieldPattern,
  hex,
  luma,
  mix,
  type Surface,
  type Theme,
} from '@theme/tokens';

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

/**
 * The board tints a cell by MULTIPLYING its texture toward the background as
 * the light falls (`sprite.tint = mix(bg, white, light)`), so the workbench
 * reproduces exactly that: multiply the baked surface by the same colour,
 * then mask the corners back. CSS `filter: brightness()` would be close but
 * not the same arithmetic, and this page's one claim is "drawn by the same
 * rules the board uses".
 */
function tinted(canvas: HTMLCanvasElement, tint: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  out.style.width = canvas.style.width;
  out.style.height = canvas.style.height;
  const ctx = out.getContext('2d');
  if (ctx === null) return canvas;
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hex(tint);
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * The torch, as a strip: one hex per distance from the light, through the
 * same `brightness()` the board multiplies by. This is the direction's most
 * load-bearing value and, until 2026-08-18, the only one the gallery could
 * not show — `light: {radius, fade, floor}` could only be argued with by
 * playing a fifteen-minute run.
 */
function lightStrip(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  for (const dist of [0, 3, 5, 7, 9, 12, 15, 20]) {
    const level = brightness(theme.light, dist);
    const box = el('div', 'surface');
    const canvas = bakeSurface(theme.terrain.green, 23, theme.orientation);
    if (canvas !== null) {
      box.appendChild(tinted(canvas, mix(theme.board.background, 0xffffff, level)));
    }
    box.append(el('span', 'surface-name', `${dist} OUT`));
    box.append(el('span', 'surface-value', level.toFixed(2)));
    row.appendChild(box);
  }
  return row;
}

/**
 * The contour bands, drawn in the dim where they live: at full light the
 * lift clamps to 1 and bands are invisible BY DESIGN, so the strip shows
 * them at the torch's floor — the deep board, where height actually reads.
 */
function elevationStrip(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  const dim = theme.light.floor;
  for (let band = 0; band < 5; band++) {
    const level = Math.min(1, dim * (1 + band * BAND_LIFT));
    const box = el('div', 'surface');
    const canvas = bakeSurface(theme.empty, 23, theme.orientation);
    if (canvas !== null) {
      box.appendChild(tinted(canvas, mix(theme.board.background, 0xffffff, level)));
    }
    box.append(el('span', 'surface-name', `BAND ${band}`));
    row.appendChild(box);
  }
  return row;
}

/** The four destination glyphs over the ground they stand on, lit and spent. */
function landmarkRow(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  for (const [reward, glyph] of Object.entries(LANDMARK_GLYPH)) {
    for (const claimed of [false, true]) {
      const box = el('div', 'surface landmark');
      const canvas = bakeSurface(claimed ? theme.stone : theme.wall, 23, theme.orientation);
      if (canvas !== null) box.appendChild(canvas);
      const mark = el('span', 'landmark-glyph', glyph);
      mark.style.color = hex(claimed ? theme.ink.inkFaint : theme.ink.accent);
      box.appendChild(mark);
      box.appendChild(el('span', 'surface-name', claimed ? `${reward} SPENT` : reward));
      row.appendChild(box);
    }
  }
  return row;
}

/**
 * Native ground as the board actually paints it: each colour's own terrain
 * texture thinned to ground weight, from the same `fieldPattern` the
 * renderer uses. This is the exact thing the playtest keeps asking about
 * ("too subtle, about right, or too busy?"), judged here without a run.
 */
function fieldRow(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  for (const c of COLOURS) {
    const surface: Surface = { ...theme.empty, pattern: fieldPattern(theme, c) };
    row.appendChild(surfaceCard(`${theme.terrainNames[c]} FIELD`, surface, theme, false));
  }
  return row;
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
    labelled('THE TORCH · BRIGHTNESS BY DISTANCE, THE MULTIPLIER UNDER EACH'),
    lightStrip(theme),
    labelled('ELEVATION · FIVE BANDS AT THE LIGHT FLOOR, WHERE CONTOURS LIVE'),
    elevationStrip(theme),
    labelled('DESTINATIONS · UNCLAIMED AND SPENT'),
    landmarkRow(theme),
    labelled('NATIVE FIELDS · THE SHAPE EACH COLOUR GROWS'),
    fieldRow(theme),
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
    'Gate E opened 2026-08-15 and TORCHLIT is the shipped default — chosen here, from a ' +
      'phone, which is what this page was built for. The others stay loaded and switchable ' +
      '(?theme=) so the choice can always be re-argued by looking rather than remembering.',
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
