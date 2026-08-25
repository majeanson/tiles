import { COLOURS } from '@content/tuning';
import { hex, rgba, type Theme } from './tokens';

/**
 * A theme, as CSS custom properties.
 *
 * The board is a canvas and the chrome around it is DOM, so without this the four
 * tile colours have to be written down twice — which is exactly the duplication
 * `style.css` used to carry an apology for ("duplicated here rather than shared…
 * Replace both."). One source, two consumers, no drift.
 *
 * Pure and string-only on purpose: it is testable without a browser, and it is
 * what the style gallery renders from as well as what the game applies.
 */
export type CssVars = Readonly<Record<string, string>>;

export function themeCssVars(theme: Theme): CssVars {
  const out: Record<string, string> = {
    '--bg': hex(theme.ink.bg),
    '--ink': hex(theme.ink.ink),
    '--ink-dim': hex(theme.ink.inkDim),
    '--ink-faint': hex(theme.ink.inkFaint),
    '--accent': hex(theme.ink.accent),
    '--magic': hex(theme.ink.magic),
    '--unique': hex(theme.ink.unique),
    '--danger': hex(theme.ink.danger),
    '--panel': hex(theme.ink.panel),
    '--panel-edge': hex(theme.ink.panelEdge),
    '--panel-edge-active': hex(theme.ink.panelEdgeActive),

    '--font-display': theme.type.display,
    '--font-label': theme.type.label,
    '--font-body': theme.type.body,
    '--label-tracking': theme.type.labelTracking,

    /*
     * The draft card's own halo (2026-08-25).
     *
     * `style.css` had `text-shadow: 0 1px 2px rgb(0 0 0 / 65%)` on `.tile`,
     * hand-typed and therefore assuming light-on-dark. It is the SAME problem
     * the board's tile numbers had and it wants the same answer, because a
     * draft card is a board tile that happens to be DOM: a word set on one of
     * four terrain fills, needing to stay readable on all of them.
     *
     * So it is built from `ink.halo` rather than from black — one concept,
     * two media, and a light direction gets a pale halo without `style.css`
     * learning that light directions exist. Two shadows because CSS has no
     * text outline worth using: a tight one for the letterform's edge and a
     * soft one for the ground under it.
     */
    '--card-text-shadow': `0 0 3px ${rgba(theme.ink.halo, 0.9)}, 0 1px 2px ${rgba(theme.ink.halo, 0.7)}`,
  };

  // The draft cards are DOM but they stand for board tiles, so they take the same
  // fill and the same gradient. `-to` falls back to the flat fill rather than
  // being omitted, so the CSS can use `linear-gradient(var(--a), var(--b))`
  // unconditionally instead of branching per theme.
  for (const colour of COLOURS) {
    const surface = theme.terrain[colour];
    out[`--tile-${colour}`] = hex(surface.fill);
    out[`--tile-${colour}-to`] = hex(surface.fillTo ?? surface.fill);
  }

  return out;
}

/*
 * `themeCssText` — the same vars as a declaration-block body, for a <style>
 * tag or a gallery card — was removed 2026-08-21. Nothing had ever called
 * it: the gallery builds its cards from `themeCssVars` directly, and
 * `applyTheme` sets the properties on an element rather than writing CSS.
 */
