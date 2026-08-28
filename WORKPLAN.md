# WORKPLAN — the 2026-08-27 symbol & glossary pipeline (LIVE)

The previous tracker (the 2026-08-19 visual pipeline, CLOSED 2026-08-20) is
fully recorded in `LOG.md`; this file reuses its process, per its own closing
note. Marc green-lit this pipeline on 2026-08-27 (option sets, plan approved):
one symbol language honoured everywhere, and a tappable glossary in the
manual. The full design is in the approved plan; each stage below carries
what its agent needs.

**Decisions of record (Marc, 2026-08-27, on option sets):**

- **Unicode glyphs, extended — no icon library.** Polish via colour and CSS.
- **Moderate vocabulary**: marks only for cross-screen concepts (RELIC ◉,
  LUCK ✤, WALL ▦, STONE ▨, fame ❋ so ✦ means FIND only, met ✓ / notYet ◇
  formalized). Stats stay words.
- **Glossary is a TS registry only** — no .md files (Marc dropped that
  explicitly).
- **Tapping a term in HOW TO PLAY opens a definition card** (event-card
  look, dialog stack).

Whoever picks this up: execute stages in order, ONE AT A TIME — same working
tree, no parallel stages. Every stage: question in `LOG.md` before building ·
gates (`pnpm exec vitest run` · `pnpm typecheck` · `pnpm lint` ·
`pnpm format:check` · `pnpm sim` byte-identical — this pipeline is
symbols and prose, the balance table must not move) · commit to main in the
repo's voice · push · CI green · account in `LOG.md` · mark it DONE here
with the hash before the next launches.

**Standing constraints, all stages:** engine purity untouched · no balance
number outside `src/content/` · contrast/greyscale thresholds never relaxed —
no new COLOUR role is introduced by this pipeline at all, new marks wear
existing ink roles · every listener through the signalled `on`/`#on` helpers ·
`resetShell()` learns any new static markup · final visual verdicts are
Marc's, on the deployed site, on a phone. Line numbers in stage briefs are
from 2026-08-27 pre-`aa78814` exploration — **grep for the anchors, do not
trust the numbers.**

## Stage 1 — CONCEPT_MARK, and every glyph literal routed through a registry (STATUS: TODO)

**Question:** when every glyph the game speaks comes from one of four
registries, does any surface change its meaning — and is ❋ (fame) instantly
distinguishable from ✦ (find) at phone sizes?

1. `src/theme/tokens.ts`: add the fourth registry beside the other three,
   with a docstring recording that ❋ retires ✦-as-highlight (its sixth
   meaning) and that met/notYet formalize the ✓-not-◈ ruling:
   `CONCEPT_MARK = { relic:'◉', luck:'✤', wall:'▦', stone:'▨', fame:'❋',
met:'✓', notYet:'◇' }`. Fallbacks if Marc's phone shows tofu or
   lookalikes: relic→▣, luck→✥, fame→✻, stone→▤.
2. `src/theme/tokens.test.ts`: the one-symbol-language union test gains
   `Object.values(CONCEPT_MARK)` — no duplicate glyph across all four
   registries.
3. Route every hardcoded glyph literal through a registry:
   - `src/ui/view.ts` (does not import the registries today): the
     `describeHexOf` sentences ('✚ CACHE…', '★ SITE…', '◈ SHRINE…',
     '✦ …', '❖ TERRITORY…') and the bounty/pocket lines (~336, 359, 415,
     1374, 1406, 1415-1416 pre-shift).
   - `src/ui/game.ts`: the claim notes (~1588-1681) including the cache
     claim's ASCII `+` lead → `LANDMARK_GLYPH.cache`; `'★ POP'` bounty
     button (~3343/3355); `'✦ found'` (~3903, stays ✦ — it IS a find,
     now registry-sourced); `'✓ goal met'` (~3917) → `CONCEPT_MARK.met`.
   - `src/shell/session.ts`: unlock rows ◈/◇ → `LANDMARK_GLYPH.shrine` /
     `CONCEPT_MARK.notYet` (~565/575); ledger ✓/◇ → met/notYet (~617-620);
     fame/highlight rows ✦ → `CONCEPT_MARK.fame` (~1886, 2011, 2020).
     Highlights are typed data with the glyph applied at paint time — no
     persisted data changes.
   - `e2e/menu.spec.ts` (~409): `✦ NEW BEST` → `❋ NEW BEST`. Grep
     `game.test.ts` for glyph expectations (`+  CACHE`, `✦`, `✓`) and
     update.

Visual delta on ship: fame ❋ and the cache card's ✚ lead; nothing else.
Marc's phone check of the five new characters is the gate for the glyph
choices.

## Stage 2 — Symbols where words stood (STATUS: TODO)

Pure additive polish; depends on Stage 1's registry.

1. End screen: `◉ N relics banked` (+ the RELICS shop-door row), the
   `BOUNTIES` fact label wears ★. `DESTINATIONS` stays a word — it names a
   mixed family with no single glyph; leave a comment saying so.
2. HUD: the LUCK stat wears ✤ via an optional `mark` field on `Stat`;
   **aria-label stays the plain word** (mark rendered in the span only).
3. Lesson leads that own a mark lead with it instead of ⬢: the LUCK teach
   card and the purse lesson lead (`view.ts` purseLesson) → ✤;
   `RELIC_LESSON` → ◉. ⬢ remains the voice for game-wide lessons.
4. `describeHexOf` wall/stone sentences lead with ▦/▨; the manual's
   wall/stone tip rows (if any) get `glyph:` marks.
5. `game.test.ts`: relics-banked line carries ◉, BOUNTIES carries ★, LUCK
   aria-label stays `LUCK n`.

Phone check: HUD row width with the ✤ mark, in portrait.

## Stage 3 — The glossary registry, no UI change (STATUS: TODO)

1. New `src/ui/glossary.ts` (`src/content/` is ESLint-restricted to balance
   data; `ui/` may import content/engine/theme/meta):
   - `GlossaryId = TeachId | 'pocket' | 'worth' | 'bounty' | 'stash' |
'sizeBonus' | 'stone'` (`TeachId` from `src/meta/progress.ts`).
   - `GlossaryEntry { id, terms (UPPERCASE, longest first, e.g.
['RELICS','RELIC'], ['LAST GASP']), glyph? (from the four registries
only), ink? ('ink-magic'|'ink-unique'), define: (t: Tuning, theme:
Theme) => string (2-3 lines, live numbers, like the manual) }`.
   - ~18 entries: ripe, pop, pocket, worth, cache ✚, site ★, shrine ◈,
     territory ❖, wall ▦, stone ▨, rare→MAGIC, rareUnique→UNIQUE, luck ✤,
     relic ◉, bounty ★, stash, lastGasp, sizeBonus.
2. Move, not copy: `RELIC_LESSON` (game.ts) becomes `relic.define`; the
   LUCK teach card and `statNote('luck')` share the glossary's core
   sentence (statNote appends its live clause). Deliberately NOT merged:
   `describeHexOf` / `statNote` (contextual, priced questions),
   `colourLesson` / `COLOUR_HELP` (theme-dependent ground names), perk
   names (mystery rule, progress.ts ~129-131). Stats stay out.
3. New `src/ui/glossary.test.ts` pins: unique ids · terms uppercase and
   unique across the registry · every glyph ∈ the four registries' union
   (the glossary may not invent a symbol) · `define(DEFAULT_TUNING,
torchlit)` non-empty, ≤ ~3 sentences · every glossary term occurs in
   the full-ledger manual text (reuse `game.test.ts`'s `openFullManual`
   pattern) — no dead definitions nobody can tap.

## Stage 4 — Tappable terms and the definition card (STATUS: TODO)

1. `src/ui/tips.ts`: refactor `rarityInked` around a shared splitter and
   add `conceptInked(text, open)` — one regex from all glossary terms +
   MAGIC/UNIQUE, longest-first alternation, `\b` boundaries; each match →
   `<button type="button" class="term" data-term="{id}"
aria-haspopup="dialog">`, MAGIC/UNIQUE also wearing their ink class.
   `rarityInked` keeps its exact behavior and ALL its callers (it runs
   inside buttons — must never nest buttons).
2. `Game#helpSection` uses `conceptInked` for section `lines` and `detail`
   ONLY — never titles, tabs, tipRows, toasts, event cards. Card
   definitions render through `rarityInked` (no recursion). No per-term
   ledger gating: the manual's section gating already hides unmet
   concepts.
3. `index.html`: `#term-card` as a sibling of `#help-panel` in `#app` —
   `#term-card-panel` (role=dialog, aria-modal, tabindex=-1) with
   `#term-card-glyph`, `#term-card-name`, `#term-card-text`,
   `#term-card-dismiss` (GOT IT).
4. `src/style.css`: SHARE the event-card skin by widening selectors
   (`#event-card, #term-card {…}`), don't duplicate; `#term-card
{ z-index: 7 }`; update the layer-map comment (~160-176); `.term`
   inherits currentColor and font, dotted underline, tap-target padding.
   (`#event-card` itself can't be reused — it lives inside `#game-shell`
   at z-index 2, under the manual at 5, entangled with `#eventAction`.)
5. `Game` owns the card: nodes join `Elements` and `session.ts`'s
   `required()` block; dismiss wired via `#on`; open = fill card,
   `openDialog({panel, covers: siblingsOf(panel), opener, close})`, focus
   dismiss; Escape closes only the card (stack top); focus returns to the
   tapped term. Works from the front door because MORE ▸ HOW TO PLAY
   routes through `game.openHelp`. `resetShell()` hidden list gains
   `'term-card'`.
6. `game.test.ts`: manual lines contain `button.term[data-term]` (e.g.
   RIPENS in START); tap → card shows registry glyph + non-empty
   definition, `#help-panel` inert; GOT IT restores manual + focus;
   Escape order (card, then manual); no `.term` inside `.help-title`/tabs;
   toast/event-card paths still produce plain spans.
7. `e2e/menu.spec.ts`: adjust the "closes on BACK, not on the prose" test
   to click `.help-title`/`#help-name` (never tappable) instead of an
   arbitrary `p`; new test — BEGIN → `#help` → tap `button.term` → card
   visible + help inert → GOT IT → focus back on term; Escape closes only
   the card; same flow via MORE ▸ HOW TO PLAY. House style: `watchErrors`,
   ids/semantic classes, modality via inert+focus.

Phone check: finger-tap targets on inline terms, card legibility over the
manual.

## Held out on purpose (scope flags)

- Tappable terms are manual-only this pass; each further host (event card,
  tip rows) is a one-line follow-up once the plumbing exists.
- Ground names (MOSS, EMBER…) are theme-dependent — not glossary terms;
  `colourLesson` answers them on the board.
- Perk names stay out (the mystery rule).
- Glyph rendering on Marc's phone is the one real unknown — Stage 1 ships
  the characters alone, with fallbacks, before anything builds on them.

## After the pipeline

Marc's phone pass over the four stages (glyph legibility is his verdict, by
looking) · then back to the pre-tag close: a phone pass and Session C.
