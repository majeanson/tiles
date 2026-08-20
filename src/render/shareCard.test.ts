// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { TORCHLIT } from '@theme/themes/torchlit';
import { renderShareCard, type ShareCardData } from './shareCard';

/**
 * The share card, where it fails.
 *
 * happy-dom has no 2D canvas context, so nothing here can check that the card
 * actually looks like anything — that is a phone, in an actual share sheet,
 * the same as every other visual claim this project makes (`surfaces.test.ts`
 * keeps the identical note for the terrain baker). What it CAN pin is the
 * degradation path: a browser missing a piece of the canvas API must hand
 * back `null` rather than throw, because `main.ts`'s `share` hook treats a
 * failed card as "fall back to the text+link share", not as a crash.
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
