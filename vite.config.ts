/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
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

const sha = buildSha();

export default defineConfig({
  plugins: [versionStamp(sha)],
  define: {
    __BUILD_SHA__: JSON.stringify(sha),
  },
  resolve: {
    alias: {
      '@engine': alias('./src/engine'),
      '@content': alias('./src/content'),
      '@render': alias('./src/render'),
      '@meta': alias('./src/meta'),
      '@ui': alias('./src/ui'),
      '@sim': alias('./src/sim'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
