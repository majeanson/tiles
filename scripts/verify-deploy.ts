/**
 * Post-deploy smoke check — proves the LIVE site serves the commit we just
 * deployed, rather than proving only that CI went green.
 *
 *   pnpm verify:deploy
 *   DEPLOY_URL=https://... pnpm verify:deploy
 *
 * Two checks, in order:
 *   1. /version.json (emitted by the vite build) reports the expected sha,
 *      polled to ride out edge propagation.
 *   2. / references hashed bundles and every one of them serves 200 — this is
 *      what catches the "new index.html, missing assets" broken deploy, which
 *      a plain 200 on / would happily call success.
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

const ATTEMPTS = Number(process.env.VERIFY_ATTEMPTS ?? 12);
const DELAY_MS = Number(process.env.VERIFY_DELAY_MS ?? 10_000);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The edge refused us, not the app — the Worker itself never answers 403. */
class EdgeBlockedError extends Error {}

async function get(base: string, path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  });
  if (res.status === 403 && (res.headers.has('cf-mitigated') || base === BASE)) {
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

  for (const path of assets) {
    const res = await fetch(`${base}${path}`, { method: 'HEAD', cache: 'no-store' });
    if (res.status !== 200) throw new Error(`GET ${path} -> ${res.status}`);
  }
  console.log(`ok  index.html live and all ${assets.length} referenced bundles serve 200`);
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
