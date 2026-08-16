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
   * Why it exists, what turning it on changes, and — when a default moved —
   * the decision that moved it. This is the note the in-game settings panel
   * prints, so the registry doubles as the player-visible decision record:
   * one source, no staleness.
   */
  readonly note: string;
  readonly defaultOn: boolean;
  /**
   * Whether anything actually reads this flag yet. The settings panel shows
   * unwired flags as NOT BUILT instead of offering a switch that does
   * nothing — a toggle that lies is worse than no toggle.
   */
  readonly wired: boolean;
};

/**
 * Declare a flag here only when the system behind it is real or imminent.
 * A registry full of aspirational flags is just a to-do list that lies.
 */
export const FEATURES = [
  {
    id: 'debug.overlay',
    label: 'Debug overlay',
    note:
      'Seed, cell counts and the run’s own numbers, printed under the board. Off unless ' +
      'you are diagnosing something on a phone with no console — which is the only ' +
      'console this project has, because testing happens on the deployed site.',
    defaultOn: false,
    wired: true,
  },
  {
    id: 'ui.themePicker',
    label: 'Theme picker',
    note:
      'A row of art directions under the build stamp, switching the whole look on tap. ' +
      'Off by default because torchlit is the decision (Gate E, 2026-08-15); on when you ' +
      'are standing outside with a phone deciding which direction survives daylight.',
    defaultOn: false,
    wired: true,
  },
] as const satisfies readonly FeatureDef[];

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
 * Overrides from the query string: `?ff=pop.treasure,debug.overlay` turns those
 * on, `?ff=-pop.treasure` turns one off.
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
