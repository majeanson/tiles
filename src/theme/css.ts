import { COLOURS } from '@content/tuning';
import { hex, type Theme } from './tokens';

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
