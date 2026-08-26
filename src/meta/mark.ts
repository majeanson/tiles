/**
 * The mark, as data — torch-flavoured (2026-08-19, `WORKPLAN.md` Stage 1).
 *
 * A hex ring around one ember spark. The ring is unchanged since Session 16
 * (a hex is the game's own shape, and it already survived 16px→512px); what
 * moved is the centre. A plain filled circle said "a mark exists" and
 * nothing else — the spark is drawn as a four-point sparkle, which is the
 * EXACT glyph `LANDMARK_GLYPH.find` already draws on the board
 * (`theme/tokens.ts`) for "something worth finding". The mark and the game
 * now speak the same symbol for it instead of inventing a second one, and a
 * torch's own spark is precisely what that glyph already meant.
 *
 * Two colours, both torchlit's own tokens (`board.background`, `ink.accent`,
 * the pop's own pale `popColour`) — a favicon is 16 pixels and anything
 * fancier is mud at that size.
 *
 * **Single source.** This module is imported directly by the running game
 * (`identity.ts`, for the inline favicon and the front-door/end-screen
 * fallback treatment) and by `scripts/icons.ts`, which writes it out to
 * `public/icon.svg` and `public/icon-maskable.svg` and rasterises the PNG
 * set from those files. One shape, two consumers, no drift — the failure
 * mode this replaces was a hand-kept copy in each file that happened to
 * still agree.
 */

const BG = '#0a0806';
const RING = '#c79a4b';
const SPARK = '#f7e6be';

/**
 * A four-point sparkle centred on `(cx, cy)`, outer radius `r` — the same
 * silhouette `LANDMARK_GLYPH.find`'s `✦` reads as, drawn as a straight-edged
 * path instead of a character so it rasterises identically everywhere
 * rather than depending on a font having the glyph (or a renderer's curve
 * handling: an earlier version used quadratic curves pulled toward the
 * centre and every renderer smoothed them into a plain rounded diamond,
 * losing the pinched waist that makes a sparkle read as one).
 */
function spark(cx: number, cy: number, r: number): string {
  const ri = r * 0.35;
  const pt = (angleDeg: number, radius: number): string => {
    const a = (angleDeg * Math.PI) / 180;
    return `${cx + radius * Math.sin(a)} ${cy - radius * Math.cos(a)}`;
  };
  return (
    `M ${pt(0, r)} ` +
    `L ${pt(45, ri)} L ${pt(90, r)} L ${pt(135, ri)} ` +
    `L ${pt(180, r)} L ${pt(225, ri)} L ${pt(270, r)} L ${pt(315, ri)} Z`
  );
}

/** Full hex ring, corners at (32,10)…(10,42) — unchanged since Session 16. */
const HEX_RING = 'M32 10 54 22v20L32 54 10 42V22z';

/** Maskable: everything inside the launcher's 80% safe zone. */
const HEX_RING_SAFE = 'M32 18 47 26.5v17L32 52 17 43.5v-17z';

/**
 * The ring and the spark alone, no background, sized to a 64×64 box — for
 * embedding at another scale entirely, such as `scripts/social.ts`'s
 * 1200×630 share card. Wrap in `<g transform="translate(x,y) scale(s)">`.
 *
 * Parameterised since 2026-08-26: `scripts/artslots.ts` bakes the lockup
 * once per art direction, and each direction paints the same shape in its
 * OWN accent and pop colours — the shape is the identity, the colours are
 * the theme's. `MARK_GROUP` stays the torchlit constant every existing
 * consumer reads.
 */
export const markGroup = (ring: string, sparkFill: string): string =>
  `<path d="${HEX_RING}" fill="none" stroke="${ring}" stroke-width="4"/>` +
  `<path d="${spark(32, 32, 11)}" fill="${sparkFill}"/>`;

export const MARK_GROUP = markGroup(RING, SPARK);

/** The favicon / install mark. `viewBox` only, so it scales to whatever it is dropped into. */
export const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  `<rect width="64" height="64" rx="10" fill="${BG}"/>` +
  MARK_GROUP +
  '</svg>';

/** Maskable variant: no rounded corners (the launcher supplies its own mask), mark inset. */
export const MARK_SVG_MASKABLE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  `<rect width="64" height="64" fill="${BG}"/>` +
  `<path d="${HEX_RING_SAFE}" fill="none" stroke="${RING}" stroke-width="3.5"/>` +
  `<path d="${spark(32, 35, 7.5)}" fill="${SPARK}"/>` +
  '</svg>';
