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

export const NAME = 'Ashwake';

/** One line, for the page description, the share sheet and the readme. */
export const TAGLINE = 'An expedition into a dark plane. Place, ripen, cash, and push on.';

/**
 * The mark: a hex with a spark in it, drawn as an inline SVG data URI so it
 * costs no request and cannot 404. Two colours only — the torch and the dark
 * — because a favicon is 16 pixels and anything else is mud at that size.
 */
export const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="10" fill="#0a0806"/>' +
  '<path d="M32 10 54 22v20L32 54 10 42V22z" fill="none" stroke="#c79a4b" stroke-width="4"/>' +
  '<circle cx="32" cy="32" r="7" fill="#f7e6be"/>' +
  '</svg>';

export const ICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(ICON_SVG)}`;
