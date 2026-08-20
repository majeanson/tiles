/**
 * What the game is called, in one place.
 *
 * "tiles" was a directory name that became a working title by inertia — a
 * variable name, not a title. The game got its own on 2026-08-15, when Gate E
 * opened and the thing was finally itself: an expedition into a dark plane,
 * where the ground you have spent turns to stone behind you and one colour
 * feeds on that wake.
 *
 * ASHWAKE is two plain words for exactly that, which keeps the project's
 * no-invented-vocabulary rule: the wake is the trail of spent ground you
 * leave, and ash is what it is made of — the same word the red tile's power
 * already uses. Nothing in the rules had to be renamed to make the title fit;
 * the title was named after the rules.
 *
 * Everything that says the name reads it from here, so renaming the game is
 * one constant — which matters, because this is the decision most likely to
 * be overruled by the person whose game it is.
 */

import { MARK_SVG } from './mark';

export const NAME = 'Ashwake';

/**
 * One line, for the page description, the share sheet and the readme. "Pop"
 * rather than "cash" (2026-08-18, the Stage 2 word pass: one voice for the
 * one action — cash/take/burn/harvest all meant this and none of them agreed
 * with what the buttons say) — the tagline is player-facing copy too, and it
 * was the one place still using the old word.
 */
export const TAGLINE = 'An expedition into a dark plane. Place, ripen, pop, and push on.';

/**
 * Where the game lives, for the surfaces that leave the phone — the share
 * card is a PNG that gets screenshotted OUT of its chat, and a picture with
 * a score but no address is a dead end (2026-08-20, launch audit).
 */
export const SITE = 'tiles.marcportal.com';

/**
 * The mark: a hex with an ember spark in it, drawn as an inline SVG data URI
 * so it costs no request and cannot 404. The shape lives in `./mark.ts`,
 * which is also what `scripts/icons.ts` writes to `public/icon.svg` and
 * rasterises from — one source, so the favicon in this data URI and the
 * install icons on disk cannot drift apart.
 */
export const ICON_SVG = MARK_SVG;

export const ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`;
