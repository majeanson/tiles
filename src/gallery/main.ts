import { COLOURS, type Colour } from '@content/tuning';
import { bakeSurface, OVERSAMPLE } from '@render/bake';
import { corners } from '@render/layout';
import {
  ASSET_SLOTS,
  assetPath,
  decodeManifest,
  manifestHas,
  type AssetManifest,
} from '@theme/assets';
import { themeCssVars } from '@theme/css';
import { THEMES } from '@theme/index';
import {
  BAND_LIFT,
  LANDMARK_GLYPH,
  brightness,
  fieldGround,
  hex,
  luma,
  mix,
  rgba,
  type Rgb,
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
 *
 * The source moved (2026-08-18/19): "distance" is now measured from the
 * nearest BUILT cell — the light the structure carries — rather than from
 * one torch hex. The curve itself, and this strip's arithmetic, are exactly
 * the same; only what "0 OUT" sits beside changed. See `structureLightStrip`
 * below for the same curve at the mechanic's actual grain, one hex at a time.
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
 * The light the structure carries (2026-08-19): the same `brightness()`
 * curve as `lightStrip` above, but stepped one hex at a time rather than
 * sampled in big jumps — the actual grain `structureDistances` computes in
 * `ui/view.ts`'s multi-source BFS, ring by ring outward from every tile and
 * stone on the board. Where the strip above argues the CURVE, this one
 * argues the MECHANISM: that "0 OUT" is not one hex on the whole map, but
 * every hex touching something built.
 */
function structureLightStrip(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  for (let dist = 0; dist <= 10; dist++) {
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

/**
 * The five destination glyphs over the ground they stand on, lit and spent.
 *
 * Unclaimed ones carry the plinth (2026-08-18): an inset, darker base with a
 * crisp accent rim, drawn under the glyph the same way `PixiRenderer`
 * layers it — so a destination reads as a THING standing on the plane
 * rather than a wall-textured speckle.
 */
function landmarkRow(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  for (const [reward, glyph] of Object.entries(LANDMARK_GLYPH)) {
    for (const claimed of [false, true]) {
      const box = el('div', 'surface landmark');
      box.style.position = 'relative';
      const canvas = bakeSurface(claimed ? theme.stone : theme.wall, 23, theme.orientation);
      if (canvas !== null) box.appendChild(canvas);

      if (!claimed) {
        const w = canvas?.width ?? Math.ceil(23 * 2 * OVERSAMPLE);
        const h = canvas?.height ?? w;
        const plinth = document.createElement('canvas');
        plinth.width = w;
        plinth.height = h;
        plinth.style.position = 'absolute';
        plinth.style.inset = '0';
        if (canvas !== null) {
          plinth.style.width = canvas.style.width;
          plinth.style.height = canvas.style.height;
        }
        const pctx = plinth.getContext('2d');
        if (pctx !== null) {
          const pts = corners(w / 2, h / 2, 23 * OVERSAMPLE * 0.62, theme.orientation);
          pctx.beginPath();
          pctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
          for (let i = 2; i < pts.length; i += 2) pctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
          pctx.closePath();
          pctx.fillStyle = hex(mix(theme.wall.fill, 0x000000, 0.35));
          pctx.globalAlpha = 0.6;
          pctx.fill();
          pctx.globalAlpha = 0.35;
          pctx.strokeStyle = hex(theme.ink.accent);
          pctx.lineWidth = Math.max(2, 23 * 0.05 * OVERSAMPLE);
          pctx.stroke();
        }
        box.appendChild(plinth);
      }

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
 * Native ground as the board actually paints it, from the SAME `fieldGround`
 * the renderer's `PixiRenderer#surfaceFor` calls — Marc's report of
 * 2026-08-20 ("the background tiles of territories colors have not switched
 * textures like the others... make sure it follows automatically and add it
 * to the gallery so we know it follows too"). One function decides WITH
 * slot art or WITHOUT; this card shows exactly that decision and SAYS which
 * one it made, so a future PNG drop or token retune is visible here without
 * reading a diff.
 *
 * The art path is drawn the DOM way (`bakeSurface`'s flat ground under a
 * plain `<img>` at the ghost's own alpha) rather than through
 * `bake.ts`'s canvas-ghost overload the renderer uses — the same reason
 * `ui.logo`/`ui.runEnd` are plain `<img>` tags on this page (`assets.ts`'s
 * own doc): the gallery only ever has the MANIFEST, never a loaded image
 * object to hand a canvas, and stacking two elements is the pattern
 * `ghostStrip` already uses for exactly this kind of layered proof.
 */
function fieldCard(theme: Theme, colour: Colour, manifest: AssetManifest): HTMLElement {
  const assetId = theme.terrain[colour].asset;
  const hasArt = assetId !== null && manifestHas(manifest, theme.id, assetId);
  const ground = fieldGround(theme, colour, hasArt);

  const box = el('div', 'surface field');
  box.style.position = 'relative';

  const canvas = bakeSurface(
    ground.kind === 'art' ? ground.base : ground.surface,
    23,
    theme.orientation,
  );
  if (canvas !== null) box.appendChild(canvas);

  if (ground.kind === 'art') {
    // Sized by `.field-ghost` in `gallery.css`, the same fixed 46px width
    // `.surface canvas` already draws every other card at — real art is
    // authored to the hex's own bounding box (`bake.ts`'s own comment), so
    // the PNG's intrinsic ratio lands within a pixel of the canvas below it.
    const ghost = document.createElement('img');
    ghost.src = assetPath(theme.id, ground.asset);
    ghost.alt = '';
    ghost.className = 'field-ghost';
    ghost.style.opacity = String(ground.ghostAlpha);
    box.appendChild(ghost);
  }

  box.appendChild(el('span', 'surface-name', `${theme.terrainNames[colour]} FIELD`));
  box.appendChild(
    el(
      'span',
      'surface-value field-marker',
      ground.kind === 'art' ? `wearing ${ground.asset} art` : 'procedural floor',
    ),
  );
  return box;
}

function fieldRow(theme: Theme, manifest: AssetManifest): HTMLElement {
  const row = el('div', 'row');
  for (const c of COLOURS) row.appendChild(fieldCard(theme, c, manifest));
  return row;
}

/**
 * The beacon halo (2026-08-18), as one held frame of its breath.
 *
 * `PixiRenderer#advanceBeacons` animates this on the board (an additive
 * sprite pulsing 0.35–1× of its peak over 2.6s); a static gallery page
 * cannot show a pulse, so this is the mid-breath frame — enough to argue the
 * colour and the size, which is what a phone needs settled here. Plain 2D
 * canvas has no additive blend mode, so the gradient is approximated as a
 * soft fill over the board background rather than composited exactly as the
 * board draws it.
 */
function beaconHaloStrip(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  const states: readonly (readonly [string, Rgb])[] = [
    ['NO FIELD', theme.ink.accent],
    ...COLOURS.map((c) => [`${theme.terrainNames[c]} TERRITORY`, theme.terrain[c].fill] as const),
  ];
  for (const [name, tint] of states) {
    const box = el('div', 'surface');
    const size = 46;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = '23px';
    canvas.style.height = '23px';
    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      ctx.fillStyle = hex(theme.board.background);
      ctx.fillRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.3, rgba(tint, 0.75));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    box.appendChild(canvas);
    box.appendChild(el('span', 'surface-name', name));
    row.appendChild(box);
  }
  return row;
}

/**
 * The ghost (placement preview), outline-forward since 2026-08-18: a
 * fainter fill (`theme.ghost`, same as the board) plus a stroke in the held
 * tile's own colour — over PLAIN ground, since the ghost draws on top of
 * whatever is actually there. The stroke's geometry mirrors `bakeSurface`'s
 * own sizing exactly (`OVERSAMPLE`, the same `corners()` the renderer
 * strokes with) so the outline sits where the board's does.
 */
function ghostStrip(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  for (const c of COLOURS) {
    const box = el('div', 'surface ghost-sample');
    const ground = bakeSurface(theme.empty, 23, theme.orientation);
    const fill = bakeSurface(theme.ghost, 23, theme.orientation);
    if (ground !== null) {
      if (fill !== null) {
        fill.style.position = 'absolute';
        fill.style.inset = '0';
        fill.style.opacity = String(theme.ghost.alpha * 0.55);
        box.style.position = 'relative';
        box.appendChild(ground);
        box.appendChild(fill);
      } else {
        box.appendChild(ground);
      }

      const halfW = theme.orientation === 'pointy' ? (Math.sqrt(3) / 2) * 23 : 23;
      const halfH = theme.orientation === 'pointy' ? 23 : (Math.sqrt(3) / 2) * 23;
      const w = Math.ceil(halfW * 2 * OVERSAMPLE);
      const h = Math.ceil(halfH * 2 * OVERSAMPLE);
      const outline = document.createElement('canvas');
      outline.width = w;
      outline.height = h;
      outline.style.position = 'absolute';
      outline.style.inset = '0';
      outline.style.width = ground.style.width;
      outline.style.height = ground.style.height;
      const octx = outline.getContext('2d');
      if (octx !== null) {
        const drawn = 23 * OVERSAMPLE * (1 - theme.ghost.inset);
        const pts = corners(w / 2, h / 2, drawn, theme.orientation);
        octx.beginPath();
        octx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
        for (let i = 2; i < pts.length; i += 2) octx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
        octx.closePath();
        octx.strokeStyle = hex(theme.terrain[c].fill);
        octx.globalAlpha = 0.75;
        octx.lineWidth = Math.max(3, 23 * theme.board.ripeEdgeWidth * 0.8 * OVERSAMPLE);
        octx.stroke();
      }
      box.style.position = 'relative';
      box.appendChild(outline);
    }
    box.appendChild(el('span', 'surface-name', theme.terrainNames[c]));
    row.appendChild(box);
  }
  return row;
}

/**
 * Remembered ground (P4a's fog), the same two-step arithmetic
 * `PixiRenderer#drawCell` runs for `cell.remembered`: the sprite is tinted
 * 45% toward the theme's own background (desaturating the hue, on top of
 * whatever the torch was already doing — full light here, the strip's
 * neutral case), THEN the whole thing draws at 30% alpha. Two steps, not
 * one, because the veil and the dimming answer different questions — is
 * this ground memory, and how hard should it compete with the live board.
 */
function fogStrip(theme: Theme): HTMLElement {
  const row = el('div', 'row');
  const veilTint = mix(0xffffff, theme.board.background, theme.fog.veil);
  for (const c of COLOURS) {
    const box = el('div', 'surface');
    const canvas = bakeSurface(theme.terrain[c], 23, theme.orientation);
    if (canvas !== null) {
      const veiled = tinted(canvas, veilTint);
      veiled.style.opacity = String(theme.fog.alpha);
      box.appendChild(veiled);
    }
    box.appendChild(el('span', 'surface-name', theme.terrainNames[c]));
    row.appendChild(box);
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

  // The plain link — Stage 2, 2026-08-18: this used to force-append
  // &ff=ui.themePicker, which STICKS (the flag resolver writes back to
  // storage), so following it from the gallery permanently turned the
  // picker on for that device even for someone who only wanted to try a
  // direction once. The picker is now its own explicit second link.
  const play = el('a', 'play', `Play in ${theme.name} →`);
  play.href = `/?theme=${encodeURIComponent(theme.id)}`;

  const playWithPicker = el('a', 'play quiet', 'with the picker on →');
  playWithPicker.href = `/?theme=${encodeURIComponent(theme.id)}&ff=ui.themePicker`;

  card.append(
    head,
    el('p', 'theme-note', theme.note),
    labelled(`SURFACES · ${theme.orientation.toUpperCase()}-TOP · 46PX · LUMA UNDER EACH`),
    colour,
    labelled('THE SAME FOUR WITHOUT HUE'),
    grey,
    labelled(
      'THE TORCH · BRIGHTNESS BY DISTANCE FROM THE STRUCTURE’S EDGE (2026-08-19: was one hex, ' +
        'now every tile and stone), THE MULTIPLIER UNDER EACH',
    ),
    lightStrip(theme),
    labelled('THE LIGHT THE STRUCTURE CARRIES · THE SAME CURVE, ONE HEX AT A TIME'),
    structureLightStrip(theme),
    labelled(
      'ELEVATION · FIVE BANDS AT THE LIGHT FLOOR, WHERE CONTOURS LIVE (the board strokes a lit and a shadowed edge; this strip shows the flat lift)',
    ),
    elevationStrip(theme),
    labelled('DESTINATIONS · UNCLAIMED (WITH ITS PLINTH) AND SPENT'),
    landmarkRow(theme),
    labelled('BEACONS · ONE FRAME OF THE HALO’S BREATH (0.35–1× OVER 2.6s ON THE BOARD)'),
    beaconHaloStrip(theme),
    labelled('NATIVE FIELDS · THE SHAPE EACH COLOUR GROWS · WITH ART OR WITHOUT, LABELLED'),
    fieldRow(theme, manifest),
    labelled('THE GHOST · OUTLINE-FORWARD, IN THE HELD TILE’S OWN COLOUR'),
    ghostStrip(theme),
    labelled('REMEMBERED GROUND · THE FOG VEIL (TINT + 30% ALPHA)'),
    fogStrip(theme),
    labelled('INK'),
    inkRow(theme),
    labelled('TYPE'),
    typeBlock(theme),
    labelled('ASSET SLOTS'),
    slotList(theme, manifest),
    play,
    playWithPicker,
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
