/**
 * The shop-levels inherit rule (2026-08-20, the per-world shop split).
 *
 * Upgrade levels used to live in the device-wide `Progress` blob; they moved
 * to a small key of their own, one per world slot, so a fresh world starts
 * bare rather than inheriting a build three other worlds paid for. The one
 * rule this module owns: a world that has NEVER written its own shop key
 * predates the split and inherits the device's old levels once, rather than
 * resetting to nothing — every world a device already held keeps exactly the
 * build it had; only a world settled after the split starts bare.
 *
 * Pure by construction, like every other `meta/` module: `main.ts` reads the
 * raw string (or `null`) out of `localStorage` and hands it here.
 */

import { UPGRADES, type Progress, type UpgradeId } from '@meta/progress';

/**
 * Parse a world's own shop key. `null` for "nothing written here yet" (a
 * world older than the split, or a fresh one) and for anything that is not
 * the shape this module ever wrote — the same salvage instinct
 * `decodeProgress` keeps, field by field: an unknown id or a non-positive
 * level is dropped rather than failing the whole blob.
 */
export function parseShopLevels(raw: string | null): Progress['bought'] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const known = new Set<string>(UPGRADES.map((u) => u.id));
    const clean: Partial<Record<UpgradeId, number>> = {};
    for (const [id, n] of Object.entries(parsed)) {
      if (known.has(id) && typeof n === 'number' && Number.isFinite(n) && n > 0) {
        clean[id as UpgradeId] = Math.floor(n);
      }
    }
    return clean;
  } catch {
    return null;
  }
}

/**
 * The inherit decision itself: a world's own levels win when it has any
 * (even an empty object — a world that has bought nothing since the split
 * is not "predating" it); `null` — nothing ever written for this world —
 * falls back to the device's legacy `bought`, once.
 *
 * Returns the SAME `device` object when nothing changes (both the
 * fall-through and the case where the world's levels happen to equal the
 * device's), so a caller that compares by reference — `readProgress`'s own
 * cache — sees no change either.
 */
export function inheritShopLevels(
  device: Progress,
  worldLevels: Progress['bought'] | null,
): Progress {
  const levels = worldLevels ?? device.bought;
  return levels === device.bought ? device : { ...device, bought: levels };
}
