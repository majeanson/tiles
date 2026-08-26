// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { SITE } from '@meta/identity';
import { TORCHLIT } from '@theme/themes/torchlit';
import { renderShareCard, type ShareCardData } from './shareCard';

/**
 * The share card, where it fails, and — since a fake `getContext` costs
 * nothing and happy-dom's `Image`/`toBlob` already resolve for real without
 * a native canvas backend (verified by hand before this file was written) —
 * what it actually draws.
 *
 * happy-dom ships no 2D rasteriser, so nothing here can check that the card
 * LOOKS like anything; that is a phone, in an actual share sheet, the same
 * as every other visual claim this project makes (`surfaces.test.ts` keeps
 * the identical note for the terrain baker). What this file pins instead is
 * the CONTRACT: given a browser that can draw, does the card draw the
 * numbers it was handed, in the shape `#renderEnd` and the og:image promise
 * (`src/meta/identity.ts`) require — not by reading pixels back, but by
 * recording every call the module makes against a fake `CanvasRenderingContext2D`
 * and asserting on those calls. Two describe blocks: the degrade-to-null path
 * (real happy-dom, no adapter registered) and the draws-something path (a
 * recording context substituted in).
 */

const DATA: ShareCardData = {
  points: 240,
  reach: 6,
  arc: [10, 40, 90],
  headline: 'NEW BEST',
  topLine: 'RUN 4',
  footerLine: 'SEED 12345',
};

describe('renderShareCard, with no canvas context available', () => {
  it('resolves to null rather than throwing', async () => {
    await expect(renderShareCard(TORCHLIT, DATA)).resolves.toBeNull();
  });

  it('survives an empty arc and no headline', async () => {
    await expect(
      renderShareCard(TORCHLIT, { ...DATA, arc: [], headline: null }),
    ).resolves.toBeNull();
  });
});

/** One recorded call against the fake context: which property, what args. */
type RecordedCall = { readonly prop: string; readonly args: readonly unknown[] };

/**
 * A `CanvasRenderingContext2D` stand-in that records every method call and
 * property write instead of drawing anything — happy-dom has no real one to
 * substitute, and a hand-rolled recorder is enough to pin the CONTRACT
 * (what gets drawn, with what text, in what order) without pixel-diffing.
 * `createRadialGradient` gets a minimal gradient stub since the module calls
 * `.addColorStop` on whatever it returns.
 */
function fakeContext(): { readonly ctx: CanvasRenderingContext2D; readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const gradient = {
    addColorStop: (...args: unknown[]) => calls.push({ prop: 'addColorStop', args }),
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'createRadialGradient') {
        return (...args: unknown[]) => {
          calls.push({ prop, args });
          return gradient;
        };
      }
      // Every other read is treated as a method: the module never reads a
      // property back, only writes (fillStyle, font, …) and calls.
      return (...args: unknown[]) => calls.push({ prop, args });
    },
    set(_target, prop, value) {
      if (typeof prop === 'string') calls.push({ prop: `set:${prop}`, args: [value] });
      return true;
    },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
}

/**
 * Runs `renderShareCard` against a `fakeContext()`, substituted in by
 * mocking `HTMLCanvasElement.prototype.getContext` for the duration of the
 * call — the only canvas the module creates is its own, so a global mock is
 * safe as long as it is restored before the next test.
 */
async function renderWithFakeContext(data: ShareCardData): Promise<{
  readonly blob: Blob | null;
  readonly calls: RecordedCall[];
  readonly canvas: HTMLCanvasElement;
}> {
  const { ctx, calls } = fakeContext();
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  let canvas: HTMLCanvasElement | null = null;
  const originalCreateElement = document.createElement.bind(document);
  const createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tagName, options);
      if (tagName === 'canvas') canvas = el as HTMLCanvasElement;
      return el;
    });
  try {
    const blob = await renderShareCard(TORCHLIT, data);
    if (canvas === null) throw new Error('renderShareCard never created a canvas');
    return { blob, calls, canvas };
  } finally {
    getContextSpy.mockRestore();
    createElementSpy.mockRestore();
  }
}

function fillTexts(calls: RecordedCall[]): unknown[] {
  return calls.filter((c) => c.prop === 'fillText').map((c) => c.args[0]);
}

describe('renderShareCard, with a working canvas context', () => {
  it('sizes the card to the og:image aspect ratio, so a chat unfurl never crops it', async () => {
    const { canvas } = await renderWithFakeContext(DATA);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(630);
  });

  it('resolves to a real PNG blob when the browser can draw', async () => {
    const { blob } = await renderWithFakeContext(DATA);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/png');
  });

  it('names the site, right-aligned, so a screenshot out of the chat has an address', async () => {
    const { calls } = await renderWithFakeContext(DATA);
    expect(fillTexts(calls)).toContain(SITE);

    const siteCallIndex = calls.findIndex((c) => c.prop === 'fillText' && c.args[0] === SITE);
    const rightAlignIndex = calls.findIndex(
      (c) => c.prop === 'set:textAlign' && c.args[0] === 'right',
    );
    const leftAlignIndex = calls.findIndex(
      (c, i) => i > siteCallIndex && c.prop === 'set:textAlign' && c.args[0] === 'left',
    );
    expect(rightAlignIndex).toBeGreaterThanOrEqual(0);
    expect(rightAlignIndex).toBeLessThan(siteCallIndex);
    // Restored to left afterwards, so nothing this function draws next
    // silently inherits a right-aligned context.
    expect(leftAlignIndex).toBeGreaterThan(siteCallIndex);
  });

  it("draws this run's own score and reach, not a value formatted elsewhere", async () => {
    const { calls } = await renderWithFakeContext(DATA);
    const texts = fillTexts(calls);
    expect(texts).toContain(`${DATA.points} pts`);
    expect(texts).toContain(`REACH ${DATA.reach}`);
  });

  it('draws the headline only when this run set one, and makes room for it', async () => {
    const withHeadline = await renderWithFakeContext(DATA);
    expect(fillTexts(withHeadline.calls)).toContain('NEW BEST');

    const withoutHeadline = await renderWithFakeContext({ ...DATA, headline: null });
    expect(fillTexts(withoutHeadline.calls)).not.toContain('NEW BEST');

    // The score itself moves down to make room for the headline above it
    // (`scoreY` in shareCard.ts) — pin the actual y each way, not just that
    // the headline text is absent.
    const scoreY = (calls: RecordedCall[]): unknown =>
      calls.find((c) => c.prop === 'fillText' && c.args[0] === `${DATA.points} pts`)?.args[2];
    expect(scoreY(withHeadline.calls)).toBe(350);
    expect(scoreY(withoutHeadline.calls)).toBe(320);
  });

  it('skips the footer line entirely when there is nothing worth sharing (the daily plays a date, not a seed)', async () => {
    const withFooter = await renderWithFakeContext(DATA);
    expect(fillTexts(withFooter.calls)).toContain('SEED 12345');

    const withoutFooter = await renderWithFakeContext({ ...DATA, footerLine: '' });
    expect(fillTexts(withoutFooter.calls)).not.toContain('');
    expect(fillTexts(withoutFooter.calls).length).toBe(fillTexts(withFooter.calls).length - 1);
  });

  it('draws one bar per harvest in the arc, and none when the arc is empty', async () => {
    // Two fillRect calls happen unconditionally before the arc (the
    // background, then the warm pool) — the arc's own bars are whatever
    // fillRect count remains beyond those two.
    const withArc = await renderWithFakeContext(DATA);
    const arcBars = withArc.calls.filter((c) => c.prop === 'fillRect').length - 2;
    expect(arcBars).toBe(DATA.arc.length);

    const noArc = await renderWithFakeContext({ ...DATA, arc: [] });
    const noArcBars = noArc.calls.filter((c) => c.prop === 'fillRect').length - 2;
    expect(noArcBars).toBe(0);
  });

  it('ghosts the board behind the card when a snapshot rides along, at low alpha, restored after (F8)', async () => {
    const withShot = await renderWithFakeContext({
      ...DATA,
      shot: 'data:image/png;base64,abc',
    });
    const without = await renderWithFakeContext(DATA);
    // One extra drawImage beyond the mark's own, bracketed by the ghost
    // alpha going down and coming back — the text drawn after it must not
    // inherit a translucent context.
    const draws = (calls: RecordedCall[]): number =>
      calls.filter((c) => c.prop === 'drawImage').length;
    expect(draws(withShot.calls)).toBe(draws(without.calls) + 1);
    const alphas = withShot.calls.filter((c) => c.prop === 'set:globalAlpha').map((c) => c.args[0]);
    expect(alphas).toEqual([0.18, 1]);
    expect(without.calls.some((c) => c.prop === 'set:globalAlpha')).toBe(false);
  });

  it('keeps drawing the score even when the board snapshot fails to decode', async () => {
    const originalImage = globalThis.Image;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
    try {
      const { blob, calls } = await renderWithFakeContext({
        ...DATA,
        shot: 'data:image/png;base64,abc',
      });
      expect(blob).not.toBeNull();
      expect(calls.some((c) => c.prop === 'drawImage')).toBe(false);
      expect(fillTexts(calls)).toContain(`${DATA.points} pts`);
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it('keeps drawing the score even when the mark image fails to decode', async () => {
    const originalImage = globalThis.Image;
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
    try {
      const { blob, calls } = await renderWithFakeContext(DATA);
      expect(blob).not.toBeNull();
      expect(calls.some((c) => c.prop === 'drawImage')).toBe(false);
      expect(fillTexts(calls)).toContain(`${DATA.points} pts`);
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it('survives degenerate numbers — zero points, zero reach, no arc — without throwing', async () => {
    const degenerate: ShareCardData = {
      points: 0,
      reach: 0,
      arc: [],
      headline: null,
      topLine: 'RUN 1',
      footerLine: '',
    };
    const { blob, calls } = await renderWithFakeContext(degenerate);
    expect(blob).not.toBeNull();
    expect(fillTexts(calls)).toContain('0 pts');
    expect(fillTexts(calls)).toContain('REACH 0');
  });
});
