import { describe, expect, it } from 'vitest';
import type { CellView } from './Renderer';
import { labelFor } from './PixiRenderer';

/**
 * What a glyph's DIMNESS means (2026-08-27).
 *
 * Marc, from the phone: "star sites are claimed between worlds, when you
 * arrive to them it says site claimed but in the ui they appear not claimed"
 * — and then, exactly: "its the ui that makes it like nothings gonna happen,
 * but all happen correctly, only the ui is grey and not shiny."
 *
 * The board was forcing every remembered cache and site faint, on a
 * navigation argument (shrines and territories are the anchors you steer by;
 * caches and sites are stops). The ECONOMY says the opposite: caches and
 * sites re-arm every run and pay again, shrines and territories are spent for
 * good once taken. So the fog dimmed the two landmarks that still pay and lit
 * the two that never would again.
 *
 * One rule now, and this test is it: FAINT MEANS SPENT.
 */
const cell = (over: Partial<CellView>): CellView => ({
  key: '0,0',
  q: 0,
  r: 0,
  kind: 'landmark',
  colour: null,
  landmark: 'site',
  claimed: false,
  beacon: false,
  shimmer: false,
  rarity: null,
  native: null,
  remembered: false,
  ripe: false,
  targeted: false,
  dimmed: false,
  lensed: false,
  worth: 0,
  home: false,
  light: 1,
  band: 0,
  legal: false,
  preview: null,
  previewColour: null,
  ...over,
});

describe('faint means spent, not remembered', () => {
  it('draws a remembered cache or site at full strength — they re-arm and still pay', () => {
    for (const landmark of ['cache', 'site'] as const) {
      const remembered = labelFor(cell({ landmark, remembered: true, claimed: false }));
      expect(remembered, `${landmark} in the fog`).not.toBeNull();
      expect(remembered?.faint, `${landmark} in the fog is a live reward`).toBe(false);
    }
  });

  it('dims a landmark that is actually spent, in the fog and on the board', () => {
    expect(labelFor(cell({ landmark: 'territory', claimed: true, remembered: true }))?.faint).toBe(
      true,
    );
    expect(labelFor(cell({ landmark: 'shrine', claimed: true }))?.faint).toBe(true);
  });

  it('keeps a shimmer wordless — it must not say what is out there', () => {
    expect(labelFor(cell({ landmark: null, shimmer: true }))).toBeNull();
  });
});
