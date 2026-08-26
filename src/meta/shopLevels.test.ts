import { describe, expect, it } from 'vitest';
import { EMPTY_PROGRESS, type Progress } from './progress';
import { inheritShopLevels, parseShopLevels } from './shopLevels';

/**
 * The shop-levels inherit rule (2026-08-26), extracted out of `main.ts`'s
 * `readShopLevels`/`readProgress` — POLISH.md named it as the next piece to
 * pull out, after `daily.ts`'s run codec. Pinning the exact salvage and
 * inherit behaviour that shipped with the per-world shop split
 * (2026-08-20), so a future change to either has to change these tests on
 * purpose.
 */

describe('parseShopLevels', () => {
  it('is null for a world that has never written a shop key', () => {
    expect(parseShopLevels(null)).toBeNull();
  });

  it('parses known upgrade ids at positive integer levels', () => {
    expect(parseShopLevels('{"tiles":3,"odds":1}')).toEqual({ tiles: 3, odds: 1 });
  });

  it('floors a fractional level rather than rejecting it', () => {
    expect(parseShopLevels('{"tiles":2.9}')).toEqual({ tiles: 2 });
  });

  it('drops an unknown id, keeping the rest of the blob', () => {
    expect(parseShopLevels('{"tiles":2,"slot":1}')).toEqual({ tiles: 2 });
  });

  it('drops a zero or negative level — that upgrade was never bought', () => {
    expect(parseShopLevels('{"tiles":0,"odds":-1,"world":2}')).toEqual({ world: 2 });
  });

  it('drops a non-numeric or non-finite level', () => {
    // `1e999` is valid JSON syntax that overflows to `Infinity` once parsed —
    // the one way a real JSON blob can produce a non-finite number.
    expect(parseShopLevels('{"tiles":"3","odds":null,"world":1e999}')).toEqual({});
  });

  it('is null for a shape this module never wrote: an array, a scalar, or garbage', () => {
    expect(parseShopLevels('[1,2,3]')).toBeNull();
    expect(parseShopLevels('"tiles"')).toBeNull();
    expect(parseShopLevels('not json at all')).toBeNull();
  });

  it('is null for an empty-looking but non-object JSON value', () => {
    expect(parseShopLevels('null')).toBeNull();
  });
});

describe('inheritShopLevels', () => {
  const device: Progress = { ...EMPTY_PROGRESS, relics: 40, bought: { tiles: 5, odds: 2 } };

  it('inherits the device-wide levels once, for a world that predates the split', () => {
    const result = inheritShopLevels(device, null);
    expect(result.bought).toEqual({ tiles: 5, odds: 2 });
  });

  it('returns the SAME object when there is nothing to inherit — a cache-friendly no-op', () => {
    expect(inheritShopLevels(device, null)).toBe(device);
  });

  it("a world's own levels win, even an empty object — it is not predating the split", () => {
    const result = inheritShopLevels(device, {});
    expect(result.bought).toEqual({});
    expect(result).not.toBe(device);
  });

  it("keeps every other field of the device's progress untouched", () => {
    const result = inheritShopLevels(device, { pace: 1 });
    expect(result.relics).toBe(device.relics);
    expect(result.found).toBe(device.found);
    expect(result.equipped).toBe(device.equipped);
    expect(result.met).toBe(device.met);
    expect(result.bought).toEqual({ pace: 1 });
  });

  it('returns the same object when the world levels happen to equal the device bought reference', () => {
    expect(inheritShopLevels(device, device.bought)).toBe(device);
  });
});
