import type { AssetId } from './tokens';

/**
 * Every bitmap the game can accept, declared whether or not it exists.
 *
 * This is the local copy of the design document's asset sheet, where each piece
 * of art is a drop target rather than a fixed file. The same idea, minus the
 * browser: a slot is declared here, a theme points a surface at it, and the
 * renderer uses it IF the file is on disk. Nothing breaks while a slot is empty,
 * which is the state every slot starts in.
 *
 * To fill one: drop a PNG at `public/assets/<themeId>/<slotId>.png` and rebuild.
 * The Vite plugin in `vite.config.ts` scans that folder and writes the manifest,
 * so there is no list to keep in sync and no way to forget.
 *
 * `wired` is the honest column. Half of these slots describe mechanics the game
 * does not have — there is no fog, and a harvest pops every ripe tile at once
 * rather than chaining. They are recorded because the art direction assumes them
 * and losing that would cost more than an unused constant, but a slot that says
 * `wired: false` will not appear on screen no matter what you put in it.
 */
export type AssetSlot = {
  readonly id: AssetId;
  readonly label: string;
  /** Export size in pixels. Terrain is 3x the on-screen hex so it survives zoom. */
  readonly size: readonly [number, number];
  /** What the art has to do, not what it should look like. */
  readonly note: string;
  /** Whether anything currently reads this slot. */
  readonly wired: boolean;
  /** Tiling texture rather than a sprite — changes how it is sampled. */
  readonly tiling: boolean;
};

const TERRAIN: readonly [number, number] = [414, 358];

export const ASSET_SLOTS: readonly AssetSlot[] = [
  {
    id: 'terrain.green',
    label: 'Terrain A',
    size: TERRAIN,
    note: 'One of the four playable colours. Must separate from the other three by VALUE, not hue.',
    wired: true,
    tiling: false,
  },
  {
    id: 'terrain.yellow',
    label: 'Terrain B',
    size: TERRAIN,
    note: 'The lightest of the four in every direction handed down so far.',
    wired: true,
    tiling: false,
  },
  {
    id: 'terrain.red',
    label: 'Terrain C',
    size: TERRAIN,
    note: 'Mid value. Distinguished from terrain D by texture axis, not brightness.',
    wired: true,
    tiling: false,
  },
  {
    id: 'terrain.blue',
    label: 'Terrain D',
    size: TERRAIN,
    note: 'The darkest of the four. Recessed and specular in the reference art.',
    wired: true,
    tiling: false,
  },
  {
    id: 'terrain.wall',
    label: 'Blocked ground',
    size: TERRAIN,
    note: 'Cannot be built on, never matches. The only neutral on the board.',
    wired: true,
    tiling: false,
  },
  {
    id: 'terrain.stone',
    label: 'Stone (popped)',
    size: TERRAIN,
    note:
      'A harvested tile. NOT IN THE REFERENCE SHEET — the design document has no art for it, ' +
      'and it is the single most common cell in the back half of a run. Must read as spent: ' +
      'related to blocked ground but plainly the aftermath of something, not furniture.',
    wired: true,
    tiling: false,
  },
  {
    id: 'terrain.ghost',
    label: 'Ghost / preview',
    size: TERRAIN,
    note: 'Semi-transparent placement state. Sits under the preview number.',
    wired: true,
    tiling: false,
  },
  {
    id: 'fx.pop',
    label: 'Pop flash',
    size: [256, 256],
    note: 'The harvest payoff. Currently drawn procedurally as a radial burst; a sprite supersedes it.',
    wired: true,
    tiling: false,
  },
  {
    id: 'fog.hard',
    label: 'Hard fog',
    size: [512, 512],
    note: 'Never-seen ground. The plane exists only where grown, so nothing draws this yet — the dark IS the fog.',
    wired: false,
    tiling: true,
  },
  {
    id: 'fog.soft',
    label: 'Soft fog',
    size: [512, 512],
    note: 'Remembered ground (P4a — built). Drawn today as a flat alpha dim; this texture would replace that, unconsumed until the renderer reads it.',
    wired: false,
    tiling: true,
  },
  {
    id: 'ui.cardFrame',
    label: 'Draft card frame',
    size: [288, 288],
    note: '9-slice, three states: idle, selected, unaffordable. Chrome is CSS today.',
    wired: false,
    tiling: false,
  },
  {
    id: 'ui.logo',
    label: 'Title treatment',
    size: [876, 450],
    note: 'Title treatment. The name renders as text in the help panel and footer; there is still no title screen for this to sit on.',
    wired: false,
    tiling: false,
  },
  {
    id: 'ui.runEnd',
    label: 'Run-end art',
    size: [876, 330],
    note: 'Runs always end in failure, so this is seen more than any other image. The end screen exists; it does not consume this slot yet.',
    wired: false,
    tiling: false,
  },
];

/** Slot lookup for the manifest decoder — unknown ids are dropped, not kept. */
const BY_ID = new Map(ASSET_SLOTS.map((s) => [s.id, s]));

/**
 * Where a theme's art for a slot would live, relative to the site root.
 *
 * Per-theme rather than shared: two directions that both want a crypt want two
 * different crypts, and a shared folder would make swapping directions mean
 * moving files.
 */
export const assetPath = (themeId: string, id: AssetId): string => `/assets/${themeId}/${id}.png`;

/**
 * Which `<themeId>/<slotId>` pairs actually have a file, written at build time.
 *
 * Absent or malformed is a normal state, not an error — it means no art has been
 * dropped yet, which is where every theme starts.
 */
export type AssetManifest = Readonly<Record<string, readonly AssetId[]>>;

export const EMPTY_MANIFEST: AssetManifest = {};

/** Untrusted input: a stale build, a hand-edited file, or a 404 page. */
export function decodeManifest(raw: unknown): AssetManifest {
  if (typeof raw !== 'object' || raw === null) return EMPTY_MANIFEST;

  const out: Record<string, AssetId[]> = {};
  for (const [themeId, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    const kept = ids.filter(
      (id): id is AssetId => typeof id === 'string' && BY_ID.has(id as AssetId),
    );
    if (kept.length > 0) out[themeId] = kept;
  }
  return out;
}

export function manifestHas(manifest: AssetManifest, themeId: string, id: AssetId): boolean {
  return manifest[themeId]?.includes(id) ?? false;
}
