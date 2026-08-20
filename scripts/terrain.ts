import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';
import { rngNext, stream, type RngStream } from '../src/engine/rng';
import { TORCHLIT } from '../src/theme/themes/torchlit';
import { hex, luma, type Rgb, type Surface } from '../src/theme/tokens';

/**
 * Bake torchlit's terrain PNGs: the eight wired slots WORKPLAN Stage 3 asks
 * for — `terrain.green/yellow/red/blue/wall/stone/ghost` at 414×358
 * (flat-top's own bounding-box ratio, `theme/assets.ts`'s `TERRAIN` size)
 * and `fx.pop` at 256×256.
 *
 * Same spirit as `scripts/icons.ts` and `scripts/social.ts`: one composed
 * SVG per file, rasterised by `sharp`, reading colour straight off
 * `TORCHLIT` rather than a hand-copied palette, so regenerating after the
 * theme moves is `pnpm exec tsx scripts/terrain.ts` and nothing else.
 *
 * Deliberately NOT `bake.ts` reused verbatim: that file's job is a cheap
 * per-frame texture, cached and redrawn at whatever size the board happens
 * to be. This script pays once, offline, for things a live bake never
 * could — organic jitter per moss tuft and per blade of dry grass, radiating
 * cracks instead of a repeating hatch — while still speaking the SAME
 * vocabulary the theme states (`pattern`/`overlay`/`scorch`), so the two
 * never disagree about what a colour IS, only about how much they can
 * afford to spend saying so.
 *
 * `THE BAR` (WORKPLAN Stage 3): a slot this cannot make GOOD stays empty on
 * purpose. Every slot below shipped because it cleared that bar on
 * inspection; none of the eight is a placeholder for "will improve later".
 *
 * No CC0 texture assets were used to seed any layer here (decision of
 * record permits it; this session judged procedural generation — reading
 * the theme's own colours and patterns rather than a stock photo — the
 * better fit for "warm light against darkness" at this size, and skipped
 * the network-fetch/licence-bookkeeping cost the decision explicitly says
 * is optional). See `public/assets/README.md` and `LOG.md`.
 */

const outDir = fileURLToPath(new URL('../public/assets/torchlit/', import.meta.url));
mkdirSync(outDir, { recursive: true });
const at = (name: string): string => `${outDir}${name}`;

const T = TORCHLIT;

// ---------------------------------------------------------------- geometry

const TW = 414;
const TH = 358;
const TCX = TW / 2;
const TCY = TH / 2;
const TSIZE = TW / 2; // circumradius: flat-top's bounding box is 2*size wide, √3*size tall.

/** Flat-top hex corners — the same winding `render/layout.ts#corners` uses. */
function hexPoints(cx: number, cy: number, size: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}

const ptsAttr = (pts: readonly (readonly [number, number])[]): string =>
  pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

// -------------------------------------------------------------- randomness

/**
 * A tiny stateful wrapper over `engine/rng.ts`'s pure counter-based stream —
 * fine here (this is a build script, not `src/engine/`) and load-bearing:
 * "deterministic" is WORKPLAN's own word for this script, so every jitter
 * below comes from a named, fixed seed rather than `Math.random`.
 */
function rng(seed: number): { next(): number; range(min: number, max: number): number } {
  let s: RngStream = stream(seed);
  return {
    next(): number {
      const [v, n] = rngNext(s);
      s = n;
      return v;
    },
    range(min: number, max: number): number {
      return min + this.next() * (max - min);
    },
  };
}

// ----------------------------------------------------------------- pieces

const rgba = (c: Rgb, a: number): string =>
  `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${a})`;

function clipDef(id: string, inset: number): string {
  const pts = hexPoints(TCX, TCY, TSIZE * (1 - inset));
  return `<clipPath id="${id}"><polygon points="${ptsAttr(pts)}"/></clipPath>`;
}

function fillRect(surface: Surface, w = TW, h = TH): string {
  const to = surface.fillTo ?? surface.fill;
  return (
    `<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${hex(surface.fill)}"/>` +
    `<stop offset="1" stop-color="${hex(to)}"/>` +
    `</linearGradient>` +
    `<rect width="${w}" height="${h}" fill="url(#fill)"/>`
  );
}

/** The depth pass every slot gets — see `render/bake.ts#paintDepth`'s own doc. */
function depthRect(w = TW, h = TH): string {
  return (
    `<linearGradient id="depth" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>` +
    `<stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0.1"/>` +
    `</linearGradient>` +
    `<rect width="${w}" height="${h}" fill="url(#depth)"/>`
  );
}

/** The scorch — see `theme/themes/torchlit.ts`'s `stone` surface for why. */
function scorchRect(): string {
  const cx = TW * 0.46;
  const cy = TH * 0.57;
  const r = Math.min(TW, TH) * 0.56;
  return (
    `<radialGradient id="scorch" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="0.46"/>` +
    `<stop offset="0.4" stop-color="#000000" stop-opacity="0.24"/>` +
    `<stop offset="0.75" stop-color="#000000" stop-opacity="0.08"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<rect width="${TW}" height="${TH}" fill="url(#scorch)"/>`
  );
}

/**
 * Moss tufts (MOSS overlay, richer than the live dot grid): 2–3 overlapping
 * dots per cluster, jittered off a loose grid, so growth reads as clumped
 * rather than gridded. `seed` keeps every colour's jitter its own sequence.
 */
function tuftField(seed: number, pitch: number, ink: Rgb, alpha: number): string {
  const r = rng(seed);
  const parts: string[] = [];
  for (let gy = pitch / 2; gy < TH; gy += pitch) {
    for (let gx = pitch / 2; gx < TW; gx += pitch) {
      const bx = gx + r.range(-pitch * 0.3, pitch * 0.3);
      const by = gy + r.range(-pitch * 0.3, pitch * 0.3);
      const clumps = 2 + Math.floor(r.range(0, 2));
      for (let i = 0; i < clumps; i++) {
        const px = bx + r.range(-4, 4);
        const py = by + r.range(-4, 4);
        const rad = r.range(2.5, 5);
        parts.push(
          `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rad.toFixed(1)}" fill="${rgba(ink, alpha)}"/>`,
        );
      }
    }
  }
  return parts.join('');
}

/**
 * Dry grass blades (EMBER primary, richer than the live vertical hatch):
 * short strokes of varying length and lean instead of a mechanical rule.
 */
function bladeField(seed: number, pitch: number, ink: Rgb, alpha: number): string {
  const r = rng(seed);
  const parts: string[] = [];
  for (let gy = pitch; gy < TH + pitch; gy += pitch * 1.15) {
    for (let gx = pitch / 2; gx < TW; gx += pitch) {
      const bx = gx + r.range(-pitch * 0.35, pitch * 0.35);
      const len = r.range(10, 22);
      const lean = r.range(-3, 3);
      parts.push(
        `<line x1="${bx.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${(bx + lean).toFixed(1)}" ` +
          `y2="${(gy - len).toFixed(1)}" stroke="${rgba(ink, alpha)}" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    }
  }
  return parts.join('');
}

/** EMBER's polka rounds (Day 2 — Marc: "too much like ash texture; polka
 *  dot it instead"): a near-REGULAR grid of large bright dots, barely
 *  jittered and barely varied — order is the separation from ash's
 *  scattered pits, alongside size and polarity. Still sized from the
 *  theme's own radius the way `ashField` is. */
function glintField(seed: number, pitch: number, ink: Rgb, alpha: number, radius: number): string {
  const r = rng(seed);
  const parts: string[] = [];
  for (let gy = pitch / 2; gy < TH; gy += pitch) {
    for (let gx = pitch / 2; gx < TW; gx += pitch) {
      const px = gx + r.range(-pitch * 0.06, pitch * 0.06);
      const py = gy + r.range(-pitch * 0.06, pitch * 0.06);
      const rad = radius * r.range(0.94, 1.06);
      parts.push(
        `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rad.toFixed(1)}" fill="${rgba(ink, alpha * r.range(0.95, 1.05))}"/>`,
      );
    }
  }
  return parts.join('');
}

/** Mottled ash pitting (ASH primary + overlay, one jittered field for both frequencies). */
function ashField(seed: number, pitch: number, ink: Rgb, alpha: number, radius: number): string {
  const r = rng(seed);
  const parts: string[] = [];
  for (let gy = pitch / 2; gy < TH; gy += pitch) {
    for (let gx = pitch / 2; gx < TW; gx += pitch) {
      const px = gx + r.range(-pitch * 0.35, pitch * 0.35);
      const py = gy + r.range(-pitch * 0.35, pitch * 0.35);
      const rad = radius * r.range(0.7, 1.3);
      parts.push(
        `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rad.toFixed(1)}" fill="${rgba(ink, alpha * r.range(0.7, 1.15))}"/>`,
      );
    }
  }
  return parts.join('');
}

function rippleField(pitch: number, ink: Rgb, alpha: number, bar: number): string {
  const parts: string[] = [];
  for (let y = pitch / 2; y < TH; y += pitch) {
    parts.push(
      `<rect x="0" y="${(y - bar / 2).toFixed(1)}" width="${TW}" height="${bar}" fill="${rgba(ink, alpha)}"/>`,
    );
  }
  return parts.join('');
}

function rubbleBands(angleDeg: number, a: Rgb, b: Rgb, width: number): string {
  return (
    `<pattern id="bands" width="${width * 2}" height="${width * 2}" patternUnits="userSpaceOnUse" ` +
    `patternTransform="rotate(${angleDeg})">` +
    `<rect width="${width}" height="${width * 2}" fill="${hex(a)}"/>` +
    `<rect x="${width}" width="${width}" height="${width * 2}" fill="${hex(b)}"/>` +
    `</pattern>` +
    `<rect width="${TW}" height="${TH}" fill="url(#bands)"/>`
  );
}

/** Radiating fractures out of the scorch point — SPENT stone's clearest signal. */
function crackLines(seed: number): string {
  const r = rng(seed);
  const cx = TW * 0.46;
  const cy = TH * 0.57;
  const parts: string[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + r.range(-0.25, 0.25);
    const len = r.range(60, 130);
    const midR = len * r.range(0.4, 0.6);
    const midAngle = angle + r.range(-0.18, 0.18);
    const mx = cx + Math.cos(midAngle) * midR;
    const my = cy + Math.sin(midAngle) * midR;
    const ex = cx + Math.cos(angle) * len;
    const ey = cy + Math.sin(angle) * len;
    const w = r.range(1, 1.8);
    parts.push(
      `<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${mx.toFixed(1)} ${my.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}" ` +
        `fill="none" stroke="#0e0b08" stroke-opacity="0.32" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`,
    );
  }
  return parts.join('');
}

// ------------------------------------------------------------------ slots

function wrap(defsAndLayers: string, clipId: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}">` +
    `<defs>${clipDef(clipId, 0.06)}</defs>` +
    `<g clip-path="url(#${clipId})">${defsAndLayers}</g>` +
    `</svg>`
  );
}

/** File-pixel geometry from theme "texture pixel" units — one factor, named. */
const SCALE = 6;

function greenSvg(): string {
  const s = T.terrain.green;
  const primary = s.pattern.kind === 'hatch' ? s.pattern : null;
  const overlay = s.overlay.kind === 'dots' ? s.overlay : null;
  const pitch = primary !== null ? (primary.bar + primary.gap) * SCALE : 36;
  const bar = primary !== null ? primary.bar * SCALE : 12;
  const angle = primary?.angleDeg ?? 60;
  return wrap(
    fillRect(s) +
      (primary !== null
        ? `<g transform="rotate(${angle} ${TCX} ${TCY})">${rippleField(pitch, primary.ink, primary.alpha, bar)}</g>`
        : '') +
      (overlay !== null ? tuftField(101, overlay.pitch * SCALE, overlay.ink, overlay.alpha) : '') +
      depthRect(),
    'clipGreen',
  );
}

function yellowSvg(): string {
  // The roles swapped 2026-08-20 with the theme (Marc: "dotted for ember
  // its clearer"): dots are the pattern now — bright sparks, sized off the
  // theme's radius like ash's are — and the dry-grass blades read off the
  // hatch OVERLAY, a quiet undertone beneath them.
  const s = T.terrain.yellow;
  const primary = s.pattern.kind === 'dots' ? s.pattern : null;
  const overlay = s.overlay.kind === 'hatch' ? s.overlay : null;
  const bladePitch = overlay !== null ? (overlay.bar + overlay.gap) * SCALE : 30;
  return wrap(
    fillRect(s) +
      (overlay !== null ? bladeField(202, bladePitch, overlay.ink, overlay.alpha) : '') +
      (primary !== null
        ? glintField(
            203,
            primary.pitch * SCALE,
            primary.ink,
            primary.alpha,
            primary.radius * (SCALE - 1),
          )
        : '') +
      depthRect(),
    'clipYellow',
  );
}

function redSvg(): string {
  const s = T.terrain.red;
  const primary = s.pattern.kind === 'dots' ? s.pattern : null;
  const overlay = s.overlay.kind === 'dots' ? s.overlay : null;
  return wrap(
    fillRect(s) +
      (primary !== null
        ? ashField(
            303,
            primary.pitch * SCALE,
            primary.ink,
            primary.alpha,
            primary.radius * (SCALE - 1),
          )
        : '') +
      (overlay !== null
        ? ashField(
            304,
            overlay.pitch * SCALE,
            overlay.ink,
            overlay.alpha,
            overlay.radius * (SCALE - 1),
          )
        : '') +
      // Mounded rows catching the flame on the ridges — a couple of soft
      // horizontal highlight bands, the direction's own original words for
      // this colour, still true once it had a name.
      `<rect y="118" width="${TW}" height="14" fill="${rgba(0xf7e6be, 0.05)}"/>` +
      `<rect y="226" width="${TW}" height="10" fill="${rgba(0xf7e6be, 0.04)}"/>` +
      depthRect(),
    'clipRed',
  );
}

function blueSvg(): string {
  const s = T.terrain.blue;
  const primary = s.pattern.kind === 'hatch' ? s.pattern : null;
  const overlay = s.overlay.kind === 'hatch' ? s.overlay : null;
  return wrap(
    fillRect(s) +
      (primary !== null
        ? rippleField(
            (primary.bar + primary.gap) * SCALE,
            primary.ink,
            primary.alpha,
            primary.bar * SCALE,
          )
        : '') +
      (overlay !== null
        ? rippleField(
            (overlay.bar + overlay.gap) * SCALE,
            overlay.ink,
            overlay.alpha,
            overlay.bar * SCALE,
          )
        : '') +
      // The specular note — reflected torchlight catching recessed water.
      `<rect y="150" width="${TW}" height="26" fill="${rgba(0xffecc8, 0.05)}"/>` +
      depthRect(),
    'clipBlue',
  );
}

function wallSvg(): string {
  const s = T.wall;
  const p = s.pattern.kind === 'bands' ? s.pattern : null;
  return wrap(
    (p !== null ? rubbleBands(p.angleDeg, p.a, p.b, p.width * (SCALE / 2)) : fillRect(s)) +
      depthRect(),
    'clipWall',
  );
}

function stoneSvg(): string {
  const s = T.stone;
  const primary = s.pattern.kind === 'dots' ? s.pattern : null;
  return wrap(
    fillRect(s) +
      (primary !== null
        ? ashField(
            404,
            primary.pitch * SCALE,
            primary.ink,
            primary.alpha,
            primary.radius * (SCALE - 1),
          )
        : '') +
      scorchRect() +
      crackLines(405) +
      depthRect(),
    'clipStone',
  );
}

function ghostSvg(): string {
  const s = T.ghost;
  return wrap(
    fillRect(s) +
      `<radialGradient id="glow" cx="${TCX}" cy="${TCY}" r="${TSIZE * 0.9}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>` +
      `<stop offset="0.6" stop-color="#ffffff" stop-opacity="0.04"/>` +
      `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<rect width="${TW}" height="${TH}" fill="url(#glow)"/>` +
      depthRect(),
    'clipGhost',
  );
}

/** fx.pop: not a hex — a free radial burst on a transparent field. */
function popSvg(): string {
  const size = 256;
  const cx = size / 2;
  const cy = size / 2;
  const colour = hex(T.motion.popColour);
  const r = rng(501);
  const rays: string[] = [];
  const rayCount = 8;
  for (let i = 0; i < rayCount; i++) {
    const angle = (Math.PI * 2 * i) / rayCount + r.range(-0.06, 0.06);
    const len = r.range(size * 0.42, size * 0.5);
    const width = r.range(2.5, 5);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy;
    const ny = dx;
    const ex = cx + dx * len;
    const ey = cy + dy * len;
    const baseX1 = cx + nx * width;
    const baseY1 = cy + ny * width;
    const baseX2 = cx - nx * width;
    const baseY2 = cy - ny * width;
    rays.push(
      `<polygon points="${baseX1.toFixed(1)},${baseY1.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${baseX2.toFixed(1)},${baseY2.toFixed(1)}" ` +
        `fill="${rgba(T.motion.popColour, 0.35)}"/>`,
    );
  }
  const embers: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = r.range(0, Math.PI * 2);
    const dist = r.range(size * 0.2, size * 0.46);
    const ex = cx + Math.cos(angle) * dist;
    const ey = cy + Math.sin(angle) * dist;
    const rad = r.range(1.3, 3.2);
    embers.push(
      `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${rad.toFixed(1)}" fill="${rgba(0xffe9bd, r.range(0.35, 0.75))}"/>`,
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><radialGradient id="burst" cx="${cx}" cy="${cy}" r="${size / 2}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="1"/>` +
    `<stop offset="0.16" stop-color="#ffffff" stop-opacity="0.95"/>` +
    `<stop offset="0.3" stop-color="${colour}" stop-opacity="0.85"/>` +
    `<stop offset="0.62" stop-color="${colour}" stop-opacity="0.22"/>` +
    `<stop offset="1" stop-color="${colour}" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<g>${rays.join('')}</g>` +
    `<rect width="${size}" height="${size}" fill="url(#burst)"/>` +
    `<g>${embers.join('')}</g>` +
    `</svg>`
  );
}

// -------------------------------------------------------------------- run

type Slot = { readonly id: string; readonly svg: string; readonly terrain: boolean };

const SLOTS: readonly Slot[] = [
  { id: 'terrain.green', svg: greenSvg(), terrain: true },
  { id: 'terrain.yellow', svg: yellowSvg(), terrain: true },
  { id: 'terrain.red', svg: redSvg(), terrain: true },
  { id: 'terrain.blue', svg: blueSvg(), terrain: true },
  { id: 'terrain.wall', svg: wallSvg(), terrain: false },
  { id: 'terrain.stone', svg: stoneSvg(), terrain: false },
  { id: 'terrain.ghost', svg: ghostSvg(), terrain: false },
  { id: 'fx.pop', svg: popSvg(), terrain: false },
];

const terrainLuma: Record<string, number> = {};

for (const slot of SLOTS) {
  const file = at(`${slot.id}.png`);
  const png = await sharp(Buffer.from(slot.svg)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(file, png);
  console.log(`${slot.id}.png written`);

  if (slot.terrain) {
    // Composited over the board's own background, the same near-black every
    // in-play tile actually sits on — a mean over the transparent corners
    // outside the hex clip would understate every colour by the same
    // amount and could still mislead the ordering check below.
    const bg = {
      r: (T.board.background >> 16) & 0xff,
      g: (T.board.background >> 8) & 0xff,
      b: T.board.background & 0xff,
    };
    const stats = await sharp(png).flatten({ background: bg }).stats();
    const [r, g, b] = stats.channels;
    const mean: Rgb =
      (Math.round(r!.mean) << 16) | (Math.round(g!.mean) << 8) | Math.round(b!.mean);
    terrainLuma[slot.id] = luma(mean);
  }
}

// The guardrail: the baked art must not invert the ordering the L* test
// enforces on the raw tokens (theme.test.ts, "separates its four terrains
// by value, not by hue"). Derived from the theme's own fills rather than
// hard-coded, so a future palette change re-checks itself.
const tokenOrder = (['green', 'yellow', 'red', 'blue'] as const)
  .map((c) => {
    const s = T.terrain[c];
    const v = s.fillTo === null ? luma(s.fill) : (luma(s.fill) + luma(s.fillTo)) / 2;
    return [`terrain.${c}`, v] as const;
  })
  .sort((a, b) => a[1] - b[1])
  .map(([id]) => id);

const bakedOrder = Object.entries(terrainLuma)
  .sort((a, b) => a[1] - b[1])
  .map(([id]) => id);

if (tokenOrder.join(',') !== bakedOrder.join(',')) {
  throw new Error(
    `baked terrain PNGs inverted the greyscale ordering the L* test protects: ` +
      `tokens say ${tokenOrder.join(' < ')}, art renders ${bakedOrder.join(' < ')}`,
  );
}
console.log(`greyscale ordering holds: ${bakedOrder.join(' < ')}`);
