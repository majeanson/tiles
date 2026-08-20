import { ICON_DATA_URI, NAME, SITE } from '@meta/identity';
import { hex, type Theme } from '@theme/tokens';

/**
 * The share card (2026-08-19, `WORKPLAN.md` Stage 2): a picture worth
 * sending, rendered client-side at the moment SHARE is pressed rather than
 * baked ahead of time — every field on it is this run's own, so there is
 * nothing here a build step could have known in advance.
 *
 * **One source of truth.** This module only draws; it invents nothing. The
 * caller (`ui/game.ts`'s `#renderEnd`) builds `ShareCardData` from the EXACT
 * `hud`/`this.#recordLines`/`this.#runNumber` fields it just used to draw
 * the end screen itself, so the card can never say a number the screen did
 * not already say.
 *
 * Same technique `scripts/social.ts` uses for the og:image — compose, then
 * rasterise — but that script runs in Node at build time against one fixed
 * direction (torchlit); this runs in the browser against whichever theme is
 * actually live, using `Canvas2D` directly rather than an SVG string, since
 * there is no `sharp` here to hand one to.
 */
export type ShareCardData = {
  readonly points: number;
  readonly reach: number;
  /** One harvest's points, in the order they landed — `#arcChart`'s own source. */
  readonly arc: readonly number[];
  /** `'NEW BEST'`, or `null` where this run did not set one. */
  readonly headline: string | null;
  /** `'RUN 12'` / `'TRY 4'`, or the daily's own ladder line (`DAILY #47 · best…`). */
  readonly topLine: string;
  /** `'SEED 123456789'`, or `''` where none is worth sharing (the daily plays a date, not a seed). */
  readonly footerLine: string;
};

/** og:image's own aspect ratio — a chat unfurl crops to it, so this never gets clipped by one. */
const W = 1200;
const H = 630;

/**
 * Rasterise the card. `null` wherever a real browser is missing a piece of
 * the canvas API (no 2D context, or the mark's own data-URI image failing to
 * decode) — the same honest-null contract `PixiRenderer#snapshot` keeps for
 * the board portrait. The caller falls back to the existing text+link share,
 * which needs none of this.
 */
export async function renderShareCard(theme: Theme, data: ShareCardData): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;

  // Best-effort: a webfont still mid-fetch draws in the fallback stack
  // rather than blocking the share — waiting past what the browser can
  // already tell us would turn a tap into a stall.
  try {
    await document.fonts.ready;
  } catch {
    // Font loading state unqueryable. Draw with whatever is cached.
  }

  const bg = hex(theme.board.background);
  const ink = hex(theme.ink.ink);
  const inkDim = hex(theme.ink.inkDim);
  const inkFaint = hex(theme.ink.inkFaint);
  const accent = hex(theme.ink.accent);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The warm pool `scripts/social.ts` draws as a radial gradient — the
  // direction's own accent, faded to nothing, so torchlit's card looks like
  // it was lit by the same source everything else in the game is.
  const pool = ctx.createRadialGradient(230, 250, 0, 230, 250, 560);
  pool.addColorStop(0, `${accent}26`);
  pool.addColorStop(1, `${accent}00`);
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, W, H);

  try {
    const mark = await loadImage(ICON_DATA_URI);
    ctx.drawImage(mark, 90, 68, 200, 200);
  } catch {
    // The mark failed to decode. The numbers still say what they say.
  }

  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = ink;
  ctx.font = `700 46px ${theme.type.display}`;
  ctx.fillText(NAME.toUpperCase(), 330, 140);

  ctx.fillStyle = inkDim;
  ctx.font = `26px ${theme.type.body}`;
  ctx.fillText(data.topLine, 330, 180);

  // The headline, when this run earned one — the same billing the end
  // screen gives it, in the same accent, pushing everything below it down
  // to make room rather than crowding in.
  const scoreY = data.headline === null ? 320 : 350;
  if (data.headline !== null) {
    ctx.fillStyle = accent;
    ctx.font = `700 32px ${theme.type.display}`;
    ctx.fillText(data.headline, 330, 232);
  }

  ctx.fillStyle = ink;
  ctx.font = `700 116px ${theme.type.display}`;
  ctx.fillText(`${data.points} pts`, 330, scoreY);

  ctx.fillStyle = inkDim;
  ctx.font = `30px ${theme.type.body}`;
  ctx.fillText(`REACH ${data.reach}`, 330, scoreY + 50);

  drawArc(ctx, data.arc, 90, 430, W - 180, 130, accent, inkDim, inkFaint);

  if (data.footerLine !== '') {
    ctx.fillStyle = inkFaint;
    ctx.font = `24px ${theme.type.body}`;
    ctx.fillText(data.footerLine, 90, H - 40);
  }

  // Where to go do something about it (2026-08-20): this card's whole life
  // is being screenshotted out of the chat that had the link — without the
  // address it is a score with no door. Right-aligned, the footer's twin.
  ctx.fillStyle = inkFaint;
  ctx.font = `24px ${theme.type.body}`;
  ctx.textAlign = 'right';
  ctx.fillText(SITE, W - 90, H - 40);
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * The arc, as bars — the same picture `#arcChart` draws in the DOM (biggest
 * pop in accent, the rest dim), redrawn here in Canvas2D since there is no
 * SVG on this surface. One baseline, no ghost: the standing-best comparison
 * is the screen's own job, not this card's.
 */
function drawArc(
  ctx: CanvasRenderingContext2D,
  points: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  dim: string,
  faint: string,
): void {
  ctx.strokeStyle = faint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  if (points.length === 0) return;
  const biggest = Math.max(...points, 1);
  const barW = Math.max(3, w / points.length - 4);
  points.forEach((p, i) => {
    const barH = Math.max(3, (Math.max(0, p) / biggest) * (h - 10));
    const bx = x + (i / points.length) * w;
    ctx.fillStyle = p === biggest ? accent : dim;
    ctx.fillRect(bx, y + h - barH, barW, barH);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('share card: mark image failed to decode'));
    img.src = src;
  });
}
