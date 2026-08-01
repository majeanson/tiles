// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * The layering rule:
 *
 *     content  <-  engine  <-  ui
 *              <-  theme   <-  render
 *                          <-  sim
 *
 * `content` is data and may import nothing. `engine` is pure and may import only
 * `content`. `theme` is the visual contract — data about how roles are painted —
 * and may import only `content`'s types; the engine may not see it, because a
 * rule that can read the palette is a rule that can be changed by repainting.
 * Nothing at all imports `ui`. This file is the only thing that makes that a fact
 * rather than an intention, which is why it earns its length.
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
  { ignores: ['dist/**', 'node_modules/**', 'ideas/**', 'coverage/**'] },

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
    files: ['vite.config.ts', 'eslint.config.js', 'scripts/**/*.ts', 'src/sim/**/*.ts'],
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
      [...layer('ui'), ...layer('sim')],
      'The renderer draws what it is given. It may not reach into ui/ or sim/.',
    ),
  },

  {
    files: ['src/meta/**/*.ts', 'src/sim/**/*.ts'],
    rules: deny(
      [...layer('ui'), ...layer('render')],
      'Nothing headless may import ui/ or render/.',
    ),
  },

  prettier,
);
