/**
 * Post-deploy smoke check — proves the LIVE site serves the commit we just
 * deployed, rather than proving only that CI went green.
 *
 *   pnpm verify:deploy
 *   DEPLOY_URL=https://... pnpm verify:deploy
 *
 * Three checks, in order:
 *   1. /version.json (emitted by the vite build) reports the expected sha,
 *      polled to ride out edge propagation.
 *   2. / references hashed bundles and every one of them serves 200 — this is
 *      what catches the "new index.html, missing assets" broken deploy, which
 *      a plain 200 on / would happily call success.
 *   3. The install surface, the social preview and every art file the asset
 *      manifest names actually serve — where "serve" means the file itself,
 *      not the SPA fallback's 200-with-index.html for a path that has none.
 *
 * The custom domain sits behind the zone's bot protection, which 403s plain
 * fetches from CI datacenter IPs. When (and only when) that happens, the same
 * checks re-run against DEPLOY_FALLBACK_URL — the workers.dev host of the SAME
 * worker, captured from the deploy log in ci.yml, which fronts no zone WAF.
 *
 * Exits non-zero on any mismatch so the deploy job fails loudly.
 */
const BASE = (process.env.DEPLOY_URL ?? 'https://tiles.marcportal.com').replace(/\/$/, '');
const FALLBACK = process.env.DEPLOY_FALLBACK_URL?.replace(/\/$/, '') ?? null;
const EXPECTED = process.env.GITHUB_SHA ?? '';

/**
 * A malformed override reads as the default, not as NaN (2026-08-21). A bare
 * `Number(env ?? 12)` turns `VERIFY_ATTEMPTS=twelve` into NaN, and
 * `attempt <= NaN` is false — so the retry loop never runs a single attempt
 * and the check fails instantly with a message about nothing.
 */
const positive = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n > 0 ? n : fallback;
};

const ATTEMPTS = positive(process.env.VERIFY_ATTEMPTS, 12);
const DELAY_MS = positive(process.env.VERIFY_DELAY_MS, 10_000);
const ASSET_ATTEMPTS = positive(process.env.VERIFY_ASSET_ATTEMPTS, 5);
const ASSET_DELAY_MS = positive(process.env.VERIFY_ASSET_DELAY_MS, 3_000);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The edge refused us, not the app — the Worker itself never answers 403. */
class EdgeBlockedError extends Error {}

async function get(base: string, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  });
  // A CHALLENGE, not any 403 (2026-08-21). This read
  // `res.headers.has('cf-mitigated') || base === BASE`, and that second
  // clause turned every 403 from the custom domain into "the edge is
  // challenging us" — so a genuinely broken domain (a route unbound, an
  // Access policy switched on, the worker gone) fell through to the
  // workers.dev fallback, verified THAT, and printed `ok deploy verified`.
  // The one script whose whole job is proving tiles.marcportal.com works
  // could pass while it did not.
  //
  // Cloudflare's own `cf-mitigated` marker is the only thing trusted now.
  // Any other 403 is reported as what it is — the site refusing to serve —
  // and fails the deploy. That errs toward a loud false alarm over a quiet
  // false pass, which is the only sane direction for a launch gate.
  if (res.status === 403 && res.headers.has('cf-mitigated')) {
    throw new EdgeBlockedError(`GET ${path} -> 403 (edge bot challenge, not the app)`);
  }
  return { status: res.status, body: await res.text() };
}

async function waitForVersion(base: string): Promise<void> {
  let last = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const { status, body } = await get(base, `/version.json?t=${Date.now()}`);
      if (status === 200 && body.trimStart().startsWith('<')) {
        // SPA fallback answers 200 with index.html for files that aren't there.
        last = 'version.json not deployed yet (SPA fallback served)';
      } else if (status === 200) {
        const sha = (JSON.parse(body) as { sha?: string }).sha ?? '';
        if (sha === EXPECTED) {
          console.log(`ok  version.json matches deployed commit ${EXPECTED.slice(0, 7)}`);
          return;
        }
        last = `live sha ${sha.slice(0, 7) || '(none)'} != expected ${EXPECTED.slice(0, 7)}`;
      } else {
        last = `GET /version.json -> ${status}`;
      }
    } catch (err) {
      if (err instanceof EdgeBlockedError) throw err; // retrying will not unblock the edge
      last = String(err);
    }
    if (attempt < ATTEMPTS) {
      console.log(`    ${attempt}/${ATTEMPTS}: ${last} — retrying in ${DELAY_MS / 1000}s`);
      await sleep(DELAY_MS);
    }
  }
  throw new Error(`live bundle never matched after ${ATTEMPTS} attempts: ${last}`);
}

async function checkAssets(base: string): Promise<void> {
  const { status, body } = await get(base, `/?t=${Date.now()}`);
  if (status !== 200) throw new Error(`GET / -> ${status}`);

  const assets = [
    ...new Set([...body.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]!)),
  ];
  if (assets.length === 0) throw new Error('index.html references no /assets/ bundles');

  for (const path of assets) await headOk(base, path);
  console.log(`ok  index.html live and all ${assets.length} referenced bundles serve 200`);

  // The install surface is part of the deploy now (M6). A missing manifest or
  // service worker does not break the page, which is exactly why it would go
  // unnoticed — the game would simply stop being installable and nobody would
  // get an error. So it is verified like everything else.
  for (const path of [
    '/manifest.webmanifest',
    '/sw.js',
    '/icon.svg',
    '/icon-maskable.svg',
    '/og-image.png',
  ]) {
    await headOk(base, path);
  }
  console.log('ok  manifest, service worker, icons and the social preview serve 200');

  // The art (2026-08-20, the pipeline's fresh-eyes review): the torchlit
  // terrain PNGs are part of the shipped product now, and a deploy that
  // dropped them would degrade every board to the procedural floor without
  // an error anywhere — the exact "breaks nothing visible" class the block
  // above exists for. The asset manifest is the authority on what should
  // exist, so this reads it live and checks every file it names; no
  // hand-kept list to go stale.
  const manifest = await get(base, `/assets/manifest.json?t=${Date.now()}`);
  if (manifest.status !== 200 || manifest.body.trimStart().startsWith('<')) {
    throw new Error('/assets/manifest.json missing (SPA fallback or non-200)');
  }
  const slots = Object.entries(JSON.parse(manifest.body) as Record<string, readonly string[]>);
  for (const [themeId, ids] of slots) {
    for (const id of ids) await headOk(base, `/assets/${themeId}/${id}.png`);
  }
  const total = slots.reduce((n, [, ids]) => n + ids.length, 0);
  console.log(`ok  asset manifest live and all ${total} art files it names serve 200`);
}

/**
 * Assets propagate independently of version.json — observed on the first deploy,
 * where the version matched immediately but a preloaded chunk still 404'd for a
 * few seconds. A single-shot check here reports a broken deploy that isn't one,
 * so each asset gets its own short retry before it counts as missing.
 */
async function headOk(base: string, path: string): Promise<void> {
  let last = '';
  for (let attempt = 1; attempt <= ASSET_ATTEMPTS; attempt++) {
    const res = await fetch(`${base}${path}`, { method: 'HEAD', cache: 'no-store' });
    // A 200 alone proves nothing here (2026-08-20, the pipeline's fresh-eyes
    // review): the worker's SPA fallback answers 200 with index.html for any
    // path that has no file — `waitForVersion` already knows this and none
    // of the files this function is ever pointed at are HTML, so a text/html
    // answer means "missing", not "served".
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 200 && !type.includes('text/html')) return;
    last =
      res.status === 200 ? `200 but ${type || 'no content-type'} (SPA fallback)` : `${res.status}`;
    if (attempt < ASSET_ATTEMPTS) await sleep(ASSET_DELAY_MS);
  }
  throw new Error(`HEAD ${path} -> ${last} after ${ASSET_ATTEMPTS} attempts`);
}

async function verifyAgainst(base: string): Promise<void> {
  console.log(`verifying ${base} serves ${EXPECTED.slice(0, 7)} ...`);
  await waitForVersion(base);
  await checkAssets(base);
}

async function run(): Promise<void> {
  if (EXPECTED === '') throw new Error('GITHUB_SHA is not set — nothing to verify against');
  try {
    await verifyAgainst(BASE);
  } catch (err) {
    if (!(err instanceof EdgeBlockedError) || FALLBACK === null) throw err;
    console.log(`    ${err.message}`);
    console.log('    custom domain unverifiable from this runner — same worker via workers.dev:');
    await verifyAgainst(FALLBACK);
  }
}

try {
  await run();
  console.log('ok  deploy verified');
} catch (err) {
  console.error(
    `FAILED: deploy verification — ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
