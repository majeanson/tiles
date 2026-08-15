import { COLOURS, TUNING, type Colour, type Tuning } from '@content/tuning';
import type { HexKey } from '@engine/hex';
import { newRun, reduce } from '@engine/reduce';
import { isRipe } from '@engine/rules';
import type { Action, GameState } from '@engine/state';
import { bakeSurface } from '@render/bake';
import type { Renderer } from '@render/Renderer';
import { PLACEHOLDER } from '@theme/themes/placeholder';
import type { Theme } from '@theme/tokens';
import { toBoardView, toHudView, type HudView } from './view';

/**
 * The loop: hold a state, turn taps into actions, redraw.
 *
 * All the thinking lives in the engine and in `view.ts`; this file is wiring
 * and is meant to stay that way. Anything here that starts deciding what a
 * number means belongs in the selector, where it can be tested without a phone.
 *
 * The theme reaches this file for exactly two reasons: the draft cards need the
 * direction's NAME for a colour ("CRYPT" rather than "green"), and the stat row
 * needs to know which number is the one that kills you. Colours themselves never
 * appear here — they arrive as CSS custom properties, written once by
 * `applyTheme`, so the chrome and the canvas cannot drift apart.
 */

export type Elements = {
  readonly board: HTMLElement;
  readonly stats: HTMLElement;
  readonly hint: HTMLElement;
  readonly colours: HTMLElement;
  readonly draft: HTMLElement;
  readonly harvestTiles: HTMLButtonElement;
  readonly harvestPoints: HTMLButtonElement;
  readonly leave: HTMLButtonElement;
  readonly end: HTMLElement;
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
  readonly zoomFit: HTMLButtonElement;
  readonly help: HTMLButtonElement;
  readonly helpPanel: HTMLElement;
  /** The manual's half of the panel. The settings half belongs to main.ts. */
  readonly helpManual: HTMLElement;
};

/** One zoom-button step. Three taps from fit to full close-up. */
const ZOOM_STEP = 1.6;

/** Movement under this many pixels is still a tap; past it, a drag. */
const TAP_SLOP = 8;

/** Label, value, and whether this is the number counting down to the end. */
type Stat = { readonly id: string; readonly label: string; readonly value: string };

/** Circumradius of the hex drawn on a draft card, in CSS pixels. */
const HAND_HEX_SIZE = 24;

export class Game {
  #state: GameState;
  readonly #renderer: Renderer;
  readonly #el: Elements;
  readonly #theme: Theme;
  /**
   * The four terrain surfaces, baked once to data URLs so a draft card shows the
   * tile EXACTLY as the board will draw it — same baker, same theme, same
   * texture. A card that shows a flat swatch while the board shows a hatched hex
   * is promising one thing and placing another. Empty where no 2D canvas exists
   * (happy-dom, a broken context); the flat swatch is the fallback, not an error.
   */
  readonly #art: Partial<Record<Colour, string>> = {};

  /**
   * The pocket the player last tapped, on the plane. UI state, not game state:
   * the engine only learns about it when a harvest button carries it as `at`.
   * The selector re-resolves it every render, so a stale tap (the pocket got
   * popped) degrades to the biggest pocket rather than to a dead button.
   */
  #harvestAt: HexKey | null = null;

  /**
   * The colour lens: the chip currently held down, or null. UI state like the
   * tapped pocket — the engine never learns a colour was being studied.
   */
  #spotlight: Colour | null = null;

  constructor(
    renderer: Renderer,
    elements: Elements,
    seed: number,
    theme: Theme = PLACEHOLDER,
    tuning: Tuning = TUNING,
  ) {
    this.#renderer = renderer;
    this.#el = elements;
    this.#theme = theme;
    this.#state = newRun(seed, tuning);

    for (const colour of COLOURS) {
      try {
        const baked = bakeSurface(theme.terrain[colour], HAND_HEX_SIZE, theme.orientation);
        if (baked !== null) this.#art[colour] = baked.toDataURL();
      } catch {
        // No canvas here. The card keeps its coloured background and its word.
      }
    }
  }

  get state(): GameState {
    return this.#state;
  }

  start(): void {
    this.#mountGestures();

    this.#el.zoomIn.addEventListener('click', () => {
      this.#renderer.zoomBy(ZOOM_STEP);
      this.#syncCamera();
    });
    this.#el.zoomOut.addEventListener('click', () => {
      this.#renderer.zoomBy(1 / ZOOM_STEP);
      this.#syncCamera();
    });
    this.#el.zoomFit.addEventListener('click', () => {
      this.#renderer.resetCamera();
      this.#syncCamera();
    });

    // The help panel is the manual: every system in play, in the order a run
    // meets them, with its numbers read from the LIVE tuning so the text can
    // never disagree with the economy it describes. It closes on any tap
    // because the only thing to do with it is stop reading it.
    this.#el.helpManual.replaceChildren(
      ...this.#helpSections().flatMap(({ title, lines }) => {
        const heading = document.createElement('p');
        heading.className = 'help-title';
        heading.textContent = title;
        return [
          heading,
          ...lines.map((line) => {
            const p = document.createElement('p');
            p.textContent = line;
            return p;
          }),
        ];
      }),
    );
    this.#el.help.addEventListener('click', () => {
      this.#el.helpPanel.hidden = !this.#el.helpPanel.hidden;
    });
    this.#el.helpPanel.addEventListener('click', () => {
      this.#el.helpPanel.hidden = true;
    });

    this.#el.harvestTiles.addEventListener('click', () => {
      this.#harvest('tiles');
    });
    this.#el.harvestPoints.addEventListener('click', () => {
      this.#harvest('points');
    });
    this.#el.leave.addEventListener('click', () => {
      this.#dispatch({ type: 'LEAVE' });
    });

    this.#syncCamera();
    this.render();
  }

  /**
   * One finger taps or, past a small slop, pans. Two fingers pinch. Placement
   * only ever happens on a lift that never crossed the slop — so the board
   * can be dragged and zoomed freely without a stray tile appearing, which is
   * the gesture war P3a sidestepped by having no camera at all.
   *
   * `pointerup` rather than `click` for the tap: a click is synthesised
   * ~300ms after a touch on some mobile browsers, and placing a tile a third
   * of a second after the thumb lifts is the difference between crisp and
   * mushy.
   */
  #mountGestures(): void {
    const board = this.#el.board;
    const down = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinch = 0;

    const spread = (): number => {
      const [a, b] = [...down.values()];
      return a !== undefined && b !== undefined ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    board.addEventListener('pointerdown', (event) => {
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (down.size === 2) pinch = spread();
      try {
        board.setPointerCapture(event.pointerId);
      } catch {
        // No capture support (old browser, test DOM). Gestures still work;
        // a drag that leaves the element just ends early.
      }
    });

    board.addEventListener('pointermove', (event) => {
      const from = down.get(event.pointerId);
      if (from === undefined) return;

      if (down.size >= 2) {
        down.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const d = spread();
        if (pinch > 0 && d > 0) {
          this.#renderer.zoomBy(d / pinch);
          this.#syncCamera();
        }
        pinch = d;
        moved = true;
        return;
      }

      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      moved = true;
      this.#renderer.panBy(dx, dy);
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });

    const lift = (event: PointerEvent): void => {
      const had = down.delete(event.pointerId);
      if (down.size > 0) {
        // One finger of a pinch lifted; the other continues as a pan.
        pinch = 0;
        return;
      }
      const tapped = had && !moved && event.type === 'pointerup';
      moved = false;
      pinch = 0;
      if (tapped) this.#tap(event);
    };
    board.addEventListener('pointerup', lift);
    board.addEventListener('pointercancel', lift);
  }

  #tap(event: PointerEvent): void {
    const rect = this.#el.board.getBoundingClientRect();
    const hex = this.#renderer.hitTest(event.clientX - rect.left, event.clientY - rect.top);
    if (hex === null) return;

    // On the plane a tap on a ripe tile is a QUESTION — "what is this pocket
    // worth?" — not a placement. The harvest buttons re-price to that pocket
    // and the board outlines it. Everywhere else a tap stays a placement.
    if (this.#state.tuning.world === 'endless' && isRipe(this.#state.cells, hex)) {
      this.#harvestAt = hex;
      this.render();
      return;
    }
    this.#dispatch({ type: 'PLACE', hex });
  }

  /** Zooming out below fit is meaningless, so those two buttons say so. */
  #syncCamera(): void {
    const atFit = this.#renderer.zoomLevel() <= 1.001;
    this.#el.zoomOut.disabled = atFit;
    this.#el.zoomFit.disabled = atFit;
  }

  /**
   * The manual, in plain words, in the order a run meets each system. Every
   * number is read from the run's OWN tuning — the same object the reducer
   * pays with — so a balance change rewrites the manual by itself and the
   * text can never describe an economy that is not the one being played.
   */
  #helpSections(): { title: string; lines: string[] }[] {
    const t = this.#state.tuning;
    const endless = t.world === 'endless';

    const loop: { title: string; lines: string[] } = {
      title: 'THE LOOP',
      lines: [
        endless
          ? 'One endless plane. Place tiles, surround them to ripen them, pop ripe pockets for tiles or points, and push outward — farther pays more. The run ends when you cannot act.'
          : 'Place tiles, surround them to ripen them, harvest for tiles or points, and move on to deeper, better-paying maps. The run ends when you run out of tiles.',
      ],
    };

    const placing: { title: string; lines: string[] } = {
      title: 'PLACING',
      lines: [
        'Tap a card to pick it up, then tap any hex with a glowing edge. A tile must touch something already built.',
        `Placing costs tiles: ${t.baseCost} to start, +1 for every ${t.costRisesEvery} tiles you have ever placed this run. The cost NEVER resets — this is the clock that ends every run.`,
        'The faint number on an empty hex is exactly what the selected tile will be worth there. It is a promise, not an estimate.',
        'BEST marks the card whose strongest placement pays the most right now. Advice, not an order.',
      ],
    };

    const ripe: { title: string; lines: string[] } = {
      title: 'RIPE AND WORTH',
      lines: [
        'A tile touched on ALL SIX sides is ripe — ready to pop. Walls, stone and other tiles all count as touching.',
        'Worth = how many neighbours MATCH the tile (same colour). Stone and walls surround but never match. Native ground (dots in the tile’s own colour) counts as one extra match.',
        'The bright number on a ripe tile is its worth. Placing one tile can raise the worth of up to six neighbours at once — that is the whole craft.',
      ],
    };

    const harvest: { title: string; lines: string[] } = {
      title: 'HARVEST',
      lines: [
        endless
          ? 'A pocket is a connected group of ripe tiles. Tap any ripe tile to price its pocket — the board outlines it and the two buttons show what popping it pays. The biggest pocket is priced by default.'
          : 'Harvest pops EVERY ripe tile on the map at once.',
        `Take tiles: ${t.tilesPerPop} per popped tile, +1 more per ${t.worthPerExtraTile} worth. Linear and safe — this is how you stay alive.`,
        endless
          ? `Take pts: the pocket’s summed worth × its size bonus × the distance multiplier. Bigger pockets pay disproportionately more, and the multiplier rises by 1 for every ${t.distanceStep} hexes the pocket sits from home. Score lives out there.`
          : 'Take pts: summed worth × size bonus × the map number. Bigger harvests and deeper maps pay disproportionately more.',
        'You take ONE of the two, never both. Small pockets favour tiles; big far ones favour points. When to stop growing a pocket and cash it is the whole game.',
        'Popped tiles turn to STONE. Stone still surrounds (helps ripen) but never matches (pays nothing) — every harvest makes that ground cheaper, which is the pressure to keep moving.',
        'Wait too long and you can die with a fortune unpopped. Greed has a cliff.',
      ],
    };

    const colours: { title: string; lines: string[] } = {
      title: 'THE COLOURS',
      lines: [
        `GREEN — crowds. +${t.greenCrowdBonus} worth for every green neighbour past the first. Greens want to be one big mob: commit to a mono-pocket and it snowballs.`,
        `YELLOW — company. +${t.yellowCompanyBonus} worth for every DIFFERENT colour touching it. Yellow scores in messy mixed ground where nothing else matches — the glue tile.`,
        'RED — ash. Stone counts as a match for red. Your spent, popped land is red’s soil: build red along the wake everyone else abandons.',
        `BLUE — tide. +1 worth for every ${t.blueTideEvery} hexes from home. Worth little in the clearing, a lot on the frontier — blue is the colour you carry outward.`,
      ],
    };

    const ground: { title: string; lines: string[] } = {
      title: 'THE GROUND',
      lines: [
        'Plain ground takes any tile. Dotted ground is a NATIVE FIELD: a tile of that colour placed there counts the ground as one extra match.',
        'Whole regions of same-coloured dots are BIOMES — one colour’s country. Chasing a colour strategy means walking to where that colour grows.',
        'Walls cannot be built on. They surround (help ripen) but never match — and a frontier that is all wall can end a run.',
        'The plane only exists where you have grown it. Every placement reveals the ground around itself.',
      ],
    };

    const destinations: { title: string; lines: string[] } = {
      title: 'DESTINATIONS',
      lines: [
        'The glows beyond your ground are destinations. They shine through undiscovered land — build your chain out and TOUCH one with a tile to claim it. Each pays once.',
        `+ is a CACHE: ${t.cachePays} tiles on the spot. A lifeline when the cost curve is biting — it pays after the placement cost, so it can save a run at zero.`,
        `★ is a SITE: ${t.sitePays} pts × the distance multiplier at its hex. The farther the site, the more the same walk is worth.`,
        `◆ is a TERRITORY: claiming it turns the ground within ${t.territoryRadius} hexes into a native field of its colour — permanently yours, and it glows in the colour it will grant.`,
        'The line above your hand always names the nearest unclaimed destination and how many hexes out it sits.',
      ],
    };

    const rarity: { title: string; lines: string[] } = {
      title: 'RARE TILES AND LUCK',
      lines: [
        'Every drawn tile can roll MAGIC or UNIQUE — the card says so, and rare tiles keep an accent edge on the board.',
        'MAGIC is wild: it matches EVERY neighbouring tile, whatever the colour, and they match it back.',
        'UNIQUE is wild and heavy: every match it is part of counts DOUBLE, for both sides — ground included.',
        `Luck: every tile popped in a TILES-harvest raises your odds (shown in the line above your hand), up to a cap. Cashing big pockets as survival is what buys better draws — the two currencies feed each other.`,
      ],
    };

    const stash: { title: string; lines: string[] } = {
      title: 'THE STASH',
      lines: [
        'The dashed HOLD card keeps one tile for later. Tap it to stash your selected card; tap again to trade the stashed tile back into your hand.',
        'Held tiles survive rerolls — save a rare tile, or the right colour, for the moment it is actually worth something.',
      ],
    };

    const reading: { title: string; lines: string[] } = {
      title: 'READING THE SCREEN',
      lines: [
        endless
          ? 'TILES is your life — it is the number that ends the run. POINTS is your score. REACH is how far from home you have built. COST is what the next placement takes.'
          : 'TILES is your life — it is the number that ends the run. POINTS is your score. MAP is how deep you are. COST is what the next placement takes.',
        'The line above your hand reads: what to do now · the nearest destination · your current odds.',
        'Zoom with + and −, pinch works too, drag to pan, FIT shows everything. Worth numbers appear as you zoom in.',
      ],
    };

    const end: { title: string; lines: string[] } = {
      title: 'HOW IT ENDS',
      lines: [
        'Out of tiles with nothing ripe to cash: broke. The cost curve always wins eventually — the question is what you scored on the way.',
        ...(endless
          ? [
              'A frontier that is all wall with nothing left to pop: walled in. Rare, and worth avoiding on the way past.',
            ]
          : [
              'Once you have harvested on a map you may MOVE ON — deeper maps multiply points harder.',
            ]),
        'Tap anywhere to close this.',
      ],
    };

    // "What this game is", derived rather than written: the world, the
    // economy and the list of systems in play all come from the run's own
    // tuning, so this section re-describes itself after every balance or
    // flag change. The decisions behind the switches live in SETTINGS below.
    const systems: string[] = [];
    if (t.destinationEvery > 0) systems.push('destinations');
    if (t.biomeEvery > 0) systems.push('biomes');
    if (t.magicChance + t.uniqueChance > 0) systems.push('rare tiles + luck');
    if (t.greenCrowdBonus + t.yellowCompanyBonus + t.blueTideEvery > 0 || t.redAshMatches) {
      systems.push('colour personalities');
    }
    if (t.holdSlots > 0) systems.push('the stash');

    const build: { title: string; lines: string[] } = {
      title: 'THIS BUILD',
      lines: [
        endless
          ? `World: one endless plane, grown from seed ${this.#state.rootSeed}. Same seed, same world — share the number to share the run.`
          : `World: bounded maps, seed ${this.#state.rootSeed}.`,
        `Economy: start with ${t.startingTiles} tiles · a placement costs ${t.baseCost}, +1 per ${t.costRisesEvery} ever placed · ${t.draftWidth}-card draft${t.holdSlots > 0 ? ' plus the stash' : ''}.`,
        systems.length > 0
          ? `Systems in play: ${systems.join(' · ')}. Each is detailed above.`
          : 'Systems in play: none — this is the smallest game there is.',
        'SETTINGS below switches every system and carries the decision that set each default. The stamp at the bottom of the screen names the exact code this page is running.',
      ],
    };

    return endless
      ? [
          loop,
          placing,
          ripe,
          harvest,
          colours,
          ground,
          destinations,
          rarity,
          stash,
          reading,
          end,
          build,
        ]
      : [loop, placing, ripe, harvest, reading, end, build];
  }

  /**
   * Harvest what the buttons are pricing. The selector owns which pocket that
   * is (`hud.harvestAt`), so the dispatch and the price cannot disagree.
   */
  #harvest(choice: 'tiles' | 'points'): void {
    const at = toHudView(this.#state, this.#harvestAt).harvestAt;
    this.#dispatch(at === null ? { type: 'HARVEST', choice } : { type: 'HARVEST', choice, at });
  }

  #dispatch(action: Action): void {
    const next = reduce(this.#state, action);
    // The engine returns the same state for anything illegal, so this is also
    // the "that did nothing" check — no need to ask permission before acting.
    if (next === this.#state) return;
    this.#state = next;
    this.render();
  }

  render(): void {
    this.#renderer.draw(toBoardView(this.#state, this.#harvestAt, this.#spotlight));
    this.#renderHud(toHudView(this.#state, this.#harvestAt, this.#spotlight));
  }

  #renderHud(hud: HudView): void {
    this.#renderStats(hud);
    this.#renderDraft(hud);
    this.#renderColours(hud);

    // The reorientation line: what to do now, then the nearest destination,
    // then the odds. One string, collapsing to nothing when all are silent.
    // With a colour chip held down, its calculation takes the line instead —
    // the lens is exactly a question, and this is its answer.
    const spot = hud.spotlight;
    const spotLine =
      spot === null
        ? null
        : `${this.#theme.terrainNames[spot.colour]}: ${spot.count} tiles standing · ` +
          `worth ${spot.worth}${spot.ripeCount > 0 ? ` (${spot.ripeWorth} of it ripe now)` : ''} · ` +
          `pts when popped = worth × pocket size × ${hud.showLeave ? 'map' : 'distance'}`;
    const hint = [spotLine ?? hud.guide, hud.hint, hud.odds].filter((s) => s !== null).join(' · ');
    this.#el.hint.textContent = hint;
    this.#el.hint.hidden = hint === '';

    // The harvest buttons exist only while the choice does. A pair of dead
    // buttons pricing an impossible harvest at 0 was two decisions on screen
    // that were not decisions; their appearing IS the "pocket ready" signal,
    // and when they appear both payouts show their real numbers — the choice
    // is only a choice if you can see what you are giving up.
    this.#el.harvestTiles.textContent = `Take ${hud.harvestTiles} tiles`;
    this.#el.harvestPoints.textContent = `Take ${hud.harvestPoints} pts`;
    this.#el.harvestTiles.hidden = !hud.canHarvest;
    this.#el.harvestPoints.hidden = !hud.canHarvest;
    this.#el.harvestTiles.disabled = !hud.canHarvest;
    this.#el.harvestPoints.disabled = !hud.canHarvest;

    this.#el.leave.hidden = !hud.showLeave;
    this.#el.leave.textContent = hud.leaveHint;
    this.#el.leave.disabled = !hud.canLeave;

    this.#el.end.hidden = !hud.ended;
    if (hud.epitaph !== null) this.#el.end.textContent = hud.epitaph;
  }

  /**
   * Four numbers, each with its label above it.
   *
   * It was one concatenated line before, which was legible on a laptop and a
   * smear on a phone. The structure is the same in every art direction handed
   * down — tiles and points on the left, map and cost on the right — and cost is
   * on it because cost is the thing that eventually kills you.
   *
   * `data-stat="tiles"` carries the one piece of meaning the CSS needs: that is
   * the number counting down, and every direction paints it in its one warm
   * colour for that reason.
   */
  #renderStats(hud: HudView): void {
    const stats: readonly Stat[] = [
      { id: 'tiles', label: 'TILES', value: String(hud.tiles) },
      { id: 'points', label: 'POINTS', value: String(hud.points) },
      { id: 'map', label: hud.depthLabel, value: String(hud.depthValue) },
      { id: 'cost', label: 'COST', value: `−${hud.cost}` },
    ];

    this.#el.stats.replaceChildren(
      ...stats.map((stat) => {
        const box = document.createElement('div');
        box.className = 'stat';
        box.dataset['stat'] = stat.id;

        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = stat.label;

        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = stat.value;

        box.append(label, value);
        return box;
      }),
    );
  }

  #renderDraft(hud: HudView): void {
    // Rebuilt rather than diffed: three buttons, redrawn a few hundred times a
    // run. A diffing scheme here would be more code than the thing it speeds up.
    this.#el.draft.replaceChildren(
      ...hud.draft.map((tile, index) => {
        const button = document.createElement('button');
        button.className = 'tile';
        button.dataset['colour'] = tile.colour;
        button.dataset['rarity'] = tile.rarity;
        button.setAttribute('aria-pressed', String(tile.selected));

        // The direction's name for this colour, or the colour itself when the
        // direction has no fiction. Written into the card rather than left to
        // hue alone: four blocks of colour with no words is a memory test, and
        // it is also unplayable for anyone who cannot separate two of them.
        const name = this.#theme.terrainNames[tile.colour];
        button.setAttribute(
          'aria-label',
          tile.rarity === 'common' ? `${name} tile` : `${tile.rarity} ${name} tile`,
        );

        const art = this.#art[tile.colour];
        if (art !== undefined) {
          const img = document.createElement('img');
          img.className = 'tile-art';
          img.src = art;
          img.alt = '';
          img.draggable = false;
          button.classList.add('has-art');
          button.append(img);
        }

        const label = document.createElement('span');
        label.className = 'tile-name';
        label.textContent = name;
        button.append(label);

        // Rarity is written on the card, not just hinted: MAGIC matches every
        // colour and UNIQUE counts double, and a power you might not notice is
        // a power that might as well not exist.
        if (tile.rarity !== 'common') {
          const badge = document.createElement('span');
          badge.className = 'tile-rarity';
          badge.textContent = tile.rarity.toUpperCase();
          button.append(badge);
        }

        // The card whose best placement pays the most, marked so choosing a
        // card starts from an answer instead of an audit. The selector decides
        // which one from the same previews the board draws.
        if (tile.best) {
          const badge = document.createElement('span');
          badge.className = 'tile-best';
          badge.textContent = 'BEST';
          button.append(badge);
        }

        button.addEventListener('click', () => {
          this.#dispatch({ type: 'SELECT', index });
        });
        return button;
      }),
      ...this.#renderHold(hud),
    );
  }

  /**
   * The colour lens: one chip per colour, printing that colour's standing
   * worth — the exact number a points harvest sums. Tapping a chip spotlights
   * the colour on the board and expands the chip into its calculation in the
   * hint line; tapping it again lets go.
   */
  #renderColours(hud: HudView): void {
    this.#el.colours.replaceChildren(
      ...hud.colours.map((c) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset['colour'] = c.colour;
        const active = hud.spotlight?.colour === c.colour;
        chip.setAttribute('aria-pressed', String(active));
        const name = this.#theme.terrainNames[c.colour];
        chip.textContent = `${name} ${c.worth}`;
        chip.setAttribute(
          'aria-label',
          `${name}: ${c.count} tiles standing, total worth ${c.worth}`,
        );
        chip.addEventListener('click', () => {
          this.#spotlight = this.#spotlight === c.colour ? null : c.colour;
          this.render();
        });
        return chip;
      }),
    );
  }

  /**
   * The stash, drawn as one more card at the end of the row. Tapping it swaps
   * with the selected card — take when empty, trade when full — so saving a
   * tile for later costs one tap and no reading.
   */
  #renderHold(hud: HudView): HTMLButtonElement[] {
    if (!hud.canHold) return [];

    const button = document.createElement('button');
    button.className = 'tile hold';
    button.addEventListener('click', () => {
      this.#dispatch({ type: 'HOLD' });
    });

    if (hud.held === null) {
      button.setAttribute('aria-label', 'Hold the selected tile for later');
      const label = document.createElement('span');
      label.className = 'tile-name';
      label.textContent = 'HOLD';
      button.append(label);
      return [button];
    }

    button.dataset['colour'] = hud.held.colour;
    const name = this.#theme.terrainNames[hud.held.colour];
    button.setAttribute('aria-label', `Swap the held ${name} tile back into the hand`);

    const art = this.#art[hud.held.colour];
    if (art !== undefined) {
      const img = document.createElement('img');
      img.className = 'tile-art';
      img.src = art;
      img.alt = '';
      img.draggable = false;
      button.classList.add('has-art');
      button.append(img);
    }

    const label = document.createElement('span');
    label.className = 'tile-name';
    label.textContent = name;
    button.append(label);

    if (hud.held.rarity !== 'common') {
      const badge = document.createElement('span');
      badge.className = 'tile-rarity';
      badge.textContent = hud.held.rarity.toUpperCase();
      button.append(badge);
    }

    const badge = document.createElement('span');
    badge.className = 'tile-held';
    badge.textContent = 'HELD';
    button.append(badge);
    return [button];
  }
}
