/**
 * The failure panel and everything around it: plain DOM, no Pixi, no
 * framework — because it exists for exactly the moments those things are
 * broken. Moved whole out of main.ts (2026-08-27); main.ts still owns the
 * window-level error listeners that call in here.
 */
import { NAME } from '@meta/identity';
import { sendCrashReport } from '@meta/report';
import { parseRoute } from '@meta/route';
import { ERROR_STORAGE_KEY } from '@shell/store';

/** One line a human can send: name, message, and the top of the stack. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const stack = (error.stack ?? '')
      .split('\n')
      .slice(0, 4)
      .map((line) => line.trim())
      .join('\n');
    return `${error.name}: ${error.message}\n${stack}`.slice(0, 700);
  }
  try {
    return String(error).slice(0, 300);
  } catch {
    return 'unknown error';
  }
}

let failureCount = 0;

function rememberError(text: string): void {
  try {
    localStorage.setItem(
      ERROR_STORAGE_KEY,
      JSON.stringify({
        text,
        sha: __BUILD_SHA__.slice(0, 7),
        at: new Date().toISOString(),
        count: failureCount,
      }),
    );
  } catch {
    // A browser that cannot keep the error is the browser this feature
    // cannot help. The panel below still shows it live.
  }
}

/**
 * Keep an error for SETTINGS ▸ DEVELOPER without raising the panel over it.
 *
 * For the failures that RECOVER (2026-08-27): a session rebuild that throws
 * falls back to a real navigation, and the panel it would otherwise show
 * would flash for 140ms and leave with the page — so the report is kept and
 * the alarm is not. Everything else still goes through `showFailure`.
 */
export function recordFailure(error: unknown): void {
  failureCount++;
  const detail = describeError(error);
  if (detail !== '') rememberError(detail);
}

/**
 * The failure panel: plain DOM, no Pixi, no framework — because it exists for
 * exactly the moments those things are broken (a WebGL context that will not
 * come up, a bundle half-loaded on a bad connection, a bug in the loop).
 *
 * Rebuilt 2026-08-19 after Marc's iOS session ("lots of please reload
 * errors... my end game screen got cancelled"): the old panel REPLACED the
 * whole body — one transient throw destroyed a perfectly good end screen —
 * and said nothing about what broke, on the one platform with no console.
 * It is an OVERLAY now, with CONTINUE beside RELOAD (a transient error is
 * survivable; the autosave means RELOAD loses nothing either way), it shows
 * the actual error so a phone can report it, it counts repeats instead of
 * stacking, and it remembers the last error for SETTINGS ▸ DEVELOPER.
 */
export function showFailure(error?: unknown): void {
  failureCount++;
  const detail = error === undefined ? '' : describeError(error);
  if (detail !== '') rememberError(detail);

  const existing = document.getElementById('boot-failure');
  if (existing !== null) {
    const count = existing.querySelector('#boot-failure-count');
    if (count !== null) count.textContent = `seen ×${failureCount}`;
    if (detail !== '') {
      const shown = existing.querySelector('#boot-failure-detail');
      if (shown !== null) shown.textContent = detail;
    }
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'boot-failure';
  panel.setAttribute('role', 'alert');
  // Theme vars with the old hardcoded values as their fallbacks
  // (2026-08-26): this panel fires when the app may be broken — including
  // before the theme has written a single var — so every var() here
  // degrades to exactly the look it always had. When the theme IS up, the
  // one surface that used to ignore the art direction now wears it.
  panel.style.cssText =
    'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;gap:12px;' +
    'align-items:center;justify-content:center;' +
    'background:color-mix(in srgb, var(--bg, #101218) 94%, transparent);' +
    'color:var(--ink, #e6e9f0);' +
    'font-family:var(--font-body, system-ui, sans-serif);padding:24px;text-align:center;';
  const words = document.createElement('p');
  // The honest split (2026-08-20 launch audit): a browser with no WebGL at
  // all cannot draw the board, will not be fixed by CONTINUE, and loops on
  // RELOAD — telling that visitor "your run is saved" was a lie wearing a
  // stack trace. Name the real problem and the real fix instead.
  const noWebgl = !rendererAlive && webglMissing();
  words.textContent = noWebgl
    ? `${NAME} needs WebGL to draw its board, and this browser has it missing or switched off. ` +
      'Try Safari or Chrome — or turn hardware acceleration back on.'
    : 'Something broke. Your run is saved — CONTINUE if the game still works underneath, RELOAD if it does not.';
  const count = document.createElement('p');
  count.id = 'boot-failure-count';
  count.textContent = `seen ×${failureCount}`;
  // Faint ink at full opacity, not a veil — the panel doctrine, here too.
  count.style.cssText = 'color:var(--ink-faint, #767d8d);font-size:0.75rem;margin:0;';
  const shown = document.createElement('p');
  shown.id = 'boot-failure-detail';
  shown.textContent = detail;
  shown.style.cssText =
    'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.6875rem;' +
    'color:var(--ink-dim, #8a91a0);' +
    'max-width:100%;overflow-wrap:anywhere;white-space:pre-wrap;text-align:left;' +
    'user-select:text;-webkit-user-select:text;margin:0;';
  const buttonCss =
    'min-height:44px;padding:0 24px;font:inherit;color:inherit;' +
    'background:var(--panel, #262b36);border:1px solid var(--panel-edge, #3a4150);border-radius:6px;';
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = 'CONTINUE';
  go.style.cssText = buttonCss;
  go.addEventListener('click', () => {
    panel.remove();
  });
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'RELOAD';
  reload.style.cssText = buttonCss;
  reload.addEventListener('click', () => {
    location.reload();
  });
  const route = parseRoute(location.search);
  const mode = route.daily !== null ? 'daily' : route.seed !== null ? 'shared seed' : 'own world';
  // SEND REPORT (2026-08-26): COPY REPORT had nowhere to be pasted — a
  // stranger could copy the report and had no idea who to give it to
  // (POLISH.md's last P0, Marc's destination call). One tap posts it to
  // Marc's Sentry; nothing is sent unless this button is tapped, which is
  // what keeps SETTINGS' privacy sentence true.
  const send = document.createElement('button');
  send.type = 'button';
  send.textContent = 'SEND REPORT';
  send.style.cssText = buttonCss;
  send.addEventListener('click', () => {
    send.disabled = true;
    send.textContent = 'SENDING…';
    void sendCrashReport({
      build: __BUILD_SHA__.slice(0, 7),
      mode,
      count: failureCount,
      userAgent: navigator.userAgent,
      detail: shown.textContent ?? '',
    }).then((ok) => {
      if (ok) {
        send.textContent = 'SENT — thank you';
      } else {
        send.disabled = false;
        send.textContent = 'NO CONNECTION — try again or copy';
      }
    });
  });
  // COPY REPORT (2026-08-20): the fallback channel — for the browser that
  // cannot reach out, or the person who would rather read what leaves.
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'COPY REPORT';
  copy.style.cssText = buttonCss;
  copy.addEventListener('click', () => {
    // Enough context to act on (2026-08-20). A stack trace alone cannot
    // tell you which build, which browser or which mode it came from, and
    // the person pasting it is a stranger who will not know to add any of
    // that. Nothing here identifies the player: a UA string and a URL are
    // what the report is ABOUT, and both are already leaving the device by
    // the time somebody chooses to paste it.
    const report =
      `${NAME} ${__BUILD_SHA__.slice(0, 7)} · ${mode} · seen ×${failureCount}\n` +
      `${navigator.userAgent}\n\n${shown.textContent ?? ''}`;
    // `navigator.clipboard` is undefined outside secure contexts, and the
    // property access THROWS synchronously — into the very error listener
    // whose panel this button sits on, overwriting the report it was
    // copying (fresh-eyes, 2026-08-20). The try is the fix.
    try {
      if (navigator.clipboard === undefined) throw new Error('no clipboard');
      navigator.clipboard.writeText(report).then(
        () => {
          copy.textContent = 'COPIED';
        },
        () => {
          copy.textContent = 'SELECT THE TEXT ABOVE';
        },
      );
    } catch {
      copy.textContent = 'SELECT THE TEXT ABOVE';
    }
  });
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
  // A WebGL-less browser has no game underneath to continue INTO, and
  // nothing useful to report — the message already says everything.
  if (noWebgl) row.append(reload);
  else row.append(go, reload, send, copy);
  panel.replaceChildren(words, count, shown, row);
  document.body.appendChild(panel);
}

/**
 * No WebGL at all — the one boot failure that is the browser's, not ours.
 * Only ever consulted when the renderer NEVER came up (`rendererAlive`
 * below): probing for a context while Pixi holds a live one can push a
 * phone at its context limit to drop the oldest — which is the board
 * (fresh-eyes, 2026-08-20). The probe also releases what it took.
 */
function webglMissing(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    if (gl === null) return true;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  } catch {
    return true;
  }
}

/** Set the moment `renderer.mount` succeeds — after that, a failure is never
 *  "this browser has no WebGL" and the probe above must not run at all. */
let rendererAlive = false;

/** The session calls this the moment `renderer.mount` succeeds. */
export function markRendererAlive(): void {
  rendererAlive = true;
}
