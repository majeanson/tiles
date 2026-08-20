import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';
import { NAME, TAGLINE } from '../src/meta/identity';
import { MARK_GROUP } from '../src/meta/mark';
import { TORCHLIT } from '../src/theme/themes/torchlit';
import { hex } from '../src/theme/tokens';

/**
 * Bake the social preview: a static 1200×630 PNG (`og:image`'s own aspect
 * ratio, what Discord/Slack/Twitter all crop an unfurl to) so a shared link
 * says something rather than showing the 512px install icon stretched wide.
 *
 * Composed as one SVG string — the mark (`src/meta/mark.ts`), the name and
 * the tagline (`src/meta/identity.ts`), torchlit's own background and ink
 * tokens (`src/theme/themes/torchlit.ts`) — then rasterised, same technique
 * as `scripts/icons.ts`. No webfont: a script that has to run offline
 * cannot depend on a CDN, so the title sits in the same system-serif
 * fallback every theme's own stack already ends in.
 *
 * Regenerate whenever the mark or the wordmark moves:
 *
 *   pnpm exec tsx scripts/social.ts
 */

const at = (p: string): string => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

const W = 1200;
const H = 630;

// The mark, scaled ~4x from its 64px native box and set left of centre —
// vertically centred on the card, clear of both the title baseline and the
// card's edges at every crop a platform is likely to apply.
const MARK_SCALE = 4.0625; // 64 * 4.0625 = 260px, this direction's own mark size at og scale
const MARK_TX = 110;
const MARK_TY = 185;

const TITLE_X = 430;
const RULE_Y = 300;
const TAGLINE_Y = 350;

const cut = TAGLINE.indexOf('. ');
const taglineFirst = cut === -1 ? TAGLINE : TAGLINE.slice(0, cut + 1);
const taglineRest = cut === -1 ? '' : TAGLINE.slice(cut + 2);

const bg = hex(TORCHLIT.board.background);
const ink = hex(TORCHLIT.ink.ink);
const inkDim = hex(TORCHLIT.ink.inkDim);
const accent = hex(TORCHLIT.ink.accent);

const SERIF = "Georgia, 'Times New Roman', serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="pool" cx="22%" cy="46%" r="65%">
      <stop offset="0%" stop-color="#3a2712" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="#1c130a" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect width="${W}" height="${H}" fill="url(#pool)"/>
  <g transform="translate(${MARK_TX} ${MARK_TY}) scale(${MARK_SCALE})">${MARK_GROUP}</g>
  <text x="${TITLE_X}" y="270" font-family="${SERIF}" font-weight="700" font-size="92"
        letter-spacing="10" fill="${ink}">${NAME.toUpperCase()}</text>
  <line x1="${TITLE_X + 2}" y1="${RULE_Y}" x2="${W - 100}" y2="${RULE_Y}"
        stroke="${accent}" stroke-width="2" opacity="0.6"/>
  <text x="${TITLE_X}" y="${TAGLINE_Y}" font-family="${SERIF}" font-style="italic" font-size="28"
        fill="${inkDim}">${taglineFirst}</text>
  <text x="${TITLE_X}" y="${TAGLINE_Y + 40}" font-family="${SERIF}" font-style="italic" font-size="28"
        fill="${inkDim}">${taglineRest}</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(at('og-image.png'));
console.log(`og-image.png — ${W}×${H}`);
