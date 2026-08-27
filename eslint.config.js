// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * The layering rule:
 *
 *     content  <-  engine  <-  ui     <-  shell
 *              <-  theme   <-  render
 *                          <-  sim
 *
 * `content` is data and may import nothing. `engine` is pure and may import only
 * `content`. `theme` is the visual contract — data about how roles are painted —
 * and may import only `content`'s types; the engine may not see it, because a
 * rule that can read the palette is a rule that can be changed by repainting.
 * Nothing at all imports `ui`. `shell` is the edge — storage, the URL, the
 * service worker, the DOM around the board — and it is the one layer allowed to
 * import everything, because it is where the outside world is dealt with; in
 * return, nothing may import IT but `main.ts`. This file is the only thing that
 * makes that a fact rather than an intention, which is why it earns its length.
 */
const deny = (groups, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
});

/** Aliased and relative spellings of the same forbidden folder. */
const layer = (name) => [`@${name}`, `@${name}/*`, `**/${name}`, `**/${name}/*`];

/**
 * Determinism guards. The engine's whole value is that `reduce(state, action)`
 * returns the same thing every time — which buys replays, golden tests, save
 * files and a headless balance harness. One `Math.random()` costs all four, and
 * it is invisible in review. So it is a lint error instead.
 */
const pure = {
  'no-restricted-globals': [
    'error',
    ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'performance'].map(
      (name) => ({ name, message: 'The engine has no DOM. Pass what you need in as an argument.' }),
    ),
    ...['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame'].map((name) => ({
      name,
      message: 'The engine is synchronous. Timing belongs to the renderer.',
    })),
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'Math',
      property: 'random',
      message: 'Take an RngStream from state and return the advanced stream.',
    },
    {
      object: 'Date',
      property: 'now',
      message: 'The engine is deterministic. No wall-clock time.',
    },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: 'NewExpression[callee.name="Date"]',
      message: 'The engine is deterministic. No wall-clock time.',
    },
  ],
};

export default tseslint.config(
  // `public/**` is shipped verbatim rather than compiled, so nothing in it is
  // in the TypeScript project and the type-aware rules have nothing to check
  // it against. That was the whole argument for ignoring it — and it left
  // `public/sw.js` as the ONE file that can brick a returning player checked
  // by nothing at all: no lint, no types, no test, straight to production
  // (2026-08-21). It gets the plain JS rules and a service-worker environment
  // below; the rest of `public/` is images and fonts.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'ideas/**',
      'coverage/**',
      // `public/**` used to be here wholesale. It is gone rather than
      // negated: a negated pattern does not un-ignore a file inside a
      // directory ESLint has already been told to skip, so `!public/sw.js`
      // read as covered and silently was not. ESLint lints `.js`/`.ts` only,
      // and `sw.js` is the sole script in `public/` — the images, fonts and
      // manifests there are not files it would ever open.
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Node-side files: the build config, the deploy scripts, the headless harness.
  {
    files: [
      'vite.config.ts',
      'eslint.config.js',
      'scripts/**/*.ts',
      'src/sim/**/*.ts',
      'playwright.config.ts',
      'e2e/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },

  // This file is plain JS outside the TS program, so type-aware rules have no
  // types to work from. Lint it structurally instead of not at all.
  { files: ['eslint.config.js'], extends: [tseslint.configs.disableTypeChecked] },

  {
    files: ['src/engine/**/*.ts'],
    rules: {
      ...pure,
      ...deny(
        [
          ...layer('ui'),
          ...layer('render'),
          ...layer('theme'),
          ...layer('meta'),
          ...layer('shell'),
          ...layer('sim'),
          'pixi.js',
        ],
        'The engine may import only from engine/ and content/. A rule that can read the palette is a rule you can change by repainting.',
      ),
    },
  },

  {
    files: ['src/content/**/*.ts'],
    rules: {
      ...pure,
      ...deny(
        [
          ...layer('ui'),
          ...layer('render'),
          ...layer('theme'),
          ...layer('meta'),
          ...layer('shell'),
          ...layer('sim'),
          ...layer('engine'),
          'pixi.js',
        ],
        'content/ is data. It imports nothing but its own types.',
      ),
    },
  },

  // theme/ is the visual contract. It describes how roles are painted and knows
  // nothing about what they mean, so it may read content's types and no more.
  // `apply.ts` is the single exception that touches the document, and it is
  // allowed the DOM the way render/ is — but never a rule, a number or a state.
  {
    files: ['src/theme/**/*.ts'],
    rules: deny(
      [
        ...layer('ui'),
        ...layer('render'),
        ...layer('meta'),
        ...layer('shell'),
        ...layer('sim'),
        ...layer('engine'),
        'pixi.js',
      ],
      'theme/ describes how things look. It may import content/ types and nothing else.',
    ),
  },

  {
    files: ['src/render/**/*.ts'],
    rules: deny(
      [...layer('ui'), ...layer('shell'), ...layer('sim')],
      'The renderer draws what it is given. It may not reach into ui/, shell/ or sim/.',
    ),
  },

  {
    files: ['src/meta/**/*.ts', 'src/sim/**/*.ts'],
    rules: deny(
      [...layer('ui'), ...layer('render'), ...layer('shell')],
      'Nothing headless may import ui/, render/ or shell/.',
    ),
  },

  // ui/ is the screen; shell/ is the edge that owns it. The Game reports
  // through hooks and never learns storage or the URL exists — which is the
  // split that lets the same Game be constructed by a session that started
  // in place instead of by a page load.
  {
    files: ['src/ui/**/*.ts'],
    rules: deny(
      [...layer('shell'), ...layer('sim')],
      'The game reports through hooks. It may not reach into shell/ — the shell keeps, the game plays.',
    ),
  },

  /**
   * The service worker (2026-08-21).
   *
   * LAST in the list on purpose: flat configs merge in order, so this has to
   * come after the type-aware block above to switch the project service back
   * off for one file. `public/sw.js` is hand-written browser JS outside the
   * TypeScript project — there is nothing to type-check it against — but it
   * is also the single file that can brick a returning player, and it was
   * reaching production with no lint, no types and no test touching it.
   * Plain JS rules plus a service-worker environment is a small net, and a
   * small net over that file beats no net at all.
   */
  {
    files: ['public/sw.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      parserOptions: { projectService: false, project: false },
      globals: { ...globals.serviceworker, __BUILD_SHA__: 'readonly' },
    },
  },

  prettier,
);
