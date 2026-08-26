import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';
import { TORCHLIT } from '../src/theme/themes/torchlit';
import { hex } from '../src/theme/tokens';

/**
 * Bake the social preview: a static 1200×630 PNG (`og:image`'s own aspect
 * ratio, what Discord/Slack/Twitter all crop an unfurl to).
 *
 * A BOARD SCENE since 2026-08-26 (Marc's ruling): for a game whose only
 * distribution is people sharing links, the scroll-past hook is the game
 * itself — fog, a lit pocket, beacons in the dark — not a brand card that
 * shows no gameplay. The name still travels in `og:title` under the image,
 * so the picture spends every pixel on what playing looks like.
 *
 * Composed as one SVG string over torchlit's own tokens and the SAME baked
 * terrain art the live board serves (`public/assets/torchlit/*.png`,
 * embedded as data URIs), rasterised by sharp like `scripts/icons.ts`.
 * Flat-top hexes, because torchlit's `orientation` is flat — the scene has
 * to wear the board's real facing. Deterministic: fixed layout, no
 * randomness, regenerable byte-for-byte.
 *
 * Regenerate whenever the terrain art or the palette moves:
 *
 *   pnpm exec tsx scripts/social.ts
 */

const at = (p: string): string => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

const W = 1200;
const H = 630;

const bg = hex(TORCHLIT.board.background);
const vignette = hex(TORCHLIT.board.vignette?.colour ?? TORCHLIT.board.background);
const ripe = hex(TORCHLIT.board.ripeEdge);
const homeRing = hex(TORCHLIT.board.home?.ring ?? TORCHLIT.ink.accent);
const accent = hex(TORCHLIT.ink.accent);
const magic = hex(TORCHLIT.ink.magic);
const unique = hex(TORCHLIT.ink.unique);

const art = (slot: string): string =>
  `data:image/png;base64,${readFileSync(at(`assets/torchlit/${slot}.png`)).toString('base64')}`;
const TERRAIN = {
  green: art('terrain.green'),
  yellow: art('terrain.yellow'),
  red: art('terrain.red'),
  blue: art('terrain.blue'),
} as const;
type Colour = keyof typeof TERRAIN;

/** Flat-top hex maths, mirroring `render/layout.ts`'s flat orientation. */
const S = 58; // hex size (centre to vertex), px at og scale
const hexPoints = (cx: number, cy: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + S * Math.cos(a)).toFixed(1)},${(cy + S * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
const centre = (q: number, r: number): { x: number; y: number } => ({
  x: POCKET_X + S * 1.5 * q,
  y: POCKET_Y + S * Math.sqrt(3) * (r + q / 2),
});

// The lit pocket, left of centre the way the old card's mark was — a
// connected clutch of placed tiles around home, three of them ripe. The
// colour spread is one of each plus repeats, so all four terrains show.
const POCKET_X = 330;
const POCKET_Y = 330;
const TILES: ReadonlyArray<{ q: number; r: number; c: Colour; ripe?: boolean }> = [
  { q: 0, r: 0, c: 'red' }, // home
  { q: 1, r: -1, c: 'green', ripe: true },
  { q: 1, r: 0, c: 'yellow' },
  { q: 0, r: 1, c: 'blue' },
  { q: -1, r: 1, c: 'green' },
  { q: -1, r: 0, c: 'yellow', ripe: true },
  { q: 0, r: -1, c: 'blue' },
  { q: 2, r: -1, c: 'green', ripe: true },
  { q: 2, r: 0, c: 'red' },
  { q: -1, r: 2, c: 'blue' },
  { q: 0, r: 2, c: 'yellow' },
  { q: -2, r: 1, c: 'red' },
  { q: 1, r: 1, c: 'green' },
  { q: -2, r: 2, c: 'yellow' },
];

// Fogged remembered ground trailing right of the pocket: bare fills at
// falling alpha, the way memory draws — shape without light.
const FOG: ReadonlyArray<{ q: number; r: number; a: number }> = [
  { q: 3, r: -1, a: 0.9 },
  { q: 3, r: 0, a: 0.75 },
  { q: 4, r: -2, a: 0.6 },
  { q: 4, r: 0, a: 0.48 },
  { q: 5, r: -1, a: 0.38 },
  { q: 4, r: 1, a: 0.3 },
  { q: 5, r: 1, a: 0.22 },
  { q: 6, r: 0, a: 0.15 },
];
const emptyFill = '#241e17'; // a shade over torchlit `empty`, so memory reads through the dark

// Beacons past the light: small hex rings with a soft halo, one per ring
// colour a destination actually wears — gold for a cache, violet for
// magic, flame for unique. Drawn at their own scale so they read as
// "points of light", the way the board's own beacons breathe in the dark.
const BEACONS: ReadonlyArray<{ x: number; y: number; colour: string; s: number }> = [
  { x: 930, y: 190, colour: accent, s: 26 },
  { x: 1060, y: 400, colour: magic, s: 22 },
  { x: 850, y: 520, colour: unique, s: 20 },
];
const beaconPoints = (cx: number, cy: number, s: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const clips: string[] = [];
const tiles: string[] = [];
TILES.forEach((t, i) => {
  const { x, y } = centre(t.q, t.r);
  clips.push(`<clipPath id="h${i}"><polygon points="${hexPoints(x, y)}"/></clipPath>`);
  // The terrain PNG covers the hex's full drawn box (2S wide, √3·S tall).
  tiles.push(
    `<image href="${TERRAIN[t.c]}" x="${(x - S).toFixed(1)}" y="${(y - (S * Math.sqrt(3)) / 2).toFixed(1)}"` +
      ` width="${S * 2}" height="${(S * Math.sqrt(3)).toFixed(1)}" preserveAspectRatio="none" clip-path="url(#h${i})"/>`,
  );
  if (t.ripe === true)
    tiles.push(
      `<polygon points="${hexPoints(x, y)}" fill="none" stroke="${ripe}" stroke-width="6" opacity="0.9"/>`,
    );
  if (t.q === 0 && t.r === 0)
    tiles.push(
      `<polygon points="${hexPoints(x, y)}" fill="none" stroke="${homeRing}" stroke-width="4" opacity="0.95"/>`,
    );
});

const fog = FOG.map(({ q, r, a }) => {
  const { x, y } = centre(q, r);
  return `<polygon points="${hexPoints(x, y)}" fill="${emptyFill}" opacity="${a}"/>`;
}).join('\n  ');

const beacons = BEACONS.map(
  ({ x, y, colour, s }, i) =>
    `<circle cx="${x}" cy="${y}" r="${s * 2.6}" fill="url(#halo${i})"/>` +
    `<polygon points="${beaconPoints(x, y, s)}" fill="none" stroke="${colour}" stroke-width="3.5" opacity="0.95"/>`,
).join('\n  ');
const halos = BEACONS.map(
  ({ colour }, i) =>
    `<radialGradient id="halo${i}"><stop offset="0%" stop-color="${colour}" stop-opacity="0.28"/>` +
    `<stop offset="100%" stop-color="${colour}" stop-opacity="0"/></radialGradient>`,
).join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="pool" cx="27%" cy="52%" r="62%">
      <stop offset="0%" stop-color="#3a2712" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="#1c130a" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="dark" cx="27%" cy="52%" r="85%">
      <stop offset="0%" stop-color="${vignette}" stop-opacity="0"/>
      <stop offset="70%" stop-color="${vignette}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${vignette}" stop-opacity="0.8"/>
    </radialGradient>
    ${halos}
    ${clips.join('\n    ')}
  </defs>
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect width="${W}" height="${H}" fill="url(#pool)"/>
  ${fog}
  ${tiles.join('\n  ')}
  <rect width="${W}" height="${H}" fill="url(#dark)"/>
  ${beacons}
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(at('og-image.png'));
console.log(`og-image.png — ${W}×${H}, board scene`);
