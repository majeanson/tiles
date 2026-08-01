import { themeCssVars } from './css';
import { hex, type Theme } from './tokens';

/**
 * The one file in `theme/` that touches the document.
 *
 * Everything else here is data a test can read. This is the edge: it writes the
 * custom properties onto the root element, swaps the browser chrome colour, and
 * loads a webfont if the direction asked for one. Idempotent, and safe to call
 * again with a different theme — which is what makes live switching possible on
 * the device rather than only at boot.
 */

const FONT_LINK_ID = 'theme-webfont';

export function applyTheme(theme: Theme, root: HTMLElement, doc: Document = document): void {
  for (const [name, value] of Object.entries(themeCssVars(theme))) {
    root.style.setProperty(name, value);
  }
  root.dataset['theme'] = theme.id;

  // The address bar and the status bar. Not decoration on a phone in portrait —
  // a dark board under a light system chrome reads as a broken page.
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta !== null) meta.setAttribute('content', hex(theme.ink.bg));

  applyWebfont(theme, doc);
}

/**
 * Webfonts are optional and always late.
 *
 * The link is swapped rather than appended so switching directions does not
 * accumulate stylesheets, and it is removed entirely when a theme declares none —
 * the placeholder must not make a cold start wait on fonts.gstatic.com. Text is
 * readable in the fallback stack the whole time; every theme's stacks end in a
 * system face for exactly that reason.
 */
function applyWebfont(theme: Theme, doc: Document): void {
  const existing = doc.getElementById(FONT_LINK_ID);

  if (theme.type.webfontHref === null) {
    existing?.remove();
    return;
  }

  if (existing instanceof HTMLLinkElement) {
    if (existing.href !== theme.type.webfontHref) existing.href = theme.type.webfontHref;
    return;
  }

  const link = doc.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = theme.type.webfontHref;
  doc.head.appendChild(link);
}
