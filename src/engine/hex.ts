/**
 * Pointy-top hexes in axial coordinates.
 *
 * Owned rather than installed: the whole board rests on this file, and every hex
 * library disagrees with every other about orientation and winding. Thirty lines
 * we control beats a dependency whose conventions we have to keep re-deriving.
 */

export type Hex = { readonly q: number; readonly r: number };

/** `${q},${r}` — the board is a Record keyed by this, so it must round-trip. */
export type HexKey = string;

export const key = (q: number, r: number): HexKey => `${q},${r}`;
export const keyOf = (h: Hex): HexKey => key(h.q, h.r);

export function parse(k: HexKey): Hex {
  const comma = k.indexOf(',');
  return { q: Number(k.slice(0, comma)), r: Number(k.slice(comma + 1)) };
}

/**
 * Index 0 is east, then counter-clockwise.
 *
 * This ordering is load-bearing, not incidental: a waypoint ring is stored as
 * "the six neighbours in DIRECTIONS order", and any rule that reads a ring as a
 * sequence (all-one-terrain, contiguous runs, two-deep rings) inherits it.
 * Reordering this array silently changes the game. There is a test pinning it.
 */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], // E
  [1, -1], // NE
  [0, -1], // NW
  [-1, 0], // W
  [-1, 1], // SW
  [0, 1], // SE
];

export const neighbours = (q: number, r: number): Hex[] =>
  DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));

export const neighbourKeys = (q: number, r: number): HexKey[] =>
  DIRECTIONS.map(([dq, dr]) => key(q + dq, r + dr));

export const distance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** Every hex within `radius` of the origin. Region generation starts from one of these. */
export function disc(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius);
    const hi = Math.min(radius, -q + radius);
    for (let r = lo; r <= hi; r++) out.push({ q, r });
  }
  return out;
}

/**
 * Rendering only — never used by engine logic, which knows nothing about pixels.
 * Pointy-top: columns shear right as r increases, rows are 1.5 × size apart.
 */
export const toPixel = (q: number, r: number, size: number): { x: number; y: number } => ({
  x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
  y: size * 1.5 * r,
});
