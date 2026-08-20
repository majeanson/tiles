// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme } from './apply';
import { resolveTheme, THEMES } from './index';
import type { Theme } from './tokens';

/**
 * The edge where a theme meets the document.
 *
 * Everything else about a theme is data a pure test can read. This is the part
 * that fails silently on a device: a variable that never lands, a webfont link
 * that accumulates on every switch, a browser chrome colour still showing the
 * previous direction's background behind the notch.
 *
 * What this CANNOT check is whether anything looks right — happy-dom has no 2D
 * canvas, so not one pixel of the board is drawn here. That verification is a
 * phone in portrait against the deployed site, which is what CLAUDE.md says it
 * has always been. These tests cover the wiring; the eye covers the rest.
 *
 * **Expected stderr:** this file prints a few `NotSupportedError: CSS file
 * loading is disabled` traces. That is happy-dom reporting that it refused to
 * fetch a webfont, which is exactly what `vite.config.ts` asks it to do so the
 * suite runs offline. The tests pass; the noise is the guard working.
 */

// Torchlit is the fixture (2026-08-19: it was cold-survey, deleted in
// WORKPLAN Stage 1's goodbye) — the registry's only direction that carries a
// webfont now that cold-survey and rot-bloom are gone, so it is the one that
// can prove a font link is added AND removed.
const torchlit = resolveTheme('torchlit');
const placeholder = resolveTheme('placeholder');

describe('applyTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
  });

  it('writes every custom property onto the root', () => {
    applyTheme(torchlit, document.documentElement);
    const style = document.documentElement.style;

    expect(style.getPropertyValue('--bg')).toBe('#0a0806');
    expect(style.getPropertyValue('--danger')).toBe('#c1362b');
    expect(style.getPropertyValue('--tile-yellow')).toBe('#c6b187');
    expect(style.getPropertyValue('--font-display')).toContain('Cinzel');
    expect(document.documentElement.dataset['theme']).toBe('torchlit');
  });

  it('moves the browser chrome colour with the board', () => {
    // The status bar sits directly above the board on a phone. Left behind, it
    // reads as a rendering bug rather than as a colour choice.
    applyTheme(torchlit, document.documentElement);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0a0806',
    );
  });

  it('loads one webfont, and removes it for a direction that asks for none', () => {
    applyTheme(torchlit, document.documentElement);
    const links = () => document.querySelectorAll('link#theme-webfont');
    expect(links()).toHaveLength(1);
    expect(links()[0]?.getAttribute('href')).toContain('Cinzel');

    // The placeholder asks for none, so a cold start never waits on a
    // third-party host — and switching to it must not leave the old
    // stylesheet stacked behind.
    applyTheme(placeholder, document.documentElement);
    expect(links()).toHaveLength(0);

    // Switching back must not stack a second link either.
    applyTheme(torchlit, document.documentElement);
    expect(links()).toHaveLength(1);
  });

  it('is idempotent', () => {
    applyTheme(torchlit, document.documentElement);
    const first = document.documentElement.getAttribute('style');
    applyTheme(torchlit, document.documentElement);
    expect(document.documentElement.getAttribute('style')).toBe(first);
    expect(document.querySelectorAll('link#theme-webfont')).toHaveLength(1);
  });

  it('survives a document with no theme-color meta', () => {
    document.head.innerHTML = '';
    expect(() => {
      applyTheme(torchlit, document.documentElement);
    }).not.toThrow();
  });
});

describe('every theme, structurally', () => {
  it('can be applied without throwing', () => {
    for (const theme of THEMES satisfies readonly Theme[]) {
      expect(() => {
        applyTheme(theme, document.documentElement);
      }).not.toThrow();
    }
  });
});
