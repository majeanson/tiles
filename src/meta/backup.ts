/**
 * The backup: every world, purse and perk this device holds, as one string.
 *
 * The game has no backend and no account by design, which makes the player's
 * own `localStorage` the only copy of everything they have. That is fine
 * until it is not: Safari evicts a non-persisted origin after about a week
 * of not visiting, in-app browsers (Instagram, TikTok) discard storage
 * wholesale, RESET ALL is two taps, and a phone can simply be replaced.
 *
 * None of those are bugs to be fixed — they are properties of the platform —
 * so the answer is not another guard. It is a door out: one file the player
 * can keep, send to themselves, and put back. Every other data-loss fix in
 * this codebase makes loss less LIKELY; this is the only one that makes it
 * SURVIVABLE.
 *
 * Pure by construction, like every other `meta/` module: strings in, strings
 * out, and the shell owns the storage and the share sheet. That is also what
 * makes it testable, which matters more here than almost anywhere — a backup
 * that silently restores nothing is worse than no backup at all, because the
 * player finds out at the exact moment they needed it.
 */

/** Everything the game keeps lives under this prefix. Nothing else is ours. */
const PREFIX = 'tiles.';

/**
 * Bumped only if a future build cannot read an older backup. It never has to
 * be: restore is key-by-key and every decoder in this codebase already
 * tolerates shapes it does not recognise, so an old backup lands as an old
 * save and migrates on the next boot exactly as it would have.
 */
const FORMAT = 1;

export type Backup = {
  readonly format: number;
  /** The build that wrote it, for a bug report that comes with a file. */
  readonly sha: string;
  /** ISO date. Informational only — restoring never reads it. */
  readonly at: string;
  readonly keys: Readonly<Record<string, string>>;
};

/**
 * Fold the device's stored keys into a backup. The caller passes what it
 * read; this module never touches storage.
 *
 * Keys outside the game's own prefix are dropped rather than trusted: a
 * backup is a copy of THIS game, and quietly carrying somebody else's
 * localStorage into a file the player is about to share would be a
 * surprising thing for a save button to do.
 */
export function buildBackup(
  entries: Readonly<Record<string, string>>,
  meta: { readonly sha: string; readonly at: string },
): Backup {
  const keys: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith(PREFIX) && typeof value === 'string') keys[key] = value;
  }
  return { format: FORMAT, sha: meta.sha, at: meta.at, keys };
}

export const encodeBackup = (backup: Backup): string => JSON.stringify(backup);

/**
 * Read a backup back, or null for anything that is not one.
 *
 * Deliberately strict about the ENVELOPE and forgiving about the contents:
 * a file that is not this game's backup must be refused outright — restoring
 * half of one over a live device is the worst outcome available here — while
 * an individual key whose value is not a string is simply skipped, because
 * the alternative is refusing an otherwise good backup over one bad entry.
 * The same split `decodeWorld` learned on 2026-08-20.
 */
export function decodeBackup(raw: string | null): Backup | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const { format, sha, at, keys } = parsed as {
    format?: unknown;
    sha?: unknown;
    at?: unknown;
    keys?: unknown;
  };
  if (typeof format !== 'number' || !Number.isFinite(format) || format < 1) return null;
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return null;

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(keys)) {
    if (key.startsWith(PREFIX) && typeof value === 'string') clean[key] = value;
  }
  // A backup carrying nothing of ours is not a backup, whatever its envelope
  // says — restoring it would wipe the device and put nothing back.
  if (Object.keys(clean).length === 0) return null;

  return {
    format,
    sha: typeof sha === 'string' ? sha : 'unknown',
    at: typeof at === 'string' ? at : '',
    keys: clean,
  };
}

/**
 * What restoring this backup would do, as a plan the shell can carry out and
 * a sentence it can show first.
 *
 * Restoring REPLACES: every `tiles.` key on the device is removed and the
 * backup's are written. Merging was the other option and it is a trap —
 * two worlds' revealed ground unioned together is a map of somewhere that
 * never existed, and there is no rule for which of two purses wins. Replace
 * is the only version a player can predict, which is what matters for a
 * button that cannot be undone.
 */
export function restorePlan(backup: Backup): {
  readonly remove: readonly string[];
  readonly write: Readonly<Record<string, string>>;
} {
  return { remove: [PREFIX], write: backup.keys };
}

/** True for a key this game owns — the shell's filter when it clears. */
export const isOwnKey = (key: string): boolean => key.startsWith(PREFIX);

/**
 * One line describing a backup, for the confirm step. Counts worlds rather
 * than keys, because "3 worlds · 412 relics" is a thing a player recognises
 * as theirs and "17 keys" is not.
 */
export function describeBackup(backup: Backup): string {
  const worlds = Object.keys(backup.keys).filter((k) => /^tiles\.world(\.s\d)?\.v\d+$/.test(k));
  let relics = 0;
  const progress = backup.keys['tiles.progress.v1'];
  if (progress !== undefined) {
    try {
      const parsed: unknown = JSON.parse(progress);
      if (typeof parsed === 'object' && parsed !== null) {
        const { relics: r } = parsed as { relics?: unknown };
        if (typeof r === 'number' && Number.isFinite(r)) relics = Math.max(0, Math.floor(r));
      }
    } catch {
      // A backup whose purse will not parse still restores; it just cannot
      // be summarised. The number is a courtesy, not the contract.
    }
  }
  const when = backup.at === '' ? '' : ` · ${backup.at.slice(0, 10)}`;
  return `${worlds.length} world${worlds.length === 1 ? '' : 's'} · ${relics} relics${when}`;
}
