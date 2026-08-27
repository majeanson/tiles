/**
 * Leaving one scene for another, with an immediate, visible acknowledgement
 * (Marc, 2026-08-26: "sometimes buttons are long to switch scenes — it seems
 * to be working in the background"). One class starts the whole page fading
 * and swallows further taps; the short beat gives the fade time to be seen.
 * Reduced motion keeps the beat (the departure still needs acknowledging)
 * with the fade snapped by CSS.
 *
 * Today every caller still leaves by full reload; the in-place session swap
 * arrives here in a later phase of the reload-removal refactor (2026-08-27).
 */
export function departTo(go: () => void): void {
  document.documentElement.classList.add('departing');
  window.setTimeout(go, 140);
}
