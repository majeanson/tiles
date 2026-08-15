import { ENDLESS_TUNING, TUNING } from '@content/tuning';
import {
  decodeFeatures,
  encodeFeatures,
  FEATURES,
  isEnabled,
  parseOverrides,
  withOverrides,
  type FeatureId,
  type FeatureSet,
} from '@meta/features';
import {
  decodeRecords,
  encodeRecords,
  gateB,
  recordRun,
  EMPTY as EMPTY_RECORDS,
  type RecordBook,
} from '@meta/records';
import { decodeRun, encodeRun } from '@meta/save';
import {
  decodeWorld,
  encodeWorld,
  knownFraction,
  newWorld,
  rememberRun,
  type WorldMemory,
} from '@meta/world';
import { AssetBook } from '@render/assets';
import { PixiRenderer } from '@render/PixiRenderer';
import { applyTheme } from '@theme/apply';
import { DEFAULT_THEME_ID, parseThemeId, resolveTheme, THEMES } from '@theme/index';
import type { Orientation, Theme } from '@theme/tokens';
import { Game, type Elements, type GameHooks } from '@ui/game';

// v2, 2026-08-14: the endless world became the default. Any device that ever
// visited before has `world.endless: false` explicitly persisted under v1,
// and a stored value beats a changed default by design — so the key moves,
// every device re-derives from the new defaults, and the old entry is left
// to rot. Overrides cost one visit to re-apply; a default that silently
// fails to arrive costs an evening of "but it works on my phone".
const FEATURE_STORAGE_KEY = 'tiles.features.v2';
const THEME_STORAGE_KEY = 'tiles.theme.v1';
const HEX_STORAGE_KEY = 'tiles.hex.v1';
/** The run in progress (or just ended), saved after every action. */
const RUN_STORAGE_KEY = 'tiles.run.v1';
/** The world this device explores: seed, revealed ground, territories held. */
const WORLD_STORAGE_KEY = 'tiles.world.v1';
/**
 * The record book, per world — runs, best, and the harvest-choice tally that
 * Gate B is measured on. v2: v1 held bare numbers, this holds records.
 */
const BEST_STORAGE_KEY = 'tiles.records.v2';

/**
 * Flags are resolved once, here at the edge, and passed downward as data. The
 * URL override wins over storage so a system can be flipped from the address
 * bar on a phone — which is the only debugging surface that exists when testing
 * against the deployed site.
 *
 * The resolved set is written BACK to storage, so an override sticks: visit
 * `?ff=ui.themePicker` once and the picker is simply there from then on, until
 * `?ff=-ui.themePicker` takes it away. One link makes a phone a test device.
 */
function persistFeatures(set: FeatureSet): void {
  try {
    localStorage.setItem(FEATURE_STORAGE_KEY, encodeFeatures(set));
  } catch {
    // Private mode, or storage disabled. Nothing to do, nothing worth saying.
  }
}

function resolveFeatures(): FeatureSet {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(FEATURE_STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. Defaults are a fine game.
  }
  const resolved = withOverrides(decodeFeatures(stored), parseOverrides(location.search));
  persistFeatures(resolved);
  return resolved;
}

/**
 * `?hex=flat` / `?hex=pointy` overrides the active theme's facing; `?hex=auto`
 * hands the decision back to the theme. Sticky, like the theme choice, and for
 * the same reason: prompt.md Q2 is decided by LOOKING, on a phone, and both
 * facings have to be one tap away from any theme for that comparison to happen.
 */
function resolveFacing(): Orientation | null {
  const asked = new URLSearchParams(location.search).get('hex');
  try {
    if (asked === 'flat' || asked === 'pointy') {
      localStorage.setItem(HEX_STORAGE_KEY, asked);
      return asked;
    }
    if (asked === 'auto') {
      localStorage.removeItem(HEX_STORAGE_KEY);
      return null;
    }
    const stored = localStorage.getItem(HEX_STORAGE_KEY);
    return stored === 'flat' || stored === 'pointy' ? stored : null;
  } catch {
    return asked === 'flat' || asked === 'pointy' ? asked : null;
  }
}

/**
 * `?theme=torchlit` beats what you picked last time, which beats the default.
 *
 * Same shape as the feature flags and for the same reason: the art direction is
 * not settled, the test environment is a phone against production, and the
 * address bar is the console. A link to a specific direction is a thing you can
 * send someone.
 */
function resolveThemeId(): string {
  const asked = parseThemeId(location.search);
  if (asked !== null) return asked;

  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function rememberTheme(id: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Nothing to do and nothing worth telling the player about.
  }
}

/**
 * `?seed=123` replays an exact run.
 *
 * The engine is deterministic precisely so that "it did something odd on my
 * phone" can become "run this seed", and that is worth nothing unless the seed
 * can be set from the address bar and read back off the screen. An EXPLICIT
 * seed also outranks a saved run — a shared seed link must open that run.
 */
function askedSeed(): number | null {
  const asked = new URLSearchParams(location.search).get('seed');
  if (asked === null) return null;
  const parsed = Number(asked);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * The world this device plays (P4a): rolled once, kept, and abandonable.
 *
 * `?seed=` still means "replay this exact run", which deliberately bypasses
 * the world — a shared link must show the sender's run, not the receiver's
 * geography.
 */
function loadWorld(): WorldMemory {
  try {
    const stored = decodeWorld(localStorage.getItem(WORLD_STORAGE_KEY));
    if (stored !== null) return stored;
  } catch {
    // Private mode: every visit is a new world, which is a fine game too.
  }
  const world = newWorld(Date.now() & 0x7fffffff);
  saveWorld(world);
  return world;
}

function saveWorld(world: WorldMemory): void {
  try {
    localStorage.setItem(WORLD_STORAGE_KEY, encodeWorld(world));
  } catch {
    // Unwritable memory is a world you rediscover each time. Still playable.
  }
}

/**
 * The run keeper: resume, autosave, records, world memory, and the one way to
 * start over. All of it lives here at the edge — the game reports through
 * hooks and never learns storage exists, the same split as the feature flags.
 */
function runKeeping(
  world: WorldMemory,
  debugOn: boolean,
): GameHooks & { savedSeed: number | null } {
  let saved = null;
  try {
    saved = askedSeed() === null ? decodeRun(localStorage.getItem(RUN_STORAGE_KEY)) : null;
  } catch {
    // Private mode. Every run is its own life; that is also a game.
  }

  return {
    resume: saved,
    savedSeed: saved?.rootSeed ?? null,
    memory: world.revealed,
    debug: debugOn,

    onChange: (state) => {
      try {
        localStorage.setItem(RUN_STORAGE_KEY, encodeRun(state));
      } catch {
        // Storage full or forbidden — the run simply is not kept.
      }
    },

    finish: (state) => {
      // The world remembers first: ground seen and territories held outlive
      // the run that found them, which is the whole of P4a. A replayed link
      // (`?seed=`) is somebody else's geography and must not touch it.
      if (state.tuning.world === 'endless' && askedSeed() === null) {
        saveWorld(rememberRun(world, state));
      }

      let book: RecordBook;
      try {
        book = decodeRecords(localStorage.getItem(BEST_STORAGE_KEY));
      } catch {
        book = {};
      }
      // Records are kept per WORLD KIND (endless / bounded), which is a
      // different thing from `world`, the plane this device explores.
      const kind = state.tuning.world;
      const before = book[kind] ?? EMPTY_RECORDS;
      const after = recordRun(book, state);
      try {
        localStorage.setItem(BEST_STORAGE_KEY, encodeRecords(after));
      } catch {
        // A record that cannot be written is still a run that happened.
      }

      const now = after[kind] ?? EMPTY_RECORDS;
      const gate = gateB(now);
      return {
        runs: now.runs,
        best: now.bestPoints,
        isNewBest: state.points > before.bestPoints && state.points > 0,
        pops: gate.pops,
        tilesShare: gate.tilesShare,
      };
    },

    newRun: () => {
      try {
        localStorage.removeItem(RUN_STORAGE_KEY);
      } catch {
        // Nothing to clear is fine too.
      }
      const url = new URL(location.href);
      url.searchParams.delete('seed');
      url.searchParams.delete('ff');
      location.href = url.toString();
    },
  };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

/**
 * The picker: one button per direction, reloading into it.
 *
 * A reload rather than a live swap, deliberately. Switching theme changes the
 * hex orientation, every baked texture, the webfont and the browser chrome
 * colour; a reload gets all of that right for free and costs a quarter of a
 * second, whereas a live swap is a pile of invalidation code guarding a
 * decision that will be made once and then deleted.
 */
function mountThemePicker(host: HTMLElement, current: Theme, facing: Orientation | null): void {
  host.hidden = false;

  const reloadWith = (mutate: (url: URL) => void): void => {
    const url = new URL(location.href);
    mutate(url);
    location.href = url.toString();
  };

  const themeButtons = THEMES.map((theme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.textContent = theme.name;
    button.title = theme.note;
    button.setAttribute('aria-pressed', String(theme.id === current.id));
    button.addEventListener('click', () => {
      rememberTheme(theme.id);
      reloadWith((url) => url.searchParams.set('theme', theme.id));
    });
    return button;
  });

  // The facing row: prompt.md Q2 is answered by flipping between these on a
  // phone, so they sit right next to the directions being judged.
  const facingButtons = (
    [
      ['auto', 'theme facing'],
      ['pointy', 'pointy-top'],
      ['flat', 'flat-top'],
    ] as const
  ).map(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(value === (facing ?? 'auto')));
    button.addEventListener('click', () => {
      reloadWith((url) => url.searchParams.set('hex', value));
    });
    return button;
  });

  host.replaceChildren(...themeButtons, ...facingButtons);
}

/**
 * The switchboard half of the `?` panel: one row per registered feature,
 * written FROM the registry — label, decision note, wired-or-not — so the
 * settings screen is the decision record and can never go stale against it.
 *
 * Toggles persist immediately. UI flags apply in place; world flags apply
 * from the next run, never to the one in progress — a switch must not eat a
 * live board. The NEW RUN button is the explicit way to make them count now.
 */
function mountSettings(
  host: HTMLElement,
  initial: FeatureSet,
  live: {
    themesHost: HTMLElement;
    theme: Theme;
    facing: Orientation | null;
    world: WorldMemory;
    abandon: () => void;
  },
  startNewRun: () => void,
): void {
  let features = initial;

  // The rows are interactive: their taps must not close the panel around them.
  host.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  const heading = document.createElement('p');
  heading.className = 'help-title';
  heading.textContent = 'SETTINGS';

  const intro = document.createElement('p');
  intro.textContent =
    'Sticky on this device. UI switches apply at once; world switches apply from your ' +
    'next run and never touch the one in progress. The address bar does the same job ' +
    '(?ff=world.endless, ?ff=-world.endless), and each note below is the decision ' +
    'that set the default.';

  const rows = FEATURES.map((f) => {
    const row = document.createElement('div');
    row.className = 'flag';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flag-toggle';
    button.disabled = !f.wired;
    const paint = (): void => {
      const on = isEnabled(features, f.id);
      button.textContent = f.wired ? (on ? 'ON' : 'OFF') : 'NOT BUILT';
      button.setAttribute('aria-pressed', String(on));
    };
    paint();

    if (f.wired) {
      button.addEventListener('click', () => {
        const next: Partial<Record<FeatureId, boolean>> = {};
        next[f.id] = !isEnabled(features, f.id);
        features = withOverrides(features, next);
        persistFeatures(features);
        paint();

        // The one live wire so far: the theme picker mounts and unmounts in
        // place. Everything world-shaped waits for the next run by design.
        if (f.id === 'ui.themePicker') {
          if (isEnabled(features, f.id)) {
            mountThemePicker(live.themesHost, live.theme, live.facing);
          } else {
            live.themesHost.hidden = true;
            live.themesHost.replaceChildren();
          }
        }
      });
    }

    const label = document.createElement('span');
    label.className = 'flag-label';
    label.textContent = f.label;

    const top = document.createElement('div');
    top.className = 'flag-row';
    top.append(button, label);

    const note = document.createElement('p');
    note.className = 'flag-note';
    note.textContent = f.note;

    row.append(top, note);
    return row;
  });

  // A fresh run under whatever the switches now say — the same path as the
  // end screen's button, so it also clears the saved run and drops ?seed and
  // ?ff, leaving the STORED settings to decide what comes next.
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.id = 'new-run';
  restart.textContent = 'NEW RUN with these settings';
  restart.addEventListener('click', startNewRun);

  // The atlas, and the way out of a world (P4a). Abandoning is the only
  // destructive control in the game, so it confirms — and it takes the
  // ground and the territories with it, which is the point.
  const atlas = document.createElement('p');
  atlas.className = 'help-title';
  atlas.textContent = 'YOUR WORLD';

  const atlasLine = document.createElement('p');
  atlasLine.id = 'atlas';
  atlasLine.textContent =
    `Seed ${live.world.worldSeed} · ${live.world.runs} run${live.world.runs === 1 ? '' : 's'} · ` +
    `${Math.round(knownFraction(live.world) * 100)}% of it known · ` +
    `${live.world.revealed.length} hexes seen · ` +
    `${live.world.territories.length} territor${live.world.territories.length === 1 ? 'y' : 'ies'} held · ` +
    `best ${live.world.bestPoints} pts · farthest ${live.world.farthestReach}`;

  let armed = false;
  const abandon = document.createElement('button');
  abandon.type = 'button';
  abandon.id = 'abandon-world';
  abandon.className = 'quiet';
  abandon.textContent = 'ABANDON THIS WORLD';
  abandon.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      abandon.textContent = 'TAP AGAIN — this forgets the map and the territories';
      return;
    }
    live.abandon();
  });

  host.replaceChildren(heading, intro, ...rows, restart, atlas, atlasLine, abandon);
}

async function main(): Promise<void> {
  const features = resolveFeatures();
  const world = loadWorld();
  const keeper = runKeeping(world, isEnabled(features, 'debug.overlay'));
  // Resumed run > shared seed link > THIS DEVICE'S WORLD. The last is P4a:
  // without a link or a run in progress you go back to your own plane, which
  // is what makes the fog memory and the held territories mean anything.
  const seed = keeper.savedSeed ?? askedSeed() ?? world.worldSeed;
  const facing = resolveFacing();
  const picked = resolveTheme(resolveThemeId());
  // The facing override rides on top of the theme as data, so every consumer —
  // renderer, baked draft cards, layout — sees one consistent orientation.
  const theme: Theme = facing === null ? picked : { ...picked, orientation: facing };

  // Before anything is drawn: the chrome takes its colours from the same theme
  // the board will, so there is never a frame of placeholder around themed art.
  applyTheme(theme, document.documentElement);

  const stamp = document.getElementById('stamp');
  if (stamp !== null) {
    const on = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
    stamp.textContent = [
      `${__BUILD_SHA__.slice(0, 7)}`,
      `seed ${seed}`,
      theme.id,
      ...(facing === null ? [] : [`hex:${facing}`]),
      ...on,
    ].join(' · ');
  }

  const elements: Elements = {
    board: required('board'),
    stats: required('stats'),
    hint: required('hint'),
    colours: required('colours'),
    draft: required('draft'),
    harvestTiles: required<HTMLButtonElement>('harvest-tiles'),
    harvestPoints: required<HTMLButtonElement>('harvest-points'),
    harvestTreasure: required<HTMLButtonElement>('harvest-treasure'),
    leave: required<HTMLButtonElement>('leave'),
    end: required('end'),
    zoomIn: required<HTMLButtonElement>('zoom-in'),
    zoomOut: required<HTMLButtonElement>('zoom-out'),
    zoomFit: required<HTMLButtonElement>('zoom-fit'),
    help: required<HTMLButtonElement>('help'),
    helpPanel: required('help-panel'),
    helpManual: required('help-manual'),
  };

  if (isEnabled(features, 'ui.themePicker')) {
    mountThemePicker(required('themes'), theme, facing);
  }

  // The settings half of the ? panel — mounted here rather than in Game
  // because flags are resolved at this edge and stay out of the engine.
  mountSettings(
    required('help-meta'),
    features,
    {
      themesHost: required('themes'),
      theme,
      facing,
      world,
      abandon: () => {
        try {
          localStorage.removeItem(WORLD_STORAGE_KEY);
          localStorage.removeItem(RUN_STORAGE_KEY);
        } catch {
          // Nothing stored is already an abandoned world.
        }
        location.href = new URL(location.pathname, location.href).toString();
      },
    },
    keeper.newRun ?? (() => location.reload()),
  );

  const renderer = new PixiRenderer(theme, AssetBook.empty(), prefersReducedMotion());
  await renderer.mount(elements.board);

  // The world flag decides a NEW run's economy; a resumed run plays under the
  // tuning it was saved with, by design — rebalances never re-score a run in
  // progress. `?ff=-world.endless` is the bounded game.
  // Flags become TUNING here at the edge and travel no further: the engine
  // sees numbers, never a feature registry.
  const base = isEnabled(features, 'world.endless') ? ENDLESS_TUNING : TUNING;
  const tuning = isEnabled(features, 'pop.treasure') ? base : { ...base, treasureNeed: 0 };
  // Territories the world already holds arrive as plain data — the engine
  // still knows nothing about storage, and a replay is reproducible from
  // seed + tuning + this list.
  const held = seed === world.worldSeed ? world.territories : [];
  new Game(renderer, elements, seed, theme, tuning, keeper, held).start();

  // Art loads AFTER the first playable frame, never before it. Every slot is
  // empty today and the procedural surfaces are a complete board; a bitmap that
  // arrives late simply replaces one, and a bitmap that never arrives costs
  // nothing. The game must never wait on a picture.
  void AssetBook.load(theme.id).then((assets) => {
    if (assets.size > 0) renderer.useAssets(assets);
  });
}

void main();
