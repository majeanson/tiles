import type { Colour } from '@content/tuning';
import { distance, parse, type HexKey } from '@engine/hex';
import { canLeave } from '@engine/reduce';
import {
  canPlaceAt,
  canPlaceNow,
  costOf,
  harvestValue,
  isRipe,
  previewWorth,
  ripeClusterAt,
  ripeClusters,
  ripeKeys,
  worthOf,
} from '@engine/rules';
import type { GameState } from '@engine/state';
import type { BoardView, CellKind, CellView } from '@render/Renderer';

/**
 * State to screen, as one pure function.
 *
 * Everything the player is shown is derived here, so the UI cannot invent a
 * number the engine disagrees with — the classic version of that bug is a
 * preview that says 4 and a placement that pays 3. It is also the only reason
 * any of this is testable: the interesting question is "does the board show the
 * right thing", and answering it needs no canvas and no phone.
 */

/**
 * The pocket the harvest buttons are pricing, on the endless world.
 *
 * A tapped ripe tile targets its own cluster; with no tap (or a stale one that
 * has since been popped) the biggest pocket is the default, so the buttons are
 * never dead while anything is ripe. `null` on bounded maps, where a harvest
 * is the whole board and there is nothing to single out.
 */
export function resolveHarvestTarget(state: GameState, asked: HexKey | null): HexKey | null {
  if (state.tuning.world !== 'endless') return null;
  if (asked !== null && isRipe(state.cells, asked)) return asked;

  let best: HexKey[] | null = null;
  for (const pocket of ripeClusters(state.cells)) {
    if (best === null || pocket.length > best.length) best = pocket;
  }
  return best?.[0] ?? null;
}

export function toBoardView(state: GameState, harvestAt: HexKey | null = null): BoardView {
  const selected = state.draft[state.selected];
  const placeable = canPlaceNow(state);

  const target = resolveHarvestTarget(state, harvestAt);
  const targeted = new Set(target === null ? [] : ripeClusterAt(state.cells, target));

  const cells: CellView[] = Object.entries(state.cells).map(([k, cell]) => {
    const { q, r } = parse(k);
    const legal = placeable && canPlaceAt(state.cells, k);

    return {
      key: k,
      q,
      r,
      kind: cell.kind satisfies CellKind,
      colour: cell.kind === 'tile' ? cell.colour : null,
      ripe: isRipe(state.cells, k),
      targeted: targeted.has(k),
      worth: worthOf(state.cells, k, state.tuning),
      legal,
      preview:
        legal && selected !== undefined
          ? previewWorth(state.cells, k, selected.colour, state.tuning)
          : null,
    };
  });

  return { cells };
}

/**
 * Everything outside the board: the run's numbers, and which buttons are live.
 *
 * The disabled reasons are text rather than booleans because a control that is
 * simply dead teaches nothing. "Harvest here first" is the rule being explained
 * at the only moment the player cares about it, which is the whole tutorial
 * budget this game gets.
 */
export type HudView = {
  readonly tiles: number;
  readonly points: number;
  readonly mapNumber: number;
  /**
   * The third stat is depth, and depth means a different thing per world:
   * MAP <n> on bounded maps, REACH <hexes from home> on the plane.
   */
  readonly depthLabel: string;
  readonly depthValue: number;
  readonly cost: number;
  readonly placements: number;

  /** Bounded only. The plane has no LEAVE, so the button has no reason to exist. */
  readonly showLeave: boolean;

  /**
   * `colour` is the engine's `Colour`, not a string: the chrome looks up the
   * direction's name for it (`CRYPT`) and its CSS variable, and both of those are
   * exhaustive maps that a stray string would silently miss.
   */
  readonly draft: readonly {
    readonly id: string;
    readonly colour: Colour;
    readonly selected: boolean;
  }[];

  readonly ripeCount: number;
  /** What harvesting right now would pay, each way. Both are always shown. */
  readonly harvestTiles: number;
  readonly harvestPoints: number;
  /** The pocket those prices are FOR, on the plane. Null on bounded maps. */
  readonly harvestAt: HexKey | null;

  readonly canHarvest: boolean;
  readonly canLeave: boolean;
  readonly leaveHint: string;

  readonly ended: boolean;
  /** Gate D: the cause of death, in one sentence. */
  readonly epitaph: string | null;
};

export function toHudView(state: GameState, harvestAt: HexKey | null = null): HudView {
  const endless = state.tuning.world === 'endless';
  const target = resolveHarvestTarget(state, harvestAt);
  const value = endless ? harvestValue(state, target ?? undefined) : harvestValue(state);
  const leaving = canLeave(state);

  return {
    tiles: state.tiles,
    points: state.points,
    mapNumber: state.mapNumber,
    depthLabel: endless ? 'REACH' : 'MAP',
    depthValue: endless ? reachOf(state) : state.mapNumber,
    cost: costOf(state.placements, state.tuning),
    placements: state.placements,

    showLeave: !endless,

    draft: state.draft.map((tile, i) => ({
      id: tile.id,
      colour: tile.colour,
      selected: i === state.selected,
    })),

    ripeCount: ripeKeys(state.cells).length,
    harvestTiles: value.tiles,
    harvestPoints: value.points,
    harvestAt: target,

    canHarvest: state.phase === 'placing' && value.count > 0,
    canLeave: leaving,
    leaveHint: leaving ? 'Move on' : 'Harvest here first',

    ended: state.phase === 'ended',
    epitaph: state.phase === 'ended' ? epitaphFor(state) : null,
  };
}

/** Hexes from home the run has built — the plane's depth, drawn in the HUD. */
function reachOf(state: GameState): number {
  let reach = 0;
  for (const [k, cell] of Object.entries(state.cells)) {
    if (cell.kind !== 'tile' && cell.kind !== 'stone') continue;
    reach = Math.max(reach, distance(parse(k), { q: 0, r: 0 }));
  }
  return reach;
}

/**
 * Gate D wants the end screen to name the cause of death in one sentence. The
 * sentence's job is to say WHY it happened — the cost of a placement having
 * climbed past what the board could pay back is the whole arc of a run, and it
 * should be the last thing the player reads.
 */
function epitaphFor(state: GameState): string {
  if (state.death === 'walled') {
    return `Walled in after ${state.placements} placements — nowhere left to build, nothing left to pop.`;
  }
  const cost = costOf(state.placements, state.tuning);
  const where = state.tuning.world === 'endless' ? 'on the plane' : `on map ${state.mapNumber}`;
  return (
    `Out of tiles ${where}, after ${state.placements} placements. ` +
    `They cost ${cost} each by the end.`
  );
}
