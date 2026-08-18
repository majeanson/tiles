import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

/**
 * Rasterise the icon SVGs into the PNGs the platforms actually honour.
 *
 * iOS ignores SVG for `apple-touch-icon` entirely — a home-screen install of
 * the PWA got a page screenshot instead of the mark, on the one device class
 * this game targets (found 2026-08-18). Android's install banner likewise
 * wants raster 192/512. The SVGs stay the source of truth; run this after
 * editing either one, and commit what it writes:
 *
 *   pnpm exec tsx scripts/icons.ts
 */

const at = (p: string): string => fileURLToPath(new URL(`../public/${p}`, import.meta.url));

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
