import { departTo } from '@shell/router';

/**
 * The one-line update affordance. A new worker has already taken over — the
 * autosave means a reload loses nothing — so this is an offer, not an alarm:
 * one tappable line in the stamp's voice, above the stamp, that reloads into
 * the build the worker is already serving. Plain DOM, like the failure panel,
 * because it must work whatever state the game is in.
 */
export function showUpdateNote(): void {
  if (document.getElementById('update-note') !== null) return;
  // On body, fixed (2026-08-20): it used to sit inside #game-shell beside
  // the stamp — which is `inert` the whole time the front door is up, so
  // an update arriving on the menu was an untappable line. Dismissible
  // since the same day's fresh-eyes pass: it parks over the purse row, it
  // arrives unannounced mid-run, and its only interaction was a reload —
  // one mis-reach for the purse threw the player out of their run.
  const note = document.createElement('div');
  note.id = 'update-note';
  note.setAttribute('role', 'status');
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.id = 'update-reload';
  reload.textContent = 'NEW VERSION — TAP TO RELOAD';
  reload.addEventListener('click', () => {
    departTo(() => {
      location.reload();
    });
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.id = 'update-later';
  later.setAttribute('aria-label', 'Not now');
  later.textContent = '✕';
  later.addEventListener('click', () => {
    note.remove();
  });
  // In the document BEFORE it is filled (2026-08-21). A live region that
  // arrives pre-populated is one assistive tech commonly never announces —
  // there is no change for it to notice. Insert empty, then write.
  document.body.appendChild(note);
  note.append(reload, later);
}

/**
 * The in-app browser warning (launch audit, 2026-08-20): a link opened
 * inside Instagram/TikTok/Facebook/Discord runs in a WebView whose storage
 * is partitioned or wiped when the host app closes — the world, the
 * records and the hall of fame can silently evaporate. Once ever, the
 * storage note's shelf and voice, gone on tap: the useful sentence is
 * "open this in your real browser".
 */
export function showInAppNote(): void {
  try {
    if (localStorage.getItem('tiles.inappnote.v1') !== null) return;
    localStorage.setItem('tiles.inappnote.v1', '1');
  } catch {
    // A storage that keeps nothing proves the note's own point; still show
    // it this once.
  }
  if (document.getElementById('inapp-note') !== null) return;
  const note = document.createElement('button');
  note.type = 'button';
  note.id = 'inapp-note';
  note.setAttribute('role', 'status');
  note.addEventListener('click', () => {
    note.remove();
  });
  // Inserted before it is written, for the reason the update note is.
  document.body.appendChild(note);
  note.textContent =
    'You’re in an in-app browser — your world may not be kept here. Open this page in Safari or Chrome to keep it.';
}

/**
 * Storage ran dry mid-run and something regrowable was shed to keep the
 * run (`onChange`'s fallback ladder). One line, the update note's shape,
 * gone on tap or after ten seconds — the player deserves to know why the
 * hall of fame's diary just got shorter, and nothing else says it.
 */
export function showStorageNote(message: string): void {
  if (document.getElementById('storage-note') !== null) return;
  const note = document.createElement('button');
  note.type = 'button';
  note.id = 'storage-note';
  // Announced (2026-08-20): this used to be a silent element with no role,
  // saying "some history was cleared" whether it had dropped a diagnostic
  // record or every world but this one. Each rung of the shed ladder names
  // what IT lost, and the region says it out loud. Set after the node is in
  // the document, because assistive tech commonly misses a live region that
  // arrives pre-filled.
  note.setAttribute('role', 'status');
  note.addEventListener('click', () => {
    note.remove();
  });
  document.body.appendChild(note);
  note.textContent = message;
  setTimeout(() => {
    note.remove();
  }, 10000);
}
