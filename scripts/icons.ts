import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';
import { MARK_SVG, MARK_SVG_MASKABLE } from '../src/meta/mark';

/**
 * Write the icon SVGs from their one source, then rasterise the PNGs the
 * platforms actually honour.
 *
 * The mark itself lives in `src/meta/mark.ts` — the same module the running
 * game imports for the inline favicon and the front-door/end-screen
 * treatment (`src/meta/identity.ts`) — so this script no longer hand-keeps a
 * second copy of the shape in sync; it writes `public/icon.svg` and
 * `public/icon-maskable.svg` from that module and rasterises from what it
 * just wrote. Run after editing `mark.ts`, and commit what it writes:
 *
 *   pnpm exec tsx scripts/icons.ts
 *
 * iOS ignores SVG for `apple-touch-icon` entirely — a home-screen install of
 * the PWA got a page screenshot instead of the mark, on the one device class
 * this game targets (found 2026-08-18). Android's install banner likewise
 * wants raster 192/512.
 */

const at = (p: string): string => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

writeFileSync(at('icon.svg'), `${MARK_SVG}\n`);
writeFileSync(at('icon-maskable.svg'), `${MARK_SVG_MASKABLE}\n`);
console.log('icon.svg + icon-maskable.svg written from src/meta/mark.ts');

async function rasterise(source: string, size: number, out: string): Promise<void> {
  // The SVG viewBox is 64px; density scales the vector up so the PNG is
  // rendered at full resolution rather than upscaled from 64.
  const density = (72 * size) / 64;
  await sharp(readFileSync(at(source)), { density })
    .resize(size, size)
    .png()
    .toFile(at(out));
  console.log(`${out} — ${size}×${size} from ${source}`);
}

await rasterise('icon.svg', 180, 'icon-180.png');
await rasterise('icon.svg', 192, 'icon-192.png');
await rasterise('icon.svg', 512, 'icon-512.png');
await rasterise('icon-maskable.svg', 192, 'icon-maskable-192.png');
await rasterise('icon-maskable.svg', 512, 'icon-maskable-512.png');
