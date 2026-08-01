import { Assets, Texture } from 'pixi.js';
import { assetPath, decodeManifest, EMPTY_MANIFEST, type AssetManifest } from '@theme/assets';
import type { AssetId } from '@theme/tokens';

/**
 * Whatever art actually exists, loaded once.
 *
 * The contract is the same as the design document's drop targets: a slot is
 * declared, a theme points at it, and the file may or may not be there. **Missing
 * is the normal case** — every slot starts empty and gets filled one PNG at a
 * time — so nothing here throws, nothing blocks the game from starting, and a
 * failed load is indistinguishable from a slot nobody has painted yet.
 *
 * One manifest fetch, not thirteen probes: a build-time scan of `public/assets/`
 * writes the list, so dropping a file in the folder is the whole workflow and a
 * missing file never costs a 404 on a phone connection.
 */
export class AssetBook {
  readonly #textures: ReadonlyMap<AssetId, Texture>;

  private constructor(textures: ReadonlyMap<AssetId, Texture>) {
    this.#textures = textures;
  }

  /** An empty book. What the game runs on today, and a valid state forever. */
  static empty(): AssetBook {
    return new AssetBook(new Map());
  }

  static async load(themeId: string, manifestUrl = '/assets/manifest.json'): Promise<AssetBook> {
    const manifest = await fetchManifest(manifestUrl);
    const ids = manifest[themeId] ?? [];
    if (ids.length === 0) return AssetBook.empty();

    const loaded = await Promise.all(
      ids.map(async (id): Promise<readonly [AssetId, Texture] | null> => {
        try {
          const texture: unknown = await Assets.load(assetPath(themeId, id));
          return texture instanceof Texture ? ([id, texture] as const) : null;
        } catch {
          // A manifest that names a file the server will not serve is stale, not
          // fatal. The procedural surface underneath it is still a playable game.
          return null;
        }
      }),
    );

    return new AssetBook(
      new Map(loaded.filter((e): e is readonly [AssetId, Texture] => e !== null)),
    );
  }

  get(id: AssetId | null): Texture | null {
    if (id === null) return null;
    return this.#textures.get(id) ?? null;
  }

  get size(): number {
    return this.#textures.size;
  }
}

async function fetchManifest(url: string): Promise<AssetManifest> {
  try {
    const response = await fetch(url);
    if (!response.ok) return EMPTY_MANIFEST;
    return decodeManifest(await response.json());
  } catch {
    // No manifest is the state this repository ships in. Offline is the same
    // answer, and so is a dev server that has never seen the folder.
    return EMPTY_MANIFEST;
  }
}
