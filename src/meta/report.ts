/**
 * The crash-report destination (2026-08-26, Marc's call): his own Sentry —
 * jaffre.sentry.io, project 4511395627008001 — the same project his portal
 * already reports to, reached the same way the portal reaches it: one hand-
 * rolled envelope POST, no SDK. The whole surface used here is a URL and
 * three lines of newline-delimited JSON; @sentry/browser is bigger than
 * this file's job at import time alone.
 *
 * The privacy contract this module lives under: a report leaves the device
 * ONLY when a human taps SEND REPORT — on the failure panel or in
 * SETTINGS ▸ DEVELOPER ▸ LAST ERROR. Nothing here runs at boot, on error,
 * or on a timer. The tap is the consent; SETTINGS says so in words.
 *
 * The DSN is public-by-design (it ships in every client that uses Sentry;
 * it can submit events and do nothing else). Rotation = update this line,
 * push. Format: https://<KEY>@<HOST>/<PROJECT>.
 */
export const CRASH_DSN =
  'https://27bdc4debd1f4925a9d379a6936e0786@o4510241708244992.ingest.us.sentry.io/4511395627008001';

/** What the failure panel knows, and everything the event carries. */
export interface CrashReport {
  /** Short build sha — Sentry's `release`, so an issue names its commit. */
  readonly build: string;
  /** 'daily' | 'shared seed' | 'own world' | wherever else it was caught. */
  readonly mode: string;
  /** How many times this error has repeated on this device. */
  readonly count: number;
  readonly userAgent: string;
  /** `describeError`'s output: name, message, top of the stack. */
  readonly detail: string;
}

/** The envelope endpoint and body for one report — pure, so it is testable. */
export function crashEnvelope(
  report: CrashReport,
  eventId: string,
  sentAt: string,
): { url: string; body: string } {
  const dsn = new URL(CRASH_DSN);
  const projectId = dsn.pathname.replace(/\//g, '');
  const url =
    `https://${dsn.host}/api/${projectId}/envelope/` +
    `?sentry_version=7&sentry_key=${dsn.username}`;

  // Group by the error's own first line; carry the rest as extra. A whole
  // multi-line report as the message would give every stack its own issue.
  const firstLine = report.detail.split('\n', 1)[0] ?? '';
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: 'error',
    environment: 'production',
    release: report.build,
    tags: { mode: report.mode, seen: String(report.count) },
    message: firstLine === '' ? 'crash report (no detail)' : firstLine,
    extra: { detail: report.detail, userAgent: report.userAgent },
  };
  const body =
    JSON.stringify({ event_id: eventId, sent_at: sentAt }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify(event);
  return { url, body };
}

/**
 * POST one report. Resolves false instead of throwing on every failure —
 * the caller is a button on a screen that exists because something already
 * broke, and a send that cannot land turns into "TRY COPY", never a second
 * error. `fetcher` is injectable so the test never touches the network.
 */
export async function sendCrashReport(
  report: CrashReport,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const eventId = newEventId();
  const { url, body } = crashEnvelope(report, eventId, new Date().toISOString());
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 32 hex chars, the id format Sentry wants. `crypto.randomUUID` exists in
 * every secure context this game ships to; the fallback is for the odd
 * embedded webview, where a weaker random id still beats a lost report. */
function newEventId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    let id = '';
    while (id.length < 32) id += Math.floor(Math.random() * 16).toString(16);
    return id;
  }
}
