/**
 * The progressive-unlock spine.
 *
 * The game's stated shape is "simple on run one, deeper by run twenty": systems
 * arrive one at a time as the player unlocks them. That only works if every
 * system can be switched off independently — and retrofitting that after three
 * systems have grown into each other is expensive, so it lands before there is
 * anything to gate.
 *
 * Two rules:
 *   - A flag defaults to OFF. A new player sees the smallest possible game.
 *   - Nothing in `engine/` reads this module. Flags are resolved at the edge and
 *     passed into the engine as ordinary data, so a run stays reproducible from
 *     its seed and its rules, with no ambient global deciding the outcome.
 */

export type FeatureDef = {
  readonly id: string;
  readonly label: string;
  /**
   * What turning it on changes, in one line a PLAYER can read (2026-08-27).
   *
   * It used to be the whole decision record — why the flag exists, what moved
   * its default and on what date — because SETTINGS was a developer fold and
   * the registry was the only place that record lived. SETTINGS is a public
   * screen now, and a player reading "Marc chose a silent 1.0 (2026-08-15)"
   * under a SOUND switch is reading somebody else's notebook. The record did
   * not go anywhere: it is in the comments above each entry, where the people
   * it is for already read.
   */
  readonly note: string;
  readonly defaultOn: boolean;
  /**
   * Whether anything actually reads this flag yet. The settings panel shows
   * unwired flags as NOT BUILT instead of offering a switch that does
   * nothing — a toggle that lies is worse than no toggle.
   */
  readonly wired: boolean;
  /**
   * Does this belong on a screen a player opens (2026-08-27)?
   *
   * SETTINGS renders exactly the flags marked `true`, so "which switches are
   * public" is a fact of the registry rather than a filter written into the
   * panel. A `false` flag is not hidden — `?ff=` still flips it, and the
   * manual's THIS BUILD says so — it simply has no row on a player's screen.
   */
  readonly player: boolean;
};

/**
 * Declare a flag here only when the system behind it is real or imminent.
 * A registry full of aspirational flags is just a to-do list that lies.
 */
export const FEATURES = [
  // The only console this project has: testing happens on the deployed site,
  // from a phone. Not a player's switch — it prints raw state under the board
  // — so it keeps its `?ff=` door and gives up its row (2026-08-27).
  {
    id: 'debug.overlay',
    label: 'Debug overlay',
    note: 'Prints the run’s raw numbers under the board, for reporting a bug.',
    defaultOn: false,
    wired: true,
    player: false,
  },
  // fame.timeline lived here from its birth (2026-08-20) to launch week
  // (same week): Marc ruled the diary ON for everyone — record-keeping,
  // engine-invisible, and launch day is the only clean epoch the record
  // will ever get. One game for everybody, the world.endless precedent.
  //
  // ui.themePicker was deleted on 2026-08-27. It gated a row of art
  // directions plus the hex-facing flip — a workbench for choosing between
  // candidates, and Gate E chose torchlit on 2026-08-15. What a PLAYER
  // needs from it (the three readable directions) is APPEARANCE, which is
  // public and unflagged; what a workbench needs (the placeholder, the
  // facing) is `?hex=` and `/gallery.html`. A kept corpse is a cut corner.
  //
  // Sound: three synthesised moments (ideas/sound.md, 2026-08-19) — the pop
  // as a rising run of bells, one struck note per claim kind, a low fade on
  // a near-dry purse. Web Audio, zero assets, voiced by the theme. Off by
  // default because Marc chose a silent 1.0 (2026-08-15) and a phone game
  // that surprises a quiet room is uninstalled. The ♪ button by the camera
  // is the same wire (2026-08-20).
  {
    id: 'ui.sound',
    label: 'Sound',
    note: 'A few quiet notes as you pop and claim. The ♪ button on the board is this switch.',
    defaultOn: false,
    wired: true,
    player: true,
  },
] as const satisfies readonly FeatureDef[];

/** The switches a player's SETTINGS screen offers. */
export const PLAYER_FEATURES = FEATURES.filter((f) => f.player);

export type FeatureId = (typeof FEATURES)[number]['id'];
export type FeatureSet = Readonly<Record<FeatureId, boolean>>;

const IDS = FEATURES.map((f) => f.id) as readonly FeatureId[];
const isFeatureId = (s: string): s is FeatureId => (IDS as readonly string[]).includes(s);

export function defaultFeatures(): FeatureSet {
  const out = {} as Record<FeatureId, boolean>;
  for (const f of FEATURES) out[f.id] = f.defaultOn;
  return out;
}

export const isEnabled = (set: FeatureSet, id: FeatureId): boolean => set[id];

/**
 * Overrides from the query string: `?ff=debug.overlay,ui.themePicker` turns
 * those on, `?ff=-ui.themePicker` turns one off.
 *
 * This is not a developer nicety. Testing happens on the deployed site from a
 * phone, where there is no dev server and no console worth using, so flipping a
 * system has to be something you can do from the address bar.
 *
 * Unknown ids are ignored rather than thrown: a stale bookmark should still
 * load the game.
 */
export function parseOverrides(search: string): Partial<Record<FeatureId, boolean>> {
  const raw = new URLSearchParams(search).get('ff');
  if (raw === null) return {};

  const out: Partial<Record<FeatureId, boolean>> = {};
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (token === '') continue;
    const off = token.startsWith('-');
    const id = off ? token.slice(1) : token;
    if (isFeatureId(id)) out[id] = !off;
  }
  return out;
}

/**
 * Persisted state is untrusted input: it was written by an older build, or by
 * someone poking at devtools. Unknown keys are dropped and missing keys fall
 * back to their default, so adding or removing a flag never bricks a save.
 */
export function decodeFeatures(stored: string | null): FeatureSet {
  const base = defaultFeatures();
  if (stored === null) return base;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return base;
  }
  if (typeof parsed !== 'object' || parsed === null) return base;

  const out = { ...base };
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isFeatureId(k) && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export const encodeFeatures = (set: FeatureSet): string => JSON.stringify(set);

export const withOverrides = (
  set: FeatureSet,
  overrides: Partial<Record<FeatureId, boolean>>,
): FeatureSet => ({ ...set, ...overrides });
