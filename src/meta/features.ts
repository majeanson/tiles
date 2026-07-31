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
  /** Why it exists and what turning it on changes. */
  readonly note: string;
  readonly defaultOn: boolean;
};

/**
 * Declare a flag here only when the system behind it is real or imminent.
 * A registry full of aspirational flags is just a to-do list that lies.
 */
export const FEATURES = [
  {
    id: 'pop.treasure',
    label: 'Treasure payout',
    note: 'Adds the third choice when a tile pops. The first thing the meta layer unlocks.',
    defaultOn: false,
  },
  {
    id: 'debug.overlay',
    label: 'Debug overlay',
    note: 'Coordinates, seed, and state readouts drawn over the board.',
    defaultOn: false,
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
