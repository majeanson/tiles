/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const alias = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * The commit this bundle was built from. CI supplies it; locally we ask git.
 * A build with no git and no CI still succeeds — it just cannot be verified.
 */
function buildSha(): string {
  if (typeof process.env.GITHUB_SHA === 'string' && process.env.GITHUB_SHA !== '') {
    return process.env.GITHUB_SHA;
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Emit `/version.json` alongside the bundle.
 *
 * Green CI is not a deploy. This file is what lets scripts/verify-deploy.ts
 * prove the LIVE site is serving the exact commit that was just pushed, rather
 * than a cached edge copy of the previous one.
 */
function versionStamp(sha: string): Plugin {
  return {
    name: 'tiles:version-stamp',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ sha, builtAt: new Date().toISOString() }, null, 2),
      });
    },
  };
}

/**
 * Scan `public/assets/<themeId>/<slotId>.png` and write the manifest.
 *
 * The whole art workflow is meant to be "drop a PNG in the folder". A hand-kept
 * list would be a second place to forget, and probing thirteen slots per theme
 * from the client would mean a wall of 404s on a phone connection every load. So
 * the build looks, once, and the client fetches one small file.
 *
 * `public/assets/` not existing is the state this repository ships in — there is
 * no art yet — and that produces an empty manifest, not a failed build.
 *
 * Served in dev as well as emitted at build, and rescanned per request. Without
 * the dev half, dropping a PNG in and running `pnpm dev` would show nothing and
 * give no reason why — the file would be served fine and simply never asked for.
 */
function assetManifest(): Plugin {
  const scan = (root: string): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    let themes: string[];
    try {
      themes = readdirSync(root);
    } catch {
      return out;
    }

    for (const themeId of themes) {
      const dir = join(root, themeId);
      try {
        if (!statSync(dir).isDirectory()) continue;
        const ids = readdirSync(dir)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.slice(0, -'.png'.length));
        if (ids.length > 0) out[themeId] = ids.sort();
      } catch {
        // A directory that vanished between the listing and the stat. Skip it.
      }
    }
    return out;
  };

  const root = (): string => fileURLToPath(new URL('./public/assets', import.meta.url));

  return {
    name: 'tiles:asset-manifest',

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/manifest.json',
        source: JSON.stringify(scan(root()), null, 2),
      });
    },

    configureServer(server) {
      server.middlewares.use('/assets/manifest.json', (_req, res) => {
        // Rescanned every request rather than cached: the point of dev is that
        // you drop a file in and reload, and a cached manifest would make the
        // one workflow this exists for require a server restart.
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(scan(root())));
      });
    },
  };
}

/**
 * Stamp the build into the service worker's cache name.
 *
 * `public/sw.js` ships verbatim, so its `__BUILD_SHA__` has to be replaced on
 * the way out — a cache name that never changes is a phone that never sees a
 * new build again, which is the single worst bug a service worker can have.
 */
function serviceWorkerStamp(sha: string): Plugin {
  return {
    name: 'ashwake:sw-stamp',
    apply: 'build',
    // `closeBundle`, not `generateBundle`: files in `public/` are COPIED to
    // the output directory rather than passing through the bundle, so there
    // is nothing to rewrite until the copy has happened. Getting this wrong
    // fails silently — the worker ships with a literal `__BUILD_SHA__` in its
    // cache name, which never changes, which means a phone that installs it
    // never sees another build. Verified by the assertion below.
    closeBundle() {
      const file = fileURLToPath(new URL('./dist/sw.js', import.meta.url));
      const source = readFileSync(file, 'utf8');
      const stamped = source.replace('__BUILD_SHA__', sha.slice(0, 12));
      if (stamped === source) {
        throw new Error('sw.js has no __BUILD_SHA__ to stamp — the cache name would never change');
      }

      // The hashed bundle joins the precache list. Without this, offline only
      // worked from the second visit: the worker registers after the first
      // frame, so visit one's bundle was never cached, and an offline return
      // served an index.html whose script the cache did not hold.
      const assetsDir = fileURLToPath(new URL('./dist/assets', import.meta.url));
      const bundle = readdirSync(assetsDir)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        .map((name) => `/assets/${name}`);
      const listed = stamped.replace(
        "'__PRECACHE_ASSETS__'",
        JSON.stringify(JSON.stringify(bundle)),
      );
      if (listed === stamped) {
        throw new Error('sw.js has no __PRECACHE_ASSETS__ to fill — offline would need two visits');
      }
      writeFileSync(file, listed);
    },
  };
}

const sha = buildSha();

export default defineConfig({
  plugins: [versionStamp(sha), assetManifest(), serviceWorkerStamp(sha)],
  define: {
    __BUILD_SHA__: JSON.stringify(sha),
  },
  resolve: {
    alias: {
      '@engine': alias('./src/engine'),
      '@content': alias('./src/content'),
      '@render': alias('./src/render'),
      '@theme': alias('./src/theme'),
      '@meta': alias('./src/meta'),
      '@ui': alias('./src/ui'),
      '@sim': alias('./src/sim'),
    },
  },
  build: {
    // Two pages. `gallery.html` is the art-direction workbench — every theme's
    // tokens, surfaces and greyscale check on one scrollable page — and it ships
    // with the game on purpose: the only device that matters is a phone, and a
    // workbench you cannot open on the phone is a workbench for the wrong screen.
    rollupOptions: {
      input: {
        main: alias('./index.html'),
        gallery: alias('./gallery.html'),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Applying a theme appends its webfont <link>, and happy-dom will honestly
    // go and fetch it — which makes the suite need the network, and fail on a
    // train. The test cares that exactly one link exists with the right href,
    // never that Google served it.
    environmentOptions: {
      happyDOM: {
        settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true },
      },
    },
  },
});
