import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';
import { markGroup } from '../src/meta/mark';
import { THEMES } from '../src/theme/index';
import { hex, isLight, rgba, type Theme } from '../src/theme/tokens';

/**
 * Bake the two wired UI art slots, per art direction:
 *
 *   `ui.logo`   (876×450) — the lockup: the mark over the wordmark. Both
 *               surfaces that draw a mark + name fallback (the front door,
 *               the end screen) swap to this file the moment it exists.
 *   `ui.runEnd` (876×330) — the end screen's hero backdrop: a board scene
 *               in the direction's own tokens and its own baked terrain art,
 *               the same composition language as `scripts/social.ts`.
 *
 * Both slots were wired 2026-08-19 and sat EMPTY in every theme until
 * 2026-08-26 — every player saw the fallbacks. Same contract as the terrain
 * baker: deterministic (fixed layout, no randomness, no dates), offline,
 * regenerable byte-for-byte. Rerun after a palette or terrain-art change:
 *
 *   pnpm exec tsx scripts/artslots.ts
 *
 * The wordmark is set in Cinzel — the same face the live `--font-display`
 * serves — from `scripts/fonts/cinzel.ttf`, which is `public/fonts/
 * cinzel.woff2` decompressed once via `pnpm --package=wawoff2 dlx
 * woff2_decompress.js` (the SVG rasteriser ignores @font-face, and Pango
 * cannot read woff2; same OFL-licensed file, one container over). The logo
 * is baked on TRANSPARENT ground: the slot is per-theme, so it always lands
 * on its own direction's background.
 */

const at = (p: string): string => fileURLToPath(new URL(`../public/${p}`, import.meta.url));
const FONT = fileURLToPath(new URL('./fonts/cinzel.ttf', import.meta.url));

/** The three directions with an asset folder — the placeholder stays drawn. */
const BAKED = new Set(['torchlit', 'torchlit-bright', 'daylight']);

// ------------------------------------------------------------------ ui.logo

const LOGO_W = 876;
const LOGO_H = 450;

async function bakeLogo(theme: Theme): Promise<void> {
  const accent = hex(theme.ink.accent);
  const ink = hex(theme.ink.ink);
  const sparkFill = hex(theme.motion.popColour);

  // The wordmark, rendered big by Pango and scaled down to its slot width.
  // letter_spacing is Pango units: 1024ths of a point — 6144 = 6pt of air.
  const word = await sharp({
    text: {
      text: `<span foreground="${ink}" letter_spacing="6144">ASHWAKE</span>`,
      fontfile: FONT,
      font: 'Cinzel 60',
      rgba: true,
      dpi: 300,
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(word).metadata();
  const wordW = 720;
  const wordH = Math.round((meta.height / meta.width) * wordW);
  const wordScaled = await sharp(word).resize(wordW, wordH).png().toBuffer();

  // The mark at three-ish times favicon scale, a soft accent glow behind it
  // (quiet enough to sit on the theme's own door), and two thin rules
  // holding the space the way the panel hairlines do.
  const s = 3.1;
  const cx = LOGO_W / 2;
  const cy = 160;
  const glowAlpha = isLight(theme) ? 0.16 : 0.22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_W}" height="${LOGO_H}" viewBox="0 0 ${LOGO_W} ${LOGO_H}">
  <defs>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="${accent}" stop-opacity="${glowAlpha}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="170" fill="url(#glow)"/>
  <line x1="118" y1="${cy}" x2="282" y2="${cy}" stroke="${accent}" stroke-width="2" opacity="0.5"/>
  <line x1="${LOGO_W - 282}" y1="${cy}" x2="${LOGO_W - 118}" y2="${cy}" stroke="${accent}" stroke-width="2" opacity="0.5"/>
  <g transform="translate(${cx - 32 * s}, ${cy - 32 * s}) scale(${s})">${markGroup(accent, sparkFill)}</g>
</svg>`;

  await sharp(Buffer.from(svg))
    .composite([{ input: wordScaled, left: Math.round((LOGO_W - wordW) / 2), top: 306 }])
    .png()
    .toFile(at(`assets/${theme.id}/ui.logo.png`));
  console.log(`${theme.id}/ui.logo.png — ${LOGO_W}×${LOGO_H}`);
}

// ---------------------------------------------------------------- ui.runEnd

const END_W = 876;
const END_H = 330;

/** Flat-top hex maths — every baked direction is flat, like the board. */
const S = 40;
const hexPoints = (cx: number, cy: number, size: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const POCKET_X = 230;
const POCKET_Y = 168;
const centre = (q: number, r: number): { x: number; y: number } => ({
  x: POCKET_X + S * 1.5 * q,
  y: POCKET_Y + S * Math.sqrt(3) * (r + q / 2),
});

type SceneColour = 'green' | 'yellow' | 'red' | 'blue';
const TILES: ReadonlyArray<{ q: number; r: number; c: SceneColour; ripe?: boolean }> = [
  { q: 0, r: 0, c: 'red' }, // home
  { q: 1, r: -1, c: 'green', ripe: true },
  { q: 1, r: 0, c: 'yellow' },
  { q: 0, r: 1, c: 'blue' },
  { q: -1, r: 1, c: 'green' },
  { q: -1, r: 0, c: 'yellow', ripe: true },
  { q: 0, r: -1, c: 'blue' },
  { q: 2, r: -1, c: 'green' },
  { q: 2, r: 0, c: 'red' },
  { q: 1, r: 1, c: 'yellow' },
];

const FOG: ReadonlyArray<{ q: number; r: number; a: number }> = [
  { q: 3, r: -1, a: 0.85 },
  { q: 3, r: 0, a: 0.7 },
  { q: 4, r: -1, a: 0.55 },
  { q: 4, r: 0, a: 0.42 },
  { q: 5, r: -1, a: 0.3 },
  { q: 5, r: 0, a: 0.2 },
];

async function bakeRunEnd(theme: Theme): Promise<void> {
  const bg = hex(theme.board.background);
  const ripe = hex(theme.board.ripeEdge);
  const homeRing = hex(theme.board.home?.ring ?? theme.ink.accent);
  const accent = hex(theme.ink.accent);
  const magic = hex(theme.ink.magic);
  const unique = hex(theme.ink.unique);
  const emptyFill = hex(theme.empty.fill);
  const light = isLight(theme);

  const art = (slot: string): string =>
    `data:image/png;base64,${readFileSync(at(`assets/${theme.id}/${slot}.png`)).toString('base64')}`;
  const terrain: Record<SceneColour, string> = {
    green: art('terrain.green'),
    yellow: art('terrain.yellow'),
    red: art('terrain.red'),
    blue: art('terrain.blue'),
  };

  const clips: string[] = [];
  const tiles: string[] = [];
  TILES.forEach((t, i) => {
    const { x, y } = centre(t.q, t.r);
    clips.push(`<clipPath id="h${i}"><polygon points="${hexPoints(x, y, S)}"/></clipPath>`);
    tiles.push(
      `<image href="${terrain[t.c]}" x="${(x - S).toFixed(1)}" y="${(y - (S * Math.sqrt(3)) / 2).toFixed(1)}"` +
        ` width="${S * 2}" height="${(S * Math.sqrt(3)).toFixed(1)}" preserveAspectRatio="none" clip-path="url(#h${i})"/>`,
    );
    if (t.ripe === true)
      tiles.push(
        `<polygon points="${hexPoints(x, y, S)}" fill="none" stroke="${ripe}" stroke-width="4" opacity="0.9"/>`,
      );
    if (t.q === 0 && t.r === 0)
      tiles.push(
        `<polygon points="${hexPoints(x, y, S)}" fill="none" stroke="${homeRing}" stroke-width="3" opacity="0.95"/>`,
      );
  });

  const fog = FOG.map(({ q, r, a }) => {
    const { x, y } = centre(q, r);
    return `<polygon points="${hexPoints(x, y, S)}" fill="${emptyFill}" opacity="${a}"/>`;
  }).join('\n  ');

  const beacons: ReadonlyArray<{ x: number; y: number; colour: string; s: number }> = [
    { x: 640, y: 80, colour: accent, s: 17 },
    { x: 786, y: 190, colour: magic, s: 14 },
    { x: 650, y: 272, colour: unique, s: 13 },
  ];
  const halos = beacons
    .map(
      ({ colour }, i) =>
        `<radialGradient id="halo${i}"><stop offset="0%" stop-color="${colour}" stop-opacity="${light ? 0.2 : 0.28}"/>` +
        `<stop offset="100%" stop-color="${colour}" stop-opacity="0"/></radialGradient>`,
    )
    .join('\n    ');
  const beaconMarks = beacons
    .map(
      ({ x, y, colour, s: bs }, i) =>
        `<circle cx="${x}" cy="${y}" r="${bs * 2.6}" fill="url(#halo${i})"/>` +
        `<polygon points="${hexPoints(x, y, bs)}" fill="none" stroke="${colour}" stroke-width="2.5" opacity="0.95"/>`,
    )
    .join('\n  ');

  // A dark direction gets the torch pool and the closing dark; a pale one is
  // a page, not a night — the vellum carries the scene without either.
  const vignette = theme.board.vignette;
  const pool = light
    ? ''
    : `<radialGradient id="pool" cx="26%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${rgba(theme.ink.accent, 0.22)}"/>
      <stop offset="50%" stop-color="${rgba(theme.ink.accent, 0.08)}"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>`;
  const dark =
    !light && vignette !== null
      ? `<radialGradient id="dark" cx="26%" cy="50%" r="85%">
      <stop offset="0%" stop-color="${hex(vignette.colour)}" stop-opacity="0"/>
      <stop offset="70%" stop-color="${hex(vignette.colour)}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${hex(vignette.colour)}" stop-opacity="0.72"/>
    </radialGradient>`
      : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${END_W}" height="${END_H}" viewBox="0 0 ${END_W} ${END_H}">
  <defs>
    ${pool}
    ${dark}
    ${halos}
    ${clips.join('\n    ')}
  </defs>
  <rect width="${END_W}" height="${END_H}" fill="${bg}"/>
  ${pool === '' ? '' : `<rect width="${END_W}" height="${END_H}" fill="url(#pool)"/>`}
  ${fog}
  ${tiles.join('\n  ')}
  ${dark === '' ? '' : `<rect width="${END_W}" height="${END_H}" fill="url(#dark)"/>`}
  ${beaconMarks}
</svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(at(`assets/${theme.id}/ui.runEnd.png`));
  console.log(`${theme.id}/ui.runEnd.png — ${END_W}×${END_H}`);
}

for (const theme of THEMES) {
  if (!BAKED.has(theme.id)) continue;
  await bakeLogo(theme);
  await bakeRunEnd(theme);
}
